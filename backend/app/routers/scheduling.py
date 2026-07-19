"""FastAPI Router for Therapist Availability, Materialized Slots, and Seeker Bookings."""

from __future__ import annotations

import logging
from datetime import UTC, date, datetime, time, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel

from app.core.security import CurrentUser, get_current_user, require_role
from app.core.supabase import get_supabase
from app.schemas.scheduling import (
    AvailabilityBlockCreate,
    AvailabilityBlockResponse,
    AvailabilityBlockUpdate,
    BookingCancelRequest,
    BookingCreate,
    BookingRescheduleRequest,
    BookingResponse,
    SlotResponse,
)

logger = logging.getLogger("hovio.routers.scheduling")

router = APIRouter(tags=["scheduling"])


def get_scheduling_config(sb) -> dict:
    res = sb.table("app_config").select("value").eq("key", "scheduling").limit(1).execute()
    if res.data:
        return res.data[0]["value"]
    return {
        "session_minutes": 50,
        "hold_minutes": 10,
        "booking_window_weeks": 4,
        "min_notice_minutes": 120,
        "default_timezone": "Asia/Kolkata",
    }


def cleanup_expired_holds(sb) -> None:
    now = datetime.now(UTC).isoformat()
    # Find expired slots
    expired_slots_res = (
        sb.table("slots").select("id").eq("status", "held").lt("held_until", now).execute()
    )
    expired_slot_ids = [s["id"] for s in expired_slots_res.data] if expired_slots_res.data else []

    if expired_slot_ids:
        # Cancel bookings
        sb.table("bookings").update(
            {
                "status": "cancelled",
                "cancellation_reason": "Payment window expired (hold timeout)",
                "updated_at": now,
            }
        ).eq("status", "pending_payment").in_("slot_id", expired_slot_ids).execute()

        # Release slots
        sb.table("slots").update(
            {"status": "open", "held_until": None, "updated_at": now}
        ).in_("id", expired_slot_ids).execute()


async def generate_slots(therapist_id: str, sb) -> None:
    # 1. Clean up expired holds first
    cleanup_expired_holds(sb)

    # 2. Get config
    config = get_scheduling_config(sb)
    session_mins = config.get("session_minutes", 50)
    window_weeks = config.get("booking_window_weeks", 4)
    min_notice_mins = config.get("min_notice_minutes", 120)

    now_utc = datetime.now(UTC)
    end_utc = now_utc + timedelta(weeks=window_weeks)
    min_notice_time = now_utc + timedelta(minutes=min_notice_mins)

    # 3. Fetch active availability blocks for therapist
    blocks_res = (
        sb.table("availability_blocks")
        .select("*")
        .eq("therapist_id", therapist_id)
        .eq("active", True)
        .execute()
    )
    blocks = blocks_res.data or []

    candidate_slots = set()

    # Iterate over calendar days from yesterday to booking_window_weeks + 2 days to cover timezone shifts
    today_date = now_utc.date()
    days_range = [today_date + timedelta(days=i) for i in range(-1, (7 * window_weeks) + 3)]

    for block in blocks:
        tz_name = block.get("timezone", "Asia/Kolkata")
        try:
            tz = ZoneInfo(tz_name)
        except Exception:
            tz = ZoneInfo("Asia/Kolkata")

        is_rec = block.get("is_recurring", True)

        # Parse start and end times
        st_str = block["start_time"]
        et_str = block["end_time"]
        try:
            st = time.fromisoformat(st_str)
        except ValueError:
            st = datetime.strptime(st_str, "%H:%M").time()
        try:
            et = time.fromisoformat(et_str)
        except ValueError:
            et = datetime.strptime(et_str, "%H:%M").time()

        for day in days_range:
            if is_rec:
                py_wd = day.weekday()
                pg_wd = (py_wd + 1) % 7
                if pg_wd != block["day_of_week"]:
                    continue
            else:
                spec_dt_str = block.get("specific_date")
                if not spec_dt_str:
                    continue
                spec_dt = date.fromisoformat(spec_dt_str)
                if spec_dt != day:
                    continue

            try:
                start_dt = datetime.combine(day, st).replace(tzinfo=tz)
                end_dt = datetime.combine(day, et).replace(tzinfo=tz)
            except Exception:
                continue

            current_start = start_dt
            slot_delta = timedelta(minutes=session_mins)

            while current_start + slot_delta <= end_dt:
                slot_end = current_start + slot_delta

                slot_start_utc = current_start.astimezone(UTC)
                slot_end_utc = slot_end.astimezone(UTC)

                if slot_start_utc >= min_notice_time and slot_end_utc <= end_utc:
                    candidate_slots.add((slot_start_utc.isoformat(), slot_end_utc.isoformat()))

                current_start = slot_end

    # 4. Fetch all future slots for the therapist from database
    now_iso = now_utc.isoformat()
    db_slots_res = (
        sb.table("slots").select("*").eq("therapist_id", therapist_id).gte("starts_at", now_iso).execute()
    )
    db_slots = db_slots_res.data or []

    # 5. Partition db slots
    preserved_starts = set()
    deletable_slots = []

    for s in db_slots:
        status = s["status"]
        is_held_active = False
        if status == "held" and s.get("held_until"):
            held_until = datetime.fromisoformat(s["held_until"].replace("Z", "+00:00"))
            if held_until >= now_utc:
                is_held_active = True

        if status in ("booked", "blocked") or is_held_active:
            preserved_starts.add(s["starts_at"])
        else:
            deletable_slots.append(s)

    # 6. Identify slots to delete
    candidate_starts = {starts for starts, ends in candidate_slots}
    slots_to_delete = []
    for s in deletable_slots:
        s_starts_dt = datetime.fromisoformat(s["starts_at"].replace("Z", "+00:00"))
        s_starts_iso = s_starts_dt.astimezone(UTC).isoformat()
        if s_starts_iso not in candidate_starts:
            slots_to_delete.append(s["id"])

    if slots_to_delete:
        sb.table("slots").delete().in_("id", slots_to_delete).execute()

    # 7. Identify slots to insert
    existing_starts = preserved_starts.union(
        {s["starts_at"] for s in deletable_slots if s["id"] not in slots_to_delete}
    )

    slots_to_insert = []
    for starts_iso, ends_iso in candidate_slots:
        dt_comp = datetime.fromisoformat(starts_iso)
        match_found = False
        for es in existing_starts:
            es_dt = datetime.fromisoformat(es.replace("Z", "+00:00"))
            if es_dt == dt_comp:
                match_found = True
                break
        if not match_found:
            slots_to_insert.append(
                {
                    "therapist_id": therapist_id,
                    "starts_at": starts_iso,
                    "ends_at": ends_iso,
                    "status": "open",
                }
            )

    if slots_to_insert:
        sb.table("slots").insert(slots_to_insert).execute()


