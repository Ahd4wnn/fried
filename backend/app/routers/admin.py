"""FastAPI Router for Hovio Admin Portal (Prompt 10)."""

from __future__ import annotations

import logging
from datetime import UTC, datetime, time
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.concurrency import run_in_threadpool

from app.core.security import CurrentUser, require_role
from app.core.supabase import get_supabase
from app.schemas.admin import (
    AdminKPIs,
    CountryDemandItem,
    CredentialDocBrief,
    CrisisEventAggregate,
    ReportDecryptRequest,
    ReportDecryptResponse,
    ReportedMessageBrief,
    ReportItem,
    ReportResolveRequest,
    TherapistProfileBrief,
    UserListItem,
    UserStatusRequest,
    VerificationDecisionRequest,
    VerificationDecryptRequest,
    VerificationDecryptResponse,
    VerificationRequestItem,
)
from app.schemas.payments import AdminPaymentsResponse, AdminRefundRequest
from app.adapters.payments import RazorpayAdapter
from app.services.audit import write_audit
from app.services.crypto import decrypt, parse_bytea

logger = logging.getLogger("hovio.routers.admin")

router = APIRouter(
    prefix="/api/v1/admin",
    tags=["admin"],
    dependencies=[Depends(require_role("admin"))],
)


# ---------------------------------------------------------------------------
# GET /api/v1/admin/kpis
# ---------------------------------------------------------------------------


@router.get("/kpis", response_model=AdminKPIs)
async def get_kpis() -> AdminKPIs:
    """Return dashboard KPI card aggregate metrics."""
    sb = get_supabase()

    # 1. Pending/Under review verifications
    def _pending_verifications() -> Any:
        return (
            sb.table("verification_requests")
            .select("id", count="exact")
            .in_("status", ["pending", "under_review"])
            .execute()
        )

    # 2. Open reports
    def _open_reports() -> Any:
        return sb.table("ai_reports").select("id", count="exact").eq("status", "open").execute()

    # 3. Crisis events today
    def _crisis_today() -> Any:
        today_start = datetime.combine(datetime.now(UTC).date(), time.min).isoformat()
        return (
            sb.table("crisis_events")
            .select("id", count="exact")
            .gte("created_at", today_start)
            .execute()
        )

    # 4. Active seekers
    def _active_seekers() -> Any:
        return (
            sb.table("profiles")
            .select("id", count="exact")
            .eq("role", "seeker")
            .eq("status", "active")
            .execute()
        )

    # 5. Active (verified) therapists
    def _active_therapists() -> Any:
        return (
            sb.table("therapist_profiles")
            .select("id", count="exact")
            .eq("verification_status", "verified")
            .execute()
        )

    p_v_res = await run_in_threadpool(_pending_verifications)
    o_r_res = await run_in_threadpool(_open_reports)
    c_t_res = await run_in_threadpool(_crisis_today)
    a_s_res = await run_in_threadpool(_active_seekers)
    a_t_res = await run_in_threadpool(_active_therapists)

    return AdminKPIs(
        pending_verifications=p_v_res.count or 0,
        open_reports=o_r_res.count or 0,
        crisis_events_today=c_t_res.count or 0,
        active_users=a_s_res.count or 0,
        active_therapists=a_t_res.count or 0,
    )


# ---------------------------------------------------------------------------
# GET /api/v1/admin/verifications
# ---------------------------------------------------------------------------


