"""
feature_engineering.py — Production Spatial-Temporal & Environmental Feature Pipeline

Transforms raw coordinate waypoints, timestamps, and weather metadata into
normalized numerical feature vectors for ML models.

Feature vector expanded to 26 dimensions per REALTIME_SAFETY_DATA_INTEGRATION.md §7:
  Spatial (10) + Temporal (7) + Environmental (6) + Road Infrastructure (3)
"""

import math
from datetime import datetime
from typing import Dict, Any, List, Optional
import numpy as np

try:
    from ml_model.data_pipeline import HazardManager
except ImportError:
    from data_pipeline import HazardManager

# ── 26-Dimensional Feature Vector Definition ─────────────────────────────────
FEATURE_COLUMNS = [
    # ── [Spatial Proximity via BallTrees] ──────────────────────────────────
    "crime_min_dist_km",           # 01 Geodesic distance to nearest crime hotspot
    "crime_density_500m",          # 02 Number of crime spots within 500m radius
    "crime_weighted_risk",         # 03 Distance-weighted severity sum
    "accident_min_dist_km",        # 04 Geodesic distance to nearest MoRTH blackspot
    "accident_density_500m",       # 05 MoRTH blackspots within 500m radius
    "accident_weighted_risk",      # 06 Fatality-weighted severity sum
    "flood_min_dist_km",           # 07 Distance to CWC flood zone
    "in_flood_zone",               # 08 Binary: 1.0 if inside flood polygon
    "disaster_min_dist_km",        # 09 Distance to disaster zone
    "in_disaster_zone",            # 10 Binary: 1.0 if inside disaster area

    # ── [Temporal Dynamics] ────────────────────────────────────────────────
    "hour_sin",                    # 11 Cyclical hour sin component
    "hour_cos",                    # 12 Cyclical hour cos component
    "day_sin",                     # 13 Cyclical day-of-week sin component
    "day_cos",                     # 14 Cyclical day-of-week cos component
    "is_night",                    # 15 1.0 if 20:00–05:59
    "is_weekend",                  # 16 1.0 if Saturday or Sunday
    "is_rush_hour",                # 17 1.0 if 08:30–10:30 or 17:30–20:30

    # ── [Environmental & Meteorological] ──────────────────────────────────
    "temperature",                 # 18 Real-time temp °C from Open-Meteo
    "visibility_km",               # 19 Visual distance km (<2km triggers penalty)
    "weather_severity",            # 20 WMO code severity mapping 0.0–4.0
    "precipitation_risk",          # 21 Continuous rain probability / rate 0.0–1.0
    "aqi_pm25",                    # 22 Real-time PM2.5 μg/m³ from OpenAQ/Open-Meteo
    "air_quality_severity",        # 23 Normalized AQI severity factor 0.0–3.0

    # ── [Road Infrastructure & Lighting (OSM)] ────────────────────────────
    "lighting_score",              # 24 0.0=Dark, 1.0=Poor, 2.5=Well-lit, 3.0=Daylight
    "police_proximity_km",         # 25 Distance to nearest police station km
    "road_hierarchy_rank",         # 26 1.0=Expressway/NH, 0.7=SH, 0.4=Local, 0.1=Alley
]

# ── Severity Weight Mapping ────────────────────────────────────────────────────
SEVERITY_WEIGHTS = {
    "critical": 3.0,
    "high":     2.2,
    "medium":   1.4,
    "low":      0.8,
    "none":     0.0
}

