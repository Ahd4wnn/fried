"""Hovio backend — FastAPI application entrypoint.

API-first (see docs/architecture.md): the same backend serves hovio.org today
and native apps later. Authn/authz is enforced in app code; RLS is
defense-in-depth. Run locally with:

    uvicorn app.main:app --reload
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.core.errors import register_error_handlers
from app.core.logging import configure_logging, get_logger
from app.routers import (
    admin,
    ai,
    handoff,
    health,
    live,
    me,
    media,
    onboarding,
    payments,
    safety,
    scheduling,
    therapist,
)


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    configure_logging()
    settings = get_settings()
    get_logger("hovio").info("Backend starting in env=%s", settings.APP_ENV)
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="Hovio API",
        version="0.1.0",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    register_error_handlers(app)
    app.include_router(health.router)
    app.include_router(me.router)
    app.include_router(onboarding.router)
    app.include_router(safety.router)
    app.include_router(ai.router)
    app.include_router(handoff.router)
    app.include_router(therapist.router)
    app.include_router(media.router)
    app.include_router(admin.router)
    app.include_router(scheduling.router)
    app.include_router(payments.router)
    app.include_router(payments.webhook_router)
    app.include_router(live.router)
    return app


app = create_app()
