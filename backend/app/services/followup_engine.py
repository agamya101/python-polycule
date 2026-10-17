"""Post-intervention follow-up evaluation.

Runs whenever a new usable observation arrives; no fixed revisit interval is
assumed. Rules (``app/rules/followup_config.json``):

* Observations below the usable-pixel threshold are ignored.
* RECOVERING needs sustained improvement over at least
  ``recovery_min_observations`` usable observations and a non-negative trend,
  with no contradicting field verification. One improved reading is never
  enough.
* DETERIORATING needs a continued negative trend with the latest reading below
  the start; a single severe drop also counts (escalation errs on the side of
  caution).
* Contradictory data (large swings, or verification saying RESOLVED while the
  signal worsens) -> HUMAN_VERIFICATION_REQUIRED.
* A case may be closed only after sustained recovery across
  ``close_requires_observations`` observations, or recovery plus a RESOLVED
  field verification.
"""

from __future__ import annotations

from datetime import date

from app.config import load_rules
from app.schemas.common import VerificationStatus
from app.schemas.inspections import FollowUpEvaluateRequest, FollowUpEvaluateResponse, FollowUpOutcome
from app.utils.normalization import linear_slope

ACTIONS = {
    FollowUpOutcome.RECOVERING: "Continue monitoring; close the case only after sustained recovery or a RESOLVED field verification.",
    FollowUpOutcome.NOT_RECOVERING: "No sustained improvement; schedule a field visit and review the intervention.",
    FollowUpOutcome.DETERIORATING: "Escalate: conditions continue to worsen. Arrange a field visit as a priority.",
    FollowUpOutcome.INSUFFICIENT_DATA: "Wait for the next usable observation; do not close the case.",
    FollowUpOutcome.HUMAN_VERIFICATION_REQUIRED: "Signals are unclear or contradictory; request a field verification.",
}


