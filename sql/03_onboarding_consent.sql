-- ============================================================================
-- Hovio · 03_onboarding_consent.sql
-- Onboarding responses, versioned legal acceptances, granular consents, RLS.
-- Depends on 01_init.sql (profiles, set_updated_at) and 02_auth_profiles.sql.
-- Idempotent and safe to re-run.
--
-- PRIVACY: free-text fields below are sensitive. They are stored as plaintext
-- ONLY during pre-launch development. Prompt 7 introduces envelope encryption
-- and a migration MUST encrypt these columns BEFORE any real user data exists.
-- Never log these fields.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.legal_doc_type as enum ('terms', 'privacy');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.consent_type as enum (
    'data_processing',
    'ai_memory',
    'intake_summary_sharing',
    'notifications_whatsapp',
    'notifications_email'
  );
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- legal_acceptances  (one row per accepted document version; insert-only trail)
-- ---------------------------------------------------------------------------
create table if not exists public.legal_acceptances (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  doc_type    public.legal_doc_type not null,
  doc_version text not null,
  accepted_at timestamptz not null default now()
);
create index if not exists legal_acceptances_user_idx on public.legal_acceptances (user_id);

comment on table public.legal_acceptances is 'Versioned ToS/Privacy acceptance trail for DPDP compliance. Append-only.';

-- ---------------------------------------------------------------------------
-- consents  (current state of each granular consent; one row per type per user)
-- ---------------------------------------------------------------------------
create table if not exists public.consents (
  user_id      uuid not null references public.profiles(id) on delete cascade,
  consent_type public.consent_type not null,
  granted      boolean not null default false,
  updated_at   timestamptz not null default now(),
  primary key (user_id, consent_type)
);

comment on table public.consents is 'Granular, revocable consents. AI memory & sharing default to false. Changes are audit-logged in app code.';

-- ---------------------------------------------------------------------------
-- onboarding_responses  (1:1 with user)
-- ---------------------------------------------------------------------------
create table if not exists public.onboarding_responses (
  user_id               uuid primary key references public.profiles(id) on delete cascade,
  answers               jsonb   not null default '{}'::jsonb,  -- structured answers (gender, relationship, financial, source, occupation, brought_here[], language/therapist prefs, support, medication flag)
  age                   integer,
  past_therapy_note     text,    -- sensitive · envelope-encrypted · never log
  therapist_should_know text,    -- sensitive · envelope-encrypted · never log
  whatsapp_number       text,    -- optional, for WhatsApp notifications · encrypted · never log
  suitability_attested  boolean not null default false,  -- user confirmed out-of-scope conditions don't apply
  suitability_flagged   boolean not null default false,  -- user indicated a condition applies -> caring off-ramp
  completed_at          timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint onboarding_age_18plus check (age is null or age >= 18)
);

comment on column public.onboarding_responses.suitability_flagged is 'True if user indicated an out-of-scope condition. Product/clinical policy (block vs guide) is enforced in app code and must be reviewed by a professional before launch.';

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
drop trigger if exists trg_consents_updated on public.consents;
create trigger trg_consents_updated before update on public.consents
  for each row execute function public.set_updated_at();

drop trigger if exists trg_onboarding_responses_updated on public.onboarding_responses;
create trigger trg_onboarding_responses_updated before update on public.onboarding_responses
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security  (owner-only; backend service role bypasses)
-- ---------------------------------------------------------------------------
alter table public.legal_acceptances    enable row level security;
alter table public.consents             enable row level security;
alter table public.onboarding_responses enable row level security;

-- legal_acceptances: owner read + insert (append-only; no update/delete by client).
drop policy if exists legal_acceptances_select_own on public.legal_acceptances;
create policy legal_acceptances_select_own on public.legal_acceptances
  for select using (auth.uid() = user_id);
drop policy if exists legal_acceptances_insert_own on public.legal_acceptances;
create policy legal_acceptances_insert_own on public.legal_acceptances
  for insert with check (auth.uid() = user_id);

-- consents: owner read/insert/update.
drop policy if exists consents_select_own on public.consents;
create policy consents_select_own on public.consents
  for select using (auth.uid() = user_id);
drop policy if exists consents_insert_own on public.consents;
create policy consents_insert_own on public.consents
  for insert with check (auth.uid() = user_id);
drop policy if exists consents_update_own on public.consents;
create policy consents_update_own on public.consents
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- onboarding_responses: owner read/insert/update.
drop policy if exists onboarding_select_own on public.onboarding_responses;
create policy onboarding_select_own on public.onboarding_responses
  for select using (auth.uid() = user_id);
drop policy if exists onboarding_insert_own on public.onboarding_responses;
create policy onboarding_insert_own on public.onboarding_responses
  for insert with check (auth.uid() = user_id);
drop policy if exists onboarding_update_own on public.onboarding_responses;
create policy onboarding_update_own on public.onboarding_responses
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================================
-- End 03_onboarding_consent.sql
-- ============================================================================
