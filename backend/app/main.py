"""KrishiMitra intelligence backend — FastAPI application."""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import __version__
from app.api import demo, followups, frontend_bridge, health, inspections, interventions, model, pilot, registry, risk, satellite, soil, weather
from app.config import get_settings
from app.database import init_db
from app.errors import install_error_handlers

DESCRIPTION = """
Agricultural early-warning, intervention and monitoring API.

* **OBSERVED** values come directly from providers (Open-Meteo, Sentinel Hub) or lab soil cards.
* **INFERRED** values come from transparent deterministic rules (`heuristic_v1`, evidence quality, prioritisation).
* **PREDICTED** values come only from a validated, explicitly enabled ML model (none is installed by default).
* **CONFIRMED** values come from field verification or laboratories.
* **DEMO** values come from synthetic fixtures and are always flagged `is_demo: true`.

Satellite vegetation anomalies are never presented as pest or disease diagnoses.

**Real pilot:** `/api/v1/pilot/yavatmal/*` serves regional vegetation monitoring built from real MODIS MOD13Q1
(ORNL DAAC) and Open-Meteo data. Monitoring cells are regional sampling locations, not farmer fields.
**Demo workflow:** `/api/v1/demo/scenario` shows the farmer-level workflow on a synthetic field.
"""


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="KrishiMitra Intelligence API", version=__version__, description=DESCRIPTION, lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    install_error_handlers(app)
    for r in (health.router, model.router, risk.router, weather.router, satellite.router, soil.router, interventions.router,
              interventions.metrics_router, inspections.router, followups.router, pilot.router, demo.router, registry.router,
              frontend_bridge.router):
        app.include_router(r)
    return app


app = create_app()
