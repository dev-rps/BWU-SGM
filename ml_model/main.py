"""
main.py — FastAPI Serving Layer for Safety Guardian Geospatial ML Engine

Exposes:
  POST /predict/route    — Evaluates full route polyline with real-time data enrichment.
  POST /predict/routes   — Batch evaluation of multiple candidate routes.
  POST /predict/point    — Evaluates a single coordinate point.
  GET  /health           — Health check and model readiness.
  GET  /model/metadata   — Model architecture, feature list, and training metrics.

Real-time data integration per REALTIME_SAFETY_DATA_INTEGRATION.md:
  - Open-Meteo: Live weather + WMO weather code (§6)
  - OpenAQ v3:  PM2.5 / NO2 (§3) — key from OPENAQ_API_KEY env var
  - OSM Overpass: Streetlights + police stations (§4) — 500m grid cache, 1hr TTL
"""

import os
import sys
import json
import time
import math
import asyncio
from pathlib import Path
from typing import List, Dict, Any, Optional, Union
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# ── Path setup ────────────────────────────────────────────────────────────────
_current_dir = Path(__file__).resolve().parent
_parent_dir  = _current_dir.parent
for _p in [str(_current_dir), str(_parent_dir)]:
    if _p not in sys.path:
        sys.path.insert(0, _p)

try:
    from ml_model.inference import SafetyInferenceEngine
    from ml_model.data_pipeline import HazardManager
except ImportError:
    from inference import SafetyInferenceEngine
    from data_pipeline import HazardManager

# ── API credentials (loaded once at startup) ──────────────────────────────────
OPENAQ_API_KEY = os.environ.get(
    "OPENAQ_API_KEY",
    "af3f39e0a3fd96f376627d81ea48b4625a86781db2cedd94dfb347e0d5aa1c02"
)

# ── In-memory OSM infrastructure cache (500m grid, 1hr TTL) ──────────────────
# Key: rounded (lat*200, lng*200) tuple; Value: {data, ts}
_osm_cache: Dict[tuple, Dict] = {}
OSM_CACHE_TTL_SECONDS = 3600  # 1 hour
OSM_GRID_RESOLUTION   = 200   # 1/200 degree ≈ 500m


def _osm_cache_key(lat: float, lng: float) -> tuple:
    """Rounds coordinate to ~500m spatial grid for caching."""
    return (round(lat * OSM_GRID_RESOLUTION), round(lng * OSM_GRID_RESOLUTION))


def _osm_cache_get(lat: float, lng: float) -> Optional[Dict]:
    key = _osm_cache_key(lat, lng)
    entry = _osm_cache.get(key)
    if entry and (time.time() - entry["ts"]) < OSM_CACHE_TTL_SECONDS:
        return entry["data"]
    if entry:
        del _osm_cache[key]
    return None


def _osm_cache_set(lat: float, lng: float, data: Dict):
    key = _osm_cache_key(lat, lng)
    _osm_cache[key] = {"data": data, "ts": time.time()}


# ── Live data fetchers ────────────────────────────────────────────────────────

def fetch_live_weather(lat: float, lng: float) -> Dict[str, Any]:
    """
    Fetches real-time weather from Open-Meteo (no API key required).
    Returns dict with: weather_code, temperature, visibility, precipitation, rain, humidity.
    Falls back gracefully on timeout.
    Per REALTIME_SAFETY_DATA_INTEGRATION.md §6.1.
    """
    import requests
    url = (
        f"https://api.open-meteo.com/v1/forecast"
        f"?latitude={lat:.4f}&longitude={lng:.4f}"
        f"&current=temperature_2m,relative_humidity_2m,precipitation,rain,"
        f"weather_code,visibility"
        f"&timezone=Asia%2FKolkata"
    )
    try:
        res = requests.get(url, timeout=4)
        if res.status_code == 200:
            current = res.json().get("current", {})
            return {
                "weather_code":  current.get("weather_code", 0),
                "temperature":   current.get("temperature_2m", 26.0),
                "visibility":    current.get("visibility", 10000.0),
                "precipitation": current.get("precipitation", 0.0),
                "rain":          current.get("rain", 0.0),
                "humidity":      current.get("relative_humidity_2m", 65.0),
            }
    except Exception as e:
        print(f"[Open-Meteo] Weather fetch failed: {e}")
    # Safe default
    return {
        "weather_code": 0,
        "temperature":  26.0,
        "visibility":   10000.0,
        "precipitation": 0.0,
        "rain":         0.0,
        "humidity":     65.0,
    }


