"""Service-role Supabase client (server-only).

The backend uses the service-role key for deliberate, audited cross-user work
(matching, summarization). It must NEVER be exposed to the browser — the
frontend uses the anon key + the user's JWT. The client is created lazily so the
app can boot in local development before credentials are configured.
"""

from __future__ import annotations

from functools import lru_cache

from supabase import Client, create_client

from app.core.config import get_settings


@lru_cache
def get_supabase() -> Client:
    """Return a cached service-role Supabase client.

    Raises a clear error if the required Supabase env vars are not set.
    """
    settings = get_settings()
    if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_ROLE_KEY:
        raise RuntimeError(
            "Supabase is not configured: set SUPABASE_URL and "
            "SUPABASE_SERVICE_ROLE_KEY before using the service-role client."
        )
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)
