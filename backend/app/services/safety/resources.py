"""Safety helpline resources service.

Retrieves and caches the verified crisis helpline configurations from Supabase.
"""

from __future__ import annotations

import time
from typing import Any

from fastapi.concurrency import run_in_threadpool

from app.core.config import get_settings
from app.core.logging import get_logger
from app.core.supabase import get_supabase

logger = get_logger("hovio.safety")

_helpline_cache: dict[str, Any] | None = None
_helpline_cache_expiry: float = 0.0
CACHE_TTL = 300.0  # 5 minutes


# Hardcoded fallback helplines if Supabase is unavailable
FALLBACK_HELPLINES = {
    "verified": False,
    "region": "IN",
    "helplines": [
        {
            "name": "Tele-MANAS (Govt of India)",
            "numbers": ["14416", "1800-891-4416"],
            "hours": "24x7",
        },
        {
            "name": "Vandrevala Foundation",
            "numbers": ["1860-2662-345", "1800-2333-330"],
            "hours": "24x7",
        },
        {
            "name": "iCall (TISS)",
            "numbers": ["9152987821"],
            "hours": "Mon-Sat 8am-10pm",
        },
        {
            "name": "AASRA",
            "numbers": ["9820466726"],
            "hours": "24x7",
        },
    ],
}


async def get_helplines() -> dict[str, Any]:
    """Retrieve verified helplines config from app_config, cached with fallback."""
    global _helpline_cache, _helpline_cache_expiry
    now = time.time()

    if _helpline_cache is not None and now < _helpline_cache_expiry:
        # Check verified warning in non-prod
        _check_verification_status(_helpline_cache)
        return _helpline_cache

    try:

        def _q():
            return (
                get_supabase()
                .table("app_config")
                .select("value")
                .eq("key", "crisis_helplines")
                .limit(1)
                .execute()
            )

        res = await run_in_threadpool(_q)
        if res.data:
            data = res.data[0]["value"]
            _helpline_cache = data
            _helpline_cache_expiry = now + CACHE_TTL
            _check_verification_status(data)
            return data
    except Exception as e:
        logger.error("Failed to load crisis helplines from Supabase, falling back: %s", e)

    # Use hardcoded fallback in case of failure
    _check_verification_status(FALLBACK_HELPLINES)
    return FALLBACK_HELPLINES


def _check_verification_status(data: dict[str, Any]) -> None:
    """Warn in non-prod environments if helplines are unverified."""
    settings = get_settings()
    if not data.get("verified", False) and settings.APP_ENV != "production":
        logger.warning(
            "CRITICAL: Crisis helplines in app_config are currently marked as UNVERIFIED. "
            "Verify all numbers against official sources before launch."
        )