@router.get("/verifications", response_model=list[VerificationRequestItem])
async def list_verifications() -> list[VerificationRequestItem]:
    """List verification requests, under_review first, keeping PII masked."""
    sb = get_supabase()

    def _fetch_reqs() -> Any:
        return sb.table("verification_requests").select("*").execute()

    reqs_res = await run_in_threadpool(_fetch_reqs)
    reqs = reqs_res.data or []
    # Filter to only pending or under_review requests
    reqs = [r for r in reqs if r.get("status") in ("pending", "under_review")]
    if not reqs:
        return []

    # Fetch corresponding profiles & therapist_profiles in Python to combine safely
    tids = list({r["therapist_id"] for r in reqs})

    def _fetch_profiles() -> Any:
        return (
            sb.table("profiles")
            .select("id,display_name,avatar_url,avatar_pending_url")
            .in_("id", tids)
            .execute()
        )

    def _fetch_tp() -> Any:
        return sb.table("therapist_profiles").select("*").in_("id", tids).execute()

    prof_res = await run_in_threadpool(_fetch_profiles)
    tp_res = await run_in_threadpool(_fetch_tp)

    prof_map = {p["id"]: p for p in prof_res.data or []}
    tp_map = {tp["id"]: tp for tp in tp_res.data or []}

    result = []
    for r in reqs:
        tid = r["therapist_id"]
        p = prof_map.get(tid, {})
        tp = tp_map.get(tid, {})

        profile_brief = TherapistProfileBrief(
            display_name=p.get("display_name"),
            avatar_url=p.get("avatar_pending_url") or p.get("avatar_url"),
            professional_title=tp.get("professional_title"),
            years_experience=tp.get("years_experience"),
            specializations=tp.get("specializations", []),
            languages=tp.get("languages", []),
            bio=tp.get("bio"),
            gender=tp.get("gender"),
            price_inr=tp.get("price_inr"),
            practice_setting=tp.get("practice_setting"),
        )

        result.append(
            VerificationRequestItem(
                id=r["id"],
                therapist_id=tid,
                status=r["status"],
                qualification=r.get("qualification"),
                institution=r.get("institution"),
                qualification_year=r.get("qualification_year"),
                registration_body=r.get("registration_body"),
                submitted_at=r.get("submitted_at"),
                created_at=r["created_at"],
                therapist_profile=profile_brief,
            )
        )

    # Sort under_review first, then pending, then others
    status_order = {"under_review": 0, "pending": 1, "verified": 2, "rejected": 3}
    result.sort(key=lambda x: status_order.get(x.status, 99))

    return result


# ---------------------------------------------------------------------------
# POST /api/v1/admin/verifications/{id}/decrypt
# ---------------------------------------------------------------------------


@router.post("/verifications/{id}/decrypt", response_model=VerificationDecryptResponse)
async def decrypt_verification(
    id: str,
    body: VerificationDecryptRequest,
    admin: CurrentUser = Depends(require_role("admin")),
) -> VerificationDecryptResponse:
    """Audited decryption of therapist legal name, RCI number, and credentials files."""
    sb = get_supabase()

    def _fetch_req() -> Any:
        return sb.table("verification_requests").select("*").eq("id", id).limit(1).execute()

    res = await run_in_threadpool(_fetch_req)
    if not res.data:
        raise HTTPException(status_code=404, detail="Verification request not found.")
    req = res.data[0]
    therapist_id = req["therapist_id"]

    # Decrypt name
    legal_name = ""
    if req.get("legal_name_cipher") and req.get("legal_name_nonce"):
        try:
            cipher = parse_bytea(req["legal_name_cipher"])
            nonce = parse_bytea(req["legal_name_nonce"])
            legal_name = await decrypt(therapist_id, cipher, nonce)
        except Exception as e:
            legal_name = f"[Decryption Error: {e}]"

    # Decrypt reg number
    reg_num = None
    if req.get("registration_number_cipher") and req.get("registration_number_nonce"):
        try:
            cipher = parse_bytea(req["registration_number_cipher"])
            nonce = parse_bytea(req["registration_number_nonce"])
            reg_num = await decrypt(therapist_id, cipher, nonce)
        except Exception as e:
            reg_num = f"[Decryption Error: {e}]"

    # Sign credentials files
    def _fetch_docs() -> Any:
        return sb.table("credential_docs").select("*").eq("verification_request_id", id).execute()

    docs_res = await run_in_threadpool(_fetch_docs)

    documents = []
    for doc in docs_res.data or []:
        path = doc["storage_path"]

        def _sign() -> Any:
            return sb.storage.from_("therapist-credentials").create_signed_url(path, 900)

        try:
            url_dict = await run_in_threadpool(_sign)
            signed_url = url_dict.get("signedUrl") or url_dict.get("signedURL") or ""
            documents.append(
                CredentialDocBrief(
                    id=doc["id"],
                    doc_type=doc["doc_type"],
                    signed_url=signed_url,
                )
            )
        except Exception as e:
            logger.warning("Failed to sign credential doc id=%s path=%s err=%s", doc["id"], path, e)

    # Record sensitive access log
    def _log_access() -> Any:
        return (
            sb.table("sensitive_access_log")
            .insert(
                {
                    "actor_id": admin.id,
                    "kind": "credential",
                    "target_id": id,
                    "reason": body.reason,
                }
            )
            .execute()
        )

    await run_in_threadpool(_log_access)

    # Write audit log
    await write_audit(
        actor_id=admin.id,
        action="decrypt_therapist_credentials",
        target_table="verification_requests",
        target_id=id,
        metadata={"reason_provided": bool(body.reason)},
    )

    return VerificationDecryptResponse(
        legal_name=legal_name,
        registration_number=reg_num,
        documents=documents,
    )


