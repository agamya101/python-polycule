# KrishiMitra Backend: Frontend API Contract

This is for frontend developers (React / Next.js / Vite). The backend doesn't depend on any particular frontend.

- **Base URL (local):** `http://localhost:8000`
- **Interactive docs:** `http://localhost:8000/docs` (Swagger), `http://localhost:8000/redoc`
- **Machine-readable schema:** `http://localhost:8000/openapi.json`. You can generate TypeScript types from it, e.g. `npx openapi-typescript http://localhost:8000/openapi.json -o src/api/schema.d.ts`
- All bodies are JSON, all dates are ISO `YYYY-MM-DD`, and all timestamps are ISO 8601 UTC.

## 1. CORS

Allowed origins come from `CORS_ORIGINS` in the backend `.env` (repository root) (comma-separated):

```
CORS_ORIGINS=http://localhost:3000,http://localhost:5173
```

Restart the server after changing it.

## 2. Reading values safely: source types

Every important value carries a `provenance` entry:

```json
{
  "source": "open_meteo",
  "source_type": "OBSERVED",
  "observed_at": "2026-10-17",
  "retrieved_at": "2026-10-17T12:30:00+00:00",
  "is_demo": false,
  "quality_flags": ["GRIDDED_MODEL_OR_REANALYSIS_DATA_NOT_STATION_OBSERVATION"],
  "provider_metadata": {"cache_status": "LIVE"}
}
```

| source_type | Meaning | How to show it |
|---|---|---|
| `OBSERVED` | Straight from a provider (Open-Meteo, Sentinel Hub) or a soil card | "Observed" |
| `INFERRED` | Calculated by transparent rules (`heuristic_v1`, evidence quality, prioritisation) | "Calculated" / "Rule-based" |
| `PREDICTED` | From a validated ML model. **Doesn't occur unless a model is installed and enabled** | "Model estimate" |
| `CONFIRMED` | Verified by a field worker or a laboratory | "Confirmed" |
| `DEMO` | Synthetic fixture | Always show a visible **DEMO** badge |

UI rules:

1. If `demo === true` or any `provenance[].is_demo === true`, show a DEMO banner.
2. `risk.score` is a **heuristic score** (`risk.method = "heuristic_v1"`). Don't label it an AI or ML prediction.
3. `evidence_quality.score` is **data quality**, not "confidence". Label it "Evidence quality".
4. When `risk.level === "INSUFFICIENT_EVIDENCE"`, show "Insufficient evidence", not "Low risk". `risk.score` is `null` then. `risk.provisional_score` is for reviewers only.
5. Never turn `possible_factors` into a diagnosis. The backend never names pests or diseases. A cause is only confirmed through a field inspection with `verification_status = CONFIRMED`.

## 3. Error format

Every predictable failure has the same shape:

```json
{
  "status": "SATELLITE_PROVIDER_NOT_CONFIGURED",
  "error": {
    "code": "SATELLITE_PROVIDER_NOT_CONFIGURED",
    "message": "Satellite provider is not configured (set SENTINEL_CLIENT_ID and SENTINEL_CLIENT_SECRET). No satellite values were generated.",
    "details": {"provider": "sentinel_hub"}
  }
}
```

