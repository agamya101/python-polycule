from __future__ import annotations

from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.ml.inference import predict
from app.ml.model_registry import model_status
from app.schemas.risk import PredictionBlock

router = APIRouter(prefix="/api/v1/model", tags=["model"])


class PredictRequest(BaseModel):
    features: dict[str, Any] = Field(..., description="Feature values keyed by name (see model status 'features').")


@router.get("/status", summary="Experimental ML model availability, validation and metrics")
def status() -> dict[str, Any]:
    """Global artifact status plus the Yavatmal pilot model (pilot-local activation)."""
    from app.pilot.pipeline import activation
    from app.pilot.region import model_dir

    out = model_status()
    act = activation()
    pilot = model_status(model_dir(), bool(act.get("enabled")))
    pilot["activation"] = act
    out["pilot_models"] = {"yavatmal": pilot}
    return out


@router.post("/predict", response_model=PredictionBlock, summary="Model-estimated next-observation deterioration probability (gated)")
def model_predict(req: PredictRequest) -> PredictionBlock:
    return predict(req.features)
