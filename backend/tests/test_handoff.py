"""Unit tests for the AI-to-Human Handoff & Matching flow."""

from __future__ import annotations

import unittest
from datetime import UTC, datetime
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from app.core.security import CurrentUser, get_current_user
from app.main import app
from app.services.agents.handoff import MatchExtractResponse, run_matcher


class TestHandoffSubsystem(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        self.client = TestClient(app)
        self.seeker_id = "00000000-0000-0000-0000-000000000001"
        self.therapist_id = "00000000-0000-0000-0000-000000000002"
        self.session_id = "00000000-0000-0000-0000-000000000003"
        self.escalation_id = "00000000-0000-0000-0000-000000000004"
        self.invitation_id = "00000000-0000-0000-0000-000000000005"

        # Default auth override
        app.dependency_overrides[get_current_user] = lambda: CurrentUser(
            id=self.seeker_id,
            email="seeker@hovio.org",
            role="seeker",
            status="active",
            display_name="Test Seeker",
        )

        # Mock Key Provider
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

    _SCHEDULING_CONFIG = {
        "session_minutes": 50,
        "hold_minutes": 10,
        "booking_window_weeks": 4,
        "min_notice_minutes": 120,
        "default_timezone": "Asia/Kolkata",
    }

    def _mock_supabase_client(self):
        mock_client = MagicMock()
        mock_sessions = MagicMock()
        mock_messages = MagicMock()
        mock_escalations = MagicMock()
        mock_criteria = MagicMock()
        mock_summaries = MagicMock()
        mock_invitations = MagicMock()
        mock_onboarding = MagicMock()
        mock_therapist_profiles = MagicMock()
        mock_app_config = MagicMock()
        # Return a real scheduling config so timedelta(minutes=...) works
        mock_app_config.select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
            data=[{"value": self._SCHEDULING_CONFIG}]
        )
        mock_slots = MagicMock()
        # Expired-hold cleanup: return empty list
        mock_slots.select.return_value.eq.return_value.lt.return_value.execute.return_value = MagicMock(data=[])
        # Open slots for matcher availability ranking: return empty (therapists excluded by default)
        mock_slots.select.return_value.eq.return_value.gte.return_value.execute.return_value = MagicMock(data=[])
        mock_audit = MagicMock()
        mock_keys = MagicMock()
        mock_keys.select.return_value.eq.return_value.limit.return_value.execute.return_value = (
            MagicMock(
                data=[{"wrapped_dek": "\\x05", "master_key_id": "k", "algorithm": "AES-256-GCM"}]
            )
        )

        def mock_table(name):
            if name == "ai_sessions":
                return mock_sessions
            if name == "ai_messages":
                return mock_messages
            if name == "escalations":
                return mock_escalations
            if name == "match_criteria":
                return mock_criteria
            if name == "intake_summaries":
                return mock_summaries
            if name == "therapist_invitations":
                return mock_invitations
            if name == "onboarding_responses":
                return mock_onboarding
            if name == "therapist_profiles":
                return mock_therapist_profiles
            if name == "app_config":
                return mock_app_config
            if name == "encryption_keys":
                return mock_keys
            if name == "audit_log":
                return mock_audit
            if name == "slots":
                return mock_slots
            return MagicMock()

        mock_client.table = mock_table
        return (
            mock_client,
            mock_sessions,
            mock_messages,
            mock_escalations,
            mock_criteria,
            mock_summaries,
            mock_invitations,
            mock_onboarding,
            mock_therapist_profiles,
            mock_app_config,
        )

    @patch("app.routers.handoff.get_supabase")
    @patch("app.services.crypto.service.get_supabase")
    @patch("app.services.agents.handoff.get_supabase")
    async def test_seeker_confirm_escalation(
        self,
        mock_agent_supabase: MagicMock,
        mock_crypto_supabase: MagicMock,
        mock_handoff_supabase: MagicMock,
    ) -> None:
        """Verify seeker can confirm suggested escalation and generate summary."""
        (
            mock_client,
            mock_sessions,
            mock_messages,
            mock_escalations,
            mock_criteria,
            mock_summaries,
            mock_invitations,
            _,
            _,
            _,
        ) = self._mock_supabase_client()
        mock_handoff_supabase.return_value = mock_client
        mock_crypto_supabase.return_value = mock_client
        mock_agent_supabase.return_value = mock_client

        # Mock session check
        mock_sessions.select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
            data=[{"id": self.session_id, "user_id": self.seeker_id, "status": "active"}]
        )

        # Mock escalations fetch (returns suggested)
        mock_escalations.select.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
            data=[{"id": self.escalation_id, "status": "suggested"}]
        )
        mock_escalations.update.return_value.eq.return_value.execute.return_value = MagicMock(
            data=[]
        )

        # Mock messages fetch for summary
        mock_messages.select.return_value.eq.return_value.order.return_value.execute.return_value = MagicMock(
            data=[
                {"role": "user", "ciphertext": "\\x01", "nonce": "\\x02", "id": "m1"},
                {"role": "assistant", "ciphertext": "\\x03", "nonce": "\\x04", "id": "m2"},
            ]
        )

        # Mock summaries insert
        mock_summaries.upsert.return_value.execute.return_value = MagicMock(data=[])

        with (
            patch("app.services.agents.handoff.OpenAIAdapter.chat") as mock_chat,
            patch("app.services.agents.handoff.decrypt") as mock_decrypt,
            patch("app.services.agents.handoff.encrypt") as mock_encrypt,
        ):
            mock_chat.return_value = "Mocked intake summary"
            mock_decrypt.side_effect = ["Seeker struggle content", "Companion helpful response"]
            mock_encrypt.return_value = (b"cipher_summary", b"nonce_summary")

            response = self.client.post(f"/api/v1/handoff/escalations/{self.session_id}/confirm")
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()["escalation_id"], self.escalation_id)
            self.assertEqual(response.json()["status"], "confirmed")

    @patch("app.routers.handoff.get_supabase")
    @patch("app.services.crypto.service.get_supabase")
    async def test_seeker_consent_summary(
        self, mock_crypto_supabase: MagicMock, mock_handoff_supabase: MagicMock
    ) -> None:
        """Verify seeker can consent to share summary and optionally add a note."""
        (mock_client, _, _, _, _, mock_summaries, _, _, _, _) = self._mock_supabase_client()
        mock_handoff_supabase.return_value = mock_client
        mock_crypto_supabase.return_value = mock_client

        # Mock fetch summary
        mock_summaries.select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
            data=[
                {
                    "escalation_id": self.escalation_id,
                    "seeker_id": self.seeker_id,
                    "summary_cipher": "\\x01",
                    "summary_nonce": "\\x02",
                }
            ]
        )

        # Mock decrypt and encrypt
        with (
            patch("app.routers.handoff.decrypt") as mock_decrypt,
            patch("app.routers.handoff.encrypt") as mock_encrypt,
        ):
            mock_decrypt.return_value = "Intake summary text"
            mock_encrypt.return_value = (b"new_cipher", b"new_nonce")

            mock_summaries.update.return_value.eq.return_value.execute.return_value = MagicMock(
                data=[]
            )

            # Post consent with seeker note
            response = self.client.post(
                f"/api/v1/handoff/summaries/{self.escalation_id}/consent",
                json={"seeker_note": "A custom seeker note to share."},
            )
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()["status"], "consented")

    @patch("app.services.agents.handoff.get_supabase")
    @patch("app.services.crypto.service.get_supabase")
    async def test_matcher_agent(
        self, mock_crypto_supabase: MagicMock, mock_agent_supabase: MagicMock
    ) -> None:
        """Verify the Matcher ranks therapists correctly based on scoring criteria."""
        (
            mock_client,
            _,
            _,
            mock_escalations,
            mock_criteria,
            _,
            mock_invitations,
            mock_onboarding,
            mock_therapist_profiles,
            _,
        ) = self._mock_supabase_client()
        mock_agent_supabase.return_value = mock_client
        mock_crypto_supabase.return_value = mock_client

        mock_escalations.update.return_value.eq.return_value.execute.return_value = MagicMock(
            data=[]
        )
        mock_criteria.upsert.return_value.execute.return_value = MagicMock(data=[])

        # Mock onboarding answers
        mock_onboarding.select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
            data=[
                {
                    "answers": {
                        "preferred_language": "english",
                        "therapist_gender_preference": "female",
                        "financial_situation": "stretched",
                    }
                }
            ]
        )

        # Mock verified therapists with open slots so they pass the availability filter
        mock_therapist_profiles.select.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock(
            data=[
                {
                    "id": "t1",
                    "specializations": ["anxiety", "stress"],
                    "languages": ["english"],
                    "gender": "female",
                    "price_inr": 1200,  # within ceiling (1500)
                    "profiles": {"display_name": "Dr. Female English Anxiety"},
                },
                {
                    "id": "t2",
                    "specializations": ["depression"],
                    "languages": ["hindi"],
                    "gender": "male",
                    "price_inr": 2000,  # above ceiling
                    "profiles": {"display_name": "Dr. Male Hindi Depression"},
                },
            ]
        )

        mock_invitations.insert.return_value.execute.return_value = MagicMock(data=[])

        # Mock LLM Match Extraction and Crypto
        with (
            patch("app.adapters.llm.OpenAIAdapter.client") as mock_openai_client,
            patch("app.services.agents.handoff.encrypt") as mock_encrypt,
            # Patch get_scheduling_config to return concrete values (avoids MagicMock timedelta error)
            patch(
                "app.routers.scheduling.get_scheduling_config",
                return_value=self._SCHEDULING_CONFIG,
            ),
            patch("app.routers.scheduling.cleanup_expired_holds"),
        ):
            mock_response_parsed = MatchExtractResponse(
                specializations=["anxiety"], non_identifying_need="Needs anxiety coping strategies"
            )
            from unittest.mock import AsyncMock

            mock_openai_client.beta.chat.completions.parse = AsyncMock()
            mock_openai_client.beta.chat.completions.parse.return_value.choices = [
                MagicMock(message=MagicMock(parsed=mock_response_parsed))
            ]
            mock_encrypt.return_value = (b"cipher_need", b"nonce_need")

            # Configure open slots for both therapists so they pass availability filter
            mock_client.table("slots").select.return_value.eq.return_value.gte.return_value.execute.return_value = MagicMock(
                data=[
                    {"therapist_id": "t1", "starts_at": "2099-01-01T10:00:00+00:00"},
                    {"therapist_id": "t2", "starts_at": "2099-01-01T10:00:00+00:00"},
                ]
            )

            # Run Matcher
            await run_matcher(
                self.seeker_id, self.escalation_id, "Mock summary text anxiety stress"
            )

            # Verify invitations were inserted
            mock_invitations.insert.assert_called_once()
            inserted_rows = mock_invitations.insert.call_args[0][0]
            # t1 should be higher score than t2
            t1_row = [r for r in inserted_rows if r["therapist_id"] == "t1"][0]
            t2_row = [r for r in inserted_rows if r["therapist_id"] == "t2"][0]
            self.assertGreater(t1_row["match_score"], t2_row["match_score"])

    @patch("app.routers.handoff.get_supabase")
    @patch("app.services.crypto.service.get_supabase")
    async def test_therapist_invitation_accept_decline(
        self, mock_crypto_supabase: MagicMock, mock_handoff_supabase: MagicMock
    ) -> None:
        """Verify therapists can view details and accept/decline invitations."""
        (mock_client, _, _, _, _, _, mock_invitations, _, _, _) = self._mock_supabase_client()
        mock_handoff_supabase.return_value = mock_client
        mock_crypto_supabase.return_value = mock_client

        # Override current user as therapist
        app.dependency_overrides[get_current_user] = lambda: CurrentUser(
            id=self.therapist_id,
            email="therapist@hovio.org",
            role="therapist",
            status="active",
            display_name="Test Therapist",
        )

        mock_invitations.select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
            data=[
                {
                    "id": self.invitation_id,
                    "therapist_id": self.therapist_id,
                    "status": "invited",
                    "escalation_id": self.escalation_id,
                }
            ]
        )
        mock_invitations.update.return_value.eq.return_value.execute.return_value = MagicMock(
            data=[]
        )

        # Accept invitation
        response = self.client.post(f"/api/v1/handoff/invitations/{self.invitation_id}/accept")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "accepted")

        # Decline invitation
        mock_invitations.select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
            data=[
                {
                    "id": self.invitation_id,
                    "therapist_id": self.therapist_id,
                    "status": "invited",
                    "escalation_id": self.escalation_id,
                }
            ]
        )
        response = self.client.post(f"/api/v1/handoff/invitations/{self.invitation_id}/decline")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "declined")

    @patch("app.routers.handoff.get_supabase")
    @patch("app.services.crypto.service.get_supabase")
    async def test_seeker_selects_therapist_audited_summary(
        self, mock_crypto_supabase: MagicMock, mock_handoff_supabase: MagicMock
    ) -> None:
        """Verify seeker selecting therapist releases intake summary, and therapist access is audited."""
        (mock_client, _, _, mock_escalations, _, mock_summaries, mock_invitations, _, _, _) = (
            self._mock_supabase_client()
        )
        mock_handoff_supabase.return_value = mock_client
        mock_crypto_supabase.return_value = mock_client

        # Seeker role: select invitation
        mock_invitations.select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
            data=[
                {
                    "id": self.invitation_id,
                    "therapist_id": self.therapist_id,
                    "status": "accepted",
                    "escalation_id": self.escalation_id,
                    "escalations": {"seeker_id": self.seeker_id},
                }
            ]
        )
        mock_escalations.update.return_value.eq.return_value.execute.return_value = MagicMock(
            data=[]
        )
        mock_summaries.select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
            data=[{"share_consented_at": datetime.now(UTC).isoformat()}]
        )
        mock_summaries.update.return_value.eq.return_value.execute.return_value = MagicMock(data=[])

        response = self.client.post(f"/api/v1/handoff/invitations/{self.invitation_id}/select")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "selected")

        # Now, therapist role: access and decrypt summary
        app.dependency_overrides[get_current_user] = lambda: CurrentUser(
            id=self.therapist_id,
            email="therapist@hovio.org",
            role="therapist",
            status="active",
            display_name="Test Therapist",
        )

        mock_summaries.select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
            data=[
                {
                    "escalation_id": self.escalation_id,
                    "seeker_id": self.seeker_id,
                    "summary_cipher": "\\x01",
                    "summary_nonce": "\\x02",
                    "shared_with_therapist_id": self.therapist_id,
                    "share_consented_at": datetime.now(UTC).isoformat(),
                    "shared_at": datetime.now(UTC).isoformat(),
                }
            ]
        )

        # Mock decrypt and audit
        with (
            patch("app.routers.handoff.decrypt") as mock_decrypt,
            patch("app.routers.handoff.write_audit") as mock_write_audit,
        ):
            mock_decrypt.return_value = "Plaintext intake summary content"
            mock_write_audit.return_value = None

            response = self.client.get(f"/api/v1/handoff/summaries/{self.escalation_id}")
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()["summary"], "Plaintext intake summary content")
            mock_write_audit.assert_called_once()
