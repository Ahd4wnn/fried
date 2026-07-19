"""FastAPI Router for payments, orders, and Razorpay webhook reconciliation."""

from __future__ import annotations

import json
import logging
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from fastapi.concurrency import run_in_threadpool

from app.adapters.payments import RazorpayAdapter
from app.core.security import CurrentUser, require_role
from app.core.supabase import get_supabase
from app.routers.scheduling import cleanup_expired_holds
from app.schemas.payments import (
    OrderCreateRequest,
    OrderResponse,
    PaymentVerifyRequest,
)
from app.services.payments.pricing import calculate_split, get_pricing_config

logger = logging.getLogger("hovio.routers.payments")

router = APIRouter(prefix="/api/v1/payments", tags=["payments"])

# Contract path for server-to-server webhooks (docs/api-contract.md:
# POST /api/v1/webhooks/razorpay). The handler is also mounted under
# /api/v1/payments/webhooks/razorpay for backwards compatibility.
webhook_router = APIRouter(prefix="/api/v1/webhooks", tags=["payments"])





@router.post("/orders", response_model=OrderResponse)
async def create_payment_order(
    body: OrderCreateRequest,
    user: CurrentUser = Depends(require_role("seeker")),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
) -> Any:
    """Verify hold isn't expired, create a Razorpay order, and return order details.

    Idempotent per booking: retries (same Idempotency-Key or not) reuse the
    booking's existing 'created' order instead of creating a duplicate.
    """
    sb = get_supabase()
    # Clean up expired slot holds before order creation
    cleanup_expired_holds(sb)

    booking_id = body.booking_id

    # 1. Fetch the booking
    def _fetch_booking():
        return sb.table("bookings").select("*").eq("id", booking_id).limit(1).execute()

    res = await run_in_threadpool(_fetch_booking)
    if not res.data:
        raise HTTPException(status_code=404, detail="Booking not found.")

    booking = res.data[0]

    # Verify booking belongs to current seeker
    if booking["seeker_id"] != user.id:
        raise HTTPException(status_code=403, detail="Forbidden: You do not own this booking.")

    # Verify booking status is pending_payment
    if booking["status"] != "pending_payment":
        raise HTTPException(
            status_code=400,
            detail=f"Booking is in status '{booking['status']}', expected 'pending_payment'.",
        )

    # 2. Check slot hold expiration
    slot_id = booking["slot_id"]
    def _fetch_slot():
        return sb.table("slots").select("*").eq("id", slot_id).limit(1).execute()

    slot_res = await run_in_threadpool(_fetch_slot)
    if not slot_res.data:
        raise HTTPException(status_code=404, detail="Associated slot not found.")

    slot = slot_res.data[0]
    now = datetime.now(UTC)

    is_expired = False
    if slot["status"] != "held":
        is_expired = True
    elif slot["held_until"]:
        held_until_dt = datetime.fromisoformat(slot["held_until"].replace("Z", "+00:00"))
        if held_until_dt <= now:
            is_expired = True

    if is_expired:
        # Cancel booking and release slot
        def _cancel_and_release():
            sb.table("bookings").update({
                "status": "cancelled",
                "cancellation_reason": "Payment window expired (hold timeout)",
                "updated_at": now.isoformat(),
            }).eq("id", booking_id).execute()

            sb.table("slots").update({
                "status": "open",
                "held_until": None,
                "updated_at": now.isoformat(),
            }).eq("id", slot_id).execute()

        await run_in_threadpool(_cancel_and_release)
        raise HTTPException(
            status_code=400,
            detail="Payment window expired (hold timeout). The slot has been released.",
        )

    # 3. Check for existing order in 'created' status to keep it idempotent
    def _fetch_existing_order():
        return (
            sb.table("orders")
            .select("*")
            .eq("booking_id", booking_id)
            .eq("status", "created")
            .limit(1)
            .execute()
        )

    existing_res = await run_in_threadpool(_fetch_existing_order)
    if existing_res.data:
        return OrderResponse(**existing_res.data[0])

    # 4. Request order creation via Razorpay Adapter
    amount_paise = booking["price_inr"] * 100
    adapter = RazorpayAdapter()
    try:
        rzp_order = await adapter.create_order(amount_paise, receipt=f"bk_{booking_id}")
    except Exception as e:
        logger.exception("Order creation failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e)) from e

    # Persist the order
    order_row = {
        "booking_id": booking_id,
        "seeker_id": booking["seeker_id"],
        "therapist_id": booking["therapist_id"],
        "razorpay_order_id": rzp_order.order_id,
        "amount_paise": amount_paise,
        "currency": rzp_order.currency,
        "status": "created",
    }

    def _insert_order():
        return sb.table("orders").insert(order_row).execute()

    order_res = await run_in_threadpool(_insert_order)
    if not order_res.data:
        raise HTTPException(status_code=500, detail="Failed to persist order record.")

    return OrderResponse(**order_res.data[0])


@router.post("/verify")
async def verify_payment(
    body: PaymentVerifyRequest,
    user: CurrentUser = Depends(require_role("seeker")),
) -> Any:
    """Verify payment signature and finalize booking and payouts."""
    sb = get_supabase()
    adapter = RazorpayAdapter()

    # 1. Signature Verification
    is_valid = adapter.verify_payment_signature(
        order_id=body.razorpay_order_id,
        payment_id=body.razorpay_payment_id,
        signature=body.razorpay_signature,
    )

    if not is_valid:
        # Mark order failed and release slot
        def _fail_payment():
            # Update order
            sb.table("orders").update({
                "status": "failed",
                "updated_at": datetime.now(UTC).isoformat()
            }).eq("razorpay_order_id", body.razorpay_order_id).execute()

            # Release slot
            ord_res = sb.table("orders").select("booking_id").eq("razorpay_order_id", body.razorpay_order_id).limit(1).execute()
            if ord_res.data:
                booking_res = sb.table("bookings").select("slot_id").eq("id", ord_res.data[0]["booking_id"]).limit(1).execute()
                if booking_res.data:
                    sb.table("slots").update({
                        "status": "open",
                        "held_until": None,
                        "updated_at": datetime.now(UTC).isoformat()
                    }).eq("id", booking_res.data[0]["slot_id"]).execute()

        await run_in_threadpool(_fail_payment)
        raise HTTPException(status_code=400, detail="Invalid Razorpay signature.")

    # 2. Process valid payment
    def _fetch_order():
        return sb.table("orders").select("*").eq("razorpay_order_id", body.razorpay_order_id).limit(1).execute()

    order_res = await run_in_threadpool(_fetch_order)
    if not order_res.data:
        raise HTTPException(status_code=404, detail="Associated order not found.")

    order = order_res.data[0]
    booking_id = order["booking_id"]

    def _fetch_booking():
        return sb.table("bookings").select("*").eq("id", booking_id).limit(1).execute()

    booking_res = await run_in_threadpool(_fetch_booking)
    if not booking_res.data:
        raise HTTPException(status_code=404, detail="Associated booking not found.")

    booking = booking_res.data[0]

    # Idempotent return if already confirmed
    if booking["status"] == "confirmed":
        return {"status": "success", "message": "Booking is already confirmed."}

    # Handle payment for already cancelled bookings (due to timeout during checkout window)
    if booking["status"] == "cancelled":
        logger.error(
            "ADMIN ALERT: Seeker verified payment for ALREADY CANCELLED booking %s. Payment ID: %s",
            booking_id,
            body.razorpay_payment_id,
        )
        pricing_cfg = get_pricing_config(sb)
        commission, therapist_gross = calculate_split(
            order["amount_paise"],
            pricing_cfg["commission_percent"],
            pricing_cfg["gateway_fee_borne_by"],
            None,
        )

        def _log_cancelled_payment():
            p_row = {
                "order_id": order["id"],
                "booking_id": booking_id,
                "razorpay_payment_id": body.razorpay_payment_id,
                "status": "captured",
                "amount_paise": order["amount_paise"],
                "commission_paise": commission,
                "therapist_gross_paise": therapist_gross,
                "captured_at": datetime.now(UTC).isoformat(),
            }
            p_res = sb.table("payments").insert(p_row).execute()
            payment_id = p_res.data[0]["id"]

            payout_row = {
                "therapist_id": booking["therapist_id"],
                "payment_id": payment_id,
                "amount_paise": therapist_gross,
                "status": "on_hold",
                "notes": f"Payment captured on cancelled booking {booking_id}. Support attention required.",
            }
            sb.table("payouts").insert(payout_row).execute()

        await run_in_threadpool(_log_cancelled_payment)
        raise HTTPException(
            status_code=400,
            detail="Booking was already cancelled due to hold expiration. The payment was processed, and support has been notified for manual rescheduling or refund.",
        )

    # 3. Complete payment capture and verify details
    pricing_cfg = get_pricing_config(sb)
    payment_details = await adapter.fetch_payment(body.razorpay_payment_id)
    gateway_fee_paise = None
    payment_method = "upi"
    if payment_details:
        gateway_fee_paise = payment_details.get("fee")
        payment_method = payment_details.get("method", "upi")

    commission, therapist_gross = calculate_split(
        order["amount_paise"],
        pricing_cfg["commission_percent"],
        pricing_cfg["gateway_fee_borne_by"],
        gateway_fee_paise,
    )

    now_str = datetime.now(UTC).isoformat()
    def _confirm_booking():
        # Update order
        sb.table("orders").update({"status": "captured", "updated_at": now_str}).eq("id", order["id"]).execute()

        # Create payment record
        p_row = {
            "order_id": order["id"],
            "booking_id": booking_id,
            "razorpay_payment_id": body.razorpay_payment_id,
            "status": "captured",
            "amount_paise": order["amount_paise"],
            "commission_paise": commission,
            "therapist_gross_paise": therapist_gross,
            "gateway_fee_paise": gateway_fee_paise,
            "method": payment_method,
            "captured_at": now_str,
        }
        p_res = sb.table("payments").insert(p_row).execute()
        payment_id = p_res.data[0]["id"]

        # Confirm booking
        sb.table("bookings").update({"status": "confirmed", "updated_at": now_str}).eq("id", booking_id).execute()

        # Book slot
        sb.table("slots").update({"status": "booked", "held_until": None, "updated_at": now_str}).eq("id", booking["slot_id"]).execute()

        # Create payout row
        payout_row = {
            "therapist_id": booking["therapist_id"],
            "payment_id": payment_id,
            "amount_paise": therapist_gross,
            "status": "pending",
        }
        sb.table("payouts").insert(payout_row).execute()

    await run_in_threadpool(_confirm_booking)
    return {"status": "success", "message": "Booking confirmed and slot booked."}


@router.post("/webhooks/razorpay")
async def razorpay_webhook(
    request: Request,
) -> Any:
    """Public webhook to handle authoritative Razorpay capture and failure events."""
    body_bytes = await request.body()
    signature = request.headers.get("X-Razorpay-Signature", "")

    adapter = RazorpayAdapter()
    is_valid = adapter.verify_webhook_signature(body=body_bytes, signature=signature)
    if not is_valid:
        logger.error("Invalid Razorpay webhook signature: %s", signature)
        raise HTTPException(status_code=400, detail="Invalid webhook signature")

    try:
        payload = json.loads(body_bytes.decode())
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body") from None

    event_id = payload.get("id")
    event_type = payload.get("event")
    if not event_id:
        raise HTTPException(status_code=400, detail="Missing event ID")

    sb = get_supabase()

    # Idempotency check
    def _check_webhook_processed():
        return sb.table("webhook_events").select("*").eq("event_id", event_id).limit(1).execute()

    we_res = await run_in_threadpool(_check_webhook_processed)
    if we_res.data:
        logger.info("Webhook event %s already processed (idempotent no-op).", event_id)
        return {"status": "success", "message": "Already processed."}

    # Record event ID before processing
    def _record_webhook():
        return sb.table("webhook_events").insert({
            "event_id": event_id,
            "event_type": event_type,
            "processed_at": datetime.now(UTC).isoformat()
        }).execute()

    await run_in_threadpool(_record_webhook)

    event_data = payload.get("payload", {})
    payment_entity = event_data.get("payment", {}).get("entity", {})
    rzp_order_id = payment_entity.get("order_id")

    if not rzp_order_id:
        logger.info("Razorpay webhook event %s missing order_id. Skipping processing.", event_id)
        return {"status": "success"}

    # Find matching order
    def _fetch_order():
        return sb.table("orders").select("*").eq("razorpay_order_id", rzp_order_id).limit(1).execute()

    order_res = await run_in_threadpool(_fetch_order)
    if not order_res.data:
        logger.warning("Order %s not found in database. Skipping webhook action.", rzp_order_id)
        return {"status": "success"}

    order = order_res.data[0]
    booking_id = order["booking_id"]

    # Fetch booking
    def _fetch_booking():
        return sb.table("bookings").select("*").eq("id", booking_id).limit(1).execute()

    booking_res = await run_in_threadpool(_fetch_booking)
    if not booking_res.data:
        logger.warning("Booking %s not found in database. Skipping webhook action.", booking_id)
        return {"status": "success"}

    booking = booking_res.data[0]
    now_str = datetime.now(UTC).isoformat()

    if event_type == "payment.captured":
        if booking["status"] == "confirmed":
            logger.info("Booking %s already confirmed. Webhook is no-op.", booking_id)
            return {"status": "success"}

        # Seeker paid but slot hold timed out and booking was marked cancelled
        if booking["status"] == "cancelled":
            logger.error(
                "ADMIN ALERT (WEBHOOK): Seeker paid for ALREADY CANCELLED booking %s. Payment ID: %s",
                booking_id,
                payment_entity.get("id"),
            )
            pricing_cfg = get_pricing_config(sb)
            commission, therapist_gross = calculate_split(
                order["amount_paise"],
                pricing_cfg["commission_percent"],
                pricing_cfg["gateway_fee_borne_by"],
                None,
            )

            def _log_cancelled_payment():
                p_row = {
                    "order_id": order["id"],
                    "booking_id": booking_id,
                    "razorpay_payment_id": payment_entity.get("id"),
                    "status": "captured",
                    "amount_paise": order["amount_paise"],
                    "commission_paise": commission,
                    "therapist_gross_paise": therapist_gross,
                    "captured_at": now_str,
                }
                p_res = sb.table("payments").insert(p_row).execute()
                payment_id = p_res.data[0]["id"]

                payout_row = {
                    "therapist_id": booking["therapist_id"],
                    "payment_id": payment_id,
                    "amount_paise": therapist_gross,
                    "status": "on_hold",
                    "notes": f"Payment captured on cancelled booking {booking_id}. Support attention required.",
                }
                sb.table("payouts").insert(payout_row).execute()

            await run_in_threadpool(_log_cancelled_payment)
            return {"status": "success"}

        pricing_cfg = get_pricing_config(sb)
        gateway_fee_paise = payment_entity.get("fee")
        payment_method = payment_entity.get("method", "upi")

        commission, therapist_gross = calculate_split(
            order["amount_paise"],
            pricing_cfg["commission_percent"],
            pricing_cfg["gateway_fee_borne_by"],
            gateway_fee_paise,
        )

        def _confirm_booking():
            # Update order
            sb.table("orders").update({"status": "captured", "updated_at": now_str}).eq("id", order["id"]).execute()

            # Create payment record
            p_row = {
                "order_id": order["id"],
                "booking_id": booking_id,
                "razorpay_payment_id": payment_entity.get("id"),
                "status": "captured",
                "amount_paise": order["amount_paise"],
                "commission_paise": commission,
                "therapist_gross_paise": therapist_gross,
                "gateway_fee_paise": gateway_fee_paise,
                "method": payment_method,
                "captured_at": now_str,
            }
            p_res = sb.table("payments").insert(p_row).execute()
            payment_id = p_res.data[0]["id"]

            # Confirm booking
            sb.table("bookings").update({"status": "confirmed", "updated_at": now_str}).eq("id", booking_id).execute()

            # Book slot
            sb.table("slots").update({"status": "booked", "held_until": None, "updated_at": now_str}).eq("id", booking["slot_id"]).execute()

            # Create payout row
            payout_row = {
                "therapist_id": booking["therapist_id"],
                "payment_id": payment_id,
                "amount_paise": therapist_gross,
                "status": "pending",
            }
            sb.table("payouts").insert(payout_row).execute()

        await run_in_threadpool(_confirm_booking)

    elif event_type == "payment.failed":
        def _fail_payment():
            sb.table("orders").update({"status": "failed", "updated_at": now_str}).eq("id", order["id"]).execute()
            sb.table("payments").update({"status": "failed", "updated_at": now_str}).eq("order_id", order["id"]).execute()
            # Release slot back to open
            sb.table("slots").update({"status": "open", "held_until": None, "updated_at": now_str}).eq("id", booking["slot_id"]).execute()

        await run_in_threadpool(_fail_payment)

    return {"status": "success"}


# Mount the same handler at the contract path /api/v1/webhooks/razorpay.
webhook_router.post("/razorpay")(razorpay_webhook)