def fetch_live_aqi(lat: float, lng: float) -> Dict[str, Any]:
    """
    Fetches real-time PM2.5 from OpenAQ v3 API.
    Falls back to Open-Meteo Air Quality API if OpenAQ unavailable.
    Per REALTIME_SAFETY_DATA_INTEGRATION.md §3.
    """
    import requests

    # ── Primary: OpenAQ v3 ──────────────────────────────────────────────────
    try:
        headers = {
            "X-API-Key": OPENAQ_API_KEY,
            "Accept": "application/json"
        }
        url = (
            f"https://api.openaq.org/v3/locations"
            f"?coordinates={lat:.4f},{lng:.4f}&radius=15000&limit=5"
        )
        res = requests.get(url, headers=headers, timeout=4)
        if res.status_code == 200:
            results = res.json().get("results", [])
            for location in results:
                sensors = location.get("sensors", [])
                pm25_val = None
                no2_val  = None
                for s in sensors:
                    param = (s.get("parameter") or {}).get("name", "")
                    val   = (s.get("latest") or {}).get("value")
                    if param == "pm25" and val is not None:
                        pm25_val = float(val)
                    elif param == "no2" and val is not None:
                        no2_val = float(val)
                if pm25_val is not None:
                    return {
                        "pm25": pm25_val,
                        "no2":  no2_val,
                        "station": location.get("name", "OpenAQ Station"),
                        "source": "OpenAQ v3",
                    }
    except Exception as e:
        print(f"[OpenAQ] Primary fetch failed: {e}. Falling back to Open-Meteo AQ.")

    # ── Fallback: Open-Meteo Air Quality (no key required) ─────────────────
    try:
        aq_url = (
            f"https://air-quality-api.open-meteo.com/v1/air-quality"
            f"?latitude={lat:.4f}&longitude={lng:.4f}"
            f"&current=pm2_5,nitrogen_dioxide,european_aqi"
        )
        res2 = requests.get(aq_url, timeout=4)
        if res2.status_code == 200:
            current = res2.json().get("current", {})
            return {
                "pm25":    current.get("pm2_5", 45.0),
                "no2":     current.get("nitrogen_dioxide"),
                "aqi_eu":  current.get("european_aqi"),
                "station": "Open-Meteo Air Quality",
                "source":  "Open-Meteo AQ",
            }
    except Exception as e:
        print(f"[Open-Meteo AQ] Fallback failed: {e}")

    # Ultimate fallback — background urban estimate
    return {"pm25": 45.0, "no2": None, "source": "default_estimate"}


