# KrishiMitra backend: architecture boundary

```
FINAL FRONTEND (separate repository)
      |
      |  HTTP / JSON only   (OpenAPI: /openapi.json, docs: /docs)
      v
KRISHIMITRA FASTAPI BACKEND  (this repository)
      |
      +-- real Yavatmal pilot      app/pilot/, data/pilot/yavatmal/, /api/v1/pilot/yavatmal/*
      +-- MODIS provider           app/providers/ornl_modis.py   (ORNL DAAC TESViS, MOD13Q1 C6.1)
      +-- weather                  app/providers/open_meteo.py, app/services/weather_service.py
      +-- risk engine              app/services/risk_engine.py   (heuristic_v1, operational)
      +-- evidence engine          app/services/evidence_engine.py
      +-- pilot ML                 app/ml/, training/, data/pilot/yavatmal/model/ (pilot-only activation)
      +-- soil                     app/services/soil_engine.py
      +-- interventions            app/services/intervention_engine.py, followup_engine.py, inspections API
      +-- persistence              app/database.py, app/models/ (SQLite now, PostgreSQL by URL)
```

## Rules

1. The backend never imports frontend TypeScript or JavaScript.
2. The backend never reads frontend source, mock data, fixtures or build output.
3. The frontend never imports Python backend modules.
4. Integration happens only through the HTTP API.
5. Frontend-compatibility adapters may later live inside this backend (for example an `adapter_router.py`). They must call backend services and transform their outputs; they must not read frontend files or duplicate risk, weather, ML, soil or workflow logic.
6. Runtime resources resolve from the backend root (`app/config.py: BACKEND_DIR`, derived from `__file__`), not from the process working directory. Relative `DATABASE_URL`, `DATA_DIR` and `MODEL_ARTIFACT_DIR` values are anchored to the backend root; absolute values point to explicitly configured external storage.
7. `tests/test_independence.py` enforces rules 2 and 6.

## Data provenance boundary

- **Real pilot** (`/api/v1/pilot/yavatmal/*`): built from NASA MODIS MOD13Q1, Open-Meteo and geoBoundaries by `scripts/build_yavatmal_pilot.py`. It is served from the last verified build in `data/pilot/yavatmal/processed/`, with the original observation and retrieval dates in its provenance.
- **Demonstration workflow** (`/api/v1/demo/scenario`): a synthetic fixture, always `demo: true`.