# ---------------------------------------------------------------------------
# POST /api/v1/admin/verifications/{id}/decision
# ---------------------------------------------------------------------------


@router.post("/verifications/{id}/decision")
async def verify_decision(
    id: str,
    body: VerificationDecisionRequest,
    admin: CurrentUser = Depends(require_role("admin")),
) -> dict[str, str]:
    """Verify, reject, or request information on a therapist verification request."""
    sb = get_supabase()

    def _fetch_req() -> Any:
        return sb.table("verification_requests").select("*").eq("id", id).limit(1).execute()

    res = await run_in_threadpool(_fetch_req)
    if not res.data:
        raise HTTPException(status_code=404, detail="Verification request not found.")
    req = res.data[0]
    therapist_id = req["therapist_id"]

    notes = body.decision_notes.strip()

    if body.action == "verify":
        # Approve therapist
        def _approve() -> Any:
            # 1. Update verification_requests status
            sb.table("verification_requests").update(
                {
                    "status": "verified",
                    "reviewed_by": admin.id,
                    "reviewed_at": datetime.now(UTC).isoformat(),
                    "decision_notes": notes,
                }
            ).eq("id", id).execute()
            # 2. Update therapist_profiles
            sb.table("therapist_profiles").update(
                {"verification_status": "verified", "bookable": True}
            ).eq("id", therapist_id).execute()
            # 3. Auto-approve pending avatar photo if present
            p_res = sb.table("profiles").select("avatar_pending_url, avatar_photo_status").eq("id", therapist_id).limit(1).execute()
            if p_res.data:
                prof = p_res.data[0]
                if prof.get("avatar_photo_status") == "pending" and prof.get("avatar_pending_url"):
                    sb.table("profiles").update({
                        "avatar_url": prof["avatar_pending_url"],
                        "avatar_pending_url": None,
                        "avatar_photo_status": "approved"
                    }).eq("id", therapist_id).execute()

        await run_in_threadpool(_approve)

        # Log admin action
        def _log_action() -> Any:
            return (
                sb.table("admin_actions")
                .insert(
                    {
                        "admin_id": admin.id,
                        "action": "verify_therapist",
                        "target_table": "verification_requests",
                        "target_id": id,
                        "notes": notes,
                    }
                )
                .execute()
            )

        await run_in_threadpool(_log_action)

        # Audit
        await write_audit(
            actor_id=admin.id,
            action="verify_therapist",
            target_table="verification_requests",
            target_id=id,
        )

        return {"status": "verified"}

    elif body.action == "reject":
        # Reject therapist
        def _reject() -> Any:
            sb.table("verification_requests").update(
                {
                    "status": "rejected",
                    "reviewed_by": admin.id,
                    "reviewed_at": datetime.now(UTC).isoformat(),
                    "decision_notes": notes,
                }
            ).eq("id", id).execute()
            sb.table("therapist_profiles").update(
                {"verification_status": "rejected", "bookable": False}
            ).eq("id", therapist_id).execute()

        await run_in_threadpool(_reject)

        def _log_action() -> Any:
            return (
                sb.table("admin_actions")
                .insert(
                    {
                        "admin_id": admin.id,
                        "action": "reject_therapist",
                        "target_table": "verification_requests",
                        "target_id": id,
                        "notes": notes,
                    }
                )
                .execute()
            )

        await run_in_threadpool(_log_action)

        await write_audit(
            actor_id=admin.id,
            action="reject_therapist",
            target_table="verification_requests",
            target_id=id,
        )

        return {"status": "rejected"}

    else:  # request_info
        # Request more info (sets verification_requests to under_review, bookable=False)
        def _request_info() -> Any:
            sb.table("verification_requests").update(
                {
                    "status": "under_review",
                    "reviewed_by": admin.id,
                    "reviewed_at": datetime.now(UTC).isoformat(),
                    "decision_notes": notes,
                }
            ).eq("id", id).execute()
            sb.table("therapist_profiles").update(
                {"verification_status": "under_review", "bookable": False}
            ).eq("id", therapist_id).execute()

        await run_in_threadpool(_request_info)

        def _log_action() -> Any:
            return (
                sb.table("admin_actions")
                .insert(
                    {
                        "admin_id": admin.id,
                        "action": "other",
                        "target_table": "verification_requests",
                        "target_id": id,
                        "notes": f"Requested more info: {notes}",
                    }
                )
                .execute()
            )

        await run_in_threadpool(_log_action)

        await write_audit(
            actor_id=admin.id,
            action="request_info",
            target_table="verification_requests",
            target_id=id,
        )

        return {"status": "under_review"}