| status | HTTP | When |
|---|---|---|
| `VALIDATION_ERROR` | 422 | Generic invalid request (`details.errors` lists the fields) |
| `INVALID_COORDINATES` | 422 | lat/lon out of range or missing its pair |
| `INVALID_FIELD_GEOMETRY` | 422 | Polygon not closed, too few vertices, out of bounds, or zero area |
| `INVALID_SOIL_PARAMETER` | 422 | Non-numeric soil value, bad sampling date, persist without an ID |
| `INSUFFICIENT_EVIDENCE` | 422 | Reserved for endpoints that cannot proceed without evidence |
| `DEMO_DATA_DISABLED` | 403 | `demo_fixture_id` used while `USE_DEMO_DATA=false` |
| `NOT_FOUND` | 404 | Unknown record ID |
| `INVALID_STATE_TRANSITION` | 409 | e.g. intervention `OPEN → CLOSED`, approving twice |
| `WEATHER_PROVIDER_UNAVAILABLE` | 502 | Open-Meteo down **and** nothing cached |
| `SATELLITE_DATA_UNAVAILABLE` | 502 | Sentinel Hub failed or returned no acquisitions |
| `SATELLITE_PROVIDER_NOT_CONFIGURED` | 503 | No Sentinel credentials |
| `MODEL_NOT_AVAILABLE` | 503 | Reserved; prediction status normally comes back inside `prediction.status` |

```ts
async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${import.meta.env.VITE_API_URL ?? "http://localhost:8000"}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  const body = await res.json();
  if (!res.ok) throw Object.assign(new Error(body?.error?.message ?? res.statusText), { status: body?.status, details: body?.error?.details });
  return body as T;
}
```

## 4. Endpoints

### `GET /health`
Returns service status, provider configuration (`satellite_sentinel_hub.configured`) and model flags. Use it to decide which UI features to enable.

### `GET /api/v1/demo/scenario`  (start here)
One complete **DEMO** journey that doesn't need credentials. `demo: true` is always set.

```ts
const scenario = await api<any>("/api/v1/demo/scenario");
scenario.steps.forEach((s: any) => console.log(s.step, s.name, s.source_type, s.data));
```

Steps: `1 environmental_observation`, `2 negative_vegetation_anomaly`, `3 weather_stress_evidence`, `4 risk_calculation`, `5 evidence_quality`, `6 intervention_recommendation`, `7 field_inspection` (placeholder), `8 follow_up`. The full risk response is in `scenario.assessment` and has the same shape as `/risk/analyze`. The polygon in `scenario.field.geometry` is synthetic.

### `POST /api/v1/risk/analyze`
Heuristic risk assessment. Provide **either** live inputs (`lat`/`lon` for weather, `geometry` for satellite when configured) **or** pre-computed observations.

```ts
const assessment = await api<any>("/api/v1/risk/analyze", {
  method: "POST",
  body: JSON.stringify({
    location_id: "field-123",
    lat: 20.39, lon: 78.12,                       // live Open-Meteo weather
    geometry: { type: "Polygon", coordinates: [[[78.1194,20.3894],[78.1206,20.3894],[78.1206,20.3906],[78.1194,20.3906],[78.1194,20.3894]]] },
    crop: { crop_type: "cotton", crop_stage: "flowering", sowing_date: "2026-06-25" },
    // optional pre-computed satellite statistics (declare source_type!)
    satellite_observations: [
      { date: "2026-10-08", ndvi: 0.58, ndmi: 0.19, valid_pixel_pct: 92, source_type: "OBSERVED" },
      { date: "2026-10-13", ndvi: 0.53, ndmi: 0.15, valid_pixel_pct: 88, source_type: "OBSERVED" }
    ],
    baseline_ndvi: 0.68, baseline_observation_count: 9, baseline_years: [2024, 2025],
    soil: { pH: 8.1, EC: 0.4, OC: 0.38 }, soil_verified: false,
    persist: true
  }),
});
```

Response (abridged; the numbers are illustrative, the structure matches the API):

