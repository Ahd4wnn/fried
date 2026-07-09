"""Payments adapter — Razorpay (INR, pay-per-session for human sessions).

Orders + signature verification + idempotent webhooks (docs/integrations.md).
The AI companion is free in v1; only human sessions are charged.
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import uuid
from typing import Protocol

import httpx
from pydantic import BaseModel

from app.core.config import get_settings

logger = logging.getLogger("hovio.adapters.payments")


class PaymentOrder(BaseModel):
    order_id: str
    amount: int  # in paise (INR minor units)
    currency: str = "INR"


class PaymentsAdapter(Protocol):
    async def create_order(self, amount: int, *, receipt: str) -> PaymentOrder:
        """Create a payment order for a booking."""
        ...

    def verify_payment_signature(self, *, order_id: str, payment_id: str, signature: str) -> bool:
        """Verify the client-returned payment signature."""
        ...

    def verify_webhook_signature(self, *, body: bytes, signature: str) -> bool:
        """Verify an inbound webhook payload signature (idempotency handled upstream)."""
        ...

    async def fetch_payment(self, payment_id: str) -> dict | None:
        """Fetch payment details from Razorpay API."""
        ...

    async def create_refund(self, payment_id: str, amount_paise: int) -> dict | None:
        """Create a refund via Razorpay API."""
        ...


class RazorpayAdapter:
    async def create_order(self, amount: int, *, receipt: str) -> PaymentOrder:
        settings = get_settings()
        # Fallback/Mock for local testing when keys are missing or invalid
        if not settings.RAZORPAY_KEY_ID or not settings.RAZORPAY_KEY_SECRET:
            mock_id = f"order_mock_{uuid.uuid4().hex[:14]}"
            logger.info("Razorpay credentials missing. Generating mock order: %s", mock_id)
            return PaymentOrder(order_id=mock_id, amount=amount)

        url = "https://api.razorpay.com/v1/orders"
        auth = (settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET)
        payload = {
            "amount": amount,
            "currency": "INR",
            "receipt": receipt,
        }

        async with httpx.AsyncClient() as client:
            try:
                response = await client.post(url, json=payload, auth=auth, timeout=10.0)
                if response.status_code != 200:
                    logger.error("Razorpay order creation failed: %s", response.text)
                    raise RuntimeError(f"Razorpay order creation failed: {response.text}")
                data = response.json()
                return PaymentOrder(
                    order_id=data["id"],
                    amount=data["amount"],
                    currency=data["currency"],
                )
            except Exception as e:
                logger.exception("Error calling Razorpay order endpoint: %s", e)
                # Fail open/mock for local env if request fails to avoid blocking developer flow
                if settings.is_local:
                    mock_id = f"order_mock_{uuid.uuid4().hex[:14]}"
                    return PaymentOrder(order_id=mock_id, amount=amount)
                raise

    def verify_payment_signature(self, *, order_id: str, payment_id: str, signature: str) -> bool:
        settings = get_settings()
        if not settings.RAZORPAY_KEY_SECRET:
            # Fallback/mock success in local environment
            if order_id.startswith("order_mock_"):
                return True
            return False

        if not signature:
            return False

        msg = f"{order_id}|{payment_id}".encode()
        expected = hmac.new(settings.RAZORPAY_KEY_SECRET.encode(), msg, hashlib.sha256).hexdigest()
        return hmac.compare_digest(expected, signature)

    def verify_webhook_signature(self, *, body: bytes, signature: str) -> bool:
        settings = get_settings()
        webhook_secret = settings.RAZORPAY_WEBHOOK_SECRET or "hovio_webhook_secret_123"

        if not signature:
            return False

        expected = hmac.new(webhook_secret.encode(), body, hashlib.sha256).hexdigest()
        return hmac.compare_digest(expected, signature)

    async def fetch_payment(self, payment_id: str) -> dict | None:
        settings = get_settings()
        if not settings.RAZORPAY_KEY_ID or not settings.RAZORPAY_KEY_SECRET or payment_id.startswith("pay_mock_"):
            # Mock response for local development
            return {
                "id": payment_id,
                "amount": 0,
                "fee": 4425,  # mock fee (44.25 INR)
                "method": "upi",
                "status": "captured",
            }

        url = f"https://api.razorpay.com/v1/payments/{payment_id}"
        auth = (settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET)

        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(url, auth=auth, timeout=10.0)
                if response.status_code != 200:
                    logger.error("Failed to fetch Razorpay payment %s: %s", payment_id, response.text)
                    return None
                return response.json()
            except Exception as e:
                logger.exception("Error calling Razorpay fetch payment: %s", e)
                return None

    async def create_refund(self, payment_id: str, amount_paise: int) -> dict | None:
        settings = get_settings()
        if not settings.RAZORPAY_KEY_ID or not settings.RAZORPAY_KEY_SECRET or payment_id.startswith("pay_mock_"):
            return {
                "id": f"rfnd_mock_{uuid.uuid4().hex[:14]}",
                "payment_id": payment_id,
                "amount": amount_paise,
                "status": "processed",
            }

        url = f"https://api.razorpay.com/v1/payments/{payment_id}/refund"
        auth = (settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET)
        payload = {
            "amount": amount_paise,
        }

        async with httpx.AsyncClient() as client:
            try:
                response = await client.post(url, json=payload, auth=auth, timeout=10.0)
                if response.status_code != 200:
                    logger.error("Razorpay refund request failed for payment %s: %s", payment_id, response.text)
                    raise RuntimeError(f"Razorpay refund failed: {response.text}")
                return response.json()
            except Exception as e:
                logger.exception("Error calling Razorpay refund: %s", e)
                raise
