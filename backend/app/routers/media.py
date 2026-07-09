"""Media endpoints — signed server-side profile photo uploads.

POST /api/v1/media/profile-photo
  - Auth required (seeker or therapist).
  - Frontend sends multipart/form-data; this handler validates then uploads to
    Cloudinary via the ImageStorage adapter using server-only creds.
  - New/changed photos land in a PENDING moderation state; avatar_url (the
    publicly-visible field) is NOT updated until an admin approves.

PATCH /api/v1/admin/users/{uid}/avatar-status  (admin only)
  - Approve or reject a pending photo.
  - On approval: avatar_url ← avatar_pending_url, status → 'approved'.
  - On rejection: pending URL deleted from Cloudinary, status → 'rejected'.

delete_avatar(uid) — helper for DPDP erasure (Prompt 17).
  # TODO(Prompt 17): call delete_avatar(uid) from the erasure flow so no
  # face/photo is orphaned on the CDN after a user is forgotten.
"""

from __future__ import annotations

import io
import logging
from typing import Any, Literal

from fastapi import APIRouter, Depends, UploadFile
from fastapi.concurrency import run_in_threadpool
from PIL import Image

from app.adapters.image_storage import get_image_storage
from app.core.errors import AppError
from app.core.security import CurrentUser, get_current_user, require_role
from app.core.supabase import get_supabase

logger = logging.getLogger("hovio.routers.media")

router = APIRouter(prefix="/api/v1", tags=["media"])

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
_ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "image/webp"}
_MAX_SIZE_BYTES = 5 * 1024 * 1024  # 5 MB
_MAX_DIMENSION_PX = 4000  # either axis

AvatarStatus = Literal["none", "pending", "approved", "rejected"]

# Eager transformation applied at upload: square crop, 400 px, quality auto, format auto.
_PROFILE_TRANSFORM = {
    "width": 400,
    "height": 400,
    "crop": "fill",
    "gravity": "face",
    "fetch_format": "auto",
    "quality": "auto",
}


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _validate_image(data: bytes, content_type: str | None) -> None:
    """Raise AppError on invalid type, size, or dimensions."""
    if content_type not in _ALLOWED_MIME_TYPES:
        raise AppError(
            "invalid_image_type",
            f"Profile photos must be JPEG, PNG, or WebP (got {content_type!r}).",
            422,
        )
    if len(data) > _MAX_SIZE_BYTES:
        raise AppError(
            "image_too_large",
            f"Profile photo must be smaller than 5 MB (got {len(data) // 1024} KB).",
            422,
        )
    try:
        img = Image.open(io.BytesIO(data))
        w, h = img.size
        if w > _MAX_DIMENSION_PX or h > _MAX_DIMENSION_PX:
            raise AppError(
                "image_too_large",
                f"Photo dimensions must be ≤ {_MAX_DIMENSION_PX} px on each axis (got {w}×{h}).",
                422,
            )
    except AppError:
        raise
    except Exception as exc:
        raise AppError("invalid_image", "Could not read the uploaded image.", 422) from exc


async def _set_avatar_pending(uid: str, url: str, public_id: str) -> None:
    """Write pending avatar fields to profiles; do NOT touch avatar_url yet."""

    def _q() -> Any:
        return (
            get_supabase()
            .table("profiles")
            .update(
                {
                    "avatar_pending_url": url,
                    "avatar_public_id": public_id,
                    "avatar_photo_status": "pending",
                }
            )
            .eq("id", uid)
            .execute()
        )

    await run_in_threadpool(_q)


async def _fetch_profile_avatar(uid: str) -> dict[str, Any]:
    def _q() -> Any:
        return (
            get_supabase()
            .table("profiles")
            .select("avatar_public_id,avatar_pending_url,avatar_photo_status,avatar_url")
            .eq("id", uid)
            .limit(1)
            .execute()
        )

    res = await run_in_threadpool(_q)
    rows = res.data or []
    if not rows:
        raise AppError("profile_not_found", "Profile not found.", 404)
    return rows[0]


# ---------------------------------------------------------------------------
# POST /api/v1/media/profile-photo
# ---------------------------------------------------------------------------