# --- Router Endpoints ---


@router.get("/api/v1/therapist/availability", response_model=list[AvailabilityBlockResponse])
async def get_my_availability(
    user: CurrentUser = Depends(require_role("therapist")),
) -> list[AvailabilityBlockResponse]:
    """Retrieve all availability blocks for the logged-in therapist."""
    sb = get_supabase()

    def _q():
        return sb.table("availability_blocks").select("*").eq("therapist_id", user.id).execute()

    res = await run_in_threadpool(_q)
    return [AvailabilityBlockResponse(**r) for r in (res.data or [])]


@router.post("/api/v1/therapist/availability", response_model=AvailabilityBlockResponse)
async def create_availability_block(
    body: AvailabilityBlockCreate,
    user: CurrentUser = Depends(require_role("therapist")),
) -> AvailabilityBlockResponse:
    """Create a new availability block and regenerate slots."""
    sb = get_supabase()

    if body.is_recurring:
        if body.day_of_week is None or body.specific_date is not None:
            raise HTTPException(
                status_code=422,
                detail="Recurring blocks require day_of_week (0-6) and specific_date must be null.",
            )
    else:
        if body.specific_date is None or body.day_of_week is not None:
            raise HTTPException(
                status_code=422,
                detail="One-off blocks require specific_date and day_of_week must be null.",
            )

    row = {
        "therapist_id": user.id,
        "is_recurring": body.is_recurring,
        "day_of_week": body.day_of_week,
        "specific_date": body.specific_date,
        "start_time": body.start_time,
        "end_time": body.end_time,
        "timezone": body.timezone,
        "active": body.active,
    }

    def _insert():
        return sb.table("availability_blocks").insert(row).execute()

    res = await run_in_threadpool(_insert)
    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to create availability block.")

    # Regenerate slots
    await generate_slots(user.id, sb)
    return AvailabilityBlockResponse(**res.data[0])


