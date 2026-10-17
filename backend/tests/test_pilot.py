"""Yavatmal pilot pipeline tests.

Unit tests use small TEST-ONLY tables built in memory to exercise the logic;
they never enter the pilot dataset. Tests at the bottom check the real built
pilot artifacts and are skipped if the pilot has not been built.
"""

import json
import math
from datetime import date, timedelta

import numpy as np
import pandas as pd
import pytest

from app.ml.features import assert_no_leakage
from app.pilot import assess, region
from app.pilot.dataset import add_baselines, past_only_baseline, weather_feature_rows
from app.pilot.pipeline import systematic_holdout
from app.providers.base import WeatherResult
from app.schemas.weather import CacheInfo, CacheStatus, DailyWeather
from tests.conftest import make_daily
from training.build_features import feature_columns
from training.prepare_dataset import prepare
from training.temporal_split import temporal_split

BCFG = {"window_days": 16, "min_days_before": 300, "min_prior_years": 2, "min_observations": 3}


def composites(cells=("C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8"), start=date(2019, 1, 1), end=date(2024, 12, 31), seed=0):
    rng = np.random.default_rng(seed)
    rows = []
    for i, c in enumerate(cells):
        d = start
        while d <= end:
            doy = d.timetuple().tm_yday
            ndvi = 0.45 + 0.25 * math.sin(2 * math.pi * (doy - 150) / 365) + rng.normal(0, 0.03)
            rows.append({"location_id": c, "lat": 20.0 + i * 0.1, "lon": 78.0, "observation_date": pd.Timestamp(d),
                         "composite_end_date": (d + timedelta(days=15)).isoformat(), "ndvi": round(ndvi, 4),
                         "valid_pixel_pct": 30.0 if rng.random() < 0.1 else 90.0, "good_pixel_pct": 80.0, "pixel_count": 81,
                         "tile": "h25v06", "retrieved_at": "2026-10-18T00:00:00+00:00"})
            d += timedelta(days=16)
    return pd.DataFrame(rows)


# ------------------------------------------------------------ baseline
def test_past_only_baseline_requires_prior_years():
    ds = [date(2019, 7, 12), date(2020, 7, 11)]
    assert past_only_baseline(ds, [0.5, 0.6], date(2020, 7, 20), **BCFG)[0] is None  # only one prior year
    val, n, years = past_only_baseline(ds + [date(2020, 7, 27)], [0.5, 0.6, 0.62], date(2021, 7, 20), **BCFG)
    assert val == 0.6 and n == 3 and years == [2019, 2020]


def test_future_years_cannot_affect_earlier_baseline():
    ds = [date(y, 7, 12) for y in range(2019, 2027)] + [date(y, 7, 28) for y in range(2019, 2027)]
    vs = [0.5] * len(ds)
    target = date(2023, 7, 20)
    base1 = past_only_baseline(ds, vs, target, **BCFG)
    vs2 = [0.05 if d.year >= 2023 else v for d, v in zip(ds, vs)]  # change current + future years drastically
    base2 = past_only_baseline(ds, vs2, target, **BCFG)
    assert base1 == base2 and base1[0] == 0.5
    assert max(base1[2]) < 2023


def test_add_baselines_and_anomaly():
    df = composites(cells=("C1",))
    out = add_baselines(df[df["valid_pixel_pct"] >= 40].copy(), BCFG)
    early = out[out["observation_date"] < "2020-11-01"]
    assert early["baseline_ndvi"].isna().all()  # not enough prior seasons yet -> unavailable, not invented
    later = out[out["baseline_ndvi"].notna()]
    assert len(later) > 50
    r = later.iloc[-1]
    assert r["ndvi_anomaly_pct"] == pytest.approx(100 * (r["ndvi"] - r["baseline_ndvi"]) / abs(r["baseline_ndvi"]), abs=0.01)


