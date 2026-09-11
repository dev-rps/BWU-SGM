"""
train.py — Production Spatial-Temporal ML Training Pipeline (v3.0.0)

Generates a representative training set grounded in the actual geographic hazard clusters
of West Bengal, augmented with cyclical temporal dynamics and environmental permutations.

v3.0.0 Changes per REALTIME_SAFETY_DATA_INTEGRATION.md §7:
  - Expanded to 26-feature vector (added AQI, air_quality_severity, police_proximity_km, road_hierarchy_rank)
  - WMO weather code-based severity (numeric codes, not text strings)
  - Improved urban/rural AQI simulation (Kolkata: 80–150 μg/m³, rural WB: 15–50)
  - Police proximity derived from spatial context
  - Road hierarchy rank per OSM taxonomy
  - 8,000 training samples (was 5,000) for better class balance
  - Updated ground-truth score formula to reflect new features
"""

import math
import os
import json
import time
import random
import numpy as np
import pandas as pd
from typing import Dict, Any, List, Tuple
from sklearn.ensemble import RandomForestClassifier, GradientBoostingRegressor
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, mean_squared_error, r2_score
import joblib

try:
    from ml_model.data_pipeline import HazardManager
    from ml_model.feature_engineering import (
        FEATURE_COLUMNS,
        WMO_WEATHER_CODE_MAP,
        extract_point_features,
        point_features_to_vector,
    )
except ImportError:
    from data_pipeline import HazardManager
    from feature_engineering import (
        FEATURE_COLUMNS,
        WMO_WEATHER_CODE_MAP,
        extract_point_features,
        point_features_to_vector,
    )


# ── WMO code scenario pool (representative WB weather events) ─────────────────
# Per REALTIME_SAFETY_DATA_INTEGRATION.md §6.2
WMO_WEATHER_SCENARIOS = [
    {"weather_code": 0,  "temperature": 32, "visibility": 12000, "precipitation": 0.0},   # Clear
    {"weather_code": 2,  "temperature": 28, "visibility": 9000,  "precipitation": 0.0},   # Partly cloudy
    {"weather_code": 3,  "temperature": 26, "visibility": 7000,  "precipitation": 0.0},   # Overcast
    {"weather_code": 45, "temperature": 18, "visibility": 800,   "precipitation": 0.0},   # Fog
    {"weather_code": 48, "temperature": 15, "visibility": 600,   "precipitation": 0.0},   # Rime fog
    {"weather_code": 51, "temperature": 24, "visibility": 5000,  "precipitation": 0.8},   # Light drizzle
    {"weather_code": 61, "temperature": 22, "visibility": 4000,  "precipitation": 3.5},   # Slight rain
    {"weather_code": 63, "temperature": 21, "visibility": 2500,  "precipitation": 8.0},   # Moderate rain
    {"weather_code": 65, "temperature": 20, "visibility": 1800,  "precipitation": 15.0},  # Heavy rain
    {"weather_code": 80, "temperature": 22, "visibility": 2000,  "precipitation": 12.0},  # Rain showers
    {"weather_code": 82, "temperature": 21, "visibility": 1200,  "precipitation": 25.0},  # Violent showers
    {"weather_code": 95, "temperature": 24, "visibility": 1500,  "precipitation": 18.0},  # Thunderstorm
]

