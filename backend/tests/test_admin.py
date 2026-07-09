"""Unit tests for the Hovio Admin Portal router and security boundaries."""

from __future__ import annotations

import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi.testclient import TestClient

from app.core.security import CurrentUser, get_current_user
from app.main import app


class TestAdminPortal(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        self.client = TestClient(app)
        self.admin_id = "00000000-0000-0000-0000-000000000001"
        self.seeker_id = "00000000-0000-0000-0000-000000000002"
        self.therapist_id = "00000000-0000-0000-0000-000000000003"
        self.verification_id = "00000000-0000-0000-0000-000000000004"
        self.report_id = "00000000-0000-0000-0000-000000000005"
        self.escalation_id = "00000000-0000-0000-0000-000000000006"

        # Default auth override to admin
        app.dependency_overrides[get_current_user] = lambda: CurrentUser(
            id=self.admin_id,
            email="admin@hovio.org",
            role="admin",
            status="active",
            display_name="Test Admin",
        )

        # Mock Key Provider for crypto service
        self.gp_patcher = patch("app.services.crypto.service.get_key_provider")
        self.mock_gp = self.gp_patcher.start()
        self.mock_provider = MagicMock()
        self.mock_provider.unwrap_key = AsyncMock(return_value=b"A" * 32)
        self.mock_provider.wrap_key = AsyncMock(return_value=b"B" * 32)
        self.mock_gp.return_value = self.mock_provider

        # Setup mock Supabase client and tables
        self.sb_client, self.sb_tables = self._mock_supabase_client()

        # Patch get_supabase in all modules to ensure mocked client is used
        self.patchers = [
            patch("app.routers.admin.get_supabase", return_value=self.sb_client),
            patch("app.services.audit.get_supabase", return_value=self.sb_client),
            patch("app.services.crypto.service.get_supabase", return_value=self.sb_client),
        ]
        for p in self.patchers:
            p.start()

    def tearDown(self) -> None:
        for p in self.patchers:
            p.stop()
        self.gp_patcher.stop()
        app.dependency_overrides.clear()

    def _mock_supabase_client(self):
        mock_client = MagicMock()
        mock_tables = {}
        tables_list = [
            "verification_requests",
            "profiles",
            "therapist_profiles",
            "credential_docs",
            "ai_reports",
            "ai_messages",
            "ai_sessions",
            "sensitive_access_log",
            "audit_log",
            "admin_actions",
            "crisis_events",
            "crisis_events_monitor",
            "intake_summaries",
            "encryption_keys",
        ]
        for name in tables_list:
            mock_tables[name] = MagicMock()

        def get_mock_table(name: str):
            if name not in mock_tables:
                mock_tables[name] = MagicMock()
            return mock_tables[name]

        mock_client.table.side_effect = get_mock_table
        return mock_client, mock_tables

    async def test_admin_gating_unauthorized(self) -> None:
        """Verify non-admin users (e.g. seekers) receive a 403 Access Denied."""
        app.dependency_overrides[get_current_user] = lambda: CurrentUser(
            id=self.seeker_id,
            email="seeker@hovio.org",
            role="seeker",
            status="active",
            display_name="Test Seeker",
        )

        response = self.client.get("/api/v1/admin/kpis")
        self.assertEqual(response.status_code, 403)
        self.assertIn("You don’t have access to that.", response.text)

    async def test_get_kpis(self) -> None:
        """Verify dashboard KPI overview metrics return expected counts."""
        # Configure counts mocks for each table query
        self.sb_tables["verification_requests"].select.return_value.in_.return_value.execute.return_value = MagicMock(count=2)
        self.sb_tables["ai_reports"].select.return_value.eq.return_value.execute.return_value = MagicMock(count=3)
        self.sb_tables["crisis_events"].select.return_value.gte.return_value.execute.return_value = MagicMock(count=1)
        self.sb_tables["profiles"].select.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock(count=10)
        self.sb_tables["therapist_profiles"].select.return_value.eq.return_value.execute.return_value = MagicMock(count=5)

        response = self.client.get("/api/v1/admin/kpis")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["pending_verifications"], 2)
        self.assertEqual(data["open_reports"], 3)
        self.assertEqual(data["crisis_events_today"], 1)
        self.assertEqual(data["active_users"], 10)
        self.assertEqual(data["active_therapists"], 5)

    async def test_list_verifications(self) -> None:
        """Verify pending verifications are listed and sorted correctly."""
        # Mock verification requests returned
        self.sb_tables["verification_requests"].select.return_value.execute.return_value = MagicMock(
            data=[
                {
                    "id": "req-1",
                    "therapist_id": self.therapist_id,
                    "status": "pending",
                    "created_at": "2026-06-24T10:00:00Z",
                },
                {
                    "id": "req-2",
                    "therapist_id": self.therapist_id,
                    "status": "under_review",
                    "created_at": "2026-06-24T11:00:00Z",
                },
            ]
        )

        # Mock profile join data
        self.sb_tables["profiles"].select.return_value.in_.return_value.execute.return_value = MagicMock(
            data=[{"id": self.therapist_id, "display_name": "Dr. House", "avatar_url": None}]
        )
        self.sb_tables["therapist_profiles"].select.return_value.in_.return_value.execute.return_value = MagicMock(
            data=[
                {
                    "id": self.therapist_id,
                    "professional_title": "Psychiatrist",
                    "years_experience": 15,
                    "specializations": ["Depression"],
                    "languages": ["English"],
                    "bio": "Bio content",
                    "gender": "male",
                    "price_inr": 2000,
                    "practice_setting": "clinic",
                }
            ]
        )

        response = self.client.get("/api/v1/admin/verifications")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data), 2)
        # Should sort "under_review" first
        self.assertEqual(data[0]["id"], "req-2")
        self.assertEqual(data[0]["status"], "under_review")
        self.assertEqual(data[0]["therapist_profile"]["display_name"], "Dr. House")

    @patch("app.routers.admin.decrypt")
    async def test_decrypt_verification(self, mock_decrypt: AsyncMock) -> None:
        """Verify decryption of credentials triggers audit log writing."""
        # Mock verification request data
        self.sb_tables["verification_requests"].select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
            data=[
                {
                    "id": self.verification_id,
                    "therapist_id": self.therapist_id,
                    "legal_name_cipher": "\\x01",
                    "legal_name_nonce": "\\x02",
                    "registration_number_cipher": "\\x03",
                    "registration_number_nonce": "\\x04",
                }
            ]
        )

        # Mock credentials docs
        self.sb_tables["credential_docs"].select.return_value.eq.return_value.execute.return_value = MagicMock(
            data=[{"id": "doc-1", "doc_type": "license", "storage_path": "licenses/house.pdf"}]
        )

        # Mock storage signing URL
        mock_storage = MagicMock()
        mock_storage.from_.return_value.create_signed_url.return_value = {"signedUrl": "https://signed.url/licenses/house.pdf"}
        self.sb_client.storage = mock_storage

        # Mock decrypted responses
        mock_decrypt.side_effect = ["Gregory House", "RCI-998877"]

        response = self.client.post(
            f"/api/v1/admin/verifications/{self.verification_id}/decrypt",
            json={"reason": "Manual licensing review for state board audit"},
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["legal_name"], "Gregory House")
        self.assertEqual(data["registration_number"], "RCI-998877")
        self.assertEqual(data["documents"][0]["signed_url"], "https://signed.url/licenses/house.pdf")

        # Verify audit logs and sensitive access logs are written
        self.sb_tables["sensitive_access_log"].insert.assert_called_once()
        log_payload = self.sb_tables["sensitive_access_log"].insert.call_args[0][0]
        self.assertEqual(log_payload["kind"], "credential")
        self.assertEqual(log_payload["reason"], "Manual licensing review for state board audit")

        # Verify audit log contains entry
        self.sb_tables["audit_log"].insert.assert_called_once()

    async def test_verification_decision_verify(self) -> None:
        """Verify verification approval updates therapist profile to bookable."""
        # Mock verification request fetch
        self.sb_tables["verification_requests"].select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
            data=[{"id": self.verification_id, "therapist_id": self.therapist_id, "status": "pending"}]
        )

        # Mock update operations
        self.sb_tables["verification_requests"].update.return_value.eq.return_value.execute.return_value = MagicMock(data=[])
        self.sb_tables["therapist_profiles"].update.return_value.eq.return_value.execute.return_value = MagicMock(data=[])
        self.sb_tables["admin_actions"].insert.return_value.execute.return_value = MagicMock()
        self.sb_tables["audit_log"].insert.return_value.execute.return_value = MagicMock()

        response = self.client.post(
            f"/api/v1/admin/verifications/{self.verification_id}/decision",
            json={"action": "verify", "decision_notes": "All documents look authentic. RCI license matches."},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "verified")

        # Assert status updates
        self.sb_tables["verification_requests"].update.assert_called_once()
        update_args = self.sb_tables["verification_requests"].update.call_args[0][0]
        self.assertEqual(update_args["status"], "verified")

        self.sb_tables["therapist_profiles"].update.assert_called_once_with({"verification_status": "verified", "bookable": True})

        # Assert admin action logged
        self.sb_tables["admin_actions"].insert.assert_called_once()
        action_payload = self.sb_tables["admin_actions"].insert.call_args[0][0]
        self.assertEqual(action_payload["action"], "verify_therapist")
        self.assertEqual(action_payload["notes"], "All documents look authentic. RCI license matches.")

    async def test_list_reports(self) -> None:
        """Verify reports listing returns open alerts first."""
        self.sb_tables["ai_reports"].select.return_value.execute.return_value = MagicMock(
            data=[
                {"id": "rep-1", "reporter_id": self.seeker_id, "category": "harmful", "status": "resolved", "created_at": "2026-06-24T10:00:00Z"},
                {"id": "rep-2", "reporter_id": self.seeker_id, "category": "inappropriate", "status": "open", "created_at": "2026-06-24T11:00:00Z"},
            ]
        )

        response = self.client.get("/api/v1/admin/reports")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data), 2)
        # Should sort "open" first
        self.assertEqual(data[0]["id"], "rep-2")
        self.assertEqual(data[0]["status"], "open")

    @patch("app.routers.admin.decrypt")
    async def test_decrypt_report(self, mock_decrypt: AsyncMock) -> None:
        """Verify decryption of report notes and message works correctly."""
        self.sb_tables["ai_reports"].select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
            data=[
                {
                    "id": self.report_id,
                    "reporter_id": self.seeker_id,
                    "session_id": "session-1",
                    "message_id": "msg-1",
                    "description_cipher": "\\x11",
                    "description_nonce": "\\x12",
                }
            ]
        )

        # Mock reported message
        self.sb_tables["ai_messages"].select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
            data=[
                {
                    "id": "msg-1",
                    "session_id": "session-1",
                    "role": "assistant",
                    "ciphertext": "\\x21",
                    "nonce": "\\x22",
                    "created_at": "2026-06-24T10:05:00Z",
                    "user_id": self.seeker_id,
                }
            ]
        )
        # Mock session owner
        self.sb_tables["ai_sessions"].select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
            data=[{"id": "session-1", "seeker_id": "seeker-owner"}]
        )

        # Mock encryption keys call in decrypt_report
        self.sb_tables["encryption_keys"].select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
            data=[{"wrapped_dek": "\\x05", "master_key_id": "k", "algorithm": "AES-256-GCM"}]
        )

        # Configure decryption outputs
        mock_decrypt.side_effect = ["Harmful description notes", "AI gave bad medical advice"]

        response = self.client.post(
            f"/api/v1/admin/reports/{self.report_id}/decrypt",
            json={"reason": "Safety review"},
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["reporter_description"], "Harmful description notes")
        self.assertEqual(data["reported_message"]["text"], "AI gave bad medical advice")
        self.assertEqual(data["reported_message"]["role"], "assistant")

        # Verify logs
        self.sb_tables["sensitive_access_log"].insert.assert_called_once()
        self.sb_tables["audit_log"].insert.assert_called_once()

    async def test_resolve_report(self) -> None:
        """Verify report triage resolve actions update safety alerts state."""
        self.sb_tables["ai_reports"].select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
            data=[{"id": self.report_id, "status": "open"}]
        )
        # Mock update returns affected row to satisfy status code check
        self.sb_tables["ai_reports"].update.return_value.eq.return_value.execute.return_value = MagicMock(
            data=[{"id": self.report_id, "status": "resolved"}]
        )
        self.sb_tables["admin_actions"].insert.return_value.execute.return_value = MagicMock()
        self.sb_tables["audit_log"].insert.return_value.execute.return_value = MagicMock()

        response = self.client.post(
            f"/api/v1/admin/reports/{self.report_id}/resolve",
            json={"admin_notes": "Prompt templates tuned. Solved."},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "resolved")

        self.sb_tables["ai_reports"].update.assert_called_once()
        self.sb_tables["admin_actions"].insert.assert_called_once()

    async def test_suspend_user(self) -> None:
        """Verify suspending a user locks seeker access or unpublishes therapist."""
        # Mock user fetch (role = therapist)
        self.sb_tables["profiles"].select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
            data=[{"id": self.therapist_id, "role": "therapist", "status": "active"}]
        )

        self.sb_tables["profiles"].update.return_value.eq.return_value.execute.return_value = MagicMock(data=[])
        self.sb_tables["therapist_profiles"].update.return_value.eq.return_value.execute.return_value = MagicMock(data=[])
        self.sb_tables["admin_actions"].insert.return_value.execute.return_value = MagicMock()
        self.sb_tables["audit_log"].insert.return_value.execute.return_value = MagicMock()

        response = self.client.post(
            f"/api/v1/admin/users/{self.therapist_id}/status",
            json={"action": "suspend", "reason": "Violating professionalism policies"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "suspended")

        # Profiles status is locked
        self.sb_tables["profiles"].update.assert_called_once_with({"status": "suspended"})
        # Therapist profile is unpublished and verified status suspended
        self.sb_tables["therapist_profiles"].update.assert_called_once_with({"bookable": False, "verification_status": "suspended"})

    async def test_get_crisis_events(self) -> None:
        """Verify crisis event aggregate view fetches daily metadata-only trends."""
        self.sb_tables["crisis_events_monitor"].select.return_value.order.return_value.execute.return_value = MagicMock(
            data=[
                {
                    "day": "2026-06-24",
                    "category": "self-harm",
                    "severity": "critical",
                    "trigger_layer": "LLM safety guard",
                    "source": "companion-chat",
                    "event_count": 3,
                }
            ]
        )

        response = self.client.get("/api/v1/admin/crisis-events")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]["event_count"], 3)
        self.assertEqual(data[0]["category"], "self-harm")

    @patch("app.services.crypto.decrypt")
    async def test_decrypt_intake_summary(self, mock_decrypt: AsyncMock) -> None:
        """Verify operational decryption of intake summary is fully audited."""
        self.sb_tables["intake_summaries"].select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
            data=[
                {
                    "escalation_id": self.escalation_id,
                    "seeker_id": self.seeker_id,
                    "summary_cipher": "\\x99",
                    "summary_nonce": "\\x98",
                }
            ]
        )
        self.sb_tables["sensitive_access_log"].insert.return_value.execute.return_value = MagicMock()
        self.sb_tables["audit_log"].insert.return_value.execute.return_value = MagicMock()

        mock_decrypt.return_value = "Seeker seeks tools for managing stress and boundary setting"

        response = self.client.post(
            f"/api/v1/admin/intake-summaries/{self.escalation_id}/decrypt",
            json={"reason": "Operational safety and therapist match quality confirmation"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["summary"], "Seeker seeks tools for managing stress and boundary setting")

        # Verify audit & access logging
        self.sb_tables["sensitive_access_log"].insert.assert_called_once()
        self.sb_tables["audit_log"].insert.assert_called_once()
