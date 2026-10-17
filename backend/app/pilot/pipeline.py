"""Pilot pipeline after acquisition: screening -> dataset -> training/evaluation -> snapshot."""

from __future__ import annotations

import json
import logging
from datetime import date
from pathlib import Path
from typing import Any

import pandas as pd

from app.ml.model_registry import read_metadata
from app.pilot import acquire, dataset
from app.pilot.assess import build_snapshot, build_timeseries, write_snapshot
from app.pilot.region import model_dir, reports_dir

log = logging.getLogger("pilot")
ACTIVATION_FILE = "activation.json"


def systematic_holdout(cell_ids: list[str], n: int) -> list[str]:
    """Deterministic, spatially spread holdout: every k-th cell in north->south / west->east order."""
    ids = sorted(cell_ids)
    if n <= 0 or len(ids) < 2 * n:
        return []
    k = len(ids) // n
    return [ids[i] for i in range(k // 2, len(ids), k)][:n]


def activation() -> dict[str, Any]:
    p = model_dir() / ACTIVATION_FILE
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else {"enabled": False, "reason": "Pilot model not built."}


def run_after_acquire(cfg: dict[str, Any], boundary: dict[str, Any], cells: list[dict[str, Any]], composites_path: Path,
                      refresh: bool = False, skip_train: bool = False, download_failures: list[str] | None = None) -> dict[str, Any]:
    comp = pd.read_csv(composites_path)
    if comp.empty:
        raise RuntimeError("No MODIS composites available; cannot build the pilot (no substitute data is generated).")

    log.info("Stage 4: vegetation screening")
    screening = dataset.screen_cells(comp, cfg)
    for c in cells:
        s = screening.get(c["cell_id"])
        c["status"] = s["status"] if s else "download_failed"
        c["screening"] = s
    acquire.write_cells_geojson(cells, cfg)
    monitored_ids = [c["cell_id"] for c in cells if c["status"] == "monitored"]
    log.info("  %d monitored, %d excluded", len(monitored_ids), len(cells) - len(monitored_ids))

    log.info("Stage 5-6: weather + dataset")
    table, report = dataset.build_dataset(cfg, comp, cells, screening, refresh=refresh)
    labelled = table[table["label"].notna()]
    from training.temporal_split import default_boundaries  # noqa: E402

    _vs, ts = default_boundaries(labelled.assign(observation_date=pd.to_datetime(labelled["observation_date"])),
                                 cfg["split"]["val_frac"], cfg["split"]["test_frac"])
    report["label_threshold_sensitivity_pre_test_only"] = dataset.label_sensitivity(table, ts)
    report["label_threshold_rule"] = ("Primary threshold -10 percentage points is kept unless its train+validation prevalence is below 5%; "
                                      "then the strictest of -7.5 / -5 reaching 5% is used. The test period is never used to choose the threshold.")
    primary = float(cfg["label"]["anomaly_drop_pct_points"])
    chosen = primary
    sens = dataset.label_sensitivity(table, ts, thresholds=(primary, -7.5, -5.0))
    if (sens[str(primary)]["prevalence"] or 0) < 0.05:
        for alt in (-7.5, -5.0):
            if (sens[str(alt)]["prevalence"] or 0) >= 0.05:
                chosen = alt
                break
    if chosen != primary:
        log.warning("Label threshold changed from %s to %s (pre-test prevalence rule)", primary, chosen)
        table["label"] = table["label_delta"].where(table["label_delta"].isna(), (table["label_delta"] <= chosen).astype(float))
        report["label_definition"] = report["label_definition"].replace(str(primary), str(chosen))
        labelled = table[table["label"].notna()]
        report["positives"] = int(labelled["label"].sum())
        report["label_prevalence"] = round(float(labelled["label"].mean()), 4)
    report["label_threshold_used"] = chosen
    dataset.write_table(table, report)
    _write_dataset_md(report)

    evaluation: dict[str, Any] | None = None
    md = model_dir()
    if not skip_train:
        log.info("Stage 7: training / evaluation")
        from training.train import train  # noqa: E402

        holdout = systematic_holdout(monitored_ids, cfg["split"]["spatial_holdout_cells"])
        data = labelled.copy()
        data.attrs["label_definition"] = report["label_definition"]
        sat = cfg["satellite"]
        extra = {
            "pilot_region": cfg["region"],
            "monitoring_cells": {"total": len(monitored_ids), "training_and_validation": len(monitored_ids) - len(holdout), "spatial_holdout": len(holdout)},
            "data_sources": {"satellite": f"{sat['product']} C{sat['collection']} via ORNL DAAC TESViS (250 m, 16-day)",
                             "weather": "Open-Meteo historical (ERA5-based) daily weather",
                             "boundary": cfg["boundary"]["dataset"]},
            "dataset": {"rows_labelled": int(len(labelled)), "positives": int(labelled["label"].sum())},
        }
        result = train(data, md, holdout_locations=holdout, val_frac=cfg["split"]["val_frac"], test_frac=cfg["split"]["test_frac"],
                       allow_unvalidated=True, model_version=f"yavatmal-pilot-{date.today().strftime('%Y%m%d')}", extra_metadata=extra)
        meta = read_metadata(md) or {}
        validated = bool(meta.get("validated"))
        act = {"enabled": validated,
               "reason": "Model passed the safety gate on the temporal test; enabled for the Yavatmal pilot only." if validated
               else "Model did not pass the safety gate; prediction disabled (MODEL_NOT_VALIDATED). heuristic_v1 remains operational.",
               "model_version": meta.get("model_version")}
        md.mkdir(parents=True, exist_ok=True)
        (md / ACTIVATION_FILE).write_text(json.dumps(act, indent=2), encoding="utf-8")
        evaluation = write_evaluation_reports(result, report, act)
    elif (reports_dir() / "model_evaluation.json").exists():
        evaluation = json.loads((reports_dir() / "model_evaluation.json").read_text(encoding="utf-8")).get("summary")

    log.info("Stage 8: real pilot assessment snapshot")
    act = activation()
    snap = build_snapshot(cfg, cells, screening, comp, table, md, bool(act.get("enabled")), evaluation)
    ts_data = build_timeseries(table, comp)
    write_snapshot(snap, ts_data)

    s = snap["summary"]
    return {
        "boundary": boundary["properties"]["shapeName"],
        "candidate_cells": len(cells), "monitored_cells": len(monitored_ids), "download_failures": download_failures or [],
        "composites": int(len(comp)), "satellite_date_range": [str(comp["observation_date"].min()), str(comp["observation_date"].max())],
        "dataset_rows": int(len(table)), "labelled_rows": int(len(labelled)), "positives": int(labelled["label"].sum()),
        "prevalence": report.get("label_prevalence"),
        "model": s["model"], "latest_observation_date": s["latest_observation_date"], "risk_distribution": s["risk_distribution"],
        "operational_kpis": s["operational_kpis"],
    }


def _fmt(v: Any, nd: int = 3) -> str:
    return "n/a" if v is None else (f"{v:.{nd}f}" if isinstance(v, float) else str(v))


def write_evaluation_reports(result: dict[str, Any], ds_report: dict[str, Any], act: dict[str, Any]) -> dict[str, Any]:
    best = result["selected_model"]
    t = result["test"]
    sp = result.get("spatial_holdout_test", {})
    keys = ["n", "positives", "prevalence", "precision", "recall", "f1", "pr_auc", "roc_auc", "brier", "precision_at_10", "precision_at_25", "precision_at_50"]
    summary = {
        "selected_model": best,
        "candidates": list(result["validation"].keys()),
        "gate_passed": result["gate"]["passed"],
        "gate_reasons": result["gate"]["reasons"],
        "enabled_for_pilot": act["enabled"],
        "temporal_test": {"model": {k: t[best].get(k) for k in keys}, "heuristic": {k: t["heuristic_baseline"].get(k) for k in keys}, "reference": t["reference"]},
        "spatial_holdout_test": ({"model": {k: sp[best].get(k) for k in keys}, "heuristic": {k: sp["heuristic_baseline"].get(k) for k in keys},
                                  "reference": sp["reference"]} if best in sp else sp),
        "split": result["split"],
    }
    summary["caveats"] = []  # filled below
    rd = reports_dir()
    rd.mkdir(parents=True, exist_ok=True)
    (rd / "model_evaluation.json").write_text(json.dumps({"summary": summary, "full_report": result, "dataset": {
        k: ds_report.get(k) for k in ("labelled_rows", "positives", "label_prevalence", "label_definition", "monitoring_cells_used", "years_covered",
                                      "label_threshold_sensitivity_pre_test_only")}}, indent=2, default=str), encoding="utf-8")

    def table_rows(block: dict[str, Any]) -> str:
        lines = ["| metric | selected model | heuristic baseline |", "|---|---|---|"]
        for k in keys:
            lines.append(f"| {k} | {_fmt(block[best].get(k))} | {_fmt(block['heuristic_baseline'].get(k))} |")
        r = block["reference"]
        lines.append(f"| Brier, prevalence-only (oracle test prevalence) | {_fmt(r['brier_prevalence_oracle'])} | |")
        lines.append(f"| Brier, constant training-prevalence forecast | {_fmt(r['brier_train_prevalence_forecast'])} | |")
        return "\n".join(lines)

    val_lines = ["| candidate | PR-AUC | ROC-AUC | Brier | F1 |", "|---|---|---|---|---|"]
    for name, m in result["validation"].items():
        val_lines.append(f"| {name} | {_fmt(m.get('pr_auc'))} | {_fmt(m.get('roc_auc'))} | {_fmt(m.get('brier'))} | {_fmt(m.get('f1'))} |")
    imp = "\n".join(f"- `{d['feature']}`: {d['importance']:+.4f} (± {d['std']:.4f})" for d in result["global_feature_importance"][:8])
    split = result["split"]
    passed = result["gate"]["passed"]
    caveats = []
    tm, th, ref = t[best], t["heuristic_baseline"], t["reference"]
    if tm.get("brier") is not None and ref["brier_prevalence_oracle"] and (ref["brier_prevalence_oracle"] - tm["brier"]) / ref["brier_prevalence_oracle"] < 0.05:
        caveats.append(f"Calibration gain is marginal: Brier {tm['brier']:.3f} vs {ref['brier_prevalence_oracle']:.3f} for a prevalence-only forecast "
                       f"(<5% improvement). Treat probabilities as a ranking aid, not precise risk estimates.")
    vpr = result["validation"][best].get("pr_auc")
    if vpr and tm.get("pr_auc") and tm["pr_auc"] < 0.85 * vpr:
        caveats.append(f"PR-AUC fell from {vpr:.3f} (validation) to {tm['pr_auc']:.3f} (temporal test): performance varies between seasons.")
    if th.get("roc_auc") is not None and th["roc_auc"] < 0.5:
        caveats.append(f"The heuristic baseline ranks worse than random on this label (ROC-AUC {th['roc_auc']:.2f}): cells already below baseline tend to "
                       "recover at the next composite. Beating it is therefore a weak bar; the comparison with prevalence is the meaningful one.")
    top = result["global_feature_importance"][0]["feature"] if result["global_feature_importance"] else None
    if top == "ndvi_anomaly_pct":
        caveats.append("The strongest feature is the current anomaly. Part of the predictive signal is regression to the mean in a noisy "
                       "anomaly measure (a cell well above its baseline is more likely to fall back), not only genuine stress onset.")
    if tm.get("roc_auc") is not None and tm["roc_auc"] < 0.7:
        caveats.append(f"Discrimination on the temporal test is modest (ROC-AUC {tm['roc_auc']:.2f}).")
    md = f"""# Yavatmal pilot: model evaluation

**Task:** will the vegetation condition materially worsen by the next valid MOD13Q1 composite, relative to seasonal conditions?
**Label (experimental):** {ds_report.get('label_definition')}
This predicts next-observation vegetation deterioration relative to seasonal conditions. It does not diagnose pests, diseases, nutrient deficiencies, or yield loss.

## Outcome

- Selected model (by **validation** PR-AUC): **{best}**
- Safety gate on the temporal test: **{'PASSED' if passed else 'NOT PASSED'}**
- Enabled for the pilot: **{act['enabled']}**. {act['reason']}

Gate reasons:
{chr(10).join('- ' + r for r in result['gate']['reasons'])}

## Caveats (read before presenting results)

{chr(10).join('- ' + c for c in caveats) or '- none flagged'}

## Data and split

- Labelled rows: {ds_report.get('labelled_rows')}, positives: {ds_report.get('positives')}, prevalence: {_fmt(ds_report.get('label_prevalence'))}
- Train: {split['train']}
- Validation: {split['val']}
- Temporal test (later dates, training cells): {split['test']}
- Spatial holdout test (later dates, cells never used in training/selection): {split['spatial_test']}
- Holdout cells: {', '.join(split['holdout_locations']) or 'none'}
- Rows whose next observation crosses a split boundary are purged from the earlier split.

## Validation (model selection only)

{chr(10).join(val_lines)}

## Temporal test

{table_rows(t)}

## Spatial holdout test (reported separately)

{table_rows(sp) if best in sp else sp.get('note', 'not available')}

## Global feature importance

{result['feature_importance_method']}

{imp}

## Plain-English reading

- PR-AUC should be compared with the prevalence (the PR-AUC of random ranking) and with the heuristic baseline.
- The Brier score should be lower than the prevalence-only forecast for the probabilities to add information.
- Precision@K is the share of true deterioration events among the K highest-ranked cell-dates, i.e. how many of K field checks would have found a later decline.
- {'The model beat both references on the temporal test and passed the gate.' if passed else 'The model did not clear every gate criterion, so it stays experimental and the product keeps using heuristic_v1. This is an expected, honest outcome for a small regional dataset.'}
- Spatial holdout results show how the model behaves on cells it never saw; they are not used for the gate.
"""
    (rd / "model_evaluation.md").write_text(md, encoding="utf-8")
    summary["caveats"] = caveats
    ev_path = rd / "model_evaluation.json"
    blob = json.loads(ev_path.read_text(encoding="utf-8"))
    blob["summary"]["caveats"] = caveats
    ev_path.write_text(json.dumps(blob, indent=2, default=str), encoding="utf-8")
    return summary


def _write_dataset_md(r: dict[str, Any]) -> None:
    excluded = r.get("excluded_cells", {})
    lines = [
        "# Yavatmal pilot dataset report", "",
        f"- Rows (usable cell-composites): {r.get('output_rows')}",
        f"- Labelled rows: {r.get('labelled_rows')}  |  positives: {r.get('positives')}  |  prevalence: {r.get('label_prevalence')}",
        f"- Monitoring cells used: {r.get('monitoring_cells_used')} of {r.get('monitoring_cells_candidates')} candidates",
        f"- Period: {r.get('period')}  |  years: {r.get('years_covered')}",
        f"- Valid satellite observations: {r.get('valid_satellite_observations')} of {r.get('composites_downloaded_for_used_cells')} composites downloaded for used cells",
        f"- Observations with a past-only baseline: {r.get('observations_with_baseline')}",
        f"- Quality filtering: {r.get('quality_filtering')}",
        f"- Label: {r.get('label_definition')}",
        f"- Label threshold sensitivity (train+validation periods only): {r.get('label_threshold_sensitivity_pre_test_only')}",
        f"- Synthetic rows: {r.get('synthetic_rows')}", "",
        "## Excluded cells", "",
        *(f"- {k}: {', '.join(v['reasons'])}" for k, v in excluded.items()), "",
        "## Missing values (count per column)", "",
        *(f"- {k}: {v}" for k, v in r.get("missing_values", {}).items()), "",
        "## Sources", "",
        *(f"- {k}: {v}" for k, v in r.get("sources", {}).items()),
    ]
    reports_dir().mkdir(parents=True, exist_ok=True)
    (reports_dir() / "dataset_report.md").write_text("\n".join(lines), encoding="utf-8")
