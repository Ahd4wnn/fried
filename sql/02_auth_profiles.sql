-- ============================================================================
-- Hovio · 02_auth_profiles.sql
-- Role-specific profiles (seeker / therapist), supporting enums, RLS.
-- Depends on 01_init.sql (profiles, user_role, set_updated_at()).
-- Idempotent and safe to re-run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.verification_status as enum
    ('pending', 'under_review', 'verified', 'rejected', 'suspended');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.gender_identity as enum
    ('male', 'female', 'non_binary', 'prefer_not_to_say');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- seeker_profiles  (1:1 with profiles for users whose role = 'seeker')
-- ---------------------------------------------------------------------------
create table if not exists public.seeker_profiles (
  id                   uuid primary key references public.profiles(id) on delete cascade,
  preferences          jsonb   not null default '{}'::jsonb,  -- match prefs etc. (filled in later prompts)
  ai_memory_consent    boolean not null default false,        -- persistent AI memory is OFF until consented
  onboarding_completed boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

comment on column public.seeker_profiles.ai_memory_consent is 'Persistent cross-session AI memory. Default false; only true after explicit consent.';

-- ---------------------------------------------------------------------------
-- therapist_profiles  (1:1 with profiles for users whose role = 'therapist')
-- A therapist is only bookable once verification_status = 'verified'.
-- ---------------------------------------------------------------------------
create table if not exists public.therapist_profiles (
  id                   uuid primary key references public.profiles(id) on delete cascade,
  bio                  text,
  specializations      text[] not null default '{}',
  languages            text[] not null default '{}',
  gender               public.gender_identity,
  price_inr            integer,                               -- per-session price in INR (whole rupees)
  rci_number           text,                                  -- TODO(Prompt 9): store envelope-encrypted (encryption lands in Prompt 7)
  verification_status  public.verification_status not null default 'pending',
  bookable             boolean not null default false,        -- gated true only when verified (Prompt 9/10)
  onboarding_completed boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

comment on column public.therapist_profiles.rci_number is 'RCI registration number. To be envelope-encrypted from Prompt 9. Never logged.';
comment on column public.therapist_profiles.bookable is 'Only set true by admin verification flow once verification_status = verified.';

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
drop trigger if exists trg_seeker_profiles_updated on public.seeker_profiles;
create trigger trg_seeker_profiles_updated before update on public.seeker_profiles
  for each row execute function public.set_updated_at();

drop trigger if exists trg_therapist_profiles_updated on public.therapist_profiles;
create trigger trg_therapist_profiles_updated before update on public.therapist_profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security  (backend service role bypasses; these guard client access)
-- ---------------------------------------------------------------------------
alter table public.seeker_profiles    enable row level security;
alter table public.therapist_profiles enable row level security;

-- seeker_profiles: owner-only read/insert/update.
drop policy if exists seeker_profiles_select_own on public.seeker_profiles;
create policy seeker_profiles_select_own on public.seeker_profiles
  for select using (auth.uid() = id);

drop policy if exists seeker_profiles_insert_own on public.seeker_profiles;
create policy seeker_profiles_insert_own on public.seeker_profiles
  for insert with check (auth.uid() = id);

drop policy if exists seeker_profiles_update_own on public.seeker_profiles;
create policy seeker_profiles_update_own on public.seeker_profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- therapist_profiles: owner-only read/insert/update for now.
-- (Public browsing of verified+bookable therapists is added in Prompt 10/11,
--  and matching uses the backend service role — not client reads.)
drop policy if exists therapist_profiles_select_own on public.therapist_profiles;
create policy therapist_profiles_select_own on public.therapist_profiles
  for select using (auth.uid() = id);

drop policy if exists therapist_profiles_insert_own on public.therapist_profiles;
create policy therapist_profiles_insert_own on public.therapist_profiles
  for insert with check (auth.uid() = id);

drop policy if exists therapist_profiles_update_own on public.therapist_profiles;
create policy therapist_profiles_update_own on public.therapist_profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);
-- Note: verification_status and bookable must only be changed by the backend
-- (service role) via the admin flow, never by the therapist. Enforced in app code.

-- ============================================================================
-- End 02_auth_profiles.sql
-- ============================================================================
