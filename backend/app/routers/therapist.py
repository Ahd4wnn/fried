"""FastAPI Router for Therapist Onboarding, Profiles, and Verifications."""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.concurrency import run_in_threadpool

from app.core.security import CurrentUser, require_role
from app.core.supabase import get_supabase
from app.schemas.therapist import (
    TherapistOnboardingSubmit,
    TherapistProfileResponse,
    TherapistProfileUpdate,
    VerificationRequestResponse,
)
from app.schemas.payments import TherapistEarningsResponse
from app.services.crypto import encrypt

logger = logging.getLogger("hovio.routers.therapist")

router = APIRouter(prefix="/api/v1/therapist", tags=["therapist"])


def parse_years(chip: str) -> int:
    # Handle en-dash (\u2013) vs hyphen
    clean = chip.replace("-", "–").strip()
    if clean == "<2":
        return 1
    elif clean == "2–5":
        return 3
    elif clean == "5–10":
        return 7
    elif clean == "10+":
        return 12
    return 0


@router.post("/onboarding")
async def onboarding(
    body: TherapistOnboardingSubmit,
    user: CurrentUser = Depends(require_role("therapist")),
) -> dict[str, str]:
    """Submit professional credentials and details to start manual verification."""
    sb = get_supabase()

    # 1. Enforce declarations are all accepted
    d = body.declarations
    if not (
        d.credentials_genuine
        and d.agree_terms_conduct
        and d.consent_data_processing
        and d.confirm_human_professional
    ):
        raise HTTPException(
            status_code=422,
            detail="You must accept all declarations to submit your onboarding.",
        )

    # 2. Envelope-encrypt sensitive PII
    # WhatsApp
    wa_cipher, wa_nonce = await encrypt(user.id, body.whatsapp_number)
    # Legal Name
    name_cipher, name_nonce = await encrypt(user.id, body.legal_name)
    # Registration Number (if present)
    reg_cipher = None
    reg_nonce = None
    if body.registration_number and body.registration_number.strip():
        reg_cipher, reg_nonce = await encrypt(user.id, body.registration_number.strip())

    # 3. Write public details to therapist_profiles
    def _update_profile() -> Any:
        profile_row = {
            "professional_title": body.professional_title,
            "years_experience": parse_years(body.years_experience),
            "session_modes": body.session_modes,
            "practice_setting": body.practice_setting,
            "bio": body.bio,
            "specializations": body.specializations,
            "languages": body.languages,
            "gender": body.gender,
            "price_inr": body.price_inr,
            "whatsapp_cipher": "\\x" + wa_cipher.hex(),
            "whatsapp_nonce": "\\x" + wa_nonce.hex(),
            "onboarding_submitted": True,
            "onboarding_completed": True,
        }
        return sb.table("therapist_profiles").update(profile_row).eq("id", user.id).execute()

    prof_res = await run_in_threadpool(_update_profile)
    if not prof_res.data:
        raise HTTPException(status_code=500, detail="Failed to save therapist profile.")

    # 4. Write claims to verification_requests
    def _insert_verification_request() -> Any:
        req_row = {
            "therapist_id": user.id,
            "status": "under_review",
            "legal_name_cipher": "\\x" + name_cipher.hex(),
            "legal_name_nonce": "\\x" + name_nonce.hex(),
            "registration_body": body.registration_body,
            "registration_number_cipher": ("\\x" + reg_cipher.hex()) if reg_cipher else None,
            "registration_number_nonce": ("\\x" + reg_nonce.hex()) if reg_nonce else None,
            "qualification": body.qualification,
            "institution": body.institution,
            "qualification_year": body.qualification_year,
            "submitted_at": datetime.now(UTC).isoformat(),
        }
        return sb.table("verification_requests").insert(req_row).execute()

    req_res = await run_in_threadpool(_insert_verification_request)
    if not req_res.data:
        # Revert profile submit flags
        def _revert() -> Any:
            return (
                sb.table("therapist_profiles")
                .update({"onboarding_submitted": False, "onboarding_completed": False})
                .eq("id", user.id)
                .execute()
            )

        await run_in_threadpool(_revert)
        raise HTTPException(status_code=500, detail="Failed to create verification request.")

    req_id = req_res.data[0]["id"]

    # 5. Write references to credential_docs
    if body.documents:
        doc_rows = []
        for doc in body.documents:
            doc_rows.append(
                {
                    "verification_request_id": req_id,
                    "therapist_id": user.id,
                    "doc_type": doc.doc_type,
                    "storage_path": doc.storage_path,
                }
            )

        def _insert_docs() -> Any:
            return sb.table("credential_docs").insert(doc_rows).execute()

        await run_in_threadpool(_insert_docs)

    return {
        "status": "under_review",
        "message": "Thanks — your application is in review. We verify every therapist manually and will be in touch.",
    }


