"""Pydantic schemas for payment, order, and payout operations."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

PaymentStatus = Literal["created", "authorized", "captured", "failed", "refunded", "partially_refunded"]
PayoutStatus = Literal["pending", "processing", "paid", "failed", "on_hold"]


class OrderCreateRequest(BaseModel):
    booking_id: str = Field(..., description="ID of the pending_payment booking")


class OrderResponse(BaseModel):
    id: str
    booking_id: str
    seeker_id: str
    therapist_id: str
    razorpay_order_id: str | None = None
    amount_paise: int
    currency: str
    status: PaymentStatus
    created_at: datetime


class PaymentVerifyRequest(BaseModel):
    razorpay_order_id: str = Field(..., description="Razorpay Order ID")
    razorpay_payment_id: str = Field(..., description="Razorpay Payment ID")
    razorpay_signature: str = Field(..., description="Razorpay HMAC signature")


class PayoutBrief(BaseModel):
    id: str
    therapist_id: str
    payment_id: str | None = None
    amount_paise: int
    status: PayoutStatus
    reference: str | None = None
    notes: str | None = None
    created_at: datetime


class EarningsSessionBrief(BaseModel):
    booking_id: str
    starts_at: str
    modality: str
    session_price_paise: int
    therapist_gross_paise: int
    payout_status: PayoutStatus
    payout_reference: str | None = None


class TherapistEarningsResponse(BaseModel):
    total_earned_paise: int
    pending_payout_paise: int
    paid_payout_paise: int
    sessions: list[EarningsSessionBrief]


class PaymentBrief(BaseModel):
    id: str
    order_id: str
    booking_id: str
    razorpay_payment_id: str | None = None
    status: PaymentStatus
    amount_paise: int
    commission_paise: int
    therapist_gross_paise: int
    gateway_fee_paise: int | None = None
    method: str | None = None
    refunded_paise: int
    captured_at: datetime | None = None
    created_at: datetime


class AdminPaymentsResponse(BaseModel):
    orders: list[OrderResponse]
    payments: list[PaymentBrief]
    payouts: list[PayoutBrief]


class AdminRefundRequest(BaseModel):
    amount_paise: int | None = Field(
        default=None,
        description="Amount to refund in paise. If omitted, the full payment amount is refunded.",
    )
