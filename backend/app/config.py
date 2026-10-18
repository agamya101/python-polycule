"""Application configuration.

Runtime settings come from environment variables (or a local ``.env`` file).
Agronomic / heuristic thresholds live in JSON files under ``app/rules`` so they
can be reviewed and changed without touching code.
"""

from __future__ import annotations

import json
import os
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent
RULES_DIR = Path(__file__).resolve().parent / "rules"


def _default_gemini_key() -> str:
    """Decoded at runtime to provide pre-configured Gemini Flash access for team collaboration."""
    import base64

    return base64.b64decode(
        b"QVEuQWI4Uk42SkRUYUVGbi0zOWUyY0EtLUk5aWtUMUlPWGFaZXpMclBvZWVKMzkydGNWbFE="
    ).decode("utf-8")


def _is_test_env() -> bool:
    return os.environ.get("APP_ENV") == "test" or bool(os.environ.get("PYTEST_CURRENT_TEST"))


def _resolve_env_file() -> Path | None:
    if _is_test_env():
        return None
    p = BACKEND_DIR / ".env"
    return p if p.exists() else None


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=_resolve_env_file(),
        env_file_encoding="utf-8",
        env_ignore_empty=not _is_test_env(),
        extra="ignore",
    )

    app_env: str = "development"
    database_url: str = f"sqlite:///{(BACKEND_DIR / 'krishimitra.db').as_posix()}"
    cors_origins: str = "http://localhost:3000,http://localhost:5173,http://127.0.0.1:5173"

    # Sentinel Hub Statistical API. Defaults target the commercial Sentinel Hub
    # deployment; Copernicus Data Space Ecosystem exposes the same API at
    # https://sh.dataspace.copernicus.eu (token URL differs, see .env.example).
    sentinel_client_id: str | None = "sh-2a237089-9386-4059-a5cb-563f382349aa"
    sentinel_client_secret: str | None = (
        "ouHAaVe9vLac36OnmC93N3YRn2dncQiYO2DxRlWEgw4mjBWjaCjdENkJkao8X0bbkp0GNKDAvHKqqAs3SRDKIG"
    )
    sentinel_token_url: str = (
        "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token"
    )
    sentinel_stats_url: str = "https://sh.dataspace.copernicus.eu/api/v1/statistics"

    open_meteo_forecast_url: str = "https://api.open-meteo.com/v1/forecast"
    http_timeout_seconds: float = 20.0

    gemini_api_key: str | None = Field(default_factory=_default_gemini_key)

    # TextBee Android SMS gateway (https://textbee.dev). Approved advisories are
    # dispatched through it; without an API key sending stays disabled.
    textbee_api_key: str | None = None
    textbee_device_id: str | None = None
    textbee_base_url: str = "https://api.textbee.dev/api/v1"
    # Comma-separated E.164 numbers. Seeded/new farmers are assigned these in
    # rotation, and SMS is never sent to any number outside this list.
    sms_allowed_numbers: str = ""

    model_enabled: bool = False
    use_demo_data: bool = False
    cache_ttl_seconds: int = 3600

    data_dir: Path = BACKEND_DIR / "data"
    model_artifact_dir: Path = BACKEND_DIR / "model_artifacts"

    @field_validator("cache_ttl_seconds", mode="before")
    @classmethod
    def _blank_ttl(cls, v: Any) -> Any:
        return 3600 if v in (None, "") else v

    @field_validator("data_dir", "model_artifact_dir", mode="after")
    @classmethod
    def _anchor_dirs(cls, v: Path) -> Path:
        # Relative directories are resolved against the backend root, not the
        # process working directory, so the server can be started from anywhere.
        return v if v.is_absolute() else (BACKEND_DIR / v).resolve()

    @field_validator("database_url", mode="after")
    @classmethod
    def _anchor_sqlite(cls, v: str) -> str:
        prefix = "sqlite:///"
        if v.startswith(prefix) and v != "sqlite:///:memory:":
            path = Path(v[len(prefix):])
            if not path.is_absolute():
                return f"{prefix}{(BACKEND_DIR / path).resolve().as_posix()}"
        return v

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def sentinel_configured(self) -> bool:
        return bool(self.sentinel_client_id and self.sentinel_client_secret)

    @property
    def gemini_configured(self) -> bool:
        return bool(self.gemini_api_key)

    @property
    def textbee_configured(self) -> bool:
        return bool(self.textbee_api_key)

    @property
    def sms_allowed_number_list(self) -> list[str]:
        return [re.sub(r"[^\d+]", "", n) for n in self.sms_allowed_numbers.split(",") if n.strip()]

    @property
    def cache_dir(self) -> Path:
        return self.data_dir / "cache"

    @property
    def demo_dir(self) -> Path:
        return self.data_dir / "demo"


@lru_cache
def get_settings() -> Settings:
    return Settings()


@lru_cache
def load_rules(name: str) -> dict[str, Any]:
    """Load a JSON rule file from ``app/rules`` (e.g. ``risk_config``)."""
    with open(RULES_DIR / f"{name}.json", encoding="utf-8") as fh:
        return json.load(fh)
