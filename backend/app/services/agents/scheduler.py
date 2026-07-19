"""Scheduler Agent for extracting time preferences and proposing slots during handoff."""

from __future__ import annotations

import json
import logging
from datetime import UTC, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from pydantic import BaseModel

from app.adapters.llm import OpenAIAdapter
from app.core.supabase import get_supabase
from app.services.crypto import decrypt, parse_bytea

logger = logging.getLogger("hovio.services.scheduler")

SCHEDULER_EXTRACTOR_PROMPT = (
    "You are a scheduling time-preference extraction assistant.\n"
    "Analyze the conversation transcript between the Seeker and the AI Companion.\n"
    "Identify any stated or implied scheduling/time preferences that the Seeker mentioned (e.g., mornings, evenings, weekends, weekdays, specific days like Tuesdays, or specific times like after 5 PM).\n"
    "Based on these extracted preferences, evaluate each of the available therapist slots (provided as a list of dates/times in UTC, but matching Asia/Kolkata timezone).\n"
    "Select the 2 or 3 slots that best fit the seeker's preferences. If the seeker expressed no preferences, choose the earliest 3 slots.\n\n"
    "Format your final output strictly as a JSON object with two fields:\n"
    "1. 'reason': a brief explanation of why these slots were chosen (e.g., 'Chosen because you preferred evening slots after work').\n"
    "2. 'recommended_slot_starts': a list of ISO strings matching the starts_at of the chosen slots.\n\n"
    "Output ONLY valid JSON."
)


class SchedulerDecision(BaseModel):
    reason: str
    recommended_slot_starts: list[str]


async def propose_slots_for_seeker(
    user_id: str, session_id: str, therapist_id: str
) -> dict[str, Any]:
    """Analyze chat history, extract time preferences, match against therapist slots, and propose 2-3 slots."""
    sb = get_supabase()

    # 1. Fetch upcoming open slots for the therapist (ensuring lazy slots generation runs)
    from app.routers.scheduling import generate_slots, get_scheduling_config
    await generate_slots(therapist_id, sb)

    now = datetime.now(UTC)
    config = get_scheduling_config(sb)
    min_notice_mins = config.get("min_notice_minutes", 120)
    start_limit = (now + timedelta(minutes=min_notice_mins)).isoformat()

    def _fetch_slots():
        return (
            sb.table("slots")
            .select("*")
            .eq("therapist_id", therapist_id)
            .eq("status", "open")
            .gte("starts_at", start_limit)
            .order("starts_at")
            .limit(30)
            .execute()
        )

    slots_res = await _fetch_slots()
    open_slots = slots_res.data or []
    if not open_slots:
        return {
            "reason": "The therapist has no open slots available in the upcoming window.",
            "slots": [],
        }

    # 2. Fetch session chat history
    def _fetch_messages():
        return (
            sb.table("ai_messages")
            .select("*")
            .eq("session_id", session_id)
            .order("created_at")
            .execute()
        )

    msg_res = await _fetch_messages()
    db_messages = msg_res.data or []

    # Decrypt chat messages
    turns = []
    for msg in db_messages:
        try:
            role = msg["role"]
            ciphertext = parse_bytea(msg["ciphertext"])
            nonce = parse_bytea(msg["nonce"])
            plaintext = await decrypt(user_id, ciphertext, nonce)
            speaker = "Seeker" if role == "user" else "Companion"
            turns.append(f"{speaker}: {plaintext}")
        except Exception:
            continue

    transcript = "\n".join(turns)

    # 3. Format available slots for the LLM
    slots_formatted = []
    for s in open_slots:
        # Convert UTC starts_at to IST for the prompt
        starts_dt = datetime.fromisoformat(s["starts_at"].replace("Z", "+00:00"))
        ist_dt = starts_dt.astimezone(ZoneInfo("Asia/Kolkata"))
        slots_formatted.append(
            {
                "id": s["id"],
                "starts_at_utc": s["starts_at"],
                "starts_at_ist": ist_dt.strftime("%A, %b %d, %Y at %I:%M %p"),
            }
        )

    # 4. Ask LLM to select best slots
    llm = OpenAIAdapter()
    slots_input_str = json.dumps(slots_formatted, indent=2)

    try:
        response = await llm.client.beta.chat.completions.parse(
            model=llm._model,
            messages=[
                {"role": "system", "content": SCHEDULER_EXTRACTOR_PROMPT},
                {
                    "role": "user",
                    "content": f"Chat Transcript:\n{transcript}\n\nAvailable slots:\n{slots_input_str}",
                },
            ],
            response_format=SchedulerDecision,
            temperature=0.0,
        )
        decision = response.choices[0].message.parsed
        if not decision or not decision.recommended_slot_starts:
            raise ValueError("Empty recommendations from Scheduler LLM")

        # Map recommendations back to slots list
        proposed_slot_starts = decision.recommended_slot_starts
        proposed_slots = []
        for s in open_slots:
            # Match by parsed start datetime equality (in case of Z vs offset notation differences)
            s_dt = datetime.fromisoformat(s["starts_at"].replace("Z", "+00:00"))
            matched = False
            for rec in proposed_slot_starts:
                rec_dt = datetime.fromisoformat(rec.replace("Z", "+00:00"))
                if s_dt == rec_dt:
                    matched = True
                    break
            if matched:
                proposed_slots.append(s)

        # Fallback to first 3 if matching failed
        if not proposed_slots:
            proposed_slots = open_slots[:3]

        return {"reason": decision.reason, "slots": proposed_slots[:3]}

    except Exception as e:
        logger.error("Scheduler Agent failed: %s, falling back to first 3 slots", e)
        return {
            "reason": "Here are the earliest available slots for this therapist:",
            "slots": open_slots[:3],
        }