```json
{
  "assessment_id": "3f0c…",
  "location_id": "field-123",
  "as_of_date": "2026-10-17",
  "demo": false,
  "risk": {
    "score": 61.4, "provisional_score": 61.4, "level": "HIGH", "method": "heuristic_v1",
    "available_weight_fraction": 0.9, "classification_withheld": false,
    "components": [
      {"name": "vegetation", "available": true, "value": 0.73, "nominal_weight": 0.4, "effective_weight": 0.444, "contribution": 32.6,
       "inputs": {"ndvi_anomaly_pct": -22.1, "latest_ndvi": 0.53, "baseline_ndvi": 0.68}},
      {"name": "water", "available": true, "value": 0.97, "...": "..."},
      {"name": "heat", "available": true, "value": 0.1, "...": "..."},
      {"name": "soil", "available": false, "reason": "Soil values are not from a verified Soil Health Card; excluded from score."}
    ],
    "notes": ["heuristic_v1: transparent weighted rule-based score; not a trained or validated model.", "Weights renormalised over available components; missing: soil."]
  },
  "evidence_quality": {"score": 84.0, "level": "GOOD", "components": ["..."], "reasons": ["Recent satellite observation", "High usable pixel coverage"], "warnings": []},
  "observations": {"vegetation": {"ndvi_anomaly_pct": -22.1, "ndvi_trend_per_10d": -0.05, "observation_age_days": 4, "ndvi_baseline": {"value": 0.68, "method": "supplied"}}, "weather": {"rainfall_14d_mm": 0.5, "water_balance_14d_mm": -68.1, "dry_spell_length_days": 23}, "soil": {"verified": false, "abnormal_parameters": ["pH", "OC"]}},
  "prediction": {"status": "MODEL_NOT_AVAILABLE", "task": "next_observation_deterioration", "probability": null, "reason": "No validated model artifact has been installed."},
  "possible_factors": ["negative vegetation anomaly", "declining vegetation trend", "negative environmental water balance"],
  "reasoning": {
    "observed": ["NDVI is 22.1% below its seasonal baseline (0.53 vs 0.68).", "Latest usable satellite observation is 4 day(s) old (2026-10-13)."],
    "inferred": ["Vegetation stress signal detected: canopy condition is below its recent seasonal baseline.", "Moisture stress may be contributing (environmental water-balance / dry-spell indicators)."],
    "not_confirmed": ["Cause of any vegetation change.", "Pest or disease presence (cannot be determined from satellite or weather data)."],
    "recommended": ["Review registered high-risk fields.", "Conduct field verification before any treatment decision."]
  },
  "recommended_next_step": "FIELD_VERIFICATION",
  "warnings": [],
  "provenance": [{"source": "open_meteo", "source_type": "OBSERVED", "...": "..."}, {"source": "heuristic_v1", "source_type": "INFERRED", "...": "..."}]
}
```

Enumerations:
- `risk.level`: `LOW` (0–24), `MODERATE` (25–49), `HIGH` (50–74), `CRITICAL` (75–100), `INSUFFICIENT_EVIDENCE`
- `evidence_quality.level`: `POOR` (0–39), `LIMITED` (40–59), `MODERATE` (60–79), `GOOD` (80–100)
- `recommended_next_step`: `URGENT_FIELD_REVIEW`, `FIELD_VERIFICATION`, `IMPROVE_EVIDENCE`, `MONITOR`, `ROUTINE_MONITORING`
- `prediction.status`: `MODEL_NOT_AVAILABLE`, `MODEL_NOT_VALIDATED`, `MODEL_DISABLED`, `INSUFFICIENT_FEATURES`, `AVAILABLE`. `probability` is non-null **only** for `AVAILABLE`, and must be labelled "model-estimated deterioration probability".
- Common `warnings`: `SATELLITE_PROVIDER_NOT_CONFIGURED: …`, `WEATHER_PROVIDER_UNAVAILABLE: …`, `WEATHER_FROM_STALE_CACHE`, `FIELD_SIZE_MAY_LIMIT_SATELLITE_RELIABILITY`, `NO_USABLE_SATELLITE_OBSERVATION`, `POOR_EVIDENCE_QUALITY_RISK_CLASSIFICATION_UNRELIABLE`, `STALE_OBSERVATION`, `DEMO_DATA: …`

Also available: `GET /api/v1/risk/assessments?location_id=` (list) and `GET /api/v1/risk/assessments/{id}` (full stored response).

