"""Append-only audit logging.

Records THAT a sensitive action happened — never content or PII. See
docs/safety-and-privacy.md. Writes go through the service-role client.
"""

from __future__ import annotations

from typing import Any

from fastapi.concurrency import run_in_threadpool

from app.core.supabase import get_supabase


async def write_audit(
    *,
    actor_id: str,
    action: str,
    target_table: str | None = None,
    target_id: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> None:
    """Insert one audit row. `metadata` must contain only non-sensitive values."""

    def _q() -> Any:
        return (
            get_supabase()
            .table("audit_log")
            .insert(
                {
                    "actor_id": actor_id,
                    "action": action,
                    "target_table": target_table,
                    "target_id": target_id,
                    "metadata": metadata or {},
                }
            )
            .execute()
        )

    await run_in_threadpool(_q)
