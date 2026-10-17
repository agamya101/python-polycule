# KrishiMitra: Yavatmal real-data pilot, technical summary

Build of 2026-10-18 (`python scripts/build_yavatmal_pilot.py`). All numbers below come from `data/pilot/yavatmal/reports/` and `processed/`.

## Problem

FPOs, agriculture departments and CSR programmes in cotton districts must decide **where to send limited field staff**, and they need to do it before stress becomes visible on the ground. KrishiMitra turns open satellite and weather data into a ranked, explainable list of places to check. Every value carries its provenance, and no number is presented as more certain than the evidence allows.

## Pilot region

Yavatmal district, Maharashtra, one of India's largest cotton districts. The boundary comes from geoBoundaries gbOpen IND ADM2 (source: Pathways Data / LGD, ODbL 1.0).

Positioning: **a regional agricultural / vegetation monitoring pilot designed around the cotton intervention use case.** No verified cotton mask is used, so the cells are not claimed to be cotton fields.

## Real data sources

| Data | Source | Access |
|---|---|---|
| NDVI + pixel reliability | NASA MODIS/Terra **MOD13Q1 Collection 6.1** (250 m, 16-day composite) via the **ORNL DAAC TESViS** REST API | no key needed |
| Daily weather | **Open-Meteo** historical archive (ERA5-based reanalysis) and current forecast API | no key needed |
| District boundary | **geoBoundaries** ADM2 | open download |

Raw responses are cached unedited in `data/pilot/yavatmal/raw/` (MODIS ≈12 MB, weather ≈4 MB).

## Satellite methodology

- **36 fixed monitoring cells** (`YVT_CELL_001…036`) on a 0.16° grid inside the district, each at least 3 km from the boundary. Each cell is a 9×9-pixel MOD13Q1 subset (~2.1 km square). All 36 passed vegetation screening (long-term median NDVI ≥ 0.2 and at least 50% usable composites; lowest median NDVI 0.34).
- Pixels are accepted when NDVI is valid (not the −3000 fill value, and within −2000…10000) and reliability is 0 (good) or 1 (marginal). Cell NDVI is the median of accepted pixels × 0.0001. A composite is usable when at least 40% of its pixels are accepted.
- Period: 2019-01-01 → **2026-09-14** (latest composite available on 2026-10-18). There are 178 composites per cell, 6,408 downloaded in total and **5,280 usable**. Monsoon cloud loss is substantial: only 22% of July composites are usable, against 100% from October to May.
- NDMI is not available from MOD13Q1 and is left missing. Sentinel-2 remains the future field-level source.

## Weather methodology

The Open-Meteo archive is fetched once per cell for 2018-11 → 2026-09 and cached. Features at date *t* use only days ≤ *t*: rainfall over 7, 14 and 30 days; ET0 over 7 and 14 days; 14-day water balance (rainfall − ET0); 7-day Tmax; heat days; and dry-spell length.

For the current assessment, water stress is scored **against a past-only seasonal norm**: the median of the same date in 2019–2025 at the same cell. Without that norm, every post-monsoon October would be flagged as dry.

## Seasonal baseline (past-only)

For an observation at *t*, the baseline is the median NDVI of the same cell at least 300 days earlier (previous seasons only), within ±16 days of the same day of year. It needs at least 2 prior years and at least 3 observations; otherwise it is left empty, never invented. A test confirms that changing future years does not change an earlier baseline. 3,892 of 5,280 observations have a baseline; it is available from about late 2020.

## Risk engine

`heuristic_v1` is a transparent rule-based score from 0 to 100: vegetation 40% (negative NDVI anomaly only), water 30%, heat 20%, and soil 10% (verified cards only). Weights are renormalised when a component is missing. An evidence-quality score (0–100) is reported separately and is **not** a model confidence; the MODIS product profile accounts for the 16-day composite and its release delay. Classification is withheld (`INSUFFICIENT_EVIDENCE`) when evidence is poor. Explanations never name a pest or disease.

## ML task

Will vegetation conditions **materially worsen by the next valid composite relative to seasonal conditions**?
`label = 1` if `next_anomaly − current_anomaly ≤ −10` percentage points and the next composite is within 48 days. The label is **experimental**. The threshold was fixed in advance, and its train+validation prevalence (12.1%) did not trigger the pre-declared change rule; the test period was never used to choose it.

## Dataset size

5,280 cell-composite rows, of which **3,681 are labelled** (both anomalies available). There are **464 positives (prevalence 12.6%)**, from 36 cells over 2020-12 → 2026-08. The dataset contains no synthetic rows.

## Train / validation / test design

- Temporal split by date, 60% / 20% / 20%. Rows whose next observation crosses a split boundary are purged.
- **Spatial holdout:** 6 systematically chosen cells (004, 010, 016, 022, 028, 034) never enter training or model selection.
- Train: 1,874 rows (2020-12 → 2024-05). Validation: 526 (2024-06 → 2025-06). **Temporal test:** 631 rows with 93 positives (2025-07 → 2026-08), training cells only. **Spatial holdout test:** 125 rows with 18 positives, same later period, unseen cells.
- Candidates: heuristic baseline, logistic regression, random forest, HistGradientBoosting. The model is selected **by validation PR-AUC only**.

