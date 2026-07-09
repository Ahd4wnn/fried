"""Swappable integration adapters.

Every external service sits behind a typed interface so it is testable and
replaceable without touching call sites (docs/integrations.md). Prompt 1 ships
the interfaces only — concrete bodies raise NotImplementedError and are filled
in by the prompt that owns each integration.
"""
