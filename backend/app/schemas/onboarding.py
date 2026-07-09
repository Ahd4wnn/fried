"""Schemas for seeker onboarding submission (POST /onboarding)."""

from __future__ import annotations

from pydantic import BaseModel, Field


class Agreement(BaseModel):
    age_confirmed: bool
    terms: bool
    privacy: bool


class ConsentChoices(BaseModel):
    data_processing: bool
    ai_memory: bool = False
    notifications_whatsapp: bool = False
    notifications_email: bool = False


class OnboardingSubmit(BaseModel):
    # Identity / structured answers
    name: str = Field(min_length=1, max_length=80)
    country: str = Field(min_length=2, max_length=2)
    age: int = Field(ge=0, le=120)
    gender: str = Field(max_length=40)
    gender_self_describe: str | None = Field(default=None, max_length=80)
    relationship_status: str = Field(max_length=40)
    tried_therapy: bool
    financial_situation: str = Field(max_length=40)
    referral_source: str = Field(max_length=40)
    referral_other: str | None = Field(default=None, max_length=120)
    occupation: str | None = Field(default=None, max_length=120)
    concerns: list[str] = Field(default_factory=list, max_length=20)
    concerns_other: str | None = Field(default=None, max_length=200)
    support_system: str = Field(max_length=40)
    medication: str = Field(max_length=40)
    preferred_language: str = Field(max_length=40)
    preferred_languages: list[str] = Field(default_factory=list, max_length=10)
    preferred_language_other: str | None = Field(default=None, max_length=80)
    therapist_gender_preference: str = Field(max_length=40)

    # Sensitive free-text (optional) — never logged.
    past_therapy_note: str | None = Field(default=None, max_length=2000)
    therapist_should_know: str | None = Field(default=None, max_length=2000)
    whatsapp_number: str | None = Field(default=None, max_length=20)

    agreement: Agreement
    consents: ConsentChoices

    # true = none of the out-of-scope conditions apply; false = one or more apply.
    suitability_none_apply: bool


class OnboardingResult(BaseModel):
    onboarding_completed: bool
    suitability_flagged: bool
