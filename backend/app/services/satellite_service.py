"""Field-level satellite statistics orchestration (Sentinel-2 via a pluggable provider)."""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from app.config import load_rules
from app.errors import ApiError, ErrorCode
from app.providers.base import FieldSatelliteProvider, ProviderError, ProviderNotConfigured
from app.schemas.common import CropContext
from app.schemas.satellite import FieldGeometryInfo, FieldStatsResponse, SatelliteObservation
from app.services.baseline import DEFAULT_WINDOW_DAYS, compute_seasonal_baseline
from app.services.feature_engineering import summarize_vegetation
from app.utils.geo import GeometryCheck, GeometryError, validate_polygon
from app.utils.provenance import SourceType, make_provenance


def check_geometry(geometry: dict[str, Any]) -> GeometryCheck:
    try:
        return validate_polygon(geometry)
    except GeometryError as exc:
        raise ApiError(ErrorCode.INVALID_FIELD_GEOMETRY, str(exc)) from exc


def fetch_field_series(
    provider: FieldSatelliteProvider, geometry: dict[str, Any], start: date, end: date, baseline_years: int
) -> tuple[list[SatelliteObservation], list[SatelliteObservation], dict]:
    """Return (current-window observations, historical baseline observations, metadata)."""
    if not provider.configured:
        raise ApiError(
            ErrorCode.SATELLITE_PROVIDER_NOT_CONFIGURED,
            "Satellite provider is not configured (set SENTINEL_CLIENT_ID and SENTINEL_CLIENT_SECRET). No satellite values were generated.",
            {"provider": provider.name},
        )
    try:
        current = provider.field_statistics(geometry, start, end)
        history: list[SatelliteObservation] = []
        for k in range(1, baseline_years + 1):
            try:
                hs = start.replace(year=start.year - k) - timedelta(days=DEFAULT_WINDOW_DAYS)
                he = end.replace(year=end.year - k) + timedelta(days=DEFAULT_WINDOW_DAYS)
            except ValueError:  # 29 Feb
                hs = start - timedelta(days=365 * k + DEFAULT_WINDOW_DAYS)
                he = end - timedelta(days=365 * k - DEFAULT_WINDOW_DAYS)
            history.extend(provider.field_statistics(geometry, hs, he).observations)
    except ProviderNotConfigured as exc:
        raise ApiError(ErrorCode.SATELLITE_PROVIDER_NOT_CONFIGURED, str(exc), {"provider": provider.name}) from exc
    except ProviderError as exc:
        raise ApiError(ErrorCode.SATELLITE_DATA_UNAVAILABLE, "Satellite provider failed to return data.", {"provider": provider.name, "detail": str(exc)}) from exc
    return current.observations, history, current.metadata | {"retrieved_at": current.retrieved_at}


def field_stats(
    provider: FieldSatelliteProvider,
    geometry: dict[str, Any],
    start: date | None,
    end: date | None,
    baseline_years: int,
    crop: CropContext,
) -> FieldStatsResponse:
    geo = check_geometry(geometry)
    end = end or date.today()
    start = start or end - timedelta(days=60)
    if start > end:
        raise ApiError(ErrorCode.VALIDATION_ERROR, "start_date must not be after end_date.")

    current, history, meta = fetch_field_series(provider, geometry, start, end, baseline_years)
    if not current:
        raise ApiError(ErrorCode.SATELLITE_DATA_UNAVAILABLE, "No Sentinel-2 acquisitions were returned for this field and period.", {"start": start.isoformat(), "end": end.isoformat()})

    min_valid = load_rules("evidence_config")["min_usable_valid_pixel_pct"]
    latest_date = date.fromisoformat(max(o.date for o in current))
    base_ndvi = compute_seasonal_baseline(history, latest_date, attr="ndvi", min_valid_pixel_pct=min_valid, crop_type=crop.crop_type)
    base_ndmi = compute_seasonal_baseline(history, latest_date, attr="ndmi", min_valid_pixel_pct=min_valid, crop_type=crop.crop_type)
    summary = summarize_vegetation(current, end, base_ndvi, base_ndmi, min_valid)

    prov = [
        make_provenance(provider.name, SourceType.OBSERVED, observed_at=summary.latest_usable_date, retrieved_at=meta.get("retrieved_at"),
                        quality_flags=geo.warnings + summary.quality_flags, provider_metadata={k: v for k, v in meta.items() if k != "retrieved_at"}),
        make_provenance("seasonal_baseline", SourceType.INFERRED, observed_at=latest_date.isoformat(), provider_metadata={"method": base_ndvi.method}),
    ]
    return FieldStatsResponse(
        geometry=FieldGeometryInfo(area_ha=round(geo.area_ha, 4), approx_pixels_10m=geo.approx_pixels_10m,
                                   centroid_lat=round(geo.centroid[0], 6), centroid_lon=round(geo.centroid[1], 6), warnings=geo.warnings),
        observations=current,
        baseline_observations_count=len(history),
        summary=summary,
        warnings=geo.warnings,
        provenance=prov,
    )
