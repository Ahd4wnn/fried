"""Structured logging with a PII-redaction stub.

Guardrail (CLAUDE.md / docs/safety-and-privacy.md): transcripts, summaries,
names, contacts, helpline interactions and payment PII must never be serialized
to logs. This module installs a redaction filter on every log record. The
pattern set here is a starting stub — it is hardened in the privacy prompt.
"""

from __future__ import annotations

import logging
import re
from typing import Final

# Coarse patterns for obvious PII. Expanded + unit-tested in the DPDP prompt.
_REDACTIONS: Final[tuple[tuple[re.Pattern[str], str], ...]] = (
    (re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+"), "[redacted-email]"),
    (re.compile(r"(?<!\d)(?:\+?\d[\d\s-]{8,}\d)(?!\d)"), "[redacted-phone]"),
    (re.compile(r"https?://\S+"), "[redacted-url]"),
)


def redact(text: str) -> str:
    """Best-effort scrub of obvious PII from a string before it is logged."""
    for pattern, replacement in _REDACTIONS:
        text = pattern.sub(replacement, text)
    return text


class RedactionFilter(logging.Filter):
    """Applies redaction to the formatted log message and string args."""

    def filter(self, record: logging.LogRecord) -> bool:
        if isinstance(record.msg, str):
            record.msg = redact(record.msg)
        if record.args:
            record.args = tuple(redact(arg) if isinstance(arg, str) else arg for arg in record.args)
        return True


_configured = False


def configure_logging(level: int = logging.INFO) -> None:
    """Idempotently configure root logging with the redaction filter attached."""
    global _configured
    if _configured:
        return

    handler = logging.StreamHandler()
    handler.setFormatter(
        logging.Formatter(
            fmt="%(asctime)s %(levelname)s %(name)s %(message)s",
            datefmt="%Y-%m-%dT%H:%M:%S%z",
        )
    )
    handler.addFilter(RedactionFilter())

    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(level)
    _configured = True


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(name)
