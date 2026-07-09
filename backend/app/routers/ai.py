"""AI Companion sessions and messaging router.

Provides endpoints for starting, listing, ending sessions, and streaming messages
via SSE with guardrails, encryption, and memory integrations.
"""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import UTC, datetime
from typing import Any, Literal

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.adapters.llm import ChatMessage, OpenAIAdapter
from app.core.errors import AppError
from app.core.security import CurrentUser, require_role
from app.core.supabase import get_supabase
from app.services.agents.memory import generate_and_store_memory, retrieve_past_memories
from app.services.audit import write_audit
from app.services.crypto import decrypt, encrypt, parse_bytea
from app.services.safety import SafetyService, get_helplines

logger = logging.getLogger("hovio.routers.ai")

router = APIRouter(prefix="/api/v1/ai", tags=["ai"])


# --- Prompts & Personas ---

# CLINICAL REVIEW REQUIRED
COMPANION_SYSTEM_PERSONA = (
    "You are Hovio, a warm, calm, and empathetic AI companion. "
    "Your role is to be a supportive listener, helping the seeker explore their feelings "
    "and thoughts. You are NOT a therapist, counselor, or medical professional. "
    "You must NEVER diagnose conditions, prescribe treatment, or suggest clinical interventions. "
    "Keep your tone gentle, supportive, and conversational. Use plain, warm language. "
    "If the seeker asks for therapy or professional medical advice, remind them gently "
    "that you are an AI companion, and they can search for verified human therapists on the platform."
)

# CLINICAL REVIEW REQUIRED
CONCERN_RESOURCING_GUIDANCE = (
    "\n\n[Clinical Guardrail Note: The seeker's input has triggered a mild distress concern. "
    "Respond with extra warmth, patience, and support. Acknowledge their pain gently. "
    "In a natural and non-intrusive way, remind them that they don't have to carry this alone, "
    "and that they can access verified emergency resources and helplines anytime by clicking "
    "the 'Get help now' siren button at the top right of the dashboard.]"
)

# CLINICAL REVIEW REQUIRED
CRISIS_CARING_MESSAGE = (
    "Thank you for sharing this with me. You matter, and I'm really glad you told me. "
    "I'm concerned about you, and because I'm an AI companion and cannot provide crisis counseling, "
    "I want you to connect with someone who can support you right now. Please reach out to one of the resources below."
)  # CLINICAL REVIEW REQUIRED
ROUTING_JUDGE_PROMPT = (
    "You are a routing classification assistant for Hovio, a mental health companion platform.\n"
    "Your role is to decide if the seeker's concerns warrant escalation to a professional human therapist "
    "instead of being supported only by an AI companion.\n\n"
    "AI companion is suitable for small, common concerns (e.g., general stress, minor study pressure, time management, "
    "mild loneliness, needing a sounding board).\n"
    "Professional human therapists are required for significant, complex, or clinical concerns (e.g., deep trauma, "
    "severe grief, chronic depression, severe relationship/marital conflicts, diagnostic requests, "
    "long-term anxiety disorders, or whenever the seeker explicitly asks for a human therapist or therapy).\n\n"
    "Analyze the conversation history and output:\n"
    "1. should_escalate: true if the seeker needs a human therapist, false otherwise.\n"
    "2. reason: a brief explanation of your decision.\n\n"
    "Respond strictly with a JSON object matching the schema."
)


class RoutingDecision(BaseModel):
    should_escalate: bool
    reason: str


# --- Request/Response Schemas ---


class SessionCreateRequest(BaseModel):
    title: str | None = None


class AISessionResponse(BaseModel):
    id: str
    status: str
    title: str | None
    started_at: str
    ended_at: str | None


class AIMessageResponse(BaseModel):
    id: str
    role: Literal["user", "assistant"]
    content: str
    safety_verdict: str | None
    created_at: str


class AISessionDetailResponse(BaseModel):
    id: str
    status: str
    title: str | None
    started_at: str
    ended_at: str | None
    messages: list[AIMessageResponse]


class SendMessageRequest(BaseModel):
    text: str


# --- Endpoints ---


