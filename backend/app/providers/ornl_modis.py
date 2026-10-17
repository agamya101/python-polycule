"""MODIS MOD13Q1 (Collection 6.1) subsets from the ORNL DAAC TESViS web service.

Service: https://modis.ornl.gov/rst/api/v1/  (no credentials required)

* Product: MOD13Q1, MODIS/Terra Vegetation Indices, 16-day composite, 250 m.
* Bands used: ``250m_16_days_NDVI`` (scale 0.0001, fill -3000, valid
  -2000..10000) and ``250m_16_days_pixel_reliability`` (0 good, 1 marginal,
  2 snow/ice, 3 cloudy, -1 fill).
* A subset is a small pixel grid centred on a point (``km_above_below`` /
  ``km_left_right``). The service returns at most 10 composites per request,
  so long periods are fetched in 10-composite chunks.

Cell aggregation (documented, deterministic):
    accepted pixel  = NDVI not fill, NDVI within valid range, reliability in {0, 1}
    cell NDVI       = median of accepted pixels' scaled NDVI
    valid_pixel_pct = accepted pixels / all pixels in the subset * 100
    good_pixel_pct  = reliability-0 pixels / all pixels * 100
A composite with no accepted pixels yields ``ndvi = None`` (never a substitute).

Raw JSON responses are cached on disk and never edited. Transient failures are
retried with backoff; persistent failures raise ``ProviderError``.
"""

from __future__ import annotations

import hashlib
import json
import statistics
import time
from dataclasses import dataclass, field
from datetime import date, timedelta
from pathlib import Path
from typing import Any

import httpx

from app.providers.base import ProviderError

BASE_URL = "https://modis.ornl.gov/rst/api/v1"
PRODUCT = "MOD13Q1"
NDVI_BAND = "250m_16_days_NDVI"
RELIABILITY_BAND = "250m_16_days_pixel_reliability"
NDVI_SCALE = 0.0001
NDVI_FILL = -3000
NDVI_VALID_MIN, NDVI_VALID_MAX = -2000, 10000
RELIABILITY_FILL = -1
ACCEPTED_RELIABILITY = frozenset({0, 1})
RELIABILITY_LABELS = {-1: "fill", 0: "good", 1: "marginal", 2: "snow_ice", 3: "cloudy"}
MAX_DATES_PER_REQUEST = 10
COMPOSITE_DAYS = 16


@dataclass
class CompositeRecord:
    """Per-composite cell statistic derived from a MOD13Q1 subset."""

    modis_date: str
    composite_start: str
    composite_end: str
    tile: str | None
    ndvi: float | None
    valid_pixel_pct: float
    good_pixel_pct: float
    pixel_count: int
    accepted_pixels: int
    reliability_counts: dict[str, int] = field(default_factory=dict)
    proc_date: str | None = None


def scale_ndvi(raw: int | float | None) -> float | None:
    """Scale a raw MOD13Q1 NDVI integer; returns None for fill or out-of-range values."""
    if raw is None:
        return None
    v = int(raw)
    if v == NDVI_FILL or v < NDVI_VALID_MIN or v > NDVI_VALID_MAX:
        return None
    return round(v * NDVI_SCALE, 4)


def aggregate_composite(ndvi_raw: list[int], reliability: list[int]) -> tuple[float | None, float, float, int, dict[str, int]]:
    """Return (median NDVI of accepted pixels, valid %, good %, accepted count, reliability counts)."""
    if len(ndvi_raw) != len(reliability):
        raise ProviderError("NDVI and reliability subsets have different pixel counts.")
    n = len(ndvi_raw)
    counts: dict[str, int] = {}
    accepted: list[float] = []
    good = 0
    for raw, rel in zip(ndvi_raw, reliability):
        label = RELIABILITY_LABELS.get(int(rel), f"unknown_{rel}")
        counts[label] = counts.get(label, 0) + 1
        value = scale_ndvi(raw)
        if value is None or int(rel) not in ACCEPTED_RELIABILITY:
            continue
        accepted.append(value)
        if int(rel) == 0:
            good += 1
    if n == 0:
        return None, 0.0, 0.0, 0, counts
    ndvi = round(statistics.median(accepted), 4) if accepted else None
    return ndvi, round(100 * len(accepted) / n, 2), round(100 * good / n, 2), len(accepted), counts


def merge_subsets(ndvi_payloads: list[dict[str, Any]], rel_payloads: list[dict[str, Any]]) -> list[CompositeRecord]:
    """Join NDVI and reliability subset responses by composite date and aggregate."""
    rel_by_date: dict[str, dict[str, Any]] = {}
    for p in rel_payloads:
        for s in p.get("subset", []):
            rel_by_date[s["modis_date"]] = s
    out: list[CompositeRecord] = []
    for p in ndvi_payloads:
        for s in p.get("subset", []):
            r = rel_by_date.get(s["modis_date"])
            if r is None:
                continue  # no quality information -> composite not used
            ndvi, valid, good, acc, counts = aggregate_composite(s["data"], r["data"])
            start = date.fromisoformat(s["calendar_date"])
            out.append(CompositeRecord(
                modis_date=s["modis_date"], composite_start=start.isoformat(),
                composite_end=(start + timedelta(days=COMPOSITE_DAYS - 1)).isoformat(), tile=s.get("tile"),
                ndvi=ndvi, valid_pixel_pct=valid, good_pixel_pct=good, pixel_count=len(s["data"]), accepted_pixels=acc,
                reliability_counts=counts, proc_date=s.get("proc_date"),
            ))
    out.sort(key=lambda c: c.composite_start)
    return out