# ---------------------------------------------------------------------------
# GET /api/v1/admin/reports
# ---------------------------------------------------------------------------


@router.get("/reports", response_model=list[ReportItem])
async def list_reports() -> list[ReportItem]:
    """List AI reports, open first, keeping content masked."""
    sb = get_supabase()

    def _fetch_reports() -> Any:
        return sb.table("ai_reports").select("*").execute()

    res = await run_in_threadpool(_fetch_reports)
    reports = res.data or []

    # Sort open first, then others
    status_order = {"open": 0, "under_review": 1, "resolved": 2, "dismissed": 3}
    reports.sort(key=lambda x: status_order.get(x["status"], 99))

    return [
        ReportItem(
            id=r["id"],
            reporter_id=r["reporter_id"],
            session_id=r.get("session_id"),
            message_id=r.get("message_id"),
            category=r["category"],
            status=r["status"],
            created_at=r["created_at"],
        )
        for r in reports
    ]


# ---------------------------------------------------------------------------
# POST /api/v1/admin/reports/{id}/decrypt
# ---------------------------------------------------------------------------


@router.post("/reports/{id}/decrypt", response_model=ReportDecryptResponse)
async def decrypt_report(
    id: str,
    body: ReportDecryptRequest,
    admin: CurrentUser = Depends(require_role("admin")),
) -> ReportDecryptResponse:
    """Audited decryption of reporter notes and single targeted reported message."""
    sb = get_supabase()

    def _fetch_report() -> Any:
        return sb.table("ai_reports").select("*").eq("id", id).limit(1).execute()

    res = await run_in_threadpool(_fetch_report)
    if not res.data:
        raise HTTPException(status_code=404, detail="AI report not found.")
    report = res.data[0]
    reporter_id = report["reporter_id"]
    message_id = report.get("message_id")

    # Decrypt reporter description (uses reporter key)
    desc = None
    if report.get("description_cipher") and report.get("description_nonce"):
        try:
            cipher = parse_bytea(report["description_cipher"])
            nonce = parse_bytea(report["description_nonce"])
            desc = await decrypt(reporter_id, cipher, nonce)
        except Exception as e:
            desc = f"[Decryption Error: {e}]"

    # Decrypt message content (uses seeker key)
    msg_brief = None
    if message_id:

        def _fetch_msg() -> Any:
            return sb.table("ai_messages").select("*").eq("id", message_id).limit(1).execute()

        msg_res = await run_in_threadpool(_fetch_msg)
        if msg_res.data:
            msg = msg_res.data[0]
            try:
                msg_cipher = parse_bytea(msg["ciphertext"])
                msg_nonce = parse_bytea(msg["nonce"])
                msg_text = await decrypt(msg["user_id"], msg_cipher, msg_nonce)
                msg_brief = ReportedMessageBrief(
                    role=msg["role"],
                    text=msg_text,
                    created_at=msg["created_at"],
                )
            except Exception as e:
                msg_brief = ReportedMessageBrief(
                    role=msg["role"],
                    text=f"[Decryption Error: {e}]",
                    created_at=msg["created_at"],
                )

    # Log sensitive access
    def _log_access() -> Any:
        return (
            sb.table("sensitive_access_log")
            .insert(
                {
                    "actor_id": admin.id,
                    "kind": "reported_message",
                    "target_id": id,
                    "reason": body.reason,
                }
            )
            .execute()
        )

    await run_in_threadpool(_log_access)

    # Audit
    await write_audit(
        actor_id=admin.id,
        action="decrypt_reported_message",
        target_table="ai_reports",
        target_id=id,
        metadata={"reason_provided": bool(body.reason)},
    )

    return ReportDecryptResponse(
        reporter_description=desc,
        reported_message=msg_brief,
    )


