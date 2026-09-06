"""
feature_engineering.py — Production Spatial-Temporal & Environmental Feature Pipeline

Transforms raw coordinate waypoints, timestamps, and weather metadata into
normalized numerical feature vectors for ML models.
"""

import math
from datetime import datetime
from typing import Dict, Any, List, Optional
import numpy as np
from ml_model.data_pipeline import HazardManager

FEATURE_COLUMNS = [
    # Spatial Proximity Features (km)
    "crime_min_dist_km",
    "crime_density_500m",
    "crime_weighted_risk",
    "accident_min_dist_km",
    "accident_density_500m",
    "accident_weighted_risk",
    "flood_min_dist_km",
    "in_flood_zone",
    "disaster_min_dist_km",
    "in_disaster_zone",

    # Cyclical Temporal Features
    "hour_sin",
    "hour_cos",
    "day_sin",
    "day_cos",
    "is_night",
    "is_weekend",
    "is_rush_hour",

    # Environmental & Weather Factors
    "temperature",
    "visibility_km",
    "weather_severity",
    "lighting_score",
    "precipitation_risk"
]

SEVERITY_WEIGHTS = {
    "critical": 3.0,
    "high": 2.2,
    "medium": 1.4,
    "low": 0.8,
    "none": 0.0
}

WEATHER_SEVERITY_MAP = {
    "clear": 0.0,
    "clouds": 0.5,
    "cloudy": 0.5,
    "partly cloudy": 0.4,
    "fog": 2.0,
    "foggy": 2.0,
    "mist": 1.8,
    "haze": 1.5,
    "rain": 2.5,
    "rainy": 2.5,
    "showers": 2.2,
    "storm": 4.0,
    "thunderstorm": 4.0,
    "severe": 4.0
}

LIGHTING_SCORE_MAP = {
    "dark": 0.0,
    "poorly_lit": 1.0,
    "poor": 1.0,
    "well_lit": 2.5,
    "good": 2.5,
    "daylight": 3.0
}

def extract_point_features(
    lat: float,
    lng: float,
    hour: int = 12,
    day_of_week: int = 0,
    weather_dict: Optional[Dict[str, Any]] = None,
    lighting_status: Optional[str] = None,
    hazard_manager: Optional[HazardManager] = None
) -> Dict[str, float]:
    """
    Computes spatial-temporal feature dictionary for a single coordinate point.
    """
    hm = hazard_manager or HazardManager.get_instance()
    weather_dict = weather_dict or {}

    # 1. Geodesic Proximity via BallTree
    c_dist, c_nearest = hm.crime_index.query_nearest(lat, lng)
    c_radius_hits = hm.crime_index.query_radius(lat, lng, radius_meters=1000.0)
    c_density_500m = len([h for h in c_radius_hits if h[0] <= 500.0])
    c_weighted_risk = sum(SEVERITY_WEIGHTS.get(str(h[1].get("severity", "medium")).lower(), 1.0) * max(0.0, 1.0 - h[0] / 1000.0) for h in c_radius_hits)

    a_dist, a_nearest = hm.accident_index.query_nearest(lat, lng)
    a_radius_hits = hm.accident_index.query_radius(lat, lng, radius_meters=1000.0)
    a_density_500m = len([h for h in a_radius_hits if h[0] <= 500.0])
    a_weighted_risk = sum(SEVERITY_WEIGHTS.get(str(h[1].get("severity", "high")).lower(), 2.0) * max(0.0, 1.0 - h[0] / 1000.0) for h in a_radius_hits)

    f_dist, f_nearest = hm.flood_index.query_nearest(lat, lng)
    in_flood_zone = 0.0
    if f_nearest and f_dist <= float(f_nearest.get("radius", 1500)):
        in_flood_zone = 1.0

    d_dist, d_nearest = hm.disaster_index.query_nearest(lat, lng)
    in_disaster_zone = 0.0
    if d_nearest and d_dist <= float(d_nearest.get("radius", 2000)):
        in_disaster_zone = 1.0

    # 2. Cyclical Temporal Transforms
    hour_norm = (hour % 24)
    day_norm = (day_of_week % 7)
    hour_rad = 2.0 * math.pi * hour_norm / 24.0
    day_rad = 2.0 * math.pi * day_norm / 7.0

    hour_sin = math.sin(hour_rad)
    hour_cos = math.cos(hour_rad)
    day_sin = math.sin(day_rad)
    day_cos = math.cos(day_rad)

    is_night = 1.0 if (hour_norm < 6 or hour_norm >= 20) else 0.0
    is_weekend = 1.0 if day_norm >= 5 else 0.0
    is_rush_hour = 1.0 if (not is_weekend and hour_norm in [8, 9, 10, 17, 18, 19, 20]) else 0.0

    # 3. Weather & Lighting Harmonization
    temp = float(weather_dict.get("temperature") or weather_dict.get("temp") or 26.0)
    vis_meters = float(weather_dict.get("visibility") or 10000.0)
    vis_km = min(15.0, vis_meters / 1000.0 if vis_meters > 50 else vis_meters)

    cond_raw = str(weather_dict.get("condition") or weather_dict.get("main") or "clear").lower().strip()
    w_sev = WEATHER_SEVERITY_MAP.get(cond_raw, 0.0)
    for key, val in WEATHER_SEVERITY_MAP.items():
        if key in cond_raw:
            w_sev = val
            break

    if lighting_status:
        l_score = LIGHTING_SCORE_MAP.get(str(lighting_status).lower().strip(), 2.0)
    else:
        l_score = 0.5 if is_night else 3.0

    precip_risk = 0.0
    if w_sev >= 3.0:
        precip_risk = 0.9
    elif w_sev >= 2.0:
        precip_risk = 0.5

    return {
        "crime_min_dist_km": min(20.0, c_dist / 1000.0),
        "crime_density_500m": float(c_density_500m),
        "crime_weighted_risk": float(c_weighted_risk),
        "accident_min_dist_km": min(20.0, a_dist / 1000.0),
        "accident_density_500m": float(a_density_500m),
        "accident_weighted_risk": float(a_weighted_risk),
        "flood_min_dist_km": min(20.0, f_dist / 1000.0),
        "in_flood_zone": in_flood_zone,
        "disaster_min_dist_km": min(20.0, d_dist / 1000.0),
        "in_disaster_zone": in_disaster_zone,
        "hour_sin": hour_sin,
        "hour_cos": hour_cos,
        "day_sin": day_sin,
        "day_cos": day_cos,
        "is_night": is_night,
        "is_weekend": is_weekend,
        "is_rush_hour": is_rush_hour,
        "temperature": temp,
        "visibility_km": vis_km,
        "weather_severity": w_sev,
        "lighting_score": l_score,
        "precipitation_risk": precip_risk
    }

def point_features_to_vector(features: Dict[str, float]) -> np.ndarray:
    """Converts a feature dict into a 1D numpy array aligned with FEATURE_COLUMNS."""
    return np.array([features[col] for col in FEATURE_COLUMNS], dtype=np.float32)