@router.patch("/api/v1/therapist/availability/{id}", response_model=AvailabilityBlockResponse)
async def update_availability_block(
    id: str,
    body: AvailabilityBlockUpdate,
    user: CurrentUser = Depends(require_role("therapist")),
) -> AvailabilityBlockResponse:
    """Update availability block and regenerate slots."""
    sb = get_supabase()

    def _fetch():
        return sb.table("availability_blocks").select("*").eq("id", id).limit(1).execute()

    res = await run_in_threadpool(_fetch)
    if not res.data:
        raise HTTPException(status_code=404, detail="Block not found")
    block = res.data[0]
    if block["therapist_id"] != user.id:
        raise HTTPException(status_code=403, detail="Forbidden")

    update_data = {}
    if body.is_recurring is not None:
        update_data["is_recurring"] = body.is_recurring
    if body.day_of_week is not None:
        update_data["day_of_week"] = body.day_of_week
    if body.specific_date is not None:
        update_data["specific_date"] = body.specific_date
    if body.start_time is not None:
        update_data["start_time"] = body.start_time
    if body.end_time is not None:
        update_data["end_time"] = body.end_time
    if body.timezone is not None:
        update_data["timezone"] = body.timezone
    if body.active is not None:
        update_data["active"] = body.active

    # Check cross validation if modifying recurring structure
    new_recurring = update_data.get("is_recurring", block["is_recurring"])
    new_day = update_data.get("day_of_week", block["day_of_week"])
    new_specific = update_data.get("specific_date", block["specific_date"])

    if new_recurring:
        if new_day is None or new_specific is not None:
            raise HTTPException(
                status_code=422,
                detail="Recurring blocks require day_of_week and no specific_date.",
            )
        # Clear specific date if switching to recurring
        if block["specific_date"] is not None:
            update_data["specific_date"] = None
    else:
        if new_specific is None or new_day is not None:
            raise HTTPException(
                status_code=422,
                detail="One-off blocks require specific_date and no day_of_week.",
            )
        # Clear day_of_week if switching to one-off
        if block["day_of_week"] is not None:
            update_data["day_of_week"] = None

    def _update():
        return sb.table("availability_blocks").update(update_data).eq("id", id).execute()

    res_up = await run_in_threadpool(_update)
    if not res_up.data:
        raise HTTPException(status_code=500, detail="Failed to update availability block.")

    await generate_slots(user.id, sb)
    return AvailabilityBlockResponse(**res_up.data[0])


@router.delete("/api/v1/therapist/availability/{id}")
async def delete_availability_block(
    id: str,
    user: CurrentUser = Depends(require_role("therapist")),
) -> dict[str, str]:
    """Delete block and regenerate slots."""
    sb = get_supabase()

    def _fetch():
        return sb.table("availability_blocks").select("*").eq("id", id).limit(1).execute()

    res = await run_in_threadpool(_fetch)
    if not res.data:
        raise HTTPException(status_code=404, detail="Block not found")
    block = res.data[0]
    if block["therapist_id"] != user.id:
        raise HTTPException(status_code=403, detail="Forbidden")

    def _delete():
        return sb.table("availability_blocks").delete().eq("id", id).execute()

    await run_in_threadpool(_delete)
    await generate_slots(user.id, sb)
    return {"status": "deleted"}


