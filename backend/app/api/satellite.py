from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends

from app.api.deps import get_satellite_provider
from app.providers.base import FieldSatelliteProvider
from app.schemas.common import ErrorResponse
from app.schemas.satellite import FieldStatsRequest, FieldStatsResponse
from app.services.satellite_service import field_stats

router = APIRouter(prefix="/api/v1/satellite", tags=["satellite"])
ERRORS = {422: {"model": ErrorResponse}, 502: {"model": ErrorResponse}, 503: {"model": ErrorResponse}}


@router.post(
    "/field/stats",
    response_model=FieldStatsResponse,
    responses=ERRORS,
    summary="Sentinel-2 NDVI/NDMI field statistics with seasonal baseline (requires Sentinel Hub credentials)",
    description="Returns 503 with status SATELLITE_PROVIDER_NOT_CONFIGURED when credentials are missing. Values are never generated as a substitute.",
)
def stats(req: FieldStatsRequest, provider: FieldSatelliteProvider = Depends(get_satellite_provider)) -> FieldStatsResponse:
    return field_stats(
        provider,
        req.geometry.as_dict(),
        date.fromisoformat(req.start_date) if req.start_date else None,
        date.fromisoformat(req.end_date) if req.end_date else None,
        req.baseline_years,
        req.crop,
    )


@router.get("/providers", summary="Satellite provider configuration")
def providers(provider: FieldSatelliteProvider = Depends(get_satellite_provider)) -> dict:
    return {
        "field": {"name": provider.name, "configured": provider.configured, "resolution_m": 10, "collection": "sentinel-2-l2a"},
        "regional": {
            "name": "ornl_daac_tesvis",
            "configured": True,
            "product": "MOD13Q1 C6.1",
            "resolution_m": 250,
            "note": "Regional trend monitoring only (Yavatmal pilot); unsuitable for small-field measurement.",
        },
    }
