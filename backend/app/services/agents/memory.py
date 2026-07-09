"""Consent-gated vector memory service for the AI companion.

Summarizes sessions at their conclusion, stores encrypted summaries with pgvector
embeddings, and retrieves relevant past context for new conversations.
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi.concurrency import run_in_threadpool

from app.adapters.llm import ChatMessage, OpenAIAdapter
from app.core.supabase import get_supabase
from app.services.crypto import decrypt, encrypt, parse_bytea

logger = logging.getLogger("hovio.services.memory")


async def generate_and_store_memory(user_id: str, session_id: str) -> None:
    """Generate a summary of the session, compute its embedding, and store it encrypted.

    Only runs if the user has consented to AI memory.
    """
    sb = get_supabase()

    # 1. Check AI memory consent
    def _fetch_consent() -> Any:
        return (
            sb.table("seeker_profiles")
            .select("ai_memory_consent")
            .eq("id", user_id)
            .limit(1)
            .execute()
        )

    try:
        consent_res = await run_in_threadpool(_fetch_consent)
        consent_rows = consent_res.data or []
        if not consent_rows or not consent_rows[0].get("ai_memory_consent"):
            logger.info("Memory generation skipped: consent is disabled for user_id=%s", user_id)
            return
    except Exception as e:
        logger.error("Failed to check memory consent for user_id=%s: %s", user_id, e)
        return

    # 2. Fetch session messages
    def _fetch_messages() -> Any:
        return (
            sb.table("ai_messages")
            .select("*")
            .eq("session_id", session_id)
            .order("created_at")
            .execute()
        )

    try:
        msg_res = await run_in_threadpool(_fetch_messages)
        db_messages = msg_res.data or []
    except Exception as e:
        logger.error("Failed to fetch messages for session_id=%s: %s", session_id, e)
        return

    if not db_messages:
        logger.info("Memory generation skipped: no messages found in session_id=%s", session_id)
        return

    # 3. Decrypt messages and build conversation text
    turns: list[str] = []
    for msg in db_messages:
        role = msg["role"]
        ciphertext = parse_bytea(msg["ciphertext"])
        nonce = parse_bytea(msg["nonce"])
        try:
            plaintext = await decrypt(user_id, ciphertext, nonce)
            speaker = "Seeker" if role == "user" else "Companion"
            turns.append(f"{speaker}: {plaintext}")
        except Exception as e:
            logger.error("Failed to decrypt message id=%s in session memory flow: %s", msg["id"], e)
            return

    transcript = "\n".join(turns)

    # 4. Generate summary using the LLM adapter
    # CLINICAL REVIEW REQUIRED (persona limits, non-diagnostic voice)
    system_prompt = (
        "You are a memory summarization assistant for Hovio, a mental health companion.\n"
        "Analyze the conversation transcript between the Seeker and the Companion.\n"
        "Write a concise, empathetic, and neutral summary of the seeker's concerns, "
        "emotional state, preferences, and key context. Do not include any clinical diagnosis, "
        "assessment, or treatment plans. Write in the third person. Keep it under 200 words."
    )
    llm = OpenAIAdapter()
    try:
        summary_text = await llm.chat(
            messages=[
                ChatMessage(role="system", content=system_prompt),
                ChatMessage(role="user", content=f"Transcript:\n{transcript}"),
            ]
        )
    except Exception as e:
        logger.error("Failed to generate memory summary for session_id=%s: %s", session_id, e)
        return

    # 5. Compute embedding of the summary
    try:
        embedding = await llm.embed(summary_text)
    except Exception as e:
        logger.error("Failed to generate embedding for memory summary: %s", e)
        return

    # 6. Encrypt the summary
    try:
        cipher, nonce = await encrypt(user_id, summary_text)
    except Exception as e:
        logger.error("Failed to encrypt memory summary: %s", e)
        return

    # 7. Store in the database
    def _store() -> Any:
        row = {
            "user_id": user_id,
            "session_id": session_id,
            "summary_cipher": "\\x" + cipher.hex(),
            "summary_nonce": "\\x" + nonce.hex(),
            "embedding": embedding,
        }
        return sb.table("ai_memory").insert(row).execute()

    try:
        await run_in_threadpool(_store)
        logger.info("Successfully stored encrypted memory summary for session_id=%s", session_id)
    except Exception as e:
        logger.error("Failed to store memory row in Supabase: %s", e)


async def retrieve_past_memories(user_id: str, message: str, k: int = 3) -> list[str]:
    """Retrieve top-k relevant past summaries using vector cosine similarity.

    Only runs if memory consent is true; returns [] otherwise.
    """
    sb = get_supabase()

    # 1. Check consent
    def _fetch_consent() -> Any:
        return (
            sb.table("seeker_profiles")
            .select("ai_memory_consent")
            .eq("id", user_id)
            .limit(1)
            .execute()
        )

    try:
        consent_res = await run_in_threadpool(_fetch_consent)
        consent_rows = consent_res.data or []
        if not consent_rows or not consent_rows[0].get("ai_memory_consent"):
            return []
    except Exception as e:
        logger.error("Failed to check memory consent: %s", e)
        return []

    # 2. Compute query embedding
    llm = OpenAIAdapter()
    try:
        query_embedding = await llm.embed(message)
    except Exception as e:
        logger.error("Failed to embed message for memory retrieval: %s", e)
        return []

    # 3. Call the pgvector similarity RPC
    def _rpc() -> Any:
        # threshold is set to 0.0 (return best matching summaries up to k)
        return sb.rpc(
            "match_ai_memory",
            {
                "user_uuid": user_id,
                "query_embedding": query_embedding,
                "match_threshold": 0.0,
                "match_count": k,
            },
        ).execute()

    try:
        rpc_res = await run_in_threadpool(_rpc)
        rows = rpc_res.data or []
    except Exception as e:
        logger.error("Failed to match memories via Supabase RPC: %s", e)
        return []

    # 4. Decrypt matched summaries
    memories: list[str] = []
    for row in rows:
        cipher = parse_bytea(row["summary_cipher"])
        nonce = parse_bytea(row["summary_nonce"])
        try:
            plaintext = await decrypt(user_id, cipher, nonce)
            memories.append(plaintext)
        except Exception as e:
            logger.error("Failed to decrypt matched memory id=%s: %s", row["id"], e)

    return memories


async def wipe_user_memory(user_id: str) -> None:
    """Wipe all stored summaries and embeddings for the user."""
    sb = get_supabase()

    def _delete() -> Any:
        return sb.table("ai_memory").delete().eq("user_id", user_id).execute()

    await run_in_threadpool(_delete)
    logger.info("Wiped all memory rows for user_id=%s", user_id)
