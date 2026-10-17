"""Open-Meteo weather provider (no API key required).

* Recent history (within ~90 days) and forecasts use the forecast API
  (``past_days`` / ``forecast_days``).
* Older history uses the historical archive API (ERA5-based reanalysis, with a
  delay of a few days).

Both are gridded model/reanalysis products, not station observations; this is
recorded in ``quality_flags``. Responses are cached on disk so a demo survives
temporary API failures; cached data is always labelled with its age.
"""

from __future__ import annotations

import hashlib
import json
import time
from collections import defaultdict
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

import httpx

from app.config import get_settings
from app.providers.base import ProviderError, WeatherProvider, WeatherResult
from app.schemas.weather import CacheInfo, CacheStatus, DailyWeather
from app.utils.provenance import utcnow_iso

ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
DAILY_VARS = "precipitation_sum,temperature_2m_max,temperature_2m_min,temperature_2m_mean,et0_fao_evapotranspiration"
HOURLY_VARS = "soil_moisture_0_to_7cm"
MAX_PAST_DAYS = 92


class OpenMeteoProvider(WeatherProvider):
    name = "open_meteo"

    def __init__(self, client: httpx.Client | None = None, cache_dir: Path | None = None, ttl_seconds: int | None = None,
                 rate_limit_retries: int = 0, rate_limit_wait_seconds: float = 61.0):
        settings = get_settings()
        self._client = client
        self._forecast_url = settings.open_meteo_forecast_url
        self._timeout = settings.http_timeout_seconds
        self._cache_dir = (cache_dir or settings.cache_dir) / "open_meteo"
        self._ttl = settings.cache_ttl_seconds if ttl_seconds is None else ttl_seconds
        # Batch jobs (e.g. the pilot build) may wait out Open-Meteo's per-minute limit (HTTP 429);
        # interactive API requests do not (default 0 retries).
        self._rl_retries = rate_limit_retries
        self._rl_wait = rate_limit_wait_seconds

    # ---------------------------------------------------------------- public
    def history(self, lat: float, lon: float, start: date, end: date, include_soil_moisture: bool = True) -> WeatherResult:
        today = date.today()
        if start > end:
            raise ProviderError("start date is after end date")
        if (today - start).days <= MAX_PAST_DAYS - 2 and end <= today:
            past_days = (today - start).days + 1
            params = self._base(lat, lon, include_soil_moisture) | {"past_days": past_days, "forecast_days": 1}
            url, endpoint = self._forecast_url, "forecast(past_days)"
        else:
            params = self._base(lat, lon, include_soil_moisture) | {"start_date": start.isoformat(), "end_date": end.isoformat()}
            url, endpoint = ARCHIVE_URL, "archive"
        result = self._fetch(url, params, endpoint)
        result.daily = [d for d in result.daily if start.isoformat() <= d.date <= end.isoformat()]
        return result

    def forecast(self, lat: float, lon: float, days: int) -> WeatherResult:
        days = max(1, min(16, days))
        params = self._base(lat, lon) | {"forecast_days": days}
        result = self._fetch(self._forecast_url, params, "forecast")
        today = date.today().isoformat()
        result.daily = [d for d in result.daily if d.date >= today]
        return result

    # -------------------------------------------------------------- internal
    @staticmethod
    def _base(lat: float, lon: float, include_soil_moisture: bool = True) -> dict[str, Any]:
        params: dict[str, Any] = {
            "latitude": round(lat, 4),
            "longitude": round(lon, 4),
            "daily": DAILY_VARS,
            "timezone": "auto",
        }
        if include_soil_moisture:
            params["hourly"] = HOURLY_VARS
        return params

    def _cache_path(self, url: str, params: dict[str, Any]) -> Path:
        key = hashlib.sha256((url + json.dumps(params, sort_keys=True)).encode()).hexdigest()[:32]
        return self._cache_dir / f"{key}.json"

    def _read_cache(self, path: Path) -> tuple[dict[str, Any], float] | None:
        try:
            blob = json.loads(path.read_text(encoding="utf-8"))
            age = time.time() - float(blob["retrieved_epoch"])
            return blob, age
        except (OSError, ValueError, KeyError):
            return None

    def _fetch(self, url: str, params: dict[str, Any], endpoint: str) -> WeatherResult:
        path = self._cache_path(url, params)
        cached = self._read_cache(path)
        if cached and cached[1] < self._ttl:
            blob, age = cached
            return self._to_result(blob, CacheInfo(status=CacheStatus.CACHED_FRESH, age_seconds=round(age, 1)), endpoint)

        try:
            client = self._client or httpx.Client(timeout=self._timeout)
            try:
                resp = client.get(url, params=params)
                for _ in range(self._rl_retries):
                    if resp.status_code != 429:
                        break
                    time.sleep(self._rl_wait)
                    resp = client.get(url, params=params)
            finally:
                if self._client is None:
                    client.close()
            if resp.status_code != 200:
                raise ProviderError(f"Open-Meteo returned HTTP {resp.status_code}: {resp.text[:200]}")
            payload = resp.json()
            if payload.get("error"):
                raise ProviderError(f"Open-Meteo error: {payload.get('reason')}")
        except (httpx.HTTPError, ValueError, ProviderError) as exc:
            if cached:
                blob, age = cached
                info = CacheInfo(
                    status=CacheStatus.CACHED_STALE,
                    age_seconds=round(age, 1),
                    note=f"Live request failed ({type(exc).__name__}); returning cached response retrieved {round(age / 3600, 1)} h ago.",
                )
                return self._to_result(blob, info, endpoint)
            raise ProviderError(f"Open-Meteo unavailable and no cached response exists: {exc}") from exc

        blob = {
            "retrieved_at": utcnow_iso(),
            "retrieved_epoch": time.time(),
            "url": url,
            "params": params,
            "response": payload,
        }
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(blob), encoding="utf-8")
        except OSError:
            pass
        return self._to_result(blob, CacheInfo(status=CacheStatus.LIVE, age_seconds=0.0), endpoint)

    def _to_result(self, blob: dict[str, Any], cache: CacheInfo, endpoint: str) -> WeatherResult:
        payload = blob["response"]
        daily = parse_daily(payload)
        flags = ["GRIDDED_MODEL_OR_REANALYSIS_DATA_NOT_STATION_OBSERVATION"]
        if cache.status == CacheStatus.CACHED_STALE:
            flags.append("STALE_CACHE")
        return WeatherResult(
            daily=daily,
            cache=cache,
            source=self.name,
            retrieved_at=blob.get("retrieved_at") or datetime.now(timezone.utc).isoformat(),
            metadata={
                "endpoint": endpoint,
                "grid_latitude": payload.get("latitude"),
                "grid_longitude": payload.get("longitude"),
                "elevation_m": payload.get("elevation"),
                "timezone": payload.get("timezone"),
            },
            quality_flags=flags,
        )