def fetch_osm_infrastructure(lat: float, lng: float) -> Dict[str, Any]:
    """
    Fetches OSM-derived road infrastructure context for a coordinate via Overpass API.
    Returns: lighting_score, police_proximity_km, road_hierarchy_rank, streetlight_count.
    Uses 500m grid spatial cache with 1hr TTL.
    Per REALTIME_SAFETY_DATA_INTEGRATION.md §4.
    """
    import requests

    # Check cache first
    cached = _osm_cache_get(lat, lng)
    if cached:
        return cached

    # OSM road hierarchy weights (per spec §4.3)
    ROAD_RANK = {
        "motorway":     1.0, "trunk":       1.0,
        "primary":      0.85,"secondary":   0.65,
        "tertiary":     0.45,"residential": 0.35,
        "unclassified": 0.35,"service":     0.25,
        "track":        0.1, "path":        0.1,
    }

    # Lighting score scale from streetlight density
    def density_to_lighting(count: int, road_rank: float) -> float:
        if count >= 8:
            return 2.5  # Well-lit
        if count >= 3:
            return 1.5  # Moderate
        if count >= 1:
            return 1.0  # Poorly lit
        # No streetlights: use road rank as proxy
        if road_rank >= 0.85:
            return 2.0  # Major road — likely lit by traffic/commercial activity
        if road_rank >= 0.65:
            return 1.2
        return 0.5  # Track/path — assume dark

    overpass_query = (
        f"[out:json][timeout:12];"
        f"("
        f'node["highway"="street_lamp"](around:350,{lat:.4f},{lng:.4f});'
        f'node["amenity"="police"](around:3000,{lat:.4f},{lng:.4f});'
        f'way["highway"](around:150,{lat:.4f},{lng:.4f});'
        f");"
        f"out body;"
    )

    result = {
        "lighting_score":       1.5,   # safe default
        "police_proximity_km":  2.0,   # safe default
        "road_hierarchy_rank":  0.65,  # secondary road default
        "streetlight_count":    0,
    }

    try:
        res = requests.post(
            "https://overpass-api.de/api/interpreter",
            data=overpass_query,
            timeout=8
        )
        if res.status_code == 200:
            elements = res.json().get("elements", [])
            lamp_count = 0
            police_dists = []
            road_ranks   = []

            for el in elements:
                tags = el.get("tags", {})
                el_lat = el.get("lat", lat)
                el_lon = el.get("lon", lng)

                if tags.get("highway") == "street_lamp":
                    lamp_count += 1

                elif tags.get("amenity") == "police":
                    # Haversine distance in km
                    dlat = math.radians(el_lat - lat)
                    dlng = math.radians(el_lon - lng)
                    a = (math.sin(dlat / 2) ** 2 +
                         math.cos(math.radians(lat)) *
                         math.cos(math.radians(el_lat)) *
                         math.sin(dlng / 2) ** 2)
                    dist_km = 6371.0 * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
                    police_dists.append(dist_km)

                elif el.get("type") == "way":
                    hw = tags.get("highway", "")
                    if hw in ROAD_RANK:
                        road_ranks.append(ROAD_RANK[hw])

            road_rank = max(road_ranks) if road_ranks else 0.65
            lighting  = density_to_lighting(lamp_count, road_rank)
            police_km = min(police_dists) if police_dists else 2.5

            result = {
                "lighting_score":       round(lighting, 2),
                "police_proximity_km":  round(police_km, 3),
                "road_hierarchy_rank":  round(road_rank, 2),
                "streetlight_count":    lamp_count,
            }
    except Exception as e:
        print(f"[OSM Overpass] Query failed: {e}. Using defaults.")

    _osm_cache_set(lat, lng, result)
    return result


