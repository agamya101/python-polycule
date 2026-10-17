"""Build the Yavatmal real-data pilot end to end (cached).

Stages:
  1. boundary   geoBoundaries ADM2 -> data/pilot/yavatmal/boundary.geojson
  2. cells      fixed monitoring-cell grid -> monitoring_cells.geojson
  3. modis      ORNL DAAC MOD13Q1 subsets per cell -> processed/modis_composites.csv
  4. screening  vegetation screening of cells
  5. weather    Open-Meteo archive per cell -> raw/weather/
  6. dataset    past-only baselines, weather features, labels -> processed/yavatmal_observations.csv
  7. train      candidate models + temporal test + spatial holdout -> reports/, model/
  8. snapshot   latest real pilot assessment -> processed/pilot_assessment.json

Usage:
  python scripts/build_yavatmal_pilot.py              # cached rerun
  python scripts/build_yavatmal_pilot.py --refresh    # re-download sources
  python scripts/build_yavatmal_pilot.py --skip-train
  python scripts/build_yavatmal_pilot.py --only-acquire
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.pilot import acquire  # noqa: E402
from app.pilot.region import load_config, pilot_dir  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--refresh", action="store_true", help="Re-download boundary, MODIS and weather instead of using caches.")
    ap.add_argument("--skip-train", action="store_true")
    ap.add_argument("--only-acquire", action="store_true", help="Stop after MODIS download (stages 1-3).")
    ap.add_argument("--workers", type=int, default=6, help="Concurrent MODIS requests (be polite to the public service).")
    a = ap.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    log = logging.getLogger("pilot")
    t0 = time.time()
    cfg = load_config()

    log.info("Stage 1: boundary")
    boundary = acquire.build_boundary(cfg, refresh=a.refresh)
    log.info("Stage 2: monitoring cells")
    cells = acquire.build_candidate_cells(cfg, boundary)
    acquire.write_cells_geojson(cells, cfg)
    log.info("  %d candidate cells", len(cells))
    log.info("Stage 3: MODIS MOD13Q1 (ORNL DAAC TESViS)")
    composites_path, failures = acquire.download_modis(cfg, cells, refresh=a.refresh, workers=a.workers)
    if failures:
        log.warning("  %d cell(s) failed to download; they are excluded (no substitute values).", len(failures))
    if a.only_acquire:
        log.info("Done (acquire only) in %.0fs", time.time() - t0)
        return 0

    from app.pilot import pipeline  # noqa: E402  (heavier imports)

    summary = pipeline.run_after_acquire(cfg, boundary, cells, composites_path, refresh=a.refresh, skip_train=a.skip_train,
                                         download_failures=failures)
    (pilot_dir() / "reports").mkdir(parents=True, exist_ok=True)
    (pilot_dir() / "reports" / "build_summary.json").write_text(json.dumps(summary, indent=2, default=str), encoding="utf-8")
    log.info("Build finished in %.0fs", time.time() - t0)
    print(json.dumps(summary, indent=2, default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
