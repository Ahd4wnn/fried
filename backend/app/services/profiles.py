"""Profile data access via the service-role Supabase client.

The supabase-py client is synchronous; calls are run in a threadpool so they
don't block the event loop. Authorization is enforced by callers (the JWT
dependency); these helpers assume the caller already owns `uid`.
"""

from __future__ import annotations

from typing import Any

from fastapi.concurrency import run_in_threadpool

from app.core.supabase import get_supabase

# Maps an assignable role to its 1:1 detail table.
ROLE_TABLE: dict[str, str] = {
    "seeker": "seeker_profiles",
    "therapist": "therapist_profiles",
}

_PROFILE_COLUMNS = (
    "id,role,display_name,avatar_url,avatar_pending_url,avatar_photo_status,locale,status,country"
)


async def fetch_profile(uid: str) -> dict[str, Any] | None:
    """Return the base profile row, or None if it doesn't exist yet."""

    def _q() -> Any:
        return (
            get_supabase()
            .table("profiles")
            .select(_PROFILE_COLUMNS)
            .eq("id", uid)
            .limit(1)
            .execute()
        )

    res = await run_in_threadpool(_q)
    rows = res.data or []
    return rows[0] if rows else None


async def fetch_role_row(uid: str, role: str) -> dict[str, Any] | None:
    """Return the role-specific detail row (seeker/therapist), or None."""
    table = ROLE_TABLE.get(role)
    if table is None:
        return None

    def _q() -> Any:
        return get_supabase().table(table).select("*").eq("id", uid).limit(1).execute()

    res = await run_in_threadpool(_q)
    rows = res.data or []
    return rows[0] if rows else None


async def get_assigned_role(uid: str) -> str | None:
    """The deliberately-assigned role, marked by an existing detail row.

    `profiles.role` always defaults to 'seeker' via the new-user trigger, so the
    existence of a seeker_profiles/therapist_profiles row is the source of truth
    for whether the user has actually completed role selection.
    """
    profile = await fetch_profile(uid)
    if profile and profile.get("role") == "admin":
        return "admin"

    for role in ("seeker", "therapist"):
        if await fetch_role_row(uid, role) is not None:
            return role
    return None


async def set_profile_role(uid: str, role: str) -> None:
    def _q() -> Any:
        return get_supabase().table("profiles").update({"role": role}).eq("id", uid).execute()

    await run_in_threadpool(_q)


async def create_role_row(uid: str, role: str) -> None:
    """Idempotently create the role-specific detail row with safe defaults.

    Note: therapist rows are created with verification_status='pending' and
    bookable=false. Those columns are admin-only (Prompt 9/10) and are never set
    here or by the therapist themselves.
    """
    table = ROLE_TABLE[role]

    def _q() -> Any:
        return (
            get_supabase()
            .table(table)
            .upsert({"id": uid}, on_conflict="id", ignore_duplicates=True)
            .execute()
        )

    await run_in_threadpool(_q)


async def update_profile(uid: str, patch: dict[str, Any]) -> None:
    if not patch:
        return

    def _q() -> Any:
        return get_supabase().table("profiles").update(patch).eq("id", uid).execute()

    await run_in_threadpool(_q)
