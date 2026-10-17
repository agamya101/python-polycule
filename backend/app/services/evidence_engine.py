"""Evidence quality engine.

Scores how complete, recent and reliable the available evidence is (0-100).
This is NOT a model confidence and says nothing about whether a classification
is correct; it tells a reviewer how much to trust that the data is adequate.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.config import load_rules
from app.schemas.risk import EvidenceComponent, EvidenceLevel, EvidenceQuality
from app.schemas.satellite import VegetationSummary
from app.utils.geo import WARNING_SMALL_FIELD
from app.utils.normalization import band_for, clip01, linear_score


@dataclass
class MetadataContext:
    crop_type: str | None = None
    crop_stage: str | None = None
    sowing_date: str | None = None
    has_geometry: bool = False
    geometry_warnings: tuple[str, ...] = ()


def compute_evidence(veg: VegetationSummary | None, meta: MetadataContext, weather_available: bool, product: str | None = None) -> EvidenceQuality:
    """``product`` selects a freshness/observation-count profile (e.g. ``modis_mod13q1``)."""
    cfg = dict(load_rules("evidence_config"))
    if product:
        profile = cfg["product_profiles"][product]
        cfg["freshness"] = profile["freshness"]
        cfg["observation_count"] = profile["observation_count"]
    w = cfg["weights"]
    comps: list[EvidenceComponent] = []
    reasons: list[str] = []
    warnings: list[str] = []
    has_obs = veg is not None and veg.latest_ndvi is not None

    # 1. Usable-pixel coverage of the latest observation
    c = cfg["satellite_coverage"]
    if not has_obs:
        s, detail = 0.0, "No usable satellite observation."
        warnings.append("NO_USABLE_SATELLITE_OBSERVATION")
    elif veg.latest_valid_pixel_pct is None:
        s, detail = 0.3, "Usable-pixel percentage not reported for latest observation."
    else:
        s = linear_score(veg.latest_valid_pixel_pct, c["zero_score_valid_pct"], c["full_score_valid_pct"])
        detail = f"Latest observation has {veg.latest_valid_pixel_pct:.0f}% usable pixels."
    comps.append(EvidenceComponent(name="satellite_coverage", score=round(s, 3), weight=w["satellite_coverage"], detail=detail))
    if has_obs and s >= 0.8:
        reasons.append("High usable pixel coverage")
    elif has_obs and s < 0.4:
        reasons.append("Low usable pixel coverage (cloud/shadow or missing data)")

    # 2. Freshness
    f = cfg["freshness"]
    if not has_obs or veg.observation_age_days is None:
        s, detail = 0.0, "No dated observation."
    else:
        age = veg.observation_age_days
        s = 1.0 if age <= f["full_score_max_age_days"] else linear_score(age, f["zero_score_age_days"], f["full_score_max_age_days"])
        detail = f"Latest usable observation is {age} days old."
        if age <= f["full_score_max_age_days"]:
            reasons.append("Recent satellite observation")
        elif age > f["stale_after_days"]:
            reasons.append(f"Stale satellite observation ({age} days old)")
            warnings.append("STALE_OBSERVATION")
    comps.append(EvidenceComponent(name="freshness", score=round(s, 3), weight=w["freshness"], detail=detail))

    # 3. Number of valid recent observations
    oc = cfg["observation_count"]
    n = veg.usable_observations_30d if veg else 0
    s = clip01(n / oc["full_score_count"])
    comps.append(EvidenceComponent(name="observation_count", score=round(s, 3), weight=w["observation_count"], detail=f"{n} usable observation(s) in the last {veg.recent_window_days if veg else oc['window_days']} days."))
    if n >= oc["full_score_count"]:
        reasons.append("Multiple recent valid observations")
    elif has_obs and n <= 1:
        reasons.append("Only one recent valid observation; trend cannot be assessed")

    # 4. Baseline reliability
    br = cfg["baseline_reliability"]
    base = veg.ndvi_baseline if veg else None
    if base is None or base.value is None:
        s, detail = 0.0, "No seasonal baseline available."
        if has_obs:
            reasons.append("No historical baseline; anomaly cannot be computed")
    elif base.method == "supplied" and base.n_observations == 0:
        s, detail = 0.5, "Baseline supplied externally; its reliability is not known to this service."
    else:
        s = 0.5 * clip01(base.n_observations / br["full_score_observations"]) + 0.5 * clip01(len(base.years) / br["full_score_years"])
        detail = f"Baseline from {base.n_observations} observation(s) across {len(base.years)} season(s) ({base.method})."
        reasons.append("Historical baseline available" if s >= 0.6 else "Thin historical baseline")
    comps.append(EvidenceComponent(name="baseline_reliability", score=round(s, 3), weight=w["baseline_reliability"], detail=detail))

    # 5. Field / crop metadata quality
    items = {
        "crop type": meta.crop_type is not None,
        "sowing date or crop stage": meta.sowing_date is not None or meta.crop_stage is not None,
        "field boundary of adequate size": meta.has_geometry and WARNING_SMALL_FIELD not in meta.geometry_warnings,
    }
    s = sum(items.values()) / len(items)
    present = [k for k, v in items.items() if v]
    missing = [k for k, v in items.items() if not v]
    detail = f"Present: {', '.join(present) or 'none'}. Missing: {', '.join(missing) or 'none'}."
    comps.append(EvidenceComponent(name="metadata_quality", score=round(s, 3), weight=w["metadata_quality"], detail=detail))
    if WARNING_SMALL_FIELD in meta.geometry_warnings:
        warnings.append(WARNING_SMALL_FIELD)
        reasons.append("Field is small relative to 10 m satellite pixels")
    if meta.crop_type is None:
        reasons.append("Crop type unknown; baseline is not crop-specific")

    if not weather_available:
        warnings.append("WEATHER_DATA_UNAVAILABLE")

    total_w = sum(x.weight for x in comps)
    score = round(100 * sum(x.score * x.weight for x in comps) / total_w, 1)
    level = EvidenceLevel(band_for(score, cfg["bands"]))
    if level == EvidenceLevel.POOR:
        warnings.append("POOR_EVIDENCE_QUALITY_RISK_CLASSIFICATION_UNRELIABLE")
    return EvidenceQuality(score=score, level=level, components=comps, reasons=reasons, warnings=warnings)
