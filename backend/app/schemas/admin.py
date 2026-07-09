"""Schemas for the admin portal endpoints (Prompt 10)."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class AdminKPIs(BaseModel):
    """Aggregate dashboard key performance indicators."""

    pending_verifications: int
    open_reports: int
    crisis_events_today: int
    active_users: int
    active_therapists: int


class TherapistProfileBrief(BaseModel):
    """Brief therapist metadata shown in queues."""

    display_name: str | None = None
    avatar_url: str | None = None
    professional_title: str | None = None
    years_experience: int | None = None
    specializations: list[str] = Field(default_factory=list)
    languages: list[str] = Field(default_factory=list)
    bio: str | None = None
    gender: str | None = None
    price_inr: int | None = None
    practice_setting: str | None = None


class VerificationRequestItem(BaseModel):
    """A therapist manual-verification submission in the admin queue."""

    id: str
    therapist_id: str
    status: str
    qualification: str | None = None
    institution: str | None = None
    qualification_year: int | None = None
    registration_body: str | None = None
    submitted_at: str | None = None
    created_at: str
    therapist_profile: TherapistProfileBrief


class VerificationDecryptRequest(BaseModel):
    """Reason parameter when requesting audited decryption of credentials."""

    reason: str | None = None


class CredentialDocBrief(BaseModel):
    """Document reference with short-lived signed download URL."""

    id: str
    doc_type: str
    signed_url: str


class VerificationDecryptResponse(BaseModel):
    """Decrypted therapist credentials details."""

    legal_name: str
    registration_number: str | None = None
    documents: list[CredentialDocBrief] = Field(default_factory=list)


class VerificationDecisionRequest(BaseModel):
    """Payload to record verification decision."""

    action: Literal["verify", "reject", "request_info"]
    decision_notes: str = Field(..., min_length=2, max_length=2000)


class ReportItem(BaseModel):
    """AI safety report item in list."""

    id: str
    reporter_id: str
    session_id: str | None = None
    message_id: str | None = None
    category: str
    status: str
    created_at: str


class ReportDecryptRequest(BaseModel):
    """Reason justification to decrypt a reported message."""

    reason: str | None = None


class ReportedMessageBrief(BaseModel):
    """Decrypted single reported message context."""

    role: str
    text: str
    created_at: str


class ReportDecryptResponse(BaseModel):
    """Decrypted reporter description and targeted chat message."""

    reporter_description: str | None = None
    reported_message: ReportedMessageBrief | None = None


class ReportResolveRequest(BaseModel):
    """Resolve/dismiss triage actions payload."""

    admin_notes: str = Field(..., min_length=2, max_length=2000)


class UserListItem(BaseModel):
    """Operational profile metadata for user administration."""

    id: str
    role: str
    display_name: str | None = None
    avatar_url: str | None = None
    locale: str
    status: str
    country: str | None = None
    created_at: str


class UserStatusRequest(BaseModel):
    """Action payload to suspend/reinstate user."""

    action: Literal["suspend", "reinstate"]
    reason: str | None = None


class CountryDemandItem(BaseModel):
    """Aggregated signup counts from unsupported countries."""

    country: str
    count: int


class CrisisEventAggregate(BaseModel):
    """Metadata-only safety events trend entry."""

    day: str
    category: str
    severity: str
    trigger_layer: str
    source: str
    event_count: int