# ── WMO Weather Code → Severity (per REALTIME_SAFETY_DATA_INTEGRATION.md §6.2) ──
# Used when `weather_code` (integer) is provided instead of a text condition.
WMO_WEATHER_CODE_MAP = {
    0:  0.0,   # Clear sky
    1:  0.4,   # Mainly clear
    2:  0.4,   # Partly cloudy
    3:  0.4,   # Overcast
    45: 2.5,   # Fog
    48: 2.5,   # Depositing rime fog
    51: 1.0,   # Drizzle: light
    53: 1.0,   # Drizzle: moderate
    55: 1.0,   # Drizzle: dense
    56: 1.5,   # Freezing drizzle: light
    57: 1.5,   # Freezing drizzle: heavy
    61: 2.8,   # Rain: slight
    63: 2.8,   # Rain: moderate
    65: 2.8,   # Rain: heavy
    66: 3.0,   # Freezing rain: light
    67: 3.0,   # Freezing rain: heavy
    71: 2.0,   # Snow: slight
    73: 2.0,   # Snow: moderate
    75: 2.0,   # Snow: heavy
    77: 2.0,   # Snow grains
    80: 3.5,   # Rain showers: slight
    81: 3.5,   # Rain showers: moderate
    82: 3.5,   # Rain showers: violent — compound flood risk
    85: 2.5,   # Snow showers: slight
    86: 2.5,   # Snow showers: heavy
    95: 4.0,   # Thunderstorm: slight or moderate
    96: 4.0,   # Thunderstorm with slight hail
    99: 4.0,   # Thunderstorm with heavy hail
}

# ── Text condition → severity fallback (legacy) ───────────────────────────────
WEATHER_SEVERITY_MAP = {
    "clear":         0.0,
    "clouds":        0.5,
    "cloudy":        0.5,
    "partly cloudy": 0.4,
    "fog":           2.5,
    "foggy":         2.5,
    "mist":          1.8,
    "haze":          1.5,
    "drizzle":       1.0,
    "rain":          2.8,
    "rainy":         2.8,
    "showers":       3.5,
    "storm":         4.0,
    "thunderstorm":  4.0,
    "severe":        4.0,
}

# ── Lighting score lookup ─────────────────────────────────────────────────────
LIGHTING_SCORE_MAP = {
    "dark":       0.0,
    "poorly_lit": 1.0,
    "poor":       1.0,
    "well_lit":   2.5,
    "good":       2.5,
    "daylight":   3.0,
}

# ── OSM highway tag → safety rank (per REALTIME_SAFETY_DATA_INTEGRATION.md §4.3) ──
OSM_ROAD_HIERARCHY_MAP = {
    "motorway":      1.0,
    "trunk":         1.0,
    "primary":       0.85,
    "secondary":     0.65,
    "tertiary":      0.45,
    "residential":   0.35,
    "unclassified":  0.35,
    "service":       0.25,
    "track":         0.1,
    "path":          0.1,
    "footway":       0.15,
}

# ── AQI PM2.5 → severity factor (0.0–3.0) ────────────────────────────────────
def _pm25_to_severity(pm25: Optional[float]) -> float:
    """Converts PM2.5 μg/m³ to a normalized AQI severity factor 0.0–3.0."""
    if pm25 is None or pm25 <= 0:
        return 0.5  # assume fair background
    if pm25 <= 12:    return 0.0   # Good (WHO Annual guideline)
    if pm25 <= 35.4:  return 0.5   # Moderate
    if pm25 <= 55.4:  return 1.0   # Unhealthy for sensitive groups
    if pm25 <= 150.4: return 1.8   # Unhealthy
    if pm25 <= 250.4: return 2.5   # Very unhealthy
    return 3.0                      # Hazardous