@router.post("/sessions", response_model=AISessionResponse)
async def start_session(
    payload: SessionCreateRequest,
    user: CurrentUser = Depends(require_role("seeker")),
) -> AISessionResponse:
    """Start a new active AI companion session."""
    sb = get_supabase()

    # 1. Check if the user already has an active session with no messages.
    # This prevents double session creation in React dev mode (StrictMode) or on double clicks.
    def _find_active_sessions() -> Any:
        return (
            sb.table("ai_sessions")
            .select("id, status, title, started_at, ended_at")
            .eq("user_id", user.id)
            .eq("status", "active")
            .order("started_at", desc=True)
            .execute()
        )

    try:
        active_res = await run_in_threadpool(_find_active_sessions)
        active_rows = active_res.data or []
        if active_rows:
            latest_active = active_rows[0]

            def _check_messages() -> Any:
                return (
                    sb.table("ai_messages")
                    .select("id")
                    .eq("session_id", latest_active["id"])
                    .limit(1)
                    .execute()
                )

            msg_res = await run_in_threadpool(_check_messages)
            if not msg_res.data:
                logger.info(
                    "Reusing existing empty active session_id=%s for user_id=%s",
                    latest_active["id"],
                    user.id,
                )
                return AISessionResponse(
                    id=latest_active["id"],
                    status=latest_active["status"],
                    title=latest_active["title"],
                    started_at=latest_active["started_at"],
                    ended_at=latest_active["ended_at"],
                )
    except Exception as e:
        logger.warning("Failed to check active sessions for reuse: %s", e)

    # 2. Otherwise, create a new active session
    title = payload.title or f"Chat session on {datetime.now(UTC).strftime('%b %d, %Y')}"

    def _insert() -> Any:
        row = {
            "user_id": user.id,
            "status": "active",
            "title": title,
            "started_at": datetime.now(UTC).isoformat(),
        }
        return sb.table("ai_sessions").insert(row).execute()

    res = await run_in_threadpool(_insert)
    rows = res.data or []
    if not rows:
        raise AppError(
            "session_creation_failed", "We couldn’t start a new session. Try again.", 500
        )

    s = rows[0]
    return AISessionResponse(
        id=s["id"],
        status=s["status"],
        title=s["title"],
        started_at=s["started_at"],
        ended_at=s["ended_at"],
    )


@router.get("/sessions", response_model=list[AISessionResponse])
async def list_sessions(
    user: CurrentUser = Depends(require_role("seeker")),
) -> list[AISessionResponse]:
    """List recent AI companion sessions for the authenticated seeker."""
    sb = get_supabase()

    def _query() -> Any:
        return (
            sb.table("ai_sessions")
            .select("*")
            .eq("user_id", user.id)
            .order("started_at", desc=True)
            .execute()
        )

    res = await run_in_threadpool(_query)
    rows = res.data or []
    return [
        AISessionResponse(
            id=s["id"],
            status=s["status"],
            title=s["title"],
            started_at=s["started_at"],
            ended_at=s["ended_at"],
        )
        for s in rows
    ]


@router.get("/sessions/{id}", response_model=AISessionDetailResponse)
async def fetch_session(
    id: str,
    user: CurrentUser = Depends(require_role("seeker")),
) -> AISessionDetailResponse:
    """Fetch session details and its decrypted messages (owner only)."""
    sb = get_supabase()

    # 1. Fetch and verify session ownership
    def _fetch_session() -> Any:
        return sb.table("ai_sessions").select("*").eq("id", id).limit(1).execute()

    session_res = await run_in_threadpool(_fetch_session)
    session_rows = session_res.data or []
    if not session_rows:
        raise HTTPException(status_code=404, detail="Session not found")

    session = session_rows[0]
    if session["user_id"] != user.id:
        raise HTTPException(status_code=403, detail="Forbidden")

    # 2. Fetch session messages
    def _fetch_messages() -> Any:
        return (
            sb.table("ai_messages").select("*").eq("session_id", id).order("created_at").execute()
        )

    msg_res = await run_in_threadpool(_fetch_messages)
    db_messages = msg_res.data or []

    # 3. Decrypt message bodies
    decrypted_messages: list[AIMessageResponse] = []
    for msg in db_messages:
        try:
            ciphertext = parse_bytea(msg["ciphertext"])
            nonce = parse_bytea(msg["nonce"])
            plaintext = await decrypt(user.id, ciphertext, nonce)
            decrypted_messages.append(
                AIMessageResponse(
                    id=msg["id"],
                    role=msg["role"],
                    content=plaintext,
                    safety_verdict=msg["safety_verdict"],
                    created_at=msg["created_at"],
                )
            )
        except Exception as e:
            logger.error("Failed to decrypt message id=%s: %s", msg["id"], e)
            # Fail closed or omit message? Let's skip corrupted messages to maintain app availability
            continue

    return AISessionDetailResponse(
        id=session["id"],
        status=session["status"],
        title=session["title"],
        started_at=session["started_at"],
        ended_at=session["ended_at"],
        messages=decrypted_messages,
    )


