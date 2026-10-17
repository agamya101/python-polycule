"""Transparent heuristic risk engine (``heuristic_v1``).

This is NOT a machine-learning model. It combines up to four normalised stress
components with configurable weights:

    V  vegetation stress  (negative NDVI anomaly vs seasonal baseline)
    W  water stress       (environmental water balance, dry spell, NDMI drop)
    H  heat stress        (7-day maximum temperature, heat days)
    S  soil constraint    (only from a verified Soil Health Card record)

Weights are renormalised over the components that have data. Missing data is
never treated as zero risk: an absent component is excluded (not scored 0) and
classification is withheld (``INSUFFICIENT_EVIDENCE``) when too little evidence
remains. All coefficients are MVP heuristics documented in
``app/rules/risk_config.json``.
"""

from __future__ import annotations

from app.config import load_rules
from app.schemas.risk import RiskBlock, RiskComponent, RiskLevel
from app.schemas.satellite import VegetationSummary
from app.schemas.weather import WeatherFeatures
from app.utils.normalization import band_for, clip01, linear_score


def vegetation_stress(ndvi_anomaly_pct: float | None, full_stress_pct: float | None = None) -> float | None:
    """clip(-anomaly / full_stress_pct, 0, 1). Positive anomalies give zero stress."""
    if ndvi_anomaly_pct is None:
        return None
    full = full_stress_pct or float(load_rules("risk_config")["vegetation"]["full_stress_anomaly_pct"])
    return clip01(-ndvi_anomaly_pct / full)


def _vegetation(veg: VegetationSummary | None, cfg: dict) -> RiskComponent:
    w = cfg["weights"]["vegetation"]
    anomaly = veg.ndvi_anomaly_pct if veg else None
    value = vegetation_stress(anomaly, cfg["vegetation"]["full_stress_anomaly_pct"])
    if value is None:
        reason = "No usable satellite observation." if not veg or veg.latest_ndvi is None else "No reliable seasonal baseline for an anomaly."
        return RiskComponent(name="vegetation", available=False, nominal_weight=w, effective_weight=0.0, reason=reason)
    return RiskComponent(
        name="vegetation",
        available=True,
        value=round(value, 4),
        nominal_weight=w,
        effective_weight=0.0,
        inputs={
            "ndvi_anomaly_pct": anomaly,
            "latest_ndvi": veg.latest_ndvi,
            "baseline_ndvi": veg.ndvi_baseline.value,
            "full_stress_anomaly_pct": cfg["vegetation"]["full_stress_anomaly_pct"],
        },
        reason="Positive or zero anomaly contributes no stress." if value == 0 else None,
    )


def _water(veg: VegetationSummary | None, wf: WeatherFeatures | None, cfg: dict) -> RiskComponent:
    c = cfg["water"]
    w = cfg["weights"]["water"]
    subs: dict[str, float] = {}
    inputs: dict[str, float | int | None] = {}
    seasonal = c.get("seasonal", {})
    basis = "absolute_thresholds"
    if wf is not None and wf.water_balance_14d_anomaly_mm is not None and len(wf.climatology_years) >= seasonal.get("min_climatology_years", 3):
        basis = "seasonal_anomaly"
        subs["water_balance"] = linear_score(wf.water_balance_14d_anomaly_mm, seasonal["water_balance_anomaly_zero_stress_mm"],
                                             seasonal["water_balance_anomaly_full_stress_mm"])
        inputs.update(water_balance_14d_mm=wf.water_balance_14d_mm, water_balance_14d_climatology_mm=wf.water_balance_14d_climatology_mm,
                      water_balance_14d_anomaly_mm=wf.water_balance_14d_anomaly_mm)
        if wf.dry_spell_length_days is not None and wf.dry_spell_climatology_days is not None:
            excess = wf.dry_spell_length_days - wf.dry_spell_climatology_days
            subs["dry_spell"] = linear_score(excess, seasonal["dry_spell_excess_zero_stress_days"], seasonal["dry_spell_excess_full_stress_days"])
            inputs.update(dry_spell_length_days=wf.dry_spell_length_days, dry_spell_climatology_days=wf.dry_spell_climatology_days)
    else:
        if wf is not None and wf.water_balance_14d_mm is not None:
            subs["water_balance"] = linear_score(wf.water_balance_14d_mm, c["water_balance_zero_stress_mm"], c["water_balance_full_stress_mm"])
            inputs["water_balance_14d_mm"] = wf.water_balance_14d_mm
        if wf is not None and wf.dry_spell_length_days is not None:
            subs["dry_spell"] = linear_score(wf.dry_spell_length_days, c["dry_spell_zero_stress_days"], c["dry_spell_full_stress_days"])
            inputs["dry_spell_length_days"] = wf.dry_spell_length_days
    if veg is not None and veg.ndmi_delta_from_baseline is not None:
        subs["ndmi_drop"] = clip01(-veg.ndmi_delta_from_baseline / c["ndmi_full_stress_drop"])
        inputs["ndmi_delta_from_baseline"] = veg.ndmi_delta_from_baseline
    if not subs:
        return RiskComponent(name="water", available=False, nominal_weight=w, effective_weight=0.0, reason="No water-balance, dry-spell or NDMI data.")
    driver = max(subs, key=subs.get)  # type: ignore[arg-type]
    return RiskComponent(
        name="water",
        available=True,
        value=round(max(subs.values()), 4),
        nominal_weight=w,
        effective_weight=0.0,
        inputs=inputs | {"sub_scores": {k: round(v, 4) for k, v in subs.items()}, "driver": driver, "basis": basis},
        reason=("Maximum of available water sub-signals"
                + (", scored relative to the past-only seasonal norm for this location and date" if basis == "seasonal_anomaly"
                   else ", absolute thresholds (no seasonal norm available)")
                + ". Water balance is an environmental indicator, not measured plant water stress."),
    )


