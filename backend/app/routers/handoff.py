"""FastAPI Router for AI-to-Human Handoff & Matching."""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.concurrency import run_in_threadpool

from app.core.errors import AppError
from app.core.security import CurrentUser, get_current_user, require_role
from app.core.supabase import get_supabase
from app.schemas.handoff import (
    ConsentRequest,
    DecryptedSummaryResponse,
    EscalationConfirmResponse,
    SeekerInvitationResponse,
    TherapistInvitationResponse,
)
from app.services.agents.handoff import run_matcher, run_summarizer
from app.services.audit import write_audit
from app.services.crypto import decrypt, encrypt, parse_bytea

logger = logging.getLogger("hovio.routers.handoff")

router = APIRouter(prefix="/api/v1/handoff", tags=["handoff"])


@router.post("/escalations/{sessionId}/confirm", response_model=EscalationConfirmResponse)
async def confirm_escalation(
    sessionId: str,
    background_tasks: BackgroundTasks,
    user: CurrentUser = Depends(require_role("seeker")),
) -> EscalationConfirmResponse:
    """Confirm a suggested escalation, generate summary, and kick off matcher."""
    sb = get_supabase()

    # 1. Fetch the active session
    def _fetch_session() -> Any:
        return sb.table("ai_sessions").select("*").eq("id", sessionId).limit(1).execute()

    session_res = await run_in_threadpool(_fetch_session)
    session_rows = session_res.data or []
    if not session_rows:
        raise HTTPException(status_code=404, detail="Session not found")

    session = session_rows[0]
    if session["user_id"] != user.id:
        raise HTTPException(status_code=403, detail="Forbidden")

    # 2. Find or create escalations row
    def _fetch_escalation() -> Any:
        return (
            sb.table("escalations")
            .select("*")
            .eq("session_id", sessionId)
            .eq("status", "suggested")
            .limit(1)
            .execute()
        )

    esc_res = await run_in_threadpool(_fetch_escalation)
    esc_rows = esc_res.data or []

    if esc_rows:
        escalation_id = esc_rows[0]["id"]

        def _update_escalation() -> Any:
            return (
                sb.table("escalations")
                .update({"status": "confirmed", "confirmed_at": datetime.now(UTC).isoformat()})
                .eq("id", escalation_id)
                .execute()
            )

        await run_in_threadpool(_update_escalation)
    else:
        # Create a confirmed escalation directly
        def _create_escalation() -> Any:
            row = {
                "seeker_id": user.id,
                "session_id": sessionId,
                "status": "confirmed",
                "confirmed_at": datetime.now(UTC).isoformat(),
                "suggested_at": datetime.now(UTC).isoformat(),
            }
            return sb.table("escalations").insert(row).execute()

        ins_res = await run_in_threadpool(_create_escalation)
        if not ins_res.data:
            raise HTTPException(status_code=500, detail="Failed to create escalation")
        escalation_id = ins_res.data[0]["id"]

    # 3. Generate summary synchronously in-process
    try:
        summary_text = await run_summarizer(user.id, escalation_id, sessionId)
    except Exception as e:
        logger.error("Failed to run summarizer during confirm: %s", e)

        # Revert status to let them retry
        def _revert() -> Any:
            return (
                sb.table("escalations")
                .update({"status": "suggested"})
                .eq("id", escalation_id)
                .execute()
            )

        await run_in_threadpool(_revert)
        raise HTTPException(status_code=500, detail=f"Failed to generate summary: {e}")

    # 4. Run matcher in background task
    background_tasks.add_task(run_matcher, user.id, escalation_id, summary_text)

    return EscalationConfirmResponse(
        escalation_id=escalation_id,
        status="confirmed",
    )


