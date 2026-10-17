from app.schemas.soil import SoilParameters, SoilStatus
from app.services.soil_engine import interpret_soil

GOOD = dict(pH=7.0, EC=0.4, OC=0.6, N=300, P=15, K=200, S=12, Zn=0.8, Fe=5.0, Cu=0.5, Mn=3.0, B=0.6)


def statuses(result):
    return {r.parameter: r.status for r in result["results"]}


def test_all_normal():
    r = interpret_soil(SoilParameters(**GOOD))
    assert set(statuses(r).values()) == {SoilStatus.NORMAL}
    assert r["abnormal_parameters"] == []


def test_low_and_high_classification():
    r = interpret_soil(SoilParameters(**(GOOD | {"pH": 8.6, "OC": 0.3, "N": 200, "K": 400, "Zn": 0.4})))
    s = statuses(r)
    assert s["pH"] == SoilStatus.HIGH and s["OC"] == SoilStatus.LOW and s["N"] == SoilStatus.LOW and s["K"] == SoilStatus.HIGH and s["Zn"] == SoilStatus.LOW


def test_out_of_range_flagged():
    r = interpret_soil(SoilParameters(**(GOOD | {"pH": 14.2, "N": -5, "B": 120})))
    s = statuses(r)
    assert s["pH"] == SoilStatus.OUT_OF_RANGE and s["N"] == SoilStatus.OUT_OF_RANGE and s["B"] == SoilStatus.OUT_OF_RANGE
    assert set(r["out_of_range_parameters"]) == {"pH", "N", "B"}
    assert any("data-entry or unit error" in line for line in r["summary"])


def test_missing_values_unknown():
    r = interpret_soil(SoilParameters(pH=7.0))
    s = statuses(r)
    assert s["pH"] == SoilStatus.NORMAL and s["N"] == SoilStatus.UNKNOWN


def test_no_fertiliser_doses_generated():
    r = interpret_soil(SoilParameters(**(GOOD | {"N": 150, "P": 5, "K": 80})))
    text = " ".join(x.interpretation for x in r["results"]) + " ".join(r["summary"])
    for word in ("bag", "urea", "dap", "kg/acre", "apply"):
        assert word not in text.lower()
    assert "does not calculate fertiliser doses" in r["advisory"].note


def test_unverified_soil_has_no_risk_severity():
    assert interpret_soil(SoilParameters(**GOOD), verified=False)["soil_risk_severity"] is None
    assert interpret_soil(SoilParameters(**(GOOD | {"EC": 3.0})), verified=True)["soil_risk_severity"] == 0.7


def test_staleness():
    r = interpret_soil(SoilParameters(**GOOD), sampling_date="2022-01-01")
    assert r["is_stale"] is True


def test_api_interpret_and_approval_flow(client):
    r = client.post("/api/v1/soil/interpret", json={
        "values": GOOD | {"OC": 0.3}, "farmer_id": "farmer-x", "verified": True, "persist": True,
        "original_recommendation": "As printed on card", "recommendation_source": "Soil Health Card",
    })
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["advisory"]["status"] == "PENDING_APPROVAL"
    rid = body["record_id"]
    a = client.post(f"/api/v1/soil/records/{rid}/approval", json={"approver": "Agronomist A", "decision": "APPROVE"})
    assert a.status_code == 200 and a.json()["advisory_status"] == "APPROVED"
    again = client.post(f"/api/v1/soil/records/{rid}/approval", json={"approver": "Agronomist A", "decision": "APPROVE"})
    assert again.status_code == 409
    audit = client.get("/api/v1/audit", params={"entity_id": rid}).json()
    assert {e["action"] for e in audit} >= {"CREATED", "ADVISORY_APPROVED"}


def test_api_cannot_approve_without_source_recommendation(client):
    rid = client.post("/api/v1/soil/interpret", json={"values": GOOD, "farmer_id": "f", "persist": True}).json()["record_id"]
    r = client.post(f"/api/v1/soil/records/{rid}/approval", json={"approver": "Agronomist A", "decision": "APPROVE"})
    assert r.status_code == 409


def test_api_rejects_non_numeric(client):
    r = client.post("/api/v1/soil/interpret", json={"values": {"pH": "acidic"}})
    assert r.status_code == 422
    assert r.json()["status"] == "INVALID_SOIL_PARAMETER"
