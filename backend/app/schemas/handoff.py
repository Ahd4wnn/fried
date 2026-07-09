"""Schemas for AI-to-Human Handoff & Matching."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class EscalationConfirmResponse(BaseModel):
    escalation_id: str
    status: str


class ConsentRequest(BaseModel):
    seeker_note: str | None = Field(default=None, max_length=2000)


class InvitationRespondRequest(BaseModel):
    action: Literal["accept", "decline"]


class TherapistInvitationResponse(BaseModel):
    """Pending/answered invitation view for therapists (non-identifying card only)."""

    id: str
    escalation_id: str
    status: str
    specializations: list[str]
    language: str | None
    gender_preference: str | None
    price_ceiling_inr: int | None
    need_description: str | None  # decrypted in-process
    invited_at: datetime
    responded_at: datetime | None
    expires_at: datetime | None


class SeekerInvitationResponse(BaseModel):
    """Accepted invitation view for seekers (public therapist profile details)."""

    id: str
    status: str
    therapist_id: str
    display_name: str | None
    bio: str | None
    specializations: list[str]
    languages: list[str]
    gender: str | None
    price_inr: int | None
    invited_at: datetime
    responded_at: datetime | None


class DecryptedSummaryResponse(BaseModel):
    """Decrypted intake summary details for the selected therapist."""

    escalation_id: str
    seeker_id: str
    summary: str
    share_consented_at: datetime | None
    shared_at: datetime | None
