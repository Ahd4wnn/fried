"""Safety guardrail service.

Enforces a two-layer safety check (deterministic tripwire patterns + LLM classifier)
on every inbound user message before the AI companion is allowed to reply.
"""

from __future__ import annotations

import asyncio
import re
import unicodedata
from collections.abc import Sequence
from typing import Any, Literal

from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel

from app.adapters.llm import ChatMessage, ClassifierResponse, OpenAIAdapter
from app.core.logging import get_logger
from app.core.supabase import get_supabase

logger = get_logger("hovio.safety")


class SafetyVerdict(BaseModel):
    """The final safety verdict output."""

    verdict: Literal["ok", "concern", "crisis"]
    category: str | None = None
    layer: Literal["tripwire", "classifier", "both"]


class SafetyService:
    @staticmethod
    def normalize_text(text: str) -> str:
        """Normalize text to resist basic evasion (leet, accents, casing, spacing)."""
        # 1. Lowercase
        text = text.lower()
        # 2. Strip zero-width chars and non-printable characters
        text = re.sub(r"[\u200b-\u200d\ufeff]", "", text)
        # 3. Basic diacritic folding (remove accents/unicode marks)
        text = "".join(
            c for c in unicodedata.normalize("NFKD", text) if not unicodedata.combining(c)
        )
        # 4. Basic leetspeak folding
        leet_map = {
            "1": "i",
            "!": "i",
            "|": "l",
            "3": "e",
            "4": "a",
            "@": "a",
            "5": "s",
            "$": "s",
            "7": "t",
            "0": "o",
            "8": "b",
        }
        text = text.translate(str.maketrans(leet_map))
        # 5. Collapse repeated characters (3+) to 2 to resist evasion (keep words like kill)
        text = re.sub(r"(.)\1{2,}", r"\1\1", text)
        # 6. Collapse repeated whitespace to 1 space
        text = re.sub(r"\s+", " ", text)
        return text.strip()

    @classmethod
    async def evaluate(
        cls,
        text: str,
        context: Sequence[ChatMessage] | None = None,
        llm_adapter: OpenAIAdapter | None = None,
    ) -> SafetyVerdict:
        """Run two-layer safety guardrail. Low latency fail-safe combination."""
        # Load safety configuration (with fallback)
        config = await cls.get_safety_config()
        tripwire_patterns = config.get("tripwire_patterns", [])
        classifier_config = config.get("classifier_config", {})

        normalized = cls.normalize_text(text)

        # 1. Evaluate Tripwires (sync)
        tripwire_verdict: Literal["ok", "concern", "crisis"] = "ok"
        tripwire_category: str | None = None

        for pattern_entry in tripwire_patterns:
            pattern = pattern_entry.get("pattern")
            category = pattern_entry.get("category")
            severity = pattern_entry.get("severity", "concern")

            if pattern:
                try:
                    if re.search(pattern, normalized):
                        # Capture maximum severity triggered
                        severity_map = {"ok": 0, "concern": 1, "crisis": 2}
                        if severity_map[severity] > severity_map[tripwire_verdict]:
                            tripwire_verdict = severity
                            tripwire_category = category
                except Exception as e:
                    logger.error("Failed to execute tripwire regex pattern %s: %s", pattern, e)

        # 2. Evaluate Classifier
        classifier_verdict: Literal["ok", "concern", "crisis"] = "ok"
        classifier_category: str | None = None

        if classifier_config and llm_adapter:
            model = classifier_config.get("model", "gpt-4o-mini")
            categories = classifier_config.get("categories", [])
            # CLINICAL REVIEW REQUIRED
            thresholds = classifier_config.get("thresholds", {"crisis": 0.6, "concern": 0.4})

            try:
                # Call classifier with short timeout (fail-safe)
                res: ClassifierResponse = await asyncio.wait_for(
                    llm_adapter.classify(text, categories=categories, model=model, context=context),
                    timeout=3.0,
                )

                conf = res.confidence
                sev = res.severity

                # Apply thresholds
                if sev == "crisis" and conf >= thresholds.get("crisis", 0.6):
                    classifier_verdict = "crisis"
                    classifier_category = res.category
                elif (sev == "concern" or sev == "crisis") and conf >= thresholds.get(
                    "concern", 0.4
                ):
                    classifier_verdict = "concern"
                    classifier_category = res.category
                else:
                    classifier_verdict = "ok"
            except Exception as e:
                # Fail-safe: if classifier errors or times out, log error and fall back to tripwire
                logger.error("Classifier safety check failed, falling back to tripwire: %s", e)
                classifier_verdict = "ok"
                classifier_category = None

        # 3. Combine results using fail-safe rules (if either returns crisis, verdict is crisis)
        # Max severity: ok (0) < concern (1) < crisis (2)
        sev_map = {"ok": 0, "concern": 1, "crisis": 2}
        final_verdict_val = max(sev_map[tripwire_verdict], sev_map[classifier_verdict])

        inv_sev_map = {0: "ok", 1: "concern", 2: "crisis"}
        final_verdict: Literal["ok", "concern", "crisis"] = inv_sev_map[final_verdict_val]

        # Determine category and layer
        final_category = None
        layer: Literal["tripwire", "classifier", "both"] = "tripwire"

        if final_verdict == "crisis":
            if tripwire_verdict == "crisis" and classifier_verdict == "crisis":
                layer = "both"
                final_category = classifier_category or tripwire_category
            elif tripwire_verdict == "crisis":
                layer = "tripwire"
                final_category = tripwire_category
            else:
                layer = "classifier"
                final_category = classifier_category
        elif final_verdict == "concern":
            if tripwire_verdict == "concern" and classifier_verdict == "concern":
                layer = "both"
                final_category = classifier_category or tripwire_category
            elif tripwire_verdict == "concern":
                layer = "tripwire"
                final_category = tripwire_category
            else:
                layer = "classifier"
                final_category = classifier_category
        else:
            layer = "both"
            final_category = None

        return SafetyVerdict(verdict=final_verdict, category=final_category, layer=layer)

    @staticmethod
    async def get_safety_config() -> dict[str, Any]:
        """Fetch active safety config from Supabase with fallback."""
        try:

            def _q():
                return (
                    get_supabase()
                    .table("safety_config")
                    .select("*")
                    .eq("is_active", True)
                    .limit(1)
                    .execute()
                )

            res = await run_in_threadpool(_q)
            if res.data:
                return res.data[0]
        except Exception as e:
            logger.error("Failed to load safety config from Supabase: %s", e)

        # CLINICAL REVIEW REQUIRED: safety config fallback matches active v2 configuration
        return {
            "tripwire_patterns": [
                # suicidal ideation (active + passive) -> crisis
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
                    "pattern": r"(?i)\b(want|wanna|wish|like)\s+(to\s+|i\s+was\s+|i\s+were\s+)?(die|be\s+dead|dying)\b",
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
                # self harm -> crisis
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
                # harm to others -> crisis
                {
                    "category": "harm_to_others",
                    "severity": "crisis",
                    "pattern": r"(?i)\b(want|going|am\s+going)\s+to\s+(kill|hurt|harm)\s+(him|her|them|someone|people|everyone)\b",
                    "lang": "en",
                },
                # abuse -> concern
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

    @staticmethod
    async def record_crisis_event(
        user_id: str,
        session_id: str | None,
        source: Literal["ai_chat", "onboarding", "other"],
        verdict: SafetyVerdict,
        helplines_shown: list[str],
    ) -> None:
        """Insert a row to audit log crisis events. DO NOT record the text message itself."""

        def _q():
            return (
                get_supabase()
                .table("crisis_events")
                .insert(
                    {
                        "user_id": user_id,
                        "session_id": session_id,
                        "source": source,
                        "trigger_layer": verdict.layer,
                        "category": verdict.category
                        or "suicidal_ideation",  # fallback required category
                        "severity": verdict.verdict,
                        "resources_shown": helplines_shown,
                    }
                )
                .execute()
            )

        await run_in_threadpool(_q)
