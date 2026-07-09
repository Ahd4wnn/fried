"""Uniform error responses per docs/api-contract.md.

Shape: ``{"error": {"code": "snake_case", "message": "...", "details": {}}}``.
Errors never leak PII — validation errors are sanitized to drop user input.
"""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException


class AppError(Exception):
    """A domain error that maps directly onto the API error contract."""

    def __init__(
        self,
        code: str,
        message: str,
        status_code: int = 400,
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details or {}


def _body(code: str, message: str, details: dict[str, Any] | None = None) -> dict[str, Any]:
    return {"error": {"code": code, "message": message, "details": details or {}}}


# Generic, non-leaky messages for raw HTTP status codes.
_STATUS_CODES: dict[int, str] = {
    400: "bad_request",
    401: "unauthorized",
    403: "forbidden",
    404: "not_found",
    405: "method_not_allowed",
    409: "conflict",
    429: "rate_limited",
    500: "internal_error",
}


async def _app_error_handler(_request: Request, exc: AppError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content=_body(exc.code, exc.message, exc.details),
    )


async def _http_exception_handler(_request: Request, exc: StarletteHTTPException) -> JSONResponse:
    code = _STATUS_CODES.get(exc.status_code, "error")
    message = exc.detail if isinstance(exc.detail, str) else "Something went wrong."
    return JSONResponse(status_code=exc.status_code, content=_body(code, message))


async def _validation_handler(_request: Request, exc: RequestValidationError) -> JSONResponse:
    # Sanitize: report only field + message + type. Never echo the input value
    # (it may contain a password or other PII).
    fields = [
        {
            "field": ".".join(str(p) for p in err.get("loc", []) if p != "body"),
            "message": err.get("msg", "Invalid value."),
            "type": err.get("type", "value_error"),
        }
        for err in exc.errors()
    ]
    return JSONResponse(
        status_code=422,
        content=_body(
            "validation_error",
            "Some details need fixing. Please check the highlighted fields.",
            {"fields": fields},
        ),
    )


def register_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(AppError, _app_error_handler)
    app.add_exception_handler(StarletteHTTPException, _http_exception_handler)
    app.add_exception_handler(RequestValidationError, _validation_handler)