# ---------------------------------------------------------------------------
# POST /api/v1/admin/reports/{id}/resolve
# ---------------------------------------------------------------------------


@router.post("/reports/{id}/resolve")
async def resolve_report(
    id: str,
    body: ReportResolveRequest,
    admin: CurrentUser = Depends(require_role("admin")),
) -> dict[str, str]:
    """Mark an AI report as resolved."""
    sb = get_supabase()
    notes = body.admin_notes.strip()

    def _resolve() -> Any:
        return (
            sb.table("ai_reports")
            .update(
                {
                    "status": "resolved",
                    "admin_notes": notes,
                    "resolved_by": admin.id,
                    "resolved_at": datetime.now(UTC).isoformat(),
                }
            )
            .eq("id", id)
            .execute()
        )

    res = await run_in_threadpool(_resolve)
    if not res.data:
        raise HTTPException(status_code=404, detail="AI report not found.")

    # Record action
    def _log_action() -> Any:
        return (
            sb.table("admin_actions")
            .insert(
                {
                    "admin_id": admin.id,
                    "action": "resolve_report",
                    "target_table": "ai_reports",
                    "target_id": id,
                    "notes": notes,
                }
            )
            .execute()
        )

    await run_in_threadpool(_log_action)

    await write_audit(
        actor_id=admin.id,
        action="resolve_report",
        target_table="ai_reports",
        target_id=id,
    )

    return {"status": "resolved"}


# ---------------------------------------------------------------------------
# POST /api/v1/admin/reports/{id}/dismiss
# ---------------------------------------------------------------------------


@router.post("/reports/{id}/dismiss")
async def dismiss_report(
    id: str,
    body: ReportResolveRequest,
    admin: CurrentUser = Depends(require_role("admin")),
) -> dict[str, str]:
    """Dismiss an AI report."""
    sb = get_supabase()
    notes = body.admin_notes.strip()

    def _dismiss() -> Any:
        return (
            sb.table("ai_reports")
            .update(
                {
                    "status": "dismissed",
                    "admin_notes": notes,
                    "resolved_by": admin.id,
                    "resolved_at": datetime.now(UTC).isoformat(),
                }
            )
            .eq("id", id)
            .execute()
        )

    res = await run_in_threadpool(_dismiss)
    if not res.data:
        raise HTTPException(status_code=404, detail="AI report not found.")

    def _log_action() -> Any:
        return (
            sb.table("admin_actions")
            .insert(
                {
                    "admin_id": admin.id,
                    "action": "dismiss_report",
                    "target_table": "ai_reports",
                    "target_id": id,
                    "notes": notes,
                }
            )
            .execute()
        )

    await run_in_threadpool(_log_action)

    await write_audit(
        actor_id=admin.id,
        action="dismiss_report",
        target_table="ai_reports",
        target_id=id,
    )

    return {"status": "dismissed"}


