"""Unit tests for the AI Companion chat and guardrail ordering."""

from __future__ import annotations

import json
import unittest
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from app.core.security import CurrentUser, get_current_user
from app.main import app
from app.services.safety import SafetyVerdict


class TestAIChatSubsystem(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        self.client = TestClient(app)
        self.session_id = "00000000-0000-0000-0000-000000000001"
        self.seeker_id = "00000000-0000-0000-0000-000000000002"

        # Mock user authentication
        app.dependency_overrides[get_current_user] = lambda: CurrentUser(
            id=self.seeker_id,
            email="seeker@hovio.org",
            role="seeker",
            status="active",
            display_name="Test Seeker",
        )

    def tearDown(self) -> None:
        app.dependency_overrides.clear()

    def _mock_supabase_client(self):
        mock_client = MagicMock()
        mock_sessions_table = MagicMock()
        mock_messages_table = MagicMock()
        mock_keys_table = MagicMock()
        mock_profiles_table = MagicMock()

        def mock_table(name):
            if name == "ai_sessions":
                return mock_sessions_table
            if name == "ai_messages":
                return mock_messages_table
            if name == "encryption_keys":
                return mock_keys_table
            if name == "seeker_profiles":
                return mock_profiles_table
            if name == "app_config":
                mock_app_config = MagicMock()
                mock_app_config.select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
                    data=[]
                )
                return mock_app_config
            return MagicMock()

        mock_client.table = mock_table
        return (
            mock_client,
            mock_sessions_table,
            mock_messages_table,
            mock_keys_table,
            mock_profiles_table,
        )

    @patch("app.routers.ai.get_supabase")
    @patch("app.services.safety.service.SafetyService.evaluate")
    @patch("app.adapters.llm.OpenAIAdapter.stream_chat")
    @patch("app.services.safety.service.SafetyService.record_crisis_event")
    @patch("app.services.crypto.service.get_supabase")
    async def test_guardrail_first_crisis_prevents_generation(
        self,
        mock_crypto_supabase: MagicMock,
        mock_record_crisis: MagicMock,
        mock_stream_chat: MagicMock,
        mock_evaluate: MagicMock,
        mock_ai_supabase: MagicMock,
    ) -> None:
        """Verify that a crisis verdict halts the pipeline and skips companion reply generation."""
        (
            mock_client,
            mock_sessions_table,
            mock_messages_table,
            mock_keys_table,
            mock_profiles_table,
        ) = self._mock_supabase_client()
        mock_ai_supabase.return_value = mock_client
        mock_crypto_supabase.return_value = mock_client

        # Mock session check
        mock_session_row = {
            "id": self.session_id,
            "user_id": self.seeker_id,
            "status": "active",
            "title": "Test Active Session",
        }
        mock_sessions_table.select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
            data=[mock_session_row]
        )
        mock_sessions_table.update.return_value.eq.return_value.execute.return_value = MagicMock(
            data=[mock_session_row]
        )

        # Mock user message insert
        mock_msg_row = {
            "id": "user-msg-uuid",
            "session_id": self.session_id,
            "user_id": self.seeker_id,
            "role": "user",
        }
        mock_messages_table.insert.return_value.execute.return_value = MagicMock(
            data=[mock_msg_row]
        )
        mock_messages_table.update.return_value.eq.return_value.execute.return_value = MagicMock(
            data=[]
        )

        # Mock encryption_keys (return empty so it generates new DEK)
        mock_keys_table.select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
            data=[]
        )
        mock_keys_table.insert.return_value.execute.return_value = MagicMock(data=[])

        # Mock Safety verdict as CRISIS
        mock_evaluate.return_value = SafetyVerdict(
            verdict="crisis",
            category="suicidal_ideation",
            severity="crisis",
            score=0.95,
            layer="tripwire",
        )

        # Call send message endpoint
        payload = {"text": "I want to kill myself"}
        response = self.client.post(
            f"/api/v1/ai/sessions/{self.session_id}/messages",
            json=payload,
        )

        # Assert response is standard SSE stream containing a crisis event
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["content-type"], "text/event-stream; charset=utf-8")

        lines = response.text.strip().split("\n")
        self.assertTrue(any("event: crisis" in line for line in lines))

        # Assert guardrail-first checks:
        # A. SafetyService.evaluate runs on the input message
        mock_evaluate.assert_called_once_with(
            "I want to kill myself", llm_adapter=unittest.mock.ANY
        )

        # B. record_crisis_event was called with metadata
        mock_record_crisis.assert_called_once()

        # C. Critical safety check: stream_chat must NEVER be called
        mock_stream_chat.assert_not_called()

        # D. Session was updated to close
        mock_sessions_table.update.assert_any_call(
            {
                "status": "closed_crisis",
                "ended_at": unittest.mock.ANY,
            }
        )

    @patch("app.routers.ai.get_supabase")
    @patch("app.services.safety.service.SafetyService.evaluate")
    @patch("app.adapters.llm.OpenAIAdapter.stream_chat")
    @patch("app.services.crypto.service.get_supabase")
    async def test_guardrail_ok_streams_chat_normally(
        self,
        mock_crypto_supabase: MagicMock,
        mock_stream_chat: MagicMock,
        mock_evaluate: MagicMock,
        mock_ai_supabase: MagicMock,
    ) -> None:
        """Verify that an OK safety verdict generates and streams the companion reply."""
        (
            mock_client,
            mock_sessions_table,
            mock_messages_table,
            mock_keys_table,
            mock_profiles_table,
        ) = self._mock_supabase_client()
        mock_ai_supabase.return_value = mock_client
        mock_crypto_supabase.return_value = mock_client

        mock_session_row = {
            "id": self.session_id,
            "user_id": self.seeker_id,
            "status": "active",
            "title": "Test Active Session",
        }
        mock_sessions_table.select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
            data=[mock_session_row]
        )

        mock_msg_row = {
            "id": "user-msg-uuid",
            "session_id": self.session_id,
            "user_id": self.seeker_id,
            "role": "user",
        }
        mock_messages_table.insert.return_value.execute.return_value = MagicMock(
            data=[mock_msg_row]
        )
        mock_messages_table.update.return_value.eq.return_value.execute.return_value = MagicMock(
            data=[]
        )
        mock_messages_table.select.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value = MagicMock(
            data=[]
        )

        # Mock encryption_keys
        mock_keys_table.select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
            data=[]
        )
        mock_keys_table.insert.return_value.execute.return_value = MagicMock(data=[])

        # Mock seeker_profiles (memory consent disabled)
        mock_profiles_table.select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
            data=[{"ai_memory_consent": False}]
        )

        # Mock Safety verdict as OK
        mock_evaluate.return_value = SafetyVerdict(
            verdict="ok",
            category=None,
            severity="ok",
            score=0.01,
            layer="classifier",
        )

        # Mock stream_chat to yield mock chunks
        async def mock_generator(*args, **kwargs):
            yield "Hello "
            yield "seeker, "
            yield "I am here."

        mock_stream_chat.return_value = mock_generator()

        # Call send message endpoint
        payload = {"text": "Hello companion"}
        response = self.client.post(
            f"/api/v1/ai/sessions/{self.session_id}/messages",
            json=payload,
        )

        self.assertEqual(response.status_code, 200)
        lines = response.text.strip().split("\n")

        # Verify tokens streamed
        self.assertTrue(any("Hello" in line for line in lines))
        self.assertTrue(any("done" in line for line in lines))

        # Verify companion generation WAS called
        mock_stream_chat.assert_called_once()

    @patch("app.routers.ai.get_supabase")
    @patch("app.adapters.llm.OpenAIAdapter.classify")
    @patch("app.adapters.llm.OpenAIAdapter.stream_chat")
    @patch("app.services.safety.service.SafetyService.record_crisis_event")
    @patch("app.services.crypto.service.get_supabase")
    @patch("logging.Logger.error")
    @patch("logging.Logger.info")
    @patch("logging.Logger.warning")
    async def test_passive_ideation_phrases_yield_crisis_via_tripwire_only(
        self,
        mock_log_warn: MagicMock,
        mock_log_info: MagicMock,
        mock_log_err: MagicMock,
        mock_crypto_supabase: MagicMock,
        mock_record_crisis: MagicMock,
        mock_stream_chat: MagicMock,
        mock_classify: MagicMock,
        mock_ai_supabase: MagicMock,
    ) -> None:
        """// CLINICAL REVIEW REQUIRED
        Verify that passive ideation phrases trigger crisis via tripwire even when classifier is disabled/fails.
        Assert companion LLM is never invoked, and no message text is logged.
        """
        (
            mock_client,
            mock_sessions_table,
            mock_messages_table,
            mock_keys_table,
            mock_profiles_table,
        ) = self._mock_supabase_client()
        mock_ai_supabase.return_value = mock_client
        mock_crypto_supabase.return_value = mock_client

        # Mock active session check
        mock_session_row = {
            "id": self.session_id,
            "user_id": self.seeker_id,
            "status": "active",
            "title": "Test Active Session",
        }
        mock_sessions_table.select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
            data=[mock_session_row]
        )
        mock_sessions_table.update.return_value.eq.return_value.execute.return_value = MagicMock(
            data=[mock_session_row]
        )

        # Mock user message insert
        mock_msg_row = {
            "id": "user-msg-uuid",
            "session_id": self.session_id,
            "user_id": self.seeker_id,
            "role": "user",
        }
        mock_messages_table.insert.return_value.execute.return_value = MagicMock(
            data=[mock_msg_row]
        )
        mock_messages_table.update.return_value.eq.return_value.execute.return_value = MagicMock(
            data=[]
        )

        # Mock encryption_keys
        mock_keys_table.select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
            data=[]
        )
        mock_keys_table.insert.return_value.execute.return_value = MagicMock(data=[])

        # Mock classifier to raise an exception (simulating disabled/offline classifier)
        mock_classify.side_effect = Exception("Classifier disabled / timed out")

        passive_phrases = [
            "I feel like dying now",
            "I wish I was dead",
            "I don't want to be here anymore",
            "I will like dying",
        ]

        for phrase in passive_phrases:
            mock_stream_chat.reset_mock()
            mock_record_crisis.reset_mock()
            mock_log_err.reset_mock()
            mock_log_warn.reset_mock()
            mock_log_info.reset_mock()

            payload = {"text": phrase}
            response = self.client.post(
                f"/api/v1/ai/sessions/{self.session_id}/messages",
                json=payload,
            )

            self.assertEqual(response.status_code, 200)
            lines = response.text.strip().split("\n")

            # Emits crisis event
            self.assertTrue(
                any("event: crisis" in line for line in lines),
                f"Phrase '{phrase}' should emit crisis event",
            )

            # Carrying a caring message + non-empty helplines
            crisis_data_lines = [line for line in lines if line.startswith("data:")]
            crisis_payload = None
            for dline in crisis_data_lines:
                try:
                    parsed = json.loads(dline[5:].strip())
                    if "caring_message" in parsed:
                        crisis_payload = parsed
                        break
                except json.JSONDecodeError:
                    continue

            self.assertIsNotNone(
                crisis_payload, f"Phrase '{phrase}' should return a valid crisis json payload"
            )
            self.assertIn("caring_message", crisis_payload)
            self.assertTrue(
                len(crisis_payload["helplines"]) > 0, "Helplines list must not be empty"
            )

            # Companion LLM is never invoked
            mock_stream_chat.assert_not_called()

            # Assert no message text is logged on any path
            # Check all arguments of all logging calls
            for mock_log in [mock_log_err, mock_log_warn, mock_log_info]:
                for call in mock_log.call_args_list:
                    args, kwargs = call
                    log_str = " ".join(str(a) for a in args) + " ".join(
                        str(v) for v in kwargs.values()
                    )
                    self.assertNotIn(
                        "dying",
                        log_str.lower(),
                        f"Logged message contains sensitive text: {log_str}",
                    )
                    self.assertNotIn(
                        "dead",
                        log_str.lower(),
                        f"Logged message contains sensitive text: {log_str}",
                    )
                    self.assertNotIn(
                        "here anymore",
                        log_str.lower(),
                        f"Logged message contains sensitive text: {log_str}",
                    )

    @patch("app.routers.ai.get_supabase")
    @patch("app.adapters.llm.OpenAIAdapter.classify")
    @patch("app.adapters.llm.OpenAIAdapter.stream_chat")
    @patch("app.routers.ai.retrieve_past_memories")
    @patch("app.services.crypto.service.get_supabase")
    async def test_classifier_exception_and_mid_stream_error_yield_fallback(
        self,
        mock_crypto_supabase: MagicMock,
        mock_retrieve_memories: MagicMock,
        mock_stream_chat: MagicMock,
        mock_classify: MagicMock,
        mock_ai_supabase: MagicMock,
    ) -> None:
        """// CLINICAL REVIEW REQUIRED
        Verify that a mid-stream exception yields the support fallback (caring line + helplines),
        never an empty/silent stream.
        """
        (
            mock_client,
            mock_sessions_table,
            mock_messages_table,
            mock_keys_table,
            mock_profiles_table,
        ) = self._mock_supabase_client()
        mock_ai_supabase.return_value = mock_client
        mock_crypto_supabase.return_value = mock_client

        # Mock active session check
        mock_session_row = {
            "id": self.session_id,
            "user_id": self.seeker_id,
            "status": "active",
            "title": "Test Active Session",
        }
        mock_sessions_table.select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
            data=[mock_session_row]
        )
        mock_sessions_table.update.return_value.eq.return_value.execute.return_value = MagicMock(
            data=[mock_session_row]
        )

        # Mock user message insert
        mock_msg_row = {
            "id": "user-msg-uuid",
            "session_id": self.session_id,
            "user_id": self.seeker_id,
            "role": "user",
        }
        mock_messages_table.insert.return_value.execute.return_value = MagicMock(
            data=[mock_msg_row]
        )
        mock_messages_table.update.return_value.eq.return_value.execute.return_value = MagicMock(
            data=[]
        )

        # Mock encryption_keys
        mock_keys_table.select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
            data=[]
        )
        mock_keys_table.insert.return_value.execute.return_value = MagicMock(data=[])

        # Mock classifier to raise exception (forces fallback to tripwire, which returns ok for a safe message)
        mock_classify.side_effect = Exception("Classifier exception simulated")

        # Mock retrieve_past_memories to throw an exception (simulating mid-stream/generator runtime error)
        mock_retrieve_memories.side_effect = RuntimeError("Simulated mid-stream database drop")

        payload = {"text": "A completely safe normal message"}
        response = self.client.post(
            f"/api/v1/ai/sessions/{self.session_id}/messages",
            json=payload,
        )

        self.assertEqual(response.status_code, 200)
        lines = response.text.strip().split("\n")

        # The stream catches the exception, yields token events for the caring message,
        # and emits the terminal crisis fallback event carrying caring message + helplines.
        self.assertTrue(
            any("event: token" in line for line in lines), "Should have streamed caring tokens"
        )
        self.assertTrue(
            any("event: crisis" in line for line in lines),
            "Should have emitted crisis fallback event",
        )

        # Verify fallback contains helplines and caring message
        crisis_data_lines = [line for line in lines if line.startswith("data:")]
        fallback_payload = None
        for dline in crisis_data_lines:
            try:
                parsed = json.loads(dline[5:].strip())
                if "caring_message" in parsed:
                    fallback_payload = parsed
                    break
            except json.JSONDecodeError:
                continue

        self.assertIsNotNone(fallback_payload)
        self.assertIn("caring_message", fallback_payload)
        self.assertTrue(len(fallback_payload["helplines"]) > 0)