@router.post("/media/profile-photo")
async def upload_profile_photo(
    file: UploadFile,
    user: CurrentUser = Depends(get_current_user),
) -> dict[str, str]:
    """Upload a profile photo (signed, server-side — never direct-to-Cloudinary).

    The image lands in a *pending* state and is NOT publicly visible until an
    admin approves it (PATCH /api/v1/admin/users/{uid}/avatar-status).
    """
    data = await file.read()
    _validate_image(data, file.content_type)

    storage = get_image_storage()
    folder = f"profiles/{user.id}"
    public_id = f"{folder}/avatar"  # deterministic → overwrites previous pending upload

    def _upload() -> Any:
        return storage.upload(
            data,
            folder=folder,
            public_id=public_id,
            transformation=_PROFILE_TRANSFORM,
        )

    result = await run_in_threadpool(_upload)

    await _set_avatar_pending(user.id, result.url, result.public_id)

    logger.info("profile_photo_pending uid=%s public_id=%s", user.id, result.public_id)
    return {
        "status": "pending",
        "message": "Photo uploaded and is pending moderation. It will be visible once approved.",
    }


# ---------------------------------------------------------------------------
# PATCH /api/v1/admin/users/{uid}/avatar-status  (admin moderation gate)
# ---------------------------------------------------------------------------


@router.patch("/admin/users/{uid}/avatar-status")
async def moderate_avatar(
    uid: str,
    action: Literal["approve", "reject"],
    _admin: CurrentUser = Depends(require_role("admin")),
) -> dict[str, str]:
    """Approve or reject a pending profile photo (admin only).

    Approve: copies avatar_pending_url → avatar_url (now publicly visible).
    Reject:  deletes the Cloudinary asset, clears pending fields.
    """
    profile = await _fetch_profile_avatar(uid)

    if profile.get("avatar_photo_status") != "pending":
        raise AppError("no_pending_photo", "No photo is currently pending moderation.", 409)

    pending_url = profile.get("avatar_pending_url")
    public_id = profile.get("avatar_public_id")

    storage = get_image_storage()

    if action == "approve":

        def _approve() -> Any:
            return (
                get_supabase()
                .table("profiles")
                .update(
                    {
                        "avatar_url": pending_url,
                        "avatar_pending_url": None,
                        "avatar_photo_status": "approved",
                    }
                )
                .eq("id", uid)
                .execute()
            )

        await run_in_threadpool(_approve)
        logger.info("avatar_approved uid=%s", uid)
        return {"status": "approved"}

    else:  # reject
        if public_id:
            await run_in_threadpool(lambda: storage.delete(public_id))

        def _reject() -> Any:
            return (
                get_supabase()
                .table("profiles")
                .update(
                    {
                        "avatar_pending_url": None,
                        "avatar_public_id": None,
                        "avatar_photo_status": "rejected",
                    }
                )
                .eq("id", uid)
                .execute()
            )

        await run_in_threadpool(_reject)
        logger.info("avatar_rejected uid=%s", uid)
        return {"status": "rejected"}


# ---------------------------------------------------------------------------
# DPDP erasure helper (Prompt 17)
# ---------------------------------------------------------------------------


async def delete_avatar(uid: str) -> None:
    """Remove the user's Cloudinary photo and clear all avatar fields on profiles.

    # TODO(Prompt 17): call this function from the DPDP/erasure flow so no
    # face/photo is orphaned on the CDN after a user is forgotten.
    """
    profile = await _fetch_profile_avatar(uid)
    public_id = profile.get("avatar_public_id")

    if public_id:
        storage = get_image_storage()
        await run_in_threadpool(lambda: storage.delete(public_id))
        logger.info("avatar_deleted_for_erasure uid=%s public_id=%s", uid, public_id)

    def _clear() -> Any:
        return (
            get_supabase()
            .table("profiles")
            .update(
                {
                    "avatar_url": None,
                    "avatar_pending_url": None,
                    "avatar_public_id": None,
                    "avatar_photo_status": "none",
                }
            )
            .eq("id", uid)
            .execute()
        )

    await run_in_threadpool(_clear)
