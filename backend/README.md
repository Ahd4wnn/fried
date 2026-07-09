# Hovio backend

FastAPI (async, Python 3.12+) service + agentic system. Enforces authn/authz in
app code; Supabase RLS is defense-in-depth. Every external service sits behind a
typed adapter in `app/adapters/` (LLM, payments, LiveKit, notifications, email,
KMS) — Prompt 1 ships the interfaces only.

## Setup

```bash
python -m venv .venv
source .venv/Scripts/activate     # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env               # fill in secrets (local boots with blanks)
uvicorn app.main:app --reload      # http://localhost:8000
```

Check it: `GET http://localhost:8000/api/v1/health` → `{"status":"ok","env":"local"}`.

## Lint

```bash
ruff check .
ruff check . --fix
```

## Layout

```
app/
  main.py            FastAPI app, CORS, router include
  core/              config, supabase (service-role), logging (+PII redaction)
  routers/           HTTP routers (thin); health check
  adapters/          swappable integration interfaces (stubs in Prompt 1)
  services/          domain logic (empty for now)
```
