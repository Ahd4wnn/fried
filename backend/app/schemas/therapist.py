"""Schemas for therapist onboarding, profiles, and verification requests."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

CredentialDocType = Literal[
    "degree_certificate", "registration_certificate", "government_id", "profile_photo", "other"
]
GenderIdentity = Literal["male", "female", "non_binary", "prefer_not_to_say"]
VerificationStatus = Literal["pending", "under_review", "verified", "rejected", "suspended"]
SessionMode = Literal["video", "audio", "chat"]


class CredentialDocSubmit(BaseModel):
    doc_type: CredentialDocType
    storage_path: str


class OnboardingDeclarations(BaseModel):
    credentials_genuine: bool = Field(
        ..., description="Confirm credentials are genuine and current"
    )
    agree_terms_conduct: bool = Field(
        ..., description="Agree to Terms & professional code of conduct"
    )
    consent_data_processing: bool = Field(..., description="Consent to data processing")
    confirm_human_professional: bool = Field(
        ..., description="Confirm you are a real, qualified human professional"
    )


class TherapistOnboardingSubmit(BaseModel):
    legal_name: str = Field(..., min_length=2, max_length=120)
    whatsapp_number: str = Field(..., min_length=8, max_length=20)
    professional_title: str = Field(..., min_length=2, max_length=60)
    registration_body: str = Field(..., min_length=2, max_length=100)
    registration_number: str | None = Field(default=None, min_length=2, max_length=100)
    qualification: str = Field(..., min_length=2, max_length=120)
    institution: str = Field(..., min_length=2, max_length=120)
    qualification_year: int = Field(..., ge=1950, le=2100)
    years_experience: Literal["<2", "2–5", "5–10", "10+"]
    specializations: list[str] = Field(..., min_items=1)
    languages: list[str] = Field(..., min_items=1)
    gender: GenderIdentity
    session_modes: list[SessionMode] = Field(..., min_items=1)
    price_inr: int = Field(..., ge=0, le=100000)
    practice_setting: str = Field(..., min_length=2, max_length=120)
    bio: str = Field(..., min_length=10, max_length=2000)
    documents: list[CredentialDocSubmit] = Field(default=[])
    declarations: OnboardingDeclarations


class TherapistProfileUpdate(BaseModel):
    bio: str | None = Field(default=None, min_length=10, max_length=2000)
    specializations: list[str] | None = Field(default=None, min_items=1)
    languages: list[str] | None = Field(default=None, min_items=1)
    session_modes: list[SessionMode] | None = Field(default=None, min_items=1)
    price_inr: int | None = Field(default=None, ge=0, le=100000)


class TherapistProfileResponse(BaseModel):
    id: str
    bio: str | None = None
    specializations: list[str]
    languages: list[str]
    gender: GenderIdentity | None = None
    price_inr: int | None = None
    professional_title: str | None = None
    years_experience: int | None = None
    session_modes: list[SessionMode]
    practice_setting: str | None = None
    verification_status: VerificationStatus
    bookable: bool
    onboarding_completed: bool


class VerificationRequestResponse(BaseModel):
    status: VerificationStatus
    registration_body: str | None = None
    qualification: str | None = None
    institution: str | None = None
    qualification_year: int | None = None
    submitted_at: str | None = None
    decision_notes: str | None = None
