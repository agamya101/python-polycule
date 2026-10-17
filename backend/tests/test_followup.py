from app.schemas.common import VerificationStatus
from app.schemas.inspections import FollowUpEvaluateRequest, FollowUpObservationIn, FollowUpOutcome
from app.services.followup_engine import evaluate_followup


def req(points, status=None, start=0.50):
    return FollowUpEvaluateRequest(
        start_date="2026-09-01", ndvi_at_start=start, verification_status=status,
        observations=[FollowUpObservationIn(date=d, ndvi=n, valid_pixel_pct=v) for d, n, v in points],
    )


def test_one_improved_observation_does_not_close_case():
    r = evaluate_followup(req([("2026-09-06", 0.60, 90)]))
    assert r.outcome == FollowUpOutcome.INSUFFICIENT_DATA
    assert r.can_close_case is False
    assert any("not sufficient" in x for x in r.reasons)


def test_sustained_recovery():
    r = evaluate_followup(req([("2026-09-06", 0.54, 90), ("2026-09-14", 0.56, 88), ("2026-09-20", 0.58, 92)]))
    assert r.outcome == FollowUpOutcome.RECOVERING
    assert r.can_close_case is True


def test_recovery_with_two_obs_cannot_close_yet():
    r = evaluate_followup(req([("2026-09-06", 0.54, 90), ("2026-09-14", 0.57, 88)]))
    assert r.outcome == FollowUpOutcome.RECOVERING
    assert r.can_close_case is False


def test_deteriorating_escalates():
    r = evaluate_followup(req([("2026-09-06", 0.48, 90), ("2026-09-12", 0.45, 90)]))
    assert r.outcome == FollowUpOutcome.DETERIORATING and r.escalate


def test_low_quality_observations_ignored():
    r = evaluate_followup(req([("2026-09-06", 0.70, 10), ("2026-09-12", 0.71, 15)]))
    assert r.outcome == FollowUpOutcome.INSUFFICIENT_DATA and r.ignored_observations == 2


def test_resolved_but_worsening_needs_human():
    r = evaluate_followup(req([("2026-09-06", 0.46, 90), ("2026-09-12", 0.42, 90)], status=VerificationStatus.RESOLVED))
    assert r.outcome == FollowUpOutcome.HUMAN_VERIFICATION_REQUIRED


def test_contradictory_swings_need_human():
    r = evaluate_followup(req([("2026-09-06", 0.60, 90), ("2026-09-11", 0.42, 90), ("2026-09-16", 0.58, 90), ("2026-09-21", 0.51, 90)]))
    assert r.outcome == FollowUpOutcome.HUMAN_VERIFICATION_REQUIRED


def test_no_improvement_after_time_not_recovering():
    r = evaluate_followup(req([("2026-09-06", 0.50, 90), ("2026-09-15", 0.505, 90)]))
    assert r.outcome == FollowUpOutcome.NOT_RECOVERING


def test_irregular_spacing_supported():
    r = evaluate_followup(req([("2026-09-03", 0.54, 90), ("2026-09-25", 0.57, 90), ("2026-09-27", 0.58, 90)]))
    assert r.outcome == FollowUpOutcome.RECOVERING


def test_api_followup_persist_escalates_intervention(client):
    iv = client.post("/api/v1/interventions", json={"case_id": "c-fu", "priority": "P2_HIGH_PRIORITY"}).json()
    r = client.post("/api/v1/followups/evaluate", json={
        "intervention_id": iv["id"], "start_date": "2026-09-01", "ndvi_at_start": 0.5, "persist": True,
        "observations": [{"date": "2026-09-06", "ndvi": 0.46, "valid_pixel_pct": 90}, {"date": "2026-09-12", "ndvi": 0.43, "valid_pixel_pct": 90}],
    })
    assert r.status_code == 200 and r.json()["outcome"] == "DETERIORATING"
    ivs = {i["id"]: i for i in client.get("/api/v1/interventions").json()}
    assert ivs[iv["id"]]["status"] == "ESCALATED"
