"""Schemas for therapist availability, slots, and bookings."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

SlotStatus = Literal["open", "held", "booked", "blocked"]
SessionModality = Literal["video", "audio", "chat"]
BookingStatus = Literal["pending_payment", "confirmed", "completed", "cancelled", "no_show"]


class AvailabilityBlockBase(BaseModel):
    is_recurring: bool = Field(default=True)
    day_of_week: int | None = Field(default=None, ge=0, le=6, description="0=Sun..6=Sat")
    specific_date: str | None = Field(default=None, description="YYYY-MM-DD")
    start_time: str = Field(..., description="HH:MM or HH:MM:SS")
    end_time: str = Field(..., description="HH:MM or HH:MM:SS")
    timezone: str = Field(default="Asia/Kolkata")
    active: bool = Field(default=True)


class AvailabilityBlockCreate(AvailabilityBlockBase):
    pass


class AvailabilityBlockUpdate(BaseModel):
    is_recurring: bool | None = None
    day_of_week: int | None = Field(default=None, ge=0, le=6)
    specific_date: str | None = None
    start_time: str | None = None
    end_time: str | None = None
    timezone: str | None = None
    active: bool | None = None


class AvailabilityBlockResponse(AvailabilityBlockBase):
    id: str
    therapist_id: str
    created_at: str
    updated_at: str


class SlotResponse(BaseModel):
    id: str
    therapist_id: str
    starts_at: str
    ends_at: str
    status: SlotStatus
    held_until: str | None = None


class BookingCreate(BaseModel):
    therapist_id: str
    starts_at: str  # ISO UTC
    modality: SessionModality
    escalation_id: str | None = None


class BookingCancelRequest(BaseModel):
    reason: str = Field(..., min_length=5, max_length=1000)


class BookingRescheduleRequest(BaseModel):
    new_slot_id: str


class BookingResponse(BaseModel):
    id: str
    seeker_id: str
    therapist_id: str
    slot_id: str | None = None
    escalation_id: str | None = None
    status: BookingStatus
    modality: SessionModality
    starts_at: str
    ends_at: str
    price_inr: int
    cancelled_by: str | None = None
    cancelled_at: str | None = None
    cancellation_reason: str | None = None
    created_at: str
    updated_at: str
    therapist_name: str | None = None
    seeker_name: str | None = None
