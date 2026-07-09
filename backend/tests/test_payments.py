"""Unit tests for the Hovio Payments subsystem, orders, webhooks, earnings, and admin refunds."""

from __future__ import annotations

import unittest
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi.testclient import TestClient

from app.core.security import CurrentUser, get_current_user
from app.main import app


class TestPaymentsSubsystem(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        self.client = TestClient(app)
        self.seeker_id = "00000000-0000-0000-0000-000000000001"
        self.therapist_id = "00000000-0000-0000-0000-000000000002"
        self.admin_id = "00000000-0000-0000-0000-000000000003"
        self.booking_id = "00000000-0000-0000-0000-000000000004"
        self.slot_id = "00000000-0000-0000-0000-000000000005"
        self.order_id = "00000000-0000-0000-0000-000000000006"
        self.payment_id = "00000000-0000-0000-0000-000000000007"
        self.payout_id = "00000000-0000-0000-0000-000000000008"

        # Default auth override to seeker
        app.dependency_overrides[get_current_user] = lambda: CurrentUser(
            id=self.seeker_id,
            email="seeker@hovio.org",
            role="seeker",
            status="active",
            display_name="Test Seeker",
        )

        # Setup mock Supabase client and tables
        self.sb_client, self.sb_tables = self._mock_supabase_client()

        # Patch get_supabase in all modules to ensure mocked client is used
        self.patchers = [
            patch("app.routers.payments.get_supabase", return_value=self.sb_client),
            patch("app.routers.admin.get_supabase", return_value=self.sb_client),
            patch("app.routers.therapist.get_supabase", return_value=self.sb_client),
        ]
        for p in self.patchers:
            p.start()

        # Patch RazorpayAdapter methods to avoid external network requests
        self.adapter_patchers = [
            patch("app.adapters.payments.RazorpayAdapter.create_order", new_callable=AsyncMock),
            patch("app.adapters.payments.RazorpayAdapter.verify_payment_signature", return_value=True),
            patch("app.adapters.payments.RazorpayAdapter.verify_webhook_signature", return_value=True),
            patch("app.adapters.payments.RazorpayAdapter.fetch_payment", new_callable=AsyncMock),
            patch("app.adapters.payments.RazorpayAdapter.create_refund", new_callable=AsyncMock),
        ]
        self.mock_create_order = self.adapter_patchers[0].start()
        self.mock_verify_payment_signature = self.adapter_patchers[1].start()
        self.mock_verify_webhook_signature = self.adapter_patchers[2].start()
        self.mock_fetch_payment = self.adapter_patchers[3].start()
        self.mock_create_refund = self.adapter_patchers[4].start()

    def tearDown(self) -> None:
        for p in self.patchers:
            p.stop()
        for p in self.adapter_patchers:
            p.stop()
        app.dependency_overrides.clear()

    def _mock_supabase_client(self):
        mock_client = MagicMock()
        mock_tables = {}
        tables_list = [
            "bookings",
            "slots",
            "orders",
            "payments",
            "payouts",
            "webhook_events",
            "app_config",
            "therapist_profiles",
            "profiles",
        ]
        for name in tables_list:
            mock_tables[name] = MagicMock()

        def get_mock_table(name: str):
            if name not in mock_tables:
                mock_tables[name] = MagicMock()
            return mock_tables[name]

        mock_client.table.side_effect = get_mock_table
        return mock_client, mock_tables

    def test_create_order_unauthorized(self) -> None:
        """Verify non-seekers cannot create orders."""
        app.dependency_overrides[get_current_user] = lambda: CurrentUser(
            id=self.therapist_id,
            email="therapist@hovio.org",
            role="therapist",
            status="active",
            display_name="Test Therapist",
        )
        response = self.client.post("/api/v1/payments/orders", json={"booking_id": self.booking_id})
        self.assertEqual(response.status_code, 403)

    async def test_create_order_success(self) -> None:
        """Verify successful order creation when hold is valid."""
        # Mock existing order fetch to return empty list
        self.sb_tables["orders"].select.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
            data=[]
        )

        # 1. Mock booking exists and belongs to seeker
        self.sb_tables["bookings"].select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
            data=[{
                "id": self.booking_id,
                "seeker_id": self.seeker_id,
                "therapist_id": self.therapist_id,
                "slot_id": self.slot_id,
                "status": "pending_payment",
                "price_inr": 2000,
            }]
        )

        # 2. Mock slot is held and not expired
        future_held_until = (datetime.now(UTC) + timedelta(minutes=10)).isoformat()
        self.sb_tables["slots"].select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
            data=[{
                "id": self.slot_id,
                "status": "held",
                "held_until": future_held_until,
            }]
        )

        # Mock pricing config
        self.sb_tables["app_config"].select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
            data=[{
                "key": "pricing",
                "value": {
                    "commission_percent": 25,
                    "gateway_fee_borne_by": "platform",
                    "currency": "INR",
                }
            }]
        )

        # 3. Mock RazorpayAdapter.create_order
        from app.adapters.payments import PaymentOrder
        self.mock_create_order.return_value = PaymentOrder(
            order_id="order_rzp_123",
            amount=200000,
            currency="INR",
        )

        # 4. Mock DB insert for orders
        self.sb_tables["orders"].insert.return_value.execute.return_value = MagicMock(
            data=[{
                "id": self.order_id,
                "booking_id": self.booking_id,
                "seeker_id": self.seeker_id,
                "therapist_id": self.therapist_id,
                "razorpay_order_id": "order_rzp_123",
                "amount_paise": 200000,
                "currency": "INR",
                "status": "created",
                "created_at": datetime.now(UTC).isoformat(),
            }]
        )

        response = self.client.post("/api/v1/payments/orders", json={"booking_id": self.booking_id})
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["id"], self.order_id)
        self.assertEqual(data["razorpay_order_id"], "order_rzp_123")
        self.assertEqual(data["amount_paise"], 200000)

    async def test_verify_payment_success(self) -> None:
        """Verify signature verification updates booking, slot and creates payout."""
        # Mock order fetch
        self.sb_tables["orders"].select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
            data=[{
                "id": self.order_id,
                "booking_id": self.booking_id,
                "seeker_id": self.seeker_id,
                "therapist_id": self.therapist_id,
                "amount_paise": 200000,
                "currency": "INR",
                "status": "created",
            }]
        )

        # Mock booking fetch
        self.sb_tables["bookings"].select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
            data=[{
                "id": self.booking_id,
                "seeker_id": self.seeker_id,
                "therapist_id": self.therapist_id,
                "slot_id": self.slot_id,
                "status": "pending_payment",
            }]
        )

        # Mock pricing config
        self.sb_tables["app_config"].select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
            data=[{
                "key": "pricing",
                "value": {
                    "commission_percent": 25,
                    "gateway_fee_borne_by": "platform",
                    "currency": "INR",
                }
            }]
        )

        # Mock fetch payment from Razorpay
        self.mock_fetch_payment.return_value = {
            "id": "pay_rzp_123",
            "method": "upi",
            "fee": 4000, # paise (40 INR)
        }

        # Mock DB updates
        self.sb_tables["payments"].insert.return_value.execute.return_value = MagicMock(data=[{"id": self.payment_id}])
        self.sb_tables["payouts"].insert.return_value.execute.return_value = MagicMock(data=[{"id": self.payout_id}])

        # Trigger verify
        payload = {
            "razorpay_order_id": "order_rzp_123",
            "razorpay_payment_id": "pay_rzp_123",
            "razorpay_signature": "signature_valid",
        }
        response = self.client.post("/api/v1/payments/verify", json=payload)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "success")

    async def test_webhook_payment_captured_success(self) -> None:
        """Verify webhook payment.captured event processes payment captured details."""
        webhook_payload = {
            "id": "evt_captured_123",
            "entity": "event",
            "account_id": "acc_123",
            "event": "payment.captured",
            "contains": ["payment"],
            "payload": {
                "payment": {
                    "entity": {
                        "id": "pay_rzp_123",
                        "entity": "payment",
                        "amount": 200000,
                        "currency": "INR",
                        "status": "captured",
                        "order_id": "order_rzp_123",
                        "method": "card",
                        "fee": 4000,
                    }
                }
            },
            "created_at": 1400100000
        }

        # Mock signature verified
        self.mock_verify_webhook_signature.return_value = True

        # Mock event log check (idempotency, not yet processed)
        self.sb_tables["webhook_events"].select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
            data=[]
        )

        # Mock order fetch
        self.sb_tables["orders"].select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
            data=[{
                "id": self.order_id,
                "booking_id": self.booking_id,
                "seeker_id": self.seeker_id,
                "therapist_id": self.therapist_id,
                "amount_paise": 200000,
                "currency": "INR",
                "status": "created",
            }]
        )

        # Mock booking fetch
        self.sb_tables["bookings"].select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
            data=[{
                "id": self.booking_id,
                "seeker_id": self.seeker_id,
                "therapist_id": self.therapist_id,
                "slot_id": self.slot_id,
                "status": "pending_payment",
            }]
        )

        # Mock pricing config
        self.sb_tables["app_config"].select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
            data=[{
                "key": "pricing",
                "value": {
                    "commission_percent": 25,
                    "gateway_fee_borne_by": "platform",
                    "currency": "INR",
                }
            }]
        )

        # Trigger Webhook
        response = self.client.post(
            "/api/v1/payments/webhooks/razorpay",
            json=webhook_payload,
            headers={"X-Razorpay-Signature": "signature_123"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "success")

    async def test_therapist_earnings(self) -> None:
        """Verify therapist can view earnings breakdown."""
        app.dependency_overrides[get_current_user] = lambda: CurrentUser(
            id=self.therapist_id,
            email="therapist@hovio.org",
            role="therapist",
            status="active",
            display_name="Test Therapist",
        )

        # Mock therapist payouts fetch
        self.sb_tables["payouts"].select.return_value.eq.return_value.execute.return_value = MagicMock(
            data=[
                {
                    "id": "payout-1",
                    "therapist_id": self.therapist_id,
                    "amount_paise": 150000, # Gross earned
                    "status": "paid",
                    "payment_id": self.payment_id,
                    "reference": "ref-123",
                    "payments": {
                        "booking_id": self.booking_id,
                        "amount_paise": 200000,
                        "bookings": {
                            "starts_at": "2026-06-24T12:00:00Z",
                            "modality": "video"
                        }
                    },
                    "created_at": "2026-06-24T10:00:00Z",
                }
            ]
        )

        response = self.client.get("/api/v1/therapist/earnings")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["total_earned_paise"], 150000)
        self.assertEqual(data["paid_payout_paise"], 150000)
        self.assertEqual(len(data["sessions"]), 1)
        self.assertEqual(data["sessions"][0]["booking_id"], self.booking_id)

    async def test_admin_payments(self) -> None:
        """Verify admin can view payments logs."""
        app.dependency_overrides[get_current_user] = lambda: CurrentUser(
            id=self.admin_id,
            email="admin@hovio.org",
            role="admin",
            status="active",
            display_name="Test Admin",
        )

        # Mock orders list
        self.sb_tables["orders"].select.return_value.order.return_value.execute.return_value = MagicMock(
            data=[{
                "id": self.order_id,
                "booking_id": self.booking_id,
                "seeker_id": self.seeker_id,
                "therapist_id": self.therapist_id,
                "razorpay_order_id": "order_rzp_123",
                "amount_paise": 200000,
                "currency": "INR",
                "status": "created",
                "created_at": "2026-06-24T10:00:00Z",
            }]
        )

        # Mock payments list
        self.sb_tables["payments"].select.return_value.order.return_value.execute.return_value = MagicMock(
            data=[{
                "id": self.payment_id,
                "order_id": self.order_id,
                "booking_id": self.booking_id,
                "razorpay_payment_id": "pay_rzp_123",
                "amount_paise": 200000,
                "commission_paise": 50000,
                "therapist_gross_paise": 150000,
                "gateway_fee_paise": 4000,
                "method": "upi",
                "refunded_paise": 0,
                "status": "captured",
                "created_at": "2026-06-24T10:05:00Z",
            }]
        )

        # Mock payouts list
        self.sb_tables["payouts"].select.return_value.order.return_value.execute.return_value = MagicMock(
            data=[{
                "id": self.payout_id,
                "therapist_id": self.therapist_id,
                "payment_id": self.payment_id,
                "amount_paise": 150000,
                "status": "pending",
                "reference": None,
                "notes": None,
                "created_at": "2026-06-24T10:05:00Z",
            }]
        )

        response = self.client.get("/api/v1/admin/payments")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data["orders"]), 1)
        self.assertEqual(len(data["payments"]), 1)
        self.assertEqual(len(data["payouts"]), 1)

    async def test_admin_refund(self) -> None:
        """Verify admin can initiate a refund."""
        app.dependency_overrides[get_current_user] = lambda: CurrentUser(
            id=self.admin_id,
            email="admin@hovio.org",
            role="admin",
            status="active",
            display_name="Test Admin",
        )

        # 1. Mock payment to refund
        self.sb_tables["payments"].select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
            data=[{
                "id": self.payment_id,
                "order_id": self.order_id,
                "razorpay_payment_id": "pay_rzp_123",
                "amount_paise": 200000,
                "refunded_paise": 0,
                "status": "captured",
            }]
        )

        # Mock payouts list associated with payment
        self.sb_tables["payouts"].select.return_value.eq.return_value.execute.return_value = MagicMock(
            data=[{
                "id": self.payout_id,
                "status": "pending",
            }]
        )

        # 2. Call refund endpoint
        response = self.client.post(
            f"/api/v1/admin/payments/{self.payment_id}/refund",
            json={"amount_paise": 100000}, # Partial refund
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "success")
        self.mock_create_refund.assert_called_once_with("pay_rzp_123", 100000)
