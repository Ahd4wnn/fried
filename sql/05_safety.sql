-- ============================================================================
-- Hovio · 05_safety.sql
-- Crisis & safety subsystem: detection config + crisis event records.
-- Depends on 01_init.sql (profiles, app_config, gen_random_uuid).
-- Idempotent and safe to re-run.
--
-- PRIVACY: crisis_events NEVER store message/transcript content. Detection
-- patterns in safety_config are NOT readable by clients (no evasion aid).
-- CLINICAL REVIEW REQUIRED on patterns, categories, severities, thresholds,
-- and all crisis-facing copy before launch.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.crisis_category as enum
    ('suicidal_ideation', 'self_harm', 'abuse', 'harm_to_others');
exception when duplicate_object then null; end $$;

-- Graded verdict severity. 'ok' = normal flow, 'concern' = stay in session +
-- gentle resourcing, 'crisis' = close session + surface resources + record.
do $$ begin
  create type public.safety_severity as enum ('ok', 'concern', 'crisis');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.detection_layer as enum ('tripwire', 'classifier', 'both');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.crisis_source as enum ('ai_chat', 'onboarding', 'other');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- safety_config  (versioned; exactly one active row)
-- tripwire_patterns: [{ "category": <crisis_category>, "severity": <'concern'|'crisis'>,
--                       "pattern": <regex>, "lang": "en" }]
-- classifier_config: { "model": "...", "categories": [...], "thresholds": {...} }
-- ---------------------------------------------------------------------------
create table if not exists public.safety_config (
  id                uuid primary key default gen_random_uuid(),
  version           integer not null,
  tripwire_patterns jsonb   not null default '[]'::jsonb,
  classifier_config jsonb   not null default '{}'::jsonb,
  is_active         boolean not null default false,
  notes             text,
  created_at        timestamptz not null default now()
);

create unique index if not exists safety_config_version_idx on public.safety_config (version);
-- enforce at most one active config:
create unique index if not exists safety_config_single_active_idx
  on public.safety_config (is_active) where (is_active);

comment on table public.safety_config is 'Versioned crisis-detection config. NOT client-readable. Patterns/thresholds require clinical review before launch.';

-- Seed v1 — STARTER config. Patterns are minimal, intent-level (never method-
-- specific) examples to prove the pipeline; EXPAND under clinical review.
insert into public.safety_config (version, is_active, notes, tripwire_patterns, classifier_config)
values (
  1,
  true,
  'STARTER config. Expand tripwire patterns and tune classifier with a qualified mental-health professional before launch. Keep patterns intent-level, never method-specific.',
  jsonb_build_array(
    jsonb_build_object('category','suicidal_ideation','severity','crisis','lang','en','pattern','(?i)\b(i\s+(want|wanna|am\s+going)\s+to\s+(die|end\s+(it|my\s+life))|kill\s+myself|don.?t\s+want\s+to\s+(be\s+alive|live))\b'),
    jsonb_build_object('category','self_harm','severity','crisis','lang','en','pattern','(?i)\b(hurt|harm|cut)\s+myself\b'),
    jsonb_build_object('category','harm_to_others','severity','crisis','lang','en','pattern','(?i)\b(i\s+(want|am\s+going)\s+to)\s+(kill|hurt|harm)\s+(him|her|them|someone|people)\b'),
    jsonb_build_object('category','abuse','severity','concern','lang','en','pattern','(?i)\b(is\s+)?(hitting|abusing|hurting)\s+me\b')
  ),
  jsonb_build_object(
    'model','gpt-4o-mini',
    'categories', jsonb_build_array('suicidal_ideation','self_harm','abuse','harm_to_others'),
    'thresholds', jsonb_build_object('crisis',0.6,'concern',0.4),
    'note','Thresholds and classifier prompt require clinical review/tuning.'
  )
)
on conflict (version) do nothing;

-- ---------------------------------------------------------------------------
-- crisis_events  (records THAT a crisis was detected — never the content)
-- ---------------------------------------------------------------------------
create table if not exists public.crisis_events (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references public.profiles(id) on delete set null,
  session_id      uuid,  -- nullable now; FK to ai_sessions added in Prompt 7
  source          public.crisis_source  not null default 'ai_chat',
  trigger_layer   public.detection_layer not null,
  category        public.crisis_category not null,
  severity        public.safety_severity not null,
  resources_shown jsonb,  -- helpline NAMES shown only (metadata) — never user content
  created_at      timestamptz not null default now()
);

create index if not exists crisis_events_user_idx     on public.crisis_events (user_id);
create index if not exists crisis_events_created_idx   on public.crisis_events (created_at);
create index if not exists crisis_events_severity_idx  on public.crisis_events (severity);

comment on table public.crisis_events is 'Audit record of detected crises. NEVER store message/transcript content. Admin reads metadata only (Prompt 10).';
comment on column public.crisis_events.resources_shown is 'Names of helplines surfaced. Metadata only — no user content.';

-- ---------------------------------------------------------------------------
-- Row Level Security
-- Both tables: NO client access at all (no policies => deny). The backend
-- service role is the only reader/writer. safety_config patterns must never
-- be exposed to clients; crisis_events are sensitive and surfaced only as
-- aggregate metadata to admins via the backend in Prompt 10.
-- ---------------------------------------------------------------------------
alter table public.safety_config enable row level security;
alter table public.crisis_events enable row level security;

-- ============================================================================
-- End 05_safety.sql
-- ============================================================================
