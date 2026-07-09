"""Unit tests for the Therapist Onboarding & Profile endpoints."""

from __future__ import annotations

import unittest
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from app.core.security import CurrentUser, get_current_user
from app.main import app


class TestTherapistSubsystem(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        self.client = TestClient(app)
        self.therapist_id = "00000000-0000-0000-0000-000000000002"
        self.request_id = "00000000-0000-0000-0000-000000000005"

        # Default auth override to therapist
        app.dependency_overrides[get_current_user] = lambda: CurrentUser(
            id=self.therapist_id,
            email="therapist@hovio.org",
            role="therapist",
            status="active",
            display_name="Test Therapist",
        )

        # Mock Key Provider for encryption service
        from unittest.mock import AsyncMock

        self.gp_patcher = patch("app.services.crypto.service.get_key_provider")
        self.mock_gp = self.gp_patcher.start()
        self.mock_provider = MagicMock()
        self.mock_provider.unwrap_key = AsyncMock(return_value=b"A" * 32)
        self.mock_provider.wrap_key = AsyncMock(return_value=b"B" * 32)
        self.mock_gp.return_value = self.mock_provider

    def tearDown(self) -> None:
        self.gp_patcher.stop()
        app.dependency_overrides.clear()

    def _mock_supabase_client(self):
        mock_client = MagicMock()
        mock_profiles = MagicMock()
        mock_therapist_profiles = MagicMock()
        mock_requests = MagicMock()
        mock_docs = MagicMock()
        mock_keys = MagicMock()

        # Mock encryption_keys select
        mock_keys.select.return_value.eq.return_value.limit.return_value.execute.return_value = (
            MagicMock(
                data=[{"wrapped_dek": "\\x05", "master_key_id": "k", "algorithm": "AES-256-GCM"}]
            )
        )

        def mock_table(name):
            if name == "profiles":
                return mock_profiles
            if name == "therapist_profiles":
                return mock_therapist_profiles
            if name == "verification_requests":
                return mock_requests
            if name == "credential_docs":
                return mock_docs
            if name == "encryption_keys":
                return mock_keys
            return MagicMock()

        mock_client.table = mock_table
        return (
            mock_client,
            mock_profiles,
            mock_therapist_profiles,
            mock_requests,
            mock_docs,
        )

    @patch("app.routers.therapist.get_supabase")
    @patch("app.services.crypto.service.get_supabase")
    async def test_therapist_onboarding_submission(
        self, mock_crypto_supabase: MagicMock, mock_router_supabase: MagicMock
    ) -> None:
        """Verify therapist can submit onboarding and correct rows are written."""
        (
            mock_client,
            _,
            mock_therapist_profiles,
            mock_requests,
            mock_docs,
        ) = self._mock_supabase_client()
        mock_router_supabase.return_value = mock_client
        mock_crypto_supabase.return_value = mock_client

        # Mock update of profile
        mock_therapist_profiles.update.return_value.eq.return_value.execute.return_value = (
            MagicMock(data=[{"id": self.therapist_id}])
        )

        # Mock insert of verification request
        mock_requests.insert.return_value.execute.return_value = MagicMock(
            data=[{"id": self.request_id}]
        )

        # Mock insert of credential docs
        mock_docs.insert.return_value.execute.return_value = MagicMock(data=[])

        payload = {
            "legal_name": "Dr. Verified Therapist",
            "whatsapp_number": "+919876543210",
            "professional_title": "Clinical Psychologist",
            "registration_body": "RCI",
            "registration_number": "A12345B",
            "qualification": "M.Phil Clinical Psychology",
            "institution": "NIMHANS",
            "qualification_year": 2018,
            "years_experience": "5–10",
            "specializations": ["anxiety", "depression"],
            "languages": ["english", "hindi"],
            "gender": "female",
            "session_modes": ["video", "chat"],
            "price_inr": 1800,
            "practice_setting": "hospital",
            "bio": "I am a clinical psychologist with extensive training.",
            "documents": [
                {"doc_type": "degree_certificate", "storage_path": "certs/degree.pdf"},
                {"doc_type": "registration_certificate", "storage_path": "certs/rci.pdf"},
            ],
            "declarations": {
                "credentials_genuine": True,
                "agree_terms_conduct": True,
                "consent_data_processing": True,
                "confirm_human_professional": True,
            },
        }

        with patch("app.services.crypto.encrypt") as mock_encrypt:
            mock_encrypt.return_value = (b"cipher_val", b"nonce_val")

            response = self.client.post("/api/v1/therapist/onboarding", json=payload)
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()["status"], "under_review")
            self.assertIn("application is in review", response.json()["message"])

            # Verify profile is updated with onboarding completed flags
            mock_therapist_profiles.update.assert_called_once()
            args, _ = mock_therapist_profiles.update.call_args
            self.assertTrue(args[0]["onboarding_submitted"])
            self.assertTrue(args[0]["onboarding_completed"])
            self.assertEqual(args[0]["years_experience"], 7)  # 5-10 maps to 7

            # Verify request is created
            mock_requests.insert.assert_called_once()
            req_args, _ = mock_requests.insert.call_args
            self.assertEqual(req_args[0]["registration_body"], "RCI")
            self.assertEqual(req_args[0]["qualification"], "M.Phil Clinical Psychology")

            # Verify documents are linked
            mock_docs.insert.assert_called_once()

    @patch("app.routers.therapist.get_supabase")
    @patch("app.services.crypto.service.get_supabase")
    async def test_therapist_onboarding_requires_role(
        self, mock_crypto_supabase: MagicMock, mock_router_supabase: MagicMock
    ) -> None:
        """Verify role seeker is blocked from therapist onboarding."""
        app.dependency_overrides[get_current_user] = lambda: CurrentUser(
            id="seeker-id",
            email="seeker@hovio.org",
            role="seeker",
            status="active",
        )
        response = self.client.post("/api/v1/therapist/onboarding", json={})
        self.assertEqual(response.status_code, 403)

    @patch("app.routers.therapist.get_supabase")
    @patch("app.services.crypto.service.get_supabase")
    async def test_get_verification_status(
        self, mock_crypto_supabase: MagicMock, mock_router_supabase: MagicMock
    ) -> None:
        """Verify therapist can fetch their verification status."""
        (
            mock_client,
            _,
            _,
            mock_requests,
            _,
        ) = self._mock_supabase_client()
        mock_router_supabase.return_value = mock_client
        mock_crypto_supabase.return_value = mock_client

        mock_requests.select.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value = MagicMock(
            data=[
                {
                    "status": "under_review",
                    "registration_body": "RCI",
                    "qualification": "M.Phil",
                    "institution": "NIMHANS",
                    "qualification_year": 2018,
                    "submitted_at": "2026-06-23T22:58:02+05:30",
                    "decision_notes": "Reviewing soon.",
                }
            ]
        )

        response = self.client.get("/api/v1/therapist/verification")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "under_review")
        self.assertEqual(response.json()["registration_body"], "RCI")

    @patch("app.routers.therapist.get_supabase")
    @patch("app.services.crypto.service.get_supabase")
    async def test_therapist_profile_management(
        self, mock_crypto_supabase: MagicMock, mock_router_supabase: MagicMock
    ) -> None:
        """Verify therapist can view and update public profile fields."""
        (
            mock_client,
            _,
            mock_therapist_profiles,
            _,
            _,
        ) = self._mock_supabase_client()
        mock_router_supabase.return_value = mock_client
        mock_crypto_supabase.return_value = mock_client

        profile_data = {
            "id": self.therapist_id,
            "bio": "Original bio text.",
            "specializations": ["anxiety"],
            "languages": ["english"],
            "gender": "female",
            "price_inr": 1500,
            "professional_title": "Counselling Psychologist",
            "years_experience": 3,
            "session_modes": ["video"],
            "practice_setting": "clinic",
            "verification_status": "under_review",
            "bookable": False,
            "onboarding_completed": True,
        }

        # Mock GET profile
        mock_therapist_profiles.select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
            data=[profile_data]
        )

        response = self.client.get("/api/v1/therapist/profile")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["bio"], "Original bio text.")
        self.assertEqual(response.json()["verification_status"], "under_review")

        # Mock PATCH profile
        updated_profile = profile_data.copy()
        updated_profile["bio"] = "Updated biography details."
        updated_profile["price_inr"] = 2000
        mock_therapist_profiles.update.return_value.eq.return_value.execute.return_value = (
            MagicMock(data=[updated_profile])
        )

        patch_payload = {
            "bio": "Updated biography details.",
            "price_inr": 2000,
        }
        response = self.client.patch("/api/v1/therapist/profile", json=patch_payload)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["bio"], "Updated biography details.")
        self.assertEqual(response.json()["price_inr"], 2000)
