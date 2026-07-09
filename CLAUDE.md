# CLAUDE.md — Hovio (hovio.org)

This file is the project constitution. Read it before every task. The `/docs` folder holds the detailed specs; this file holds the rules that are never broken.

## What Hovio is

Hovio is an AI-first emotional support platform. **Seekers** talk to an AI **companion** (a warm, calm listener). Small concerns are handled in-conversation; anything needing professional help is handed off to a verified human **therapist**, booked and conducted inside the app (video / audio / chat). A care-plan **tracker** lets therapists assign activities and watch progress.

- `tryhovio.com` — marketing/SEO landing page. **Not in this repo.**
- `hovio.org` — the application. **This is what we build.** It includes a small welcome/login page; the big marketing site lives on tryhovio.com.

Three roles, three dashboards: **seeker**, **therapist**, **admin**.

## Non-negotiable guardrails (read twice)

1. **The AI is never a "therapist."** In all code, copy, UI, and DB values it is the **"AI companion"** (or "listener" / "guide"). The words *therapist*, *clinical psychologist*, *counsellor*, *diagnose*, *treat*, *cure* are reserved exclusively for verified human professionals. This is a legal requirement under India's Mental Healthcare Act 2017 / RCI rules and an Apple App Store review requirement. No exceptions, including in placeholder text.

2. **Crisis handling is a first-class subsystem, not a string.** If the safety layer detects suicidal ideation, self-harm, abuse, or intent to harm others, the AI **does not try to handle it**. It ends the session gracefully and surfaces government helplines (Tele-MANAS 14416 and others from config). A `crisis_event` is recorded for audit. See `docs/safety-and-privacy.md`. Never weaken, bypass, or "optimize away" this path.

3. **Transcripts are the most sensitive data in the system.** Sensitive columns are envelope-encrypted (per-user data key wrapped by a KMS master key). Strict per-user RLS everywhere. **Raw transcripts are never auto-shared** with humans — only an AI-generated intake summary, and only after explicit seeker consent. Logs are PII-redacted. Every sensitive read is audited. See `docs/safety-and-privacy.md`.

4. **18+ only.** No minor onboarding in v1. Age is gated at signup with an explicit attestation.

5. **No off-platform contact.** Seeker↔therapist messages pass through a content filter that strips links, phone numbers, emails, and social handles before persistence/delivery.

6. **Never log secrets, transcripts, summaries, or PII.** Not in app logs, not in analytics, not in error reports.

## Stack

- **Frontend:** React + Vite + TypeScript + Tailwind CSS. Data: TanStack Query. Motion: **Motion** (framer-motion successor), **GSAP** + ScrollTrigger, **Lenis** for smooth scroll. Icons: lucide-react.
- **Backend:** FastAPI (async, Python 3.12+). Service-role access to Supabase; **the backend enforces authn/authz in app code, with RLS on as defense-in-depth.**
- **Data/Auth/Realtime:** Supabase (Postgres + Auth + Storage + Realtime). Extensions: `pgvector`, `pgcrypto`, `uuid-ossp`.
- **Realtime sessions:** LiveKit (self-hosted) — video, audio, and chat.
- **Payments:** Razorpay (INR, pay-per-session for human sessions). AI companion is free in v1.
- **Notifications:** WhatsApp via **Interakt** (WhatsApp Business Cloud API) + transactional **email** — both from day one.
- **AI:** OpenAI **GPT-4o mini** for the companion + agent pipeline (for now — swappable behind one provider adapter). See `docs/agentic-system.md`.

## Repository structure

```
/                 # root: CLAUDE.md, README, env templates, tooling configs
  frontend/       # React + Vite + TS app (hovio.org)
  backend/        # FastAPI service + agentic system
  docs/           # specs (this folder)
  assets/         # brand assets — DROP logo.png and logo-white.png HERE
  sql/            # numbered migrations, one per build prompt (NN_name.sql)
```

`assets/` must exist with a `README.md` telling the user to drop `logo.png` (dark logo for light bg) and `logo-white.png` (white logo for dark bg). Reference logos from there.

## How we work (very important)

- Development is **prompt-by-prompt**. Each task is a single, self-contained Claude Code prompt. Do exactly what the current prompt asks — do not scaffold ahead, do not invent features from later phases.
- Every prompt that changes the database ships with a numbered migration in `sql/` (e.g. `sql/06_ai_sessions.sql`). Frontend-only prompts have no migration.
- The full ordered plan lives in `docs/build-sequence.md`. Follow it in order.
- After each prompt: the code must typecheck, lint clean, and run. Keep the app in a working state at every step.

## Design north star

Minimalist, **Apple-styled** UI/UX. Calm, spacious, restrained. Forest green `#1C5C32` on cream `#FBF9F4`, Instrument Serif for display, Inter for everything else. Quality floor on every screen: fully responsive to mobile, visible keyboard focus, `prefers-reduced-motion` respected. See `docs/design-system.md`.

## Coding conventions

- TypeScript strict. No `any` without a written reason. Zod for runtime validation at boundaries.
- FastAPI: typed Pydantic models for every request/response. Async everywhere. Thin routers, logic in services.
- One source of truth for shared types between frontend and backend (the OpenAPI schema; generate a TS client).
- Conventional commits. Small, reviewable changes.
- Accessibility is not optional: semantic HTML, ARIA where needed, color-contrast AA.
