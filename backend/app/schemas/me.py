"""Schemas for the auth/profile endpoints (GET/POST/PATCH /me)."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

Role = Literal["seeker", "therapist", "admin"]
AssignableRole = Literal["seeker", "therapist"]


class MeConsents(BaseModel):
    """Stub consent view — expanded in Prompt 4 (legal_acceptances/consents).

    Only `ai_memory_consent` is real today (seeker_profiles); the rest are
    placeholders so the frontend shape is stable.
    """

    ai_memory_consent: bool | None = None
    intake_sharing: bool | None = None
    notifications: bool | None = None


class MeResponse(BaseModel):
    id: str
    email: str | None = None
    role: Role
    display_name: str | None = None
    avatar_url: str | None = None
    avatar_pending_url: str | None = None
    avatar_photo_status: str = "none"
    locale: str = "en"
    country: str | None = None
    status: str
    # From the role-specific detail row; false until onboarding (Prompt 4).
    onboarding_completed: bool = False
    # True once the user has deliberately chosen a role (detail row exists).
    role_set: bool = False
    consents: MeConsents = Field(default_factory=MeConsents)


class SetRoleRequest(BaseModel):
    role: AssignableRole


class UpdateMeRequest(BaseModel):
    display_name: str | None = Field(default=None, max_length=120)
    avatar_url: str | None = Field(default=None, max_length=2048)
    locale: str | None = Field(default=None, max_length=10)
    country: str | None = Field(default=None, max_length=2)
