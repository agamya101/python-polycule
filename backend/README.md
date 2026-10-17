# KrishiMitra Intelligence Backend

A Python intelligence backend for KrishiMitra, an agricultural early-warning, intervention and monitoring platform for FPOs, agriculture departments, extension workers, NGO/CSR programmes and agribusinesses that manage farmer networks.

It's a standalone FastAPI service. Any React or Next.js frontend can connect over REST. It has no filesystem dependency on any frontend; integration happens only through the HTTP API (see ARCHITECTURE.md).

## 1. Purpose

The backend helps organisations:

1. detect abnormal crop conditions from satellite and weather evidence,
2. prioritise fields or areas that need attention,
3. explain **why** something was flagged, and say what is *not* known,
4. state how reliable the evidence is,
5. use Soil Health Card data when available,
6. run an intervention, field-verification and follow-up workflow with an audit trail,
7. build up labelled field data for future ML work.

It does **not** diagnose pests or diseases, recommend crops, prescribe fertiliser doses, or present heuristic scores as ML predictions.

### Value categories

| | Meaning |
|---|---|
| **OBSERVED** | directly from Open-Meteo, Sentinel Hub or a soil card |
| **INFERRED** | deterministic, documented rules (risk, evidence quality, prioritisation, follow-up) |
| **PREDICTED** | a validated, explicitly enabled ML model (none installed by default) |
| **CONFIRMED** | field worker or laboratory verification |
| **DEMO** | synthetic fixtures, always `is_demo: true` |

## 2. Architecture

```
krishimitra-backend/
├── app/
│   ├── main.py              FastAPI app, CORS, routers, error handlers
│   ├── config.py            env settings + JSON rule loader
│   ├── database.py          SQLAlchemy engine/session (SQLite → PostgreSQL by URL)
│   ├── errors.py            structured error codes
│   ├── rules/*.json         ALL thresholds/weights (risk, evidence, soil, weather alerts, prioritisation, follow-up)
│   ├── api/                 routers: health, risk, weather, satellite, soil, interventions(+metrics), inspections, followups, model, demo, registry(+audit)
│   ├── schemas/             Pydantic request/response models (visible in /docs)
│   ├── services/            feature_engineering, baseline, risk_engine, evidence_engine, explanation_engine,
│   │                        soil_engine, intervention_engine, followup_engine, weather_service, satellite_service, assessment
│   ├── providers/           base interfaces, open_meteo (live), sentinel_hub (credential-gated), local_fixture (DEMO), MODIS stub
│   ├── ml/                  features contract, model_registry (+checksum), validation (metrics + gate), inference
│   ├── models/              ORM: Farmer, Field, RiskAssessment, SoilRecord, Intervention, FieldInspection, FollowUpObservation, Advisory, AuditEvent
│   └── utils/               geo (polygon validation/area), normalization, provenance
├── training/                prepare_dataset, build_features, temporal_split, train, evaluate
├── data/demo/               yavatmal_demo.json (synthetic, labelled DEMO)
├── data/cache/              Open-Meteo response cache
├── model_artifacts/         global model slot (empty; the Yavatmal pilot model lives in data/pilot/yavatmal/model/)
├── scripts/                 seed_demo, verify_backend, generate_demo_fixture
└── tests/                   pytest suite
```

## 3. System flow

```
 lat/lon ──► Open-Meteo (cached) ──► weather features (as-of, no gap filling) ─┐
 polygon ──► geometry check ──► Sentinel Hub stats ──► seasonal baseline ──────┤
             (or supplied observations with declared source_type)              │
 Soil Health Card ──► threshold classification (verified only enters risk) ────┤
                                                                               ▼
                   evidence_engine (0-100 data quality) ──► risk_engine heuristic_v1 (V/W/H/S, renormalised)
                                                                               │
                         explanation_engine (observed / inferred / not confirmed / recommended)
                                                                               │
                ML inference gate (MODEL_NOT_AVAILABLE unless validated + enabled)
                                                                               ▼
                       RiskAssessment stored + AuditEvent ──► prioritisation ──► Intervention
                                                                               ▼
                         FieldInspection (labels) ──► follow-up on each new usable observation ──► escalate / close
```

## 4. Setup

Requires Python 3.11+.

```bash
cd krishimitra-backend
python -m venv .venv
# Windows: .venv\Scripts\activate     macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # optional; defaults work without it
```

If your Python can't install the scientific wheels (e.g. MSYS2/MinGW Python on Windows), use a standard CPython build, for example via `uv`: `uv venv --python 3.12 .venv` then `uv pip install -r requirements.txt`.

## 5. Run the API

```bash
uvicorn app.main:app --reload
```

- Swagger UI: http://localhost:8000/docs
- OpenAPI JSON: http://localhost:8000/openapi.json
- Quick demo: http://localhost:8000/api/v1/demo/scenario

Optional demo records: `python scripts/seed_demo.py` (creates `DEMO_FARMER_001` / `DEMO_FIELD_001`, both `is_demo=true`).

## 6. Tests and verification

