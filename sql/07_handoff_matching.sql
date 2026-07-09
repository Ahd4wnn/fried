-- ============================================================================
-- Hovio · 07_handoff_matching.sql
-- AI -> human handoff: escalations, encrypted intake summaries (consent-gated
-- sharing), match criteria, therapist invitations. Plus AI pacing config.
-- Depends on 01_init, 02_auth_profiles, 06_ai_sessions.
-- Idempotent.
--
-- PRIVACY: intake summaries are envelope-encrypted and shared ONLY with the
-- therapist the seeker selects, ONLY after explicit consent. Invitations carry
-- a NON-IDENTIFYING request card, never the summary or PII. Therapists NEVER
-- see raw transcripts. All summary access is audited.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- AI pacing config (counts PACE the AI; need DECIDES routing — never a paywall)
-- ---------------------------------------------------------------------------
insert into public.app_config (key, value, description)
values (
  'ai_pacing',
  jsonb_build_object('understand_by', 10, 'route_by', 18, 'soft_cap', 22),
  'Soft turn-count phases for the companion: aim to understand the issue by ~understand_by, consider routing to a human by ~route_by, gently surface the option by ~soft_cap. Pacing only; crisis overrides; small issues are not force-routed.'
)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.escalation_status as enum
    ('suggested', 'confirmed', 'summarizing', 'matching',
     'awaiting_selection', 'therapist_selected', 'cancelled', 'expired');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.invitation_status as enum
    ('invited', 'accepted', 'declined', 'expired', 'withdrawn');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- escalations
-- ---------------------------------------------------------------------------
create table if not exists public.escalations (
  id                    uuid primary key default gen_random_uuid(),
  seeker_id             uuid not null references public.profiles(id) on delete cascade,
  session_id            uuid references public.ai_sessions(id) on delete set null,
  status                public.escalation_status not null default 'suggested',
  suggested_at          timestamptz not null default now(),
  confirmed_at          timestamptz,                                    -- seeker confirmed (never auto-routed)
  selected_therapist_id uuid references public.profiles(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists escalations_seeker_idx on public.escalations (seeker_id, created_at desc);

-- ---------------------------------------------------------------------------
-- match_criteria (1:1 with escalation) — derived from onboarding prefs + summary
-- ---------------------------------------------------------------------------
create table if not exists public.match_criteria (
  escalation_id      uuid primary key references public.escalations(id) on delete cascade,
  specializations    text[] not null default '{}',
  language           text,
  gender_preference  public.gender_identity,            -- null = no preference
  price_ceiling_inr  integer,                            -- soft ceiling derived from financial status; null = no cap
  request_cipher     bytea,                              -- envelope-encrypted SHORT, NON-IDENTIFYING need line for invitations
  request_nonce      bytea,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

comment on column public.match_criteria.request_cipher is 'Short, deliberately NON-IDENTIFYING need descriptor shown to invited therapists. No PII, no transcript. Encrypted at rest.';

-- ---------------------------------------------------------------------------
-- intake_summaries (1:1 with escalation) — encrypted; shared only on consent
-- ---------------------------------------------------------------------------
create table if not exists public.intake_summaries (
  escalation_id            uuid primary key references public.escalations(id) on delete cascade,
  seeker_id                uuid not null references public.profiles(id) on delete cascade,
  summary_cipher           bytea not null,                  -- envelope-encrypted AI intake summary
  summary_nonce            bytea not null,
  generated_at             timestamptz not null default now(),
  share_consented_at       timestamptz,                     -- null until seeker consents to share
  shared_with_therapist_id uuid references public.profiles(id) on delete set null,
  shared_at                timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

comment on table public.intake_summaries is 'Encrypted AI intake summary. Shared ONLY with the selected therapist, ONLY after consent. Therapist access is backend-mediated and audited. Never the raw transcript.';

-- ---------------------------------------------------------------------------
-- therapist_invitations
-- ---------------------------------------------------------------------------
create table if not exists public.therapist_invitations (
  id            uuid primary key default gen_random_uuid(),
  escalation_id uuid not null references public.escalations(id) on delete cascade,
  therapist_id  uuid not null references public.profiles(id) on delete cascade,
  status        public.invitation_status not null default 'invited',
  match_score   numeric,
  invited_at    timestamptz not null default now(),
  responded_at  timestamptz,
  expires_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (escalation_id, therapist_id)
);
create index if not exists invitations_therapist_idx  on public.therapist_invitations (therapist_id, status);
create index if not exists invitations_escalation_idx on public.therapist_invitations (escalation_id, status);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
drop trigger if exists trg_escalations_updated on public.escalations;
create trigger trg_escalations_updated before update on public.escalations
  for each row execute function public.set_updated_at();

drop trigger if exists trg_match_criteria_updated on public.match_criteria;
create trigger trg_match_criteria_updated before update on public.match_criteria
  for each row execute function public.set_updated_at();

drop trigger if exists trg_intake_summaries_updated on public.intake_summaries;
create trigger trg_intake_summaries_updated before update on public.intake_summaries
  for each row execute function public.set_updated_at();

drop trigger if exists trg_invitations_updated on public.therapist_invitations;
create trigger trg_invitations_updated before update on public.therapist_invitations
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- Seeker sees own escalations/criteria/summaries + invitations on their
-- escalation. Therapist sees invitations addressed to them. The intake summary
-- is delivered to the chosen therapist via the BACKEND (decrypt + audit), not
-- direct client read. All cross-user writes are service-role.
-- ---------------------------------------------------------------------------
alter table public.escalations          enable row level security;
alter table public.match_criteria       enable row level security;
alter table public.intake_summaries     enable row level security;
alter table public.therapist_invitations enable row level security;

drop policy if exists escalations_select_own on public.escalations;
create policy escalations_select_own on public.escalations
  for select using (auth.uid() = seeker_id);

drop policy if exists match_criteria_select_own on public.match_criteria;
create policy match_criteria_select_own on public.match_criteria
  for select using (
    escalation_id in (select id from public.escalations where seeker_id = auth.uid())
  );

-- intake_summaries: SEEKER-only direct read (their own). Therapist access is
-- backend-mediated (service role) with a consent check + audit log entry.
drop policy if exists intake_summaries_select_own on public.intake_summaries;
create policy intake_summaries_select_own on public.intake_summaries
  for select using (auth.uid() = seeker_id);

-- invitations: therapist sees ones addressed to them; seeker sees ones on their escalation.
drop policy if exists invitations_select on public.therapist_invitations;
create policy invitations_select on public.therapist_invitations
  for select using (
    auth.uid() = therapist_id
    or escalation_id in (select id from public.escalations where seeker_id = auth.uid())
  );

-- All inserts/updates go through the backend (service role): escalation
-- lifecycle, summarization, matching, invitation responses, summary sharing.

-- ============================================================================
-- End 07_handoff_matching.sql
-- ============================================================================
