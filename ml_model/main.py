"""
main.py — FastAPI Serving Layer for Safety Guardian Geospatial ML Engine

Exposes:
  POST /predict/route    — Evaluates full route polyline payloads with spatial trees.
  POST /predict/point    — Evaluates a single coordinate point.
  GET  /health           — Health check and model readiness.
  GET  /model/metadata   — Model architecture, feature list, and training metrics.
"""

import os
import json
from typing import List, Dict, Any, Optional, Union
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from ml_model.inference import SafetyInferenceEngine
from ml_model.data_pipeline import HazardManager

app = FastAPI(
    title="Safety Guardian Geospatial ML Service",
    description="Production Spatial-Temporal Safety Risk & Corridor Evaluation API",
    version="2.0.0"
)

# Configure CORS to allow communication with the Vite frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Pydantic Schemas ─────────────────────────────────────────────────────────

class WeatherMetadata(BaseModel):
    condition: Optional[str] = "clear"
    temp: Optional[float] = 26.0
    temperature: Optional[float] = None
    visibility: Optional[float] = 10000.0
    humidity: Optional[float] = 65.0

class RouteEvaluationRequest(BaseModel):
    waypoints: List[Any] = Field(
        ...,
        description="Array of coordinate waypoints: [[lat, lng], ...] or [{'lat': ..., 'lng': ...}]",
        example=[[22.5630, 88.4020], [22.5700, 88.4100]]
    )
    timestamp: Optional[str] = Field(None, description="ISO timestamp string (e.g. 2026-09-04T22:00:00Z)")
    hour: Optional[int] = Field(None, ge=0, le=23, description="Hour of day (0-23)")
    day_of_week: Optional[int] = Field(None, ge=0, le=6, description="Day of week (0=Mon, 6=Sun)")
    weather: Optional[Union[WeatherMetadata, Dict[str, Any]]] = Field(
        default=None,
        description="Environmental & weather parameters"
    )
    lighting: Optional[str] = Field(
        default=None,
        description="Lighting conditions: daylight, well_lit, poorly_lit, dark"
    )

class PointEvaluationRequest(BaseModel):
    lat: float = Field(..., ge=-90, le=90)
    lng: float = Field(..., ge=-180, le=180)
    hour: Optional[int] = Field(12, ge=0, le=23)
    day_of_week: Optional[int] = Field(0, ge=0, le=6)
    weather: Optional[Union[WeatherMetadata, Dict[str, Any]]] = None
    lighting: Optional[str] = None

# Initialize engine on startup
engine: Optional[SafetyInferenceEngine] = None

@app.on_event("startup")
def startup_event():
    global engine
    try:
        engine = SafetyInferenceEngine.get_instance()
        print("[FastAPI] SafetyInferenceEngine initialized successfully!")
    except Exception as e:
        print(f"[FastAPI] Error initializing engine: {e}")

# ── Endpoints ────────────────────────────────────────────────────────────────

@app.get("/health")
def health_check():
    hm = HazardManager.get_instance()
    return {
        "status": "ok",
        "service": "Safety Guardian Geospatial ML",
        "version": "2.0.0",
        "spatial_indexing": "BallTree-Haversine",
        "hazards_loaded": {
            "crime_hotspots": hm.crime_index.count,
            "accident_blackspots": hm.accident_index.count,
            "flood_zones": hm.flood_index.count,
            "disaster_zones": hm.disaster_index.count
        }
    }

@app.get("/model/metadata")
def get_model_metadata():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    meta_path = os.path.join(base_dir, "model_meta.json")
    if not os.path.exists(meta_path):
        raise HTTPException(status_code=404, detail="Model metadata not found")
    with open(meta_path, "r", encoding="utf-8") as f:
        return json.load(f)

@app.post("/predict/route")
def predict_route(payload: RouteEvaluationRequest):
    global engine
    if engine is None:
        engine = SafetyInferenceEngine.get_instance()

    try:
        weather_dict = payload.weather.dict() if hasattr(payload.weather, "dict") else (payload.weather or {})
        result = engine.predict_route(
            waypoints=payload.waypoints,
            timestamp=payload.timestamp,
            hour=payload.hour,
            day_of_week=payload.day_of_week,
            weather=weather_dict,
            lighting=payload.lighting
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Inference error: {str(e)}")

@app.post("/predict/point")
def predict_point(payload: PointEvaluationRequest):
    global engine
    if engine is None:
        engine = SafetyInferenceEngine.get_instance()

    try:
        weather_dict = payload.weather.dict() if hasattr(payload.weather, "dict") else (payload.weather or {})
        result = engine.predict_point(
            lat=payload.lat,
            lng=payload.lng,
            hour=payload.hour if payload.hour is not None else 12,
            day_of_week=payload.day_of_week if payload.day_of_week is not None else 0,
            weather=weather_dict,
            lighting=payload.lighting
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Inference error: {str(e)}")

# Legacy compatibility route for any old client
@app.post("/predict")
def legacy_predict(payload: Dict[str, Any]):
    """Provides backwards compatibility for legacy coordinate or single row calls."""
    global engine
    if engine is None:
        engine = SafetyInferenceEngine.get_instance()

    lat = float(payload.get("latitude") or payload.get("lat") or 22.5726)
    lng = float(payload.get("longitude") or payload.get("lng") or 88.3639)
    hour = int(payload.get("hour") or 12)
    day = int(payload.get("day_of_week") or 0)
    lighting = payload.get("lighting")
    weather = {
        "condition": payload.get("weather", "clear"),
        "temperature": payload.get("temperature", 25.0),
        "visibility": payload.get("visibility", 10000.0)
    }

    res = engine.predict_point(lat, lng, hour=hour, day_of_week=day, weather=weather, lighting=lighting)
    return {
        "risk": res["risk_level"],
        "safety_score": res["safety_score"],
        "probabilities": res["probabilities"],
        "nearest_hazards": res["nearest_hazards"]
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("ml_model.main:app", host="0.0.0.0", port=8000, reload=True)
