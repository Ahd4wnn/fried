-- ============================================================================
-- Hovio · 01_init.sql
-- Foundation migration: extensions, enums, profiles, app_config, audit_log,
-- updated_at triggers, new-user trigger, baseline RLS.
-- Idempotent and safe to re-run. Apply via Supabase SQL editor or CLI.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
create extension if not exists "uuid-ossp"  with schema extensions;
create extension if not exists pgcrypto      with schema extensions;  -- crypto helpers (envelope encryption, later)
create extension if not exists vector        with schema extensions;  -- pgvector for AI memory embeddings (later)
-- gen_random_uuid() is built into Postgres core (used below).

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.user_role as enum ('seeker', 'therapist', 'admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.account_status as enum ('active', 'suspended', 'deleted');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- profiles  (1:1 with auth.users)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  role         public.user_role     not null default 'seeker',
  display_name text,
  avatar_url   text,
  locale       text                 not null default 'en',
  status       public.account_status not null default 'active',
  created_at   timestamptz          not null default now(),
  updated_at   timestamptz          not null default now()
);

comment on table public.profiles is 'One row per auth user. Role set at registration; backend may update role/status via service role.';

-- ---------------------------------------------------------------------------
-- app_config  (key/value; holds verified crisis helplines, feature flags, etc.)
-- ---------------------------------------------------------------------------
create table if not exists public.app_config (
  key         text primary key,
  value       jsonb       not null,
  description text,
  updated_at  timestamptz not null default now()
);

comment on table public.app_config is 'Global config. Crisis helplines live here (NOT hardcoded) and must be verified before launch.';

-- Seed crisis helplines. verified=false on purpose: every number MUST be
-- re-checked against official sources before launch and on a schedule.
insert into public.app_config (key, value, description)
values (
  'crisis_helplines',
  jsonb_build_object(
    'verified', false,
    'region', 'IN',
    'note', 'Verify every number against official sources before launch and periodically thereafter.',
    'helplines', jsonb_build_array(
      jsonb_build_object('name', 'Tele-MANAS (Govt of India)', 'numbers', jsonb_build_array('14416', '1800-891-4416'), 'hours', '24x7'),
      jsonb_build_object('name', 'Vandrevala Foundation',      'numbers', jsonb_build_array('1860-2662-345', '1800-2333-330'), 'hours', '24x7'),
      jsonb_build_object('name', 'iCall (TISS)',               'numbers', jsonb_build_array('9152987821'), 'hours', 'Mon-Sat 8am-10pm'),
      jsonb_build_object('name', 'AASRA',                      'numbers', jsonb_build_array('9820466726'), 'hours', '24x7')
    )
  ),
  'India crisis helplines surfaced by the safety subsystem. Numbers must be verified before launch.'
)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- audit_log  (records THAT a sensitive action happened — never the content/PII)
-- ---------------------------------------------------------------------------
create table if not exists public.audit_log (
  id           uuid primary key default gen_random_uuid(),
  actor_id     uuid references auth.users(id) on delete set null,
  action       text not null,
  target_table text,
  target_id    text,
  metadata     jsonb,            -- MUST NOT contain transcript content, summaries, or PII
  created_at   timestamptz not null default now()
);

comment on column public.audit_log.metadata is 'Non-sensitive metadata only. Never store transcript/summary content or PII here.';
create index if not exists audit_log_actor_idx   on public.audit_log (actor_id);
create index if not exists audit_log_created_idx on public.audit_log (created_at);

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_profiles_updated  on public.profiles;
create trigger trg_profiles_updated  before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists trg_app_config_updated on public.app_config;
create trigger trg_app_config_updated before update on public.app_config
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- new-user trigger: ensure every auth user gets a profile (role defaults to
-- 'seeker'; the registration flow updates it to 'therapist' when chosen).
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- Note: the backend uses the service role, which BYPASSES RLS by design.
-- These policies protect direct client (anon-key) access. Defense-in-depth.
-- ---------------------------------------------------------------------------
alter table public.profiles   enable row level security;
alter table public.app_config enable row level security;
alter table public.audit_log  enable row level security;

-- profiles: a user may read and update only their own row.
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select using (auth.uid() = id);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);
-- No client insert/delete: inserts come from the new-user trigger or backend.

-- app_config: authenticated users may READ (crisis helplines must be reachable).
-- Writes are service-role only (no write policy = denied for clients).
drop policy if exists app_config_read on public.app_config;
create policy app_config_read on public.app_config
  for select using (auth.role() = 'authenticated');

-- audit_log: no client access at all (no policies => deny). Service role only.

-- ============================================================================
-- End 01_init.sql
-- ============================================================================
