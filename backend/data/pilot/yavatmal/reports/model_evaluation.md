# Yavatmal pilot: model evaluation

**Task:** will the vegetation condition materially worsen by the next valid MOD13Q1 composite, relative to seasonal conditions?
**Label (experimental):** next valid NDVI anomaly - current anomaly <= -10.0 percentage points (within 48 days) [EXPERIMENTAL THRESHOLD]
This predicts next-observation vegetation deterioration relative to seasonal conditions. It does not diagnose pests, diseases, nutrient deficiencies, or yield loss.

## Outcome

- Selected model (by **validation** PR-AUC): **logistic_regression**
- Safety gate on the temporal test: **PASSED**
- Enabled for the pilot: **True**. Model passed the safety gate on the temporal test; enabled for the Yavatmal pilot only.

Gate reasons:
- All gate criteria met on the temporally held-out test set.

## Caveats (read before presenting results)

- Calibration gain is marginal: Brier 0.122 vs 0.126 for a prevalence-only forecast (<5% improvement). Treat probabilities as a ranking aid, not precise risk estimates.
- PR-AUC fell from 0.339 (validation) to 0.255 (temporal test): performance varies between seasons.
- The heuristic baseline ranks worse than random on this label (ROC-AUC 0.39): cells already below baseline tend to recover at the next composite. Beating it is therefore a weak bar; the comparison with prevalence is the meaningful one.
- The strongest feature is the current anomaly. Part of the predictive signal is regression to the mean in a noisy anomaly measure (a cell well above its baseline is more likely to fall back), not only genuine stress onset.
- Discrimination on the temporal test is modest (ROC-AUC 0.63).

## Data and split

- Labelled rows: 3681, positives: 464, prevalence: 0.126
- Train: {'rows': 1874, 'start': '2020-12-18', 'end': '2024-05-08', 'positives': 238, 'locations': 30}
- Validation: {'rows': 526, 'start': '2024-06-09', 'end': '2025-06-26', 'positives': 41, 'locations': 30}
- Temporal test (later dates, training cells): {'rows': 631, 'start': '2025-07-28', 'end': '2026-08-29', 'positives': 93, 'locations': 30}
- Spatial holdout test (later dates, cells never used in training/selection): {'rows': 125, 'start': '2025-08-29', 'end': '2026-08-29', 'positives': 18, 'locations': 6}
- Holdout cells: YVT_CELL_004, YVT_CELL_010, YVT_CELL_016, YVT_CELL_022, YVT_CELL_028, YVT_CELL_034
- Rows whose next observation crosses a split boundary are purged from the earlier split.

## Validation (model selection only)

| candidate | PR-AUC | ROC-AUC | Brier | F1 |
|---|---|---|---|---|
| heuristic_baseline | 0.073 | 0.234 | 0.123 | 0.000 |
| logistic_regression | 0.339 | 0.805 | 0.063 | 0.364 |
| random_forest | 0.247 | 0.726 | 0.074 | 0.350 |
| hist_gradient_boosting | 0.214 | 0.740 | 0.084 | 0.311 |

## Temporal test

| metric | selected model | heuristic baseline |
|---|---|---|
| n | 631 | 631 |
| positives | 93 | 93 |
| prevalence | 0.147 | 0.147 |
| precision | 0.288 | 0.062 |
| recall | 0.161 | 0.011 |
| f1 | 0.207 | 0.018 |
| pr_auc | 0.255 | 0.141 |
| roc_auc | 0.632 | 0.389 |
| brier | 0.122 | 0.164 |
| precision_at_10 | 0.600 | 0.100 |
| precision_at_25 | 0.360 | 0.080 |
| precision_at_50 | 0.280 | 0.040 |
| Brier, prevalence-only (oracle test prevalence) | 0.126 | |
| Brier, constant training-prevalence forecast | 0.126 | |

## Spatial holdout test (reported separately)

| metric | selected model | heuristic baseline |
|---|---|---|
| n | 125 | 125 |
| positives | 18 | 18 |
| prevalence | 0.144 | 0.144 |
| precision | 0.467 | 0.000 |
| recall | 0.389 | 0.000 |
| f1 | 0.424 | 0.000 |
| pr_auc | 0.392 | 0.135 |
| roc_auc | 0.733 | 0.425 |
| brier | 0.109 | 0.156 |
| precision_at_10 | 0.500 | 0.000 |
| precision_at_25 | 0.280 | 0.080 |
| precision_at_50 | 0.240 | 0.060 |
| Brier, prevalence-only (oracle test prevalence) | 0.123 | |
| Brier, constant training-prevalence forecast | 0.124 | |

## Global feature importance

Permutation importance (average precision) of the selected model fitted on the training period only, evaluated on the validation period. Associational, not causal.

- `ndvi_anomaly_pct`: +0.2374 (± 0.0065)
- `rainfall_30d`: +0.1279 (± 0.0159)
- `et0_7d`: +0.0886 (± 0.0409)
- `temperature_max_7d`: +0.0834 (± 0.0227)
- `rainfall_7d`: +0.0592 (± 0.0164)
- `ndvi_current`: +0.0463 (± 0.0159)
- `month_cos`: +0.0323 (± 0.0251)
- `ndvi_trend`: +0.0209 (± 0.0198)

## Plain-English reading

- PR-AUC should be compared with the prevalence (the PR-AUC of random ranking) and with the heuristic baseline.
- The Brier score should be lower than the prevalence-only forecast for the probabilities to add information.
- Precision@K is the share of true deterioration events among the K highest-ranked cell-dates, i.e. how many of K field checks would have found a later decline.
- The model beat both references on the temporal test and passed the gate.
- Spatial holdout results show how the model behaves on cells it never saw; they are not used for the gate.
