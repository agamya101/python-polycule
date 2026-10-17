"""GeoJSON polygon validation and approximate area computation.

No heavy GIS dependency is used. Area is computed on a sphere which is accurate
enough for field-size sanity checks (not for cadastral purposes).
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any

EARTH_RADIUS_M = 6_371_008.8
SENTINEL2_PIXEL_AREA_M2 = 10 * 10
# Below this many 10 m pixels a field-level statistic is dominated by edge
# pixels and mixed land cover. Engineering threshold, documented as such.
MIN_RELIABLE_PIXELS = 50
WARNING_SMALL_FIELD = "FIELD_SIZE_MAY_LIMIT_SATELLITE_RELIABILITY"


class GeometryError(ValueError):
    pass


@dataclass
class GeometryCheck:
    area_m2: float
    area_ha: float
    approx_pixels_10m: int
    centroid: tuple[float, float]  # (lat, lon)
    warnings: list[str] = field(default_factory=list)


def validate_lat_lon(lat: float, lon: float) -> None:
    if not (isinstance(lat, (int, float)) and isinstance(lon, (int, float))):
        raise GeometryError("Latitude and longitude must be numbers.")
    if not (math.isfinite(lat) and math.isfinite(lon)):
        raise GeometryError("Latitude and longitude must be finite.")
    if not -90 <= lat <= 90:
        raise GeometryError(f"Latitude {lat} is outside [-90, 90].")
    if not -180 <= lon <= 180:
        raise GeometryError(f"Longitude {lon} is outside [-180, 180].")


def _ring_area_m2(ring: list[list[float]]) -> float:
    """Spherical polygon ring area (signed) using the Chamberlain–Duquette formula."""
    total = 0.0
    n = len(ring)
    for i in range(n - 1):
        lon1, lat1 = math.radians(ring[i][0]), math.radians(ring[i][1])
        lon2, lat2 = math.radians(ring[i + 1][0]), math.radians(ring[i + 1][1])
        total += (lon2 - lon1) * (2 + math.sin(lat1) + math.sin(lat2))
    return total * EARTH_RADIUS_M**2 / 2.0


def _validate_ring(ring: Any, idx: int) -> list[list[float]]:
    if not isinstance(ring, list) or len(ring) < 4:
        raise GeometryError(f"Ring {idx} must be a list of at least 4 positions (3 distinct vertices + closing vertex).")
    pts: list[list[float]] = []
    for p in ring:
        if not isinstance(p, (list, tuple)) or len(p) < 2:
            raise GeometryError(f"Ring {idx} contains an invalid position: {p!r}.")
        lon, lat = p[0], p[1]
        validate_lat_lon(lat, lon)
        pts.append([float(lon), float(lat)])
    if pts[0] != pts[-1]:
        raise GeometryError(f"Ring {idx} is not closed (first and last positions must be identical).")
    distinct = {tuple(p) for p in pts[:-1]}
    if len(distinct) < 3:
        raise GeometryError(f"Ring {idx} needs at least 3 distinct vertices.")
    return pts


def validate_polygon(geometry: dict[str, Any]) -> GeometryCheck:
    """Validate a GeoJSON Polygon (or single-part MultiPolygon) and return size info."""
    if not isinstance(geometry, dict):
        raise GeometryError("Geometry must be a GeoJSON object.")
    gtype = geometry.get("type")
    coords = geometry.get("coordinates")
    if gtype == "MultiPolygon":
        if not isinstance(coords, list) or not coords:
            raise GeometryError("MultiPolygon has no polygons.")
        polygons = coords
    elif gtype == "Polygon":
        polygons = [coords]
    else:
        raise GeometryError(f"Unsupported geometry type {gtype!r}; expected Polygon or MultiPolygon.")

    area = 0.0
    all_pts: list[list[float]] = []
    for poly in polygons:
        if not isinstance(poly, list) or not poly:
            raise GeometryError("Polygon has no rings.")
        rings = [_validate_ring(r, i) for i, r in enumerate(poly)]
        outer = abs(_ring_area_m2(rings[0]))
        holes = sum(abs(_ring_area_m2(r)) for r in rings[1:])
        area += max(0.0, outer - holes)
        all_pts.extend(rings[0][:-1])

    if area < 1.0:
        raise GeometryError("Polygon area is effectively zero (degenerate or collinear vertices).")

    lons = [p[0] for p in all_pts]
    lats = [p[1] for p in all_pts]
    if max(lons) - min(lons) > 1.0 or max(lats) - min(lats) > 1.0:
        warnings = ["GEOMETRY_LARGER_THAN_TYPICAL_FIELD"]
    else:
        warnings = []

    pixels = int(area // SENTINEL2_PIXEL_AREA_M2)
    if pixels < MIN_RELIABLE_PIXELS:
        warnings.append(WARNING_SMALL_FIELD)

    centroid = (sum(lats) / len(lats), sum(lons) / len(lons))
    return GeometryCheck(area_m2=area, area_ha=area / 10_000, approx_pixels_10m=pixels, centroid=centroid, warnings=warnings)