def evaluate_followup(req: FollowUpEvaluateRequest) -> FollowUpEvaluateResponse:
    cfg = load_rules("followup_config")
    start = date.fromisoformat(req.start_date)
    as_of = date.fromisoformat(req.as_of_date) if req.as_of_date else None

    usable = []
    ignored = 0
    for o in sorted(req.observations, key=lambda o: o.date):
        d = date.fromisoformat(o.date)
        if d <= start or (as_of and d > as_of):
            ignored += 1
            continue
        if o.ndvi is None or (o.valid_pixel_pct is not None and o.valid_pixel_pct < cfg["min_valid_pixel_pct"]):
            ignored += 1
            continue
        usable.append(o)

    reasons: list[str] = []
    if ignored:
        reasons.append(f"{ignored} observation(s) ignored (before start, low usable-pixel coverage or missing NDVI).")

    if not usable:
        return _resp(FollowUpOutcome.INSUFFICIENT_DATA, False, False, 0, ignored, None, None, None, reasons + ["No usable observation since the intervention."])

    deltas = [o.ndvi - req.ndvi_at_start for o in usable]  # type: ignore[operator]
    latest_delta = round(deltas[-1], 4)
    days = (date.fromisoformat(usable[-1].date) - start).days
    xs = [0.0] + [(date.fromisoformat(o.date) - start).days for o in usable]
    ys = [req.ndvi_at_start] + [o.ndvi for o in usable]  # type: ignore[list-item]
    slope = linear_slope(xs, ys)
    trend = None if slope is None else round(slope * 10, 4)
    flat = cfg["trend_flat_band_per_10d"]
    vstatus = req.verification_status

    spread = max(deltas) - min(deltas)
    if len(usable) >= 3 and spread >= cfg["contradiction_spread_ndvi"] and abs(latest_delta) < spread / 2:
        reasons.append(f"Large swings between observations (spread {spread:.2f} NDVI) without a clear direction.")
        return _resp(FollowUpOutcome.HUMAN_VERIFICATION_REQUIRED, False, True, len(usable), ignored, latest_delta, trend, days, reasons)

    worsening = latest_delta <= cfg["deterioration_min_delta_ndvi"] and (trend is None or trend < -flat)
    severe_single = len(usable) == 1 and latest_delta <= cfg["single_observation_severe_drop_ndvi"]

    if vstatus == VerificationStatus.RESOLVED and (worsening or severe_single):
        reasons.append("Field verification marked RESOLVED but the vegetation signal is worsening.")
        return _resp(FollowUpOutcome.HUMAN_VERIFICATION_REQUIRED, False, True, len(usable), ignored, latest_delta, trend, days, reasons)

    if worsening and (len(usable) >= 2 or severe_single):
        reasons.append(f"NDVI {latest_delta:+.3f} since intervention with trend {trend:+.3f}/10 days." if trend is not None else f"NDVI {latest_delta:+.3f} since intervention.")
        if severe_single:
            reasons.append("Single observation, but the drop exceeds the severe-drop threshold.")
        return _resp(FollowUpOutcome.DETERIORATING, False, True, len(usable), ignored, latest_delta, trend, days, reasons)

    min_rec = cfg["recovery_min_delta_ndvi"]
    recent = deltas[-cfg["recovery_min_observations"]:]
    sustained = len(usable) >= cfg["recovery_min_observations"] and all(d >= min_rec for d in recent) and (trend is not None and trend >= 0)
    if sustained:
        if vstatus == VerificationStatus.CONFIRMED:
            reasons.append("Vegetation is improving, but the field verification CONFIRMED an issue that has not been marked resolved.")
            return _resp(FollowUpOutcome.HUMAN_VERIFICATION_REQUIRED, False, False, len(usable), ignored, latest_delta, trend, days, reasons)
        reasons.append(f"Improvement of at least {min_rec:+.2f} NDVI sustained over the last {len(recent)} usable observations.")
        can_close = len(usable) >= cfg["close_requires_observations"] or vstatus == VerificationStatus.RESOLVED
        if not can_close:
            reasons.append("Not yet enough observations to close the case.")
        return _resp(FollowUpOutcome.RECOVERING, can_close, False, len(usable), ignored, latest_delta, trend, days, reasons)

    if len(usable) == 1:
        if latest_delta >= min_rec:
            reasons.append("One improved observation is not sufficient to mark recovery.")
        else:
            reasons.append("Only one usable observation since the intervention.")
        return _resp(FollowUpOutcome.INSUFFICIENT_DATA, False, False, 1, ignored, latest_delta, trend, days, reasons)

    if latest_delta >= min_rec and trend is not None and trend > flat:
        reasons.append("Early improvement, but not yet sustained across enough usable observations to mark recovery.")
        return _resp(FollowUpOutcome.INSUFFICIENT_DATA, False, False, len(usable), ignored, latest_delta, trend, days, reasons)

    if days >= cfg["min_days_for_not_recovering"]:
        reasons.append(f"No sustained improvement after {days} days ({len(usable)} usable observations).")
        return _resp(FollowUpOutcome.NOT_RECOVERING, False, True, len(usable), ignored, latest_delta, trend, days, reasons)

    reasons.append(f"Mixed signal after only {days} days; more observations needed.")
    return _resp(FollowUpOutcome.INSUFFICIENT_DATA, False, False, len(usable), ignored, latest_delta, trend, days, reasons)


def _resp(outcome, can_close, escalate, n, ignored, delta, trend, days, reasons) -> FollowUpEvaluateResponse:
    return FollowUpEvaluateResponse(
        outcome=outcome,
        can_close_case=can_close,
        escalate=escalate,
        usable_observations=n,
        ignored_observations=ignored,
        latest_delta_ndvi=delta,
        ndvi_trend_per_10d=trend,
        days_since_start=days,
        reasons=reasons,
        recommended_action=ACTIONS[outcome],
    )
