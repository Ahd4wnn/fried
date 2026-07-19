"""Pydantic schemas for live (LiveKit) sessions and therapist private notes."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

LiveSessionStatus = Literal["scheduled", "live", "completed", "cancelled", "no_show"]


class LiveSessionState(BaseModel):
    """State of one live session, scoped to the requesting participant.

    Contains metadata only — never transcripts, notes, or tokens.
    """

    booking_id: str
    live_session_id: str
    modality: Literal["video", "audio", "chat"]
    status: LiveSessionStatus
    starts_at: str
    ends_at: str
    started_at: str | None = None
    ended_at: str | None = None
    my_role: Literal["seeker", "therapist"]
    other_party_name: str | None = None
    can_join: bool = False
    join_opens_at: str
    join_closes_at: str
    duration_minutes: int | None = None
    # Therapist-side only: whether a private note exists for this session.
    has_note: bool = False


class LiveTokenResponse(BaseModel):
    """A server-minted LiveKit join token. The API secret never leaves the server."""

    token: str
    url: str
    room: str
    identity: str
    modality: Literal["video", "audio", "chat"]
    other_party_name: str | None = None


class SessionNoteUpsert(BaseModel):
    text: str = Field(min_length=1, max_length=20_000)


class SessionNoteResponse(BaseModel):
    text: str | None = None
    updated_at: str | None = None
