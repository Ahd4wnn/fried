"""LiveKit adapter — self-hosted video/audio/chat rooms for human sessions.

The backend mints a short-lived join token at session time
(docs/integrations.md). Mobile SDKs reuse the same tokens later.

PRIVACY: the LiveKit API secret lives only here on the server. The client
receives a signed, room-scoped, expiring JWT — never the secret itself.
"""

from __future__ import annotations

import time
from typing import Literal, Protocol

import jwt
from pydantic import BaseModel

from app.core.config import get_settings

RoomMode = Literal["video", "audio", "chat"]


class JoinToken(BaseModel):
    token: str
    room: str
    url: str


class LiveKitAdapter(Protocol):
    def mint_join_token(
        self,
        *,
        room: str,
        identity: str,
        name: str,
        mode: RoomMode = "video",
        ttl_seconds: int = 3600,
    ) -> JoinToken:
        """Mint a join token scoped to one participant in one room."""
        ...


class LiveKitNotConfiguredError(RuntimeError):
    """Raised when LIVEKIT_URL / API key / secret are missing from the env."""


class SelfHostedLiveKitAdapter:
    def __init__(self) -> None:
        settings = get_settings()
        self._url = settings.LIVEKIT_URL
        self._api_key = settings.LIVEKIT_API_KEY
        self._api_secret = settings.LIVEKIT_API_SECRET

    @property
    def is_configured(self) -> bool:
        return bool(self._url and self._api_key and self._api_secret)

    def mint_join_token(
        self,
        *,
        room: str,
        identity: str,
        name: str,
        mode: RoomMode = "video",
        ttl_seconds: int = 3600,
    ) -> JoinToken:
        """Mint a LiveKit access token (HS256 JWT) scoped to one room + modality.

        Grants are the narrowest that still serve the modality:
        - video: publish camera + microphone
        - audio: publish microphone only
        - chat:  no media publish at all — data channel only
        All modes may subscribe and publish data (chat sidebar / signalling).
        """
        if not self.is_configured:
            raise LiveKitNotConfiguredError(
                "LiveKit is not configured (LIVEKIT_URL / LIVEKIT_API_KEY / "
                "LIVEKIT_API_SECRET)."
            )

        publish_sources: dict[RoomMode, list[str]] = {
            "video": ["camera", "microphone"],
            "audio": ["microphone"],
            "chat": [],
        }
        sources = publish_sources[mode]

        now = int(time.time())
        claims = {
            "iss": self._api_key,
            "sub": identity,
            "name": name,
            "nbf": now - 10,  # small clock-skew allowance
            "exp": now + ttl_seconds,
            "video": {
                "room": room,
                "roomJoin": True,
                "canPublish": bool(sources),
                "canPublishSources": sources,
                "canSubscribe": True,
                "canPublishData": True,
                # Never allow clients to record or admin the room.
                "recorder": False,
                "roomAdmin": False,
                "roomCreate": False,
            },
        }
        token = jwt.encode(claims, self._api_secret, algorithm="HS256")
        return JoinToken(token=token, room=room, url=self._url)
