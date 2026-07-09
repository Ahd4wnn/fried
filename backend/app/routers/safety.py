"""Safety router.

Provides public crisis helpline resources and developer evaluation endpoints.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.adapters.llm import OpenAIAdapter
from app.core.config import get_settings
from app.services.safety import SafetyService, SafetyVerdict, get_helplines

router = APIRouter(prefix="/api/v1/safety", tags=["safety"])


class EvaluateRequest(BaseModel):
    text: str


@router.get("/helplines", response_model=dict[str, Any])
async def read_helplines() -> dict[str, Any]:
    """Get active crisis helplines payload (Public endpoint)."""
    return await get_helplines()


@router.post("/evaluate", response_model=SafetyVerdict)
async def evaluate_safety(payload: EvaluateRequest) -> SafetyVerdict:
    """Evaluate text for safety concerns (Developer/Non-prod only)."""
    settings = get_settings()
    if settings.APP_ENV == "production":
        raise HTTPException(
            status_code=403,
            detail="Evaluation endpoint is disabled in production.",
        )

    llm_adapter = OpenAIAdapter()
    return await SafetyService.evaluate(payload.text, llm_adapter=llm_adapter)