# ---------------------------------------------------------------------------
# GET /api/v1/admin/users
# ---------------------------------------------------------------------------


@router.get("/users", response_model=list[UserListItem])
async def list_users(
    query: str | None = None,
    _admin: CurrentUser = Depends(require_role("admin")),
) -> list[UserListItem]:
    """Search or list profiles. Returns identity and account metadata only."""
    sb = get_supabase()

    def _fetch() -> Any:
        q = sb.table("profiles").select("*")
        if query:
            q = q.ilike("display_name", f"%{query}%")
        return q.order("created_at", desc=True).execute()

    res = await run_in_threadpool(_fetch)
    return [
        UserListItem(
            id=row["id"],
            role=row["role"],
            display_name=row.get("display_name"),
            avatar_url=row.get("avatar_url"),
            locale=row.get("locale", "en"),
            status=row["status"],
            country=row.get("country"),
            created_at=row["created_at"],
        )
        for row in res.data or []
    ]


# ---------------------------------------------------------------------------
# POST /api/v1/admin/users/{id}/status
# ---------------------------------------------------------------------------


@router.post("/users/{id}/status")
async def update_user_status(
    id: str,
    body: UserStatusRequest,
    admin: CurrentUser = Depends(require_role("admin")),
) -> dict[str, str]:
    """Suspend or reinstate a user or therapist."""
    sb = get_supabase()

    def _fetch_profile() -> Any:
        return sb.table("profiles").select("*").eq("id", id).limit(1).execute()

    res = await run_in_threadpool(_fetch_profile)
    if not res.data:
        raise HTTPException(status_code=404, detail="User profile not found.")
    profile = res.data[0]
    role = profile["role"]

    notes = body.reason.strip() if body.reason else ""

    if body.action == "suspend":

        def _suspend() -> Any:
            sb.table("profiles").update({"status": "suspended"}).eq("id", id).execute()
            if role == "therapist":
                sb.table("therapist_profiles").update(
                    {"bookable": False, "verification_status": "suspended"}
                ).eq("id", id).execute()

        await run_in_threadpool(_suspend)

        # Log admin action
        action_type = "suspend_therapist" if role == "therapist" else "suspend_user"

        def _log_action() -> Any:
            return (
                sb.table("admin_actions")
                .insert(
                    {
                        "admin_id": admin.id,
                        "action": action_type,
                        "target_table": "profiles",
                        "target_id": id,
                        "notes": notes,
                    }
                )
                .execute()
            )

        await run_in_threadpool(_log_action)

        await write_audit(
            actor_id=admin.id,
            action=action_type,
            target_table="profiles",
            target_id=id,
        )

        return {"status": "suspended"}

    else:  # reinstate

        def _reinstate() -> Any:
            sb.table("profiles").update({"status": "active"}).eq("id", id).execute()
            if role == "therapist":
                # Restore to verified and bookable on reinstatement
                sb.table("therapist_profiles").update(
                    {"bookable": True, "verification_status": "verified"}
                ).eq("id", id).execute()

        await run_in_threadpool(_reinstate)

        def _log_action() -> Any:
            return (
                sb.table("admin_actions")
                .insert(
                    {
                        "admin_id": admin.id,
                        "action": "reinstate_user",
                        "target_table": "profiles",
                        "target_id": id,
                        "notes": notes,
                    }
                )
                .execute()
            )

        await run_in_threadpool(_log_action)

        await write_audit(
            actor_id=admin.id,
            action="reinstate_user",
            target_table="profiles",
            target_id=id,
        )

        return {"status": "active"}


