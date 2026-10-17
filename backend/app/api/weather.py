from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, Query

from app.api.deps import get_weather_provider
from app.providers.base import WeatherProvider
from app.schemas.common import ErrorResponse
from app.schemas.weather import WeatherForecastResponse, WeatherHistoryResponse
from app.services.weather_service import get_forecast, get_history

router = APIRouter(prefix="/api/v1/weather", tags=["weather"])
ERRORS = {422: {"model": ErrorResponse}, 502: {"model": ErrorResponse}}


@router.get("/history", response_model=WeatherHistoryResponse, responses=ERRORS, summary="Daily weather history and derived environmental features (Open-Meteo)")
def history(
    lat: float = Query(..., ge=-90, le=90, description="Latitude (WGS84)"),
    lon: float = Query(..., ge=-180, le=180, description="Longitude (WGS84)"),
    days: int = Query(30, ge=7, le=365),
    end_date: date | None = Query(None, description="Defaults to today."),
    provider: WeatherProvider = Depends(get_weather_provider),
) -> WeatherHistoryResponse:
    return get_history(provider, lat, lon, days, end_date)


@router.get("/forecast", response_model=WeatherForecastResponse, responses=ERRORS, summary="Daily forecast plus configurable HEAT_STRESS / DRY_SPELL / HEAVY_RAIN alert evaluation")
def forecast(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    days: int = Query(7, ge=1, le=16),
    provider: WeatherProvider = Depends(get_weather_provider),
) -> WeatherForecastResponse:
    return get_forecast(provider, lat, lon, days)
