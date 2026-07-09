"""Unit tests for the safety and crisis subsystem."""

from __future__ import annotations

import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from app.adapters.llm import ClassifierResponse
from app.services.safety import SafetyService, SafetyVerdict


class TestSafetySubsystem(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        # CLINICAL REVIEW REQUIRED
        # Mock Supabase table responses for safety config
        self.mock_config = {
            "tripwire_patterns": [
                {
                    "category": "suicidal_ideation",
                    "severity": "crisis",
                    "pattern": r"(?i)\b(kill|killing)\s+myself\b",
                    "lang": "en",
                },
                {
                    "category": "suicidal_ideation",
                    "severity": "crisis",
                    "pattern": r"(?i)\bsuicid(e|al)\b",
                    "lang": "en",
                },
                {
                    "category": "suicidal_ideation",
                    "severity": "crisis",
                    "pattern": r"(?i)\b(want|wanna|wish|like)\s+(to\s+|i\s+was\s+|i\s+were\s+|to\s+be\s+)?(die|dead|dying)\b",
                    "lang": "en",
                },
                {
                    "category": "suicidal_ideation",
                    "severity": "crisis",
                    "pattern": r"(?i)\bfeel\s+like\s+dying\b",
                    "lang": "en",
                },
                {
                    "category": "suicidal_ideation",
                    "severity": "crisis",
                    "pattern": r"(?i)\bbetter\s+off\s+(dead|without\s+me)\b",
                    "lang": "en",
                },
                {
                    "category": "suicidal_ideation",
                    "severity": "crisis",
                    "pattern": r"(?i)\bdon.?t\s+want\s+to\s+(live|be\s+alive|be\s+here|exist|wake\s+up)\b",
                    "lang": "en",
                },
                {
                    "category": "suicidal_ideation",
                    "severity": "crisis",
                    "pattern": r"(?i)\b(no\s+(reason|point)\s+to\s+live|nothing\s+to\s+live\s+for|can.?t\s+go\s+on)\b",
                    "lang": "en",
                },
                {
                    "category": "suicidal_ideation",
                    "severity": "crisis",
                    "pattern": r"(?i)\bend\s+(it\s+all|my\s+life|everything)\b",
                    "lang": "en",
                },
                {
                    "category": "suicidal_ideation",
                    "severity": "crisis",
                    "pattern": r"(?i)\b(want|going)\s+to\s+end\s+it\b",
                    "lang": "en",
                },
                {
                    "category": "self_harm",
                    "severity": "crisis",
                    "pattern": r"(?i)\b(hurt|harm|cut|cutting)\s+(myself|my\s+self)\b",
                    "lang": "en",
                },
                {
                    "category": "self_harm",
                    "severity": "crisis",
                    "pattern": r"(?i)\bself[\s-]?harm(ing)?\b",
                    "lang": "en",
                },
                {
                    "category": "harm_to_others",
                    "severity": "crisis",
                    "pattern": r"(?i)\b(want|going|am\s+going)\s+to\s+(kill|hurt|harm)\s+(him|her|them|someone|people|everyone)\b",
                    "lang": "en",
                },
                {
                    "category": "abuse",
                    "severity": "concern",
                    "pattern": r"(?i)\b(is\s+)?(hitting|abusing|hurting|assaulting)\s+me\b",
                    "lang": "en",
                },
                {
                    "category": "abuse",
                    "severity": "concern",
                    "pattern": r"(?i)\b(being\s+)?(abused|assaulted|raped)\b",
                    "lang": "en",
                },
            ],
            "classifier_config": {
                "model": "gpt-4o-mini",
                "categories": ["suicidal_ideation", "self_harm", "abuse", "harm_to_others"],
                "thresholds": {"crisis": 0.5, "concern": 0.35},
            },
        }

    def test_normalize_text(self) -> None:
        """Verify normalization removes basic evasion tricks."""
        # 1. Casing
        self.assertEqual(SafetyService.normalize_text("KILL MYSELF"), "kill myself")
        # 2. Repeated spaces/tabs
        self.assertEqual(SafetyService.normalize_text("kill    myself"), "kill myself")
        # 3. Leetspeak substitutions
        self.assertEqual(SafetyService.normalize_text("k1ll my$elf"), "kill myself")
        self.assertEqual(SafetyService.normalize_text("k1ll my$3lf"), "kill myself")
        self.assertEqual(SafetyService.normalize_text("k!ll my$3|f"), "kill myself")
        # 4. Repeated characters collapse (3+ characters to 2)
        # "kill" has 2 'l's and should stay "kill", but kiiiiillll should collapse to "kiill"
        self.assertEqual(SafetyService.normalize_text("kiiiiilllllll myself"), "kiill myself")
        # 5. Accents / diacritics folding
        self.assertEqual(SafetyService.normalize_text("kíll mysélf"), "kill myself")
        # 6. Zero width joiners / spaces
        self.assertEqual(SafetyService.normalize_text("ki\u200bll my\u200cself"), "kill myself")

    @patch("app.services.safety.service.SafetyService.get_safety_config")
    async def test_tripwires_trigger_crisis(self, mock_get_config: MagicMock) -> None:
        """Verify explicit crisis trigger phrases activate the tripwire layer."""
        mock_get_config.return_value = self.mock_config

        # Test suicidal ideation
        v1 = await SafetyService.evaluate("I want to end my life")
        self.assertEqual(v1.verdict, "crisis")
        self.assertEqual(v1.category, "suicidal_ideation")
        self.assertEqual(v1.layer, "tripwire")

        # Test self harm
        v2 = await SafetyService.evaluate("I am going to cut myself")
        self.assertEqual(v2.verdict, "crisis")
        self.assertEqual(v2.category, "self_harm")

        # Test harm to others
        v3 = await SafetyService.evaluate("I am going to hurt someone")
        self.assertEqual(v3.verdict, "crisis")
        self.assertEqual(v3.category, "harm_to_others")

        # Test concern category (abuse)
        v4 = await SafetyService.evaluate("He is hitting me")
        self.assertEqual(v4.verdict, "concern")
        self.assertEqual(v4.category, "abuse")

    @patch("app.services.safety.service.SafetyService.get_safety_config")
    async def test_ordinary_distress_does_not_trigger_crisis(
        self, mock_get_config: MagicMock
    ) -> None:
        """Verify normal/sad/distressed statements do NOT over-trigger a crisis verdict."""
        mock_get_config.return_value = self.mock_config

        phrases = [
            "I'm so stressed about work",
            "I had an awful day today",
            "I feel really sad lately",
            "I don't know what to do anymore, it's just hard",
            "I'm feeling very lonely",
        ]
        for phrase in phrases:
            v = await SafetyService.evaluate(phrase)
            self.assertNotEqual(v.verdict, "crisis")

    @patch("app.services.safety.service.SafetyService.get_safety_config")
    async def test_classifier_success_and_thresholds(self, mock_get_config: MagicMock) -> None:
        """Verify that the classifier evaluates correctly based on thresholds."""
        mock_get_config.return_value = self.mock_config

        mock_llm = MagicMock()
        mock_llm.classify = AsyncMock()

        # Mock LLM returns crisis with high confidence (0.85 >= 0.6)
        mock_llm.classify.return_value = ClassifierResponse(
            category="suicidal_ideation", severity="crisis", confidence=0.85
        )
        v1 = await SafetyService.evaluate("some text", llm_adapter=mock_llm)
        self.assertEqual(v1.verdict, "crisis")
        self.assertEqual(v1.category, "suicidal_ideation")
        self.assertEqual(v1.layer, "classifier")

        # Mock LLM returns crisis with low confidence (0.45 < 0.5, but >= 0.35 concern)
        mock_llm.classify.return_value = ClassifierResponse(
            category="suicidal_ideation", severity="crisis", confidence=0.45
        )
        v2 = await SafetyService.evaluate("some text", llm_adapter=mock_llm)
        self.assertEqual(v2.verdict, "concern")

        # Mock LLM returns concern with high confidence (0.7 >= 0.4)
        mock_llm.classify.return_value = ClassifierResponse(
            category="abuse", severity="concern", confidence=0.7
        )
        v3 = await SafetyService.evaluate("some other text", llm_adapter=mock_llm)
        self.assertEqual(v3.verdict, "concern")
        self.assertEqual(v3.category, "abuse")

    @patch("app.services.safety.service.SafetyService.get_safety_config")
    async def test_failsafe_classifier_error_falls_back_to_tripwire(
        self, mock_get_config: MagicMock
    ) -> None:
        """Verify that if the classifier errors/times out, we fall back to tripwire."""
        mock_get_config.return_value = self.mock_config

        mock_llm = MagicMock()
        mock_llm.classify = AsyncMock(side_effect=Exception("Timeout / Connection Error"))

        # Tripwire should still match "kill myself" even if classifier is dead
        v1 = await SafetyService.evaluate("kill myself", llm_adapter=mock_llm)
        self.assertEqual(v1.verdict, "crisis")
        self.assertEqual(v1.layer, "tripwire")

        # Ordinary text should return ok
        v2 = await SafetyService.evaluate("I had a regular day", llm_adapter=mock_llm)
        self.assertEqual(v2.verdict, "ok")

    @patch("app.services.safety.service.get_supabase")
    async def test_record_crisis_event_writes_metadata_only(
        self, mock_get_supabase: MagicMock
    ) -> None:
        """Verify that record_crisis_event writes metadata ONLY (no raw text)."""
        mock_table = MagicMock()
        mock_insert = MagicMock()
        mock_get_supabase.return_value.table.return_value = mock_table
        mock_table.insert.return_value = mock_insert
        mock_insert.execute = MagicMock(return_value=MagicMock(data=[{"id": "event_id"}]))

        verdict = SafetyVerdict(verdict="crisis", category="self_harm", layer="tripwire")

        await SafetyService.record_crisis_event(
            user_id="user-123",
            session_id="session-456",
            source="ai_chat",
            verdict=verdict,
            helplines_shown=["Tele-MANAS"],
        )

        # Assert insert was called with metadata, but no raw message text
        inserted_payload = mock_table.insert.call_args[0][0]
        self.assertEqual(inserted_payload["user_id"], "user-123")
        self.assertEqual(inserted_payload["session_id"], "session-456")
        self.assertEqual(inserted_payload["trigger_layer"], "tripwire")
        self.assertEqual(inserted_payload["category"], "self_harm")
        self.assertEqual(inserted_payload["severity"], "crisis")
        self.assertEqual(inserted_payload["resources_shown"], ["Tele-MANAS"])
        self.assertNotIn("text", inserted_payload)
        self.assertNotIn("message", inserted_payload)

    @patch("app.services.safety.service.SafetyService.get_safety_config")
    async def test_v2_passive_ideation_tripwire(self, mock_get_config: MagicMock) -> None:
        """// CLINICAL REVIEW REQUIRED
        Verify that new passive-ideation patterns match after normalization.
        """
        mock_get_config.return_value = self.mock_config

        passive_phrases = [
            "I feel like dying now",
            "I wish I was dead",
            "I don't want to be here anymore",
            "I will like dying",
        ]

        for phrase in passive_phrases:
            v = await SafetyService.evaluate(phrase)
            self.assertEqual(v.verdict, "crisis", f"Phrase '{phrase}' should have triggered crisis")
            self.assertEqual(
                v.category,
                "suicidal_ideation",
                f"Phrase '{phrase}' category should be suicidal_ideation",
            )
            self.assertEqual(v.layer, "tripwire", f"Phrase '{phrase}' layer should be tripwire")