def extract_point_features(
    lat: float,
    lng: float,
    hour: int = 12,
    day_of_week: int = 0,
    weather_dict: Optional[Dict[str, Any]] = None,
    lighting_status: Optional[str] = None,
    hazard_manager: Optional["HazardManager"] = None,
    aqi_pm25: Optional[float] = None,
    police_proximity_km: Optional[float] = None,
    road_hierarchy_rank: Optional[float] = None,
) -> Dict[str, float]:
    """
    Computes a 26-dimensional spatial-temporal feature dictionary for a single coordinate point.

    Args:
        lat, lng:              Coordinate of the point being evaluated.
        hour:                  Hour of day (0–23).
        day_of_week:           Day of week (0=Mon, 6=Sun).
        weather_dict:          Weather parameters. Supports 'weather_code' (int WMO),
                               'condition' (str), 'temperature', 'visibility', 'precipitation'.
        lighting_status:       Lighting hint: 'daylight', 'well_lit', 'poorly_lit', 'dark'.
        hazard_manager:        BallTree hazard manager instance.
        aqi_pm25:              Real-time PM2.5 μg/m³ from OpenAQ / Open-Meteo AQ API.
        police_proximity_km:   Distance to nearest police station in km (from OSM Overpass).
        road_hierarchy_rank:   OSM road hierarchy rank 0.1–1.0 for the corridor.

    Returns:
        Dict mapping each of the 26 FEATURE_COLUMNS to a float value.
    """
    hm = hazard_manager or HazardManager.get_instance()
    weather_dict = weather_dict or {}

    # ── 1. Geodesic Proximity via BallTrees ───────────────────────────────────
    c_dist, c_nearest = hm.crime_index.query_nearest(lat, lng)
    c_radius_hits     = hm.crime_index.query_radius(lat, lng, radius_meters=1000.0)
    c_density_500m    = len([h for h in c_radius_hits if h[0] <= 500.0])
    c_weighted_risk   = sum(
        SEVERITY_WEIGHTS.get(str(h[1].get("severity", "medium")).lower(), 1.0)
        * max(0.0, 1.0 - h[0] / 1000.0)
        for h in c_radius_hits
    )

    a_dist, a_nearest = hm.accident_index.query_nearest(lat, lng)
    a_radius_hits     = hm.accident_index.query_radius(lat, lng, radius_meters=1000.0)
    a_density_500m    = len([h for h in a_radius_hits if h[0] <= 500.0])
    a_weighted_risk   = sum(
        SEVERITY_WEIGHTS.get(str(h[1].get("severity", "high")).lower(), 2.0)
        * max(0.0, 1.0 - h[0] / 1000.0)
        for h in a_radius_hits
    )

    f_dist, f_nearest = hm.flood_index.query_nearest(lat, lng)
    in_flood_zone     = 1.0 if (f_nearest and f_dist <= float(f_nearest.get("radius", 1500))) else 0.0

    d_dist, d_nearest = hm.disaster_index.query_nearest(lat, lng)
    in_disaster_zone  = 1.0 if (d_nearest and d_dist <= float(d_nearest.get("radius", 2000))) else 0.0

    # ── 2. Cyclical Temporal Transforms ─────────────────────────────────────
    hour_norm = hour % 24
    day_norm  = day_of_week % 7
    hour_rad  = 2.0 * math.pi * hour_norm / 24.0
    day_rad   = 2.0 * math.pi * day_norm  / 7.0

    hour_sin  = math.sin(hour_rad)
    hour_cos  = math.cos(hour_rad)
    day_sin   = math.sin(day_rad)
    day_cos   = math.cos(day_rad)

    is_night    = 1.0 if (hour_norm < 6 or hour_norm >= 20) else 0.0
    is_weekend  = 1.0 if day_norm >= 5 else 0.0
    is_rush_hour = 1.0 if (
        not is_weekend and
        (8 <= hour_norm <= 10 or 17 <= hour_norm <= 20)
    ) else 0.0

    # ── 3. Weather Severity — WMO Code preferred, text condition as fallback ──
    temp      = float(weather_dict.get("temperature") or weather_dict.get("temp") or 26.0)
    vis_raw   = float(weather_dict.get("visibility") or 10000.0)
    vis_km    = min(15.0, vis_raw / 1000.0 if vis_raw > 50 else vis_raw)

    # Precipitation risk: continuous value from API if available
    precip_mm    = float(weather_dict.get("precipitation") or weather_dict.get("rain") or 0.0)
    precip_risk  = min(1.0, precip_mm / 20.0)  # 20mm/hr = saturation point

    # WMO numeric code takes priority
    w_code = weather_dict.get("weather_code")
    if w_code is not None:
        try:
            w_sev = WMO_WEATHER_CODE_MAP.get(int(w_code), 0.0)
        except (ValueError, TypeError):
            w_sev = 0.0
        # Also infer precipitation risk from WMO code if no explicit mm value
        if precip_risk == 0.0 and w_sev >= 2.8:
            precip_risk = min(1.0, (w_sev - 2.0) / 2.0)
    else:
        # Fall back to text condition
        cond_raw = str(weather_dict.get("condition") or weather_dict.get("main") or "clear").lower().strip()
        w_sev = WEATHER_SEVERITY_MAP.get(cond_raw, 0.0)
        for key, val in WEATHER_SEVERITY_MAP.items():
            if key in cond_raw:
                w_sev = max(w_sev, val)

        if precip_risk == 0.0:
            if w_sev >= 3.5:
                precip_risk = 0.95
            elif w_sev >= 2.8:
                precip_risk = 0.7
            elif w_sev >= 2.0:
                precip_risk = 0.4
            elif w_sev >= 1.0:
                precip_risk = 0.15

    # ── 4. Lighting Score ────────────────────────────────────────────────────
    if lighting_status:
        l_score = LIGHTING_SCORE_MAP.get(str(lighting_status).lower().strip(), 2.0)
    else:
        # Derive from time of day if not provided
        if is_night:
            l_score = 0.8  # assume poorly lit at night unless specified
        else:
            l_score = 3.0  # daylight

    # ── 5. Air Quality Severity (Feature 22–23) ──────────────────────────────
    pm25_val = aqi_pm25 if aqi_pm25 is not None else weather_dict.get("aqi_pm25")
    if pm25_val is None:
        # Estimate from weather + urban density heuristic if no API data
        pm25_val = 45.0 if temp > 20 else 25.0  # rough urban WB background
    pm25_float = float(pm25_val)
    aq_severity = _pm25_to_severity(pm25_float)

    # ── 6. Police Proximity (Feature 25) ────────────────────────────────────
    # If not supplied by OSM Overpass, use a heuristic based on urban density
    if police_proximity_km is not None:
        p_prox_km = float(police_proximity_km)
    else:
        # Infer from distance to nearest crime cluster (crime clusters ↔ urban areas with police)
        p_prox_km = min(10.0, max(0.3, c_dist / 1000.0 * 0.7))

    # ── 7. Road Hierarchy Rank (Feature 26) ──────────────────────────────────
    if road_hierarchy_rank is not None:
        r_rank = float(road_hierarchy_rank)
    else:
        # Default: assume secondary road (0.65) for urban WB corridors
        r_rank = 0.65

    return {
        # Spatial
        "crime_min_dist_km":    min(20.0, c_dist / 1000.0),
        "crime_density_500m":   float(c_density_500m),
        "crime_weighted_risk":  float(c_weighted_risk),
        "accident_min_dist_km": min(20.0, a_dist / 1000.0),
        "accident_density_500m": float(a_density_500m),
        "accident_weighted_risk": float(a_weighted_risk),
        "flood_min_dist_km":    min(20.0, f_dist / 1000.0),
        "in_flood_zone":        in_flood_zone,
        "disaster_min_dist_km": min(20.0, d_dist / 1000.0),
        "in_disaster_zone":     in_disaster_zone,
        # Temporal
        "hour_sin":             hour_sin,
        "hour_cos":             hour_cos,
        "day_sin":              day_sin,
        "day_cos":              day_cos,
        "is_night":             is_night,
        "is_weekend":           is_weekend,
        "is_rush_hour":         is_rush_hour,
        # Environmental
        "temperature":          temp,
        "visibility_km":        vis_km,
        "weather_severity":     w_sev,
        "precipitation_risk":   precip_risk,
        "aqi_pm25":             min(500.0, pm25_float),
        "air_quality_severity": aq_severity,
        # Road Infrastructure
        "lighting_score":       l_score,
        "police_proximity_km":  min(20.0, p_prox_km),
        "road_hierarchy_rank":  r_rank,
    }


def point_features_to_vector(features: Dict[str, float]) -> np.ndarray:
    """Converts a 26-feature dict into a 1D numpy array aligned with FEATURE_COLUMNS."""
    return np.array([features[col] for col in FEATURE_COLUMNS], dtype=np.float32)