# ── Urban zone definitions for AQI and road rank simulation ──────────────────
URBAN_ZONES = [
    {
        "name": "Kolkata Core",
        "center": (22.5726, 88.3639),
        "aqi_range":   (80, 160),
        "road_ranks":  [0.85, 0.65, 0.45, 0.85],  # mostly primary/secondary
        "police_range":(0.3, 2.5),
    },
    {
        "name": "South Kolkata EM Bypass",
        "center": (22.5120, 88.3900),
        "aqi_range":   (70, 130),
        "road_ranks":  [1.0, 0.85, 0.65],
        "police_range":(0.5, 3.0),
    },
    {
        "name": "North Kolkata / Airport",
        "center": (22.6200, 88.4200),
        "aqi_range":   (60, 120),
        "road_ranks":  [1.0, 0.85, 0.65, 0.45],
        "police_range":(0.4, 2.8),
    },
    {
        "name": "Howrah",
        "center": (22.5958, 88.2636),
        "aqi_range":   (75, 145),
        "road_ranks":  [0.85, 0.65, 0.45],
        "police_range":(0.5, 3.5),
    },
    {
        "name": "Durgapur Industrial",
        "center": (23.5204, 87.3119),
        "aqi_range":   (90, 200),  # industrial — higher PM2.5
        "road_ranks":  [1.0, 0.85, 0.65],
        "police_range":(0.8, 4.0),
    },
    {
        "name": "Asansol",
        "center": (23.6889, 86.9661),
        "aqi_range":   (85, 175),
        "road_ranks":  [1.0, 0.85, 0.65, 0.45],
        "police_range":(0.6, 3.5),
    },
    {
        "name": "Siliguri",
        "center": (26.7271, 88.3953),
        "aqi_range":   (30, 80),  # cleaner air in North Bengal
        "road_ranks":  [0.85, 0.65, 0.45],
        "police_range":(0.5, 3.0),
    },
    {
        "name": "Barasat Peri-urban",
        "center": (22.7230, 88.4815),
        "aqi_range":   (55, 110),
        "road_ranks":  [0.65, 0.45, 0.35],
        "police_range":(1.0, 5.0),
    },
    {
        "name": "Digha Coastal",
        "center": (21.6266, 87.5074),
        "aqi_range":   (15, 45),  # coastal — low AQI
        "road_ranks":  [0.85, 0.45, 0.35, 0.1],
        "police_range":(1.5, 7.0),
    },
    {
        "name": "Rural West Bengal",
        "center": (23.2, 87.8),
        "aqi_range":   (15, 50),
        "road_ranks":  [0.45, 0.35, 0.1, 0.1],
        "police_range":(2.0, 10.0),
    },
]

LIGHTING_STATUSES = ["daylight", "well_lit", "poorly_lit", "dark"]