@router.get("/api/v1/therapists")
async def list_therapists(
    specialization: str | None = None,
    language: str | None = None,
    price_min: int | None = None,
    price_max: int | None = None,
    gender: str | None = None,
    modality: str | None = None,
    has_availability_soon: bool | None = None,
    user: CurrentUser = Depends(get_current_user),
) -> list[dict]:
    """Retrieve all verified and bookable therapists matching filter criteria."""
    sb = get_supabase()

    def _fetch():
        return (
            sb.table("therapist_profiles")
            .select("*, profiles!inner(display_name, avatar_url)")
            .eq("verification_status", "verified")
            .eq("bookable", True)
            .execute()
        )

    res = await run_in_threadpool(_fetch)
    therapists = res.data or []

    cleanup_expired_holds(sb)

    # Filter by soon-to-be available slots
    available_therapists = set()
    if has_availability_soon:
        now = datetime.now(UTC)
        config = get_scheduling_config(sb)
        min_notice_mins = config.get("min_notice_minutes", 120)
        start_limit = (now + timedelta(minutes=min_notice_mins)).isoformat()
        end_limit = (now + timedelta(days=7)).isoformat()

        def _fetch_soon_slots():
            return (
                sb.table("slots")
                .select("therapist_id")
                .eq("status", "open")
                .gte("starts_at", start_limit)
                .lte("starts_at", end_limit)
                .execute()
            )

        slots_res = await run_in_threadpool(_fetch_soon_slots)
        for s in slots_res.data or []:
            available_therapists.add(s["therapist_id"])

    filtered = []
    for t in therapists:
        if specialization:
            req_specs = [s.strip().lower() for s in specialization.split(",") if s.strip()]
            t_specs = [s.lower() for s in t.get("specializations", [])]
            if not any(rs in t_specs for rs in req_specs):
                continue

        if language:
            req_langs = [lang.strip().lower() for lang in language.split(",") if lang.strip()]
            t_langs = [lang.lower() for lang in t.get("languages", [])]
            if not any(rl in t_langs for rl in req_langs):
                continue

        t_price = t.get("price_inr", 0)
        if price_min is not None and t_price < price_min:
            continue
        if price_max is not None and t_price > price_max:
            continue

        if gender and t.get("gender") != gender:
            continue

        if modality:
            t_modes = [m.lower() for m in t.get("session_modes", [])]
            if modality.lower() not in t_modes:
                continue

        if has_availability_soon and t["id"] not in available_therapists:
            continue

        p = t.get("profiles", {})
        filtered.append(
            {
                "id": t["id"],
                "display_name": p.get("display_name"),
                "avatar_url": p.get("avatar_url"),
                "bio": t.get("bio"),
                "specializations": t.get("specializations", []),
                "languages": t.get("languages", []),
                "gender": t.get("gender"),
                "price_inr": t.get("price_inr"),
                "professional_title": t.get("professional_title"),
                "years_experience": t.get("years_experience"),
                "session_modes": t.get("session_modes", []),
                "practice_setting": t.get("practice_setting"),
            }
        )

    return filtered


@router.get("/api/v1/therapists/{id}/slots", response_model=list[SlotResponse])
async def get_therapist_slots(
    id: str,
    user: CurrentUser = Depends(get_current_user),
) -> list[SlotResponse]:
    """Retrieve open future slots for a therapist, running lazy slot extend."""
    sb = get_supabase()
    # Regenerate slots lazily
    await generate_slots(id, sb)

    now = datetime.now(UTC)
    config = get_scheduling_config(sb)
    min_notice_mins = config.get("min_notice_minutes", 120)
    start_limit = (now + timedelta(minutes=min_notice_mins)).isoformat()

    def _fetch_slots():
        return (
            sb.table("slots")
            .select("*")
            .eq("therapist_id", id)
            .eq("status", "open")
            .gte("starts_at", start_limit)
            .order("starts_at")
            .execute()
        )

    res = await run_in_threadpool(_fetch_slots)
    return [SlotResponse(**s) for s in (res.data or [])]


