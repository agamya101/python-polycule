"""Rule-based intervention prioritisation.

Ranks risk cases for limited field capacity using transparent point rules
(``app/rules/intervention_config.json``). Not a machine-learning model.

High-risk / weak-evidence cases are never dropped: they are routed to
``VERIFY_FIRST`` so someone checks them.
"""

from __future__ import annotations

import math

from app.config import load_rules
from app.schemas.common import VerificationStatus
from app.schemas.interventions import PrioritizedCase, PriorityFactor, PriorityLevel, RiskCase

ORDER = {
    PriorityLevel.P1_IMMEDIATE_REVIEW: 0,
    PriorityLevel.P2_HIGH_PRIORITY: 1,
    PriorityLevel.VERIFY_FIRST: 2,
    PriorityLevel.P3_MONITOR: 3,
    PriorityLevel.NO_ACTION: 4,
}
DETERIORATION_TREND_PER_10D = -0.01


def stage_sensitivity(case: RiskCase, table: dict[str, str]) -> str:
    if case.crop_stage_sensitivity:
        return case.crop_stage_sensitivity.upper()
    if case.crop_stage:
        stage = case.crop_stage.lower()
        for key, level in table.items():
            if not key.startswith("_") and key in stage:
                return level
    return "UNKNOWN"


def score_case(case: RiskCase) -> PrioritizedCase:
    cfg = load_rules("intervention_config")
    pts = cfg["points"]
    factors: list[PriorityFactor] = []

    if case.risk_score is not None:
        p = case.risk_score * pts["risk_score_multiplier"]
        factors.append(PriorityFactor(factor="risk_severity", points=round(p, 2), detail=f"Heuristic risk score {case.risk_score:.0f} x {pts['risk_score_multiplier']}."))
    else:
        factors.append(PriorityFactor(factor="risk_severity", points=0, detail="No risk score available (not treated as low risk)."))

    deteriorating = bool(case.deteriorating) or (case.ndvi_trend_per_10d is not None and case.ndvi_trend_per_10d <= DETERIORATION_TREND_PER_10D)
    if deteriorating:
        factors.append(PriorityFactor(factor="continuing_deterioration", points=pts["deterioration"], detail="Vegetation trend is continuing downward."))

    sens = stage_sensitivity(case, cfg["crop_stage_sensitivity"])
    sp = pts["crop_stage_sensitivity"].get(sens, pts["crop_stage_sensitivity"]["UNKNOWN"])
    if sp:
        factors.append(PriorityFactor(factor="crop_stage_sensitivity", points=sp, detail=f"Crop-stage sensitivity {sens}" + (f" ({case.crop_stage})." if case.crop_stage else ".")))

    if case.affected_farmers:
        fp = min(pts["affected_farmers_max"], pts["affected_farmers_max"] * math.log1p(case.affected_farmers) / math.log1p(pts["affected_farmers_full_at"]))
        factors.append(PriorityFactor(factor="affected_farmers", points=round(fp, 2), detail=f"{case.affected_farmers} potentially affected farmer(s) (log-scaled)."))

    if case.unresolved_alerts:
        up = min(pts["unresolved_alert_max"], pts["unresolved_alert_each"] * case.unresolved_alerts)
        factors.append(PriorityFactor(factor="unresolved_alerts", points=up, detail=f"{case.unresolved_alerts} previous unresolved alert(s)."))

    vp = pts["verification"].get(case.verification_status.value, 0)
    if vp:
        factors.append(PriorityFactor(factor="verification_status", points=vp, detail=f"Field verification status {case.verification_status.value}."))

    score = round(max(0.0, sum(f.points for f in factors)), 2)

    vf = cfg["verify_first"]
    weak_evidence = case.evidence_quality_score is None or case.evidence_quality_score < vf["max_evidence_score"] or (case.risk_level or "").upper() == "INSUFFICIENT_EVIDENCE"
    concerning = (case.risk_score is not None and case.risk_score >= vf["min_risk_score"]) or deteriorating
    verified = case.verification_status in (VerificationStatus.CONFIRMED, VerificationStatus.RESOLVED)

    if case.verification_status == VerificationStatus.RESOLVED and not deteriorating:
        level, why = PriorityLevel.NO_ACTION, "Case resolved by field verification and no continuing deterioration."
    elif weak_evidence and concerning and not verified:
        level, why = PriorityLevel.VERIFY_FIRST, "Concerning signal but weak evidence: verify in the field before acting."
    elif case.risk_score is None and not verified:
        level, why = PriorityLevel.VERIFY_FIRST, "No risk score available; verification needed to assess the case."
    else:
        b = cfg["buckets"]
        if score >= b["P1_IMMEDIATE_REVIEW"]:
            level = PriorityLevel.P1_IMMEDIATE_REVIEW
        elif score >= b["P2_HIGH_PRIORITY"]:
            level = PriorityLevel.P2_HIGH_PRIORITY
        elif score >= b["P3_MONITOR"]:
            level = PriorityLevel.P3_MONITOR
        else:
            level = PriorityLevel.NO_ACTION
        why = f"Priority score {score:.0f} from the listed factors."
        gate = cfg["p1_gate"]["min_evidence_score"]
        if level == PriorityLevel.P1_IMMEDIATE_REVIEW and case.verification_status != VerificationStatus.CONFIRMED and (case.evidence_quality_score or 0) < gate:
            level = PriorityLevel.P2_HIGH_PRIORITY
            why += f" Capped at P2: evidence quality below {gate} and no confirmed verification."

    return PrioritizedCase(rank=0, case_id=case.case_id, priority=level, priority_score=score, factors=factors, rationale=why)


def prioritize(cases: list[RiskCase]) -> list[PrioritizedCase]:
    scored = [score_case(c) for c in cases]
    scored.sort(key=lambda r: (ORDER[r.priority], -r.priority_score, r.case_id))
    for i, r in enumerate(scored, start=1):
        r.rank = i
    return scored