### `GET /api/v1/weather/history?lat=20.39&lon=78.12&days=30[&end_date=YYYY-MM-DD]`
Returns `daily[]` (precipitation, tmax/tmin/tmean, ET0, soil moisture where available), `features` (rainfall_7d/14d/30d_mm, et0_7d/14d_mm, water_balance_14d_mm, max_temperature_7d_c, heat_days_7d, dry_spell_length_days), `cache.status` (`LIVE` | `CACHED_FRESH` | `CACHED_STALE`) and `provenance`. Show the data age when `cache.status === "CACHED_STALE"`. A missing day makes the affected window `null` (never zero-filled).

### `GET /api/v1/weather/forecast?lat=20.39&lon=78.12&days=7`
Returns `daily[]` plus `alerts[]`, one entry for each rule (`HEAT_STRESS`, `DRY_SPELL`, `HEAVY_RAIN`):

```json
{"rule": "DRY_SPELL", "triggered": true, "severity": "HIGH", "input_values": {"consecutive_dry_days": 23}, "configured_threshold": {"daily_precip_mm_lt": 2.5, "min_days": 14}, "dates": ["…"], "evaluated_at": "…", "note": "Configurable rule threshold; not a universally validated crop-damage threshold."}
```

### `POST /api/v1/satellite/field/stats`
```json
{"geometry": {"type": "Polygon", "coordinates": [[[78.1194,20.3894],[78.1206,20.3894],[78.1206,20.3906],[78.1194,20.3906],[78.1194,20.3894]]]},
 "start_date": "2026-08-15", "end_date": "2026-10-17", "baseline_years": 3, "crop": {"crop_type": "cotton"}}
```
Without credentials you get **503 `SATELLITE_PROVIDER_NOT_CONFIGURED`**. Handle it as "Satellite not connected". With credentials the response has `observations[]` (date, ndvi, ndmi, valid_pixel_pct), `summary` (latest values, anomaly, trends, baselines, quality flags) and `geometry.warnings`. `GET /api/v1/satellite/providers` shows the provider configuration.

### `POST /api/v1/soil/interpret`
```json
{"values": {"pH": 8.1, "EC": 0.42, "OC": 0.38, "N": 210, "P": 14.5, "K": 310, "S": 8.2, "Zn": 0.48, "Fe": 5.1, "Cu": 0.9, "Mn": 3.4, "B": 0.41},
 "sampling_date": "2025-11-02", "farmer_id": "farmer-1", "verified": true,
 "original_recommendation": "Text exactly as printed on the card", "recommendation_source": "Soil Health Card", "persist": true}
```
Each `results[]` entry has `parameter`, `value`, `unit`, `status` (`NORMAL`|`LOW`|`HIGH`|`OUT_OF_RANGE`|`UNKNOWN`), `normal_range` and `interpretation`. The response also has `abnormal_parameters`, `out_of_range_parameters`, `summary[]`, `is_stale`, `advisory.status` (`DRAFT`|`PENDING_APPROVAL`) and `record_id`. **No fertiliser doses are calculated.**
- Approve or reject: `POST /api/v1/soil/records/{record_id}/approval` with `{"approver": "Agronomist name", "decision": "APPROVE" | "REJECT", "reason": "…"}`. Approval needs a stored card recommendation.
- `GET /api/v1/soil/records/{id}`, `GET /api/v1/soil/thresholds`

### `POST /api/v1/interventions/prioritize`
```json
{"cases": [
  {"case_id": "field-123", "risk_score": 72, "risk_level": "HIGH", "evidence_quality_score": 84, "deteriorating": true, "crop_stage": "flowering", "affected_farmers": 18, "unresolved_alerts": 1, "verification_status": "UNVERIFIED"},
  {"case_id": "field-456", "risk_score": 78, "evidence_quality_score": 22}
], "persist": false}
```
`ranked[]` contains `rank`, `case_id`, `priority` (`P1_IMMEDIATE_REVIEW` | `P2_HIGH_PRIORITY` | `VERIFY_FIRST` | `P3_MONITOR` | `NO_ACTION`), `priority_score`, `factors[]` (`factor`, `points`, `detail`) and `rationale`. A high-risk case with weak evidence becomes `VERIFY_FIRST`; it is never dropped. With `persist: true`, Intervention records are created (`intervention_id`).