def test_weather_features_use_no_future_days():
    daily = make_daily(date(2024, 8, 30), 120, rain=0.0)
    for d in daily:
        if d.date > "2024-07-31":
            d.precipitation_mm = 50.0
    rows = weather_feature_rows(daily, [date(2024, 7, 31)])
    assert rows[0]["rainfall_30d"] == 0.0 and rows[0]["dry_spell_length"] >= 30


# ------------------------------------------------------------ dataset / split
def _table():
    df = composites()
    usable = add_baselines(df[df["valid_pixel_pct"] >= 40].copy(), BCFG)
    table, _ = prepare(usable, label_mode="anomaly_delta", anomaly_drop=-10, min_valid_pct=40, max_gap_days=48, keep_unlabelled=True)
    return table


def test_training_features_contain_no_future_or_id_columns():
    t = _table()
    cols = feature_columns(t[t["label"].notna()])
    assert_no_leakage(cols)
    for bad in ("location_id", "lat", "lon", "next_ndvi", "label", "label_delta", "next_observation_date"):
        assert bad not in cols


def test_spatial_holdout_absent_from_training_and_labels_do_not_cross_boundaries():
    t = _table()
    lab = t[t["label"].notna()].copy()
    hold = systematic_holdout(sorted(lab["location_id"].unique()), 2)
    s = temporal_split(lab, holdout_locations=hold)
    assert hold and set(hold).isdisjoint(set(s.train["location_id"])) and set(hold).isdisjoint(set(s.val["location_id"]))
    assert set(hold).isdisjoint(set(s.test["location_id"]))
    assert set(s.spatial_test["location_id"]) <= set(hold) and len(s.spatial_test) > 0
    assert (s.train["next_observation_date"] < s.val_start).all()
    assert (s.val["next_observation_date"] < s.test_start).all()
    assert (s.spatial_test["observation_date"] >= s.test_start).all()


def test_systematic_holdout_deterministic():
    ids = [f"YVT_CELL_{i:03d}" for i in range(1, 31)]
    assert systematic_holdout(ids, 6) == systematic_holdout(list(reversed(ids)), 6)
    assert len(systematic_holdout(ids, 6)) == 6


def test_grid_cells_reproducible_and_inside_boundary():
    geom = {"type": "Polygon", "coordinates": [[[77.5, 19.5], [78.5, 19.5], [78.5, 20.5], [77.5, 20.5], [77.5, 19.5]]]}
    a, sa = region.grid_candidates(geom, 20, 3.0)
    b, sb = region.grid_candidates(geom, 20, 3.0)
    assert a == b and sa == sb and len(a) >= 20
    assert all(region.point_in_geometry(lon, lat, geom) and region.distance_to_boundary_km(lon, lat, geom) >= 3.0 for lat, lon in a)


# ------------------------------------------------------------ snapshot
class FakeOM:
    """Test double for current weather (fixed test inputs)."""

    def __init__(self, **_kwargs):
        pass

    def history(self, lat, lon, start, end, include_soil_moisture=True):
        return WeatherResult(daily=make_daily(end, (end - start).days + 1, rain=0.0, tmax=33.0), cache=CacheInfo(status=CacheStatus.LIVE),
                             source="open_meteo", retrieved_at="2026-10-18T00:00:00+00:00")

    def forecast(self, lat, lon, days):
        return WeatherResult(daily=[DailyWeather(date=(date.today() + timedelta(days=i)).isoformat(), precipitation_mm=0.0, temperature_2m_max_c=34.0)
                                    for i in range(days)], cache=CacheInfo(status=CacheStatus.LIVE), source="open_meteo", retrieved_at="x")


