"""Unit tests for Hovio scheduling, slot generation, directory, and bookings."""

from __future__ import annotations

import unittest
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi.testclient import TestClient

from app.core.security import CurrentUser, get_current_user
from app.main import app


class TestSchedulingSubsystem(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        self.client = TestClient(app)
        self.seeker_id = "00000000-0000-0000-0000-000000000001"
        self.therapist_id = "00000000-0000-0000-0000-000000000002"
        self.slot_id = "00000000-0000-0000-0000-000000000003"
        self.booking_id = "00000000-0000-0000-0000-000000000004"
        self.block_id = "00000000-0000-0000-0000-000000000005"

        # Default auth override to seeker
        app.dependency_overrides[get_current_user] = lambda: CurrentUser(
            id=self.seeker_id,
            email="seeker@hovio.org",
            role="seeker",
            status="active",
            display_name="Test Seeker",
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
            patch("app.routers.scheduling.get_supabase", return_value=self.sb_client),
            patch("app.services.agents.handoff.get_supabase", return_value=self.sb_client),
            patch("app.services.agents.scheduler.get_supabase", return_value=self.sb_client),
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
            "availability_blocks",
            "slots",
            "bookings",
            "therapist_profiles",
            "profiles",
            "app_config",
            "ai_messages",
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

    def test_availability_blocks_crud_auth_gate(self) -> None:
        """Verify that seekers cannot access therapist availability endpoints."""
        response = self.client.get("/api/v1/therapist/availability")
        self.assertEqual(response.status_code, 403)

    def test_therapist_crud_availability_block(self) -> None:
        """Verify therapist can create availability blocks."""
        app.dependency_overrides[get_current_user] = lambda: CurrentUser(
            id=self.therapist_id,
            email="therapist@hovio.org",
            role="therapist",
            status="active",
            display_name="Test Therapist",
        )

        mock_config = {
            "session_minutes": 50,
            "hold_minutes": 10,
            "booking_window_weeks": 4,
            "min_notice_minutes": 120,
            "default_timezone": "Asia/Kolkata",
        }

        # Mock app_config read
        self.sb_tables["app_config"].select.return_value.eq.return_value.limit.return_value.execute.return_value.data = [
            {"value": mock_config}
        ]

        # Mock availability insert
        block_data = {
            "id": self.block_id,
            "therapist_id": self.therapist_id,
            "is_recurring": True,
            "day_of_week": 1,
            "specific_date": None,
            "start_time": "10:00:00",
            "end_time": "12:00:00",
            "timezone": "Asia/Kolkata",
            "active": True,
            "created_at": "2026-06-24T11:00:00Z",
            "updated_at": "2026-06-24T11:00:00Z",
        }
        self.sb_tables["availability_blocks"].insert.return_value.execute.return_value.data = [
            block_data
        ]
        self.sb_tables["availability_blocks"].select.return_value.eq.return_value.eq.return_value.execute.return_value.data = [
            block_data
        ]

        # Mock slots select & insert
        self.sb_tables["slots"].select.return_value.eq.return_value.gte.return_value.execute.return_value.data = []
        self.sb_tables["slots"].insert.return_value.execute.return_value.data = []

        payload = {
            "is_recurring": True,
            "day_of_week": 1,
            "start_time": "10:00:00",
            "end_time": "12:00:00",
            "timezone": "Asia/Kolkata",
            "active": True,
        }

        response = self.client.post("/api/v1/therapist/availability", json=payload)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["id"], self.block_id)

    def test_booking_creation_seeker(self) -> None:
        """Verify seeker can hold a slot and create a pending booking."""
        mock_config = {
            "session_minutes": 50,
            "hold_minutes": 10,
            "booking_window_weeks": 4,
            "min_notice_minutes": 120,
            "default_timezone": "Asia/Kolkata",
        }

        # Mock app_config read
        self.sb_tables["app_config"].select.return_value.eq.return_value.limit.return_value.execute.return_value.data = [
            {"value": mock_config}
        ]

        # Mock cleanup hold check queries
        self.sb_tables["slots"].select.return_value.eq.return_value.lt.return_value.execute.return_value.data = []

        # Mock duplicate booking check
        self.sb_tables["bookings"].select.return_value.eq.return_value.eq.return_value.eq.return_value.in_.return_value.execute.return_value.data = []

        starts_at = (datetime.now(UTC) + timedelta(days=2)).isoformat()

        # Mock slot select
        self.sb_tables["slots"].select.return_value.eq.return_value.eq.return_value.execute.return_value.data = [
            {
                "id": self.slot_id,
                "therapist_id": self.therapist_id,
                "starts_at": starts_at,
                "status": "open",
            }
        ]

        # Mock therapist profile read
        self.sb_tables["therapist_profiles"].select.return_value.eq.return_value.limit.return_value.execute.return_value.data = [
            {"session_modes": ["video", "audio"], "price_inr": 1500}
        ]

        # Mock slot atomic hold update
        self.sb_tables["slots"].update.return_value.eq.return_value.eq.return_value.execute.return_value.data = [
            {"id": self.slot_id, "status": "held"}
        ]

        # Mock booking insert
        booking_data = {
            "id": self.booking_id,
            "seeker_id": self.seeker_id,
            "therapist_id": self.therapist_id,
            "slot_id": self.slot_id,
            "escalation_id": None,
            "status": "pending_payment",
            "modality": "video",
            "starts_at": starts_at,
            "ends_at": starts_at,
            "price_inr": 1500,
            "created_at": "2026-06-24T11:00:00Z",
            "updated_at": "2026-06-24T11:00:00Z",
        }
        self.sb_tables["bookings"].insert.return_value.execute.return_value.data = [booking_data]

        payload = {
            "therapist_id": self.therapist_id,
            "starts_at": starts_at,
            "modality": "video",
        }

        response = self.client.post("/api/v1/bookings", json=payload)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["id"], self.booking_id)
        self.assertEqual(response.json()["status"], "pending_payment")

    def test_booking_concurrency_failure(self) -> None:
        """Verify booking fails if slot is already held/booked (atomic update check)."""
        mock_config = {
            "session_minutes": 50,
            "hold_minutes": 10,
            "booking_window_weeks": 4,
            "min_notice_minutes": 120,
            "default_timezone": "Asia/Kolkata",
        }

        # Mock app_config read
        self.sb_tables["app_config"].select.return_value.eq.return_value.limit.return_value.execute.return_value.data = [
            {"value": mock_config}
        ]

        # Mock cleanup
        self.sb_tables["slots"].select.return_value.eq.return_value.lt.return_value.execute.return_value.data = []
        self.sb_tables["bookings"].select.return_value.eq.return_value.eq.return_value.eq.return_value.in_.return_value.execute.return_value.data = []

        starts_at = (datetime.now(UTC) + timedelta(days=2)).isoformat()

        self.sb_tables["slots"].select.return_value.eq.return_value.eq.return_value.execute.return_value.data = [
            {
                "id": self.slot_id,
                "therapist_id": self.therapist_id,
                "starts_at": starts_at,
                "status": "open",
            }
        ]

        self.sb_tables["therapist_profiles"].select.return_value.eq.return_value.limit.return_value.execute.return_value.data = [
            {"session_modes": ["video"], "price_inr": 1500}
        ]

        # Mock slot atomic hold fails (returns empty list because status is not 'open')
        self.sb_tables["slots"].update.return_value.eq.return_value.eq.return_value.execute.return_value.data = []

        payload = {
            "therapist_id": self.therapist_id,
            "starts_at": starts_at,
            "modality": "video",
        }

        response = self.client.post("/api/v1/bookings", json=payload)
        self.assertEqual(response.status_code, 409)
        self.assertIn("no longer available", response.json()["error"]["message"])