# ---------------------------------------------------------------------------
# GET /api/v1/admin/country-demand
# ---------------------------------------------------------------------------


@router.get("/country-demand", response_model=list[CountryDemandItem])
async def get_country_demand() -> list[CountryDemandItem]:
    """Expose profile registration counts grouped by country."""
    sb = get_supabase()

    def _fetch() -> Any:
        return sb.table("profiles").select("country").execute()

    res = await run_in_threadpool(_fetch)

    counts: dict[str, int] = {}
    for row in res.data or []:
        c = row.get("country") or "Unknown"
        counts[c] = counts.get(c, 0) + 1

    return [CountryDemandItem(country=c, count=cnt) for c, cnt in counts.items()]


# ---------------------------------------------------------------------------
# GET /api/v1/admin/crisis-events
# ---------------------------------------------------------------------------


@router.get("/crisis-events", response_model=list[CrisisEventAggregate])
async def get_crisis_events() -> list[CrisisEventAggregate]:
    """Aggregate safety/crisis metrics trend signals (metadata only, no content)."""
    sb = get_supabase()

    def _fetch() -> Any:
        return sb.table("crisis_events_monitor").select("*").order("day", desc=True).execute()

    res = await run_in_threadpool(_fetch)
    return [
        CrisisEventAggregate(
            day=row["day"],
            category=row["category"],
            severity=row["severity"],
            trigger_layer=row["trigger_layer"],
            source=row["source"],
            event_count=row["event_count"],
        )
        for row in res.data or []
    ]


# ---------------------------------------------------------------------------
# POST /api/v1/admin/intake-summaries/{escalation_id}/decrypt (audited view)
# ---------------------------------------------------------------------------


@router.post("/intake-summaries/{escalation_id}/decrypt")
async def decrypt_intake_summary(
    escalation_id: str,
    body: VerificationDecryptRequest,
    admin: CurrentUser = Depends(require_role("admin")),
) -> dict[str, str]:
    """Audited decryption of a seeker intake summary, allowed ONLY where operationally required."""
    sb = get_supabase()

    def _fetch() -> Any:
        return (
            sb.table("intake_summaries")
            .select("*")
            .eq("escalation_id", escalation_id)
            .limit(1)
            .execute()
        )

    res = await run_in_threadpool(_fetch)
    if not res.data:
        raise HTTPException(status_code=404, detail="Intake summary not found.")
    summary = res.data[0]
    seeker_id = summary["seeker_id"]

    from app.services.crypto import decrypt, parse_bytea

    try:
        cipher = parse_bytea(summary["summary_cipher"])
        nonce = parse_bytea(summary["summary_nonce"])
        decrypted_text = await decrypt(seeker_id, cipher, nonce)
    except Exception as e:
        decrypted_text = f"[Decryption Error: {e}]"

    # Log sensitive access
    def _log_access() -> Any:
        return (
            sb.table("sensitive_access_log")
            .insert(
                {
                    "actor_id": admin.id,
                    "kind": "intake_summary",
                    "target_id": escalation_id,
                    "reason": body.reason,
                }
            )
            .execute()
        )

    await run_in_threadpool(_log_access)

    # Audit
    await write_audit(
        actor_id=admin.id,
        action="decrypt_intake_summary",
        target_table="intake_summaries",
        target_id=escalation_id,
        metadata={"reason_provided": bool(body.reason)},
    )

    return {"summary": decrypted_text}


# ---------------------------------------------------------------------------
# GET /api/v1/admin/payments (payments support tab list)
# ---------------------------------------------------------------------------


