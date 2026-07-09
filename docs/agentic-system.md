# Agentic System (interface stub)

The companion is not a single prompt — it's a small pipeline of agents with clean interfaces. **This file is a stub.** The internals (prompts, tool use, orchestration framework, evals) get their own dedicated design session. Build to these interfaces so nothing is blocked; do not over-build the internals yet.

## Agents

1. **Safety Guardrail** *(runs first, on every inbound seeker message)*
   - In: message + recent context. Out: `{ verdict: ok|concern|crisis, category, severity }`.
   - Implementation: deterministic tripwire ∪ GPT-4o-mini classifier (see `safety-and-privacy.md`).
   - `crisis` short-circuits the entire pipeline → crisis path. Nothing downstream runs.

2. **Companion Orchestrator** *(the listener)*
   - In: message + AI memory (if consented) + session history. Out: streamed empathetic reply (SSE).
   - Warm, calm, non-clinical. Never diagnoses/treats. Recognizes when a concern exceeds AI scope and *suggests* (never forces) escalation.

3. **Summarizer** *(on confirmed escalation)*
   - In: session transcript (decrypted in-process). Out: short, neutral **intake summary** — enough that the seeker doesn't re-tell their story, nothing more. Stored encrypted; shared only on consent.

4. **Matcher** *(on share-consent)*
   - In: summary signals + `match_criteria` (specialization, language, price ceiling, gender preference, availability). Out: ranked list of **verified** therapists → invitations.

5. **Scheduler** *(during booking / in-chat)*
   - In: seeker preferred times + therapist availability blocks. Out: proposed slots that fit both. The AI can propose times in-chat; the seeker still confirms the booking.

6. **Memory Writer** *(post-session, if consented)*
   - In: session. Out: updated rolling summary + pgvector embeddings in `ai_memory`. Wiped on consent withdrawal or account deletion (crypto-shred).

## Orchestration contract

```
inbound message
   └─> SafetyGuardrail.evaluate()  ──crisis──> crisis path (stop)
                 │ ok/concern
                 ▼
        CompanionOrchestrator.stream()  ──(may set escalation_suggested)
                 │
        (on confirmed escalation) Summarizer ─> (on consent) Matcher ─> invitations
                 │
        (post-session, if consented) MemoryWriter
```

## Rules for the build

- Each agent is a **service with a typed interface** (Pydantic in/out), independently testable.
- The Safety Guardrail is **non-bypassable** and always runs first.
- Agents that read sensitive content decrypt **in-process only**; never log or persist plaintext.
- Model calls go through one provider adapter (OpenAI; GPT-4o mini for now) so models/prompts are swappable without touching call sites.
- Keep v1 internals minimal but correct; the deep agentic design (tools, multi-step planning, evals, guardrail tuning) is a separate workstream.