def _heat(wf: WeatherFeatures | None, cfg: dict) -> RiskComponent:
    c = cfg["heat"]
    w = cfg["weights"]["heat"]
    subs: dict[str, float] = {}
    inputs: dict[str, float | int | None] = {}
    if wf is not None and wf.max_temperature_7d_c is not None:
        subs["max_temperature"] = linear_score(wf.max_temperature_7d_c, c["tmax_zero_stress_c"], c["tmax_full_stress_c"])
        inputs["max_temperature_7d_c"] = wf.max_temperature_7d_c
    if wf is not None and wf.heat_days_7d is not None:
        subs["heat_days"] = linear_score(wf.heat_days_7d, 0, c["heat_days_full_stress"])
        inputs["heat_days_7d"] = wf.heat_days_7d
    if not subs:
        return RiskComponent(name="heat", available=False, nominal_weight=w, effective_weight=0.0, reason="No temperature data.")
    return RiskComponent(
        name="heat",
        available=True,
        value=round(max(subs.values()), 4),
        nominal_weight=w,
        effective_weight=0.0,
        inputs=inputs | {"sub_scores": {k: round(v, 4) for k, v in subs.items()}},
    )


def _soil(soil_severity: float | None, soil_verified: bool, cfg: dict) -> RiskComponent:
    w = cfg["weights"]["soil"]
    if soil_severity is None:
        return RiskComponent(name="soil", available=False, nominal_weight=w, effective_weight=0.0, reason="No soil record supplied.")
    if not soil_verified:
        return RiskComponent(
            name="soil",
            available=False,
            nominal_weight=w,
            effective_weight=0.0,
            reason="Soil values are not from a verified Soil Health Card; excluded from score.",
        )
    return RiskComponent(name="soil", available=True, value=round(clip01(soil_severity), 4), nominal_weight=w, effective_weight=0.0, inputs={"soil_severity": soil_severity})


def compute_risk(
    vegetation: VegetationSummary | None,
    weather: WeatherFeatures | None,
    *,
    soil_severity: float | None = None,
    soil_verified: bool = False,
    evidence_score: float,
) -> RiskBlock:
    cfg = load_rules("risk_config")
    components = [
        _vegetation(vegetation, cfg),
        _water(vegetation, weather, cfg),
        _heat(weather, cfg),
        _soil(soil_severity, soil_verified, cfg),
    ]
    total_nominal = sum(c.nominal_weight for c in components)
    available = [c for c in components if c.available]
    avail_weight = sum(c.nominal_weight for c in available)
    fraction = round(avail_weight / total_nominal, 4) if total_nominal else 0.0

    notes = [
        "heuristic_v1: transparent weighted rule-based score; not a trained or validated model.",
    ]
    provisional = None
    if available and avail_weight > 0:
        score = 0.0
        for c in available:
            c.effective_weight = round(c.nominal_weight / avail_weight, 4)
            c.contribution = round(100 * c.effective_weight * (c.value or 0.0), 2)
            score += c.contribution
        provisional = round(min(100.0, score), 1)
        missing = [c.name for c in components if not c.available]
        if missing:
            notes.append(f"Weights renormalised over available components; missing: {', '.join(missing)}.")

    ie = cfg["insufficient_evidence"]
    names = {c.name for c in available}
    withhold_reasons = []
    if not available:
        withhold_reasons.append("no risk component has data")
    if evidence_score < ie["min_evidence_score"]:
        withhold_reasons.append(f"evidence quality {evidence_score:.0f} is below {ie['min_evidence_score']}")
    if fraction < ie["min_available_weight_fraction"]:
        withhold_reasons.append(f"only {fraction:.0%} of nominal weight is backed by data")
    if ie.get("require_vegetation_or_water") and not ({"vegetation", "water"} & names):
        withhold_reasons.append("neither vegetation nor water evidence is available")

    if withhold_reasons:
        notes.append("Classification withheld: " + "; ".join(withhold_reasons) + ". Missing evidence does not imply low risk.")
        return RiskBlock(
            score=None,
            provisional_score=provisional,
            level=RiskLevel.INSUFFICIENT_EVIDENCE,
            components=components,
            available_weight_fraction=fraction,
            classification_withheld=True,
            notes=notes,
        )

    assert provisional is not None
    return RiskBlock(
        score=provisional,
        provisional_score=provisional,
        level=RiskLevel(band_for(provisional, cfg["bands"])),
        components=components,
        available_weight_fraction=fraction,
        notes=notes,
    )
