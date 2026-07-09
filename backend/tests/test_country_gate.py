"""Unit tests for country gating in onboarding and the AI chat reporting subsystem."""

from __future__ import annotations

import unittest
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from app.core.security import CurrentUser, get_current_user
from app.main import app


class TestCountryAndReports(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        self.client = TestClient(app)
        self.seeker_id = "00000000-0000-0000-0000-000000000002"
        self.admin_id = "00000000-0000-0000-0000-000000000003"
        self.session_id = "00000000-0000-0000-0000-000000000004"
        self.message_id = "00000000-0000-0000-0000-000000000005"
        self.report_id = "00000000-0000-0000-0000-000000000006"

        # Default authenticate as seeker
        app.dependency_overrides[get_current_user] = lambda: CurrentUser(
            id=self.seeker_id,
            email="seeker@hovio.org",
            role="seeker",
            status="active",
            display_name="Test Seeker",
        )

    def tearDown(self) -> None:
        app.dependency_overrides.clear()

    @patch("app.services.onboarding.get_supabase")
    @patch("app.services.audit.get_supabase")
    @patch("app.services.onboarding.get_supported_countries")
    async def test_onboarding_country_gate(
        self,
        mock_supported_countries: MagicMock,
        mock_audit_supabase: MagicMock,
        mock_onboarding_supabase: MagicMock,
    ) -> None:
        """Verify that onboarding only completes for supported countries."""
        mock_supported_countries.return_value = ["IN"]

        mock_client = MagicMock()
        mock_onboarding_supabase.return_value = mock_client
        mock_audit_supabase.return_value = mock_client

        # Mock legal_acceptances check
        mock_client.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock(
            data=[]
        )

        payload = {
            "name": "Test User",
            "country": "US",  # Unsupported
            "age": 25,
            "gender": "man",
            "relationship_status": "single",
            "tried_therapy": False,
            "financial_situation": "comfortable",
            "referral_source": "google",
            "concerns": [],
            "support_system": "strong",
            "medication": "no",
            "preferred_language": "english",
            "therapist_gender_preference": "no_preference",
            "agreement": {
                "age_confirmed": True,
                "terms": True,
                "privacy": True,
            },
            "consents": {
                "data_processing": True,
                "ai_memory": True,
                "notifications_whatsapp": False,
                "notifications_email": False,
            },
            "suitability_none_apply": True,
        }

        # 1. POST to /onboarding for US (unsupported) should raise 422
        resp = self.client.post("/api/v1/onboarding", json=payload)
        self.assertEqual(resp.status_code, 422)
        data = resp.json()
        self.assertEqual(data["error"]["code"], "unsupported_country")

        # Profiles country should have been updated anyway
        mock_client.table.assert_any_call("profiles")
        mock_client.table.return_value.update.assert_any_call({"country": "US"})

        # 2. POST to /onboarding for IN (supported) should succeed
        payload["country"] = "IN"

        # Reset mocks
        mock_client.reset_mock()
        mock_client.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock(
            data=[]
        )

        # Mock other supabase calls inside submit_onboarding
        mock_client.table.return_value.upsert.return_value.execute.return_value = MagicMock()
        mock_client.table.return_value.insert.return_value.execute.return_value = MagicMock()
        mock_client.table.return_value.update.return_value.eq.return_value.execute.return_value = (
            MagicMock()
        )

        resp = self.client.post("/api/v1/onboarding", json=payload)
        self.assertEqual(resp.status_code, 200)
        result = resp.json()
        self.assertTrue(result["onboarding_completed"])
        self.assertFalse(result["suitability_flagged"])

    @patch("app.routers.ai.get_supabase")
    @patch("app.routers.ai.encrypt")
    async def test_create_and_get_reports(
        self,
        mock_encrypt: MagicMock,
        mock_supabase: MagicMock,
    ) -> None:
        """Verify report creation (encrypted description) and fetching."""
        mock_encrypt.return_value = (b"cipher_data", b"nonce_data")
        mock_client = MagicMock()
        mock_supabase.return_value = mock_client

        # Mock insert response
        mock_report_row = {
            "id": self.report_id,
            "reporter_id": self.seeker_id,
            "session_id": self.session_id,
            "message_id": self.message_id,
            "category": "harmful",
            "status": "open",
            "created_at": "2026-06-23T12:00:00Z",
            "updated_at": "2026-06-23T12:00:00Z",
        }
        mock_client.table.return_value.insert.return_value.execute.return_value = MagicMock(
            data=[mock_report_row]
        )

        payload = {
            "session_id": self.session_id,
            "message_id": self.message_id,
            "category": "harmful",
            "description": "This is harmful text.",
        }

        # Test POST /reports
        resp = self.client.post("/api/v1/ai/reports", json=payload)
        self.assertEqual(resp.status_code, 200)
        res_data = resp.json()
        self.assertEqual(res_data["id"], self.report_id)
        self.assertEqual(res_data["category"], "harmful")
        self.assertEqual(res_data["status"], "open")

        mock_encrypt.assert_called_once_with(self.seeker_id, "This is harmful text.")
        mock_client.table.assert_called_with("ai_reports")
        mock_client.table.return_value.insert.assert_called_once_with(
            {
                "reporter_id": self.seeker_id,
                "session_id": self.session_id,
                "message_id": self.message_id,
                "category": "harmful",
                "description_cipher": "\\x6369706865725f64617461",  # "cipher_data" in hex
                "description_nonce": "\\x6e6f6e63655f64617461",  # "nonce_data" in hex
                "status": "open",
            }
        )

        # Test GET /reports
        mock_client.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value = MagicMock(
            data=[mock_report_row]
        )
        resp = self.client.get("/api/v1/ai/reports")
        self.assertEqual(resp.status_code, 200)
        items = resp.json()
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["id"], self.report_id)

    @patch("app.routers.ai.get_supabase")
    @patch("app.routers.ai.decrypt")
    @patch("app.routers.ai.write_audit")
    async def test_admin_triage_and_decrypt(
        self,
        mock_write_audit: MagicMock,
        mock_decrypt: MagicMock,
        mock_supabase: MagicMock,
    ) -> None:
        """Verify admin listing, status triaging, and audited decryption."""
        # Authenticate as admin
        app.dependency_overrides[get_current_user] = lambda: CurrentUser(
            id=self.admin_id,
            email="admin@hovio.org",
            role="admin",
            status="active",
            display_name="Test Admin",
        )

        mock_client = MagicMock()
        mock_supabase.return_value = mock_client

        mock_report_row = {
            "id": self.report_id,
            "reporter_id": self.seeker_id,
            "session_id": self.session_id,
            "message_id": self.message_id,
            "category": "harmful",
            "description_cipher": b"cipher_desc",
            "description_nonce": b"nonce_desc",
            "status": "open",
            "created_at": "2026-06-23T12:00:00Z",
            "updated_at": "2026-06-23T12:00:00Z",
        }

        # Mock DB queries
        # 1. fetch report for patch and decrypt
        mock_client.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
            data=[mock_report_row]
        )
        # 2. update report response
        mock_client.table.return_value.update.return_value.eq.return_value.execute.return_value = (
            MagicMock(data=[{**mock_report_row, "status": "under_review"}])
        )
        # 3. fetch message for decrypt
        mock_client.table.return_value.select.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
            data=[
                {
                    "id": self.message_id,
                    "user_id": self.seeker_id,
                    "ciphertext": b"cipher_msg",
                    "nonce": b"nonce_msg",
                }
            ]
        )

        # A. Triage status
        resp = self.client.patch(
            f"/api/v1/ai/admin/reports/{self.report_id}", json={"status": "under_review"}
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["status"], "under_review")

        # B. Audited decrypt
        mock_decrypt.side_effect = ["Decrypted description content", "Decrypted message content"]

        resp = self.client.post(f"/api/v1/ai/admin/reports/{self.report_id}/decrypt")
        self.assertEqual(resp.status_code, 200)
        res_data = resp.json()
        self.assertEqual(res_data["reported_message_content"], "Decrypted message content")
        self.assertEqual(res_data["reporter_description"], "Decrypted description content")

        # Assert audit log was written
        mock_write_audit.assert_called_once_with(
            actor_id=self.admin_id,
            action="reported_message_decrypted",
            target_table="ai_reports",
            target_id=self.report_id,
            metadata={
                "reporter_id": self.seeker_id,
                "message_id": self.message_id,
                "category": "harmful",
            },
        )
