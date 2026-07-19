"""FastAPI router for live (LiveKit) sessions.

Turns a confirmed booking into a joinable room. Rules that are never broken:
- Tokens are minted server-side only; the LiveKit API secret never reaches the
  client (app/adapters/livekit.py).
- Only the booking's real seeker or therapist can get a token, and only inside
  the configured join window.
- live_session_events rows are metadata only — no media, no message content.
- Therapist session notes are envelope-encrypted with the therapist's own DEK
  and are visible only to the authoring therapist. Never the seeker, never
  admin, never logged in plaintext.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.concurrency import run_in_threadpool

from app.adapters.livekit import LiveKitNotConfiguredError, SelfHostedLiveKitAdapter
from app.core.security import CurrentUser, get_current_user, require_role
from app.core.supabase import get_supabase
from app.schemas.live import (
    LiveSessionState,
    LiveTokenResponse,
    SessionNoteResponse,
    SessionNoteUpsert,
)
from app.services.audit import write_audit
from app.services.crypto import service as crypto

logger = logging.getLogger("hovio.routers.live")

router = APIRouter(prefix="/api/v1/live", tags=["live"])

_DEFAULT_CONFIG = {
    "join_early_minutes": 10,
    "end_grace_minutes": 15,
    "no_show_grace_minutes": 15,
}


def get_live_config(sb) -> dict:
    res = sb.table("app_config").select("value").eq("key", "live_sessions").limit(1).execute()
    if res.data:
        return {**_DEFAULT_CONFIG, **res.data[0]["value"]}
    return dict(_DEFAULT_CONFIG)


def _parse_ts(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def provision_live_session(sb, booking: dict) -> dict:
    """Get-or-create the live_sessions row for a confirmed booking.

    Idempotent: room_name is derived from the booking id (unique per booking).
    Called when payment confirms the booking, and lazily from the endpoints
    below as a safety net.
    """
    existing = (
        sb.table("live_sessions").select("*").eq("booking_id", booking["id"]).limit(1).execute()
    )
    if existing.data:
        return existing.data[0]

    row = {
        "booking_id": booking["id"],
        "seeker_id": booking["seeker_id"],
        "therapist_id": booking["therapist_id"],
        "room_name": f"hovio-{booking['id']}",
        "modality": booking["modality"],
        "status": "scheduled",
    }
    try:
        res = sb.table("live_sessions").insert(row).execute()
        if res.data:
            return res.data[0]
    except Exception:
        # Unique booking_id race: another request created it first.
        pass
    retry = (
        sb.table("live_sessions").select("*").eq("booking_id", booking["id"]).limit(1).execute()
    )
    if retry.data:
        return retry.data[0]
    raise HTTPException(status_code=500, detail="Failed to provision live session.")


def _distinct_joiners(sb, live_session_id: str) -> set[str]:
    res = (
        sb.table("live_session_events")
        .select("participant_id, event_type")
        .eq("live_session_id", live_session_id)
        .eq("event_type", "joined")
        .execute()
    )
    return {e["participant_id"] for e in (res.data or []) if e["participant_id"]}


def _write_event(sb, live_session_id: str, event_type: str, participant_id: str | None) -> None:
    sb.table("live_session_events").insert(
        {
            "live_session_id": live_session_id,
            "participant_id": participant_id,
            "event_type": event_type,
        }
    ).execute()


def _finalize_if_overdue(sb, session: dict, booking: dict, cfg: dict) -> dict:
    """Past the join window, settle a still-open session.

    Both parties ever joined -> completed; anything less -> no_show.
    Mirrors the outcome onto bookings.status.
    """
    if session["status"] not in ("scheduled", "live"):
        return session

    now = datetime.now(UTC)
    ends_at = _parse_ts(booking["ends_at"])
    window_close = ends_at + timedelta(minutes=cfg["end_grace_minutes"])
    if now <= window_close:
        return session

    joiners = _distinct_joiners(sb, session["id"])
    both_joined = booking["seeker_id"] in joiners and booking["therapist_id"] in joiners
    new_status = "completed" if both_joined else "no_show"
    now_str = now.isoformat()

    update: dict[str, Any] = {"status": new_status, "updated_at": now_str}
    if new_status == "completed":
        update["ended_at"] = session.get("ended_at") or booking["ends_at"]
    up = sb.table("live_sessions").update(update).eq("id", session["id"]).execute()
    _write_event(sb, session["id"], "ended", None)

    if booking["status"] == "confirmed":
        sb.table("bookings").update({"status": new_status, "updated_at": now_str}).eq(
            "id", booking["id"]
        ).execute()

    return up.data[0] if up.data else {**session, **update}


async def _fetch_booking_as_participant(sb, booking_id: str, user: CurrentUser) -> dict:
    def _q():
        return sb.table("bookings").select("*").eq("id", booking_id).limit(1).execute()

    res = await run_in_threadpool(_q)
    if not res.data:
        raise HTTPException(status_code=404, detail="Booking not found.")
    booking = res.data[0]
    if user.id not in (booking["seeker_id"], booking["therapist_id"]):
        raise HTTPException(status_code=403, detail="You are not part of this session.")
    return booking


async def _other_party_name(sb, booking: dict, user: CurrentUser) -> str | None:
    other_id = (
        booking["therapist_id"] if user.id == booking["seeker_id"] else booking["seeker_id"]
    )

    def _q():
        return sb.table("profiles").select("display_name").eq("id", other_id).limit(1).execute()

    res = await run_in_threadpool(_q)
    if res.data:
        return res.data[0].get("display_name")
    return None


def _to_state(
    session: dict,
    booking: dict,
    cfg: dict,
    user: CurrentUser,
    other_name: str | None,
    has_note: bool,
) -> LiveSessionState:
    starts_at = _parse_ts(booking["starts_at"])
    ends_at = _parse_ts(booking["ends_at"])
    join_opens = starts_at - timedelta(minutes=cfg["join_early_minutes"])
    join_closes = ends_at + timedelta(minutes=cfg["end_grace_minutes"])
    now = datetime.now(UTC)

    duration_minutes = None
    if session.get("started_at") and session.get("ended_at"):
        delta = _parse_ts(session["ended_at"]) - _parse_ts(session["started_at"])
        duration_minutes = max(1, round(delta.total_seconds() / 60))

    return LiveSessionState(
        booking_id=booking["id"],
        live_session_id=session["id"],
        modality=session["modality"],
        status=session["status"],
        starts_at=booking["starts_at"],
        ends_at=booking["ends_at"],
        started_at=session.get("started_at"),
        ended_at=session.get("ended_at"),
        my_role="seeker" if user.id == booking["seeker_id"] else "therapist",
        other_party_name=other_name,
        can_join=(
            booking["status"] == "confirmed"
            and session["status"] in ("scheduled", "live")
            and join_opens <= now <= join_closes
        ),
        join_opens_at=join_opens.isoformat(),
        join_closes_at=join_closes.isoformat(),
        duration_minutes=duration_minutes,
        has_note=has_note,
    )


@router.get("/sessions", response_model=list[LiveSessionState])
async def list_live_sessions(user: CurrentUser = Depends(get_current_user)) -> Any:
    """All live sessions for the caller (both roles), settling overdue ones."""
    sb = get_supabase()

    def _list():
        cfg = get_live_config(sb)
        col = "seeker_id" if user.role == "seeker" else "therapist_id"
        sessions = (
            sb.table("live_sessions").select("*").eq(col, user.id).execute().data or []
        )
        if not sessions:
            return cfg, [], {}, {}

        booking_ids = [s["booking_id"] for s in sessions]
        bookings = (
            sb.table("bookings").select("*").in_("id", booking_ids).execute().data or []
        )
        bookings_by_id = {b["id"]: b for b in bookings}

        note_sessions: set[str] = set()
        if user.role == "therapist":
            notes = (
                sb.table("session_notes")
                .select("live_session_id")
                .eq("therapist_id", user.id)
                .in_("live_session_id", [s["id"] for s in sessions])
                .execute()
                .data
                or []
            )
            note_sessions = {n["live_session_id"] for n in notes}

        settled = []
        for s in sessions:
            b = bookings_by_id.get(s["booking_id"])
            if b is None:
                continue
            settled.append((_finalize_if_overdue(sb, s, b, cfg), b))
        return cfg, settled, bookings_by_id, note_sessions

    cfg, settled, _bookings, note_sessions = await run_in_threadpool(_list)

    out: list[LiveSessionState] = []
    for session, booking in settled:
        name = await _other_party_name(sb, booking, user)
        out.append(
            _to_state(session, booking, cfg, user, name, session["id"] in note_sessions)
        )
    out.sort(key=lambda s: s.starts_at, reverse=True)
    return out


@router.get("/{booking_id}", response_model=LiveSessionState)
async def get_live_session(
    booking_id: str, user: CurrentUser = Depends(get_current_user)
) -> Any:
    """State of the live session behind one booking (participants only)."""
    sb = get_supabase()
    booking = await _fetch_booking_as_participant(sb, booking_id, user)

    if booking["status"] not in ("confirmed", "completed", "no_show"):
        raise HTTPException(
            status_code=400,
            detail=f"This booking is not joinable (status: {booking['status']}).",
        )

    def _ensure():
        cfg = get_live_config(sb)
        session = provision_live_session(sb, booking)
        session = _finalize_if_overdue(sb, session, booking, cfg)
        has_note = False
        if user.id == booking["therapist_id"]:
            notes = (
                sb.table("session_notes")
                .select("id")
                .eq("live_session_id", session["id"])
                .eq("therapist_id", user.id)
                .limit(1)
                .execute()
            )
            has_note = bool(notes.data)
        return cfg, session, has_note

    cfg, session, has_note = await run_in_threadpool(_ensure)
    name = await _other_party_name(sb, booking, user)
    return _to_state(session, booking, cfg, user, name, has_note)


@router.post("/{booking_id}/token", response_model=LiveTokenResponse)
async def mint_live_token(
    booking_id: str, user: CurrentUser = Depends(get_current_user)
) -> Any:
    """Mint a LiveKit join token for the booking's seeker or therapist.

    Only for a confirmed booking, only inside the join window. First join
    flips the session to 'live'. Every join is recorded as a metadata event.
    """
    sb = get_supabase()
    booking = await _fetch_booking_as_participant(sb, booking_id, user)

    if booking["status"] != "confirmed":
        raise HTTPException(
            status_code=400,
            detail=f"Only confirmed bookings can be joined (status: {booking['status']}).",
        )

    now = datetime.now(UTC)

    def _prepare():
        cfg = get_live_config(sb)
        session = provision_live_session(sb, booking)
        session = _finalize_if_overdue(sb, session, booking, cfg)
        return cfg, session

    cfg, session = await run_in_threadpool(_prepare)

    if session["status"] not in ("scheduled", "live"):
        raise HTTPException(
            status_code=400,
            detail=f"This session has already ended (status: {session['status']}).",
        )

    starts_at = _parse_ts(booking["starts_at"])
    ends_at = _parse_ts(booking["ends_at"])
    join_opens = starts_at - timedelta(minutes=cfg["join_early_minutes"])
    join_closes = ends_at + timedelta(minutes=cfg["end_grace_minutes"])

    if now < join_opens:
        raise HTTPException(
            status_code=400,
            detail=(
                "It's a little early — the room opens "
                f"{cfg['join_early_minutes']} minutes before the session."
            ),
        )
    if now > join_closes:
        raise HTTPException(status_code=400, detail="The join window for this session has closed.")

    adapter = SelfHostedLiveKitAdapter()
    try:
        # Token lives until the window closes (plus a minute of slack).
        ttl = max(60, int((join_closes - now).total_seconds()) + 60)
        join = adapter.mint_join_token(
            room=session["room_name"],
            identity=user.id,
            name=user.display_name or ("Therapist" if user.role == "therapist" else "Seeker"),
            mode=session["modality"],
            ttl_seconds=ttl,
        )
    except LiveKitNotConfiguredError as e:
        raise HTTPException(
            status_code=503, detail="Live sessions are not configured on this server."
        ) from e

    def _record_join():
        if session["status"] == "scheduled":
            sb.table("live_sessions").update(
                {"status": "live", "started_at": now.isoformat(), "updated_at": now.isoformat()}
            ).eq("id", session["id"]).eq("status", "scheduled").execute()
            _write_event(sb, session["id"], "started", user.id)
        _write_event(sb, session["id"], "joined", user.id)

    await run_in_threadpool(_record_join)
    await write_audit(
        actor_id=user.id,
        action="live_session.token_minted",
        target_table="live_sessions",
        target_id=session["id"],
        metadata={"modality": session["modality"]},
    )

    name = await _other_party_name(sb, booking, user)
    return LiveTokenResponse(
        token=join.token,
        url=join.url,
        room=join.room,
        identity=user.id,
        modality=session["modality"],
        other_party_name=name,
    )


@router.post("/{booking_id}/leave")
async def leave_live_session(
    booking_id: str, user: CurrentUser = Depends(get_current_user)
) -> dict[str, str]:
    """Record that the caller left. When both participants have left, the
    session completes."""
    sb = get_supabase()
    booking = await _fetch_booking_as_participant(sb, booking_id, user)

    def _leave():
        session_res = (
            sb.table("live_sessions").select("*").eq("booking_id", booking_id).limit(1).execute()
        )
        if not session_res.data:
            return "not_found"
        session = session_res.data[0]
        if session["status"] not in ("scheduled", "live"):
            return session["status"]

        _write_event(sb, session["id"], "left", user.id)

        # Both participants joined and both have since left -> completed.
        events = (
            sb.table("live_session_events")
            .select("participant_id, event_type, created_at")
            .eq("live_session_id", session["id"])
            .order("created_at")
            .execute()
            .data
            or []
        )
        last_by_participant: dict[str, str] = {}
        joined: set[str] = set()
        for e in events:
            pid = e.get("participant_id")
            if not pid:
                continue
            if e["event_type"] == "joined":
                joined.add(pid)
            if e["event_type"] in ("joined", "left"):
                last_by_participant[pid] = e["event_type"]

        both_joined = booking["seeker_id"] in joined and booking["therapist_id"] in joined
        everyone_left = joined and all(
            last_by_participant.get(pid) == "left" for pid in joined
        )
        if session["status"] == "live" and both_joined and everyone_left:
            now_str = datetime.now(UTC).isoformat()
            sb.table("live_sessions").update(
                {"status": "completed", "ended_at": now_str, "updated_at": now_str}
            ).eq("id", session["id"]).execute()
            _write_event(sb, session["id"], "ended", None)
            sb.table("bookings").update({"status": "completed", "updated_at": now_str}).eq(
                "id", booking_id
            ).execute()
            return "completed"
        return session["status"]

    status = await run_in_threadpool(_leave)
    return {"status": status}


@router.post("/{booking_id}/end")
async def end_live_session(
    booking_id: str, user: CurrentUser = Depends(require_role("therapist"))
) -> dict[str, str]:
    """Therapist manually ends the session for everyone."""
    sb = get_supabase()
    booking = await _fetch_booking_as_participant(sb, booking_id, user)
    if booking["therapist_id"] != user.id:
        raise HTTPException(status_code=403, detail="Only this session's therapist can end it.")

    def _end():
        session_res = (
            sb.table("live_sessions").select("*").eq("booking_id", booking_id).limit(1).execute()
        )
        if not session_res.data:
            raise HTTPException(status_code=404, detail="Live session not found.")
        session = session_res.data[0]
        if session["status"] not in ("scheduled", "live"):
            return session["status"]

        now_str = datetime.now(UTC).isoformat()
        update: dict[str, Any] = {
            "status": "completed",
            "ended_at": now_str,
            "updated_at": now_str,
        }
        if not session.get("started_at"):
            update["started_at"] = now_str
        sb.table("live_sessions").update(update).eq("id", session["id"]).execute()
        _write_event(sb, session["id"], "ended", user.id)
        if booking["status"] == "confirmed":
            sb.table("bookings").update({"status": "completed", "updated_at": now_str}).eq(
                "id", booking_id
            ).execute()
        return "completed"

    status = await run_in_threadpool(_end)
    return {"status": status}


# ─── Therapist private notes (envelope-encrypted, therapist-only) ────────────


async def _note_session_for_therapist(sb, booking_id: str, user: CurrentUser) -> dict:
    booking = await _fetch_booking_as_participant(sb, booking_id, user)
    if booking["therapist_id"] != user.id:
        # Seekers and anyone else never see therapist notes.
        raise HTTPException(status_code=403, detail="Notes are private to the therapist.")

    def _q():
        return provision_live_session(sb, booking)

    return await run_in_threadpool(_q)


@router.get("/{booking_id}/note", response_model=SessionNoteResponse)
async def get_session_note(
    booking_id: str, user: CurrentUser = Depends(require_role("therapist"))
) -> Any:
    """Return the authoring therapist's decrypted note for this session."""
    sb = get_supabase()
    session = await _note_session_for_therapist(sb, booking_id, user)

    def _fetch():
        return (
            sb.table("session_notes")
            .select("*")
            .eq("live_session_id", session["id"])
            .eq("therapist_id", user.id)
            .limit(1)
            .execute()
        )

    res = await run_in_threadpool(_fetch)
    if not res.data:
        return SessionNoteResponse()

    note = res.data[0]
    text = await crypto.decrypt(
        user.id,
        crypto.parse_bytea(note["note_cipher"]),
        crypto.parse_bytea(note["note_nonce"]),
    )
    await write_audit(
        actor_id=user.id,
        action="session_note.read",
        target_table="session_notes",
        target_id=note["id"],
    )
    return SessionNoteResponse(text=text, updated_at=note["updated_at"])


