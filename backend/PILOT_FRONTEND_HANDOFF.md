# Yavatmal pilot: frontend handoff

Base URL: `http://localhost:8000`. Interactive docs: `/docs`. Generate types with `npx openapi-typescript http://localhost:8000/openapi.json -o src/api/schema.d.ts`; the interfaces below are hand-written for the pilot endpoints.

## 1. Two separate stories (keep them visually separate)

| | Real pilot | Demonstration workflow |
|---|---|---|
| What | Yavatmal **regional** vegetation and weather intelligence from real NASA MODIS + Open-Meteo data | Farmer-level workflow (field → intervention → inspection → follow-up) |
| Endpoints | `/api/v1/pilot/yavatmal/*` | `/api/v1/demo/scenario` |
| Flags | `demo: false`, cells have `is_farmer_field: false` | `demo: true`, `is_demo: true` |
| UI badge | "Real data · Yavatmal regional pilot" | "DEMO · synthetic field" |

Suggested pitch line: *"Regional intelligence is running on real Yavatmal data. The farmer-level workflow shows how verified, registered field boundaries plug into the same system."*

## 2. Endpoints and UI mapping

| UI element | Endpoint |
|---|---|
| Regional dashboard (KPI tiles, condition, weather, risk distribution, top cells) | `GET /api/v1/pilot/yavatmal/summary` |
| Map point layer / heatmap | `GET /api/v1/pilot/yavatmal/cells` (add `?include_details=true` for side panels) |
| District outline + cell squares | `GET /api/v1/pilot/yavatmal/boundary` (GeoJSON) |
| Regional NDVI vs baseline chart | `GET /api/v1/pilot/yavatmal/timeseries` (`?start=2023-01-01`) |
| Cell detail drawer and its chart | `GET /api/v1/pilot/yavatmal/cells/{cell_id}` or `/timeseries?cell_id=YVT_CELL_012` |
| Model card | `GET /api/v1/pilot/yavatmal/model` and `GET /api/v1/model/status` (`pilot_models.yavatmal`) |
| Farmer workflow demo | `GET /api/v1/demo/scenario` |

If the pilot hasn't been built, the pilot endpoints return **503** with `status: "PILOT_NOT_BUILT"`. Show "Pilot data not built yet".

## 3. Real vs demo indicators

- `demo === false` on every pilot response, and `is_farmer_field === false` on every cell.
- `provenance[].source_type`: `OBSERVED` (MODIS, Open-Meteo, boundary), `INFERRED` (baseline, heuristic_v1, evidence quality), `PREDICTED` (only when the pilot model passed the gate and is enabled).
- `prediction_status`: show a probability **only** when it is `"AVAILABLE"`. Otherwise show "Model not validated, not used".
- `risk_level === "INSUFFICIENT_EVIDENCE"` means "Insufficient evidence", **not** low risk. `risk_score` is `null` then.

## 4. Wording rules

Use:
- "Vegetation stress signal"
- "Below seasonal baseline" / "NDVI anomaly"
- "Possible moisture stress"
- "Evidence quality"
- "Model-estimated deterioration probability" (only when the status is AVAILABLE)
- "Regional monitoring cell"
- "Heuristic risk score (rule-based)"

Do not use:
- "Disease detected", "Pest detected", "Pink bollworm detected"
- "ML confidence", "AI confidence", "accuracy" (unless quoting the evaluation report)
- "Verified cotton field", "Farmer field" (for pilot cells)
- "Yield loss", "money saved", "crop loss prevented"

## 5. TypeScript interfaces

