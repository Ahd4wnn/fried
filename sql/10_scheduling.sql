-- ============================================================================
-- Hovio · 10_scheduling.sql
-- Therapist availability blocks -> materialized bookable slots -> bookings.
-- Two discovery paths (AI handoff + direct browse) both create bookings.
-- Depends on 01_init, 02_auth_profiles, 07_handoff_matching.
-- Idempotent.
--
-- Time is stored in UTC (timestamptz). Display in the user's timezone (IST
-- default). Double-booking is prevented by unique(therapist, starts_at) on slots
-- + status transitions performed in a transaction by the backend.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Scheduling config
-- ---------------------------------------------------------------------------
insert into public.app_config (key, value, description)
values (
  'scheduling',
  jsonb_build_object(
    'session_minutes', 50,
    'hold_minutes', 10,             -- temporary slot hold during booking/payment
    'booking_window_weeks', 4,      -- how far ahead slots are generated/bookable
    'min_notice_minutes', 120,      -- earliest a slot can be booked from now
    'default_timezone', 'Asia/Kolkata'
  ),
  'Scheduling parameters: session length, hold duration, booking window, minimum notice, default timezone.'
)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.slot_status as enum ('open', 'held', 'booked', 'blocked');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.session_modality as enum ('video', 'audio', 'chat');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.booking_status as enum
    ('pending_payment', 'confirmed', 'completed', 'cancelled', 'no_show');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- availability_blocks  (recurring weekly OR one-off)
-- ---------------------------------------------------------------------------
create table if not exists public.availability_blocks (
  id            uuid primary key default gen_random_uuid(),
  therapist_id  uuid not null references public.profiles(id) on delete cascade,
  is_recurring  boolean not null default true,
  day_of_week   smallint,           -- 0=Sun..6=Sat (recurring); null for one-off
  specific_date date,               -- one-off; null for recurring
  start_time    time not null,
  end_time      time not null,
  timezone      text not null default 'Asia/Kolkata',
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint availability_time_order check (end_time > start_time),
  constraint availability_kind check (
    (is_recurring and day_of_week between 0 and 6 and specific_date is null)
    or (not is_recurring and specific_date is not null and day_of_week is null)
  )
);
create index if not exists availability_blocks_therapist_idx on public.availability_blocks (therapist_id, active);

-- ---------------------------------------------------------------------------
-- slots  (materialized bookable slots; UTC)
-- ---------------------------------------------------------------------------
create table if not exists public.slots (
  id            uuid primary key default gen_random_uuid(),
  therapist_id  uuid not null references public.profiles(id) on delete cascade,
  starts_at     timestamptz not null,
  ends_at       timestamptz not null,
  status        public.slot_status not null default 'open',
  held_until    timestamptz,        -- when a 'held' slot's hold expires
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (therapist_id, starts_at),
  constraint slot_time_order check (ends_at > starts_at)
);
create index if not exists slots_therapist_time_idx on public.slots (therapist_id, starts_at);
create index if not exists slots_open_idx on public.slots (therapist_id, starts_at) where (status = 'open');

-- ---------------------------------------------------------------------------
-- bookings
-- ---------------------------------------------------------------------------
create table if not exists public.bookings (
  id                  uuid primary key default gen_random_uuid(),
  seeker_id           uuid not null references public.profiles(id) on delete cascade,
  therapist_id        uuid not null references public.profiles(id) on delete cascade,
  slot_id             uuid references public.slots(id) on delete set null,
  escalation_id       uuid references public.escalations(id) on delete set null,  -- set if via AI handoff; null if direct browse
  status              public.booking_status not null default 'pending_payment',
  modality            public.session_modality not null,
  starts_at           timestamptz not null,
  ends_at             timestamptz not null,
  price_inr           integer not null,        -- price snapshot at booking time
  cancelled_by        uuid references public.profiles(id) on delete set null,
  cancelled_at        timestamptz,
  cancellation_reason text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists bookings_seeker_idx    on public.bookings (seeker_id, starts_at desc);
create index if not exists bookings_therapist_idx on public.bookings (therapist_id, starts_at desc);
create index if not exists bookings_status_idx     on public.bookings (status);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
drop trigger if exists trg_availability_blocks_updated on public.availability_blocks;
create trigger trg_availability_blocks_updated before update on public.availability_blocks
  for each row execute function public.set_updated_at();

drop trigger if exists trg_slots_updated on public.slots;
create trigger trg_slots_updated before update on public.slots
  for each row execute function public.set_updated_at();

drop trigger if exists trg_bookings_updated on public.bookings;
create trigger trg_bookings_updated before update on public.bookings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- availability_blocks: therapist reads own (writes via backend so slots regen).
-- slots: any authenticated user may read OPEN slots (to browse/book); writes via backend.
-- bookings: seeker or therapist reads their own; writes via backend.
-- ---------------------------------------------------------------------------
alter table public.availability_blocks enable row level security;
alter table public.slots               enable row level security;
alter table public.bookings            enable row level security;

drop policy if exists availability_blocks_select_own on public.availability_blocks;
create policy availability_blocks_select_own on public.availability_blocks
  for select using (auth.uid() = therapist_id);

-- Browsing availability is not sensitive; allow authenticated read of slots.
drop policy if exists slots_select_auth on public.slots;
create policy slots_select_auth on public.slots
  for select using (auth.role() = 'authenticated');

drop policy if exists bookings_select_own on public.bookings;
create policy bookings_select_own on public.bookings
  for select using (auth.uid() = seeker_id or auth.uid() = therapist_id);
-- All inserts/updates (block edits + slot regen, holds, bookings, cancellations)
-- go through the backend service role to keep slot/booking integrity atomic.

-- ============================================================================
-- End 10_scheduling.sql
-- ============================================================================
