"""Summarizer and Matcher agents for seeker-to-therapist handoff."""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel

from app.adapters.llm import ChatMessage, OpenAIAdapter
from app.core.supabase import get_supabase
from app.services.crypto import decrypt, encrypt, parse_bytea

logger = logging.getLogger("hovio.services.handoff")


# --- Prompts ---

# CLINICAL REVIEW REQUIRED
SUMMARIZER_SYSTEM_PROMPT = (
    "You are a clinical intake summarization assistant for Hovio, a professional mental health platform.\n"
    "Analyze the transcript of the emotional support conversation between the Seeker and the AI Companion.\n"
    "Your task is to produce a short, objective, and neutral intake summary that will help a human therapist "
    "understand the seeker's concerns. This ensures the seeker won't have to re-tell their entire story from scratch.\n"
    "Do not include any clinical diagnosis, treatment plans, or raw transcripts.\n"
    "Do not include any personally identifying information (PII) like names, phone numbers, or email addresses.\n"
    "Focus on:\n"
    "1. Primary concerns or struggles reported by the seeker (e.g., stress, grief, anxiety, relationship difficulties).\n"
    "2. Key details (e.g., duration, severity, emotional expression).\n"
    "3. Current coping strategies.\n"
    "Keep it brief, compassionate, and highly professional. Write in the third person. Max 250 words."
)

MATCHER_CRITERIA_PROMPT = (
    "You are a matching criteria extraction assistant. Analyze the clinical intake summary "
    "of a seeker and return a JSON object with: \n"
    "1. 'specializations': a list of lowercase string categories representing the therapist specialties "
    "needed (e.g., 'depression', 'anxiety', 'grief', 'relationships', 'trauma', 'stress', 'career', 'addiction').\n"
    "2. 'non_identifying_need': a short, single-sentence summary of the seeker's need for invitations "
    "(e.g., 'Seeker is seeking coping strategies for work-related anxiety and stress.'). "
    "Ensure it contains ABSOLUTELY NO personally identifying details (no names, locations, ages, specific organizations, etc.).\n\n"
    "Return only valid JSON matching this structure."
)


class MatchExtractResponse(BaseModel):
    specializations: list[str]
    non_identifying_need: str


# --- Summarizer Agent ---


async def run_summarizer(user_id: str, escalation_id: str, session_id: str) -> str:
    """Generate and store an envelope-encrypted intake summary for the escalation."""
    sb = get_supabase()

    # 1. Update escalation status to 'summarizing'
    def _update_status(status: str) -> Any:
        return sb.table("escalations").update({"status": status}).eq("id", escalation_id).execute()

    await run_in_threadpool(_update_status, "summarizing")

    # 2. Fetch session messages
    def _fetch_messages() -> Any:
        return (
            sb.table("ai_messages")
            .select("*")
            .eq("session_id", session_id)
            .order("created_at")
            .execute()
        )

    msg_res = await run_in_threadpool(_fetch_messages)
    db_messages = msg_res.data or []
    if not db_messages:
        raise ValueError(f"No messages found for session {session_id}")

    # 3. Decrypt messages
    turns: list[str] = []
    for msg in db_messages:
        role = msg["role"]
        ciphertext = parse_bytea(msg["ciphertext"])
        nonce = parse_bytea(msg["nonce"])
        plaintext = await decrypt(user_id, ciphertext, nonce)
        speaker = "Seeker" if role == "user" else "Companion"
        turns.append(f"{speaker}: {plaintext}")

    transcript = "\n".join(turns)

    # 4. Generate summary using LLM
    llm = OpenAIAdapter()
    summary_text = await llm.chat(
        messages=[
            ChatMessage(role="system", content=SUMMARIZER_SYSTEM_PROMPT),
            ChatMessage(role="user", content=f"Transcript:\n{transcript}"),
        ]
    )

    # 5. Envelope encrypt the summary
    cipher, nonce = await encrypt(user_id, summary_text)

    # 6. Store in intake_summaries
    def _store_summary() -> Any:
        row = {
            "escalation_id": escalation_id,
            "seeker_id": user_id,
            "summary_cipher": "\\x" + cipher.hex(),
            "summary_nonce": "\\x" + nonce.hex(),
            "generated_at": datetime.now(UTC).isoformat(),
        }
        return sb.table("intake_summaries").upsert(row, on_conflict="escalation_id").execute()

    await run_in_threadpool(_store_summary)
    logger.info(
        "Intake summary successfully created and encrypted for escalation %s", escalation_id
    )
    return summary_text


# --- Matcher Agent ---


