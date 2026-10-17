# Standalone backend status

Status as of 2026-10-18.

1. **Standalone location:** `C:\Users\aryan\Projects\krishimitra-backend`. This is the source of truth for backend development.
2. **Copied from:** `C:\Users\aryan\farmpulse\backend`, which is unchanged and kept as an archive inside the legacy mentor-demo project. `.venv`, `__pycache__`, `.pytest_cache`, `*.pyc`, logs, the Open-Meteo runtime cache and the 48 MB re-downloadable boundary file were not copied. There is no `.env` in either location.
3. **Tests:** **104 passed** with a fresh `.venv` (uv, CPython 3.12.15): the original 97 plus 7 new independence tests. The original backend's baseline before copying was 97 passed.
4. **Verification:** `python scripts/verify_backend.py` passed **21/21**, including live Open-Meteo calls and the pilot checks.
5. **Independence:** the legacy folder was not renamed, because a Vite dev server from it was running. Instead, tests, verification and the uvicorn server were each run with a Python audit hook that **blocks every file access under `C:\Users\aryan\farmpulse`** and strips it from `sys.path`. A sanity probe confirmed the block works. Results under the block: 104 tests passed, 21/21 checks passed, and all pilot and demo endpoints returned 200, with **0 access attempts** on the legacy project. No API response contains a legacy path.
6. **Paths fixed:** there was no direct coupling to the old frontend (no reads of `../src`, `package.json`, `node_modules` or `*.ts`), and all resources were already resolved from `__file__`. One working-directory dependency was fixed in `app/config.py`: relative `DATABASE_URL` (e.g. `sqlite:///./krishimitra.db` from `.env.example`), `DATA_DIR` and `MODEL_ARTIFACT_DIR` are now anchored to the backend root instead of the process working directory. `tests/test_independence.py` guards this (it is username-agnostic and respects absolute external paths).
7. **Yavatmal pilot:** served offline from the last verified real build. Latest MOD13Q1 composite 2026-09-14, snapshot generated 2026-10-17 19:45 UTC, 36 regional monitoring cells. Provenance stays `OBSERVED` with the original observation and retrieval dates; the cells are not farmer fields.
8. **ML:** Yavatmal pilot logistic regression `yavatmal-pilot-20261018`. It was selected on validation data and passed the safety gate on the temporal test (PR-AUC 0.255 vs prevalence 0.147, ROC-AUC 0.63, Brier 0.122 vs 0.126). The spatial holdout is reported separately (PR-AUC 0.392 vs prevalence 0.144). Skill is modest. It is enabled **for the pilot only** (`data/pilot/yavatmal/model/activation.json`); global `MODEL_ENABLED=false` and the global model slot is empty. `heuristic_v1` remains the operational risk engine. The artifact loads and passes its checksum check. It was not retrained.
9. **Retained for the offline pilot:**
   - `data/pilot/yavatmal/pilot_config.json`, `boundary.geojson`, `monitoring_cells.geojson`, `README.md`
   - `processed/`: `pilot_snapshot.json`, `pilot_timeseries.json`, `yavatmal_observations.csv`, `modis_composites.csv`, `dataset_report.json`
   - `model/`: `model.joblib`, `model_metadata.json`, `activation.json`, `training_report.json`
   - `reports/`: model evaluation (json/md), dataset report, build summary
   - `raw/modis/` (13 MB) and `raw/weather/` (4.4 MB): the original API responses, which allow a cached ~90 s rebuild without the network
   - `data/demo/yavatmal_demo.json`: the synthetic demo fixture
10. **Large artifacts excluded:** `raw/boundary/geoBoundaries-IND-ADM2.geojson` (48 MB, India-wide, re-downloaded automatically by the build script if needed) and `data/cache/` (ephemeral live-weather cache). `krishimitra.db` (local runtime state, re-created on startup; demo records via `scripts/seed_demo.py`) exists locally but is not tracked.
11. **Git:** a standalone repository was initialised here. The initial commit is "Initial standalone KrishiMitra backend" (see `git log`). `.venv`, secrets, caches, the database and the large boundary file are ignored.
12. **Remaining limitations:**
    - The pilot shows the last verified build. Refreshing it needs network access (`scripts/build_yavatmal_pilot.py`).
    - The final frontend is not integrated yet (planned through the HTTP API).
    - The Sentinel Hub field-level provider has never been run against a live account.
    - The other limitations listed in `IMPLEMENTATION_STATUS.md` and `YAVATMAL_PILOT_REPORT.md` still apply.
