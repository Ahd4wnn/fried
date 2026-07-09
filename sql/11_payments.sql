-- ============================================================================
-- Hovio · 11_payments.sql
-- Razorpay payments for human sessions (AI is free). Orders, payments, payout
-- scaffolding, and pricing/commission config. Commission = 25% (configurable).
-- Refund/no-show policy values are DEFERRED (config placeholders, off by default).
-- Depends on 01_init, 02_auth_profiles, 10_scheduling (bookings).
-- Idempotent.
--
-- MONEY INTEGRITY: amounts stored in PAISE (integer) to avoid float errors.
-- All payment writes go through the backend; Razorpay webhooks are signature-
-- verified and idempotent. Never log card/PII payment data.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Pricing / commission config  (commission is a CONFIG value, not hardcoded)
-- ---------------------------------------------------------------------------
insert into public.app_config (key, value, description)
values (
  'pricing',
  jsonb_build_object(
    'currency', 'INR',
    'commission_percent', 25,            -- platform commission
    'gateway_fee_borne_by', 'platform',  -- 'platform' | 'therapist' (who absorbs Razorpay's fee)
    'refund_policy', jsonb_build_object('enabled', false, 'note', 'Refund/no-show policy deferred. Decide before charging real users.'),
    'payouts', jsonb_build_object('mode', 'manual', 'note', 'Razorpay Route auto-split deferred; manual payouts for now.')
  ),
  'Pricing & commission. commission_percent applies to session price; refund + payout policy deferred.'
)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.payment_status as enum
    ('created', 'authorized', 'captured', 'failed', 'refunded', 'partially_refunded');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.payout_status as enum ('pending', 'processing', 'paid', 'failed', 'on_hold');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- orders  (one per booking payment attempt; maps to a Razorpay order)
-- ---------------------------------------------------------------------------
create table if not exists public.orders (
  id                uuid primary key default gen_random_uuid(),
  booking_id        uuid not null references public.bookings(id) on delete cascade,
  seeker_id         uuid not null references public.profiles(id) on delete cascade,
  therapist_id      uuid not null references public.profiles(id) on delete cascade,
  razorpay_order_id text unique,
  amount_paise      integer not null,            -- total charged to seeker
  currency          text not null default 'INR',
  status            public.payment_status not null default 'created',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists orders_booking_idx on public.orders (booking_id);
create index if not exists orders_seeker_idx  on public.orders (seeker_id);

-- ---------------------------------------------------------------------------
-- payments  (verified Razorpay payments; commission split snapshot)
-- ---------------------------------------------------------------------------
create table if not exists public.payments (
  id                    uuid primary key default gen_random_uuid(),
  order_id              uuid not null references public.orders(id) on delete cascade,
  booking_id            uuid not null references public.bookings(id) on delete cascade,
  razorpay_payment_id   text unique,
  status                public.payment_status not null default 'created',
  amount_paise          integer not null,        -- amount captured
  commission_paise      integer not null default 0,  -- platform commission snapshot
  therapist_gross_paise integer not null default 0,  -- therapist share snapshot
  gateway_fee_paise     integer,                 -- Razorpay fee (if known)
  method                text,                    -- upi/card/netbanking (no PII/card data)
  refunded_paise        integer not null default 0,
  captured_at           timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists payments_order_idx   on public.payments (order_id);
create index if not exists payments_booking_idx on public.payments (booking_id);

comment on column public.payments.commission_paise is 'Platform commission snapshot at capture (from pricing.commission_percent). Stored so later config changes do not rewrite history.';

-- ---------------------------------------------------------------------------
-- payouts  (therapist payout scaffolding — manual for now)
-- ---------------------------------------------------------------------------
create table if not exists public.payouts (
  id            uuid primary key default gen_random_uuid(),
  therapist_id  uuid not null references public.profiles(id) on delete cascade,
  payment_id    uuid references public.payments(id) on delete set null,
  amount_paise  integer not null,
  status        public.payout_status not null default 'pending',
  reference     text,                            -- external payout ref when paid
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists payouts_therapist_idx on public.payouts (therapist_id, status);

-- ---------------------------------------------------------------------------
-- webhook_events  (Razorpay webhook idempotency / audit)
-- ---------------------------------------------------------------------------
create table if not exists public.webhook_events (
  id          uuid primary key default gen_random_uuid(),
  provider    text not null default 'razorpay',
  event_id    text unique,                       -- provider event id for idempotency
  event_type  text,
  processed_at timestamptz,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
drop trigger if exists trg_orders_updated on public.orders;
create trigger trg_orders_updated before update on public.orders
  for each row execute function public.set_updated_at();

drop trigger if exists trg_payments_updated on public.payments;
create trigger trg_payments_updated before update on public.payments
  for each row execute function public.set_updated_at();

drop trigger if exists trg_payouts_updated on public.payouts;
create trigger trg_payouts_updated before update on public.payouts
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- Seeker reads own orders/payments; therapist reads own payouts (+ payments on
-- their bookings). All writes are backend service role (Razorpay verification).
-- webhook_events: backend only (no policies).
-- ---------------------------------------------------------------------------
alter table public.orders         enable row level security;
alter table public.payments       enable row level security;
alter table public.payouts        enable row level security;
alter table public.webhook_events enable row level security;

drop policy if exists orders_select_own on public.orders;
create policy orders_select_own on public.orders
  for select using (auth.uid() = seeker_id or auth.uid() = therapist_id);

drop policy if exists payments_select_own on public.payments;
create policy payments_select_own on public.payments
  for select using (
    booking_id in (
      select id from public.bookings where seeker_id = auth.uid() or therapist_id = auth.uid()
    )
  );

drop policy if exists payouts_select_own on public.payouts;
create policy payouts_select_own on public.payouts
  for select using (auth.uid() = therapist_id);

-- ============================================================================
-- End 11_payments.sql
-- ============================================================================
