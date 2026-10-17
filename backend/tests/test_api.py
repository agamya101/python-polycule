from datetime import date

from app.providers.sentinel_hub import SentinelHubProvider, parse_statistics
from tests.conftest import SQUARE, obs_series


def test_health_and_docs(client):
    assert client.get("/health").json()["status"] == "ok"
    assert client.get("/docs").status_code == 200
    spec = client.get("/openapi.json").json()
    for path in ["/health", "/api/v1/model/status", "/api/v1/risk/analyze", "/api/v1/weather/history", "/api/v1/weather/forecast",
                 "/api/v1/satellite/field/stats", "/api/v1/soil/interpret", "/api/v1/interventions/prioritize", "/api/v1/inspections",
                 "/api/v1/followups/evaluate", "/api/v1/demo/scenario"]:
        assert path in spec["paths"], path


def test_model_status_without_artifact(client):
    s = client.get("/api/v1/model/status").json()
    assert s["available"] is False and s["enabled"] is False and s["validated"] is False and s["model_version"] is None
    assert "No validated model artifact" in s["reason"]


def test_no_ml_probability_without_model(client):
    as_of = date(2026, 10, 15)
    r = client.post("/api/v1/risk/analyze", json={"location_id": "m", "as_of_date": as_of.isoformat(), "lat": 20.4, "lon": 78.1,
                                                  "satellite_observations": obs_series(as_of, [0.6, 0.55]), "baseline_ndvi": 0.65})
    p = r.json()["prediction"]
    assert p["status"] == "MODEL_NOT_AVAILABLE" and p["probability"] is None
    p2 = client.post("/api/v1/model/predict", json={"features": {"ndvi_current": 0.5}}).json()
    assert p2["status"] == "MODEL_NOT_AVAILABLE" and p2["probability"] is None


def _walk(obj):
    if isinstance(obj, dict):
        yield obj
        for v in obj.values():
            yield from _walk(v)
    elif isinstance(obj, list):
        for v in obj:
            yield from _walk(v)


def test_demo_records_always_flagged(client):
    body = client.get("/api/v1/demo/scenario").json()
    assert body["demo"] is True and body["is_demo"] is True and body["assessment"]["demo"] is True
    for prov in body["provenance"]:
        assert prov["is_demo"] is True
    for d in _walk(body):
        if "source_type" in d and d["source_type"] in ("DEMO",):
            assert d.get("is_demo", True) is True
        if d.get("source_type") == "OBSERVED":
            raise AssertionError(f"Demo scenario contains an OBSERVED record: {d}")
    assert body["assessment"]["prediction"]["probability"] is None


def test_demo_fixture_blocked_on_analyze_by_default(client):
    r = client.post("/api/v1/risk/analyze", json={"location_id": "d", "demo_fixture_id": "yavatmal_demo"})
    assert r.status_code == 403 and r.json()["status"] == "DEMO_DATA_DISABLED"


def test_supplied_demo_observations_mark_result_demo(client):
    as_of = date(2026, 10, 15)
    obs = [o | {"source_type": "DEMO"} for o in obs_series(as_of, [0.6, 0.58, 0.55])]
    r = client.post("/api/v1/risk/analyze", json={"location_id": "sd", "as_of_date": as_of.isoformat(), "satellite_observations": obs, "baseline_ndvi": 0.65})
    body = r.json()
    assert body["demo"] is True
    sat = [p for p in body["provenance"] if p["source"] == "client_supplied_satellite"][0]
    assert sat["source_type"] == "DEMO" and sat["is_demo"] is True


def test_invalid_coordinates_rejected(client):
    r = client.post("/api/v1/risk/analyze", json={"location_id": "x", "lat": 120.0, "lon": 78.0})
    assert r.status_code == 422 and r.json()["status"] == "INVALID_COORDINATES"
    r = client.get("/api/v1/weather/history", params={"lat": 20.0, "lon": 200.0})
    assert r.status_code == 422 and r.json()["status"] == "INVALID_COORDINATES"
    r = client.post("/api/v1/risk/analyze", json={"location_id": "x", "lat": 20.0})
    assert r.status_code == 422


