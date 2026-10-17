"""Yavatmal pilot region: paths, boundary handling and monitoring-cell generation.

Monitoring cells are fixed, reproducible regional vegetation sampling points.
They are NOT farmer fields, registered plots or verified cotton fields.
"""

from __future__ import annotations

import json
import math
from functools import lru_cache
from pathlib import Path
from typing import Any

from app.config import get_settings

PILOT_ID = "yavatmal"


def pilot_dir() -> Path:
    return get_settings().data_dir / "pilot" / PILOT_ID


def raw_dir() -> Path:
    return pilot_dir() / "raw"


def processed_dir() -> Path:
    return pilot_dir() / "processed"


def reports_dir() -> Path:
    return pilot_dir() / "reports"


def model_dir() -> Path:
    return pilot_dir() / "model"


def load_config() -> dict[str, Any]:
    return json.loads((pilot_dir() / "pilot_config.json").read_text(encoding="utf-8"))


@lru_cache
def _cached_json(path: str, mtime: float) -> Any:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def read_json(path: Path) -> Any:
    """Read JSON with an mtime-keyed cache (rebuilds are picked up without restart)."""
    return _cached_json(str(path), path.stat().st_mtime)


# ------------------------------------------------------------------ geometry
def _rings(geometry: dict[str, Any]) -> list[list[list[float]]]:
    """Outer rings of a Polygon/MultiPolygon (holes ignored for cell placement)."""
    if geometry["type"] == "Polygon":
        return [geometry["coordinates"][0]]
    return [poly[0] for poly in geometry["coordinates"]]


def point_in_ring(lon: float, lat: float, ring: list[list[float]]) -> bool:
    inside = False
    n = len(ring)
    j = n - 1
    for i in range(n):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        if (yi > lat) != (yj > lat) and lon < (xj - xi) * (lat - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def point_in_geometry(lon: float, lat: float, geometry: dict[str, Any]) -> bool:
    return any(point_in_ring(lon, lat, r) for r in _rings(geometry))


def distance_to_boundary_km(lon: float, lat: float, geometry: dict[str, Any]) -> float:
    """Approximate distance (km) from a point to the nearest boundary segment (local equirectangular)."""
    kx = 111.32 * math.cos(math.radians(lat))
    ky = 110.57
    best = float("inf")
    for ring in _rings(geometry):
        for (x1, y1), (x2, y2) in zip(ring[:-1], ring[1:]):
            ax, ay = (x1 - lon) * kx, (y1 - lat) * ky
            bx, by = (x2 - lon) * kx, (y2 - lat) * ky
            dx, dy = bx - ax, by - ay
            seg = dx * dx + dy * dy
            t = 0.0 if seg == 0 else max(0.0, min(1.0, -(ax * dx + ay * dy) / seg))
            px, py = ax + t * dx, ay + t * dy
            best = min(best, math.hypot(px, py))
    return best


def bbox(geometry: dict[str, Any]) -> tuple[float, float, float, float]:
    xs = [p[0] for r in _rings(geometry) for p in r]
    ys = [p[1] for r in _rings(geometry) for p in r]
    return min(xs), min(ys), max(xs), max(ys)


def grid_candidates(geometry: dict[str, Any], target: int, edge_buffer_km: float) -> tuple[list[tuple[float, float]], float]:
    """Regular lat/lon grid inside the boundary (with an edge buffer).

    The spacing is the largest value (in 0.005 degree steps) that yields at
    least ``target`` points. Deterministic: same boundary -> same cells.
    """
    x0, y0, x1, y1 = bbox(geometry)
    spacing = 0.30
    while spacing > 0.02:
        pts = []
        # Anchor the grid on the bbox centre so it is symmetric.
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        nx, ny = int((x1 - x0) / spacing / 2) + 1, int((y1 - y0) / spacing / 2) + 1
        for j in range(-ny, ny + 1):
            for i in range(-nx, nx + 1):
                lon, lat = round(cx + i * spacing, 4), round(cy + j * spacing, 4)
                if point_in_geometry(lon, lat, geometry) and distance_to_boundary_km(lon, lat, geometry) >= edge_buffer_km:
                    pts.append((lat, lon))
        if len(pts) >= target:
            pts.sort(key=lambda p: (-p[0], p[1]))  # north->south, west->east
            return pts, round(spacing, 3)
        spacing -= 0.005
    raise ValueError("Could not place the requested number of cells inside the boundary.")


def cell_square(lat: float, lon: float, half_km: float) -> dict[str, Any]:
    dlat = half_km / 110.57
    dlon = half_km / (111.32 * math.cos(math.radians(lat)))
    ring = [[lon - dlon, lat - dlat], [lon + dlon, lat - dlat], [lon + dlon, lat + dlat], [lon - dlon, lat + dlat], [lon - dlon, lat - dlat]]
    return {"type": "Polygon", "coordinates": [[[round(x, 6), round(y, 6)] for x, y in ring]]}