@pytest.fixture
def snapshot(monkeypatch, tmp_path):
    monkeypatch.setattr(assess, "OpenMeteoProvider", FakeOM)
    monkeypatch.setattr(assess, "fetch_cell_weather",
                        lambda cell, start, end, refresh=False: (make_daily(end, (end - start).days + 1, rain=1.0, tmax=33.0), {}))
    cfg = json.loads((region.pilot_dir() / "pilot_config.json").read_text())
    comp = composites()
    table = _table()
    cells = [{"cell_id": c, "lat": float(g["lat"].iloc[0]), "lon": 78.0} for c, g in comp.groupby("location_id")]
    screening = {c["cell_id"]: {"status": "monitored"} for c in cells}
    snap = assess.build_snapshot(cfg, cells, screening, comp, table, tmp_path / "no_model", False, None, as_of=date(2025, 1, 20))
    return snap, table, comp


def test_snapshot_is_real_mode_and_not_farmer_fields(snapshot):
    snap, _, _ = snapshot
    s = snap["summary"]
    assert s["demo"] is False and s["pilot"]["not_farmer_fields"] is True
    assert s["coverage"]["monitoring_cells"] == 8
    for c in snap["cells"]:
        assert c["is_farmer_field"] is False and c["is_demo"] is False and c["risk"]["method"] == "heuristic_v1"
        modis = [p for p in c["provenance"] if p["source"] == "ornl_daac_tesvis"][0]
        assert modis["source_type"] == "OBSERVED" and modis["is_demo"] is False
        assert modis["provider_metadata"]["product"] == "MOD13Q1 C6.1"
        assert "farmer field" not in json.dumps(c["reasoning"]).lower()
    assert set(s["operational_kpis"]) >= {"monitoring_cells_analysed", "cells_requiring_review", "cells_insufficient_evidence",
                                          "high_priority_cases", "latest_observation_freshness_days"}
    assert "yield" not in json.dumps(s["operational_kpis"]).replace("No yield", "").lower()


def test_snapshot_prediction_unavailable_without_model(snapshot):
    snap, _, _ = snapshot
    assert all(c["prediction"]["status"] == "MODEL_NOT_AVAILABLE" and c["prediction"]["probability"] is None for c in snap["cells"])
    assert snap["summary"]["model"]["status"] == "MODEL_NOT_AVAILABLE"


def test_prediction_only_for_validated_and_enabled_model(monkeypatch, tmp_path):
    from app.ml.inference import predict
    from tests.test_ml import synthetic_raw
    from training.train import train

    out, rep = prepare(synthetic_raw())
    out.attrs["label_definition"] = rep["label_definition"]
    train(out, tmp_path, allow_unvalidated=True)
    meta_path = tmp_path / "model_metadata.json"
    meta = json.loads(meta_path.read_text())
    feats = {c: 0.5 for c in meta["features"]}
    assert predict(feats, tmp_path, enabled=False).probability is None
    if meta["validated"]:
        ok = predict(feats, tmp_path, enabled=True)
        assert ok.status == "AVAILABLE" and ok.probability is not None
    meta["validated"] = False
    meta_path.write_text(json.dumps(meta))
    failed = predict(feats, tmp_path, enabled=True)  # failed gate -> never a probability, even when enabled
    assert failed.status == "MODEL_NOT_VALIDATED" and failed.probability is None


def test_pilot_api_served_from_snapshot(client, snapshot, monkeypatch, tmp_path):
    snap, table, comp = snapshot
    pdir = tmp_path / "pilot"
    (pdir / "processed").mkdir(parents=True)
    (pdir / "processed" / "pilot_snapshot.json").write_text(json.dumps(snap, default=str))
    (pdir / "processed" / "pilot_timeseries.json").write_text(json.dumps(assess.build_timeseries(table, comp), default=str))
    import app.api.pilot as api_pilot

    monkeypatch.setattr(api_pilot, "processed_dir", lambda: pdir / "processed")
    s = client.get("/api/v1/pilot/yavatmal/summary").json()
    assert s["demo"] is False and s["pilot"]["not_farmer_fields"] is True
    cells = client.get("/api/v1/pilot/yavatmal/cells").json()
    assert cells["count"] == 8 and all(c["is_farmer_field"] is False for c in cells["cells"])
    assert "Not farmer fields" in cells["note"]
    ts = client.get("/api/v1/pilot/yavatmal/timeseries").json()
    assert ts["demo"] is False and len(ts["points"]) > 50
    one = client.get("/api/v1/pilot/yavatmal/timeseries", params={"cell_id": "C1"}).json()
    assert one["scope"] == "C1"
    assert client.get("/api/v1/pilot/yavatmal/cells/NOPE").status_code == 404