```bash
pytest                                   # unit + API tests (no network needed)
python scripts/verify_backend.py         # invariant checks in-process (uses live Open-Meteo; add --offline to skip)
python scripts/verify_backend.py --base-url http://localhost:8000   # against a running server
```

## 7. Data providers

| Provider | Status | Notes |
|---|---|---|
| **Open-Meteo** | working, no key | precipitation, Tmax/Tmin/Tmean, FAO-56 ET0, 0–7 cm soil moisture, forecast. Recent history uses the forecast API's `past_days`; older periods use the ERA5-based archive. These are gridded model/reanalysis data, not station observations, and are flagged as such. Responses are cached in `data/cache/`. On failure, cached data is returned as `CACHED_STALE` with its age; with no cache you get `WEATHER_PROVIDER_UNAVAILABLE`. |
| **Sentinel Hub Statistical API** (Sentinel-2 L2A) | implemented, **needs credentials**, not exercised live in this build | NDVI = (B08−B04)/(B08+B04); NDMI = (B08−B11)/(B08+B11). The request is evaluated on a ~10 m grid with bilinear upsampling, so the 20 m B11 band is resampled (NDMI is effectively ~20 m). SCL classes 3, 8, 9, 10, 11 are masked; `valid_pixel_pct` is the share of unmasked field pixels. Without credentials you get `SATELLITE_PROVIDER_NOT_CONFIGURED` and no values are generated. Works with Copernicus Data Space by changing the URLs in `.env`. |
| **MODIS MOD13Q1** (regional) | working, no key | ORNL DAAC TESViS subsets (250 m, 16-day). Used by the Yavatmal pilot build: quality-filtered (reliability 0/1), median of accepted pixels per ~2 km cell, cached raw responses. Regional trends only; not suitable for small fields. |
| **Local fixtures** | DEMO only | used by `/api/v1/demo/scenario`, or by `/risk/analyze` when `USE_DEMO_DATA=true`. Refuses to load any file not labelled DEMO. |

## 8. Risk engine (`heuristic_v1`)

A transparent rule-based score from 0 to 100. **Not an ML model.** The parameters live in `app/rules/risk_config.json` and are MVP heuristics, not validated coefficients.

| Component | Weight | Normalisation |
|---|---|---|
| Vegetation (V) | 0.40 | `clip(−ndvi_anomaly_pct / 30, 0, 1)`. Positive anomalies give 0 |
| Water (W) | 0.30 | max of: water balance 0 → −70 mm, dry spell 7 → 21 days, NDMI drop 0 → 0.10 |
| Heat (H) | 0.20 | max of: 7-day Tmax 35 → 42 °C, heat days 0 → 5 |
| Soil (S) | 0.10 | only from a **verified** soil card: constraint severity (pH/EC abnormal 0.6/0.7, low nutrient 0.35) |

- Missing components are **excluded and the weights renormalised**. They are never scored as zero.
- Bands: LOW 0–24, MODERATE 25–49, HIGH 50–74, CRITICAL 75–100.
- `INSUFFICIENT_EVIDENCE` (score withheld, `provisional_score` kept) applies when evidence quality is below 40, when less than 50% of the nominal weight has data, or when there is neither vegetation nor water evidence.
- The seasonal baseline is the median NDVI from previous seasons within ±15 days of the same point in the season. It is aligned by days-since-sowing when sowing dates are known; otherwise it is day-of-year based and labelled "not crop-specific". A baseline with |NDVI| < 0.10 gives no percentage anomaly.
- `water_balance_14d = Σ precipitation − Σ ET0` is an environmental indicator, not a measurement of plant water stress. Irrigated fields can show a negative balance without crop stress.

## 9. Evidence quality engine

A score from 0 to 100 (POOR < 40 ≤ LIMITED < 60 ≤ MODERATE < 80 ≤ GOOD). It measures **data adequacy, not model confidence**. Components (`app/rules/evidence_config.json`): satellite usable-pixel coverage 30%, freshness 25%, number of valid observations in 30 days 20%, baseline reliability 15%, field/crop metadata 10%. The response returns each component with a reason and warnings such as `STALE_OBSERVATION` or `FIELD_SIZE_MAY_LIMIT_SATELLITE_RELIABILITY` (fields under roughly 50 Sentinel-2 pixels, about 0.5 ha).

## 10. ML pipeline (experimental)

Target: *will vegetation significantly deteriorate at the next valid observation?* The pipeline covers retrospective dataset preparation with leakage guards, a purged temporal split (plus optional geographic holdout), a heuristic baseline, logistic regression, random forest and HistGradientBoosting, and metrics: precision, recall, F1, PR-AUC, ROC-AUC, Brier and Precision@K. A safety gate must pass before an artifact is marked validated, and `MODEL_ENABLED=true` is needed even then. **A real pilot model exists for Yavatmal only:** logistic regression trained on the real MODIS + Open-Meteo dataset. It passed the safety gate on the temporal test with modest skill (PR-AUC 0.255 vs prevalence 0.147; ROC-AUC 0.63). It is enabled only for the pilot endpoints; the global `MODEL_ENABLED` stays false and `heuristic_v1` remains the operational risk engine. See [YAVATMAL_PILOT_REPORT.md](YAVATMAL_PILOT_REPORT.md) and [training/README.md](training/README.md).

