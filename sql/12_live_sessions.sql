-- ============================================================================
-- Hovio · 12_live_sessions.sql
-- LiveKit-backed live sessions (video/audio/chat) for confirmed bookings, plus
-- encrypted therapist session notes. Depends on 01_init, 02_auth_profiles,
-- 10_scheduling (bookings), 06_ai_sessions (encryption_keys for envelope enc).
-- Idempotent.
--
-- PRIVACY: LiveKit media is NOT recorded by default. Therapist session notes are
-- envelope-encrypted and visible ONLY to the authoring therapist. Seekers never
-- see therapist private notes; admins never see them either.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Config: join window + no-show grace (minutes). Editable in app_config.
-- ---------------------------------------------------------------------------
insert into public.app_config (key, value, description)
values (
  'live_sessions',
  jsonb_build_object(
    'join_early_minutes', 10,     -- how early participants may join
    'end_grace_minutes', 15,      -- how long past scheduled end joining/running is allowed
    'no_show_grace_minutes', 15   -- past starts_at; lone/no joiner => no_show
  ),
  'Live session join window and no-show grace. All values in minutes.'
)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.live_session_status as enum
    ('scheduled', 'live', 'completed', 'cancelled', 'no_show');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- live_sessions  (one per confirmed booking)
-- ---------------------------------------------------------------------------
create table if not exists public.live_sessions (
  id            uuid primary key default gen_random_uuid(),
  booking_id    uuid not null unique references public.bookings(id) on delete cascade,
  seeker_id     uuid not null references public.profiles(id) on delete cascade,
  therapist_id  uuid not null references public.profiles(id) on delete cascade,
  room_name     text not null unique,          -- LiveKit room identifier
  modality      public.session_modality not null,
  status        public.live_session_status not null default 'scheduled',
  started_at    timestamptz,
  ended_at      timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists live_sessions_seeker_idx    on public.live_sessions (seeker_id);
create index if not exists live_sessions_therapist_idx on public.live_sessions (therapist_id);

-- ---------------------------------------------------------------------------
-- live_session_events  (join/leave audit — metadata only, no media, no content)
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.live_event_type as enum ('joined', 'left', 'started', 'ended');
exception when duplicate_object then null; end $$;

create table if not exists public.live_session_events (
  id               uuid primary key default gen_random_uuid(),
  live_session_id  uuid not null references public.live_sessions(id) on delete cascade,
  participant_id   uuid references public.profiles(id) on delete set null,
  event_type       public.live_event_type not null,
  created_at       timestamptz not null default now()
);
create index if not exists live_events_session_idx on public.live_session_events (live_session_id, created_at);

comment on table public.live_session_events is 'Join/leave/start/end metadata for attendance + no-show detection. No media, no message content.';

-- ---------------------------------------------------------------------------
-- session_notes  (therapist private notes — encrypted, therapist-only)
-- ---------------------------------------------------------------------------
create table if not exists public.session_notes (
  id               uuid primary key default gen_random_uuid(),
  live_session_id  uuid not null references public.live_sessions(id) on delete cascade,
  therapist_id     uuid not null references public.profiles(id) on delete cascade,
  note_cipher      bytea not null,               -- envelope-encrypted note
  note_nonce       bytea not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists session_notes_session_idx on public.session_notes (live_session_id);

comment on table public.session_notes is 'Therapist private notes, envelope-encrypted. Visible only to the authoring therapist. Never to seekers or admins.';

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
drop trigger if exists trg_live_sessions_updated on public.live_sessions;
create trigger trg_live_sessions_updated before update on public.live_sessions
  for each row execute function public.set_updated_at();

drop trigger if exists trg_session_notes_updated on public.session_notes;
create trigger trg_session_notes_updated before update on public.session_notes
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- live_sessions: the two participants read their own. Notes: therapist-only.
-- Tokens are minted by the BACKEND (never on the client). Writes via service role.
-- ---------------------------------------------------------------------------
alter table public.live_sessions       enable row level security;
alter table public.live_session_events enable row level security;  -- backend only (no policies)
alter table public.session_notes       enable row level security;

drop policy if exists live_sessions_select_own on public.live_sessions;
create policy live_sessions_select_own on public.live_sessions
  for select using (auth.uid() = seeker_id or auth.uid() = therapist_id);

-- session_notes: ONLY the authoring therapist may read. Seekers/admins never.
drop policy if exists session_notes_select_own on public.session_notes;
create policy session_notes_select_own on public.session_notes
  for select using (auth.uid() = therapist_id);
-- Note writes go through the backend (encryption happens server-side).

-- ============================================================================
-- End 12_live_sessions.sql
-- ============================================================================