@router.post("/sessions/{id}/end", response_model=AISessionResponse)
async def end_session(
    id: str,
    background_tasks: BackgroundTasks,
    user: CurrentUser = Depends(require_role("seeker")),
) -> AISessionResponse:
    """End a companion session and trigger memory generation in background."""
    sb = get_supabase()

    def _fetch() -> Any:
        return sb.table("ai_sessions").select("user_id", "status").eq("id", id).limit(1).execute()

    res = await run_in_threadpool(_fetch)
    rows = res.data or []
    if not rows:
        raise HTTPException(status_code=404, detail="Session not found")

    session = rows[0]
    if session["user_id"] != user.id:
        raise HTTPException(status_code=403, detail="Forbidden")

    if session["status"] == "active":

        def _update() -> Any:
            row = {
                "status": "ended",
                "ended_at": datetime.now(UTC).isoformat(),
            }
            return sb.table("ai_sessions").update(row).eq("id", id).execute()

        update_res = await run_in_threadpool(_update)
        updated_rows = update_res.data or []
        session = updated_rows[0] if updated_rows else session

        # Queue memory generation in background tasks so API returns instantly
        background_tasks.add_task(generate_and_store_memory, user.id, id)

    return AISessionResponse(
        id=id,
        status=session["status"],
        title=session.get("title"),
        started_at=session.get("started_at"),
        ended_at=session.get("ended_at"),
    )


