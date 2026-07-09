# Architecture

## Shape

Hovio is an **API-first** system so the same backend serves the web app (hovio.org) today and the iOS/Android apps later. Nothing web-only leaks into the API.

```
              ┌────────────────────────────────────────────┐
              │  Clients: hovio.org (web) → later iOS/Android │
              └───────────────┬────────────────────────────┘
                              │ HTTPS / JSON + SSE (chat stream)
                              ▼
          ┌───────────────────────────────────────────────┐
          │  FastAPI backend  (auth/authz in app code)     │
          │  ┌──────────┐ ┌───────────┐ ┌────────────────┐ │
          │  │ REST API │ │ Agentic   │ │ Integrations   │ │
          │  │ routers  │ │ system    │ │ adapters       │ │
          │  └────┬─────┘ └─────┬─────┘ └───────┬────────┘ │
          └───────┼─────────────┼───────────────┼──────────┘
                  │             │               │
        ┌─────────▼───┐  ┌──────▼──────┐  ┌──────▼─────────────────────┐
        │ Supabase    │  │ OpenAI      │  │ LiveKit · Razorpay ·       │
        │ PG + Auth + │  │ GPT-4o mini │  │ Interakt(WhatsApp) · Email │
        │ Storage +   │  │ (companion  │  │                            │
        │ Realtime    │  │ + agents)   │  │                            │
        └─────────────┘  └─────────────┘  └────────────────────────────┘
```

## Auth & authorization model

- **Supabase Auth** issues JWTs (email/password + Google OAuth). The frontend holds the session.
- Every API request carries the Supabase JWT. The **backend verifies the JWT, resolves the user + role, and enforces authorization in app code**. This keeps the agentic backend (which needs service-role access for cross-user matching, summaries, etc.) clean.
- **RLS stays enabled on every table** as defense-in-depth, scoped to `auth.uid()`. Service-role queries in the backend are deliberate and audited.
- Roles: `seeker | therapist | admin`, stored on `profiles`. Role-specific data lives in `seeker_profiles` / `therapist_profiles`. A therapist is only **bookable** once `verification_status = verified`.

## Core data flows

**AI companion session**
1. Seeker opens a session → `ai_sessions` row created.
2. Each message round-trips through the backend. **Before** the model replies, the message passes the **safety guardrail** (deterministic tripwire + classifier). On a crisis hit → session is closed, helplines surfaced, `crisis_events` recorded, model is not asked to "handle" it.
3. Otherwise the **companion orchestrator** replies via SSE stream. Messages are persisted **envelope-encrypted**.
4. With consent, a rolling **AI memory** (summaries + pgvector embeddings) is updated for cross-session continuity.

**AI → human handoff**
1. Companion decides escalation is warranted → suggests it; **seeker confirms** (never auto-routed).
2. **Summarizer agent** produces a short intake summary. Seeker **explicitly consents** to share it.
3. **Matcher agent** builds a candidate therapist list (specialization + language + price + availability + gender preference) from *verified* therapists and sends invitations.
4. Therapists who accept appear to the seeker; seeker picks one; booking proceeds.

**Booking → session**
1. Therapist publishes **availability blocks**; system generates open **slots**.
2. Seeker books a slot (optionally the AI proposes times that fit both calendars). `bookings` row created → Razorpay order → payment.
3. At session time, backend mints a **LiveKit** token; room supports video/audio/chat.
4. Post-session, therapist may add private notes and assign **tracker** activities.

**Messaging**
- Seeker↔therapist async messages run through the **content filter** (strip links/phones/emails/handles) before persistence and delivery.

## Environments

- `local` (Supabase local or a dev project), `staging`, `production`. All secrets via env vars; never committed. See `docs/integrations.md` for the full env list.

## Observability & safety ops

- Structured logs with **PII redaction** middleware (transcripts/summaries/PII never serialized).
- Audit log table for every sensitive read/write (who, what, when — not the content).
- Rate limiting on auth, chat, and payment endpoints. Idempotency keys on payment + booking writes.

## Mobile reuse

- All capability is exposed via the REST/SSE API + Supabase client. LiveKit, Razorpay, and Supabase all have native mobile SDKs, so the apps reuse the same contracts. No business logic lives in the web frontend.
