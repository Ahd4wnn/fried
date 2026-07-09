"""Application configuration.

All backend env vars (see docs/integrations.md) load here through a single
typed Settings object. Local development boots with sensible defaults so the
skeleton runs out of the box; staging/production fail fast with a clear error
if a required secret is missing.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Secrets that must be present once we leave local development.
_REQUIRED_IN_PROD: tuple[str, ...] = (
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_JWT_SECRET",
    "OPENAI_API_KEY",
)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    # --- App ---
    APP_ENV: Literal["local", "staging", "production"] = "local"
    FRONTEND_ORIGIN: str = "http://localhost:5173"

    # --- Supabase ---
    SUPABASE_URL: str = ""
    SUPABASE_ANON_KEY: str = ""
    SUPABASE_SERVICE_ROLE_KEY: str = ""
    SUPABASE_JWT_SECRET: str = ""

    # --- OpenAI ---
    OPENAI_API_KEY: str = ""
    OPENAI_MODEL: str = "gpt-4o-mini"

    # --- LiveKit ---
    LIVEKIT_URL: str = ""
    LIVEKIT_API_KEY: str = ""
    LIVEKIT_API_SECRET: str = ""

    # --- Razorpay ---
    RAZORPAY_KEY_ID: str = ""
    RAZORPAY_KEY_SECRET: str = ""
    RAZORPAY_WEBHOOK_SECRET: str = ""

    # --- Interakt (WhatsApp) ---
    INTERAKT_API_KEY: str = ""
    INTERAKT_BASE_URL: str = ""

    # --- Email (transactional) ---
    EMAIL_PROVIDER_API_KEY: str = ""
    EMAIL_FROM: str = ""

    # --- Encryption / KMS ---
    KMS_MASTER_KEY_ID: str = ""

    # --- Cloudinary (public images only — profile photos / avatars) ---
    # Server-only credentials; never sent to the client.
    CLOUDINARY_CLOUD_NAME: str = ""
    CLOUDINARY_API_KEY: str = ""
    CLOUDINARY_API_SECRET: str = ""

    @property
    def is_local(self) -> bool:
        return self.APP_ENV == "local"

    @property
    def cors_origins(self) -> list[str]:
        return [origin for origin in (self.FRONTEND_ORIGIN,) if origin]

    @model_validator(mode="after")
    def _require_secrets_outside_local(self) -> Settings:
        if self.APP_ENV != "local":
            missing = [name for name in _REQUIRED_IN_PROD if not getattr(self, name)]
            if missing:
                raise ValueError(
                    "Missing required environment variables for "
                    f"APP_ENV={self.APP_ENV}: {', '.join(missing)}. "
                    "Set them in the environment or .env file."
                )
        return self


@lru_cache
def get_settings() -> Settings:
    """Cached settings singleton. Import this everywhere instead of reading os.environ."""
    return Settings()
