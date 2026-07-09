# Integrations & Environment

All secrets via env vars, never committed. Provide `.env.example` in both `frontend/` and `backend/`.

## Services

**Supabase** — Postgres, Auth (email/password + Google OAuth), Storage (private buckets for credential docs), Realtime. Backend uses the service-role key (server-only); frontend uses the anon key + user JWT.

**OpenAI (GPT-4o mini)** — companion + agent pipeline + safety classifier (for now; swappable behind one provider adapter in the backend).

**LiveKit (self-hosted)** — video/audio/chat rooms for human sessions. Backend mints join tokens at session time. Mobile SDKs exist for later.

**Razorpay** — INR pay-per-session for human sessions (AI is free in v1). Orders + signature verification + webhook. Payout/commission scaffolding present but policy values off by default.

**Interakt (WhatsApp Business Cloud API)** — transactional WhatsApp from day one: booking confirmations, reminders, verification updates. Template-based.

**Email (transactional)** — Brevo (or Resend/SES — pick one, keep it adapter-wrapped) for the same event set as WhatsApp, plus auth emails Supabase doesn't cover.

**Cloudinary** — **public, non-sensitive images only**: therapist profile photos and seeker avatars. On-the-fly transforms + CDN delivery. Behind an `ImageStorage` adapter (`upload`/`delete`/`url`) so it's swappable. **Uploads are signed and server-side** (frontend → FastAPI → Cloudinary with server-only creds); **never** unsigned client-side presets. Store only the resulting URL + `public_id` on the profile.

> **Hard image rule — split by data type:**
> - **Public images** (profile photos, avatars) → **Cloudinary**, signed server-side upload, behind `ImageStorage`.
> - **Sensitive documents** (credential/degree/registration certificates, government IDs) → **PRIVATE Supabase `therapist-credentials` bucket only**, per-user RLS, no public URL, backend-mediated + audited access. **Never Cloudinary.**
> - DPDP: deletion/erasure (Prompt 17) must also call Cloudinary `delete` on the user's `public_id` so no face/photo is orphaned on the CDN.
> - Profile photos are seeker-visible: gate via moderation (Cloudinary add-on) or an admin "pending → approved" state before they show publicly.

**KMS** — master key for envelope encryption (cloud KMS or a securely-managed key in v1; abstract behind a `KeyProvider` interface so it can move to a managed KMS without code changes).

## Env vars (backend)

```
# Supabase
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_JWT_SECRET=
# OpenAI
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
# LiveKit
LIVEKIT_URL=
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=
# Razorpay
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=
# Interakt (WhatsApp)
INTERAKT_API_KEY=
INTERAKT_BASE_URL=
# Email
EMAIL_PROVIDER_API_KEY=
EMAIL_FROM=
# Encryption
KMS_MASTER_KEY_ID=        # or managed key reference
# Cloudinary (public images only — profile photos / avatars)
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
# App
APP_ENV=local|staging|production
FRONTEND_ORIGIN=https://hovio.org
```

## Env vars (frontend)

```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_API_BASE_URL=
VITE_LIVEKIT_URL=
VITE_RAZORPAY_KEY_ID=
```

## Notes
- Every integration sits behind an **adapter interface** so it's swappable and testable (especially Email and KMS).
- Webhooks (Razorpay) are signature-verified and idempotent.
- WhatsApp/email templates live in code/config, versioned; sends are logged as metadata only (no PII payload retained).
