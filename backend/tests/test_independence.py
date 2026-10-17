"""Guards against accidental filesystem coupling to anything outside this backend.

Runtime resources (rules, data, pilot artifacts, model artifacts, database)
must resolve inside the backend project, or to an explicitly configured
external location (environment variable). Nothing may depend on the process
working directory or on a sibling frontend project.
"""

import os
import re
import subprocess
import sys
from pathlib import Path

import app
from app.config import BACKEND_DIR, RULES_DIR, Settings, get_settings
from app.pilot import region

ROOT = Path(app.__file__).resolve().parent.parent


def _inside(path: Path, root: Path = ROOT) -> bool:
    try:
        Path(path).resolve().relative_to(root)
        return True
    except ValueError:
        return False


def test_backend_root_is_the_project_containing_app():
    assert BACKEND_DIR == ROOT
    assert (ROOT / "app" / "main.py").exists() and (ROOT / "requirements.txt").exists()


def test_static_resources_resolve_inside_backend():
    assert _inside(RULES_DIR) and (RULES_DIR / "risk_config.json").exists()
    s = get_settings()
    if "DATA_DIR" not in os.environ:
        assert _inside(s.data_dir)
        assert _inside(region.pilot_dir()) and (region.pilot_dir() / "pilot_config.json").exists()
        assert _inside(s.demo_dir) and (s.demo_dir / "yavatmal_demo.json").exists()


def test_default_paths_are_anchored_to_backend_not_cwd(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    for var in ("DATABASE_URL", "DATA_DIR", "MODEL_ARTIFACT_DIR"):
        monkeypatch.delenv(var, raising=False)
    s = Settings(_env_file=None)
    assert _inside(s.data_dir) and _inside(s.model_artifact_dir)
    assert _inside(Path(s.database_url.removeprefix("sqlite:///")))


def test_relative_configured_paths_resolve_against_backend(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    s = Settings(_env_file=None, database_url="sqlite:///./krishimitra.db", data_dir="data", model_artifact_dir="model_artifacts")
    assert s.database_url == f"sqlite:///{(ROOT / 'krishimitra.db').as_posix()}"
    assert s.data_dir == (ROOT / "data").resolve() and s.model_artifact_dir == (ROOT / "model_artifacts").resolve()


def test_absolute_external_storage_is_respected(tmp_path):
    s = Settings(_env_file=None, data_dir=str(tmp_path), database_url=f"sqlite:///{(tmp_path / 'x.db').as_posix()}")
    assert s.data_dir == tmp_path


def test_no_source_references_a_frontend_project():
    pattern = re.compile(r"(\.\./src|\.\.\\src|node_modules|package\.json|\.tsx?\b|farmpulse)", re.IGNORECASE)
    offenders = []
    for sub in ("app", "scripts", "training"):
        for py in (ROOT / sub).rglob("*.py"):
            for i, line in enumerate(py.read_text(encoding="utf-8").splitlines(), start=1):
                if pattern.search(line):
                    offenders.append(f"{py.relative_to(ROOT)}:{i}: {line.strip()}")
    assert not offenders, offenders


def test_fresh_process_from_foreign_cwd_resolves_inside_backend(tmp_path):
    code = (
        "import json, app, app.config as c\n"
        "from app.pilot import region\n"
        "s = c.Settings(_env_file=None)\n"
        "print(json.dumps({'app': app.__file__, 'rules': str(c.RULES_DIR), 'data': str(s.data_dir), "
        "'models': str(s.model_artifact_dir), 'db': s.database_url, 'pilot': str(region.pilot_dir())}))\n"
    )
    env = {k: v for k, v in os.environ.items() if k not in ("DATABASE_URL", "DATA_DIR", "MODEL_ARTIFACT_DIR")}
    env["PYTHONPATH"] = str(ROOT)
    out = subprocess.run([sys.executable, "-c", code], cwd=tmp_path, env=env, capture_output=True, text=True, check=True)
    import json

    paths = json.loads(out.stdout.strip().splitlines()[-1])
    for key, value in paths.items():
        p = Path(value.removeprefix("sqlite:///"))
        assert _inside(p), f"{key} resolved outside backend: {value}"
