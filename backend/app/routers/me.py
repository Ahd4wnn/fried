"""Auth / profile endpoints — see docs/api-contract.md.

- GET   /me        profile + role + (stub) consents
- POST  /me/role   set role once at registration (idempotent; no changes after)
- PATCH /me        update display name / avatar / locale
"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.core.errors import AppError
from app.core.security import CurrentUser, get_current_user
from app.schemas.me import (
    MeConsents,
    MeResponse,
    SetRoleRequest,
    UpdateMeRequest,
)
from app.services.audit import write_audit
from app.services.profiles import (
    create_role_row,
    fetch_profile,
    fetch_role_row,
    get_assigned_role,
    set_profile_role,
    update_profile,
)

router = APIRouter(prefix="/api/v1", tags=["me"])

# Profile fields a user may update about themselves.
_EDITABLE_FIELDS = ("display_name", "avatar_url", "locale", "country")


async def _build_me(uid: str, email: str | None) -> MeResponse:
    """Assemble the /me view from the base profile + role-specific detail row."""
    profile = await fetch_profile(uid)
    if profile is None:
        raise AppError("profile_not_found", "We couldn’t find your account profile.", 404)

    role = profile["role"]
    role_row = await fetch_role_row(uid, role)
    role_set = (role_row is not None) or (role == "admin")
    onboarding_completed = bool(role_row["onboarding_completed"]) if role_row else (role == "admin")

    consents = MeConsents(
        ai_memory_consent=(
            bool(role_row.get("ai_memory_consent")) if role_row and role == "seeker" else None
        )
    )

    return MeResponse(
        id=uid,
        email=email,
        role=role,
        display_name=profile.get("display_name"),
        avatar_url=profile.get("avatar_url"),
        avatar_pending_url=profile.get("avatar_pending_url"),
        avatar_photo_status=profile.get("avatar_photo_status", "none"),
        locale=profile.get("locale", "en"),
        country=profile.get("country"),
        status=profile["status"],
        onboarding_completed=onboarding_completed,
        role_set=role_set,
        consents=consents,
    )


@router.get("/me", response_model=MeResponse)
async def get_me(user: CurrentUser = Depends(get_current_user)) -> MeResponse:
    return await _build_me(user.id, user.email)


@router.post("/me/role", response_model=MeResponse)
async def set_role(
    body: SetRoleRequest,
    user: CurrentUser = Depends(get_current_user),
) -> MeResponse:
    existing = await get_assigned_role(user.id)
    if existing is not None:
        if existing == body.role:
            # Idempotent: same role, no-op.
            return await _build_me(user.id, user.email)
        raise AppError(
            "role_already_set",
            f"Your role is already set to “{existing}” and can’t be changed.",
            409,
        )

    # First-time assignment: set the base role and create the detail row with
    # safe defaults (therapists are NOT verified/bookable here — admin-only).
    await set_profile_role(user.id, body.role)
    await create_role_row(user.id, body.role)
    await write_audit(
        actor_id=user.id,
        action="role_assigned",
        target_table="profiles",
        target_id=user.id,
        metadata={"role": body.role},
    )
    return await _build_me(user.id, user.email)


@router.patch("/me", response_model=MeResponse)
async def patch_me(
    body: UpdateMeRequest,
    user: CurrentUser = Depends(get_current_user),
) -> MeResponse:
    patch = {
        field: value
        for field, value in body.model_dump(exclude_unset=True).items()
        if field in _EDITABLE_FIELDS and value is not None
    }
    await update_profile(user.id, patch)
    return await _build_me(user.id, user.email)