@router.post("/sessions/{id}/messages")
async def send_message(
    id: str,
    payload: SendMessageRequest,
    user: CurrentUser = Depends(require_role("seeker")),
) -> StreamingResponse:
    """Send a message to the session and get a streamed response via SSE.

    Enforces Guardrail First: runs SafetyService before any model generation.
    """
    sb = get_supabase()

    # 1. Verify session exists and is active
    def _fetch_session() -> Any:
        return sb.table("ai_sessions").select("*").eq("id", id).limit(1).execute()

    session_res = await run_in_threadpool(_fetch_session)
    session_rows = session_res.data or []
    if not session_rows:
        raise HTTPException(status_code=404, detail="Session not found")

    session = session_rows[0]
    if session["user_id"] != user.id:
        raise HTTPException(status_code=403, detail="Forbidden")

    if session["status"] != "active":
        raise AppError("session_not_active", "This session has ended.", 400)

    # 2. Persist the user message encrypted
    user_text = payload.text.strip()
    cipher, nonce = await encrypt(user.id, user_text)

    def _insert_user_msg() -> Any:
        row = {
            "session_id": id,
            "user_id": user.id,
            "role": "user",
            "ciphertext": "\\x" + cipher.hex(),
            "nonce": "\\x" + nonce.hex(),
        }
        return sb.table("ai_messages").insert(row).execute()

    insert_res = await run_in_threadpool(_insert_user_msg)
    user_msg_rows = insert_res.data or []
    if not user_msg_rows:
        raise AppError("message_save_failed", "We couldn’t send your message.", 500)

    user_message_id = user_msg_rows[0]["id"]

    # 3. Create the event generator for streaming SSE
    async def sse_event_generator():
        try:
            # 4. Run safety guardrail FIRST
            llm_adapter = OpenAIAdapter()
            verdict = await SafetyService.evaluate(user_text, llm_adapter=llm_adapter)

            # Update the user turn's safety_verdict
            def _update_verdict() -> Any:
                return (
                    sb.table("ai_messages")
                    .update({"safety_verdict": verdict.verdict})
                    .eq("id", user_message_id)
                    .execute()
                )

            await run_in_threadpool(_update_verdict)

            # 5. Handle safety verdict: crisis vs concern/ok
            if verdict.verdict == "crisis":
                # A. Close session
                def _close_session() -> Any:
                    row = {
                        "status": "closed_crisis",
                        "ended_at": datetime.now(UTC).isoformat(),
                    }
                    return sb.table("ai_sessions").update(row).eq("id", id).execute()

                await run_in_threadpool(_close_session)
                helplines = await get_helplines()

                # B. Stream the caring message to the user turn by turn as tokens
                words = CRISIS_CARING_MESSAGE.split(" ")
                for i, word in enumerate(words):
                    space = " " if i < len(words) - 1 else ""
                    yield f"event: token\ndata: {json.dumps({'text': word + space})}\n\n"
                    await asyncio.sleep(0.015)

                # C. Save metadata-only audit log
                # CLINICAL REVIEW REQUIRED
                await SafetyService.record_crisis_event(
                    user_id=user.id,
                    session_id=id,
                    source="ai_chat",
                    verdict=verdict,
                    helplines_shown=[h["name"] for h in helplines["helplines"]],
                )

                # D. Persist the templated assistant message (encrypted)
                assist_cipher, assist_nonce = await encrypt(user.id, CRISIS_CARING_MESSAGE)

                def _insert_crisis_msg() -> Any:
                    row = {
                        "session_id": id,
                        "user_id": user.id,
                        "role": "assistant",
                        "ciphertext": "\\x" + assist_cipher.hex(),
                        "nonce": "\\x" + assist_nonce.hex(),
                        "safety_verdict": None,
                    }
                    return sb.table("ai_messages").insert(row).execute()

                assist_insert_res = await run_in_threadpool(_insert_crisis_msg)
                assist_message_id = (
                    assist_insert_res.data[0]["id"]
                    if assist_insert_res.data
                    else f"crisis-assist-{int(datetime.now(UTC).timestamp())}"
                )

                # E. Emit crisis event with message and helplines
                payload = {
                    "caring_message": CRISIS_CARING_MESSAGE,
                    "helplines": helplines["helplines"],
                    "message_id": assist_message_id,
                }
                yield f"event: crisis\ndata: {json.dumps(payload)}\n\n"
                return

            # ok or concern: proceed to generate reply
            # Fetch past memory summaries if consented
            memories = await retrieve_past_memories(user.id, user_text)

            # Fetch recent conversation turns (up to last 10 messages)
            def _fetch_history() -> Any:
                return (
                    sb.table("ai_messages")
                    .select("*")
                    .eq("session_id", id)
                    .order("created_at", desc=True)
                    .limit(11)  # Fetch 11 turns to exclude the current user turn
                    .execute()
                )

            history_res = await run_in_threadpool(_fetch_history)
            history_rows = history_res.data or []
            # Exclude the current incoming message if it is in the database list, and reverse to chronological
            history_rows = [h for h in history_rows if h["id"] != user_message_id]
            history_rows.reverse()

            # Track user turn count (including the turn we just saved)
            def _fetch_turn_count() -> Any:
                return (
                    sb.table("ai_messages")
                    .select("id")
                    .eq("session_id", id)
                    .eq("role", "user")
                    .execute()
                )

            turn_count_res = await run_in_threadpool(_fetch_turn_count)
            user_turn_count = len(turn_count_res.data or [])

            # Load pacing config
            def _fetch_pacing_config() -> Any:
                return (
                    sb.table("app_config").select("value").eq("key", "ai_pacing").limit(1).execute()
                )

            pacing_val = {"understand_by": 10, "route_by": 18, "soft_cap": 22}
            try:
                pacing_res = await run_in_threadpool(_fetch_pacing_config)
                if pacing_res.data:
                    pacing_val = pacing_res.data[0]["value"]
            except Exception as pacing_err:
                logger.error("Failed to load pacing config from app_config: %s", pacing_err)

            understand_by = pacing_val.get("understand_by", 10)
            route_by = pacing_val.get("route_by", 18)
            soft_cap = pacing_val.get("soft_cap", 22)

            # Assemble conversation history for OpenAI
            openai_messages: list[ChatMessage] = []

            # A. System Persona
            system_prompt = COMPANION_SYSTEM_PERSONA
            if memories:
                memory_grounding = "\n\nSeeker Context Memory:\n" + "\n".join(
                    f"- {m}" for m in memories
                )
                system_prompt += memory_grounding

            # B. Inject Resourcing Guidance on Concern
            if verdict.verdict == "concern":
                system_prompt += CONCERN_RESOURCING_GUIDANCE

            # C. Inject Pacing Phase Guidance
            # CLINICAL REVIEW REQUIRED
            if user_turn_count < understand_by:
                pacing_prompt = (
                    f"\n\n[Pacing Phase: Listen & Understand (Turn count: {user_turn_count} < {understand_by}). "
                    "Focus purely on open listening and gentle clarification. Do not suggest or nudge towards "
                    "professional therapy/routing yet. Keep the space completely open and supportive.]"
                )
            elif user_turn_count < soft_cap:
                pacing_prompt = (
                    f"\n\n[Pacing Phase: Assess & Route (Turn count: {user_turn_count} of {route_by}). "
                    "The seeker's issue should be understood by now. Evaluate whether this concern is a small, "
                    "common concern that you can support, or if a professional human therapist would help more. "
                    "Do not force or nudge yet unless the need is clear, but be prepared to guide them if they ask.]"
                )
            else:
                pacing_prompt = (
                    f"\n\n[Pacing Phase: Soft Cap (Turn count: {user_turn_count} >= {soft_cap}). "
                    "A human therapist would clearly help but has not been suggested yet. Gently surface the option "
                    "to speak with a human therapist on the platform as a helpful step, without forcing it or closing "
                    "the companion session.]"
                )
            system_prompt += pacing_prompt

            openai_messages.append(ChatMessage(role="system", content=system_prompt))

            # D. Past turns
            for h in history_rows:
                h_cipher = parse_bytea(h["ciphertext"])
                h_nonce = parse_bytea(h["nonce"])
                h_text = await decrypt(user.id, h_cipher, h_nonce)
                openai_messages.append(ChatMessage(role=h["role"], content=h_text))

            # E. Current User Message
            openai_messages.append(ChatMessage(role="user", content=user_text))

            # Stream companion reply
            full_reply_text = ""
            async for token in llm_adapter.stream_chat(openai_messages):
                full_reply_text += token
                yield f"event: token\ndata: {json.dumps({'text': token})}\n\n"

            # Persist assistant message encrypted
            assist_cipher, assist_nonce = await encrypt(user.id, full_reply_text)

            def _insert_assist_msg() -> Any:
                row = {
                    "session_id": id,
                    "user_id": user.id,
                    "role": "assistant",
                    "ciphertext": "\\x" + assist_cipher.hex(),
                    "nonce": "\\x" + assist_nonce.hex(),
                }
                return sb.table("ai_messages").insert(row).execute()

            assist_insert_res = await run_in_threadpool(_insert_assist_msg)
            assist_rows = assist_insert_res.data or []
            assist_message_id = assist_rows[0]["id"] if assist_rows else "unknown-assistant-msg-id"

            # F. Evaluate routing judge (Assess & Route / Soft Cap)
            needs_routing_check = user_turn_count >= understand_by or any(
                kw in user_text.lower()
                for kw in ["therapist", "therapy", "counselor", "psychologist"]
            )
            if needs_routing_check:
                try:
                    # Prepare messages context for the routing judge (exclude system prompt for brevity)
                    judge_messages = [ChatMessage(role="system", content=ROUTING_JUDGE_PROMPT)]
                    for msg in openai_messages[1:]:
                        judge_messages.append(msg)
                    # Add final assistant reply to context
                    judge_messages.append(ChatMessage(role="assistant", content=full_reply_text))

                    routing_res = await llm_adapter.client.beta.chat.completions.parse(
                        model=llm_adapter._model,
                        messages=[
                            {"role": msg.role, "content": msg.content} for msg in judge_messages
                        ],
                        response_format=RoutingDecision,
                        temperature=0.0,
                    )
                    decision = routing_res.choices[0].message.parsed
                    if decision and decision.should_escalate:
                        # Check if escalation already exists for this session
                        def _check_esc() -> Any:
                            return (
                                sb.table("escalations").select("id").eq("session_id", id).execute()
                            )

                        esc_check = await run_in_threadpool(_check_esc)
                        if not esc_check.data:
                            # Create suggested escalation
                            def _create_esc() -> Any:
                                row = {
                                    "seeker_id": user.id,
                                    "session_id": id,
                                    "status": "suggested",
                                }
                                return sb.table("escalations").insert(row).execute()

                            esc_create_res = await run_in_threadpool(_create_esc)
                            if esc_create_res.data:
                                esc_id = esc_create_res.data[0]["id"]
                                yield f"event: escalation_suggestion\ndata: {json.dumps({'escalation_id': esc_id, 'message': 'Would it help to talk to a therapist?'})}\n\n"
                except Exception as routing_err:
                    logger.error("Failed to run routing judge: %s", routing_err)

            # Send done event with assistant message ID
            yield f"event: done\ndata: {json.dumps({'message_id': assist_message_id})}\n\n"

        except Exception as err:
            logger.error("SSE stream error: %s", err)
            try:
                # Retrieve helplines (with fallback inside get_helplines if DB is down)
                helplines = await get_helplines()
                # Yield token events for the caring message so the user gets the text
                words = CRISIS_CARING_MESSAGE.split(" ")
                for i, word in enumerate(words):
                    space = " " if i < len(words) - 1 else ""
                    yield f"event: token\ndata: {json.dumps({'text': word + space})}\n\n"
                    await asyncio.sleep(0.01)

                payload = {
                    "caring_message": CRISIS_CARING_MESSAGE,
                    "helplines": helplines.get("helplines", []),
                    "message_id": f"error-fallback-{int(datetime.now(UTC).timestamp())}",
                }
                yield f"event: crisis\ndata: {json.dumps(payload)}\n\n"
            except Exception as inner_err:
                logger.error("Failed to yield crisis fallback on error: %s", inner_err)
                # Ultimate fallback
                fallback_payload = {
                    "caring_message": CRISIS_CARING_MESSAGE,
                    "helplines": [
                        {
                            "name": "Tele-MANAS",
                            "number": "14416",
                            "description": "National Mental Health Helpline of India. Free, confidential, 24/7 support.",
                        }
                    ],
                    "message_id": "ultimate-fallback",
                }
                yield f"event: crisis\ndata: {json.dumps(fallback_payload)}\n\n"

    return StreamingResponse(
        sse_event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Disable Nginx buffering if deployed
        },
    )


