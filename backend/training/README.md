# Experimental ML pipeline: next-observation deterioration

**Task:** predict whether vegetation conditions will significantly deteriorate at the **next valid satellite observation**.

This is not disease identification, yield prediction or crop recommendation.

**Global slot:** no model is installed in `model_artifacts/`, and global `MODEL_ENABLED=false`, so the generic API reports `MODEL_NOT_AVAILABLE`.

**Yavatmal pilot:** `scripts/build_yavatmal_pilot.py` runs this pipeline on the real MODIS + Open-Meteo dataset and installs the result in `data/pilot/yavatmal/model/`. The selected logistic regression passed the gate with modest skill and is activated for the pilot only (`activation.json`). Results: `data/pilot/yavatmal/reports/model_evaluation.md`.

## Data you need

One row per location and valid observation date (CSV, or Parquet if `pyarrow` is installed):

| column | required | notes |
|---|---|---|
| `location_id` | yes | field or monitoring-unit ID |
| `observation_date` | yes | acquisition date |
| `ndvi` | yes | field mean over valid pixels |
| `ndmi` | recommended | |
| `valid_pixel_pct` | recommended | rows below `--min-valid-pct` (default 40) are dropped |
| `baseline_ndvi`, `ndvi_anomaly_pct` | recommended | seasonal baseline for that date (needed for `--label-mode anomaly_delta`) |
| `rainfall_7d`, `rainfall_14d`, `rainfall_30d`, `et0_7d`, `et0_14d`, `water_balance_14d`, `temperature_max_7d`, `heat_days_7d`, `dry_spell_length` | recommended | computed **as of** `observation_date`, e.g. with `app.services.feature_engineering.compute_weather_features` on Open-Meteo archive data |
| `crop_type`, `sowing_date` | optional | `days_since_sowing` is derived |

A practical source is Sentinel Hub Statistical API exports per field (the same evalscript as `app/providers/sentinel_hub.py`), joined with Open-Meteo archive weather. Field inspections recorded through `/api/v1/inspections` become labelled ground truth over time.

## Leakage rules (enforced)

- Features at time *t* use only rows at or before *t*: lags use `shift(+1)` and trends use the current and previous observations only.
- Labels use the next valid observation *t+1* and are stored under `next_*` / `label` columns. `assert_no_leakage` refuses these as features.
- The temporal split **purges** rows whose next observation falls in a later split, so no label crosses a split boundary.
- Rows are never shuffled across time. Optional geographic holdout: `--holdout-location-frac`.

## Labels (experimental thresholds)

- `ndvi_delta` (default): `next_ndvi - ndvi <= -0.08`, with the next observation within 30 days.
- `anomaly_delta` (preferred when seasonal or stage-aligned baselines exist): `next_anomaly - anomaly <= -10` percentage points.

Neither threshold is agronomically validated. Treat both as research baselines.

## Commands

```bash
python training/prepare_dataset.py --input data/raw/observations.csv --output data/processed/train.csv
python training/build_features.py --data data/processed/train.csv          # feature availability
python training/temporal_split.py --data data/processed/train.csv          # split summary
python training/train.py --data data/processed/train.csv --out model_artifacts
python training/evaluate.py --data data/processed/train.csv --artifact-dir model_artifacts --start 2025-06-01
```

`train.py` compares a **heuristic baseline**, **logistic regression**, **random forest** and **HistGradientBoosting**. It picks the best by validation PR-AUC, refits on train+validation, and evaluates once on the test period. Metrics: precision, recall, F1, PR-AUC, ROC-AUC, Brier score, and Precision@K (10/25/50). Precision@K matters because field teams can only visit a limited number of alerts. The heuristic baseline's score isn't a calibrated probability, so read its Brier score as a reference only.

## Safety gate (`app/ml/validation.py`)

An artifact is marked `validated: true` only if, on the temporally held-out test set:

- it has at least 200 rows and at least 30 positive labels,
- PR-AUC is at least 1.2 × prevalence and beats the heuristic baseline,
- the Brier score beats a prevalence-only forecast.

If the gate fails, no artifact is installed. `--allow-unvalidated` writes one for inspection, and inference still refuses it. `model_metadata.json` records the model name and version, training time, features, train/validation/test periods, metrics, label definition, limitations, gate result, global feature importances and the model file's SHA-256. The registry rejects an artifact whose checksum doesn't match.
