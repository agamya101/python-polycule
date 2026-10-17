from app.schemas.risk import EvidenceLevel
from app.schemas.satellite import BaselineInfo, VegetationSummary
from app.services.evidence_engine import MetadataContext, compute_evidence
from app.utils.geo import WARNING_SMALL_FIELD

FULL_META = MetadataContext(crop_type="cotton", crop_stage="flowering", sowing_date="2026-06-25", has_geometry=True)


def veg(age=2, valid=92.0, n30=4, base_n=10, years=(2023, 2024, 2025)):
    return VegetationSummary(
        latest_usable_date="2026-10-15", latest_ndvi=0.55, latest_valid_pixel_pct=valid, observation_age_days=age,
        usable_observations_30d=n30, usable_observations_total=n30 + 2,
        ndvi_baseline=BaselineInfo(value=0.65, n_observations=base_n, years=list(years), method="day_of_year_window"),
        ndmi_baseline=BaselineInfo(method="unavailable"), ndvi_anomaly_pct=-15.4,
    )


def test_good_evidence():
    e = compute_evidence(veg(), FULL_META, weather_available=True)
    assert e.level == EvidenceLevel.GOOD and e.score >= 80
    assert "Recent satellite observation" in e.reasons


def test_stale_observation_reduces_quality():
    fresh = compute_evidence(veg(age=2), FULL_META, True)
    stale = compute_evidence(veg(age=25, n30=1), FULL_META, True)
    assert stale.score < fresh.score
    assert "STALE_OBSERVATION" in stale.warnings


def test_poor_evidence_warning():
    e = compute_evidence(None, MetadataContext(), weather_available=False)
    assert e.level == EvidenceLevel.POOR
    assert "POOR_EVIDENCE_QUALITY_RISK_CLASSIFICATION_UNRELIABLE" in e.warnings
    assert "NO_USABLE_SATELLITE_OBSERVATION" in e.warnings


def test_low_coverage_reduces_quality():
    hi = compute_evidence(veg(valid=95), FULL_META, True)
    lo = compute_evidence(veg(valid=45), FULL_META, True)
    assert lo.score < hi.score


def test_small_field_warning():
    meta = MetadataContext(crop_type="cotton", has_geometry=True, geometry_warnings=(WARNING_SMALL_FIELD,))
    e = compute_evidence(veg(), meta, True)
    assert WARNING_SMALL_FIELD in e.warnings


def test_evidence_is_not_called_confidence(client):
    body = client.get("/api/v1/demo/scenario").json()
    assert "confidence" not in str(body["assessment"]["evidence_quality"]).lower()