def generate_synthetic_ground_truth_dataset(
    n_samples: int = 8000,
) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """
    Generates realistic 26-feature training data grounded in real geospatial hazard
    clusters and temporal cycles per REALTIME_SAFETY_DATA_INTEGRATION.md §7.

    Mix: 60% hazard-cluster-proximate samples, 40% broad urban/rural samples.
    """
    hm = HazardManager.get_instance()
    all_hazards = (
        hm.crime_index.raw_items +
        hm.accident_index.raw_items +
        hm.flood_index.raw_items +
        hm.disaster_index.raw_items
    )

    X_list, y_score_list, y_class_list = [], [], []

    print(f"[Training] Generating {n_samples} 26-feature spatial-temporal ground-truth points...")

    for i in range(n_samples):
        # ── Choose sample location ────────────────────────────────────────────
        zone = random.choice(URBAN_ZONES)
        center_lat, center_lng = zone["center"]

        if random.random() < 0.60 and all_hazards:
            # Near real hazard cluster (varying jitter)
            target_hazard = random.choice(all_hazards)
            h_lat = float(target_hazard.get("lat") or target_hazard.get("latitude") or center_lat)
            h_lng = float(target_hazard.get("lng") or target_hazard.get("lon") or center_lng)
            jitter = random.choice([
                random.uniform(0.0001, 0.002),   # 10m–200m
                random.uniform(0.002, 0.008),    # 200m–900m
                random.uniform(0.008, 0.030),    # 900m–3.3km
            ])
            angle = random.uniform(0, 2 * math.pi)
            lat   = h_lat + jitter * math.cos(angle)
            lng   = h_lng + jitter * math.sin(angle)
        else:
            # Broad urban/rural background point
            lat = center_lat + random.uniform(-0.12, 0.12)
            lng = center_lng + random.uniform(-0.12, 0.12)

        # ── Temporal context ──────────────────────────────────────────────────
        hour        = random.randint(0, 23)
        day_of_week = random.randint(0, 6)

        # ── Weather: WMO code-based scenario ─────────────────────────────────
        wx_scenario = random.choice(WMO_WEATHER_SCENARIOS).copy()
        wx_scenario["temperature"] += random.uniform(-4, 4)
        wx_scenario["visibility"]  = max(200, wx_scenario["visibility"] + random.uniform(-500, 500))

        # ── Lighting ─────────────────────────────────────────────────────────
        lighting = random.choice(LIGHTING_STATUSES)

        # ── AQI: zone-aware simulation ────────────────────────────────────────
        aqi_lo, aqi_hi = zone["aqi_range"]
        aqi_pm25 = random.uniform(aqi_lo, aqi_hi)

        # ── Road hierarchy: zone-aware ────────────────────────────────────────
        road_hierarchy_rank = random.choice(zone["road_ranks"])

        # ── Police proximity: zone-aware ──────────────────────────────────────
        p_lo, p_hi = zone["police_range"]
        police_proximity_km = random.uniform(p_lo, p_hi)

        # ── Extract 26-feature vector ────────────────────────────────────────
        try:
            feats = extract_point_features(
                lat=lat,
                lng=lng,
                hour=hour,
                day_of_week=day_of_week,
                weather_dict=wx_scenario,
                lighting_status=lighting,
                hazard_manager=hm,
                aqi_pm25=aqi_pm25,
                police_proximity_km=police_proximity_km,
                road_hierarchy_rank=road_hierarchy_rank,
            )
        except Exception as e:
            print(f"[Warning] Sample {i} feature extraction failed: {e}")
            continue

        vec = point_features_to_vector(feats)

        # ── Realistic Calibrated Ground-Truth Safety Score Formula ────────────
        score = 96.0

        # Proximity to crime
        if feats["crime_min_dist_km"] < 0.15:
            score -= (14.0 + feats["crime_density_500m"] * 3.0)
        elif feats["crime_min_dist_km"] < 0.40:
            score -= (8.0 + feats["crime_density_500m"] * 1.5)
        elif feats["crime_min_dist_km"] < 1.00:
            score -= 4.0

        # Crime night-time amplification
        if feats["is_night"] > 0.5:
            if feats["crime_min_dist_km"] < 0.50:
                score -= 6.0
            else:
                score -= 2.5

        # Accident blackspots
        if feats["accident_min_dist_km"] < 0.20:
            score -= (12.0 + feats["accident_density_500m"] * 3.0)
        elif feats["accident_min_dist_km"] < 0.50:
            score -= 6.0
        elif feats["accident_min_dist_km"] < 1.0:
            score -= 2.0

        # Flood & disaster zones
        if feats["in_flood_zone"] > 0.5:
            score -= 14.0
        elif feats["flood_min_dist_km"] < 0.5:
            score -= 5.0
        if feats["in_disaster_zone"] > 0.5:
            score -= 12.0

        # Weather impact (WMO code driven via weather_severity)
        ws = feats["weather_severity"]
        if ws >= 4.0:     # Thunderstorm
            score -= 14.0
            if feats["in_flood_zone"] > 0.5:
                score -= 6.0
        elif ws >= 3.5:   # Violent showers
            score -= 10.0
        elif ws >= 2.8:   # Moderate/heavy rain
            score -= 6.0
            if feats["in_flood_zone"] > 0.5:
                score -= 4.0
        elif ws >= 2.5:   # Fog
            score -= 5.0
        elif ws >= 1.0:   # Drizzle / light rain
            score -= 2.0

        # Visibility
        if feats["visibility_km"] < 1.0:
            score -= 8.0
        elif feats["visibility_km"] < 2.0:
            score -= 5.0
        elif feats["visibility_km"] < 4.0:
            score -= 2.0

        # Precipitation risk
        if feats["precipitation_risk"] > 0.7:
            score -= 4.0
        elif feats["precipitation_risk"] > 0.4:
            score -= 2.0

        # Lighting
        l_score = feats["lighting_score"]
        if l_score == 0.0:      # Dark unlit
            score -= 9.0
        elif l_score < 1.5:     # Poorly lit
            score -= 4.5
        elif l_score < 2.5:     # Moderate
            score -= 1.5

        # AQI penalty (new feature)
        aq_sev = feats["air_quality_severity"]
        if aq_sev >= 2.5:      # Unhealthy / very unhealthy
            score -= 6.0
        elif aq_sev >= 1.8:    # Unhealthy sensitive
            score -= 3.0
        elif aq_sev >= 1.0:    # Moderate
            score -= 1.5

        # Police proximity penalty (new feature) — distance means lower surveillance
        pp = feats["police_proximity_km"]
        if pp > 8.0:
            score -= 5.0
        elif pp > 5.0:
            score -= 3.0
        elif pp > 3.0:
            score -= 1.0

        # Road hierarchy bonus/penalty (new feature)
        rr = feats["road_hierarchy_rank"]
        if rr >= 1.0:           # Expressway / NH — inherently safer by design
            score += 4.0
        elif rr >= 0.85:        # Primary
            score += 2.0
        elif rr <= 0.1:         # Track / path
            score -= 8.0
        elif rr <= 0.35:        # Residential / local
            score -= 3.0

        # Gaussian noise for natural variance
        score += random.gauss(0, 1.8)
        score  = float(np.clip(score, 10.0, 100.0))

        # Class label
        if score >= 75.0:   label = "Low"     # Safe
        elif score >= 55.0: label = "Medium"  # Moderate
        else:               label = "High"    # Dangerous

        X_list.append(vec)
        y_score_list.append(score)
        y_class_list.append(label)

    print(f"[Training] Generated {len(X_list)} valid samples.")
    return np.array(X_list), np.array(y_score_list), np.array(y_class_list)