## Model results

Selected: **logistic regression** (validation PR-AUC 0.339 vs 0.247 for RF and 0.214 for HGB).

| | Temporal test | Spatial holdout |
|---|---|---|
| prevalence | 0.147 | 0.144 |
| PR-AUC (model / heuristic) | **0.255** / 0.141 | **0.392** / 0.135 |
| ROC-AUC | 0.632 | 0.733 |
| Brier (model / prevalence-only) | 0.122 / 0.126 | 0.109 / 0.123 |
| Precision@10 / @25 / @50 | 0.60 / 0.36 / 0.28 | 0.50 / 0.28 / 0.24 |
| precision / recall / F1 (threshold chosen on validation) | 0.29 / 0.16 / 0.21 | 0.47 / 0.39 / 0.42 |

Global feature importance (permutation, train-only model on validation data; associational, not causal): current NDVI anomaly, 30-day rainfall, 7-day ET0, 7-day Tmax, 7-day rainfall.

## Did the model pass the gate?

**Yes.** On the temporal test it met every pre-declared criterion: at least 200 rows; at least 30 positives; PR-AUC at least 1.2 × prevalence; PR-AUC above the heuristic; and Brier below a prevalence-only forecast. It is therefore **enabled for the Yavatmal pilot only** (`data/pilot/yavatmal/model/activation.json`). The global `MODEL_ENABLED` stays false. The gate was not loosened.

**Honest caveats (also in `reports/model_evaluation.md`):**
- **Skill is modest** (ROC-AUC 0.63), and the **Brier gain is marginal** (about 3%). Use the probability to rank cells, not as a precise risk.
- PR-AUC fell from 0.34 on validation to 0.26 on the temporal test, so performance varies by season.
- The strongest feature is the current anomaly; part of the signal is **regression to the mean** in a noisy anomaly measure.
- The heuristic baseline ranks worse than random on this label, so beating it is a weak bar. The meaningful comparison is against prevalence.
- `heuristic_v1` remains the **operational** risk engine. The model only adds a "model-estimated deterioration probability".

## Latest real Yavatmal result (as of 2026-10-18; latest composite 2026-09-14, 34 days old)

- Regional median NDVI is 0.796 against a baseline of 0.768, giving a **median anomaly of +4.5%**. 9 of 36 cells are below baseline and 27 above.
- Weather: 0.2 mm of rain in 14 days (median), a 14-day water balance of −67 mm, and dry spells of 23–26 days (norm 2–5 days). That is **34–62 mm drier than the 2019–2025 norm** for mid-October. The DRY_SPELL alert is triggered (HIGH).
- Risk: **all 36 cells MODERATE** (scores 33–42), driven by the seasonal water deficit while vegetation is still near or above baseline. There are 0 HIGH/CRITICAL cells and 0 with insufficient evidence. Evidence quality is GOOD (86.7).
- Priority: 5 cells at **P3_MONITOR** (declining recent NDVI trend: YVT_CELL_034, 002, 001, 026, 035) and 31 at NO_ACTION. **0 cells need field review.** Model-estimated deterioration probabilities across cells range from 0.06 to 0.24 (highest: YVT_CELL_034).

## Operational KPIs (from the snapshot)

36 monitoring cells analysed · 0 cells requiring review · 0 with insufficient evidence · 0 high-priority (P1/P2) · 5 to monitor · latest observation 34 days old. No yield, income or loss-prevention figures are estimated.

## What is real vs demonstrated

- **Real:** the boundary, 36 cells, 6,408 MODIS composites, cell weather histories, baselines, anomalies, the training table, model evaluation, the current regional assessment, alerts and the priority ranking (`/api/v1/pilot/yavatmal/*`, `demo: false`).
- **Demonstrated (synthetic):** the farmer field, its intervention, inspection and follow-up (`/api/v1/demo/scenario`, `demo: true`). It shows how verified, registered field boundaries plug into the same engines.

## Limitations

- Cells are about 2 km regional squares of 250 m pixels. They are not farmer fields, there is no crop mask, and the signals mix crops, fallow and trees.
- MOD13Q1 is a 16-day composite released 2–5 weeks after the composite starts, so recent changes are invisible. The latest data is 34 days old.
- Baselines cover only 2019 onwards (2–7 prior seasons), so a single unusual year shifts them.
- Weather is gridded reanalysis or model data; the water balance ignores irrigation.
- Labels are statistical, not field-confirmed stress. There are no ground-truth inspections yet.
- `heuristic_v1` weights are unvalidated engineering defaults.

## Scaling path

1. **Regional MODIS monitoring** (this pilot) → district-level early warning and staff allocation.
2. **Sentinel-2 on verified fields** (the Sentinel Hub adapter already exists; 10 m NDVI + NDMI) for registered FPO plots.
3. **Field verification labels** through `/api/v1/inspections`, turning statistical labels into confirmed outcomes.
4. **Crop-specific models**: cotton-stage-aligned baselines, crop masks, and retraining on confirmed labels behind the same safety gate.
