"""Seeker onboarding endpoint — see docs/api-contract.md.

POST /onboarding accepts the full payload, validates server-side (never trusts
the client), persists responses/acceptances/consents, and completes onboarding
only when the seeker is suitable. Idempotent.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.core.errors import AppError
from app.core.security import CurrentUser, get_current_user
from app.schemas.onboarding import OnboardingResult, OnboardingSubmit
from app.services.onboarding import submit_onboarding

router = APIRouter(prefix="/api/v1", tags=["onboarding"])


@router.post("/onboarding", response_model=OnboardingResult)
async def post_onboarding(
    body: OnboardingSubmit,
    user: CurrentUser = Depends(get_current_user),
) -> OnboardingResult:
    if user.role != "seeker":
        raise AppError("forbidden", "Onboarding is for seeker accounts.", 403)

    # 18+ gate (defense-in-depth; the client off-ramps before reaching here).
    if body.age < 18:
        raise AppError(
            "underage",
            "Hovio is for adults aged 18 and over.",
            422,
        )

    agreement = body.agreement
    if not (agreement.age_confirmed and agreement.terms and agreement.privacy):
        raise AppError(
            "agreement_required",
            "Please confirm you’re 18 or older and accept the Terms and Privacy Policy.",
            422,
        )

    if not body.consents.data_processing:
        raise AppError(
            "consent_required",
            "Data-processing consent is required to use Hovio.",
            422,
        )

    if body.consents.notifications_whatsapp and not (
        body.whatsapp_number and body.whatsapp_number.strip()
    ):
        raise AppError(
            "whatsapp_number_required",
            "Add a WhatsApp number, or turn off WhatsApp updates.",
            422,
        )

    result = await submit_onboarding(user.id, body)
    return OnboardingResult(**result)
