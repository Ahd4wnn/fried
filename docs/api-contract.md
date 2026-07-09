# API Contract

API-first so web and the future mobile apps share it. Base: `/api/v1`. JSON everywhere; chat streams via **SSE**. All non-public routes require a valid Supabase JWT; the backend resolves role and authorizes.

## Conventions
- Auth: `Authorization: Bearer <supabase_jwt>`.
- Errors: `{ "error": { "code": "snake_case", "message": "human readable", "details": {} } }` with proper HTTP status. Errors never leak PII.
- Pagination: cursor-based `?cursor=&limit=`.
- Idempotency: `Idempotency-Key` header on booking + payment writes.
- Validation: Pydantic in, typed out. Generate an OpenAPI schema → TS client for the frontend.

## Endpoints by domain (representative, not exhaustive)

**Auth / profile**
- `GET  /me` — profile + role + consents.
- `POST /me/role` — set role at registration (seeker|therapist).
- `PATCH /me` — update profile.
- `POST /onboarding` — submit onboarding + acceptances.
- `GET/PATCH /me/consents` — granular consent toggles.

**AI companion**
- `POST /ai/sessions` — start a session.
- `POST /ai/sessions/{id}/messages` — send a message; **SSE** stream of the reply. (Runs safety guardrail first.)
- `GET  /ai/sessions/{id}` — session + messages (owner only, decrypted to owner).
- `POST /ai/sessions/{id}/end` — end session.
- Safety responses may return a terminal `crisis` event payload (session closed + helplines) instead of a normal reply.

**Handoff & matching**
- `POST /handoff/escalations/{sessionId}/confirm` — seeker confirms escalation.
- `POST /handoff/summaries/{escalationId}/consent` — consent to share intake summary.
- `GET  /handoff/invitations` — therapists who accepted (for the seeker to pick).
- `POST /handoff/invitations/{id}/accept|decline` — therapist responds.

**Therapist & verification**
- `POST /therapist/verification` — submit RCI number + docs.
- `GET  /therapist/verification` — status.
- `GET/PUT /therapist/profile` — bio, specializations, languages, gender, price.
- `GET/POST/DELETE /therapist/availability` — availability blocks.

**Admin**
- `GET  /admin/verifications` — review queue.
- `POST /admin/verifications/{id}/decision` — verify/reject with notes.
- `GET  /admin/users` · `GET /admin/crisis-events` (metadata only) · user actions.

**Scheduling & bookings**
- `GET  /therapists` — search verified therapists by match criteria.
- `GET  /therapists/{id}/slots` — open slots.
- `POST /bookings` — book a slot (Idempotency-Key).
- `POST /bookings/{id}/cancel|reschedule`.
- `GET  /bookings` — seeker/therapist views.

**Payments (Razorpay)**
- `POST /payments/orders` — create order for a booking.
- `POST /payments/verify` — verify signature, confirm booking.
- `POST /webhooks/razorpay` — server-to-server (signature-verified).

**Live sessions (LiveKit)**
- `POST /live/{bookingId}/token` — mint a join token at session time (modality: video|audio|chat).
- `POST /live/{bookingId}/notes` — therapist private notes (encrypted).

**Messaging**
- `GET  /threads` · `GET /threads/{id}/messages`.
- `POST /threads/{id}/messages` — content filter applied **before** persistence.

**Tracker / care plan**
- `POST /tracker/activities` (therapist) · `POST /tracker/assignments` (therapist).
- `GET  /tracker/assignments` (seeker) · `POST /tracker/completions` (seeker).
- `GET  /tracker/progress/{seekerId}` (therapist, for their seekers only).

**Notifications**
- `GET/PATCH /me/notifications` — channel preferences.
- (Sending is internal: WhatsApp via Interakt + email, triggered by domain events.)

**Privacy / DPDP**
- `POST /privacy/export` · `GET /privacy/export/{id}`.
- `POST /privacy/delete` — initiates crypto-shred deletion (confirmable).

## SSE shape (chat)
`event: token` (incremental text) · `event: done` (final, with message id) · `event: crisis` (terminal: session closed + helpline payload) · `event: error`.
