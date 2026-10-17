"""Weather history/forecast orchestration and configurable weather alert rules."""

from __future__ import annotations

from datetime import date, timedelta

from app.config import load_rules
from app.errors import ApiError, ErrorCode
from app.providers.base import ProviderError, WeatherProvider, WeatherResult
from app.schemas.weather import DailyWeather, WeatherAlert, WeatherForecastResponse, WeatherHistoryResponse
from app.services.feature_engineering import compute_weather_features
from app.utils.geo import GeometryError, validate_lat_lon
from app.utils.provenance import Provenance, SourceType, make_provenance, utcnow_iso


def _check_coords(lat: float, lon: float) -> None:
    try:
        validate_lat_lon(lat, lon)
    except GeometryError as exc:
        raise ApiError(ErrorCode.INVALID_COORDINATES, str(exc)) from exc


def weather_provenance(result: WeatherResult, observed_at: str | None) -> Provenance:
    return make_provenance(
        result.source,
        SourceType.DEMO if result.is_demo else SourceType.OBSERVED,
        observed_at=observed_at,
        retrieved_at=result.retrieved_at,
        quality_flags=result.quality_flags,
        provider_metadata=result.metadata | {"cache_status": result.cache.status.value, "cache_age_seconds": result.cache.age_seconds},
        is_demo=result.is_demo,
    )


def fetch_history(provider: WeatherProvider, lat: float, lon: float, start: date, end: date) -> WeatherResult:
    _check_coords(lat, lon)
    try:
        return provider.history(lat, lon, start, end)
    except ProviderError as exc:
        raise ApiError(ErrorCode.WEATHER_PROVIDER_UNAVAILABLE, "Weather provider unavailable and no cached data exists.", {"provider": provider.name, "detail": str(exc)}) from exc


def get_history(provider: WeatherProvider, lat: float, lon: float, days: int, end: date | None = None) -> WeatherHistoryResponse:
    end = end or date.today()
    start = end - timedelta(days=days - 1)
    result = fetch_history(provider, lat, lon, start, end)
    features = compute_weather_features(result.daily, end)
    prov = weather_provenance(result, observed_at=f"{start.isoformat()}/{end.isoformat()}")
    derived = make_provenance("feature_engineering", SourceType.INFERRED, observed_at=end.isoformat(), is_demo=result.is_demo,
                              provider_metadata={"inputs": result.source})
    return WeatherHistoryResponse(
        latitude=lat, longitude=lon, start_date=start.isoformat(), end_date=end.isoformat(),
        daily=result.daily, features=features, cache=result.cache, provenance=[prov, derived],
    )


def get_forecast(provider: WeatherProvider, lat: float, lon: float, days: int) -> WeatherForecastResponse:
    _check_coords(lat, lon)
    try:
        fc = provider.forecast(lat, lon, days)
    except ProviderError as exc:
        raise ApiError(ErrorCode.WEATHER_PROVIDER_UNAVAILABLE, "Weather forecast unavailable and no cached data exists.", {"provider": provider.name, "detail": str(exc)}) from exc

    recent: list[DailyWeather] = []
    flags: list[str] = []
    try:
        recent = provider.history(lat, lon, date.today() - timedelta(days=29), date.today()).daily
    except ProviderError:
        flags.append("RECENT_HISTORY_UNAVAILABLE_DRY_SPELL_NOT_EVALUATED")
    alerts = evaluate_alerts(recent, fc.daily)
    prov = weather_provenance(fc, observed_at=None)
    prov.quality_flags += ["FORECAST_NOT_OBSERVATION"] + flags
    return WeatherForecastResponse(latitude=lat, longitude=lon, daily=fc.daily, alerts=alerts, cache=fc.cache, provenance=[prov])


def _severity(value: float, bands: list[dict]) -> str | None:
    level = None
    for b in bands:
        if value >= b["value_gte"]:
            level = b["level"]
    return level


def evaluate_alerts(recent: list[DailyWeather], forecast: list[DailyWeather], now: str | None = None) -> list[WeatherAlert]:
    """Evaluate HEAT_STRESS, DRY_SPELL and HEAVY_RAIN rules. Every rule is reported (triggered or not)."""
    rules = load_rules("weather_rules")["alerts"]
    ts = now or utcnow_iso()
    alerts: list[WeatherAlert] = []

    # HEAT_STRESS on forecast: longest run of consecutive days with tmax >= threshold.
    hs = rules["HEAT_STRESS"]
    run: list[DailyWeather] = []
    best: list[DailyWeather] = []
    for d in forecast:
        if d.temperature_2m_max_c is not None and d.temperature_2m_max_c >= hs["tmax_c_gte"]:
            run.append(d)
            if len(run) > len(best):
                best = list(run)
        else:
            run = []
    peak = max((d.temperature_2m_max_c for d in forecast if d.temperature_2m_max_c is not None), default=None)
    trig = len(best) >= hs["min_consecutive_days"]
    alerts.append(WeatherAlert(
        rule="HEAT_STRESS", triggered=trig,
        severity=_severity(max(d.temperature_2m_max_c for d in best), hs["severity"]) if trig else None,  # type: ignore[type-var]
        input_values={"forecast_peak_tmax_c": peak, "longest_hot_run_days": len(best)},
        configured_threshold={"tmax_c_gte": hs["tmax_c_gte"], "min_consecutive_days": hs["min_consecutive_days"]},
        dates=[d.date for d in best] if trig else [], evaluated_at=ts,
    ))

    # DRY_SPELL on recent history: consecutive days up to the latest day below threshold.
    ds = rules["DRY_SPELL"]
    spell = 0
    spell_dates: list[str] = []
    for d in sorted(recent, key=lambda r: r.date, reverse=True):
        if d.precipitation_mm is None or d.precipitation_mm >= ds["daily_precip_mm_lt"]:
            break
        spell += 1
        spell_dates.append(d.date)
    trig = bool(recent) and spell >= ds["min_days"]
    alerts.append(WeatherAlert(
        rule="DRY_SPELL", triggered=trig, severity=_severity(spell, ds["severity"]) if trig else None,
        input_values={"consecutive_dry_days": spell if recent else None, "history_days_available": len(recent)},
        configured_threshold={"daily_precip_mm_lt": ds["daily_precip_mm_lt"], "min_days": ds["min_days"]},
        dates=sorted(spell_dates) if trig else [], evaluated_at=ts,
    ))

    # HEAVY_RAIN on forecast.
    hr = rules["HEAVY_RAIN"]
    wet = [d for d in forecast if d.precipitation_mm is not None and d.precipitation_mm >= hr["daily_precip_mm_gte"]]
    peak_rain = max((d.precipitation_mm for d in forecast if d.precipitation_mm is not None), default=None)
    alerts.append(WeatherAlert(
        rule="HEAVY_RAIN", triggered=bool(wet),
        severity=_severity(max(d.precipitation_mm for d in wet), hr["severity"]) if wet else None,  # type: ignore[type-var]
        input_values={"forecast_peak_daily_precip_mm": peak_rain},
        configured_threshold={"daily_precip_mm_gte": hr["daily_precip_mm_gte"]},
        dates=[d.date for d in wet], evaluated_at=ts,
    ))
    return alerts
