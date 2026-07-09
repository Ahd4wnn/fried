"""WhatsApp notifications adapter — Interakt (WhatsApp Business Cloud API).

Transactional, template-based sends from day one: booking confirmations,
reminders, verification updates (docs/integrations.md). Sends are logged as
metadata only — never the PII payload.
"""

from __future__ import annotations

from typing import Protocol

from pydantic import BaseModel


class WhatsAppSendResult(BaseModel):
    provider_message_id: str
    accepted: bool


class NotificationsAdapter(Protocol):
    async def send_template(
        self,
        *,
        to_phone: str,
        template_name: str,
        variables: dict[str, str],
    ) -> WhatsAppSendResult:
        """Send a templated WhatsApp message."""
        ...


class InteraktAdapter:
    async def send_template(
        self,
        *,
        to_phone: str,
        template_name: str,
        variables: dict[str, str],
    ) -> WhatsAppSendResult:
        raise NotImplementedError("send_template: implemented in a later prompt")