# --- AI Chat Reports Schemas & Endpoints ---


class AIReportCreateRequest(BaseModel):
    session_id: str | None = None
    message_id: str | None = None
    category: Literal["harmful", "inappropriate", "incorrect", "unhelpful", "technical", "other"]
    description: str | None = None


class AIReportResponse(BaseModel):
    id: str
    reporter_id: str
    session_id: str | None = None
    message_id: str | None = None
    category: str
    status: str
    admin_notes: str | None = None
    resolved_by: str | None = None
    resolved_at: str | None = None
    created_at: datetime
    updated_at: datetime


class AIReportAdminTriageRequest(BaseModel):
    status: Literal["open", "under_review", "resolved", "dismissed"] | None = None
    admin_notes: str | None = None


class AIReportDecryptedResponse(BaseModel):
    report_id: str
    message_id: str | None = None
    reported_message_content: str | None = None
    reporter_description: str | None = None


@router.post("/reports", response_model=AIReportResponse)
async def create_report(
    body: AIReportCreateRequest,
    user: CurrentUser = Depends(require_role("seeker")),
) -> AIReportResponse:
    sb = get_supabase()

    cipher_bytes = None
    nonce_bytes = None
    if body.description:
        cipher_bytes, nonce_bytes = await encrypt(user.id, body.description)

    row = {
        "reporter_id": user.id,
        "session_id": body.session_id,
        "message_id": body.message_id,
        "category": body.category,
        "description_cipher": "\\x" + cipher_bytes.hex() if cipher_bytes else None,
        "description_nonce": "\\x" + nonce_bytes.hex() if nonce_bytes else None,
        "status": "open",
    }

    def _insert():
        return sb.table("ai_reports").insert(row).execute()

    res = await run_in_threadpool(_insert)
    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to create report")
    return AIReportResponse(**res.data[0])


