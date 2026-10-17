# Implementation Status

Status as of 2026-10-18. Verified with 97 passing automated tests (Python 3.12), `scripts/verify_backend.py` (21/21 checks including the real pilot), a full real-data pilot build (`scripts/build_yavatmal_pilot.py`), and live HTTP calls to a running uvicorn server.

## WORKING NOW

### Yavatmal real-data pilot (new)
- **Real regional satellite data:** NASA MODIS MOD13Q1 C6.1 NDVI + pixel reliability from the ORNL DAAC TESViS API (`app/providers/ornl_modis.py`). It applies scale factors and handles fill values, filters by quality, caches responses, retries, and never substitutes values. Data: 36 cells × 178 composites (2019-01-01 → 2026-09-14), 5,280 usable.
- **Pilot area:** geoBoundaries ADM2 Yavatmal boundary, with 36 reproducible monitoring cells (`data/pilot/yavatmal/`).
- **Real weather history** per cell from the Open-Meteo archive (cached, rate-limit aware), with features computed using no future days.
- **Past-only seasonal NDVI baseline and anomaly** (prior seasons only; left empty when history is insufficient).
- **Model-ready dataset:** `processed/yavatmal_observations.csv`, 5,280 rows / 3,681 labelled / 464 positives, with no synthetic rows.
- **Evaluation:** temporal split with label-boundary purging, plus a **separate spatial-holdout test** on 6 unseen cells. Four candidates were compared and the safety gate was applied. Reports are in `reports/model_evaluation.{json,md}`.
- **Pilot model:** logistic regression **passed the gate** and is enabled for the Yavatmal pilot only (`model/activation.json`). Its skill is modest; caveats are in the reports.
- **Seasonal water stress:** `heuristic_v1` now scores water stress against a past-only seasonal norm when climatology exists (absolute thresholds remain the fallback).
- **Pilot API:** `/api/v1/pilot/yavatmal/summary`, `/cells`, `/cells/{id}`, `/timeseries`, `/boundary`, `/model`. `/api/v1/model/status` includes `pilot_models.yavatmal`.
- **One-command reproducible build:** `python scripts/build_yavatmal_pilot.py [--refresh] [--skip-train]` (about 90 s cached; 30–60 min first run).

### Platform

- FastAPI application with OpenAPI/Swagger (`/docs`), CORS from `CORS_ORIGINS`, and structured error codes.
- All required endpoints: `/health`, `/api/v1/model/status`, `/risk/analyze`, `/weather/history`, `/weather/forecast`, `/satellite/field/stats`, `/soil/interpret`, `/interventions/prioritize`, `/inspections`, `/followups/evaluate`, `/demo/scenario`, plus assessment retrieval, intervention CRUD and status transitions, inspection updates, soil approval, farmer/field registry, the audit log and operational metrics.
- Provenance on observations and engine outputs (OBSERVED / INFERRED / PREDICTED / CONFIRMED / DEMO). DEMO can never be labelled OBSERVED.
- **Open-Meteo live weather** (no key): history, forecast, ET0 and soil moisture. Disk cache with `LIVE` / `CACHED_FRESH` / `CACHED_STALE` labelling, and a structured error when there is neither live data nor cache.
- Weather features: rainfall over 7/14/30 days, ET0 over 7/14 days, 14-day water balance, 7-day maximum temperature, heat days and dry-spell length. Computed as of a date, with no gap filling.
- Weather alert rules (HEAT_STRESS, DRY_SPELL, HEAVY_RAIN) from configuration.
- Heuristic risk engine `heuristic_v1` with weight renormalisation, `INSUFFICIENT_EVIDENCE` handling, and zero stress for positive anomalies.
- Evidence quality engine (0–100 with reasons and warnings).
- Deterministic explanation chain (observed / inferred / not confirmed / recommended). It never names pests or diseases.
- Seasonal baseline utility (stage-aligned by days-since-sowing, or a day-of-year window labelled "not crop-specific"), with safe handling of near-zero baselines.
- GeoJSON polygon validation (closure, vertex count, bounds, zero area) and the small-field reliability warning.
- Soil Health Card interpretation of 12 parameters (NORMAL / LOW / HIGH / OUT_OF_RANGE / UNKNOWN), configurable thresholds, a staleness flag, verbatim storage of the source recommendation, and a manual, audited approval step. No dose calculation.
- Rule-based intervention prioritisation (P1 / P2 / VERIFY_FIRST / P3 / NO_ACTION) with per-factor points.
- Field inspection workflow (UNVERIFIED / VISITED / CONFIRMED / INCONCLUSIVE / RESOLVED), with `confirmed_cause` only accepted on confirmation.
- Follow-up engine (RECOVERING / NOT_RECOVERING / DETERIORATING / INSUFFICIENT_DATA / HUMAN_VERIFICATION_REQUIRED) at irregular observation spacing. Escalates interventions when persisted.
- SQLite persistence through SQLAlchemy for all nine entities. An AuditEvent is written on every workflow change.
- Operational metrics from recorded data only.
- DEMO scenario endpoint backed by a synthetic, clearly labelled fixture (`data/demo/yavatmal_demo.json`, `DEMO_FIELD_001`).
- ML infrastructure: artifacts are gated on metadata completeness, `validated`, SHA-256 match and activation. The global artifact slot (`model_artifacts/`) is empty and global `MODEL_ENABLED=false`, so `/risk/analyze` reports `MODEL_NOT_AVAILABLE`. The Yavatmal pilot model is reported separately under `pilot_models.yavatmal` and is used only by the pilot endpoints. No probability is ever fabricated.