class OrnlModisProvider:
    name = "ornl_daac_tesvis"
    product = PRODUCT
    nominal_resolution_m = 250

    def __init__(self, cache_dir: Path, client: httpx.Client | None = None, timeout: float = 90.0,
                 retries: int = 4, backoff_seconds: float = 5.0, refresh: bool = False):
        self.cache_dir = cache_dir
        self._client = client
        self._timeout = timeout
        self._retries = retries
        self._backoff = backoff_seconds
        self._refresh = refresh

    # ----------------------------------------------------------- http/cache
    def _cache_path(self, kind: str, params: dict[str, Any]) -> Path:
        key = hashlib.sha256(json.dumps([kind, params], sort_keys=True).encode()).hexdigest()[:24]
        return self.cache_dir / kind / f"{key}.json"

    def _get(self, kind: str, path: str, params: dict[str, Any], ttl_seconds: float | None = None) -> dict[str, Any]:
        cache = self._cache_path(kind, params)
        cached = json.loads(cache.read_text(encoding="utf-8")) if cache.exists() else None
        if cached and not self._refresh:
            fresh = ttl_seconds is None or (time.time() - cached.get("retrieved_epoch", 0)) < ttl_seconds
            if fresh:
                return cached["response"]
        # Explicit per-phase timeouts: a stalled connection must fail and be retried, not hang.
        client = self._client or httpx.Client(timeout=httpx.Timeout(self._timeout, connect=30.0, pool=30.0))
        last: Exception | None = None
        try:
            for attempt in range(self._retries):
                try:
                    resp = client.get(f"{BASE_URL}/{path}", params=params, headers={"Accept": "application/json"})
                    if resp.status_code == 200:
                        payload = resp.json()
                        cache.parent.mkdir(parents=True, exist_ok=True)
                        cache.write_text(json.dumps({"retrieved_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                                                     "retrieved_epoch": time.time(),
                                                     "url": f"{BASE_URL}/{path}", "params": params, "response": payload}), encoding="utf-8")
                        return payload
                    if resp.status_code in (400, 404):
                        raise ProviderError(f"ORNL MODIS request rejected (HTTP {resp.status_code}): {resp.text[:200]}")
                    last = ProviderError(f"HTTP {resp.status_code}")
                except (httpx.HTTPError, ValueError) as exc:
                    last = exc
                time.sleep(self._backoff * (2**attempt))
        finally:
            if self._client is None:
                client.close()
        if cached:  # stale but real: better than nothing, caller sees the original retrieval time
            return cached["response"]
        raise ProviderError(f"ORNL MODIS service unavailable after {self._retries} attempts: {last}")

    def cached_retrieval_time(self, kind: str, params: dict[str, Any]) -> str | None:
        p = self._cache_path(kind, params)
        if p.exists():
            return json.loads(p.read_text(encoding="utf-8")).get("retrieved_at")
        return None

    # --------------------------------------------------------------- public
    def dates(self, lat: float, lon: float) -> list[dict[str, str]]:
        params = {"latitude": round(lat, 5), "longitude": round(lon, 5)}
        # The composite list grows every 16 days; re-check daily.
        return self._get("dates", f"{PRODUCT}/dates", params, ttl_seconds=86400).get("dates", [])

    def subset(self, lat: float, lon: float, band: str, start_modis: str, end_modis: str, km: int) -> dict[str, Any]:
        params = {"latitude": round(lat, 5), "longitude": round(lon, 5), "band": band, "startDate": start_modis,
                  "endDate": end_modis, "kmAboveBelow": km, "kmLeftRight": km}
        return self._get("subset", f"{PRODUCT}/subset", params)

    def cell_series(self, lat: float, lon: float, start: date, end: date, km: int = 1) -> list[CompositeRecord]:
        all_dates = [d for d in self.dates(lat, lon) if start.isoformat() <= d["calendar_date"] <= end.isoformat()]
        if not all_dates:
            raise ProviderError("No MOD13Q1 composites available for this location and period.")
        ndvi_p, rel_p = [], []
        for i in range(0, len(all_dates), MAX_DATES_PER_REQUEST):
            chunk = all_dates[i : i + MAX_DATES_PER_REQUEST]
            a, b = chunk[0]["modis_date"], chunk[-1]["modis_date"]
            ndvi_p.append(self.subset(lat, lon, NDVI_BAND, a, b, km))
            rel_p.append(self.subset(lat, lon, RELIABILITY_BAND, a, b, km))
        return merge_subsets(ndvi_p, rel_p)
