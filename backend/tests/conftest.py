from __future__ import annotations

import os
import tempfile
from datetime import date, timedelta
from pathlib import Path

# Isolate every test run: temp database, empty model artifact dir, temp cache.
_TMP = Path(tempfile.mkdtemp(prefix="krishimitra_test_"))
os.environ["APP_ENV"] = "test"
os.environ["DATABASE_URL"] = f"sqlite:///{(_TMP / 'test.db').as_posix()}"
os.environ["MODEL_ARTIFACT_DIR"] = str(_TMP / "model_artifacts")
os.environ["MODEL_ENABLED"] = "false"
os.environ["USE_DEMO_DATA"] = "false"
os.environ["SENTINEL_CLIENT_ID"] = ""
os.environ["SENTINEL_CLIENT_SECRET"] = ""
os.environ["GEMINI_API_KEY"] = ""
(_TMP / "model_artifacts").mkdir()

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.api.deps import get_satellite_provider, get_weather_provider  # noqa: E402
from app.config import get_settings  # noqa: E402
from app.database import init_db, reset_engine  # noqa: E402
from app.main import app  # noqa: E402
from app.providers.base import ProviderError, WeatherProvider, WeatherResult  # noqa: E402
from app.providers.sentinel_hub import SentinelHubProvider  # noqa: E402
from app.schemas.weather import CacheInfo, CacheStatus, DailyWeather  # noqa: E402

get_settings.cache_clear()
reset_engine(os.environ["DATABASE_URL"])
init_db()


def make_daily(end: date, days: int, rain: float = 0.0, tmax: float = 34.0, et0: float = 5.0) -> list[DailyWeather]:
    return [
        DailyWeather(date=(end - timedelta(days=i)).isoformat(), precipitation_mm=rain, temperature_2m_max_c=tmax,
                     temperature_2m_min_c=tmax - 10, temperature_2m_mean_c=tmax - 5, et0_mm=et0)
        for i in reversed(range(days))
    ]


class FakeWeather(WeatherProvider):
    """Test double; values are fixed test inputs, not presented as real data."""

    name = "test_weather"

    def __init__(self, fail: bool = False, rain: float = 0.0, tmax: float = 34.0):
        self.fail, self.rain, self.tmax = fail, rain, tmax

    def history(self, lat, lon, start, end):
        if self.fail:
            raise ProviderError("simulated outage")
        return WeatherResult(daily=make_daily(end, (end - start).days + 1, self.rain, self.tmax), cache=CacheInfo(status=CacheStatus.LIVE, age_seconds=0),
                             source=self.name, retrieved_at="2026-10-17T00:00:00+00:00")

    def forecast(self, lat, lon, days):
        if self.fail:
            raise ProviderError("simulated outage")
        start = date.today()
        rows = [DailyWeather(date=(start + timedelta(days=i)).isoformat(), precipitation_mm=0.0, temperature_2m_max_c=41.0, et0_mm=6.0) for i in range(days)]
        return WeatherResult(daily=rows, cache=CacheInfo(status=CacheStatus.LIVE, age_seconds=0), source=self.name, retrieved_at="2026-10-17T00:00:00+00:00")


@pytest.fixture
def client():
    app.dependency_overrides[get_weather_provider] = lambda: FakeWeather()
    app.dependency_overrides[get_satellite_provider] = lambda: SentinelHubProvider()  # unconfigured in tests
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def failing_weather_client():
    app.dependency_overrides[get_weather_provider] = lambda: FakeWeather(fail=True)
    app.dependency_overrides[get_satellite_provider] = lambda: SentinelHubProvider()
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def artifact_dir() -> Path:
    return Path(os.environ["MODEL_ARTIFACT_DIR"])


SQUARE = {
    "type": "Polygon",
    "coordinates": [[[78.1194, 20.3894], [78.1206, 20.3894], [78.1206, 20.3906], [78.1194, 20.3906], [78.1194, 20.3894]]],
}


def obs_series(as_of: date, ndvis: list[float], step: int = 5, valid: float = 90.0) -> list[dict]:
    n = len(ndvis)
    return [
        {"date": (as_of - timedelta(days=step * (n - 1 - i))).isoformat(), "ndvi": v, "ndmi": 0.2, "valid_pixel_pct": valid}
        for i, v in enumerate(ndvis)
    ]
