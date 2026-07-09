"""Onboarding persistence (service-role).

Writes onboarding_responses, legal_acceptances, and consents, sets
seeker_profiles.onboarding_completed (only when not flagged), mirrors the
AI-memory consent, and audit-logs metadata only. Onboarding answer content is
NEVER logged. See docs/safety-and-privacy.md.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from fastapi.concurrency import run_in_threadpool

from app.core.errors import AppError
from app.core.supabase import get_supabase
from app.schemas.onboarding import OnboardingSubmit
from app.services.audit import write_audit

# Current legal document version recorded with each acceptance.
# TODO: source from app_config / a versioned legal doc store before launch.
LEGAL_DOC_VERSION = "2026-06-01"


async def get_supported_countries() -> list[str]:
    """Retrieve supported countries list from app_config table."""
    sb = get_supabase()
    try:

        def _q():
            return (
                sb.table("app_config")
                .select("value")
                .eq("key", "supported_countries")
                .limit(1)
                .execute()
            )

        res = await run_in_threadpool(_q)
        if res.data:
            return res.data[0]["value"].get("countries", ["IN"])
    except Exception:
        pass
    return ["IN"]


async def submit_onboarding(uid: str, data: OnboardingSubmit) -> dict[str, bool]:
    sb = get_supabase()

    # Validate country server-side
    supported = await get_supported_countries()
    if data.country not in supported:
        # Save country to profile anyway
        await run_in_threadpool(
            lambda: sb.table("profiles").update({"country": data.country}).eq("id", uid).execute()
        )
        raise AppError(
            "unsupported_country",
            "Hovio isn't available in your country yet — we've noted your interest and we'll be in touch as we expand.",
            422,
        )

    flagged = not data.suitability_none_apply
    completed = not flagged

    # Structured, non-sensitive answers go into the jsonb column.
    answers: dict[str, Any] = {
        "name": data.name.strip(),
        "country": data.country,
        "gender": data.gender,
        "gender_self_describe": data.gender_self_describe,
        "relationship_status": data.relationship_status,
        "tried_therapy": data.tried_therapy,
        "financial_situation": data.financial_situation,
        "referral_source": data.referral_source,
        "referral_other": data.referral_other,
        "occupation": data.occupation,
        "brought_here": data.concerns,
        "concerns_other": data.concerns_other,
        "support_system": data.support_system,
        "medication": data.medication,
        "preferred_language": data.preferred_language,
        "preferred_languages": data.preferred_languages,
        "preferred_language_other": data.preferred_language_other,
        "therapist_gender_preference": data.therapist_gender_preference,
    }

    # Only keep a WhatsApp number if WhatsApp notifications were consented.
    whatsapp = (
        data.whatsapp_number.strip()
        if data.consents.notifications_whatsapp and data.whatsapp_number
        else None
    )

    from app.services.crypto import encrypt_string_to_text

    response_row = {
        "user_id": uid,
        "answers": answers,
        "age": data.age,
        "past_therapy_note": await encrypt_string_to_text(uid, data.past_therapy_note),
        "therapist_should_know": await encrypt_string_to_text(uid, data.therapist_should_know),
        "whatsapp_number": await encrypt_string_to_text(uid, whatsapp),
        "suitability_attested": data.suitability_none_apply,
        "suitability_flagged": flagged,
        "completed_at": datetime.now(UTC).isoformat() if completed else None,
    }
    await run_in_threadpool(
        lambda: (
            sb.table("onboarding_responses").upsert(response_row, on_conflict="user_id").execute()
        )
    )

    # legal_acceptances is append-only (no unique constraint) — insert only the
    # doc types not already recorded for this version (idempotent).
    existing = await run_in_threadpool(
        lambda: (
            sb.table("legal_acceptances")
            .select("doc_type")
            .eq("user_id", uid)
            .eq("doc_version", LEGAL_DOC_VERSION)
            .execute()
        )
    )
    present = {r["doc_type"] for r in (existing.data or [])}
    to_insert = [
        {"user_id": uid, "doc_type": d, "doc_version": LEGAL_DOC_VERSION}
        for d in ("terms", "privacy")
        if d not in present
    ]
    if to_insert:
        await run_in_threadpool(lambda: sb.table("legal_acceptances").insert(to_insert).execute())

    consent_rows = [
        {"user_id": uid, "consent_type": "data_processing", "granted": True},
        {"user_id": uid, "consent_type": "ai_memory", "granted": data.consents.ai_memory},
        {
            "user_id": uid,
            "consent_type": "notifications_whatsapp",
            "granted": data.consents.notifications_whatsapp,
        },
        {
            "user_id": uid,
            "consent_type": "notifications_email",
            "granted": data.consents.notifications_email,
        },
    ]
    await run_in_threadpool(
        lambda: (
            sb.table("consents").upsert(consent_rows, on_conflict="user_id,consent_type").execute()
        )
    )

    # Mirror AI-memory consent and gate completion on suitability.
    await run_in_threadpool(
        lambda: (
            sb.table("seeker_profiles")
            .upsert(
                {
                    "id": uid,
                    "ai_memory_consent": data.consents.ai_memory,
                    "onboarding_completed": completed,
                },
                on_conflict="id",
            )
            .execute()
        )
    )

    profile_update = {"country": data.country}
    name = data.name.strip()
    if name:
        profile_update["display_name"] = name
    await run_in_threadpool(
        lambda: sb.table("profiles").update(profile_update).eq("id", uid).execute()
    )

    # Audit: metadata only — never any answer content.
    await write_audit(
        actor_id=uid,
        action="onboarding_submitted",
        target_table="onboarding_responses",
        target_id=uid,
        metadata={
            "suitability_flagged": flagged,
            "completed": completed,
            "ai_memory": data.consents.ai_memory,
            "notifications_whatsapp": data.consents.notifications_whatsapp,
            "notifications_email": data.consents.notifications_email,
        },
    )

    return {"onboarding_completed": completed, "suitability_flagged": flagged}