## WORKING WITH EXTERNAL CREDENTIALS

- **Sentinel-2 field statistics via the Sentinel Hub Statistical API** (`SENTINEL_CLIENT_ID` / `SENTINEL_CLIENT_SECRET`): OAuth, evalscript (NDVI B04/B08, NDMI B08/B11 with bilinear upsampling, SCL cloud/shadow mask), response parsing and historical-baseline windows. Request building and response parsing are unit-tested. **It has not been run against a live account**, so expect possible adjustments (e.g. resolution units or CDSE endpoint differences) on first real use.

## EXPERIMENTAL

- Training pipeline (`training/`): leakage-guarded dataset preparation with an experimental label (`next_ndvi − ndvi ≤ −0.08`, or an anomaly-delta variant), purged temporal split with optional geographic holdout, heuristic / logistic regression / random forest / HistGradientBoosting comparison, Precision@K and Brier score, safety gate, and artifact registry. Unit tests exercise it on synthetic data. The pipeline has also been run on the **real Yavatmal MODIS + Open-Meteo dataset** (3,681 labelled rows): logistic regression was selected on validation data, passed the safety gate on the temporal test (PR-AUC 0.255 vs prevalence 0.147, ROC-AUC 0.63, Brier 0.122 vs 0.126), and the separate spatial holdout scored PR-AUC 0.392 vs prevalence 0.144. Skill is modest; see `data/pilot/yavatmal/reports/model_evaluation.md`.
- All heuristic coefficients, normalisation ranges, alert thresholds and soil bands are unvalidated engineering defaults.

## NOT IMPLEMENTED

- A field-level or crop-specific ML model (the only trained model is the regional Yavatmal pilot model; there are no field-verified labels yet).
- Polygon-level regional statistics (the MODIS pilot uses point-centred 9×9-pixel subsets).
- A verified crop / cotton mask for the pilot cells.
- Authentication, authorisation, multi-tenancy.
- Database migrations (Alembic) and PostGIS geometry.
- Scheduled ingestion of new satellite acquisitions (follow-up currently runs when the API is called).
- Photo upload storage (only references are stored), SMS/IVR delivery and acknowledgement capture. The `Advisory` table exists, but no endpoint sends advisories yet.
- Crop-specific growth calendars.

## KNOWN LIMITATIONS

- Pilot cells are about 2 km regional sampling squares, not farmer fields or verified cotton fields.
- MOD13Q1 latency: the latest composite (2026-09-14) is 34 days old on 2026-10-18.
- Pilot ML skill is modest (temporal-test ROC-AUC 0.63, PR-AUC 0.255 vs prevalence 0.147, Brier only about 3% better than prevalence). The label is statistical, not field-confirmed.
- Open-Meteo rate-limits long archive requests (HTTP 429); the build waits and retries.

- Open-Meteo data is gridded model/reanalysis output, not station or field measurement.
- The water balance (rainfall − ET0) ignores irrigation. Irrigated fields can show negative balance without crop stress.
- Satellite anomalies indicate deviation from a seasonal baseline, not its cause.
- Fields smaller than about 0.5 ha get a reliability warning; NDMI is effectively about 20 m resolution.
- With weather alone (no satellite), risk is withheld as `INSUFFICIENT_EVIDENCE`. This is deliberate.
- SQLite is single-writer; the API has no authentication.
- Python 3.11+ is required. On this development machine the system Python is MSYS2, so the venv was created with a standard CPython via `uv`.

## NEXT INTEGRATION STEPS FOR FRONTEND

0. For the real pilot dashboard, follow `PILOT_FRONTEND_HANDOFF.md`: summary → dashboard, cells → map, timeseries → chart, demo/scenario → farmer workflow.

1. Point the frontend at `http://localhost:8000` and add its origin to `CORS_ORIGINS`.
2. Replace mock data with `GET /api/v1/demo/scenario` first, and show a DEMO banner whenever `demo: true`.
3. Use `GET /api/v1/weather/history` and `/forecast` for real district or field coordinates.
4. Call `POST /api/v1/risk/analyze` per field/location, and render `risk.level`, `evidence_quality`, `reasoning`, `possible_factors` and `warnings`. Show "Insufficient evidence" rather than "Low" when classification is withheld.
5. Wire the inspection form to `POST /api/v1/inspections`, the soil card to `POST /api/v1/soil/interpret` plus approval, and the follow-up view to `POST /api/v1/followups/evaluate`.
6. Use `POST /api/v1/interventions/prioritize` for the work queue and `GET /api/v1/metrics/operations` for the dashboard.
7. Generate TypeScript types from `/openapi.json`. Details: `FRONTEND_API_CONTRACT.md`.
8. Note for the frontend team: the temporary frontend's `districts.ts` contains pest-specific root causes ("suspected pink bollworm", "whitefly-linked") and fixed risk and confidence numbers. `soilEngine.ts` computes Urea and DAP bag counts independently, which double counts nitrogen. The final frontend should take these values from the API instead.