@router.post("/api/v1/bookings", response_model=BookingResponse)
async def create_booking(
    body: BookingCreate,
    user: CurrentUser = Depends(require_role("seeker")),
) -> BookingResponse:
    """Create a pending payment booking, atomically locking the slot."""
    sb = get_supabase()
    cleanup_expired_holds(sb)

    now = datetime.now(UTC)
    config = get_scheduling_config(sb)
    hold_mins = config.get("hold_minutes", 10)
    session_mins = config.get("session_minutes", 50)

    # 1. Idempotency Check: check if seeker already has a booking for this starts_at
    def _check_dup():
        return (
            sb.table("bookings")
            .select("*")
            .eq("seeker_id", user.id)
            .eq("therapist_id", body.therapist_id)
            .eq("starts_at", body.starts_at)
            .in_("status", ["pending_payment", "confirmed"])
            .execute()
        )

    dup_res = await run_in_threadpool(_check_dup)
    if dup_res.data:
        return BookingResponse(**dup_res.data[0])

    # 2. Find the slot
    def _find_slot():
        return (
            sb.table("slots")
            .select("*")
            .eq("therapist_id", body.therapist_id)
            .eq("starts_at", body.starts_at)
            .execute()
        )

    slot_res = await run_in_threadpool(_find_slot)
    if not slot_res.data:
        raise HTTPException(
            status_code=404, detail="No slot found at this time for this therapist."
        )

    slot = slot_res.data[0]
    slot_id = slot["id"]

    # 3. Check therapist profile & modality
    def _fetch_profile():
        return (
            sb.table("therapist_profiles")
            .select("session_modes, price_inr")
            .eq("id", body.therapist_id)
            .limit(1)
            .execute()
        )

    profile_res = await run_in_threadpool(_fetch_profile)
    if not profile_res.data:
        raise HTTPException(status_code=404, detail="Therapist profile not found.")
    profile = profile_res.data[0]

    t_modes = [m.lower() for m in profile.get("session_modes", [])]
    if body.modality.lower() not in t_modes:
        raise HTTPException(
            status_code=400,
            detail=f"Therapist does not support the chosen modality: {body.modality}",
        )

    # 4. Atomically hold the slot
    held_until = (now + timedelta(minutes=hold_mins)).isoformat()

    def _hold_slot():
        return (
            sb.table("slots")
            .update({"status": "held", "held_until": held_until})
            .eq("id", slot_id)
            .eq("status", "open")
            .execute()
        )

    hold_res = await run_in_threadpool(_hold_slot)
    if not hold_res.data:
        raise HTTPException(
            status_code=409,
            detail="This slot is no longer available. It may have been booked or held by another user.",
        )

    # 5. Create booking record
    ends_at = (
        datetime.fromisoformat(body.starts_at.replace("Z", "+00:00"))
        + timedelta(minutes=session_mins)
    ).isoformat()
    booking_row = {
        "seeker_id": user.id,
        "therapist_id": body.therapist_id,
        "slot_id": slot_id,
        "escalation_id": body.escalation_id,
        "status": "pending_payment",
        "modality": body.modality,
        "starts_at": body.starts_at,
        "ends_at": ends_at,
        "price_inr": profile.get("price_inr", 0),
    }

    def _insert_booking():
        return sb.table("bookings").insert(booking_row).execute()

    booking_res = await run_in_threadpool(_insert_booking)
    if not booking_res.data:
        # Revert slot hold on error
        def _revert_slot():
            return (
                sb.table("slots")
                .update({"status": "open", "held_until": None})
                .eq("id", slot_id)
                .execute()
            )

        await run_in_threadpool(_revert_slot)
        raise HTTPException(status_code=500, detail="Failed to create booking record.")

    return BookingResponse(**booking_res.data[0])


@router.get("/api/v1/bookings", response_model=list[BookingResponse])
async def get_bookings(
    user: CurrentUser = Depends(get_current_user),
) -> list[BookingResponse]:
    """Retrieve upcoming and past bookings for seeker or therapist."""
    sb = get_supabase()
    cleanup_expired_holds(sb)

    if user.role == "seeker":

        def _fetch_seeker():
            return (
                sb.table("bookings")
                .select("*, therapist_profiles!inner(profiles!inner(display_name))")
                .eq("seeker_id", user.id)
                .order("starts_at", desc=True)
                .execute()
            )

        res = await run_in_threadpool(_fetch_seeker)
        bookings = res.data or []

        result = []
        for b in bookings:
            tp = b.get("therapist_profiles", {})
            p = tp.get("profiles", {}) if tp else {}
            # Pop nested objects to match response schema
            clean_b = {k: v for k, v in b.items() if k != "therapist_profiles"}
            result.append(
                BookingResponse(
                    **{**clean_b, "therapist_name": p.get("display_name", "Verified Therapist")}
                )
            )
        return result

    elif user.role == "therapist":

        def _fetch_therapist():
            return (
                sb.table("bookings")
                .select("*, seeker:profiles!inner(display_name)")
                .eq("therapist_id", user.id)
                .order("starts_at", desc=True)
                .execute()
            )

        res = await run_in_threadpool(_fetch_therapist)
        bookings = res.data or []

        result = []
        for b in bookings:
            s = b.get("seeker", {})
            clean_b = {k: v for k, v in b.items() if k != "seeker"}
            result.append(
                BookingResponse(
                    **{**clean_b, "seeker_name": s.get("display_name", "Anonymous Seeker")}
                )
            )
        return result
    else:
        raise HTTPException(status_code=403, detail="Role not supported.")


