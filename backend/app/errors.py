"""Structured API errors.

Predictable failures are returned as::

    {"status": "<CODE>", "error": {"code": "<CODE>", "message": "...", "details": {...}}}

so frontends can branch on ``status`` without parsing messages.
"""

from __future__ import annotations

from enum import Enum
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse


class ErrorCode(str, Enum):
    SATELLITE_PROVIDER_NOT_CONFIGURED = "SATELLITE_PROVIDER_NOT_CONFIGURED"
    SATELLITE_DATA_UNAVAILABLE = "SATELLITE_DATA_UNAVAILABLE"
    INSUFFICIENT_EVIDENCE = "INSUFFICIENT_EVIDENCE"
    INVALID_FIELD_GEOMETRY = "INVALID_FIELD_GEOMETRY"
    INVALID_COORDINATES = "INVALID_COORDINATES"
    WEATHER_PROVIDER_UNAVAILABLE = "WEATHER_PROVIDER_UNAVAILABLE"
    MODEL_NOT_AVAILABLE = "MODEL_NOT_AVAILABLE"
    INVALID_SOIL_PARAMETER = "INVALID_SOIL_PARAMETER"
    DEMO_DATA_DISABLED = "DEMO_DATA_DISABLED"
    NOT_FOUND = "NOT_FOUND"
    PILOT_NOT_BUILT = "PILOT_NOT_BUILT"
    INVALID_STATE_TRANSITION = "INVALID_STATE_TRANSITION"
    VALIDATION_ERROR = "VALIDATION_ERROR"
    INTERNAL_ERROR = "INTERNAL_ERROR"


_HTTP_STATUS = {
    ErrorCode.SATELLITE_PROVIDER_NOT_CONFIGURED: 503,
    ErrorCode.SATELLITE_DATA_UNAVAILABLE: 502,
    ErrorCode.INSUFFICIENT_EVIDENCE: 422,
    ErrorCode.INVALID_FIELD_GEOMETRY: 422,
    ErrorCode.INVALID_COORDINATES: 422,
    ErrorCode.WEATHER_PROVIDER_UNAVAILABLE: 502,
    ErrorCode.MODEL_NOT_AVAILABLE: 503,
    ErrorCode.INVALID_SOIL_PARAMETER: 422,
    ErrorCode.DEMO_DATA_DISABLED: 403,
    ErrorCode.NOT_FOUND: 404,
    ErrorCode.PILOT_NOT_BUILT: 503,
    ErrorCode.INVALID_STATE_TRANSITION: 409,
    ErrorCode.VALIDATION_ERROR: 422,
    ErrorCode.INTERNAL_ERROR: 500,
}


class ApiError(Exception):
    def __init__(self, code: ErrorCode, message: str, details: dict[str, Any] | None = None, http_status: int | None = None):
        super().__init__(message)
        self.code = code
        self.message = message
        self.details = details or {}
        self.http_status = http_status or _HTTP_STATUS[code]

    def body(self) -> dict[str, Any]:
        return {"status": self.code.value, "error": {"code": self.code.value, "message": self.message, "details": self.details}}


def error_body(code: ErrorCode, message: str, details: dict[str, Any] | None = None) -> dict[str, Any]:
    return ApiError(code, message, details).body()


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def _api_error(_: Request, exc: ApiError) -> JSONResponse:
        return JSONResponse(status_code=exc.http_status, content=exc.body())

    from app.api.frontend_bridge import FrontendApiError

    @app.exception_handler(FrontendApiError)
    async def _frontend_api_error(_: Request, exc: FrontendApiError) -> JSONResponse:
        return JSONResponse(status_code=exc.custom_status, content={"code": exc.code, "detail": exc.custom_detail})

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError) -> JSONResponse:
        errors = [
            {"loc": list(e.get("loc", [])), "msg": e.get("msg"), "type": e.get("type")}
            for e in exc.errors()
        ]
        # Surface domain-specific codes when the validation failure is about
        # coordinates, geometry or soil values.
        code = ErrorCode.VALIDATION_ERROR
        parts = {str(p).lower() for e in errors for p in e["loc"]}
        text = " ".join(str(e["msg"]) for e in errors).lower()
        if parts & {"geometry", "coordinates"}:
            code = ErrorCode.INVALID_FIELD_GEOMETRY
        elif parts & {"lat", "lon"} or "latitude" in text or "longitude" in text:
            code = ErrorCode.INVALID_COORDINATES
        elif parts & {"values", "soil"}:
            code = ErrorCode.INVALID_SOIL_PARAMETER
        return JSONResponse(status_code=422, content=error_body(code, "Request validation failed.", {"errors": errors}))
