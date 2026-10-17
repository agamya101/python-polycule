"""Pilot data acquisition: boundary, monitoring cells, MODIS composites, weather.

Everything downloaded is cached under ``data/pilot/yavatmal/raw`` and never
edited. Derived tables are written to ``data/pilot/yavatmal/processed``.
"""

from __future__ import annotations

import csv
import json
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

import httpx

from app.pilot.region import cell_square, grid_candidates, pilot_dir, processed_dir, raw_dir
from app.providers.base import ProviderError
from app.providers.ornl_modis import OrnlModisProvider

log = logging.getLogger("pilot")


def _now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


# ----------------------------------------------------------------- boundary
def build_boundary(cfg: dict[str, Any], refresh: bool = False) -> dict[str, Any]:
    bdir = raw_dir() / "boundary"
    bdir.mkdir(parents=True, exist_ok=True)
    src = bdir / "geoBoundaries-IND-ADM2.geojson"
    meta_path = bdir / "geoBoundaries-IND-ADM2-meta.json"
    if refresh or not src.exists():
        with httpx.Client(timeout=600, follow_redirects=True) as c:
            r = c.get(cfg["boundary"]["download_url"])
            r.raise_for_status()
            src.write_bytes(r.content)
            m = c.get(cfg["boundary"]["api"])
            if m.status_code == 200:
                meta_path.write_text(m.text, encoding="utf-8")
    data = json.loads(src.read_text(encoding="utf-8"))
    feats = [f for f in data["features"] if f["properties"].get("shapeName") == cfg["boundary"]["shape_name"]]
    if len(feats) != 1:
        raise RuntimeError(f"Expected exactly one '{cfg['boundary']['shape_name']}' feature, found {len(feats)}.")
    meta = json.loads(meta_path.read_text(encoding="utf-8")) if meta_path.exists() else {}
    retrieved = datetime.fromtimestamp(src.stat().st_mtime, timezone.utc).replace(microsecond=0).isoformat()
    feature = {
        "type": "Feature",
        "properties": {
            **feats[0]["properties"],
            "source_dataset": cfg["boundary"]["dataset"],
            "source_url": cfg["boundary"]["download_url"],
            "boundary_source": meta.get("boundarySource"),
            "license": meta.get("boundaryLicense"),
            "boundary_year_represented": meta.get("boundaryYearRepresented"),
            "retrieved_at": retrieved,
            "note": "Administrative district boundary from an open dataset; not a legal survey boundary.",
        },
        "geometry": feats[0]["geometry"],
    }
    out = {"type": "FeatureCollection", "features": [feature]}
    (pilot_dir() / "boundary.geojson").write_text(json.dumps(out), encoding="utf-8")
    return feature


# -------------------------------------------------------------------- cells
def build_candidate_cells(cfg: dict[str, Any], boundary: dict[str, Any]) -> list[dict[str, Any]]:
    c = cfg["cells"]
    pts, spacing = grid_candidates(boundary["geometry"], c["target_candidates"], c["edge_buffer_km"])
    cells = []
    for i, (lat, lon) in enumerate(pts, start=1):
        cells.append({
            "cell_id": f"YVT_CELL_{i:03d}", "lat": lat, "lon": lon,
            "subset_km": c["subset_km_above_below"], "grid_spacing_deg": spacing,
        })
    return cells


def write_cells_geojson(cells: list[dict[str, Any]], cfg: dict[str, Any]) -> None:
    feats = []
    for c in cells:
        half = c["subset_km"] + 0.125  # subset spans km on each side of the centre pixel
        feats.append({
            "type": "Feature",
            "properties": {
                "cell_id": c["cell_id"], "lat": c["lat"], "lon": c["lon"],
                "sampling": f"MOD13Q1 {2 * c['subset_km'] + 1}x{2 * c['subset_km'] + 1} pixel subset (~{2 * half:.1f} km square) centred on the point",
                "source": "ORNL DAAC TESViS MOD13Q1 subset",
                "selection_method": f"regular {c['grid_spacing_deg']} degree grid inside the geoBoundaries Yavatmal polygon, "
                                    f">= {cfg['cells']['edge_buffer_km']} km from the boundary, then vegetation screening",
                "monitoring_status": c.get("status", "candidate"),
                "screening": c.get("screening"),
                "is_farmer_field": False,
                "is_demo": False,
            },
            "geometry": cell_square(c["lat"], c["lon"], half),
        })
    (pilot_dir() / "monitoring_cells.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": feats}, indent=1), encoding="utf-8")


# -------------------------------------------------------------------- MODIS
COMPOSITE_FIELDS = ["location_id", "lat", "lon", "observation_date", "composite_end_date", "modis_date", "tile", "ndvi",
                    "valid_pixel_pct", "good_pixel_pct", "pixel_count", "accepted_pixels", "reliability_counts",
                    "source", "source_product", "proc_date", "retrieved_at"]


def download_modis(cfg: dict[str, Any], cells: list[dict[str, Any]], refresh: bool = False, workers: int = 6,
                   end: date | None = None) -> tuple[Path, list[str]]:
    sat = cfg["satellite"]
    provider = OrnlModisProvider(cache_dir=raw_dir() / "modis", refresh=refresh)
    start = date.fromisoformat(sat["start_date"])
    end = end or date.today()
    rows: list[dict[str, Any]] = []
    failures: list[str] = []
    retrieved = _now()

    def one(cell: dict[str, Any]):
        return cell, provider.cell_series(cell["lat"], cell["lon"], start, end, km=cell["subset_km"])

    with ThreadPoolExecutor(max_workers=workers) as pool:
        futs = [pool.submit(one, c) for c in cells]
        for i, fut in enumerate(as_completed(futs), start=1):
            try:
                cell, series = fut.result()
            except ProviderError as exc:
                failures.append(str(exc))
                log.warning("MODIS download failed: %s", exc)
                continue
            for r in series:
                rows.append({
                    "location_id": cell["cell_id"], "lat": cell["lat"], "lon": cell["lon"],
                    "observation_date": r.composite_start, "composite_end_date": r.composite_end, "modis_date": r.modis_date,
                    "tile": r.tile, "ndvi": r.ndvi, "valid_pixel_pct": r.valid_pixel_pct, "good_pixel_pct": r.good_pixel_pct,
                    "pixel_count": r.pixel_count, "accepted_pixels": r.accepted_pixels,
                    "reliability_counts": json.dumps(r.reliability_counts, sort_keys=True),
                    "source": provider.name, "source_product": f"{sat['product']} C{sat['collection']}", "proc_date": r.proc_date,
                    "retrieved_at": retrieved,
                })
            log.info("MODIS %d/%d cells done (%s, %d composites)", i, len(cells), cell["cell_id"], len(series))
    rows.sort(key=lambda r: (r["location_id"], r["observation_date"]))
    out = processed_dir() / "modis_composites.csv"
    out.parent.mkdir(parents=True, exist_ok=True)
    with open(out, "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=COMPOSITE_FIELDS)
        w.writeheader()
        w.writerows(rows)
    return out, failures
