"""Soil Health Card interpretation.

Validates and classifies the 12 common SHC parameters against configurable
thresholds (``app/rules/soil_thresholds.json``) and writes plain-language
interpretations.

This module deliberately does NOT compute fertiliser doses. Product quantities
(e.g. Urea + DAP) computed independently per nutrient double count nitrogen,
because DAP also supplies N; dose advice must come from an approved agronomic
source, typically the recommendation printed on the Soil Health Card itself,
which can be stored verbatim and must be approved by a person before it is
marked APPROVED.
"""

from __future__ import annotations

from datetime import date
from typing import Any

from app.config import load_rules
from app.schemas.soil import (
    SOIL_PARAMETERS,
    AdvisoryStatus,
    SoilAdvisory,
    SoilParameterResult,
    SoilParameters,
    SoilStatus,
)

NO_DOSE_NOTE = (
    "This service does not calculate fertiliser doses. Any dose advice must come from an approved agronomic source "
    "(e.g. the recommendation printed on the Soil Health Card) and be approved by an authorised agronomist before use."
)


def _fmt(v: float | None) -> str:
    if v is None:
        return "?"
    return f"{v:g}"


def classify_parameter(name: str, value: float | None, spec: dict[str, Any]) -> SoilParameterResult:
    unit = spec.get("unit", "")
    label = spec["label"]
    low, high = spec.get("low_below"), spec.get("high_above")
    rng = {"low_below": low, "high_above": high, "plausible_min": spec["plausible_min"], "plausible_max": spec["plausible_max"]}
    u = f" {unit}" if unit else ""

    if value is None:
        return SoilParameterResult(parameter=name, label=label, value=None, unit=unit, status=SoilStatus.UNKNOWN, normal_range=rng, interpretation=f"{label}: not reported.")
    if value < spec["plausible_min"] or value > spec["plausible_max"]:
        return SoilParameterResult(
            parameter=name, label=label, value=value, unit=unit, status=SoilStatus.OUT_OF_RANGE, normal_range=rng,
            interpretation=(
                f"{label} {_fmt(value)}{u} is outside the plausible range ({_fmt(spec['plausible_min'])}–{_fmt(spec['plausible_max'])}{u}). "
                "Check for a data-entry or unit error; this value was not interpreted."
            ),
        )
    if low is not None and value < low:
        status = SoilStatus.LOW
        extra = f": {spec['low_text']}" if spec.get("low_text") else ""
        text = f"{label} {_fmt(value)}{u} is below the configured normal range{_range_text(low, high, u)}{extra}."
    elif high is not None and value > high:
        status = SoilStatus.HIGH
        extra = f": {spec['high_text']}" if spec.get("high_text") else ""
        text = f"{label} {_fmt(value)}{u} is above the configured normal range{_range_text(low, high, u)}{extra}."
    else:
        status = SoilStatus.NORMAL
        text = f"{label} {_fmt(value)}{u} is within the configured normal range{_range_text(low, high, u)}."
    return SoilParameterResult(parameter=name, label=label, value=value, unit=unit, status=status, normal_range=rng, interpretation=text)


def _range_text(low: float | None, high: float | None, u: str) -> str:
    if low is not None and high is not None:
        return f" ({_fmt(low)}–{_fmt(high)}{u})"
    if low is not None:
        return f" (at least {_fmt(low)}{u})"
    if high is not None:
        return f" (up to {_fmt(high)}{u})"
    return ""


def soil_severity(results: list[SoilParameterResult]) -> float:
    """0-1 heuristic soil-constraint severity for the risk engine (max over parameters)."""
    cfg = load_rules("risk_config")["soil"]
    sev = 0.0
    for r in results:
        if r.status in (SoilStatus.LOW, SoilStatus.HIGH) and r.parameter in cfg["constraint_parameter_severity"]:
            sev = max(sev, cfg["constraint_parameter_severity"][r.parameter])
        else:
            sev = max(sev, cfg["status_severity"].get(r.status.value, 0.0))
    return round(sev, 3)


def interpret_soil(
    values: SoilParameters,
    *,
    sampling_date: str | None = None,
    verified: bool = False,
    original_recommendation: str | None = None,
    recommendation_source: str | None = None,
    today: date | None = None,
) -> dict[str, Any]:
    cfg = load_rules("soil_thresholds")
    specs = cfg["parameters"]
    results = [classify_parameter(p, getattr(values, p), specs[p]) for p in SOIL_PARAMETERS]

    abnormal = [r.parameter for r in results if r.status in (SoilStatus.LOW, SoilStatus.HIGH)]
    out_of_range = [r.parameter for r in results if r.status == SoilStatus.OUT_OF_RANGE]
    unknown = [r.parameter for r in results if r.status == SoilStatus.UNKNOWN]

    is_stale = None
    if sampling_date:
        age = ((today or date.today()) - date.fromisoformat(sampling_date)).days
        is_stale = age > cfg["stale_after_days"]

    summary: list[str] = [r.interpretation for r in results if r.status in (SoilStatus.LOW, SoilStatus.HIGH, SoilStatus.OUT_OF_RANGE)]
    if not abnormal and not out_of_range:
        summary.insert(0, "All reported parameters are within the configured normal ranges.")
    if unknown:
        summary.append(f"Not reported: {', '.join(unknown)}.")
    if is_stale:
        summary.append(f"Sample is older than {cfg['stale_after_days']} days; a fresh soil test is advisable.")
    if not verified:
        summary.append("Values are not marked as laboratory-verified; they are shown for information and do not enter the risk score.")

    advisory = SoilAdvisory(
        status=AdvisoryStatus.PENDING_APPROVAL if original_recommendation else AdvisoryStatus.DRAFT,
        original_recommendation=original_recommendation,
        recommendation_source=recommendation_source,
        note=NO_DOSE_NOTE,
    )
    return {
        "results": results,
        "abnormal_parameters": abnormal,
        "out_of_range_parameters": out_of_range,
        "summary": summary,
        "is_stale": is_stale,
        "verified": verified,
        "soil_risk_severity": soil_severity(results) if verified else None,
        "threshold_source": cfg["source"],
        "advisory": advisory,
    }