def _num(v: Any) -> float | None:
    return None if v is None else float(v)


def parse_daily(payload: dict[str, Any]) -> list[DailyWeather]:
    """Convert an Open-Meteo JSON payload to ``DailyWeather`` rows (missing values stay None)."""
    daily = payload.get("daily") or {}
    times: list[str] = daily.get("time") or []

    soil_by_day: dict[str, list[float]] = defaultdict(list)
    hourly = payload.get("hourly") or {}
    for t, v in zip(hourly.get("time") or [], hourly.get("soil_moisture_0_to_7cm") or []):
        if v is not None:
            soil_by_day[t[:10]].append(float(v))

    def col(name: str) -> list[Any]:
        values = daily.get(name) or []
        return list(values) + [None] * (len(times) - len(values))

    rows = []
    for i, t in enumerate(times):
        sm = soil_by_day.get(t)
        rows.append(
            DailyWeather(
                date=t,
                precipitation_mm=_num(col("precipitation_sum")[i]),
                temperature_2m_max_c=_num(col("temperature_2m_max")[i]),
                temperature_2m_min_c=_num(col("temperature_2m_min")[i]),
                temperature_2m_mean_c=_num(col("temperature_2m_mean")[i]),
                et0_mm=_num(col("et0_fao_evapotranspiration")[i]),
                soil_moisture_0_7cm_m3m3=round(sum(sm) / len(sm), 4) if sm else None,
            )
        )
    return rows