@router.put("/{booking_id}/note", response_model=SessionNoteResponse)
async def upsert_session_note(
    booking_id: str,
    body: SessionNoteUpsert,
    user: CurrentUser = Depends(require_role("therapist")),
) -> Any:
    """Create or update the therapist's private, envelope-encrypted note."""
    sb = get_supabase()
    session = await _note_session_for_therapist(sb, booking_id, user)

    # Encrypt with the therapist's own DEK — only they can ever read it back.
    ciphertext, nonce = await crypto.encrypt(user.id, body.text)
    now_str = datetime.now(UTC).isoformat()

    def _upsert():
        existing = (
            sb.table("session_notes")
            .select("id")
            .eq("live_session_id", session["id"])
            .eq("therapist_id", user.id)
            .limit(1)
            .execute()
        )
        payload = {
            "note_cipher": "\\x" + ciphertext.hex(),
            "note_nonce": "\\x" + nonce.hex(),
            "updated_at": now_str,
        }
        if existing.data:
            return (
                sb.table("session_notes")
                .update(payload)
                .eq("id", existing.data[0]["id"])
                .execute()
            )
        return (
            sb.table("session_notes")
            .insert(
                {
                    "live_session_id": session["id"],
                    "therapist_id": user.id,
                    **payload,
                }
            )
            .execute()
        )

    res = await run_in_threadpool(_upsert)
    note_id = res.data[0]["id"] if res.data else None
    await write_audit(
        actor_id=user.id,
        action="session_note.written",
        target_table="session_notes",
        target_id=note_id,
    )
    return SessionNoteResponse(text=body.text, updated_at=now_str)
