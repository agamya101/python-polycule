# Yavatmal pilot data

**What this is:** a regional agricultural / vegetation monitoring pilot for Yavatmal district, Maharashtra, designed around the cotton intervention use case. It uses only real, openly available data.

**What it is not:** a farmer registry or a cotton-field map. The monitoring cells are regional sampling squares. No verified crop mask is used.

Rebuild everything (cached) with:

```bash
python scripts/build_yavatmal_pilot.py            # uses caches
python scripts/build_yavatmal_pilot.py --refresh  # re-download sources
```

## Files

| path | content | provenance |
|---|---|---|
| `pilot_config.json` | all pilot parameters (cells, quality, baseline, label, split) | hand-written configuration |
| `boundary.geojson` | Yavatmal ADM2 polygon | geoBoundaries gbOpen IND ADM2 (source: Pathways Data / lgdirectory.gov.in, ODbL 1.0); retrieval time in properties |
| `monitoring_cells.geojson` | fixed monitoring cells with status (monitored / excluded) and screening stats | derived (deterministic grid) |
| `raw/boundary/` | original geoBoundaries download + API metadata | downloaded, never edited |
| `raw/modis/` | original ORNL DAAC TESViS JSON responses (dates + subsets), each with URL, parameters and retrieval time | downloaded, never edited |
| `raw/weather/` | original Open-Meteo archive responses per cell | downloaded, never edited |
| `processed/modis_composites.csv` | one row per cell per MOD13Q1 composite (median NDVI of accepted pixels, valid/good pixel %) | derived from raw |
| `processed/yavatmal_observations.csv` | model-ready table (one row per cell per usable composite) | derived |
| `processed/dataset_report.json` | dataset statistics | derived |
| `processed/pilot_snapshot.json` | latest real assessment of every cell + regional summary | derived (served by the API) |
| `processed/pilot_timeseries.json` | regional and per-cell NDVI / baseline / anomaly history | derived (served by the API) |
| `reports/` | dataset report, model evaluation (JSON + Markdown), build summary | derived |
| `model/` | pilot model artifact, metadata and `activation.json` (enabled only if the safety gate passed) | derived |

## Methods

**Monitoring cells.** A regular lat/lon grid is anchored on the boundary's bounding-box centre. The spacing is the largest that gives at least 36 points that are inside the polygon and at least 3 km from its edge (spacing 0.16°, ~17 km). Cells are named `YVT_CELL_001…` from north to south and west to east. Each cell is a MOD13Q1 subset of 9×9 pixels at 231.66 m (~2.1 km square) centred on the point. Cells are excluded if their long-term median NDVI is below 0.2 (water, built-up or bare land) or if fewer than 50% of their composites are usable. This is vegetation screening, not crop classification.

**Satellite.** The product is MOD13Q1 Collection 6.1 (Terra, 16-day, 250 m) from the ORNL DAAC TESViS REST API, using the bands `250m_16_days_NDVI` (scale 0.0001, fill −3000, valid −2000…10000) and `250m_16_days_pixel_reliability`.
- A pixel is accepted if its NDVI is valid and its reliability is 0 (good) or 1 (marginal).
- Cell NDVI is the **median of accepted pixels**.
- `valid_pixel_pct` is accepted pixels ÷ 81.
- A composite is usable if `valid_pixel_pct` ≥ 40.
- `observation_date` is the composite start date (the MODIS date); the composite covers 16 days.
- NDMI is not available from this product and is left missing.

**Weather.** The Open-Meteo historical API (ERA5-based gridded reanalysis) supplies daily precipitation, Tmax, Tmin, Tmean and FAO-56 ET0 per cell. It is fetched once per cell for the whole period and cached. Features at date *t* use only days ≤ *t*: rainfall over 7, 14 and 30 days; ET0 over 7 and 14 days; water balance over 14 days; maximum temperature over 7 days; heat days (≥ 35 °C) over 7 days; and dry-spell length (consecutive days below 2.5 mm).

**Past-only seasonal baseline.** For an observation at *t*, the baseline is the median NDVI of the same cell's usable observations that are at least 300 days before *t* (previous seasons only) and within ±16 days of the same day of year. It needs at least 2 distinct prior years and at least 3 observations; otherwise it is left empty. Data from 2019 onwards is downloaded, so anomalies first appear in late 2020 or 2021. `ndvi_anomaly_pct = 100 × (ndvi − baseline) / |baseline|`, and it is undefined when |baseline| < 0.1.

**Label (experimental).** `label = 1` when `next_anomaly − current_anomaly ≤ −10` percentage points and the next usable composite is within 48 days. The threshold is fixed in advance and changes only if its train+validation prevalence is below 5%. It is never tuned on the test period. It is not confirmed crop stress.

**Evaluation.** The split is temporal (60% / 20% / 20% of dates), and rows whose label looks across a boundary are purged. Six cells (chosen systematically: every k-th cell) are a spatial holdout that never enters training or model selection. Two results are reported separately: the **temporal test** (later dates, training cells), which the safety gate uses, and the **spatial holdout test** (later dates, unseen cells).
