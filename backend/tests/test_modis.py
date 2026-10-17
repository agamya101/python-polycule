"""ORNL DAAC MOD13Q1 provider parsing tests (minimal recorded-shape fixtures)."""

import json

import httpx
import pytest

from app.providers.base import ProviderError
from app.providers.ornl_modis import (
    NDVI_BAND,
    RELIABILITY_BAND,
    OrnlModisProvider,
    aggregate_composite,
    merge_subsets,
    scale_ndvi,
)


def subset_payload(band, entries):
    return {"band": band, "scale": "0.0001" if band == NDVI_BAND else "Not scaled", "nrows": 2, "ncols": 2,
            "subset": [{"modis_date": md, "calendar_date": cd, "band": band, "tile": "h25v06", "proc_date": "2024022132348", "data": data}
                       for md, cd, data in entries]}


def test_scale_factor():
    assert scale_ndvi(5246) == 0.5246
    assert scale_ndvi(0) == 0.0
    assert scale_ndvi(-2000) == -0.2
    assert scale_ndvi(10000) == 1.0


def test_fill_and_out_of_range_values_rejected():
    assert scale_ndvi(-3000) is None  # fill value
    assert scale_ndvi(-2001) is None
    assert scale_ndvi(10001) is None
    assert scale_ndvi(None) is None


def test_bad_quality_pixels_filtered():
    ndvi = [6000, 6200, 9000, 1000, -3000, 5800]
    rel = [0, 1, 3, 2, 0, -1]  # cloudy, snow, fill NDVI, fill reliability are rejected
    value, valid, good, accepted, counts = aggregate_composite(ndvi, rel)
    assert accepted == 2 and value == pytest.approx(0.61)
    assert valid == pytest.approx(100 * 2 / 6, abs=0.01)
    assert good == pytest.approx(100 * 1 / 6, abs=0.01)
    assert counts["cloudy"] == 1 and counts["snow_ice"] == 1 and counts["fill"] == 1


def test_all_rejected_gives_none_not_substitute():
    value, valid, _, accepted, _ = aggregate_composite([7000, 7100], [3, 3])
    assert value is None and valid == 0.0 and accepted == 0


def test_date_parsing_and_merge():
    nd = subset_payload(NDVI_BAND, [("A2024001", "2024-01-01", [5000, 5200, 5400, 5600]), ("A2024017", "2024-01-17", [4000, 4000, 4000, 4000])])
    rl = subset_payload(RELIABILITY_BAND, [("A2024001", "2024-01-01", [0, 0, 1, 3])])  # second composite lacks quality info
    recs = merge_subsets([nd], [rl])
    assert len(recs) == 1  # composite without reliability is not used
    r = recs[0]
    assert r.composite_start == "2024-01-01" and r.composite_end == "2024-01-16" and r.modis_date == "A2024001"
    assert r.ndvi == 0.52 and r.tile == "h25v06" and r.pixel_count == 4


def _provider(tmp_path, handler, **kw):
    return OrnlModisProvider(cache_dir=tmp_path, client=httpx.Client(transport=httpx.MockTransport(handler)), backoff_seconds=0, **kw)


def test_no_fake_fallback_on_failure(tmp_path):
    p = _provider(tmp_path, lambda req: httpx.Response(503), retries=2)
    with pytest.raises(ProviderError):
        p.subset(20.0, 78.0, NDVI_BAND, "A2024001", "A2024017", 1)


def test_rejected_request_raises_immediately(tmp_path):
    calls = []

    def handler(req):
        calls.append(1)
        return httpx.Response(400, text="bad band")

    with pytest.raises(ProviderError):
        _provider(tmp_path, handler, retries=4).subset(20.0, 78.0, "nope", "A2024001", "A2024017", 1)
    assert len(calls) == 1


def test_cache_reused_without_network(tmp_path):
    payload = subset_payload(NDVI_BAND, [("A2024001", "2024-01-01", [5000])])
    _provider(tmp_path, lambda req: httpx.Response(200, json=payload)).subset(20.0, 78.0, NDVI_BAND, "A2024001", "A2024001", 1)

    def boom(req):
        raise AssertionError("network should not be called")

    again = _provider(tmp_path, boom).subset(20.0, 78.0, NDVI_BAND, "A2024001", "A2024001", 1)
    assert again == payload
    raw = list((tmp_path / "subset").glob("*.json"))
    assert raw and "retrieved_at" in json.loads(raw[0].read_text())


def test_cell_series_end_to_end(tmp_path):
    dates = {"dates": [{"modis_date": "A2024001", "calendar_date": "2024-01-01"}, {"modis_date": "A2024017", "calendar_date": "2024-01-17"}]}

    def handler(req):
        if req.url.path.endswith("/dates"):
            return httpx.Response(200, json=dates)
        band = req.url.params["band"]
        data = [6000, 6100, 6200, 6300] if band == NDVI_BAND else [0, 0, 0, 1]
        return httpx.Response(200, json=subset_payload(band, [("A2024001", "2024-01-01", data), ("A2024017", "2024-01-17", data)]))

    from datetime import date

    recs = _provider(tmp_path, handler).cell_series(20.0, 78.0, date(2024, 1, 1), date(2024, 2, 1))
    assert [r.composite_start for r in recs] == ["2024-01-01", "2024-01-17"]
    assert recs[0].ndvi == pytest.approx(0.615) and recs[0].valid_pixel_pct == 100.0