# ── FastAPI Application ───────────────────────────────────────────────────────
app = FastAPI(
    title="Safety Guardian Geospatial ML Service",
    description=(
        "Production Spatial-Temporal Safety Risk & Corridor Evaluation API. "
        "26-feature ML model with live OpenAQ, Open-Meteo, and OSM Overpass integration."
    ),
    version="3.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Pydantic Schemas ──────────────────────────────────────────────────────────

class WeatherMetadata(BaseModel):
    condition:    Optional[str]   = "clear"
    temp:         Optional[float] = 26.0
    temperature:  Optional[float] = None
    visibility:   Optional[float] = 10000.0
    humidity:     Optional[float] = 65.0
    weather_code: Optional[int]   = None   # WMO weather code (preferred)
    precipitation:Optional[float] = 0.0
    rain:         Optional[float] = 0.0

class AirQualityMetadata(BaseModel):
    pm25:    Optional[float] = None
    no2:     Optional[float] = None
    aqi_eu:  Optional[float] = None
    station: Optional[str]   = None

class RouteEvaluationRequest(BaseModel):
    waypoints:    List[Any]                               = Field(..., description="[[lat,lng], ...] or [{lat, lng}]")
    timestamp:    Optional[str]                           = None
    hour:         Optional[int]                           = Field(None, ge=0, le=23)
    day_of_week:  Optional[int]                          = Field(None, ge=0, le=6)
    weather:      Optional[Union[WeatherMetadata, Dict[str, Any]]] = None
    air_quality:  Optional[Union[AirQualityMetadata, Dict[str, Any]]] = None
    lighting:     Optional[str]                          = None
    auto_enrich:  bool = Field(True, description="Auto-fetch live weather/AQI if not supplied")

class PointEvaluationRequest(BaseModel):
    lat:         float = Field(..., ge=-90, le=90)
    lng:         float = Field(..., ge=-180, le=180)
    hour:        Optional[int]  = Field(12, ge=0, le=23)
    day_of_week: Optional[int]  = Field(0, ge=0, le=6)
    weather:     Optional[Union[WeatherMetadata, Dict[str, Any]]] = None
    air_quality: Optional[Union[AirQualityMetadata, Dict[str, Any]]] = None
    lighting:    Optional[str]  = None
    auto_enrich: bool = Field(True, description="Auto-fetch live weather/AQI if not supplied")

class SingleRoutePayload(BaseModel):
    id:              Optional[Union[str, int]] = None
    name:            Optional[str] = None
    waypoints:       List[Any] = Field(..., description="Route coordinates")
    trafficLevel:    Optional[str]   = None
    distanceMeters:  Optional[float] = None
    durationSeconds: Optional[float] = None

class BatchRouteEvaluationRequest(BaseModel):
    routes:      List[SingleRoutePayload] = Field(..., description="Candidate routes to evaluate")
    timestamp:   Optional[str] = None
    hour:        Optional[int] = Field(None, ge=0, le=23)
    day_of_week: Optional[int] = Field(None, ge=0, le=6)
    weather:     Optional[Union[WeatherMetadata, Dict[str, Any]]] = None
    air_quality: Optional[Union[AirQualityMetadata, Dict[str, Any]]] = None
    lighting:    Optional[str] = None
    auto_enrich: bool = Field(True, description="Auto-fetch live weather/AQI if not supplied")


# ── Engine initialization ─────────────────────────────────────────────────────
engine: Optional[SafetyInferenceEngine] = None

@app.on_event("startup")
def startup_event():
    global engine
    try:
        engine = SafetyInferenceEngine.get_instance()
        print("[FastAPI] SafetyInferenceEngine v3.0 initialized (26-feature model).")
    except Exception as e:
        print(f"[FastAPI] Error initializing engine: {e}")


def _get_engine() -> SafetyInferenceEngine:
    global engine
    if engine is None:
        engine = SafetyInferenceEngine.get_instance()
    return engine


def _normalize_weather(weather_input) -> Dict[str, Any]:
    """Normalizes weather input from Pydantic model or raw dict."""
    if weather_input is None:
        return {}
    if hasattr(weather_input, "dict"):
        d = weather_input.dict()
    else:
        d = dict(weather_input)
    # Merge temp aliases
    if d.get("temperature") is None and d.get("temp") is not None:
        d["temperature"] = d["temp"]
    return d


def _normalize_aq(aq_input) -> Dict[str, Any]:
    if aq_input is None:
        return {}
    if hasattr(aq_input, "dict"):
        return aq_input.dict()
    return dict(aq_input)


def _enrich_context(
    lat: float,
    lng: float,
    weather_dict: Dict,
    aq_dict: Dict,
    auto_enrich: bool
) -> tuple:
    """
    Auto-fetches live weather and AQI if not supplied and auto_enrich=True.
    Returns (enriched_weather_dict, enriched_aq_dict, osm_data).
    """
    osm_data = {}

    if auto_enrich:
        # Fetch weather if no weather_code or condition provided
        has_weather = (
            weather_dict.get("weather_code") is not None or
            (weather_dict.get("condition") and weather_dict["condition"] != "clear")
        )
        if not has_weather:
            live_w = fetch_live_weather(lat, lng)
            weather_dict = {**live_w, **weather_dict}  # live data is base, user overrides on top

        # Fetch AQI if no PM2.5 provided
        if not aq_dict.get("pm25"):
            live_aq = fetch_live_aqi(lat, lng)
            aq_dict = {**live_aq, **aq_dict}

        # Fetch OSM infrastructure (cached)
        osm_data = fetch_osm_infrastructure(lat, lng)

    return weather_dict, aq_dict, osm_data


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.get("/")
def root():
    return {
        "service": "Safety Guardian Geospatial ML Service",
        "status":  "online",
        "version": "3.0.0",
        "features": "26-dimensional spatial-temporal-environmental-infrastructure vector",
        "endpoints": {
            "health":         "/health",
            "predict_route":  "/predict/route",
            "predict_routes": "/predict/routes",
            "predict_point":  "/predict/point",
            "metadata":       "/model/metadata",
        }
    }


@app.get("/health")
def health_check():
    hm = HazardManager.get_instance()
    eng = _get_engine()
    return {
        "status":  "ok",
        "service": "Safety Guardian Geospatial ML",
        "version": "3.0.0",
        "model_features": len(eng.feature_names),
        "spatial_indexing": "BallTree-Haversine",
        "live_data": {
            "open_meteo_weather": "enabled",
            "openaq_aqi":         "enabled" if OPENAQ_API_KEY else "key_missing",
            "osm_overpass":       "enabled_cached",
        },
        "hazards_loaded": {
            "crime_hotspots":      hm.crime_index.count,
            "accident_blackspots": hm.accident_index.count,
            "flood_zones":         hm.flood_index.count,
            "disaster_zones":      hm.disaster_index.count,
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
    eng = _get_engine()

    try:
        weather_dict = _normalize_weather(payload.weather)
        aq_dict      = _normalize_aq(payload.air_quality)

        # Determine midpoint for live data enrichment
        valid_wps = [wp for wp in payload.waypoints if isinstance(wp, (list, tuple)) and len(wp) >= 2]
        mid_wp    = valid_wps[len(valid_wps) // 2] if valid_wps else [22.5726, 88.3639]
        mid_lat   = float(mid_wp[0]) if abs(float(mid_wp[0])) <= 90 else float(mid_wp[1])
        mid_lng   = float(mid_wp[1]) if abs(float(mid_wp[0])) <= 90 else float(mid_wp[0])

        weather_dict, aq_dict, osm_data = _enrich_context(
            mid_lat, mid_lng, weather_dict, aq_dict, payload.auto_enrich
        )

        result = eng.predict_route(
            waypoints=payload.waypoints,
            timestamp=payload.timestamp,
            hour=payload.hour,
            day_of_week=payload.day_of_week,
            weather=weather_dict,
            lighting=payload.lighting,
            aqi_pm25=aq_dict.get("pm25"),
            osm_data=osm_data,
        )
        result["live_data_sources"] = {
            "weather_source": "Open-Meteo live" if payload.auto_enrich else "client_provided",
            "aqi_source":     aq_dict.get("source", "unknown"),
            "weather_code":   weather_dict.get("weather_code"),
            "pm25":           aq_dict.get("pm25"),
        }
        return result

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Inference error: {str(e)}")


@app.post("/predict/routes")
def predict_routes(payload: BatchRouteEvaluationRequest):
    """Evaluates multiple candidate routes in a single efficient call."""
    eng = _get_engine()

    try:
        weather_dict = _normalize_weather(payload.weather)
        aq_dict      = _normalize_aq(payload.air_quality)

        # Use first route midpoint for shared live data fetch
        first_route_wps = payload.routes[0].waypoints if payload.routes else []
        valid_wps = [wp for wp in first_route_wps if isinstance(wp, (list, tuple)) and len(wp) >= 2]
        mid_wp    = valid_wps[len(valid_wps) // 2] if valid_wps else [22.5726, 88.3639]
        try:
            mid_lat = float(mid_wp[0]) if abs(float(mid_wp[0])) <= 90 else float(mid_wp[1])
            mid_lng = float(mid_wp[1]) if abs(float(mid_wp[0])) <= 90 else float(mid_wp[0])
        except Exception:
            mid_lat, mid_lng = 22.5726, 88.3639

        weather_dict, aq_dict, osm_data = _enrich_context(
            mid_lat, mid_lng, weather_dict, aq_dict, payload.auto_enrich
        )

        evaluated_routes = []
        for r in payload.routes:
            res = eng.predict_route(
                waypoints=r.waypoints,
                timestamp=payload.timestamp,
                hour=payload.hour,
                day_of_week=payload.day_of_week,
                weather=weather_dict,
                lighting=payload.lighting,
                aqi_pm25=aq_dict.get("pm25"),
                osm_data=osm_data,
            )
            res["route_id"] = r.id
            if r.name:
                res["route_name"] = r.name
            if r.trafficLevel:
                res["traffic_level"] = r.trafficLevel
            evaluated_routes.append(res)

        # Sort by safety score descending for comparison summary
        evaluated_routes.sort(key=lambda x: x.get("safety_score", 0), reverse=True)

        return {
            "status":                 "success",
            "total_routes_evaluated": len(evaluated_routes),
            "routes":                 evaluated_routes,
            "live_data_sources": {
                "weather_code": weather_dict.get("weather_code"),
                "pm25":         aq_dict.get("pm25"),
                "aqi_source":   aq_dict.get("source", "default"),
            },
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Batch inference error: {str(e)}")


@app.post("/predict/point")
def predict_point(payload: PointEvaluationRequest):
    eng = _get_engine()

    try:
        weather_dict = _normalize_weather(payload.weather)
        aq_dict      = _normalize_aq(payload.air_quality)

        weather_dict, aq_dict, osm_data = _enrich_context(
            payload.lat, payload.lng, weather_dict, aq_dict, payload.auto_enrich
        )

        result = eng.predict_point(
            lat=payload.lat,
            lng=payload.lng,
            hour=payload.hour if payload.hour is not None else 12,
            day_of_week=payload.day_of_week if payload.day_of_week is not None else 0,
            weather=weather_dict,
            lighting=payload.lighting,
            aqi_pm25=aq_dict.get("pm25"),
            osm_data=osm_data,
        )
        return result

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Inference error: {str(e)}")


# ── Legacy compatibility ───────────────────────────────────────────────────────
@app.post("/predict")
def legacy_predict(payload: Dict[str, Any]):
    """Backwards compatibility for legacy single-row coordinate calls."""
    eng = _get_engine()
    lat = float(payload.get("latitude") or payload.get("lat") or 22.5726)
    lng = float(payload.get("longitude") or payload.get("lng") or 88.3639)
    hour = int(payload.get("hour") or 12)
    day  = int(payload.get("day_of_week") or 0)
    lighting = payload.get("lighting")
    weather  = {
        "condition":   payload.get("weather", "clear"),
        "temperature": payload.get("temperature", 25.0),
        "visibility":  payload.get("visibility", 10000.0),
    }
    res = eng.predict_point(lat, lng, hour=hour, day_of_week=day, weather=weather, lighting=lighting)
    return {
        "risk":          res["risk_level"],
        "safety_score":  res["safety_score"],
        "probabilities": res["probabilities"],
        "nearest_hazards": res["nearest_hazards"],
    }


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