@router.post("/summaries/{escalationId}/consent")
async def consent_summary(
    escalationId: str,
    body: ConsentRequest,
    user: CurrentUser = Depends(require_role("seeker")),
) -> dict[str, str]:
    """Provide consent to share the intake summary, optionally appending a seeker note."""
    sb = get_supabase()

    # 1. Fetch intake summary
    def _fetch_summary() -> Any:
        return (
            sb.table("intake_summaries")
            .select("*")
            .eq("escalation_id", escalationId)
            .limit(1)
            .execute()
        )

    res = await run_in_threadpool(_fetch_summary)
    rows = res.data or []
    if not rows:
        raise HTTPException(status_code=404, detail="Intake summary not found")

    summary_row = rows[0]
    if summary_row["seeker_id"] != user.id:
        raise HTTPException(status_code=403, detail="Forbidden")

    # 2. Append seeker note if present
    if body.seeker_note and body.seeker_note.strip():
        # Decrypt, append, re-encrypt
        cipher_bytes = parse_bytea(summary_row["summary_cipher"])
        nonce_bytes = parse_bytea(summary_row["summary_nonce"])
        plaintext = await decrypt(user.id, cipher_bytes, nonce_bytes)

        updated_text = f"{plaintext}\n\nSeeker Note: {body.seeker_note.strip()}"
        new_cipher, new_nonce = await encrypt(user.id, updated_text)

        def _update_summary() -> Any:
            return (
                sb.table("intake_summaries")
                .update(
                    {
                        "summary_cipher": "\\x" + new_cipher.hex(),
                        "summary_nonce": "\\x" + new_nonce.hex(),
                        "share_consented_at": datetime.now(UTC).isoformat(),
                    }
                )
                .eq("escalation_id", escalationId)
                .execute()
            )

        await run_in_threadpool(_update_summary)
    else:

        def _consent_only() -> Any:
            return (
                sb.table("intake_summaries")
                .update({"share_consented_at": datetime.now(UTC).isoformat()})
                .eq("escalation_id", escalationId)
                .execute()
            )

        await run_in_threadpool(_consent_only)

    return {"status": "consented"}


@router.get("/invitations")
async def list_invitations(
    user: CurrentUser = Depends(get_current_user),
) -> list[SeekerInvitationResponse] | list[TherapistInvitationResponse]:
    """List pending invitations (for therapist) or accepted invitations (for seeker)."""
    sb = get_supabase()

    if user.role == "therapist":
        # Therapist view: pending invitations (status='invited')
        def _fetch_therapist_invitations() -> Any:
            return (
                sb.table("therapist_invitations")
                .select("*, escalations!inner(seeker_id), match_criteria!inner(*)")
                .eq("therapist_id", user.id)
                .execute()
            )

        res = await run_in_threadpool(_fetch_therapist_invitations)
        invitations = res.data or []

        result = []
        for inv in invitations:
            # Decrypt request_cipher (non-identifying need line) using seeker_id
            seeker_id = inv["escalations"]["seeker_id"]
            need_desc = None
            mc = inv.get("match_criteria")
            if mc and mc.get("request_cipher") and mc.get("request_nonce"):
                try:
                    cipher = parse_bytea(mc["request_cipher"])
                    nonce = parse_bytea(mc["request_nonce"])
                    need_desc = await decrypt(seeker_id, cipher, nonce)
                except Exception as e:
                    logger.error("Failed to decrypt invitation need line: %s", e)
                    need_desc = "[Decryption Failed]"

            result.append(
                TherapistInvitationResponse(
                    id=inv["id"],
                    escalation_id=inv["escalation_id"],
                    status=inv["status"],
                    specializations=mc.get("specializations", []) if mc else [],
                    language=mc.get("language") if mc else None,
                    gender_preference=mc.get("gender_preference") if mc else None,
                    price_ceiling_inr=mc.get("price_ceiling_inr") if mc else None,
                    need_description=need_desc,
                    invited_at=datetime.fromisoformat(inv["invited_at"]),
                    responded_at=datetime.fromisoformat(inv["responded_at"])
                    if inv.get("responded_at")
                    else None,
                    expires_at=datetime.fromisoformat(inv["expires_at"])
                    if inv.get("expires_at")
                    else None,
                )
            )
        return result

    elif user.role == "seeker":
        # Seeker view: accepted invitations (status='accepted') on their latest escalation
        def _fetch_seeker_latest_escalation() -> Any:
            return (
                sb.table("escalations")
                .select("id")
                .eq("seeker_id", user.id)
                .order("created_at", desc=True)
                .limit(1)
                .execute()
            )

        esc_res = await run_in_threadpool(_fetch_seeker_latest_escalation)
        esc_rows = esc_res.data or []
        if not esc_rows:
            return []

        escalation_id = esc_rows[0]["id"]

        def _fetch_seeker_invitations() -> Any:
            return (
                sb.table("therapist_invitations")
                .select("*, therapist_profiles!inner(*, profiles!inner(display_name))")
                .eq("escalation_id", escalation_id)
                .eq("status", "accepted")
                .execute()
            )

        inv_res = await run_in_threadpool(_fetch_seeker_invitations)
        invitations = inv_res.data or []

        result = []
        for inv in invitations:
            tp = inv["therapist_profiles"]
            p = tp["profiles"]
            result.append(
                SeekerInvitationResponse(
                    id=inv["id"],
                    status=inv["status"],
                    therapist_id=inv["therapist_id"],
                    display_name=p.get("display_name"),
                    bio=tp.get("bio"),
                    specializations=tp.get("specializations", []),
                    languages=tp.get("languages", []),
                    gender=tp.get("gender"),
                    price_inr=tp.get("price_inr"),
                    invited_at=datetime.fromisoformat(inv["invited_at"]),
                    responded_at=datetime.fromisoformat(inv["responded_at"])
                    if inv.get("responded_at")
                    else None,
                )
            )
        return result

    else:
        raise AppError("forbidden", "Role not supported.", 403)


