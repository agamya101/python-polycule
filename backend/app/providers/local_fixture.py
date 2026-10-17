"""Loads clearly labelled DEMO fixtures from ``data/demo``.

Every value produced here carries ``source_type = DEMO`` and ``is_demo = True``.
This provider is only used by explicit demo endpoints, or by
``/risk/analyze`` when ``USE_DEMO_DATA=true`` and a ``demo_fixture_id`` is
requested.
"""

from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

from app.config import get_settings
from app.schemas.satellite import SatelliteObservation
from app.schemas.weather import DailyWeather
from app.utils.provenance import SourceType

_ID = re.compile(r"^[a-z0-9_]+$")


class FixtureNotFound(LookupError):
    pass


@lru_cache
def load_fixture(fixture_id: str, demo_dir: str | None = None) -> dict[str, Any]:
    if not _ID.match(fixture_id):
        raise FixtureNotFound(f"Invalid fixture id {fixture_id!r}.")
    path = Path(demo_dir or get_settings().demo_dir) / f"{fixture_id}.json"
    if not path.exists():
        raise FixtureNotFound(f"Demo fixture {fixture_id!r} not found.")
    data = json.loads(path.read_text(encoding="utf-8"))
    if data.get("is_demo") is not True or data.get("source_type") != "DEMO":
        raise ValueError(f"Fixture {fixture_id!r} is not labelled as DEMO; refusing to load.")
    return data


def list_fixtures() -> list[str]:
    d = get_settings().demo_dir
    return sorted(p.stem for p in d.glob("*.json")) if d.exists() else []


def fixture_weather(data: dict[str, Any]) -> list[DailyWeather]:
    return [DailyWeather(**row) for row in data["weather_daily"]]


def fixture_observations(data: dict[str, Any], key: str = "satellite_observations") -> list[SatelliteObservation]:
    return [
        SatelliteObservation(**row, source="demo_fixture", source_type=SourceType.DEMO, is_demo=True)
        for row in data.get(key, [])
    ]