def train_and_save_model(output_dir: str = "ml_model"):
    """Trains production 26-feature models and serializes artifacts."""
    os.makedirs(output_dir, exist_ok=True)

    # Backup existing model before overwrite
    model_path = os.path.join(output_dir, "model.pkl")
    if os.path.exists(model_path):
        backup_path = model_path.replace(".pkl", f"_backup_{int(time.time())}.pkl")
        import shutil
        shutil.copy2(model_path, backup_path)
        print(f"[Training] Backed up existing model to: {backup_path}")

    X, y_score, y_class = generate_synthetic_ground_truth_dataset(n_samples=8000)

    print(f"\n[Training] Feature vector shape: {X.shape}")
    print(f"[Training] Class distribution: {dict(zip(*np.unique(y_class, return_counts=True)))}")

    X_train, X_test, y_score_train, y_score_test, y_class_train, y_class_test = train_test_split(
        X, y_score, y_class,
        test_size=0.20,
        random_state=42,
        stratify=y_class
    )

    # ── Train Multi-Class Risk Classifier ────────────────────────────────────
    print("\n[Training] Training Multi-Class Risk Classifier (Random Forest, 150 estimators)...")
    clf = RandomForestClassifier(
        n_estimators=150,
        max_depth=16,
        min_samples_split=4,
        min_samples_leaf=2,
        class_weight="balanced",
        random_state=42,
        n_jobs=-1,
    )
    clf.fit(X_train, y_class_train)

    y_pred_class = clf.predict(X_test)
    print("\n--- Classification Report ---")
    print(classification_report(y_class_test, y_pred_class))

    # ── Train Continuous Score Regressor ─────────────────────────────────────
    print("[Training] Training Safety Score Regressor (Gradient Boosting, 150 estimators)...")
    reg = GradientBoostingRegressor(
        n_estimators=150,
        max_depth=5,
        learning_rate=0.07,
        subsample=0.85,
        random_state=42,
    )
    reg.fit(X_train, y_score_train)

    y_pred_score = reg.predict(X_test)
    rmse = float(np.sqrt(mean_squared_error(y_score_test, y_pred_score)))
    r2   = float(r2_score(y_score_test, y_pred_score))
    print(f"--- Regressor Metrics: RMSE={rmse:.2f}, R²={r2:.4f} ---")

    # ── Feature importances ───────────────────────────────────────────────────
    importances = clf.feature_importances_
    feat_imp_dict = {
        col: round(float(imp), 4)
        for col, imp in sorted(
            zip(FEATURE_COLUMNS, importances),
            key=lambda x: x[1], reverse=True
        )
    }
    print("\nTop 10 Influential Features (Random Forest):")
    for col, imp in list(feat_imp_dict.items())[:10]:
        print(f"  - {col:35s}: {imp * 100:.1f}%")

    # ── Serialize model bundle ────────────────────────────────────────────────
    model_bundle = {
        "classifier":    clf,
        "regressor":     reg,
        "feature_names": FEATURE_COLUMNS,
        "classes":       clf.classes_.tolist(),
        "created_at":    time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "model_version": "3.0.0-26feature-live-data",
    }

    joblib.dump(model_bundle, model_path)
    print(f"\n[Saved] Model bundle -> {model_path}")

    # ── Save metadata ─────────────────────────────────────────────────────────
    meta_path = os.path.join(output_dir, "model_meta.json")
    meta = {
        "version":                "3.0.0",
        "algorithm_classifier":   "RandomForestClassifier",
        "algorithm_regressor":    "GradientBoostingRegressor",
        "n_features":             len(FEATURE_COLUMNS),
        "feature_columns":        FEATURE_COLUMNS,
        "feature_importances":    feat_imp_dict,
        "classes":                clf.classes_.tolist(),
        "metrics": {
            "regressor_rmse": round(rmse, 2),
            "regressor_r2":   round(r2, 4),
        },
        "training_samples": len(X),
        "trained_at":       model_bundle["created_at"],
        "data_sources": {
            "weather":         "Open-Meteo (WMO codes) + historical simulation",
            "air_quality":     "OpenAQ v3 / Open-Meteo AQ simulation",
            "road_infra":      "OSM Overpass simulation (road rank, police, lighting)",
            "spatial_hazards": "BallTree BallTree (MoRTH + crime + flood + disaster)",
        },
    }
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)
    print(f"[Saved] Model metadata -> {meta_path}")
    print(f"\n[OK] Training complete: {len(FEATURE_COLUMNS)}-feature model ready.")


if __name__ == "__main__":
    train_and_save_model()
