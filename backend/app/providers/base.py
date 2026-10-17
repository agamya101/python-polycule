"""Provider interfaces.

Providers fetch raw data only. They never fabricate values: on failure they
raise ``ProviderError`` (or ``ProviderNotConfigured``) and the service layer
decides how to report it.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import date
from typing import Any

from app.schemas.satellite import SatelliteObservation
from app.schemas.weather import CacheInfo, DailyWeather


class ProviderError(RuntimeError):
    """The provider was reachable/configured but could not deliver data."""


class ProviderNotConfigured(RuntimeError):
    """The provider lacks configuration (e.g. credentials) and was not called."""


@dataclass
class WeatherResult:
    daily: list[DailyWeather]
    cache: CacheInfo
    source: str
    retrieved_at: str
    is_demo: bool = False
    metadata: dict[str, Any] = field(default_factory=dict)
    quality_flags: list[str] = field(default_factory=list)


class WeatherProvider(ABC):
    name: str

    @abstractmethod
    def history(self, lat: float, lon: float, start: date, end: date) -> WeatherResult: ...

    @abstractmethod
    def forecast(self, lat: float, lon: float, days: int) -> WeatherResult: ...


@dataclass
class SatelliteResult:
    observations: list[SatelliteObservation]
    source: str
    retrieved_at: str
    is_demo: bool = False
    metadata: dict[str, Any] = field(default_factory=dict)


class FieldSatelliteProvider(ABC):
    """Field (polygon) level statistics, e.g. Sentinel-2 via Sentinel Hub."""

    name: str

    @property
    @abstractmethod
    def configured(self) -> bool: ...

    @abstractmethod
    def field_statistics(self, geometry: dict[str, Any], start: date, end: date) -> SatelliteResult: ...


class RegionalVegetationProvider(ABC):
    """District/regional coarse-resolution monitoring (e.g. MODIS 250 m composites).

    Regional products are suitable for district-level trends only and must not
    be used to describe individual small fields.
    """

    name: str
    nominal_resolution_m: int

    @property
    @abstractmethod
    def configured(self) -> bool: ...

    @abstractmethod
    def regional_statistics(self, geometry: dict[str, Any], start: date, end: date) -> SatelliteResult: ...


class ModisRegionalProvider(RegionalVegetationProvider):
    """Generic polygon-statistics placeholder for MODIS.

    The working regional source is the point/subset client in
    ``app/providers/ornl_modis.py`` (ORNL DAAC TESViS), used by the Yavatmal
    pilot. Polygon-level regional statistics are not implemented here.
    """

    name = "modis"
    nominal_resolution_m = 250

    @property
    def configured(self) -> bool:
        return False

    def regional_statistics(self, geometry: dict[str, Any], start: date, end: date) -> SatelliteResult:
        raise ProviderNotConfigured("MODIS regional adapter is not implemented in this prototype.")