def test_invalid_polygons_rejected(client):
    bad = [
        {"type": "Polygon", "coordinates": [[[78.1, 20.3], [78.2, 20.3], [78.2, 20.4], [78.1, 20.4]]]},  # not closed
        {"type": "Polygon", "coordinates": [[[78.1, 20.3], [78.2, 20.3], [78.1, 20.3]]]},  # too few vertices
        {"type": "Polygon", "coordinates": [[[78.1, 20.3], [78.2, 20.3], [78.3, 20.3], [78.1, 20.3]]]},  # zero area (collinear)
        {"type": "Polygon", "coordinates": [[[278.1, 20.3], [78.2, 20.3], [78.2, 20.4], [278.1, 20.3]]]},  # out of bounds
        {"type": "Point", "coordinates": [78.1, 20.3]},
    ]
    for g in bad:
        r = client.post("/api/v1/satellite/field/stats", json={"geometry": g})
        assert r.status_code == 422, g
        assert r.json()["status"] == "INVALID_FIELD_GEOMETRY", r.json()


def test_small_field_warning_on_register(client):
    tiny = {"type": "Polygon", "coordinates": [[[78.1, 20.3], [78.10005, 20.3], [78.10005, 20.30005], [78.1, 20.30005], [78.1, 20.3]]]}
    r = client.post("/api/v1/fields", json={"geometry": tiny})
    assert r.status_code == 200
    assert "FIELD_SIZE_MAY_LIMIT_SATELLITE_RELIABILITY" in r.json()["warnings"]


def test_satellite_not_configured(client):
    r = client.post("/api/v1/satellite/field/stats", json={"geometry": SQUARE})
    assert r.status_code == 503
    assert r.json()["status"] == "SATELLITE_PROVIDER_NOT_CONFIGURED"


def test_risk_with_geometry_but_no_satellite_credentials_is_not_low(client):
    r = client.post("/api/v1/risk/analyze", json={"location_id": "g", "geometry": SQUARE, "persist": False})
    body = r.json()
    assert r.status_code == 200
    assert body["risk"]["level"] == "INSUFFICIENT_EVIDENCE"
    assert any("SATELLITE_PROVIDER_NOT_CONFIGURED" in w for w in body["warnings"])
    assert body["observations"]["vegetation"] is None


def test_sentinel_statistics_parsing():
    payload = {"data": [
        {"interval": {"from": "2026-09-28T00:00:00Z"}, "outputs": {
            "ndvi": {"bands": {"B0": {"stats": {"mean": 0.52, "sampleCount": 200, "noDataCount": 18}}}},
            "ndmi": {"bands": {"B0": {"stats": {"mean": 0.13, "sampleCount": 200, "noDataCount": 18}}}}}},
        {"interval": {"from": "2026-09-23T00:00:00Z"}, "outputs": {
            "ndvi": {"bands": {"B0": {"stats": {"mean": "NaN", "sampleCount": 200, "noDataCount": 200}}}}}},
    ]}
    obs = parse_statistics(payload)
    assert [o.date for o in obs] == ["2026-09-23", "2026-09-28"]
    assert obs[0].ndvi is None and obs[0].valid_pixel_pct == 0.0
    assert obs[1].ndvi == 0.52 and obs[1].valid_pixel_pct == 91.0 and obs[1].source_type.value == "OBSERVED"
    req = SentinelHubProvider().build_request(SQUARE, date(2026, 9, 1), date(2026, 9, 30))
    assert "B11" in req["aggregation"]["evalscript"] and req["input"]["data"][0]["processing"]["upsampling"] == "BILINEAR"


