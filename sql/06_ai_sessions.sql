-- ============================================================================
-- Hovio · 06_ai_sessions.sql
-- AI companion sessions, messages (encrypted), per-user memory (pgvector,
-- consent-gated), and the envelope-encryption key store (crypto-shred ready).
-- Depends on 01_init.sql, 02_auth_profiles.sql, 05_safety.sql.
-- Idempotent and safe to re-run.
--
-- PRIVACY: message bodies and memory summaries are stored ENVELOPE-ENCRYPTED
-- (ciphertext only). Plaintext is NEVER persisted and NEVER logged. Deleting a
-- user's row in encryption_keys crypto-shreds all their encrypted data.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.ai_session_status as enum ('active', 'ended', 'closed_crisis');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.message_role as enum ('user', 'assistant');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- encryption_keys  (envelope encryption: per-user data key, wrapped by KMS)
-- One row per user. Deleting the row => the user's encrypted data is
-- unrecoverable (crypto-shred). The wrapped key is useless without the KMS
-- master key; plaintext data keys are NEVER stored.
-- ---------------------------------------------------------------------------
create table if not exists public.encryption_keys (
  user_id        uuid primary key references public.profiles(id) on delete cascade,
  wrapped_dek    bytea  not null,          -- data key, encrypted by the KMS master key
  master_key_id  text   not null,          -- which KMS master key wrapped it (for rotation)
  algorithm      text   not null default 'AES-256-GCM',
  created_at     timestamptz not null default now(),
  rotated_at     timestamptz
);

comment on table public.encryption_keys is 'Per-user wrapped data keys for envelope encryption. Deleting a row crypto-shreds that user''s encrypted data. Plaintext keys never stored.';

-- ---------------------------------------------------------------------------
-- ai_sessions
-- ---------------------------------------------------------------------------
create table if not exists public.ai_sessions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  status      public.ai_session_status not null default 'active',
  title       text,                        -- optional short label (encrypted if derived from content; see app code)
  started_at  timestamptz not null default now(),
  ended_at    timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists ai_sessions_user_idx on public.ai_sessions (user_id, started_at desc);

-- Backfill the FK from crisis_events.session_id (created nullable in Prompt 6).
do $$ begin
  alter table public.crisis_events
    add constraint crisis_events_session_fk
    foreign key (session_id) references public.ai_sessions(id) on delete set null;
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- ai_messages  (body stored ENCRYPTED as ciphertext bytea)
-- ---------------------------------------------------------------------------
create table if not exists public.ai_messages (
  id             uuid primary key default gen_random_uuid(),
  session_id     uuid not null references public.ai_sessions(id) on delete cascade,
  user_id        uuid not null references public.profiles(id) on delete cascade,
  role           public.message_role not null,
  ciphertext     bytea not null,           -- envelope-encrypted message body
  nonce          bytea not null,           -- per-message nonce/IV
  safety_verdict public.safety_severity,   -- verdict recorded for user turns (ok/concern/crisis); never the text
  created_at     timestamptz not null default now()
);
create index if not exists ai_messages_session_idx on public.ai_messages (session_id, created_at);

comment on column public.ai_messages.ciphertext is 'Envelope-encrypted message body. Plaintext never stored or logged.';
comment on column public.ai_messages.safety_verdict is 'Guardrail verdict for the turn. Metadata only — never the message text.';

-- ---------------------------------------------------------------------------
-- ai_memory  (consent-gated rolling memory: encrypted summary + embedding)
-- Written only when seeker_profiles.ai_memory_consent = true. Enforced in app
-- code; wiped on consent withdrawal or account deletion (crypto-shred).
-- ---------------------------------------------------------------------------
create table if not exists public.ai_memory (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  session_id      uuid references public.ai_sessions(id) on delete set null,
  summary_cipher  bytea not null,          -- envelope-encrypted summary text
  summary_nonce   bytea not null,
  embedding       vector(1536),            -- text-embedding-3-small dim; adjust if model changes
  created_at      timestamptz not null default now()
);
create index if not exists ai_memory_user_idx on public.ai_memory (user_id, created_at desc);
-- Vector index for retrieval (cosine). Safe to create after some rows exist; kept here for completeness.
create index if not exists ai_memory_embedding_idx
  on public.ai_memory using ivfflat (embedding vector_cosine_ops) with (lists = 100);

comment on table public.ai_memory is 'Consent-gated cross-session memory. Encrypted summaries + embeddings. Only written when ai_memory_consent is true.';

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------
drop trigger if exists trg_ai_sessions_updated on public.ai_sessions;
create trigger trg_ai_sessions_updated before update on public.ai_sessions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- Owner-only reads on sessions/messages/memory (the user can see their own).
-- encryption_keys: NO client access at all (service role only).
-- Writes go through the backend service role (which performs encryption).
-- ---------------------------------------------------------------------------
alter table public.encryption_keys enable row level security;  -- no policies => client denied
alter table public.ai_sessions     enable row level security;
alter table public.ai_messages     enable row level security;
alter table public.ai_memory       enable row level security;

drop policy if exists ai_sessions_select_own on public.ai_sessions;
create policy ai_sessions_select_own on public.ai_sessions
  for select using (auth.uid() = user_id);

drop policy if exists ai_messages_select_own on public.ai_messages;
create policy ai_messages_select_own on public.ai_messages
  for select using (auth.uid() = user_id);

drop policy if exists ai_memory_select_own on public.ai_memory;
create policy ai_memory_select_own on public.ai_memory
  for select using (auth.uid() = user_id);
-- No client insert/update/delete: all writes are service-role (encryption happens server-side).
-- Note: clients reading ai_messages get ciphertext only; the backend returns decrypted
-- plaintext to the owner via the API. Direct client reads never yield plaintext.

-- ---------------------------------------------------------------------------
-- Vector search RPC function for AI memory
-- ---------------------------------------------------------------------------
create or replace function public.match_ai_memory (
  user_uuid uuid,
  query_embedding vector(1536),
  match_threshold float,
  match_count integer
)
returns table (
  id uuid,
  session_id uuid,
  summary_cipher bytea,
  summary_nonce bytea,
  similarity float
)
language plpgsql
security definer
as $$
begin
  return query
  select
    m.id,
    m.session_id,
    m.summary_cipher,
    m.summary_nonce,
    (1 - (m.embedding <=> query_embedding))::float as similarity
  from public.ai_memory m
  where m.user_id = user_uuid
    and 1 - (m.embedding <=> query_embedding) > match_threshold
  order by m.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- ============================================================================
-- End 06_ai_sessions.sql
-- ============================================================================

