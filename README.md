# Hovio (hovio.org)

Hovio is an AI-first emotional support platform. Seekers talk to a warm, calm AI
**companion** (a listener — never a "therapist"). Small concerns are handled in
conversation; anything needing professional help is handed off to a verified
human **therapist**, booked and conducted inside the app (video / audio / chat),
with a care-plan **tracker** for assigned activities and progress. Crisis
situations are never handled by the AI — they surface government helplines and
are recorded for audit. This repo is the application at `hovio.org`; the
marketing site (`tryhovio.com`) lives elsewhere.

> Read [`CLAUDE.md`](CLAUDE.md) and the [`docs/`](docs/) folder before building —
> they are the source of truth for the stack, conventions, design tokens, and the
> non-negotiable safety/privacy guardrails.

## Structure

```
/
  frontend/   React + Vite + TypeScript app (hovio.org)
  backend/    FastAPI service + agentic system
  docs/       specs (stack, architecture, design system, safety & privacy…)
  assets/     brand assets — drop logo.png + logo-white.png here
  sql/        numbered migrations (NN_name.sql), applied in order
```

## Run it locally

### 1. Database

Apply the migrations in `sql/` in order against your Supabase project — see
[`sql/README.md`](sql/README.md). Start with `01_init.sql`.

### 2. Backend (FastAPI — http://localhost:8000)

```bash
cd backend
python -m venv .venv
source .venv/Scripts/activate     # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env               # fill in secrets
uvicorn app.main:app --reload
```

Health check: `GET http://localhost:8000/api/v1/health` →
`{"status":"ok","env":"local"}`.

### 3. Frontend (Vite — http://localhost:5173)

```bash
cd frontend
npm install
cp .env.example .env.local         # fill in VITE_* values
npm run dev
```

## Conventions

- Development is **prompt-by-prompt** (see
  [`docs/build-sequence.md`](docs/build-sequence.md)). Build exactly the current
  prompt's scope; keep the app typechecking, linting clean, and running after
  every step.
- TypeScript strict on the frontend; typed Pydantic models + `ruff` on the
  backend. Conventional commits, small reviewable changes.
- Secrets only via env vars (`.env.example` on both sides). Never log secrets,
  transcripts, summaries, or PII.

## Status

Prompt 1 — repo scaffold: both apps run, tooling is wired, the initial database
migration (`sql/01_init.sql`) is ready to apply. No feature code yet.