async def run_matcher(user_id: str, escalation_id: str, summary_text: str) -> None:
    """Analyze the summary, construct match criteria, rank therapists, and send invitations."""
    sb = get_supabase()

    # 1. Update escalation status to 'matching'
    def _update_status(status: str) -> Any:
        return sb.table("escalations").update({"status": status}).eq("id", escalation_id).execute()

    await run_in_threadpool(_update_status, "matching")

    # 2. Extract specializations and non-identifying need line using LLM parser
    llm = OpenAIAdapter()
    response = await llm.client.beta.chat.completions.parse(
        model=llm._model,
        messages=[
            {"role": "system", "content": MATCHER_CRITERIA_PROMPT},
            {"role": "user", "content": f"Intake Summary:\n{summary_text}"},
        ],
        response_format=MatchExtractResponse,
        temperature=0.0,
    )
    parsed = response.choices[0].message.parsed
    if parsed is None:
        raise ValueError("Failed to parse matching criteria from intake summary")

    inferred_specs = parsed.specializations
    need_line = parsed.non_identifying_need

    # 3. Load onboarding answers for language, gender preference, and financial situation
    def _fetch_onboarding() -> Any:
        return (
            sb.table("onboarding_responses")
            .select("answers")
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )

    onboarding_res = await run_in_threadpool(_fetch_onboarding)
    onboarding_rows = onboarding_res.data or []
    answers = onboarding_rows[0]["answers"] if onboarding_rows else {}

    # Read onboarding prefs
    lang = answers.get("preferred_language", "english")
    preferred_languages = answers.get("preferred_languages", [lang] if lang else ["english"])
    lang_str = ", ".join(preferred_languages)
    gender_pref = answers.get("therapist_gender_preference")
    financial = answers.get("financial_situation")

    # If gender pref is no preference / any, treat as None
    if gender_pref in ("no preference", "any", "no_preference", "none"):
        gender_pref = None

    # Derive price ceiling
    # comfortable/prefer_not -> no ceiling (None)
    # managing -> 2500 INR
    # stretched -> 1500 INR
    # struggling -> 1000 INR
    price_ceiling = None
    if financial == "managing":
        price_ceiling = 2500
    elif financial == "stretched":
        price_ceiling = 1500
    elif financial == "struggling":
        price_ceiling = 1000

    # 4. Save match criteria (request_cipher holds encrypted short need line)
    need_cipher, need_nonce = await encrypt(user_id, need_line)

    def _store_criteria() -> Any:
        row = {
            "escalation_id": escalation_id,
            "specializations": inferred_specs,
            "language": lang_str,
            "gender_preference": gender_pref,
            "price_ceiling_inr": price_ceiling,
            "request_cipher": "\\x" + need_cipher.hex(),
            "request_nonce": "\\x" + need_nonce.hex(),
        }
        return sb.table("match_criteria").upsert(row, on_conflict="escalation_id").execute()

    await run_in_threadpool(_store_criteria)

    # 5. Fetch verified and bookable therapists
    from app.routers.scheduling import cleanup_expired_holds, get_scheduling_config
    cleanup_expired_holds(sb)

    config = get_scheduling_config(sb)
    min_notice_mins = config.get("min_notice_minutes", 120)
    now_iso = (datetime.now(UTC) + timedelta(minutes=min_notice_mins)).isoformat()

    def _fetch_slots() -> Any:
        return (
            sb.table("slots")
            .select("therapist_id, starts_at")
            .eq("status", "open")
            .gte("starts_at", now_iso)
            .execute()
        )

    slots_res = await run_in_threadpool(_fetch_slots)
    slots_data = slots_res.data or []

    therapist_slots: dict[str, list[str]] = {}
    for s in slots_data:
        tid = s["therapist_id"]
        if tid not in therapist_slots:
            therapist_slots[tid] = []
        therapist_slots[tid].append(s["starts_at"])

    def _fetch_therapists() -> Any:
        return (
            sb.table("therapist_profiles")
            .select("*, profiles!inner(display_name)")
            .eq("verification_status", "verified")
            .eq("bookable", True)
            .execute()
        )

    therapists_res = await run_in_threadpool(_fetch_therapists)
    therapists = therapists_res.data or []

    # 6. Rank therapists
    ranked_therapists: list[tuple[dict[str, Any], float]] = []
    three_days_limit = (datetime.now(UTC) + timedelta(days=3)).isoformat()

    for t in therapists:
        # Exclude therapists with no upcoming availability
        t_id = t["id"]
        if t_id not in therapist_slots or not therapist_slots[t_id]:
            continue

        score = 0.0

        # Availability bonus: +5 if they have a slot in the next 3 days, +0.5 per slot up to 10 slots (+5 max)
        slots_list = therapist_slots[t_id]
        has_soon = any(s_at <= three_days_limit for s_at in slots_list)
        if has_soon:
            score += 5.0
        score += min(len(slots_list), 10) * 0.5

        # Specializations match: +10 for each overlap
        t_specs = [s.lower() for s in t.get("specializations", [])]
        for spec in inferred_specs:
            if spec.lower() in t_specs:
                score += 10.0

        # Language match: +5
        t_langs = [lang.lower() for lang in t.get("languages", [])]
        if any(pl.lower() in t_langs for pl in preferred_languages):
            score += 5.0

        # Gender preference match: +3
        t_gender = t.get("gender")
        if not gender_pref:
            score += 3.0
        elif t_gender == gender_pref:
            score += 3.0

        # Price within ceiling: +2
        t_price = t.get("price_inr")
        if price_ceiling is None:
            score += 2.0
        elif t_price is not None and t_price <= price_ceiling:
            score += 2.0

        ranked_therapists.append((t, score))

    # Sort descending by score
    ranked_therapists.sort(key=lambda x: x[1], reverse=True)

    # Take top N (e.g., 5)
    top_n = ranked_therapists[:5]

    # 7. Create therapist invitations
    invitation_rows = []
    expires_at = (datetime.now(UTC) + timedelta(hours=24)).isoformat()

    for therapist, score in top_n:
        invitation_rows.append(
            {
                "escalation_id": escalation_id,
                "therapist_id": therapist["id"],
                "status": "invited",
                "match_score": score,
                "expires_at": expires_at,
            }
        )

    def _insert_invitations() -> Any:
        if invitation_rows:
            return sb.table("therapist_invitations").insert(invitation_rows).execute()
        return None

    if invitation_rows:
        await run_in_threadpool(_insert_invitations)

    # 8. Notify therapists (Stub)
    for therapist, _ in top_n:
        logger.info(
            "Notification STUB: Notify therapist %s of invitation on escalation %s",
            therapist["id"],
            escalation_id,
        )

    # 9. Update escalation status to 'awaiting_selection'
    await run_in_threadpool(_update_status, "awaiting_selection")