Related: `POST /api/v1/interventions`, `GET /api/v1/interventions?status=OPEN`, `PATCH /api/v1/interventions/{id}/status` with `{"status": "IN_REVIEW", "actor": "officer-2"}`. Allowed transitions: OPEN→IN_REVIEW/ESCALATED/RESOLVED, IN_REVIEW→OPEN/ESCALATED/RESOLVED, ESCALATED→IN_REVIEW/RESOLVED, RESOLVED→CLOSED/OPEN.

### `POST /api/v1/inspections`
```json
{"intervention_id": "…", "field_id": "field-123", "farmer_id": "farmer-1", "assessment_id": "…",
 "inspection_date": "2026-10-17", "inspector": "FW-07",
 "observed_condition": "Wilting on ~30% of plants in the north-east block",
 "possible_cause": "Moisture stress suspected", "photo_references": ["s3://bucket/img1.jpg"],
 "action_taken": "Advised protective irrigation", "notes": "", "verification_status": "VISITED"}
```
`verification_status`: `UNVERIFIED` | `VISITED` | `CONFIRMED` | `INCONCLUSIVE` | `RESOLVED`. `confirmed_cause` is only accepted with `CONFIRMED` or `RESOLVED`. Update with `PATCH /api/v1/inspections/{id}/status`. List with `GET /api/v1/inspections?field_id=`.

### `POST /api/v1/followups/evaluate`
```json
{"intervention_id": "…", "start_date": "2026-10-01", "ndvi_at_start": 0.52,
 "observations": [{"date": "2026-10-03", "ndvi": 0.53, "valid_pixel_pct": 89}, {"date": "2026-10-13", "ndvi": 0.56, "valid_pixel_pct": 93}],
 "verification_status": null, "persist": false}
```
Returns `outcome` (`RECOVERING` | `NOT_RECOVERING` | `DETERIORATING` | `INSUFFICIENT_DATA` | `HUMAN_VERIFICATION_REQUIRED`), `can_close_case`, `escalate`, `reasons[]` and `recommended_action`. Call it whenever a new usable observation arrives; no fixed interval is assumed. A single improved observation never closes a case.

### `GET /api/v1/model/status`
```json
{"available": false, "enabled": false, "validated": false, "model_version": null, "task": "next_observation_deterioration", "reason": "No validated model artifact has been installed."}
```

### Other
- `GET /api/v1/metrics/operations`: fields monitored, open, high-priority, needs-verification, resolved and unresolved cases, median alert-to-review hours, advisory acknowledgements (`null` when not tracked). There are no yield or money estimates.
- `POST /api/v1/farmers`, `POST /api/v1/fields` (validates GeoJSON and returns `warnings`, e.g. `FIELD_SIZE_MAY_LIMIT_SATELLITE_RELIABILITY`), `GET /api/v1/fields`
- `GET /api/v1/audit?entity_type=&entity_id=`: audit trail for every workflow change

## 5. Suggested integration order

1. `GET /health` and `GET /api/v1/demo/scenario` (works offline from providers, clearly DEMO)
2. `GET /api/v1/weather/history` and `/forecast` for real coordinates (live, no key)
3. `POST /api/v1/risk/analyze` with `lat/lon` (shows `INSUFFICIENT_EVIDENCE` until satellite data exists, which is correct)
4. Soil, inspections, prioritisation and follow-ups
5. `POST /api/v1/satellite/field/stats` once Sentinel credentials are configured