```ts
type RiskLevel = "LOW" | "MODERATE" | "HIGH" | "CRITICAL" | "INSUFFICIENT_EVIDENCE";
type Priority = "P1_IMMEDIATE_REVIEW" | "P2_HIGH_PRIORITY" | "VERIFY_FIRST" | "P3_MONITOR" | "NO_ACTION";
type NextStep = "URGENT_FIELD_REVIEW" | "FIELD_VERIFICATION" | "IMPROVE_EVIDENCE" | "MONITOR" | "ROUTINE_MONITORING";
type PredictionStatus = "AVAILABLE" | "MODEL_NOT_AVAILABLE" | "MODEL_NOT_VALIDATED" | "MODEL_DISABLED" | "INSUFFICIENT_FEATURES";

interface Provenance {
  source: string; source_type: "OBSERVED" | "INFERRED" | "PREDICTED" | "CONFIRMED" | "DEMO";
  observed_at: string | null; retrieved_at: string; is_demo: boolean;
  quality_flags: string[]; provider_metadata: Record<string, unknown>;
}

interface PilotSummary {
  demo: false; is_demo: false; generated_at: string; as_of_date: string;
  pilot: { id: string; region: string; primary_crop_context: "cotton"; scope: string; not_farmer_fields: true; positioning: string };
  latest_observation_date: string | null;
  satellite: { source: string; provider: string; product: string; resolution_m: number; composite_interval_days: number; ndmi_available: boolean };
  coverage: { candidate_cells: number; monitoring_cells: number; excluded_cells: number; usable_cells_latest_composite: number };
  regional_condition: {
    median_ndvi: number | null; median_baseline_ndvi: number | null; median_ndvi_anomaly_pct: number | null;
    cells_below_baseline: number; cells_above_baseline: number; cells_without_anomaly: number; cells_high_risk: number; basis: string;
  };
  weather: {
    as_of: string; median_rainfall_14d_mm: number | null; median_rainfall_30d_mm: number | null; median_water_balance_14d_mm: number | null;
    median_dry_spell_days: number | null; median_max_temperature_7d_c: number | null;
    alerts: { rule: "HEAT_STRESS" | "DRY_SPELL" | "HEAVY_RAIN"; triggered: boolean; severity: string | null;
              input_values: Record<string, unknown>; configured_threshold: Record<string, unknown>; dates: string[] }[];
    note: string | null; source: string;
  };
  risk_distribution: Record<RiskLevel, number>;
  top_priority_cells: { cell_id: string; lat: number; lon: number; latest_ndvi: number | null; baseline_ndvi: number | null;
    ndvi_anomaly_pct: number | null; possible_factors: string[]; recommended_next_step: NextStep;
    risk_level: RiskLevel; risk_score: number | null; evidence_score: number; priority: Priority }[];
  operational_kpis: { monitoring_cells_analysed: number; cells_requiring_review: number; cells_insufficient_evidence: number;
    high_priority_cases: number; verify_first_cases: number; latest_observation_freshness_days: number | null; note: string };
  model: { status: PredictionStatus; available: boolean; validated: boolean; enabled_for_pilot: boolean; model_version: string | null;
    reason: string; operational_engine: "heuristic_v1"; evaluation_summary: unknown };
  limitations: string[];
  provenance: Provenance[];
}

interface PilotCell {
  cell_id: string; lat: number; lon: number; cell_type: "regional_vegetation_monitoring_cell"; is_farmer_field: false; is_demo: false;
  latest_observation_date: string | null; observation_age_days: number | null;
  latest_ndvi: number | null; baseline_ndvi: number | null; ndvi_anomaly_pct: number | null; ndvi_trend_per_10d: number | null;
  risk_level: RiskLevel; risk_score: number | null; risk_method: "heuristic_v1";
  evidence_score: number; evidence_level: "POOR" | "LIMITED" | "MODERATE" | "GOOD";
  priority: Priority; priority_rank: number; possible_factors: string[]; recommended_next_step: NextStep;
  prediction_status: PredictionStatus; prediction_probability: number | null;
  details?: Record<string, unknown>; // with ?include_details=true: risk components, reasoning, weather, provenance …
}
interface PilotCellsResponse { demo: false; as_of_date: string; latest_observation_date: string | null; note: string; count: number; cells: PilotCell[] }

interface TimeseriesPoint {   // regional
  date: string; cells_observed: number; median_ndvi: number; median_baseline_ndvi: number | null;
  median_ndvi_anomaly_pct: number | null; pct_cells_below_baseline: number | null;
  median_rainfall_30d_mm: number | null; median_water_balance_14d_mm: number | null;
}
interface CellTimeseriesPoint { date: string; ndvi: number; baseline_ndvi: number | null; ndvi_anomaly_pct: number | null; valid_pixel_pct: number; rainfall_30d_mm: number | null; label: number | null }
interface TimeseriesResponse { demo: false; source_type: "OBSERVED"; scope: string; note: string; baseline_method: string; points: (TimeseriesPoint | CellTimeseriesPoint)[] }
```

```ts
const API = import.meta.env.VITE_API_URL ?? "http://localhost:8000";
export const getPilotSummary = () => fetch(`${API}/api/v1/pilot/yavatmal/summary`).then(r => r.json() as Promise<PilotSummary>);
export const getPilotCells   = () => fetch(`${API}/api/v1/pilot/yavatmal/cells`).then(r => r.json() as Promise<PilotCellsResponse>);
export const getPilotSeries  = (cellId?: string) =>
  fetch(`${API}/api/v1/pilot/yavatmal/timeseries${cellId ? `?cell_id=${cellId}` : ""}`).then(r => r.json() as Promise<TimeseriesResponse>);
```

## 6. Display tips

- Colour cells by `ndvi_anomaly_pct` (diverging: below baseline → warm, above → cool). Grey out cells with `null` anomaly.
- Show `latest_observation_date` and `operational_kpis.latest_observation_freshness_days` prominently. MODIS 16-day composites arrive with a 2–5 week lag.
- Chart `median_ndvi` against `median_baseline_ndvi`. The baseline exists only from about 2021, because it needs two prior seasons.
- Carry `limitations[]` in an info popover on the dashboard.
- CORS: add your dev origin to `CORS_ORIGINS` in the backend `.env` (repository root).
