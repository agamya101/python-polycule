"""Deterministic explanation engine.

Produces an Observed / Inference / Not confirmed / Recommended reasoning chain
from the computed components. It never names a pest or disease: satellite and
weather signals can show that vegetation is below its seasonal baseline, not
why. A cause is only reported when it comes from a confirmed field inspection.
"""

from __future__ import annotations

from app.schemas.risk import EvidenceLevel, EvidenceQuality, NextStep, Reasoning, RiskBlock, RiskLevel
from app.schemas.satellite import VegetationSummary
from app.schemas.weather import WeatherFeatures


def _component(risk: RiskBlock, name: str):
    return next((c for c in risk.components if c.name == name), None)


def build_explanation(
    risk: RiskBlock,
    evidence: EvidenceQuality,
    veg: VegetationSummary | None,
    weather: WeatherFeatures | None,
    soil_summary: dict | None = None,
    confirmed_cause: str | None = None,
) -> tuple[list[str], Reasoning, NextStep]:
    observed: list[str] = []
    inferred: list[str] = []
    factors: list[str] = []

    # ---------------------------------------------------------------- observed
    if veg and veg.latest_ndvi is not None:
        if veg.ndvi_anomaly_pct is not None:
            direction = "below" if veg.ndvi_anomaly_pct < 0 else "above"
            observed.append(
                f"NDVI is {abs(veg.ndvi_anomaly_pct):.1f}% {direction} its seasonal baseline "
                f"({veg.latest_ndvi:.2f} vs {veg.ndvi_baseline.value:.2f})."
            )
        else:
            observed.append(f"Latest NDVI is {veg.latest_ndvi:.2f}; no reliable seasonal baseline is available for comparison.")
        if veg.observation_age_days is not None:
            observed.append(f"Latest usable satellite observation is {veg.observation_age_days} day(s) old ({veg.latest_usable_date}).")
        if veg.ndvi_trend_per_10d is not None:
            observed.append(f"NDVI trend over recent usable observations: {veg.ndvi_trend_per_10d:+.3f} per 10 days.")
        if veg.ndmi_delta_from_baseline is not None:
            observed.append(f"NDMI differs from its seasonal baseline by {veg.ndmi_delta_from_baseline:+.3f}.")
    else:
        observed.append("No usable satellite observation was available for this assessment.")

    if weather is not None:
        if weather.rainfall_14d_mm is not None:
            observed.append(f"Rainfall in the previous 14 days: {weather.rainfall_14d_mm:.1f} mm.")
        if weather.water_balance_14d_mm is not None:
            observed.append(f"14-day water balance (rainfall minus reference ET0): {weather.water_balance_14d_mm:+.1f} mm.")
            if weather.water_balance_14d_anomaly_mm is not None:
                rel = "drier" if weather.water_balance_14d_anomaly_mm < 0 else "wetter"
                observed.append(f"That is {abs(weather.water_balance_14d_anomaly_mm):.1f} mm {rel} than the seasonal norm for this date "
                                f"({weather.water_balance_14d_climatology_mm:+.1f} mm; prior years {weather.climatology_years[0]}-{weather.climatology_years[-1]}).")
        if weather.dry_spell_length_days is not None and weather.dry_spell_length_days > 0:
            norm = f" (seasonal norm about {weather.dry_spell_climatology_days:.0f} days)" if weather.dry_spell_climatology_days is not None else ""
            observed.append(f"Current dry spell: {weather.dry_spell_length_days} consecutive day(s) below {weather.thresholds.get('dry_day_precip_mm', 2.5)} mm{norm}.")
        if weather.max_temperature_7d_c is not None:
            observed.append(f"Maximum temperature in the last 7 days: {weather.max_temperature_7d_c:.1f} °C ({weather.heat_days_7d} day(s) at or above {weather.thresholds.get('heat_day_tmax_c', 35)} °C).")
    else:
        observed.append("Weather data was not available for this assessment.")

    if soil_summary and soil_summary.get("abnormal_parameters"):
        observed.append(f"Soil Health Card values outside configured normal ranges: {', '.join(soil_summary['abnormal_parameters'])}.")

    # ---------------------------------------------------------------- inferred
    v = _component(risk, "vegetation")
    if v and v.available and (v.value or 0) >= 0.3:
        inferred.append("Vegetation stress signal detected: canopy condition is below its recent seasonal baseline.")
        factors.append("negative vegetation anomaly")
    elif v and v.available:
        inferred.append("No substantial negative vegetation anomaly relative to the seasonal baseline.")
    if veg and veg.ndvi_trend_per_10d is not None and veg.ndvi_trend_per_10d < -0.02:
        inferred.append("Vegetation condition has been declining across recent observations.")
        factors.append("declining vegetation trend")

    wc = _component(risk, "water")
    if wc and wc.available and (wc.value or 0) >= 0.4:
        inferred.append("Moisture stress may be contributing (environmental water-balance / dry-spell indicators).")
        driver = (wc.inputs or {}).get("driver")
        factors.append({"water_balance": "negative environmental water balance", "dry_spell": "extended dry spell", "ndmi_drop": "reduced vegetation moisture index (NDMI)"}.get(driver, "moisture deficit indicators"))
    hc = _component(risk, "heat")
    if hc and hc.available and (hc.value or 0) >= 0.4:
        inferred.append("Recent high temperatures may be adding heat stress.")
        factors.append("recent heat stress")
    sc = _component(risk, "soil")
    if sc and sc.available and (sc.value or 0) >= 0.3:
        inferred.append("Verified soil constraints may limit crop resilience.")
        factors.append("verified soil constraint")

    if risk.classification_withheld:
        inferred.append("Risk classification withheld because the available evidence is insufficient. This is not an indication of low risk.")

    # ----------------------------------------------------------- not confirmed
    if confirmed_cause:
        not_confirmed = [f"Cause confirmed by field verification: {confirmed_cause}. Other contributing factors remain unconfirmed."]
    else:
        not_confirmed = [
            "Cause of any vegetation change.",
            "Pest or disease presence (cannot be determined from satellite or weather data).",
            "Actual crop water status in the field.",
        ]

    # ------------------------------------------------------------- next step
    score = risk.provisional_score or 0.0
    if risk.level == RiskLevel.INSUFFICIENT_EVIDENCE:
        step = NextStep.FIELD_VERIFICATION if score >= 50 else NextStep.IMPROVE_EVIDENCE
    elif risk.level == RiskLevel.CRITICAL:
        step = NextStep.URGENT_FIELD_REVIEW if evidence.level in (EvidenceLevel.MODERATE, EvidenceLevel.GOOD) else NextStep.FIELD_VERIFICATION
    elif risk.level == RiskLevel.HIGH:
        step = NextStep.FIELD_VERIFICATION
    elif risk.level == RiskLevel.MODERATE:
        step = NextStep.MONITOR
    else:
        step = NextStep.ROUTINE_MONITORING

    recommended = {
        NextStep.URGENT_FIELD_REVIEW: [
            "Prioritise a field visit to registered fields in this area.",
            "Record findings as a field inspection so the case can be confirmed or closed.",
        ],
        NextStep.FIELD_VERIFICATION: [
            "Review registered high-risk fields.",
            "Conduct field verification before any treatment decision.",
        ],
        NextStep.IMPROVE_EVIDENCE: [
            "Wait for the next cloud-free satellite observation or add field metadata (crop, sowing date, boundary).",
            "Do not treat this location as low risk in the meantime.",
        ],
        NextStep.MONITOR: [
            "Continue monitoring at the next usable observation.",
            "Conduct field verification if deterioration continues.",
        ],
        NextStep.ROUTINE_MONITORING: ["Continue routine monitoring."],
    }[step]

    return factors, Reasoning(observed=observed, inferred=inferred, not_confirmed=not_confirmed, recommended=recommended), step
