"""Unit tests for live (LiveKit) sessions: token authz, join window, notes scoping."""

from __future__ import annotations

import unittest
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi.testclient import TestClient

from app.adapters.livekit import JoinToken
from app.core.security import CurrentUser, get_current_user
from app.main import app


class TestLiveSessions(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        self.client = TestClient(app)
        self.seeker_id = "00000000-0000-0000-0000-000000000001"
        self.therapist_id = "00000000-0000-0000-0000-000000000002"
        self.stranger_id = "00000000-0000-0000-0000-000000000009"
        self.booking_id = "00000000-0000-0000-0000-000000000004"
        self.session_id = "00000000-0000-0000-0000-000000000010"

        self._auth_as(self.seeker_id, "seeker")

        self.sb_client, self.sb_tables = self._mock_supabase_client()
        self.patchers = [
            patch("app.routers.live.get_supabase", return_value=self.sb_client),
            patch("app.routers.live.write_audit", new_callable=AsyncMock),
        ]
        for p in self.patchers:
            p.start()

        self.mint_patcher = patch(
            "app.adapters.livekit.SelfHostedLiveKitAdapter.mint_join_token",
            return_value=JoinToken(
                token="signed.jwt.token", room="hovio-room", url="wss://livekit.test"
            ),
        )
        self.mock_mint = self.mint_patcher.start()

    def tearDown(self) -> None:
        for p in self.patchers:
            p.stop()
        self.mint_patcher.stop()
        app.dependency_overrides.clear()

    def _auth_as(self, user_id: str, role: str) -> None:
        app.dependency_overrides[get_current_user] = lambda: CurrentUser(
            id=user_id,
            email=f"{role}@hovio.org",
            role=role,
            status="active",
            display_name=f"Test {role.title()}",
        )

    def _mock_supabase_client(self):
        mock_client = MagicMock()
        mock_tables: dict[str, MagicMock] = {
            name: MagicMock()
            for name in (
                "bookings",
                "live_sessions",
                "live_session_events",
                "session_notes",
                "app_config",
                "profiles",
            )
        }

        def get_mock_table(name: str):
            if name not in mock_tables:
                mock_tables[name] = MagicMock()
            return mock_tables[name]

        mock_client.table.side_effect = get_mock_table
        return mock_client, mock_tables

    def _booking(self, *, status: str = "confirmed", starts_in_minutes: int = 0) -> dict:
        starts = datetime.now(UTC) + timedelta(minutes=starts_in_minutes)
        return {
            "id": self.booking_id,
            "seeker_id": self.seeker_id,
            "therapist_id": self.therapist_id,
            "status": status,
            "modality": "video",
            "starts_at": starts.isoformat(),
            "ends_at": (starts + timedelta(minutes=50)).isoformat(),
        }

    def _wire_booking(self, booking: dict) -> None:
        self.sb_tables["bookings"].select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
            data=[booking]
        )

    def _wire_session(self, status: str = "scheduled") -> None:
        self.sb_tables["live_sessions"].select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
            data=[
                {
                    "id": self.session_id,
                    "booking_id": self.booking_id,
                    "seeker_id": self.seeker_id,
                    "therapist_id": self.therapist_id,
                    "room_name": f"hovio-{self.booking_id}",
                    "modality": "video",
                    "status": status,
                    "started_at": None,
                    "ended_at": None,
                }
            ]
        )

    def _wire_config(self) -> None:
        self.sb_tables["app_config"].select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
            data=[
                {
                    "value": {
                        "join_early_minutes": 10,
                        "end_grace_minutes": 15,
                        "no_show_grace_minutes": 15,
                    }
                }
            ]
        )

    def _wire_profiles(self) -> None:
        self.sb_tables["profiles"].select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
            data=[{"display_name": "Dr. Test"}]
        )

    def test_token_denied_for_non_participant(self) -> None:
        """Only the booking's seeker or therapist may mint a token."""
        self._auth_as(self.stranger_id, "seeker")
        self._wire_booking(self._booking())
        response = self.client.post(f"/api/v1/live/{self.booking_id}/token")
        self.assertEqual(response.status_code, 403)
        self.mock_mint.assert_not_called()

    def test_token_denied_before_join_window(self) -> None:
        """Joining hours early is rejected even for a real participant."""
        self._wire_booking(self._booking(starts_in_minutes=120))
        self._wire_session()
        self._wire_config()
        response = self.client.post(f"/api/v1/live/{self.booking_id}/token")
        self.assertEqual(response.status_code, 400)
        self.mock_mint.assert_not_called()

    def test_token_denied_for_unconfirmed_booking(self) -> None:
        self._wire_booking(self._booking(status="pending_payment"))
        response = self.client.post(f"/api/v1/live/{self.booking_id}/token")
        self.assertEqual(response.status_code, 400)
        self.mock_mint.assert_not_called()

    def test_token_minted_in_window_and_session_goes_live(self) -> None:
        """A participant inside the window gets a token; secret never returned."""
        self._wire_booking(self._booking(starts_in_minutes=-5))
        self._wire_session(status="scheduled")
        self._wire_config()
        self._wire_profiles()
        response = self.client.post(f"/api/v1/live/{self.booking_id}/token")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["token"], "signed.jwt.token")
        self.assertEqual(body["url"], "wss://livekit.test")
        # First join flips scheduled -> live.
        self.sb_tables["live_sessions"].update.assert_called()
        # A joined event is recorded (metadata only).
        self.sb_tables["live_session_events"].insert.assert_called()

    def test_notes_forbidden_for_seeker(self) -> None:
        """Therapist notes are never visible to the seeker."""
        self._wire_booking(self._booking())
        response = self.client.get(f"/api/v1/live/{self.booking_id}/note")
        self.assertEqual(response.status_code, 403)

    def test_notes_scoped_to_the_bookings_therapist(self) -> None:
        """A different therapist cannot read another therapist's notes."""
        self._auth_as(self.stranger_id, "therapist")
        self._wire_booking(self._booking())
        response = self.client.get(f"/api/v1/live/{self.booking_id}/note")
        self.assertEqual(response.status_code, 403)


if __name__ == "__main__":
    unittest.main()