@router.get("/verification", response_model=VerificationRequestResponse)
async def get_verification(
    user: CurrentUser = Depends(require_role("therapist")),
) -> VerificationRequestResponse:
    """Check the verification request status."""
    sb = get_supabase()

    def _fetch_req() -> Any:
        return (
            sb.table("verification_requests")
            .select("*")
            .eq("therapist_id", user.id)
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )

    res = await run_in_threadpool(_fetch_req)
    rows = res.data or []
    if not rows:
        raise HTTPException(status_code=404, detail="No verification request found.")

    req = rows[0]
    return VerificationRequestResponse(
        status=req["status"],
        registration_body=req.get("registration_body"),
        qualification=req.get("qualification"),
        institution=req.get("institution"),
        qualification_year=req.get("qualification_year"),
        submitted_at=req.get("submitted_at"),
        decision_notes=req.get("decision_notes"),
    )


@router.get("/profile", response_model=TherapistProfileResponse)
async def get_profile(
    user: CurrentUser = Depends(require_role("therapist")),
) -> TherapistProfileResponse:
    """Retrieve therapist's own profile."""
    sb = get_supabase()

    def _fetch_profile() -> Any:
        return sb.table("therapist_profiles").select("*").eq("id", user.id).limit(1).execute()

    res = await run_in_threadpool(_fetch_profile)
    rows = res.data or []
    if not rows:
        raise HTTPException(status_code=404, detail="Therapist profile not found.")

    p = rows[0]
    return TherapistProfileResponse(
        id=p["id"],
        bio=p.get("bio"),
        specializations=p.get("specializations", []),
        languages=p.get("languages", []),
        gender=p.get("gender"),
        price_inr=p.get("price_inr"),
        professional_title=p.get("professional_title"),
        years_experience=p.get("years_experience"),
        session_modes=p.get("session_modes", []),
        practice_setting=p.get("practice_setting"),
        verification_status=p["verification_status"],
        bookable=p["bookable"],
        onboarding_completed=p["onboarding_completed"],
    )


@router.patch("/profile", response_model=TherapistProfileResponse)
async def update_profile_endpoint(
    body: TherapistProfileUpdate,
    user: CurrentUser = Depends(require_role("therapist")),
) -> TherapistProfileResponse:
    """Update therapist public profile details (bio, modes, specializations, etc.)."""
    sb = get_supabase()

    # Build patch dictionary
    update_data: dict[str, Any] = {}
    if body.bio is not None:
        update_data["bio"] = body.bio
    if body.specializations is not None:
        update_data["specializations"] = body.specializations
    if body.languages is not None:
        update_data["languages"] = body.languages
    if body.session_modes is not None:
        update_data["session_modes"] = body.session_modes
    if body.price_inr is not None:
        update_data["price_inr"] = body.price_inr

    if not update_data:
        return await get_profile(user)

    def _apply_update() -> Any:
        return sb.table("therapist_profiles").update(update_data).eq("id", user.id).execute()

    res = await run_in_threadpool(_apply_update)
    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to update profile.")

    p = res.data[0]
    return TherapistProfileResponse(
        id=p["id"],
        bio=p.get("bio"),
        specializations=p.get("specializations", []),
        languages=p.get("languages", []),
        gender=p.get("gender"),
        price_inr=p.get("price_inr"),
        professional_title=p.get("professional_title"),
        years_experience=p.get("years_experience"),
        session_modes=p.get("session_modes", []),
        practice_setting=p.get("practice_setting"),
        verification_status=p["verification_status"],
        bookable=p["bookable"],
        onboarding_completed=p["onboarding_completed"],
    )


@router.get("/earnings", response_model=TherapistEarningsResponse)
async def get_therapist_earnings(
    user: CurrentUser = Depends(require_role("therapist")),
) -> TherapistEarningsResponse:
    """Fetch total earnings and payout status list for current therapist."""
    sb = get_supabase()

    def _fetch_earnings():
        return (
            sb.table("payouts")
            .select("*, payments!inner(booking_id, amount_paise, bookings!inner(starts_at, modality))")
            .eq("therapist_id", user.id)
            .execute()
        )

    payout_res = await run_in_threadpool(_fetch_earnings)
    payouts = payout_res.data or []

    total_earned = 0
    pending = 0
    paid = 0
    sessions = []

    from app.schemas.payments import EarningsSessionBrief

    for po in payouts:
        amt = po["amount_paise"]
        status = po["status"]

        if status != "failed":
            total_earned += amt

        if status in ("pending", "processing"):
            pending += amt
        elif status == "paid":
            paid += amt

        pay = po.get("payments", {})
        bk = pay.get("bookings", {}) if pay else {}

        sessions.append(
            EarningsSessionBrief(
                booking_id=pay.get("booking_id") if pay else "",
                starts_at=bk.get("starts_at") if bk else "",
                modality=bk.get("modality") if bk else "video",
                session_price_paise=pay.get("amount_paise") if pay else 0,
                therapist_gross_paise=amt,
                payout_status=status,
                payout_reference=po.get("reference"),
            )
        )

    sessions.sort(key=lambda s: s.starts_at, reverse=True)

    return TherapistEarningsResponse(
        total_earned_paise=total_earned,
        pending_payout_paise=pending,
        paid_payout_paise=paid,
        sessions=sessions,
    )