def test_prioritisation_verify_first_and_ordering(client):
    cases = [
        {"case_id": "low", "risk_score": 15, "evidence_quality_score": 85},
        {"case_id": "high-weak", "risk_score": 78, "evidence_quality_score": 25},
        {"case_id": "high-strong", "risk_score": 80, "evidence_quality_score": 88, "deteriorating": True, "crop_stage": "Flowering", "affected_farmers": 40},
        {"case_id": "resolved", "risk_score": 70, "evidence_quality_score": 90, "verification_status": "RESOLVED"},
    ]
    r = client.post("/api/v1/interventions/prioritize", json={"cases": cases, "persist": True})
    ranked = {c["case_id"]: c for c in r.json()["ranked"]}
    assert ranked["high-weak"]["priority"] == "VERIFY_FIRST"
    assert ranked["high-strong"]["priority"] == "P1_IMMEDIATE_REVIEW" and ranked["high-strong"]["rank"] == 1
    assert ranked["resolved"]["priority"] == "NO_ACTION" and ranked["resolved"]["intervention_id"] is None
    assert ranked["high-strong"]["factors"] and ranked["high-weak"]["intervention_id"]
    assert "not a machine-learning model" in r.json()["note"]


def test_inspection_workflow_and_metrics(client):
    iv = client.post("/api/v1/interventions", json={"case_id": "c-insp", "priority": "P1_IMMEDIATE_REVIEW"}).json()
    r = client.post("/api/v1/inspections", json={
        "intervention_id": iv["id"], "field_id": "fld-1", "inspection_date": "2026-10-16", "inspector": "FW-07",
        "observed_condition": "Leaf wilting in patches", "possible_cause": "Moisture stress suspected", "verification_status": "VISITED",
    })
    assert r.status_code == 200, r.text
    insp = r.json()
    bad = client.post("/api/v1/inspections", json={"field_id": "f", "inspection_date": "2026-10-16", "inspector": "x",
                                                   "observed_condition": "y", "confirmed_cause": "z", "verification_status": "VISITED"})
    assert bad.status_code == 422
    u = client.patch(f"/api/v1/inspections/{insp['id']}/status", json={"verification_status": "CONFIRMED", "confirmed_cause": "Moisture stress (soil dry at 15 cm)"})
    assert u.status_code == 200 and u.json()["verification_status"] == "CONFIRMED"
    events = client.get("/api/v1/audit", params={"entity_id": insp["id"]}).json()
    change = [e for e in events if e["action"] == "STATUS_CHANGED"][0]
    assert change["previous_state"]["verification_status"] == "VISITED" and change["new_state"]["verification_status"] == "CONFIRMED"
    m = client.get("/api/v1/metrics/operations").json()
    assert m["median_alert_to_review_hours"] is not None
    assert "yield" not in str({k: v for k, v in m.items() if k != "notes"}).lower()


def test_intervention_invalid_transition(client):
    iv = client.post("/api/v1/interventions", json={"case_id": "c-t", "priority": "P3_MONITOR"}).json()
    r = client.patch(f"/api/v1/interventions/{iv['id']}/status", json={"status": "CLOSED"})
    assert r.status_code == 409 and r.json()["status"] == "INVALID_STATE_TRANSITION"


def test_assessment_persisted_with_audit(client):
    as_of = date(2026, 10, 15)
    r = client.post("/api/v1/risk/analyze", json={"location_id": "persist-1", "as_of_date": as_of.isoformat(), "lat": 20.4, "lon": 78.1,
                                                  "satellite_observations": obs_series(as_of, [0.6, 0.57, 0.55]), "baseline_ndvi": 0.65})
    aid = r.json()["assessment_id"]
    assert aid
    stored = client.get(f"/api/v1/risk/assessments/{aid}").json()
    assert stored["assessment_id"] == aid
    assert client.get("/api/v1/audit", params={"entity_type": "RiskAssessment", "entity_id": aid}).json()[0]["action"] == "CREATED"