@router.post("/invitations/{id}/accept")
async def accept_invitation(
    id: str,
    user: CurrentUser = Depends(require_role("therapist")),
) -> dict[str, str]:
    """Therapist accepts the invitation."""
    sb = get_supabase()

    # Verify ownership
    def _fetch_inv() -> Any:
        return sb.table("therapist_invitations").select("*").eq("id", id).limit(1).execute()

    res = await run_in_threadpool(_fetch_inv)
    rows = res.data or []
    if not rows:
        raise HTTPException(status_code=404, detail="Invitation not found")

    inv = rows[0]
    if inv["therapist_id"] != user.id:
        raise HTTPException(status_code=403, detail="Forbidden")

    if inv["status"] != "invited":
        raise AppError("invalid_status", f"Cannot accept invitation in status {inv['status']}", 400)

    def _accept() -> Any:
        return (
            sb.table("therapist_invitations")
            .update({"status": "accepted", "responded_at": datetime.now(UTC).isoformat()})
            .eq("id", id)
            .execute()
        )

    await run_in_threadpool(_accept)
    return {"status": "accepted"}


@router.post("/invitations/{id}/decline")
async def decline_invitation(
    id: str,
    user: CurrentUser = Depends(require_role("therapist")),
) -> dict[str, str]:
    """Therapist declines the invitation."""
    sb = get_supabase()

    # Verify ownership
    def _fetch_inv() -> Any:
        return sb.table("therapist_invitations").select("*").eq("id", id).limit(1).execute()

    res = await run_in_threadpool(_fetch_inv)
    rows = res.data or []
    if not rows:
        raise HTTPException(status_code=404, detail="Invitation not found")

    inv = rows[0]
    if inv["therapist_id"] != user.id:
        raise HTTPException(status_code=403, detail="Forbidden")

    if inv["status"] != "invited":
        raise AppError(
            "invalid_status", f"Cannot decline invitation in status {inv['status']}", 400
        )

    def _decline() -> Any:
        return (
            sb.table("therapist_invitations")
            .update({"status": "declined", "responded_at": datetime.now(UTC).isoformat()})
            .eq("id", id)
            .execute()
        )

    await run_in_threadpool(_decline)
    return {"status": "declined"}


