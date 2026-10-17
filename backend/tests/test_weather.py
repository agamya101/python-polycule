import json
from datetime import date, timedelta

import httpx
import pytest

from app.providers.base import ProviderError
from app.providers.open_meteo import OpenMeteoProvider, parse_daily
from app.schemas.weather import CacheStatus, DailyWeather
from app.services.feature_engineering import compute_weather_features
from app.services.weather_service import evaluate_alerts
from tests.conftest import make_daily

AS_OF = date(2026, 10, 15)


def test_features_sums_and_balance():
    daily = make_daily(AS_OF, 40, rain=1.0, tmax=36.0, et0=5.0)
    f = compute_weather_features(daily, AS_OF)
    assert f.rainfall_7d_mm == 7.0 and f.rainfall_14d_mm == 14.0 and f.rainfall_30d_mm == 30.0
    assert f.et0_14d_mm == 70.0
    assert f.water_balance_14d_mm == pytest.approx(14.0 - 70.0)
    assert f.max_temperature_7d_c == 36.0 and f.heat_days_7d == 7
    assert f.dry_spell_length_days == 40  # all days below 2.5 mm; reported as a lower bound
    assert any("lower bound" in n for n in f.notes)


def test_features_ignore_future_rows():
    daily = make_daily(AS_OF + timedelta(days=10), 50, rain=0.0)
    for d in daily:
        if d.date > AS_OF.isoformat():
            d.precipitation_mm = 100.0
    f = compute_weather_features(daily, AS_OF)
    assert f.rainfall_7d_mm == 0.0


def test_missing_day_makes_window_unavailable_not_zero():
    daily = make_daily(AS_OF, 40, rain=3.0)
    daily = [d for d in daily if d.date != (AS_OF - timedelta(days=3)).isoformat()]
    f = compute_weather_features(daily, AS_OF)
    assert f.rainfall_7d_mm is None and f.water_balance_14d_mm is None
    assert f.rainfall_30d_mm is None
    assert any("missing" in n for n in f.notes)


def test_dry_spell_counts_back_to_last_rain():
    daily = make_daily(AS_OF, 30, rain=0.0)
    for d in daily:
        if d.date == (AS_OF - timedelta(days=9)).isoformat():
            d.precipitation_mm = 12.0
    assert compute_weather_features(daily, AS_OF).dry_spell_length_days == 9


def test_alert_rules():
    recent = make_daily(AS_OF, 20, rain=0.0)
    forecast = [DailyWeather(date=f"2026-10-1{i}", precipitation_mm=p, temperature_2m_max_c=t) for i, (p, t) in enumerate([(0, 41), (0, 43.5), (70, 33), (0, 30)])]
    alerts = {a.rule: a for a in evaluate_alerts(recent, forecast)}
    assert alerts["HEAT_STRESS"].triggered and alerts["HEAT_STRESS"].severity == "HIGH"
    assert alerts["DRY_SPELL"].triggered and alerts["DRY_SPELL"].input_values["consecutive_dry_days"] == 20
    assert alerts["HEAVY_RAIN"].triggered and alerts["HEAVY_RAIN"].configured_threshold["daily_precip_mm_gte"] == 64.5


PAYLOAD = {
    "latitude": 20.4, "longitude": 78.1, "timezone": "Asia/Kolkata",
    "daily": {"time": ["2026-10-14", "2026-10-15"], "precipitation_sum": [1.2, None], "temperature_2m_max": [33.0, 34.0],
              "temperature_2m_min": [22.0, 23.0], "temperature_2m_mean": [27.0, 28.0], "et0_fao_evapotranspiration": [4.1, 4.3]},
    "hourly": {"time": ["2026-10-14T00:00", "2026-10-14T01:00"], "soil_moisture_0_to_7cm": [0.2, 0.22]},
}


def test_parse_daily_keeps_missing_as_none():
    rows = parse_daily(PAYLOAD)
    assert rows[0].soil_moisture_0_7cm_m3m3 == 0.21
    assert rows[1].precipitation_mm is None


def test_provider_failure_without_cache_raises(tmp_path):
    client = httpx.Client(transport=httpx.MockTransport(lambda req: httpx.Response(500, text="down")))
    p = OpenMeteoProvider(client=client, cache_dir=tmp_path, ttl_seconds=3600)
    with pytest.raises(ProviderError):
        p.forecast(20.4, 78.1, 3)


def test_provider_failure_with_cache_returns_labelled_stale_data(tmp_path):
    ok = httpx.Client(transport=httpx.MockTransport(lambda req: httpx.Response(200, json=PAYLOAD)))
    first = OpenMeteoProvider(client=ok, cache_dir=tmp_path, ttl_seconds=0).history(20.4, 78.1, date(2026, 10, 14), date(2026, 10, 15))
    assert first.cache.status == CacheStatus.LIVE
    bad = httpx.Client(transport=httpx.MockTransport(lambda req: httpx.Response(503)))
    second = OpenMeteoProvider(client=bad, cache_dir=tmp_path, ttl_seconds=0).history(20.4, 78.1, date(2026, 10, 14), date(2026, 10, 15))
    assert second.cache.status == CacheStatus.CACHED_STALE
    assert "STALE_CACHE" in second.quality_flags
    assert [d.model_dump() for d in second.daily] == [d.model_dump() for d in first.daily]


def test_api_provider_failure_returns_structured_error(failing_weather_client):
    r = failing_weather_client.get("/api/v1/weather/history", params={"lat": 20.4, "lon": 78.1})
    assert r.status_code == 502
    assert r.json()["status"] == "WEATHER_PROVIDER_UNAVAILABLE"


def test_api_risk_survives_weather_outage(failing_weather_client):
    r = failing_weather_client.post("/api/v1/risk/analyze", json={"location_id": "x", "lat": 20.4, "lon": 78.1, "persist": False})
    assert r.status_code == 200
    body = r.json()
    assert body["risk"]["level"] == "INSUFFICIENT_EVIDENCE"
    assert any("WEATHER_PROVIDER_UNAVAILABLE" in w for w in body["warnings"])


def test_api_history_ok(client):
    r = client.get("/api/v1/weather/history", params={"lat": 20.4, "lon": 78.1, "days": 30})
    assert r.status_code == 200
    body = r.json()
    assert body["features"]["water_balance_14d_mm"] is not None
    assert body["provenance"][0]["source_type"] == "OBSERVED"
    assert body["provenance"][1]["source_type"] == "INFERRED"


def test_api_forecast_alerts(client):
    r = client.get("/api/v1/weather/forecast", params={"lat": 20.4, "lon": 78.1, "days": 5})
    assert r.status_code == 200
    rules = {a["rule"]: a for a in r.json()["alerts"]}
    assert set(rules) == {"HEAT_STRESS", "DRY_SPELL", "HEAVY_RAIN"}
    assert rules["HEAT_STRESS"]["triggered"] is True
    assert "FORECAST_NOT_OBSERVATION" in r.json()["provenance"][0]["quality_flags"]
    json.dumps(r.json())
