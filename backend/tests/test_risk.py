from datetime import date

import pytest

from app.schemas.risk import RiskLevel
from app.schemas.satellite import BaselineInfo, VegetationSummary
from app.schemas.weather import WeatherFeatures
from app.services.risk_engine import compute_risk, vegetation_stress
from tests.conftest import obs_series


def veg(anomaly, ndmi_delta=None):
    return VegetationSummary(
        latest_usable_date="2026-10-15", latest_ndvi=0.6, latest_valid_pixel_pct=90, observation_age_days=2,
        usable_observations_30d=4, usable_observations_total=6,
        ndvi_baseline=BaselineInfo(value=0.6, n_observations=8, years=[2024, 2025], method="day_of_year_window"),
        ndmi_baseline=BaselineInfo(method="unavailable"), ndvi_anomaly_pct=anomaly, ndmi_delta_from_baseline=ndmi_delta,
    )


WEATHER = WeatherFeatures(as_of="2026-10-17", water_balance_14d_mm=-35.0, dry_spell_length_days=14, max_temperature_7d_c=38.5, heat_days_7d=3, rainfall_14d_mm=4.0)


def test_vegetation_stress_mapping():
    assert vegetation_stress(10.0) == 0.0
    assert vegetation_stress(0.0) == 0.0
    assert vegetation_stress(-15.0) == pytest.approx(0.5)
    assert vegetation_stress(-30.0) == pytest.approx(1.0)
    assert vegetation_stress(-60.0) == pytest.approx(1.0)
    assert vegetation_stress(None) is None


def test_positive_ndvi_anomaly_does_not_increase_risk():
    pos = compute_risk(veg(+25.0), WEATHER, evidence_score=90)
    zero = compute_risk(veg(0.0), WEATHER, evidence_score=90)
    v = next(c for c in pos.components if c.name == "vegetation")
    assert v.value == 0.0 and v.contribution == 0.0
    assert pos.score == zero.score


def test_negative_anomaly_increases_risk():
    low = compute_risk(veg(-5.0), WEATHER, evidence_score=90)
    high = compute_risk(veg(-25.0), WEATHER, evidence_score=90)
    assert high.score > low.score


def test_missing_satellite_is_not_zero_risk():
    r = compute_risk(None, WEATHER, evidence_score=90)
    v = next(c for c in r.components if c.name == "vegetation")
    assert v.available is False and v.value is None and v.contribution is None
    # Score is computed from the remaining evidence, not diluted by a zero vegetation term.
    assert r.provisional_score is not None and r.provisional_score > 0


def test_missing_soil_triggers_renormalisation():
    r = compute_risk(veg(-15.0), WEATHER, evidence_score=90)
    comps = {c.name: c for c in r.components}
    assert comps["soil"].available is False and comps["soil"].effective_weight == 0
    assert sum(c.effective_weight for c in r.components) == pytest.approx(1.0, abs=1e-3)
    assert comps["vegetation"].effective_weight == pytest.approx(0.4 / 0.9, abs=1e-3)
    assert r.available_weight_fraction == pytest.approx(0.9)


def test_unverified_soil_excluded_verified_included():
    unverified = compute_risk(veg(-15.0), WEATHER, soil_severity=0.7, soil_verified=False, evidence_score=90)
    verified = compute_risk(veg(-15.0), WEATHER, soil_severity=0.7, soil_verified=True, evidence_score=90)
    assert next(c for c in unverified.components if c.name == "soil").available is False
    assert next(c for c in verified.components if c.name == "soil").available is True


def test_poor_evidence_withholds_classification():
    r = compute_risk(veg(-25.0), WEATHER, evidence_score=20)
    assert r.level == RiskLevel.INSUFFICIENT_EVIDENCE
    assert r.score is None and r.provisional_score is not None and r.classification_withheld


def test_no_data_is_insufficient_not_low():
    r = compute_risk(None, None, evidence_score=0)
    assert r.level == RiskLevel.INSUFFICIENT_EVIDENCE
    assert r.score is None


def test_risk_bands():
    from app.utils.normalization import band_for
    from app.config import load_rules

    bands = load_rules("risk_config")["bands"]
    assert band_for(0, bands) == "LOW"
    assert band_for(24.9, bands) == "LOW"
    assert band_for(25, bands) == "MODERATE"
    assert band_for(50, bands) == "HIGH"
    assert band_for(75, bands) == "CRITICAL"
    assert band_for(100, bands) == "CRITICAL"


def test_method_is_heuristic(client):
    as_of = date(2026, 10, 15)
    r = client.post("/api/v1/risk/analyze", json={
        "location_id": "t-1", "as_of_date": as_of.isoformat(), "lat": 20.39, "lon": 78.12,
        "satellite_observations": obs_series(as_of, [0.65, 0.62, 0.58, 0.52]), "baseline_ndvi": 0.68, "baseline_observation_count": 9, "baseline_years": [2024, 2025],
        "crop": {"crop_type": "cotton", "crop_stage": "flowering"},
    })
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["risk"]["method"] == "heuristic_v1"
    assert body["risk"]["level"] in {"LOW", "MODERATE", "HIGH", "CRITICAL"}
    text = " ".join(body["reasoning"]["observed"] + body["reasoning"]["inferred"]).lower()
    for word in ("bollworm", "whitefly", "blight", "disease detected", "pest detected"):
        assert word not in text
