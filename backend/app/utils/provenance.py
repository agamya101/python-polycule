"""Provenance helpers.

Every significant value returned by the API carries a provenance record so the
consumer can tell what was OBSERVED, INFERRED (deterministic rules), PREDICTED
(trained model), CONFIRMED (human/lab verified) or DEMO (fixture data).
"""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class SourceType(str, Enum):
    OBSERVED = "OBSERVED"
    INFERRED = "INFERRED"
    PREDICTED = "PREDICTED"
    CONFIRMED = "CONFIRMED"
    DEMO = "DEMO"


class Provenance(BaseModel):
    source: str = Field(..., description="Data source or engine, e.g. open_meteo, sentinel_hub, heuristic_v1, demo_fixture.")
    source_type: SourceType
    observed_at: str | None = Field(None, description="Date/time the underlying observation refers to (ISO 8601).")
    retrieved_at: str = Field(..., description="When the backend obtained or computed the value (ISO 8601, UTC).")
    is_demo: bool = False
    quality_flags: list[str] = Field(default_factory=list)
    provider_metadata: dict[str, Any] = Field(default_factory=dict)


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def utcnow_iso() -> str:
    return utcnow().replace(microsecond=0).isoformat()


def make_provenance(
    source: str,
    source_type: SourceType,
    *,
    observed_at: str | None = None,
    retrieved_at: str | None = None,
    quality_flags: list[str] | None = None,
    provider_metadata: dict[str, Any] | None = None,
    is_demo: bool | None = None,
) -> Provenance:
    """Build a provenance record.

    DEMO data is always flagged ``is_demo=True``; it is not possible to create a
    DEMO record that claims to be non-demo.
    """
    demo = source_type == SourceType.DEMO or bool(is_demo)
    # A demo "observation" is never allowed to masquerade as OBSERVED.
    if demo and source_type == SourceType.OBSERVED:
        source_type = SourceType.DEMO
    return Provenance(
        source=source,
        source_type=source_type,
        observed_at=observed_at,
        retrieved_at=retrieved_at or utcnow_iso(),
        is_demo=demo,
        quality_flags=list(quality_flags or []),
        provider_metadata=dict(provider_metadata or {}),
    )


def any_demo(provenance: list[Provenance]) -> bool:
    return any(p.is_demo or p.source_type == SourceType.DEMO for p in provenance)
