"""Sentinel-2 L2A field statistics via the Sentinel Hub Statistical API.

Requires ``SENTINEL_CLIENT_ID`` / ``SENTINEL_CLIENT_SECRET``. Without them the
provider reports ``configured = False`` and is never called; no values are
generated in its place.

Band handling: NDVI uses B04 (red, 10 m) and B08 (NIR, 10 m). NDMI uses B08
and B11 (SWIR, native 20 m). The request is evaluated on a ~10 m grid with
bilinear upsampling, so B11 is resampled to 10 m before NDMI is computed. NDMI
therefore has an effective resolution of ~20 m.

Pixels flagged by the Scene Classification Layer as cloud shadow (3), cloud
medium/high probability (8, 9), thin cirrus (10) or snow (11), or lacking data,
are masked. ``valid_pixel_pct`` is the share of field pixels that survive the
mask.
"""

from __future__ import annotations

import math
import time
from datetime import date
from typing import Any

import httpx

from app.config import get_settings
from app.providers.base import FieldSatelliteProvider, ProviderError, ProviderNotConfigured, SatelliteResult
from app.schemas.satellite import SatelliteObservation
from app.utils.provenance import SourceType, utcnow_iso

EVALSCRIPT = """//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B04", "B08", "B11", "SCL", "dataMask"] }],
    output: [
      { id: "ndvi", bands: 1, sampleType: "FLOAT32" },
      { id: "ndmi", bands: 1, sampleType: "FLOAT32" },
      { id: "dataMask", bands: 1 }
    ]
  };
}
function evaluatePixel(s) {
  var masked = [3, 8, 9, 10, 11].indexOf(s.SCL) >= 0;
  var valid = (s.dataMask === 1 && !masked) ? 1 : 0;
  var ndvi = (s.B08 + s.B04) === 0 ? 0 : (s.B08 - s.B04) / (s.B08 + s.B04);
  var ndmi = (s.B08 + s.B11) === 0 ? 0 : (s.B08 - s.B11) / (s.B08 + s.B11);
  return { ndvi: [ndvi], ndmi: [ndmi], dataMask: [valid] };
}
"""

# ~10 m expressed in degrees (EPSG:4326 request grid).
RES_DEG = 0.00009


class SentinelHubProvider(FieldSatelliteProvider):
    name = "sentinel_hub"

    def __init__(self, client: httpx.Client | None = None):
        s = get_settings()
        self._client_id = s.sentinel_client_id
        self._client_secret = s.sentinel_client_secret
        self._token_url = s.sentinel_token_url
        self._stats_url = s.sentinel_stats_url
        self._timeout = s.http_timeout_seconds
        self._client = client
        self._token: str | None = None
        self._token_expiry = 0.0

    @property
    def configured(self) -> bool:
        return bool(self._client_id and self._client_secret)

    def _http(self) -> httpx.Client:
        return self._client or httpx.Client(timeout=self._timeout)

    def _get_token(self, client: httpx.Client) -> str:
        if self._token and time.time() < self._token_expiry - 60:
            return self._token
        resp = client.post(
            self._token_url,
            data={"grant_type": "client_credentials", "client_id": self._client_id, "client_secret": self._client_secret},
        )
        if resp.status_code != 200:
            raise ProviderError(f"Sentinel Hub authentication failed (HTTP {resp.status_code}).")
        body = resp.json()
        self._token = body["access_token"]
        self._token_expiry = time.time() + float(body.get("expires_in", 300))
        return self._token

    def build_request(self, geometry: dict[str, Any], start: date, end: date) -> dict[str, Any]:
        return {
            "input": {
                "bounds": {"geometry": geometry, "properties": {"crs": "http://www.opengis.net/def/crs/EPSG/0/4326"}},
                "data": [
                    {
                        "type": "sentinel-2-l2a",
                        "dataFilter": {"mosaickingOrder": "leastCC"},
                        "processing": {"upsampling": "BILINEAR"},
                    }
                ],
            },
            "aggregation": {
                "timeRange": {"from": f"{start.isoformat()}T00:00:00Z", "to": f"{end.isoformat()}T23:59:59Z"},
                "aggregationInterval": {"of": "P1D"},
                "evalscript": EVALSCRIPT,
                "resx": RES_DEG,
                "resy": RES_DEG,
            },
            "calculations": {"default": {}},
        }

    def field_statistics(self, geometry: dict[str, Any], start: date, end: date) -> SatelliteResult:
        if not self.configured:
            raise ProviderNotConfigured("Sentinel Hub credentials are not configured.")
        client = self._http()
        try:
            token = self._get_token(client)
            resp = client.post(
                self._stats_url,
                json=self.build_request(geometry, start, end),
                headers={"Authorization": f"Bearer {token}"},
            )
        except httpx.HTTPError as exc:
            raise ProviderError(f"Sentinel Hub request failed: {exc}") from exc
        finally:
            if self._client is None:
                client.close()
        if resp.status_code != 200:
            raise ProviderError(f"Sentinel Hub Statistical API returned HTTP {resp.status_code}: {resp.text[:300]}")
        observations = parse_statistics(resp.json())
        return SatelliteResult(
            observations=observations,
            source=self.name,
            retrieved_at=utcnow_iso(),
            metadata={"collection": "sentinel-2-l2a", "grid_resolution_deg": RES_DEG, "cloud_mask": "SCL 3,8,9,10,11"},
        )


def _stat(outputs: dict[str, Any], output_id: str) -> dict[str, Any] | None:
    try:
        return outputs[output_id]["bands"]["B0"]["stats"]
    except (KeyError, TypeError):
        return None


def _finite(v: Any) -> float | None:
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return f if math.isfinite(f) else None


def parse_statistics(payload: dict[str, Any]) -> list[SatelliteObservation]:
    """Parse a Statistical API response into per-date observations."""
    out: list[SatelliteObservation] = []
    for item in payload.get("data") or []:
        if item.get("error"):
            continue
        day = (item.get("interval") or {}).get("from", "")[:10]
        outputs = item.get("outputs") or {}
        ndvi_s = _stat(outputs, "ndvi")
        ndmi_s = _stat(outputs, "ndmi")
        if not day or ndvi_s is None:
            continue
        sample = int(ndvi_s.get("sampleCount") or 0)
        nodata = int(ndvi_s.get("noDataCount") or 0)
        valid_pct = (sample - nodata) / sample * 100 if sample else 0.0
        ndvi = _finite(ndvi_s.get("mean"))
        ndmi = _finite(ndmi_s.get("mean")) if ndmi_s else None
        out.append(
            SatelliteObservation(
                date=day,
                ndvi=None if ndvi is None else max(-1.0, min(1.0, ndvi)),
                ndmi=None if ndmi is None else max(-1.0, min(1.0, ndmi)),
                valid_pixel_pct=round(valid_pct, 2),
                pixel_count=sample,
                source="sentinel_hub",
                source_type=SourceType.OBSERVED,
                is_demo=False,
            )
        )
    out.sort(key=lambda o: o.date)
    return out
