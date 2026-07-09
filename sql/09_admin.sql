-- ============================================================================
-- Hovio · 09_admin.sql
-- Admin portal support: admin action audit, sensitive-access log, and
-- monitoring views (metadata only). Most admin reads/writes happen through the
-- BACKEND service role; this migration adds the durable records + safe views.
-- Depends on 01_init, 02_auth_profiles, 05_safety, 06b (ai_reports),
-- 07_handoff_matching, 08_therapist_verification.
-- Idempotent.
--
-- PRIVACY: admins NEVER see transcripts. Crisis monitoring is metadata/counts
-- only. Any access to encrypted credentials, reported messages, or intake
-- summaries is recorded in sensitive_access_log (in addition to audit_log).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- sensitive_access_log  (every time an admin/backend decrypts sensitive data)
-- Complements audit_log with a focused, queryable record for compliance.
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.sensitive_access_kind as enum
    ('credential', 'reported_message', 'intake_summary');
exception when duplicate_object then null; end $$;

create table if not exists public.sensitive_access_log (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references public.profiles(id) on delete set null,  -- the admin/staff who accessed
  kind        public.sensitive_access_kind not null,
  target_id   text not null,           -- id of the request/report/summary accessed
  reason      text,                    -- optional justification captured in the UI
  created_at  timestamptz not null default now()
);
create index if not exists sensitive_access_actor_idx  on public.sensitive_access_log (actor_id, created_at desc);
create index if not exists sensitive_access_kind_idx   on public.sensitive_access_log (kind, created_at desc);

comment on table public.sensitive_access_log is 'Focused audit of decrypt/access to credentials, reported messages, intake summaries. Metadata only — never the accessed content.';

-- ---------------------------------------------------------------------------
-- admin_actions  (durable trail of consequential admin decisions)
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.admin_action_type as enum
    ('verify_therapist', 'reject_therapist', 'suspend_therapist',
     'suspend_user', 'reinstate_user', 'resolve_report', 'dismiss_report', 'other');
exception when duplicate_object then null; end $$;

create table if not exists public.admin_actions (
  id           uuid primary key default gen_random_uuid(),
  admin_id     uuid references public.profiles(id) on delete set null,
  action       public.admin_action_type not null,
  target_table text,
  target_id    text,
  notes        text,                    -- internal; no user content
  created_at   timestamptz not null default now()
);
create index if not exists admin_actions_admin_idx  on public.admin_actions (admin_id, created_at desc);
create index if not exists admin_actions_target_idx on public.admin_actions (target_table, target_id);

comment on table public.admin_actions is 'Durable record of consequential admin decisions (verifications, suspensions, report resolutions).';

-- ---------------------------------------------------------------------------
-- Crisis monitoring view  (METADATA ONLY — never any message content)
-- Exposed to admins via the backend; no raw transcript, no user-typed text.
-- ---------------------------------------------------------------------------
create or replace view public.crisis_events_monitor as
select
  date_trunc('day', created_at) as day,
  category,
  severity,
  trigger_layer,
  source,
  count(*) as event_count
from public.crisis_events
group by 1, 2, 3, 4, 5;

comment on view public.crisis_events_monitor is 'Aggregate crisis metrics for admin monitoring. No user content, no per-user identification beyond aggregate counts.';

-- ---------------------------------------------------------------------------
-- RLS
-- These tables are written/read by the BACKEND service role (which enforces the
-- admin role in app code). No client policies => clients denied. Admin identity
-- and authorization are checked in the backend, not via RLS.
-- ---------------------------------------------------------------------------
alter table public.sensitive_access_log enable row level security;
alter table public.admin_actions        enable row level security;

-- ============================================================================
-- End 09_admin.sql
-- ============================================================================