def test_pilot_api_not_built(client, monkeypatch, tmp_path):
    import app.api.pilot as api_pilot

    monkeypatch.setattr(api_pilot, "processed_dir", lambda: tmp_path / "empty")
    r = client.get("/api/v1/pilot/yavatmal/summary")
    assert r.status_code == 503 and r.json()["status"] == "PILOT_NOT_BUILT"


# ------------------------------------------------------------ real built artifacts
REAL = region.processed_dir()
needs_real = pytest.mark.skipif(not (REAL / "pilot_snapshot.json").exists(), reason="Yavatmal pilot not built")


@needs_real
def test_real_dataset_contains_only_observed_rows():
    df = pd.read_csv(REAL / "yavatmal_observations.csv")
    assert len(df) > 0 and df["location_id"].nunique() >= 10
    assert set(df["source_type"]) == {"OBSERVED"} and not df["is_demo"].any()
    assert pd.to_datetime(df["observation_date"]).dt.year.nunique() >= 4
    assert df["ndvi_anomaly_pct"].notna().sum() > 0


@needs_real
def test_real_snapshot_flags():
    snap = json.loads((REAL / "pilot_snapshot.json").read_text())
    assert snap["summary"]["demo"] is False and snap["summary"]["pilot"]["not_farmer_fields"] is True
    for c in snap["cells"]:
        assert c["is_farmer_field"] is False
        if c["prediction"]["status"] != "AVAILABLE":
            assert c["prediction"]["probability"] is None


# ------------------------------------------------------------ seasonal water climatology
def test_seasonal_climatology_is_past_only_and_changes_water_basis():
    from app.schemas.weather import WeatherFeatures
    from app.services.feature_engineering import add_seasonal_climatology, compute_weather_features
    from app.services.risk_engine import compute_risk

    as_of = date(2026, 10, 15)
    hist = make_daily(as_of, 365 * 8, rain=0.0, tmax=33.0, et0=4.0)
    for d in hist:  # identical annual cycle: wet Jan-May, dry afterwards -> this date is equally dry every year
        if date.fromisoformat(d.date).timetuple().tm_yday <= 150:
            d.precipitation_mm = 10.0
    future = make_daily(as_of + timedelta(days=400), 400, rain=90.0)  # a wet "future" must not affect the norm
    f = add_seasonal_climatology(compute_weather_features(hist, as_of), hist + [d for d in future if d.date > as_of.isoformat()], as_of)
    assert f.climatology_years and max(f.climatology_years) < 2026
    assert f.water_balance_14d_anomaly_mm == 0.0  # as dry as usual -> no seasonal deficit
    r = compute_risk(None, f, evidence_score=90)
    w = next(c for c in r.components if c.name == "water")
    assert w.inputs["basis"] == "seasonal_anomaly" and w.value == 0.0

    raw = compute_weather_features(hist, as_of)  # no climatology -> absolute thresholds flag the same dryness
    w2 = next(c for c in compute_risk(None, raw, evidence_score=90).components if c.name == "water")
    assert w2.inputs["basis"] == "absolute_thresholds" and w2.value == 1.0


def test_climatology_needs_enough_prior_years():
    from app.services.feature_engineering import add_seasonal_climatology, compute_weather_features

    as_of = date(2026, 10, 15)
    hist = make_daily(as_of, 500)
    f = add_seasonal_climatology(compute_weather_features(hist, as_of), hist, as_of, min_years=3)
    assert f.water_balance_14d_anomaly_mm is None and f.climatology_years == []
