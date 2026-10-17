"""End-to-end verification of the backend's safety invariants.

Runs against a live server (``--base-url http://localhost:8000``) or, by
default, in-process with FastAPI's TestClient.

Checks:
* health, OpenAPI and docs respond
* no ML probability is returned when no validated, enabled model exists
* demo scenario is flagged demo everywhere and contains no OBSERVED records
* invalid coordinates and polygons return structured errors
* missing satellite credentials return SATELLITE_PROVIDER_NOT_CONFIGURED
* live Open-Meteo weather (skipped with --offline)

Usage:  python scripts/verify_backend.py [--base-url URL] [--offline]
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

SQUARE = {"type": "Polygon", "coordinates": [[[78.1194, 20.3894], [78.1206, 20.3894], [78.1206, 20.3906], [78.1194, 20.3906], [78.1194, 20.3894]]]}


def walk(o):
    if isinstance(o, dict):
        yield o
        for v in o.values():
            yield from walk(v)
    elif isinstance(o, list):
        for v in o:
            yield from walk(v)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base-url")
    ap.add_argument("--offline", action="store_true")
    a = ap.parse_args()

    if a.base_url:
        import httpx

        c = httpx.Client(base_url=a.base_url, timeout=60)
    else:
        from fastapi.testclient import TestClient

        from app.main import app

        c = TestClient(app)
        c.__enter__()

    results: list[tuple[str, bool, str]] = []

    def check(name: str, ok: bool, detail: str = "") -> None:
        results.append((name, ok, detail))
        print(f"[{'PASS' if ok else 'FAIL'}] {name}{' - ' + detail if detail else ''}")

    check("health", c.get("/health").status_code == 200)
    check("openapi", c.get("/openapi.json").status_code == 200)
    check("docs", c.get("/docs").status_code == 200)

    ms = c.get("/api/v1/model/status").json()
    check("model status reports reason", "reason" in ms, ms.get("reason", ""))

    demo = c.get("/api/v1/demo/scenario").json()
    observed = [d for d in walk(demo) if d.get("source_type") == "OBSERVED"]
    check("demo flagged", demo.get("demo") is True and all(p["is_demo"] for p in demo["provenance"]))
    check("demo has no OBSERVED records", not observed)
    pred = demo["assessment"]["prediction"]
    check("demo prediction not fabricated", pred["probability"] is None or (ms["available"] and ms["validated"] and ms["enabled"]), pred["status"])
    risk = demo["assessment"]["risk"]
    check("demo risk is heuristic_v1", risk["method"] == "heuristic_v1", f"{risk['level']} {risk['score']}")

    r = c.post("/api/v1/risk/analyze", json={"location_id": "verify", "lat": 95, "lon": 78})
    check("invalid latitude rejected", r.status_code == 422 and r.json()["status"] == "INVALID_COORDINATES")
    r = c.post("/api/v1/satellite/field/stats", json={"geometry": {"type": "Polygon", "coordinates": [[[78.1, 20.3], [78.2, 20.3], [78.1, 20.3]]]}})
    check("invalid polygon rejected", r.status_code == 422 and r.json()["status"] == "INVALID_FIELD_GEOMETRY")

    r = c.post("/api/v1/satellite/field/stats", json={"geometry": SQUARE})
    health = c.get("/health").json()
    if not health["providers"]["satellite_sentinel_hub"]["configured"]:
        check("satellite unconfigured -> structured 503", r.status_code == 503 and r.json()["status"] == "SATELLITE_PROVIDER_NOT_CONFIGURED")
    else:
        check("satellite configured call", r.status_code in (200, 502), str(r.status_code))

    if not a.offline:
        r = c.get("/api/v1/weather/history", params={"lat": 20.39, "lon": 78.12, "days": 30})
        ok = r.status_code == 200
        check("live Open-Meteo history", ok, (r.json().get("cache", {}).get("status") if ok else r.text[:200]))
        if ok:
            f = r.json()["features"]
            check("weather features derived", f["rainfall_14d_mm"] is not None, f"rain14={f['rainfall_14d_mm']} wb14={f['water_balance_14d_mm']}")
        r = c.post("/api/v1/risk/analyze", json={"location_id": "verify-live", "lat": 20.39, "lon": 78.12, "persist": False})
        body = r.json()
        check("live risk without satellite is not LOW", body["risk"]["level"] == "INSUFFICIENT_EVIDENCE", body["risk"]["level"])
        check("live risk prediction gated", body["prediction"]["probability"] is None or ms["enabled"], body["prediction"]["status"])

    # ---- Yavatmal real-data pilot
    r = c.get("/api/v1/pilot/yavatmal/summary")
    if r.status_code == 503:
        check("pilot built", False, "run python scripts/build_yavatmal_pilot.py")
    else:
        s = r.json()
        check("pilot summary is real (demo=false)", s["demo"] is False and s["pilot"]["not_farmer_fields"] is True)
        check("pilot has monitoring cells", s["coverage"]["monitoring_cells"] >= 10, str(s["coverage"]))
        check("pilot latest observation present", bool(s["latest_observation_date"]), str(s["latest_observation_date"]))
        cells = c.get("/api/v1/pilot/yavatmal/cells").json()["cells"]
        check("pilot cells are not farmer fields", all(x["is_farmer_field"] is False for x in cells))
        bad = [x["cell_id"] for x in cells if x["prediction_status"] != "AVAILABLE" and x["prediction_probability"] is not None]
        check("pilot predictions gated", not bad)
        ts = c.get("/api/v1/pilot/yavatmal/timeseries").json()
        years = {p["date"][:4] for p in ts["points"]}
        check("pilot timeseries multi-year", len(years) >= 4, f"{len(ts['points'])} points, years {min(years)}-{max(years)}")

    failed = [n for n, ok, _ in results if not ok]
    print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
