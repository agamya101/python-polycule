"""Seed the database with clearly labelled DEMO records (one demo farmer, one demo field).

All rows are created with ``is_demo=True``. No real farmer names or boundaries
are created.

Usage:  python scripts/seed_demo.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.database import get_session, init_db  # noqa: E402
from app.models.database_models import Farmer, Field, record_audit  # noqa: E402
from app.providers.local_fixture import load_fixture  # noqa: E402
from app.utils.geo import validate_polygon  # noqa: E402


def main() -> None:
    init_db()
    fx = load_fixture("yavatmal_demo")
    db = get_session()
    try:
        if db.get(Field, fx["field"]["field_id"]):
            print("Demo records already present.")
            return
        farmer = Farmer(id="DEMO_FARMER_001", external_ref="DEMO_FARMER_001", display_name="Demo Farmer 001 (synthetic)", is_demo=True)
        geo = validate_polygon(fx["field"]["geometry"])
        field = Field(id=fx["field"]["field_id"], farmer_id=farmer.id, name=fx["field"]["label"], geometry=fx["field"]["geometry"],
                      geometry_verified=False, area_ha=round(geo.area_ha, 4), crop_type=fx["crop"]["crop_type"],
                      sowing_date=fx["crop"]["sowing_date"], district="Yavatmal (demo)", is_demo=True)
        db.add_all([farmer, field])
        record_audit(db, entity_type="Field", entity_id=field.id, action="DEMO_SEEDED", actor_type="script", metadata={"is_demo": True})
        db.commit()
        print(f"Seeded {farmer.id} and {field.id} (is_demo=True, area {field.area_ha} ha).")
    finally:
        db.close()


if __name__ == "__main__":
    main()