@router.post("/api/v1/bookings/{id}/cancel", response_model=BookingResponse)
async def cancel_booking(
    id: str,
    body: BookingCancelRequest,
    user: CurrentUser = Depends(get_current_user),
) -> BookingResponse:
    """Cancel booking and return slot back to open."""
    sb = get_supabase()

    def _fetch():
        return sb.table("bookings").select("*").eq("id", id).limit(1).execute()

    res = await run_in_threadpool(_fetch)
    if not res.data:
        raise HTTPException(status_code=404, detail="Booking not found.")
    booking = res.data[0]
    if booking["seeker_id"] != user.id and booking["therapist_id"] != user.id:
        raise HTTPException(status_code=403, detail="Forbidden")

    if booking["status"] in ("cancelled", "completed"):
        raise HTTPException(
            status_code=400, detail=f"Booking is already in status {booking['status']}."
        )

    now = datetime.now(UTC).isoformat()
    update_row = {
        "status": "cancelled",
        "cancelled_by": user.id,
        "cancelled_at": now,
        "cancellation_reason": body.reason,
        "updated_at": now,
    }

    def _update():
        return sb.table("bookings").update(update_row).eq("id", id).execute()

    up_res = await run_in_threadpool(_update)

    slot_id = booking.get("slot_id")
    if slot_id:

        def _release():
            return (
                sb.table("slots")
                .update({"status": "open", "held_until": None})
                .eq("id", slot_id)
                .execute()
            )

        await run_in_threadpool(_release)

    return BookingResponse(**up_res.data[0])


@router.post("/api/v1/bookings/{id}/reschedule", response_model=BookingResponse)
async def reschedule_booking(
    id: str,
    body: BookingRescheduleRequest,
    user: CurrentUser = Depends(get_current_user),
) -> BookingResponse:
    """Reschedule slot: releases the old slot, atomically holds the new slot."""
    sb = get_supabase()
    cleanup_expired_holds(sb)

    def _fetch():
        return sb.table("bookings").select("*").eq("id", id).limit(1).execute()

    res = await run_in_threadpool(_fetch)
    if not res.data:
        raise HTTPException(status_code=404, detail="Booking not found.")
    booking = res.data[0]
    if booking["seeker_id"] != user.id:
        raise HTTPException(status_code=403, detail="Forbidden: Only seekers can reschedule.")

    if booking["status"] not in ("pending_payment", "confirmed"):
        raise HTTPException(
            status_code=400,
            detail=f"Booking cannot be rescheduled in status {booking['status']}.",
        )

    def _fetch_new_slot():
        return sb.table("slots").select("*").eq("id", body.new_slot_id).execute()

    new_slot_res = await run_in_threadpool(_fetch_new_slot)
    if not new_slot_res.data:
        raise HTTPException(status_code=404, detail="New slot not found.")
    new_slot = new_slot_res.data[0]
    if new_slot["therapist_id"] != booking["therapist_id"]:
        raise HTTPException(
            status_code=400, detail="Cannot reschedule to a different therapist's slot."
        )

    # Atomically hold the new slot
    now = datetime.now(UTC)
    config = get_scheduling_config(sb)
    hold_mins = config.get("hold_minutes", 10)
    held_until = (now + timedelta(minutes=hold_mins)).isoformat()

    def _hold_new_slot():
        return (
            sb.table("slots")
            .update({"status": "held", "held_until": held_until})
            .eq("id", body.new_slot_id)
            .eq("status", "open")
            .execute()
        )

    hold_res = await run_in_threadpool(_hold_new_slot)
    if not hold_res.data:
        raise HTTPException(status_code=409, detail="New slot is no longer open.")

    # Release old slot
    old_slot_id = booking.get("slot_id")
    if old_slot_id:

        def _release_old():
            return (
                sb.table("slots")
                .update({"status": "open", "held_until": None})
                .eq("id", old_slot_id)
                .execute()
            )

        await run_in_threadpool(_release_old)

    # Update booking
    now_str = now.isoformat()
    update_row = {
        "slot_id": body.new_slot_id,
        "starts_at": new_slot["starts_at"],
        "ends_at": new_slot["ends_at"],
        "updated_at": now_str,
    }

    def _update():
        return sb.table("bookings").update(update_row).eq("id", id).execute()

    up_res = await run_in_threadpool(_update)
    return BookingResponse(**up_res.data[0])


class ProposeSlotsRequest(BaseModel):
    session_id: str
    therapist_id: str


@router.post("/api/v1/handoff/propose-slots")
async def handoff_propose_slots(
    body: ProposeSlotsRequest,
    user: CurrentUser = Depends(require_role("seeker")),
) -> dict[str, Any]:
    """propose 2-3 slots matching user stated preferences from chat history."""
    from app.services.agents.scheduler import propose_slots_for_seeker
    return await propose_slots_for_seeker(user.id, body.session_id, body.therapist_id)

