"""Transactional email adapter.

Same event set as WhatsApp, plus auth emails Supabase doesn't cover. The
provider (Brevo / Resend / SES) stays behind this interface so it is swappable
(docs/integrations.md). Sends are logged as metadata only — never PII payloads.
"""

from __future__ import annotations

from typing import Protocol

from pydantic import BaseModel


class EmailSendResult(BaseModel):
    provider_message_id: str
    accepted: bool


class EmailAdapter(Protocol):
    async def send(
        self,
        *,
        to_email: str,
        subject: str,
        template_name: str,
        variables: dict[str, str],
    ) -> EmailSendResult:
        """Send a templated transactional email."""
        ...


class TransactionalEmailAdapter:
    async def send(
        self,
        *,
        to_email: str,
        subject: str,
        template_name: str,
        variables: dict[str, str],
    ) -> EmailSendResult:
        raise NotImplementedError("send: implemented in a later prompt")
