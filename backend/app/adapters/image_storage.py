"""ImageStorage adapter — Cloudinary (public images only).

Posture (docs/integrations.md):
  - Public images (profile photos, avatars) → Cloudinary, signed server-side
    upload, behind this adapter interface.
  - Sensitive documents (credentials, IDs) → PRIVATE Supabase bucket. Never here.
  - Uploads are signed with server-only CLOUDINARY_* creds; the client never
    receives or uses these credentials (no unsigned presets).
  - Store only the resulting URL + public_id on the profile row.
  - DPDP erasure (Prompt 17): call CloudinaryImageStorage.delete(public_id) to
    remove the photo from the CDN before crypto-shredding the profile.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

import cloudinary
import cloudinary.api
import cloudinary.uploader

from app.core.config import get_settings


@dataclass(frozen=True)
class ImageUploadResult:
    """Result of a successful upload."""

    url: str  # HTTPS delivery URL (CDN-optimised, auto-format/quality)
    public_id: str  # Cloudinary asset identifier — persist for delete/transform


class ImageStorageAdapter(Protocol):
    """Swappable interface for public image storage (profile photos / avatars).

    Implementations must be signed and server-side only.
    """

    def upload(
        self,
        data: bytes,
        *,
        folder: str,
        public_id: str | None = None,
        transformation: dict | None = None,
    ) -> ImageUploadResult:
        """Upload raw image bytes into the given folder.

        Args:
            data: Raw image bytes (validated before calling).
            folder: Cloudinary folder path, e.g. ``"profiles/uid123"``.
            public_id: Optional explicit asset ID (useful for overwrites).
            transformation: Optional eager transformation dict.

        Returns:
            ``ImageUploadResult`` with the CDN URL and public_id.
        """
        ...

    def delete(self, public_id: str) -> None:
        """Permanently delete an asset by its public_id.

        Called by the DPDP erasure flow (Prompt 17) to ensure no face/photo is
        orphaned on the CDN after a user is forgotten.
        """
        ...

    def url(self, public_id: str, *, transformation: dict | None = None) -> str:
        """Build a CDN URL for an existing asset, optionally with transforms."""
        ...


class CloudinaryImageStorage:
    """Cloudinary-backed ImageStorageAdapter implementation.

    Initialised once at startup using server-only CLOUDINARY_* env vars.
    Never exposes the API key/secret to the client.
    """

    def __init__(self) -> None:
        cfg = get_settings()
        cloudinary.config(
            cloud_name=cfg.CLOUDINARY_CLOUD_NAME,
            api_key=cfg.CLOUDINARY_API_KEY,
            api_secret=cfg.CLOUDINARY_API_SECRET,
            secure=True,
        )

    def upload(
        self,
        data: bytes,
        *,
        folder: str,
        public_id: str | None = None,
        transformation: dict | None = None,
    ) -> ImageUploadResult:
        """Signed server-side upload.  No unsigned presets used."""
        kwargs: dict = {
            "folder": folder,
            "resource_type": "image",
            "overwrite": True,
        }
        if public_id:
            kwargs["public_id"] = public_id
        if transformation:
            kwargs["eager"] = [transformation]

        result = cloudinary.uploader.upload(data, **kwargs)
        return ImageUploadResult(
            url=result["secure_url"],
            public_id=result["public_id"],
        )

    def delete(self, public_id: str) -> None:
        """Permanently destroy an asset.

        # TODO(Prompt 17): this method is called from the DPDP erasure flow
        # to ensure no face/photo remains on the CDN after user deletion.
        """
        cloudinary.uploader.destroy(public_id, resource_type="image", invalidate=True)

    def url(self, public_id: str, *, transformation: dict | None = None) -> str:
        from cloudinary import CloudinaryImage

        img = CloudinaryImage(public_id)
        if transformation:
            return img.build_url(**transformation, secure=True)
        return img.build_url(secure=True)


# ---------------------------------------------------------------------------
# Module-level singleton — import this wherever the adapter is needed.
# ---------------------------------------------------------------------------
_image_storage: CloudinaryImageStorage | None = None


def get_image_storage() -> CloudinaryImageStorage:
    """Return the module-level CloudinaryImageStorage singleton."""
    global _image_storage  # noqa: PLW0603
    if _image_storage is None:
        _image_storage = CloudinaryImageStorage()
    return _image_storage
