# Build Sequence (the prompt roadmap)

Development is **prompt-by-prompt**. Below is the full ordered plan for the whole app (not an MVP). Each row is one self-contained Claude Code prompt. Prompts that change the database ship with the named migration in `/sql`; frontend-only prompts don't.

Do them in order. Keep the app working after every prompt.

## Phase 0 — Foundation

| # | Prompt | SQL file |
|---|--------|----------|
| 1 | **Repo scaffold.** Monorepo: `frontend/` (Vite+React+TS+Tailwind, TanStack Query, Motion+GSAP+ScrollTrigger+Lenis, lucide-react), `backend/` (FastAPI async, Pydantic, provider/adapter skeletons), `docs/`, `assets/` (with README telling user to drop `logo.png` + `logo-white.png`), `sql/`. Root `CLAUDE.md`, `.env.example` both sides, tooling (eslint/prettier/ruff), health endpoint, Supabase clients wired. | `01_init.sql` — extensions (uuid/pgcrypto/pgvector), role/status enums, `profiles`, `app_config` (+ helpline seed placeholders), `audit_log`, `updated_at` triggers, baseline RLS. |
| 2 | **Design system + motion + UI kit.** Tailwind theme from `design-system.md` tokens (forest/cream, Instrument Serif + Inter), base components (Button/Input/Card/Sheet/Tabs/Toast/Empty/Skeleton/Nav/Crisis button/Message bubble), motion setup (Lenis/GSAP/Motion) with `prefers-reduced-motion`, responsive shell (sidebar ≥lg / bottom tabs on mobile). | — frontend only |
| 3 | **Auth.** Register/login, Google OAuth, role selection (seeker/therapist) at register, session handling, protected routes per role, `/me`. | `02_auth_profiles.sql` — `seeker_profiles`, `therapist_profiles` (verification_status, encrypted RCI), RLS. |
| 4 | **Onboarding + consent.** 18+ gate, ToS/Privacy acceptance, AI-not-medical disclaimer, granular consent toggles, seeker psychological onboarding question set (you provide the set). | `03_onboarding_consent.sql` — `legal_acceptances`, `consents`, `onboarding_responses` (encrypted free-text). |

## Phase 1 — Seeker core + AI companion + safety

| # | Prompt | SQL file |
|---|--------|----------|
| 5 | **Seeker dashboard shell.** Home / Calendar / Tracker / Settings / Profile nav + routing, responsive, empty states. | `04_dashboard.sql` — `notifications` baseline (if needed). |
| 6 | **Crisis & safety subsystem.** Two-layer detection (tripwire + classifier interface), graceful session-close on crisis, always-visible crisis button + helpline sheet from config, event recording. *Build before chat so chat is born safe.* | `05_safety.sql` — `crisis_events`, `safety_config`. |
| 7 | **AI companion chat.** SSE streaming, session lifecycle, encrypted message store, companion orchestrator + safety guardrail hook, AI memory (pgvector) gated by consent, envelope-encryption helpers + `encryption_keys`. | `06_ai_sessions.sql` — `ai_sessions`, `ai_messages`, `ai_memory`, `encryption_keys`. |
| 8 | **AI→human handoff.** Escalation suggestion + seeker confirm, summarizer → intake summary, share-consent UI, matcher builds candidate list + invitations. | `07_handoff_matching.sql` — `escalations`, `intake_summaries`, `therapist_invitations`, `match_criteria`. |

## Phase 2 — Therapist marketplace, scheduling, sessions, payments

| # | Prompt | SQL file |
|---|--------|----------|
| 9 | **Therapist dashboard + verification submission.** Profile (specializations/languages/gender/price), RCI number + doc upload to private bucket, status display. | `08_therapist_verification.sql` — `verification_requests`, `credential_docs`. |
| 10 | **Admin dashboard.** Verification review queue + decisions, user management, crisis monitoring (metadata only). | `09_admin.sql` — admin tables/views, review actions. |
| 11 | **Therapist directory + availability + scheduling.** **Two discovery paths:** (a) AI handoff invitations (Prompt 8) and (b) **direct browse** — a seeker-facing therapist directory (filter by specialization/language/price/gender, view profile) for booking *without* the AI. Therapist availability blocks → slot generation, seeker booking, AI in-chat time-matching proposal. | `10_scheduling.sql` — `availability_blocks`, `slots`, `bookings`. |
| 12 | **Payments.** Razorpay order/verify/webhook for human sessions, booking confirmation on success, commission/payout scaffolding (policy off by default). | `11_payments.sql` — `orders`, `payments`, `payouts`, `pricing`. |
| 13 | **Live sessions.** LiveKit token minting at session time, video/audio/chat room UI, therapist private notes, post-session flow. | `12_live_sessions.sql` — `live_sessions`, `session_notes` (encrypted). |
| 14 | **Seeker↔therapist messaging.** Threads + messages with the content filter (strip links/phones/emails/handles) before persistence + inline notice. | `13_messaging.sql` — `message_threads`, `messages` (encrypted, filtered flag). |

## Phase 3 — Care plan, notifications, DPDP, polish, launch

| # | Prompt | SQL file |
|---|--------|----------|
| 15 | **Tracker / care plan.** Therapist activity templates → assignments → seeker completions → therapist progress view. | `14_tracker.sql` — `activities`, `assignments`, `completions`. |
| 16 | **Notifications.** Interakt WhatsApp + transactional email adapters, event triggers (booking/reminder/verification), per-channel preferences. | `15_notifications.sql` — `notification_preferences`, `notification_log`. |
| 17 | **Privacy / DPDP.** Data export, crypto-shred account+data deletion, consent management UI, grievance contact. | `16_privacy_dpdp.sql` — `data_requests`, `deletion_jobs`. |
| 18 | **Calendar + Settings + Profile completion.** Unified upcoming/past sessions view, settings surfaces, profile editing. | — mostly frontend |
| 19 | **hovio.org welcome + auth entry.** Small calm welcome page (login/register CTA; the big marketing site is tryhovio.com), motion via GSAP/Lenis. | — frontend only |
| 20 | **Hardening + launch readiness.** Rate limiting, security headers, RLS audit pass, idempotency, PII-redaction middleware, accessibility + responsive QA, error/empty-state sweep, observability. | `17_hardening.sql` — audit/rate-limit tweaks (if needed). |

## Conventions
- I generate **one prompt at a time** on request, detailed and self-contained, in chat (not as a file), with its `.sql` file alongside.
- Each prompt ends by leaving the app typechecking, linting clean, and running.
- The agentic internals (prompts/tools/evals) are a **separate workstream**; prompts here build to the stub interfaces in `agentic-system.md`.
