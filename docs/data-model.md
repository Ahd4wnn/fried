# Data Model (overview)

Detailed DDL ships **per build prompt** as numbered files in `/sql`. This is the map. Postgres on Supabase. Extensions: `uuid-ossp`, `pgcrypto`, `pgvector`.

## Principles

- Every user-owned table has an owner column and **RLS** scoped to `auth.uid()`.
- **Sensitive bodies** (AI messages, transcripts, intake summaries, journal/notes, therapist session notes) are stored **encrypted** (envelope encryption — see `safety-and-privacy.md`), not as plaintext.
- Enums for every state machine. `created_at` / `updated_at` everywhere (trigger-maintained).
- Soft constraints in app code; hard constraints (FKs, checks, unique) in the DB.

## Tables by domain

**Identity & roles** (`sql/01`, `sql/02`)
- `profiles` — 1:1 with `auth.users`; `role`, display name, avatar, locale, status.
- `seeker_profiles` — onboarding-derived fields, preferences, AI-memory consent flag.
- `therapist_profiles` — bio, specializations[], languages[], gender, price, **verification_status**, RCI number (encrypted), bookable flag.
- `app_config` — key/value incl. **helpline list** (verified at launch, not hardcoded).
- `audit_log` — actor, action, target, timestamp (no content).

**Consent & legal** (`sql/03`)
- `legal_acceptances` — ToS/Privacy version + timestamp + age attestation (18+).
- `consents` — granular toggles: AI memory, intake-summary sharing, notifications channels.
- `onboarding_responses` — seeker intake answers (encrypted where free-text).

**Safety** (`sql/05`)
- `crisis_events` — session ref, trigger type, severity, timestamp (no transcript content), helplines shown.
- `safety_config` — tripwire patterns + classifier thresholds (versioned).

**AI companion** (`sql/06`)
- `ai_sessions` — owner, status, started/ended.
- `ai_messages` — session ref, role (user/assistant), **encrypted body**, safety verdict.
- `ai_memory` — per-user rolling summary (encrypted) + `vector` embeddings for retrieval; gated by consent.
- `encryption_keys` — per-user wrapped data keys (envelope encryption); deleting a row crypto-shreds the user's data.

**Handoff & matching** (`sql/07`)
- `escalations` — session ref, suggested-at, seeker-confirmed-at.
- `intake_summaries` — **encrypted** AI summary; share-consent timestamp.
- `therapist_invitations` — escalation ref, therapist ref, status (invited/accepted/declined/expired).
- `match_criteria` — specialization, language, price ceiling, gender preference, availability window.

**Verification** (`sql/08`)
- `verification_requests` — therapist ref, status machine, reviewer, decision notes.
- `credential_docs` — Storage refs to uploaded docs (private bucket), type.

**Admin** (`sql/09`)
- views/tables for the review queue, user management actions, crisis monitoring (counts/metadata only).

**Scheduling** (`sql/10`)
- `availability_blocks` — therapist recurring/one-off availability.
- `slots` — generated bookable slots.
- `bookings` — seeker, therapist, slot, status (pending/confirmed/completed/cancelled/no_show), session type (video/audio/chat).

**Payments** (`sql/11`)
- `orders` — Razorpay order, amount, currency, booking ref.
- `payments` — payment status, method, refund state.
- `payouts` / `pricing` — commission %, therapist payout scaffolding (policy values configurable, off by default).

**Live sessions** (`sql/12`)
- `live_sessions` — booking ref, LiveKit room, join/leave times, modality.
- `session_notes` — therapist private notes (**encrypted**).

**Messaging** (`sql/13`)
- `message_threads` — seeker↔therapist pair.
- `messages` — **encrypted body**, filtered flag, filter_reason (link/phone/email/handle).

**Tracker / care plan** (`sql/14`)
- `activities` — therapist-authored activity templates.
- `assignments` — activity assigned to a seeker, schedule, due.
- `completions` — seeker check-ins, optional encrypted note, therapist-visible progress.

**Notifications** (`sql/15`)
- `notification_preferences` — per-channel (WhatsApp/email) opt-ins.
- `notification_log` — channel, template, status (no PII payload stored).

**Privacy / DPDP** (`sql/16`)
- `data_requests` — export / deletion requests, status.
- `deletion_jobs` — crypto-shred execution records.

## RLS strategy (summary)

- Seekers: only their own rows.
- Therapists: their own profile, their bookings/sessions/notes, **intake summaries only after share-consent**, their assigned activities. **Never** raw AI transcripts.
- Admins: management surfaces and metadata; **content (transcripts/summaries) is never exposed to admin reads** — only counts/states for monitoring.
- Backend service-role bypasses RLS deliberately for matching/summarization, logged in `audit_log`.
