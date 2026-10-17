# Yavatmal pilot dataset report

- Rows (usable cell-composites): 5280
- Labelled rows: 3681  |  positives: 464  |  prevalence: 0.1261
- Monitoring cells used: 36 of 36 candidates
- Period: {'start': '2019-01-01', 'end': '2026-09-14'}  |  years: [2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026]
- Valid satellite observations: 5280 of 6408 composites downloaded for used cells
- Observations with a past-only baseline: 3892
- Quality filtering: composite kept when cell NDVI exists (>=1 accepted pixel, reliability 0/1, not fill) and valid_pixel_pct >= 40.0
- Label: next valid NDVI anomaly - current anomaly <= -10.0 percentage points (within 48 days) [EXPERIMENTAL THRESHOLD]
- Label threshold sensitivity (train+validation periods only): {'-5.0': {'rows': 2925, 'prevalence': 0.2557}, '-10.0': {'rows': 2925, 'prevalence': 0.1207}, '-15.0': {'rows': 2925, 'prevalence': 0.0643}, '-20.0': {'rows': 2925, 'prevalence': 0.0373}}
- Synthetic rows: 0

## Excluded cells


## Missing values (count per column)

- baseline_ndvi: 1388
- ndvi_anomaly_pct: 1388
- ndmi_current: 5280
- ndvi_delta_prev: 36
- days_since_prev_obs: 36
- ndvi_trend: 36
- ndmi_trend: 5280
- next_observation_date: 36
- next_ndvi: 36
- next_ndvi_anomaly_pct: 1388
- next_gap_days: 36
- label_delta: 1599
- label: 1599

## Sources

- satellite: NASA LP DAAC MOD13Q1 C6.1 via ORNL DAAC TESViS web service (https://modis.ornl.gov/rst/api/v1/)
- weather: Open-Meteo historical weather API (ERA5-based reanalysis), https://archive-api.open-meteo.com/v1/archive
- boundary: geoBoundaries gbOpen IND ADM2