@router.get("/payments", response_model=AdminPaymentsResponse)
async def get_admin_payments() -> AdminPaymentsResponse:
    """Retrieve orders, payments, and payouts lists for support/metadata audits."""
    sb = get_supabase()

    def _fetch_all_payments_data() -> tuple[list[dict], list[dict], list[dict]]:
        orders = sb.table("orders").select("*").order("created_at", desc=True).execute()
        payments = sb.table("payments").select("*").order("created_at", desc=True).execute()
        payouts = sb.table("payouts").select("*").order("created_at", desc=True).execute()
        return orders.data or [], payments.data or [], payouts.data or []

    ord_data, pay_data, payout_data = await run_in_threadpool(_fetch_all_payments_data)

    from app.schemas.payments import OrderResponse, PaymentBrief, PayoutBrief

    return AdminPaymentsResponse(
        orders=[OrderResponse(**o) for o in ord_data],
        payments=[PaymentBrief(**p) for p in pay_data],
        payouts=[PayoutBrief(**po) for po in payout_data],
    )


# ---------------------------------------------------------------------------
# POST /api/v1/admin/payments/{payment_id}/refund (admin-initiated manual refund)
# ---------------------------------------------------------------------------


@router.post("/payments/{payment_id}/refund")
async def admin_refund_payment(
    payment_id: str,
    body: AdminRefundRequest,
) -> dict[str, str]:
    """Manually refund a payment via Razorpay API and update database state."""
    sb = get_supabase()

    # 1. Fetch payment
    def _fetch_payment() -> Any:
        return sb.table("payments").select("*").eq("id", payment_id).limit(1).execute()

    pay_res = await run_in_threadpool(_fetch_payment)
    if not pay_res.data:
        raise HTTPException(status_code=404, detail="Payment record not found.")

    payment = pay_res.data[0]
    rzp_payment_id = payment["razorpay_payment_id"]

    if payment["status"] in ("refunded", "failed"):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot refund payment in status '{payment['status']}'.",
        )

    # Determine amount to refund
    amount_to_refund = body.amount_paise
    if amount_to_refund is None:
        amount_to_refund = payment["amount_paise"] - payment["refunded_paise"]

    if amount_to_refund <= 0:
        raise HTTPException(status_code=400, detail="Invalid refund amount.")

    if payment["refunded_paise"] + amount_to_refund > payment["amount_paise"]:
        raise HTTPException(
            status_code=400,
            detail="Total refund amount exceeds original payment amount.",
        )

    # 2. Call Razorpay API to process refund
    adapter = RazorpayAdapter()
    try:
        await adapter.create_refund(rzp_payment_id, amount_to_refund)
    except Exception as e:
        logger.exception("Razorpay refund API failed: %s", e)
        raise HTTPException(status_code=500, detail=f"Razorpay refund failed: {e}")

    # 3. Update payment status in database
    new_refunded_total = payment["refunded_paise"] + amount_to_refund
    new_status = "refunded" if new_refunded_total == payment["amount_paise"] else "partially_refunded"

    now_str = datetime.now(UTC).isoformat()
    def _update_refund_db() -> Any:
        # Update payment
        sb.table("payments").update({
            "status": new_status,
            "refunded_paise": new_refunded_total,
            "updated_at": now_str,
        }).eq("id", payment_id).execute()

        # Update order status if fully refunded
        if new_status == "refunded":
            sb.table("orders").update({
                "status": "refunded",
                "updated_at": now_str,
            }).eq("id", payment["order_id"]).execute()

        # Check and update payout status if it is still pending
        payouts_res = sb.table("payouts").select("*").eq("payment_id", payment_id).execute()
        if payouts_res.data:
            payout = payouts_res.data[0]
            if payout["status"] == "pending":
                # Mark payout on_hold
                sb.table("payouts").update({
                    "status": "on_hold",
                    "notes": f"Refund of {amount_to_refund} paise processed on payment. Payout put on hold for manual audit.",
                    "updated_at": now_str,
                }).eq("id", payout["id"]).execute()

    await run_in_threadpool(_update_refund_db)

    return {"status": "success", "message": f"Refund of {amount_to_refund} paise processed successfully."}