@router.post("/invitations/{id}/select")
async def select_invitation(
    id: str,
    user: CurrentUser = Depends(require_role("seeker")),
) -> dict[str, str]:
    """Seeker selects therapist from an accepted invitation."""
    sb = get_supabase()

    # 1. Fetch invitation and verify owner
    def _fetch_inv() -> Any:
        return (
            sb.table("therapist_invitations")
            .select("*, escalations!inner(seeker_id)")
            .eq("id", id)
            .limit(1)
            .execute()
        )

    res = await run_in_threadpool(_fetch_inv)
    rows = res.data or []
    if not rows:
        raise HTTPException(status_code=404, detail="Invitation not found")

    inv = rows[0]
    escalation = inv["escalations"]
    if escalation["seeker_id"] != user.id:
        raise HTTPException(status_code=403, detail="Forbidden")

    if inv["status"] != "accepted":
        raise AppError(
            "invalid_status", "Can only select therapists who accepted your invitation.", 400
        )

    therapist_id = inv["therapist_id"]
    escalation_id = inv["escalation_id"]

    # 2. Update escalation
    def _update_escalation() -> Any:
        return (
            sb.table("escalations")
            .update(
                {
                    "status": "therapist_selected",
                    "selected_therapist_id": therapist_id,
                }
            )
            .eq("id", escalation_id)
            .execute()
        )

    await run_in_threadpool(_update_escalation)

    # 3. Check summary consent
    def _fetch_summary() -> Any:
        return (
            sb.table("intake_summaries")
            .select("share_consented_at")
            .eq("escalation_id", escalation_id)
            .limit(1)
            .execute()
        )

    summary_res = await run_in_threadpool(_fetch_summary)
    summary_rows = summary_res.data or []

    # If consented, release the intake summary to therapist
    if summary_rows and summary_rows[0].get("share_consented_at"):

        def _release_summary() -> Any:
            return (
                sb.table("intake_summaries")
                .update(
                    {
                        "shared_with_therapist_id": therapist_id,
                        "shared_at": datetime.now(UTC).isoformat(),
                    }
                )
                .eq("escalation_id", escalation_id)
                .execute()
            )

        await run_in_threadpool(_release_summary)

    return {"status": "selected"}


@router.get("/summaries/{escalationId}", response_model=DecryptedSummaryResponse)
async def get_shared_summary(
    escalationId: str,
    user: CurrentUser = Depends(get_current_user),
) -> DecryptedSummaryResponse:
    """Decrypted intake summary (Audited server-side decryption)."""
    sb = get_supabase()

    # 1. Fetch intake summary
    def _fetch_summary() -> Any:
        return (
            sb.table("intake_summaries")
            .select("*")
            .eq("escalation_id", escalationId)
            .limit(1)
            .execute()
        )

    res = await run_in_threadpool(_fetch_summary)
    rows = res.data or []
    if not rows:
        raise HTTPException(status_code=404, detail="Intake summary not found")

    summary_row = rows[0]

    # Verify sharing / ownership
    is_seeker_owner = user.role == "seeker" and summary_row["seeker_id"] == user.id
    is_shared_therapist = (
        user.role == "therapist" and summary_row["shared_with_therapist_id"] == user.id
    )

    if not (is_seeker_owner or is_shared_therapist):
        raise HTTPException(
            status_code=403, detail="Forbidden: You do not have access to this intake summary."
        )

    # 2. Decrypt in-process
    seeker_id = summary_row["seeker_id"]
    cipher_bytes = parse_bytea(summary_row["summary_cipher"])
    nonce_bytes = parse_bytea(summary_row["summary_nonce"])
    summary_text = await decrypt(seeker_id, cipher_bytes, nonce_bytes)

    # 3. Write audit log entry for therapist access
    if user.role == "therapist":
        await write_audit(
            actor_id=user.id,
            action="intake_summary_accessed",
            target_table="intake_summaries",
            target_id=escalationId,
            metadata={
                "seeker_id": seeker_id,
            },
        )

    return DecryptedSummaryResponse(
        escalation_id=escalationId,
        seeker_id=seeker_id,
        summary=summary_text,
        share_consented_at=datetime.fromisoformat(summary_row["share_consented_at"])
        if summary_row.get("share_consented_at")
        else None,
        shared_at=datetime.fromisoformat(summary_row["shared_at"])
        if summary_row.get("shared_at")
        else None,
    )
