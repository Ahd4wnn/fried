-- ============================================================================
-- Hovio · 08_therapist_verification.sql
-- Therapist professional profile fields + manual-verification submission
-- (encrypted credential claims) + credential document references.
-- Depends on 01_init, 02_auth_profiles (therapist_profiles, verification_status).
-- Idempotent.
--
-- PRIVACY: legal name, registration number, and WhatsApp are envelope-encrypted.
-- Credential documents live in a PRIVATE storage bucket. Admin access to any of
-- these during review is backend-mediated and audited. Never logged.
-- VERIFICATION IS MANUAL: no therapist is bookable until an admin approves.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Extend therapist_profiles with displayed/operational professional fields
-- ---------------------------------------------------------------------------
alter table public.therapist_profiles add column if not exists professional_title  text;
alter table public.therapist_profiles add column if not exists years_experience    integer;
alter table public.therapist_profiles add column if not exists session_modes        text[] not null default '{}';  -- 'video','audio','chat'
alter table public.therapist_profiles add column if not exists practice_setting     text;   -- independent / clinic / hospital
alter table public.therapist_profiles add column if not exists whatsapp_cipher      bytea;  -- envelope-encrypted
alter table public.therapist_profiles add column if not exists whatsapp_nonce       bytea;
alter table public.therapist_profiles add column if not exists onboarding_submitted boolean not null default false;

comment on column public.therapist_profiles.whatsapp_cipher is 'Envelope-encrypted WhatsApp number (verification + notifications). Never logged.';

-- ---------------------------------------------------------------------------
-- Enum: credential document type
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.credential_doc_type as enum
    ('degree_certificate', 'registration_certificate', 'government_id', 'profile_photo', 'other');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- verification_requests  (the manual-review submission; one active per therapist)
-- ---------------------------------------------------------------------------
create table if not exists public.verification_requests (
  id                          uuid primary key default gen_random_uuid(),
  therapist_id                uuid not null references public.profiles(id) on delete cascade,
  status                      public.verification_status not null default 'pending',
  legal_name_cipher           bytea,  legal_name_nonce           bytea,   -- encrypted
  registration_body           text,                                       -- e.g. 'RCI', 'Other', 'None'
  registration_number_cipher  bytea,  registration_number_nonce  bytea,   -- encrypted
  qualification               text,
  institution                 text,
  qualification_year          integer,
  reviewed_by                 uuid references public.profiles(id) on delete set null,
  reviewed_at                 timestamptz,
  decision_notes              text,   -- INTERNAL staff notes only; no applicant content beyond the decision
  submitted_at                timestamptz,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);
create index if not exists verification_requests_therapist_idx on public.verification_requests (therapist_id);
create index if not exists verification_requests_status_idx    on public.verification_requests (status, submitted_at desc);

comment on table public.verification_requests is 'Manual verification submissions. Sensitive credential identifiers are encrypted. Admin review (Prompt 10) flips therapist_profiles to verified + bookable. No auto-approval.';

-- ---------------------------------------------------------------------------
-- credential_docs  (references to files in a PRIVATE storage bucket)
-- ---------------------------------------------------------------------------
create table if not exists public.credential_docs (
  id                      uuid primary key default gen_random_uuid(),
  verification_request_id uuid not null references public.verification_requests(id) on delete cascade,
  therapist_id            uuid not null references public.profiles(id) on delete cascade,
  doc_type                public.credential_doc_type not null,
  storage_path            text not null,   -- path within the private 'therapist-credentials' bucket
  uploaded_at             timestamptz not null default now()
);
create index if not exists credential_docs_request_idx on public.credential_docs (verification_request_id);

comment on table public.credential_docs is 'Pointers to credential files in the PRIVATE therapist-credentials bucket. Admin views are backend-mediated + audited.';

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
drop trigger if exists trg_verification_requests_updated on public.verification_requests;
create trigger trg_verification_requests_updated before update on public.verification_requests
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- Therapist may READ their own request + docs (to see status). All writes and
-- all status changes go through the BACKEND (service role): submission,
-- review, approval. Admin reads are backend-mediated + audited (Prompt 10).
-- ---------------------------------------------------------------------------
alter table public.verification_requests enable row level security;
alter table public.credential_docs       enable row level security;

drop policy if exists verification_requests_select_own on public.verification_requests;
create policy verification_requests_select_own on public.verification_requests
  for select using (auth.uid() = therapist_id);

drop policy if exists credential_docs_select_own on public.credential_docs;
create policy credential_docs_select_own on public.credential_docs
  for select using (auth.uid() = therapist_id);
-- No client insert/update: submission writes go through the backend so status
-- integrity is guaranteed (a therapist can never self-verify).

-- ============================================================================
-- End 08_therapist_verification.sql
-- ============================================================================
