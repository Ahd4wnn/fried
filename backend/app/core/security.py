"""Authentication & authorization.

Verifies the Supabase JWT, resolves the user + role from `profiles`, and exposes
`require_role(...)` for role gating. The backend is the authority on role (RLS is
defense-in-depth).

Supabase signs user access tokens with asymmetric keys (ES256/RS256) by default
on current projects, and with the legacy HS256 shared secret on older ones. We
support both: pick the verification key by the token's `alg` — JWKS public key
for asymmetric algorithms, the configured secret for HS256.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any

import jwt
from fastapi import Depends, Request
from fastapi.concurrency import run_in_threadpool
from jwt import PyJWKClient
from pydantic import BaseModel

from app.core.config import get_settings
from app.core.errors import AppError
from app.services.profiles import fetch_profile

# Algorithms we will accept. (Never "none"; never let the token dictate an
# HS-vs-asymmetric confusion — we choose the key by alg below.)
_ASYMMETRIC_ALGS = frozenset({"ES256", "RS256"})
_ALLOWED_ALGS = _ASYMMETRIC_ALGS | {"HS256"}

_jwks_client: PyJWKClient | None = None


def _jwks() -> PyJWKClient:
    """Lazily-built, caching JWKS client for the project's signing keys."""
    global _jwks_client
    if _jwks_client is None:
        url = get_settings().SUPABASE_URL.rstrip("/") + "/auth/v1/.well-known/jwks.json"
        _jwks_client = PyJWKClient(url)
    return _jwks_client


class CurrentUser(BaseModel):
    id: str
    email: str | None = None
    role: str
    status: str
    display_name: str | None = None
    avatar_url: str | None = None
    locale: str = "en"


def _unauthorized() -> AppError:
    return AppError(
        "unauthorized",
        "Your session is invalid or has expired. Please sign in again.",
        401,
    )


async def _decode_token(token: str) -> dict[str, Any]:
    settings = get_settings()
    try:
        alg = jwt.get_unverified_header(token).get("alg", "")
    except jwt.PyJWTError as exc:
        raise _unauthorized() from exc

    if alg not in _ALLOWED_ALGS:
        raise AppError("unauthorized", "Your session uses an unsupported format.", 401)

    if alg == "HS256":
        if not settings.SUPABASE_JWT_SECRET:
            raise AppError(
                "server_misconfigured",
                "Authentication is not configured on the server.",
                500,
            )
        key: Any = settings.SUPABASE_JWT_SECRET
    else:
        # Asymmetric: fetch the matching public key from JWKS (cached; network
        # only on first use / key rotation, so run off the event loop).
        try:
            signing_key = await run_in_threadpool(_jwks().get_signing_key_from_jwt, token)
        except Exception as exc:  # JWKS fetch / key resolution failure
            raise _unauthorized() from exc
        key = signing_key.key

    try:
        return jwt.decode(token, key, algorithms=[alg], audience="authenticated")
    except jwt.PyJWTError as exc:  # expired, bad signature, wrong audience, …
        raise _unauthorized() from exc


async def get_current_user(request: Request) -> CurrentUser:
    """FastAPI dependency: the authenticated user, resolved from the JWT + DB."""
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        raise AppError("unauthorized", "You need to be signed in to do that.", 401)

    claims = await _decode_token(header[len("Bearer ") :].strip())
    uid = claims.get("sub")
    if not uid:
        raise AppError("unauthorized", "Your session is missing required details.", 401)

    if claims.get("aud") not in (None, "authenticated"):
        raise AppError("unauthorized", "Your session is not valid for this app.", 401)

    profile = await fetch_profile(uid)
    if profile is None:
        # The new-user trigger should have created this; treat as unauthenticated.
        raise AppError("profile_not_found", "We couldn’t find your account profile.", 404)

    return CurrentUser(
        id=uid,
        email=claims.get("email"),
        role=profile["role"],
        status=profile["status"],
        display_name=profile.get("display_name"),
        avatar_url=profile.get("avatar_url"),
        locale=profile.get("locale", "en"),
    )


def require_role(
    *roles: str,
) -> Callable[[CurrentUser], Awaitable[CurrentUser]]:
    """Dependency factory that allows only the given role(s)."""

    async def _dep(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        if user.role not in roles:
            raise AppError("forbidden", "You don’t have access to that.", 403)
        return user

    return _dep
