"""Generate the synthetic DEMO fixture ``data/demo/yavatmal_demo.json``.

The output is SYNTHETIC. It illustrates a plausible sequence (monsoon recession,
dry spell, warming, canopy decline at flowering) so the workflow can be shown
end to end without provider credentials. Every record is labelled
``is_demo: true`` / ``source_type: DEMO``. The polygon is a generic square near
Yavatmal district and does not represent any real field or farmer.

Usage:  python scripts/generate_demo_fixture.py
"""

from __future__ import annotations

import json
import random
from datetime import date, timedelta
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "data" / "demo" / "yavatmal_demo.json"
AS_OF = date(2026, 9, 30)
rng = random.Random(20260930)


def weather_series(start: date, end: date) -> list[dict]:
    rows = []
    d = start
    while d <= end:
        t = (d - start).days
        # Wet until ~9 Sep, then a dry spell; temperatures rise through late September.
        wet = d < date(2026, 9, 9)
        rain = round(max(0.0, rng.gauss(9, 7)), 1) if wet and rng.random() < 0.6 else (round(rng.uniform(0, 1.2), 1) if rng.random() < 0.2 else 0.0)
        tmax = round(31 + 0.12 * max(0, t - 25) + rng.gauss(0, 0.8), 1)
        tmin = round(tmax - 10 + rng.gauss(0, 0.6), 1)
        et0 = round(3.4 + 0.05 * max(0, t - 25) + (0 if wet else 0.8) + rng.gauss(0, 0.2), 2)
        sm = round(max(0.12, 0.36 - (0.006 * max(0, (d - date(2026, 9, 9)).days))) + rng.gauss(0, 0.004), 4)
        rows.append({
            "date": d.isoformat(), "precipitation_mm": rain, "temperature_2m_max_c": tmax, "temperature_2m_min_c": tmin,
            "temperature_2m_mean_c": round((tmax + tmin) / 2, 1), "et0_mm": et0, "soil_moisture_0_7cm_m3m3": sm,
        })
        d += timedelta(days=1)
    return rows


def forecast_series(start: date, days: int) -> list[dict]:
    rows = []
    tmaxes = [38.6, 39.4, 40.3, 40.8, 39.7, 38.9, 38.2]
    for i in range(days):
        d = start + timedelta(days=i)
        tmax = tmaxes[i % len(tmaxes)]
        rows.append({
            "date": d.isoformat(), "precipitation_mm": 0.0, "temperature_2m_max_c": tmax, "temperature_2m_min_c": round(tmax - 12, 1),
            "temperature_2m_mean_c": round(tmax - 6, 1), "et0_mm": 5.6, "soil_moisture_0_7cm_m3m3": None,
        })
    return rows


def current_season() -> list[dict]:
    # Roughly 5-day revisit with cloud-affected acquisitions.
    pts = [
        ("2026-08-04", 0.48, 0.21, 88), ("2026-08-09", None, None, 12), ("2026-08-14", 0.55, 0.25, 64),
        ("2026-08-19", None, None, 8), ("2026-08-24", 0.61, 0.28, 71), ("2026-08-29", 0.64, 0.29, 83),
        ("2026-09-03", 0.62, 0.27, 35), ("2026-09-08", 0.66, 0.27, 92), ("2026-09-13", 0.64, 0.24, 95),
        ("2026-09-18", 0.60, 0.20, 90), ("2026-09-23", 0.56, 0.16, 94), ("2026-09-28", 0.52, 0.13, 91),
    ]
    return [{"date": d, "ndvi": n, "ndmi": m, "valid_pixel_pct": float(v), "cloud_pct": float(100 - v), "pixel_count": 196} for d, n, m, v in pts]


def history() -> list[dict]:
    out = []
    for year, offset in ((2023, 0.0), (2024, 0.02), (2025, -0.01)):
        d = date(year, 9, 5)
        while d <= date(year, 10, 25):
            ndvi = round(0.67 + offset + rng.gauss(0, 0.012), 3)
            ndmi = round(0.27 + offset / 2 + rng.gauss(0, 0.01), 3)
            valid = float(rng.choice([95, 90, 86, 30, 92]))
            out.append({"date": d.isoformat(), "ndvi": ndvi, "ndmi": ndmi, "valid_pixel_pct": valid, "cloud_pct": 100 - valid, "pixel_count": 196})
            d += timedelta(days=5)
    return out


def main() -> None:
    lat, lon, half = 20.3900, 78.1200, 0.00065
    ring = [[lon - half, lat - half], [lon + half, lat - half], [lon + half, lat + half], [lon - half, lat + half], [lon - half, lat - half]]
    fixture = {
        "fixture_id": "yavatmal_demo",
        "is_demo": True,
        "source_type": "DEMO",
        "description": "Synthetic demo scenario. Not real observations. Polygon does not represent a real field or farmer.",
        "as_of_date": AS_OF.isoformat(),
        "field": {
            "field_id": "DEMO_FIELD_001",
            "label": "Demo field (synthetic, Yavatmal district area)",
            "geometry": {"type": "Polygon", "coordinates": [[[round(x, 6), round(y, 6)] for x, y in ring]]},
            "note": "Synthetic square polygon for demonstration only.",
            "is_demo": True,
        },
        "crop": {"crop_type": "cotton", "crop_stage": "flowering", "sowing_date": "2026-06-25"},
        "context": {"affected_farmers_demo": 18, "note": "Illustrative count for ranking demo only."},
        "weather_daily": weather_series(AS_OF - timedelta(days=59), AS_OF),
        "weather_forecast": forecast_series(AS_OF + timedelta(days=1), 7),
        "satellite_observations": current_season(),
        "historical_observations": history(),
        "followup": {
            "start_date": "2026-10-01",
            "ndvi_at_start": 0.52,
            "observations": [
                {"date": "2026-10-03", "ndvi": 0.53, "ndmi": 0.14, "valid_pixel_pct": 89.0},
                {"date": "2026-10-08", "ndvi": None, "ndmi": None, "valid_pixel_pct": 18.0},
                {"date": "2026-10-13", "ndvi": 0.56, "ndmi": 0.17, "valid_pixel_pct": 93.0},
            ],
        },
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(fixture, indent=1), encoding="utf-8")
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