@router.get("/reports", response_model=list[AIReportResponse])
async def get_my_reports(
    user: CurrentUser = Depends(require_role("seeker")),
) -> list[AIReportResponse]:
    sb = get_supabase()

    def _q():
        return (
            sb.table("ai_reports")
            .select("*")
            .eq("reporter_id", user.id)
            .order("created_at", desc=True)
            .execute()
        )

    res = await run_in_threadpool(_q)
    return [AIReportResponse(**r) for r in (res.data or [])]


@router.get("/admin/reports", response_model=list[AIReportResponse])
async def get_admin_reports(
    user: CurrentUser = Depends(require_role("admin")),
) -> list[AIReportResponse]:
    sb = get_supabase()

    def _q():
        return sb.table("ai_reports").select("*").order("created_at", desc=True).execute()

    res = await run_in_threadpool(_q)
    return [AIReportResponse(**r) for r in (res.data or [])]


@router.patch("/admin/reports/{id}", response_model=AIReportResponse)
async def triage_report(
    id: str,
    body: AIReportAdminTriageRequest,
    user: CurrentUser = Depends(require_role("admin")),
) -> AIReportResponse:
    sb = get_supabase()

    # check if report exists
    def _fetch():
        return sb.table("ai_reports").select("*").eq("id", id).limit(1).execute()

    fetch_res = await run_in_threadpool(_fetch)
    if not fetch_res.data:
        raise HTTPException(status_code=404, detail="Report not found")

    update_data: dict[str, Any] = {}
    if body.status is not None:
        update_data["status"] = body.status
        if body.status in ("resolved", "dismissed"):
            update_data["resolved_by"] = user.id
            update_data["resolved_at"] = datetime.now(UTC).isoformat()
    if body.admin_notes is not None:
        update_data["admin_notes"] = body.admin_notes

    def _update():
        return sb.table("ai_reports").update(update_data).eq("id", id).execute()

    res = await run_in_threadpool(_update)
    return AIReportResponse(**res.data[0])


