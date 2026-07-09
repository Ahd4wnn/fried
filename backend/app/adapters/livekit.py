"""LiveKit adapter — self-hosted video/audio/chat rooms for human sessions.

The backend mints a short-lived join token at session time
(docs/integrations.md). Mobile SDKs reuse the same tokens later.
"""

from __future__ import annotations

from typing import Literal, Protocol

from pydantic import BaseModel

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
    ) -> JoinToken:
        """Mint a join token scoped to one participant in one room."""
        ...


class SelfHostedLiveKitAdapter:
    def mint_join_token(
        self,
        *,
        room: str,
        identity: str,
        name: str,
        mode: RoomMode = "video",
    ) -> JoinToken:
        raise NotImplementedError("mint_join_token: implemented in a later prompt")
