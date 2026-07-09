# Safety & Privacy

This is the most important spec in the repo. Treat everything here as a hard requirement.

## 1. Crisis subsystem

### Trigger scope
Suicidal ideation, self-harm, abuse (experienced or witnessed), or intent to harm others.

### Two-layer detection (both run on every inbound seeker message, before the model replies)
1. **Deterministic tripwire** — a maintained, versioned pattern list (`safety_config`). Catches explicit phrases regardless of model behavior. Fast, cannot be "reasoned around."
2. **Classifier** — a GPT-4o-mini safety classification pass returning `{severity, category}`. Graded: `concern` (supportive, stay in session, gentle resourcing) vs `crisis` (escalate immediately).

If **either** layer fires `crisis`, the crisis path runs. Fail safe: if the classifier errors, fall back to the tripwire verdict; ambiguous → treat as higher severity.

### Crisis path behavior
1. The AI **does not attempt to counsel** the crisis. The companion never tries to "handle" it.
2. The current AI session is **closed gracefully** with a calm, caring message.
3. **Helpline resources are surfaced immediately** from `app_config` (always-current, verified):
   - **Tele-MANAS** — national government helpline: **14416** (and 1-800-891-4416)
   - **Vandrevala Foundation**, **iCall (TISS)**, **AASRA**
   - *All numbers are stored in config and must be re-verified against official sources before launch and on a schedule — never hardcoded in components.*
4. A `crisis_event` row is recorded: session ref, trigger layer, category, severity, timestamp, which resources were shown. **No transcript content is copied into it.**
5. Per your decision: **no human on your side is alerted** in v1. (The hook exists in the data model if you enable duty-of-care escalation later.)

### Always-visible crisis button
A persistent, calm "Get help now" affordance on every authenticated screen opens the helpline sheet directly — independent of the AI, reachable even mid-typing.

### Copy rules
Crisis copy is warm, direct, non-judgmental, and never clinical or alarmist. It uses the dedicated calm treatment from the design system, not error-red.

## 2. Privacy posture (DPDP Act 2023)

Goal: **as secure as feasible while the AI can still summarize and remember** (true zero-knowledge is incompatible with persistent AI memory — see CLAUDE.md).

### Encryption
- **In transit:** TLS everywhere.
- **At rest, app-level envelope encryption** on sensitive columns: AI messages, transcripts, intake summaries, onboarding free-text, journal/notes, therapist session notes, RCI number.
  - Each user has a **data key**, stored **wrapped** by a KMS-managed **master key** in `encryption_keys`.
  - Backend decrypts only when needed to run an agent or render to the owner. Plaintext is never persisted and never logged.
- **Crypto-shredding:** deleting a user's wrapped data key renders all their encrypted data unrecoverable — the primitive behind DPDP erasure.

### Access control
- Strict per-user **RLS** on every table.
- **Raw transcripts are never shared** with therapists or admins. Therapists receive only the **intake summary**, and only after the seeker's explicit share-consent. Admins see **metadata/counts only**, never content.
- Service-role reads (matching, summarization) are deliberate, minimal, and written to `audit_log`.

### Consent (granular, revocable)
- AI memory persistence (default off until accepted).
- Intake-summary sharing (per handoff, explicit).
- Notification channels (WhatsApp / email).
- Versioned ToS + Privacy acceptance + 18+ attestation at onboarding.

### Data subject rights (DPDP)
- **Export** — machine-readable copy of the user's data (decrypted to the owner).
- **Erasure** — crypto-shred + row cleanup via `deletion_jobs`; confirmable and logged.
- A named grievance/contact path surfaced in Settings.

### Logging & telemetry
- PII-redaction middleware: transcripts, summaries, names, contacts, helpline interactions, and payment PII are **never** serialized to logs/analytics/error reporters.
- Audit log captures *that* a sensitive action occurred (actor/action/target/time), never the content.

## 3. Off-platform contact filter (seeker ↔ therapist messaging)
Every message is screened **before persistence and delivery**:
- Strip/deny **URLs**, **phone numbers**, **email addresses**, and **social handles** (@-handles, "insta", "telegram", "whatsapp", etc.).
- The blocked content is replaced with a neutral marker; `messages.filtered = true` with a `filter_reason`. The sender sees a quiet inline notice explaining off-platform contact isn't allowed.
- Filter patterns are maintained in config and unit-tested with an evasion corpus.

## 4. Build-time safety checklist (every prompt touching chat, data, or messaging)
- [ ] No path lets the AI counsel a `crisis` trigger.
- [ ] Sensitive bodies encrypted, never logged.
- [ ] RLS present and tested for the new tables.
- [ ] No raw transcript reaches therapist/admin.
- [ ] Helplines read from config, not hardcoded.
- [ ] Message filter applied before persistence.