@router.post("/admin/reports/{id}/decrypt", response_model=AIReportDecryptedResponse)
async def decrypt_reported_content(
    id: str,
    user: CurrentUser = Depends(require_role("admin")),
) -> AIReportDecryptedResponse:
    sb = get_supabase()

    # 1. Fetch report details
    def _fetch_report():
        return sb.table("ai_reports").select("*").eq("id", id).limit(1).execute()

    report_res = await run_in_threadpool(_fetch_report)
    if not report_res.data:
        raise HTTPException(status_code=404, detail="Report not found")

    report = report_res.data[0]
    reporter_id = report["reporter_id"]
    message_id = report["message_id"]
    category = report["category"]

    # 2. Decrypt reporter's description if present
    reporter_description = None
    if report.get("description_cipher") and report.get("description_nonce"):
        try:
            desc_cipher = parse_bytea(report["description_cipher"])
            desc_nonce = parse_bytea(report["description_nonce"])
            reporter_description = await decrypt(reporter_id, desc_cipher, desc_nonce)
        except Exception as e:
            logger.error("Failed to decrypt report description: %s", e)
            reporter_description = "[Decryption Failed]"

    # 3. Decrypt message content if message_id is present
    reported_message_content = None
    if message_id:

        def _fetch_message():
            return (
                sb.table("ai_messages")
                .select("*")
                .eq("id", message_id)
                .eq("user_id", reporter_id)
                .limit(1)
                .execute()
            )

        msg_res = await run_in_threadpool(_fetch_message)
        if msg_res.data:
            msg = msg_res.data[0]
            try:
                msg_cipher = parse_bytea(msg["ciphertext"])
                msg_nonce = parse_bytea(msg["nonce"])
                reported_message_content = await decrypt(reporter_id, msg_cipher, msg_nonce)
            except Exception as e:
                logger.error("Failed to decrypt reported message: %s", e)
                reported_message_content = "[Decryption Failed]"

    # 4. Write audit log entry
    await write_audit(
        actor_id=user.id,
        action="reported_message_decrypted",
        target_table="ai_reports",
        target_id=id,
        metadata={
            "reporter_id": reporter_id,
            "message_id": message_id,
            "category": category,
        },
    )

    # TODO(Prompt 10): admin reports UI.
    return AIReportDecryptedResponse(
        report_id=id,
        message_id=message_id,
        reported_message_content=reported_message_content,
        reporter_description=reporter_description,
    )
