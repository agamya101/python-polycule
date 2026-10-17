from __future__ import annotations

from fastapi import APIRouter
from sqlalchemy import text

from app import __version__
from app.config import get_settings
from app.database import get_engine
from app.ml.model_registry import model_status

router = APIRouter(tags=["health"])


@router.get("/health", summary="Service health and provider configuration")
def health() -> dict:
    s = get_settings()
    db_ok = True
    try:
        with get_engine().connect() as conn:
            conn.execute(text("SELECT 1"))
    except Exception:  # pragma: no cover - reported, not raised
        db_ok = False
    ms = model_status()
    from datetime import datetime, timezone
    return {
        "status": "ok" if db_ok else "degraded",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "version": __version__,
        "environment": s.app_env,
        "database": "ok" if db_ok else "unavailable",
        "providers": {
            "weather_open_meteo": {"configured": True, "requires_key": False},
            "satellite_sentinel_hub": {"configured": s.sentinel_configured},
            "gemini_flash_ai": {"configured": s.gemini_configured, "model": "gemini-flash-latest"},
            "regional_modis_ornl": {"configured": True, "requires_key": False, "product": "MOD13Q1 C6.1 (250 m, 16-day)",
                                    "note": "Used by the Yavatmal pilot build (scripts/build_yavatmal_pilot.py)."},
        },
        "model": {"available": ms["available"], "validated": ms["validated"], "enabled": ms["enabled"]},
        "demo_data_enabled_for_analyze": s.use_demo_data,
        "pilots": {"yavatmal": {"built": (s.data_dir / "pilot" / "yavatmal" / "processed" / "pilot_snapshot.json").exists()}},
    }
