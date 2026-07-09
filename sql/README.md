# Database migrations

Postgres on Supabase. Migrations are plain SQL files, applied **in order**.

## Naming convention

```
NN_name.sql
```

- `NN` — a zero-padded, monotonically increasing number (`01`, `02`, `03`, …).
- One migration per build prompt that changes the database (frontend-only
  prompts ship none). The migration each prompt owns is listed in
  [`../docs/build-sequence.md`](../docs/build-sequence.md).
- Migrations are **append-only and forward-only**: never edit or reorder a
  migration that has already been applied to a shared environment. Fix mistakes
  with a new, higher-numbered migration.

## How to apply

**Option A — Supabase SQL editor (quickest for a dev project)**

1. Open your project → **SQL Editor**.
2. Paste the contents of each file, lowest number first, and run it.
3. Apply every pending file in order; do not skip.

**Option B — Supabase CLI**

```bash
# Run a single migration against the linked/local database:
supabase db execute --file sql/01_init.sql

# …then 02, 03, … in order.
```

Apply them in numeric order against a fresh database; the same order reproduces
the schema anywhere.

## Migrations

| File                   | Prompt | Summary                                                                 |
| ---------------------- | ------ | ----------------------------------------------------------------------- |
| `01_init.sql`          | 1      | Extensions (uuid/pgcrypto/pgvector), role/status enums, `profiles`, `app_config` (+ helpline seeds), `audit_log`, `updated_at` + new-user triggers, baseline RLS. |
| `02_auth_profiles.sql` | 3      | `seeker_profiles`, `therapist_profiles` (verification_status, bookable, RCI), `verification_status` + `gender_identity` enums, owner-only RLS. |
| `03_onboarding_consent.sql` | 4 | `onboarding_responses` (answers jsonb, age≥18 check, sensitive free-text, suitability flags, `completed_at`), `legal_acceptances` (append-only), `consents` (granular, PK user+type), `legal_doc_type` + `consent_type` enums, owner-only RLS. |

> Both migrations are idempotent (`if not exists` / guarded enums) and safe to
> re-run. Apply in numeric order before running the backend.