## 11. Frontend integration

See [FRONTEND_API_CONTRACT.md](FRONTEND_API_CONTRACT.md). CORS origins are set with `CORS_ORIGINS`. Start with `GET /api/v1/demo/scenario`.

## 12. Other modules

- **Soil Health Card:** validates and classifies the 12 parameters (pH, EC, OC, N, P, K, S, Zn, Fe, Cu, Mn, B) as NORMAL / LOW / HIGH / OUT_OF_RANGE / UNKNOWN against `soil_thresholds.json`. Thresholds are configurable defaults from commonly used SHC ranges; check them against the issuing laboratory's guidance. **No fertiliser doses are computed.** Independent Urea + DAP calculations double count nitrogen, so only a recommendation from an approved source (stored verbatim) can be approved, and approval is a manual, audited step.
- **Intervention prioritisation:** rule-based points for risk, deterioration, crop-stage sensitivity, affected farmers, unresolved alerts and verification status. High-risk cases with weak evidence become `VERIFY_FIRST`. P1 needs evidence of at least 60 or a confirmed verification.
- **Field inspections:** database-backed workflow with statuses UNVERIFIED / VISITED / CONFIRMED / INCONCLUSIVE / RESOLVED. `confirmed_cause` is only accepted with CONFIRMED or RESOLVED.
- **Follow-up:** evaluated on every new usable observation, at any spacing. Recovery needs sustained improvement and never comes from a single reading. Contradictions go to a human. Deterioration escalates the intervention.
- **Weather alerts:** HEAT_STRESS, DRY_SPELL and HEAVY_RAIN rules in `weather_rules.json`. Heavy-rain bands follow IMD 24-hour categories; the others are illustrative defaults.
- **Audit log:** every create or state change records the timestamp, entity, action, previous and new state, actor and metadata (`GET /api/v1/audit`).
- **Operational metrics:** counts and median alert-to-review time from recorded data only. No yield, money or loss estimates.

## 12b. Yavatmal real-data pilot

This is a regional agricultural / vegetation monitoring pilot for Yavatmal, Maharashtra, built around the cotton intervention use case. It uses only real data:
- NASA MODIS **MOD13Q1 C6.1** NDVI (250 m, 16-day) from the ORNL DAAC TESViS API (no key needed),
- the **Open-Meteo** historical weather archive,
- the **geoBoundaries** ADM2 district boundary.

```bash
python scripts/build_yavatmal_pilot.py            # cached: boundary → cells → MODIS → screening → weather → dataset → train/eval → snapshot
python scripts/build_yavatmal_pilot.py --refresh  # re-download sources
python scripts/build_yavatmal_pilot.py --skip-train
```

The first build downloads about 1,000 MODIS subsets and takes 30–60 minutes. Reruns use the caches. Endpoints:
- `GET /api/v1/pilot/yavatmal/summary`
- `/cells`, `/cells/{id}`
- `/timeseries`
- `/boundary`
- `/model`

The monitoring cells are regional sampling squares (about 2 km), **not farmer fields and not verified cotton fields**. The ML model is enabled for the pilot only if it passes the safety gate (`data/pilot/yavatmal/model/activation.json`); otherwise `heuristic_v1` stays the operational engine. Details are in [data/pilot/yavatmal/README.md](data/pilot/yavatmal/README.md), [YAVATMAL_PILOT_REPORT.md](YAVATMAL_PILOT_REPORT.md) and [PILOT_FRONTEND_HANDOFF.md](PILOT_FRONTEND_HANDOFF.md).

## 13. Limitations

- Heuristic weights, normalisation ranges, alert thresholds and soil bands are engineering defaults that agronomists have not validated.
- Open-Meteo values are gridded model or reanalysis values (about 9–25 km), not field measurements.
- The Sentinel Hub integration is written against the documented Statistical API but was not run against a live account in this build.
- The Yavatmal pilot model has modest skill (see YAVATMAL_PILOT_REPORT.md); `heuristic_v1` remains the operational engine.
- NDVI and NDMI anomalies show *that* vegetation differs from its seasonal baseline, not *why*.
- Without crop type or sowing date, baselines are vegetation-season based, not crop-specific.
- There is no authentication or authorisation, and SQLite is single-node. Both are prototype only.

## 14. Production roadmap

1. Authentication and role-based access (field worker, officer, agronomist), plus organisation tenancy.
2. PostgreSQL + PostGIS, Alembic migrations, and spatial indexing of fields.
3. A scheduled ingestion worker (new Sentinel-2 acquisitions → automatic follow-up evaluation), with Redis or object-storage caching.
4. A MODIS or Sentinel-3 regional adapter for district dashboards.
5. Crop calendars and stage-aligned baselines by crop and agro-climatic zone; agronomist review of all thresholds.
6. Real labelled data from inspections → train → gate → shadow-mode evaluation → controlled activation.
7. Photo upload storage, SMS/IVR advisory delivery with acknowledgement tracking, and multilingual templates approved by agronomists.
8. Observability: structured logs, metrics, provider-health alerts.
