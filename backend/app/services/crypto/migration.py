"""Migration utility to retroactively encrypt onboarding free-text responses."""

from __future__ import annotations

import logging
from typing import Any

from fastapi.concurrency import run_in_threadpool

from app.core.supabase import get_supabase
from app.services.crypto.service import encrypt_string_to_text

logger = logging.getLogger("hovio.crypto.migration")


async def migrate_onboarding_responses() -> int:
    """Retroactively encrypt plaintext columns in onboarding_responses.

    Returns the number of migrated rows.
    """
    sb = get_supabase()

    def _fetch_all() -> Any:
        return sb.table("onboarding_responses").select("*").execute()

    res = await run_in_threadpool(_fetch_all)
    rows = res.data or []

    migrated_count = 0
    for row in rows:
        uid = row["user_id"]
        past_therapy = row.get("past_therapy_note")
        therapist_know = row.get("therapist_should_know")
        whatsapp = row.get("whatsapp_number")

        needs_migration = False
        updates: dict[str, Any] = {}

        # If a column is present and doesn't contain a colon ":", it means it's plaintext
        # and needs to be migrated to ciphertext.
        if past_therapy and ":" not in past_therapy:
            needs_migration = True
            updates["past_therapy_note"] = await encrypt_string_to_text(uid, past_therapy)

        if therapist_know and ":" not in therapist_know:
            needs_migration = True
            updates["therapist_should_know"] = await encrypt_string_to_text(uid, therapist_know)

        if whatsapp and ":" not in whatsapp:
            # Check if it looks like it is already encrypted. If not, encrypt it.
            needs_migration = True
            updates["whatsapp_number"] = await encrypt_string_to_text(uid, whatsapp)

        if needs_migration:

            def _update(user_id: str, patch: dict[str, Any]) -> Any:
                return (
                    sb.table("onboarding_responses").update(patch).eq("user_id", user_id).execute()
                )

            await run_in_threadpool(lambda: _update(uid, updates))
            migrated_count += 1
            logger.info("Successfully migrated onboarding responses for user_id=%s", uid)

    return migrated_count
