-- ============================================================================
-- Hovio · 06b_country_and_reports.sql
-- (1) Country on profiles + supported-countries config (availability + crisis
--     resource localization). (2) AI chat reports surfaced to admin.
-- Depends on 01_init.sql, 02_auth_profiles.sql, 06_ai_sessions.sql.
-- Idempotent.
--
-- SAFETY: crisis helplines are currently India-only. Do NOT allow non-supported
-- countries into the app until helplines + compliance are localized per country.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- (1) Country
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists country text;  -- ISO 3166-1 alpha-2, e.g. 'IN'
comment on column public.profiles.country is 'ISO 3166-1 alpha-2 country the user is based in. Drives availability + crisis-resource localization.';

-- Supported countries (availability gate). Expand ONLY after localizing crisis
-- helplines AND legal/compliance for the new country.
insert into public.app_config (key, value, description)
values (
  'supported_countries',
  jsonb_build_object('countries', jsonb_build_array('IN')),
  'Countries where Hovio currently operates. Crisis helplines + legal are India-only; expand only after localizing both.'
)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- (2) AI reports
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.report_category as enum
    ('harmful', 'inappropriate', 'incorrect', 'unhelpful', 'technical', 'other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.report_status as enum
    ('open', 'under_review', 'resolved', 'dismissed');
exception when duplicate_object then null; end $$;

create table if not exists public.ai_reports (
  id                 uuid primary key default gen_random_uuid(),
  reporter_id        uuid not null references public.profiles(id) on delete cascade,
  session_id         uuid references public.ai_sessions(id) on delete set null,
  message_id         uuid references public.ai_messages(id) on delete set null,  -- the reported message (optional)
  category           public.report_category not null,
  description_cipher bytea,   -- envelope-encrypted reporter note (optional). Never logged.
  description_nonce  bytea,
  status             public.report_status not null default 'open',
  admin_notes        text,    -- INTERNAL staff notes only. Do NOT store user content here.
  resolved_by        uuid references public.profiles(id) on delete set null,
  resolved_at        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists ai_reports_status_idx   on public.ai_reports (status, created_at desc);
create index if not exists ai_reports_reporter_idx on public.ai_reports (reporter_id);

comment on table public.ai_reports is 'User-submitted reports about AI responses. Reporting a message consents to the team viewing THAT message (scoped, audited) — not the rest of the transcript.';
comment on column public.ai_reports.description_cipher is 'Envelope-encrypted reporter note. May reference conversation content; never logged.';

drop trigger if exists trg_ai_reports_updated on public.ai_reports;
create trigger trg_ai_reports_updated before update on public.ai_reports
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS  (reporter manages own reports; admin reads via backend service role)
-- ---------------------------------------------------------------------------
alter table public.ai_reports enable row level security;

drop policy if exists ai_reports_select_own on public.ai_reports;
create policy ai_reports_select_own on public.ai_reports
  for select using (auth.uid() = reporter_id);

drop policy if exists ai_reports_insert_own on public.ai_reports;
create policy ai_reports_insert_own on public.ai_reports
  for insert with check (auth.uid() = reporter_id);
-- No client update/delete; status changes + admin reads happen via the backend
-- (service role) in the admin portal (Prompt 10), with access audited.

-- ============================================================================
-- End 06b_country_and_reports.sql
-- ============================================================================
