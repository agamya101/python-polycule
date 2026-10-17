"""Shared FastAPI dependencies (overridable in tests via ``app.dependency_overrides``)."""

from __future__ import annotations

from app.providers.base import FieldSatelliteProvider, WeatherProvider
from app.providers.open_meteo import OpenMeteoProvider
from app.providers.sentinel_hub import SentinelHubProvider


def get_weather_provider() -> WeatherProvider:
    return OpenMeteoProvider()


def get_satellite_provider() -> FieldSatelliteProvider:
    return SentinelHubProvider()
