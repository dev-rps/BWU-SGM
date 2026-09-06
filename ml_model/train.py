"""
train.py — Production Spatial-Temporal ML Training Pipeline

Generates a representative training set grounded in the actual geographic hazard clusters
of India, augmented with cyclical temporal dynamics and environmental permutations.
Trains both a Calibrated Multi-Class Classifier and a Gradient Boosting Regressor.
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

from ml_model.data_pipeline import HazardManager
from ml_model.feature_engineering import (
    FEATURE_COLUMNS,
    extract_point_features,
    point_features_to_vector
)

def generate_synthetic_ground_truth_dataset(n_samples: int = 4000) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """
    Generates realistic training data grounded in real geospatial hazard clusters and temporal cycles.
    """
    hm = HazardManager.get_instance()
    all_hazards = (
        hm.crime_index.raw_items +
        hm.accident_index.raw_items +
        hm.flood_index.raw_items +
        hm.disaster_index.raw_items
    )

    X_list = []
    y_score_list = []
    y_class_list = []

    # Urban bounding centers for representative background points
    urban_centers = [
        (22.5726, 88.3639),  # Kolkata Core
        (22.5120, 88.3900),  # South Kolkata EM Bypass
        (22.6200, 88.4200),  # North Kolkata / Airport
        (28.6139, 77.2090),  # Delhi Central
        (28.7041, 77.1025),  # Outer Delhi
        (19.0760, 72.8777),  # Mumbai
        (12.9716, 77.5946),  # Bengaluru
        (23.5204, 87.3119),  # Durgapur
        (23.6889, 86.9661),  # Asansol
        (21.6266, 87.5074),  # Digha Coastal
    ]

    weather_conditions = [
        {"condition": "clear", "temp": 28, "visibility": 10000},
        {"condition": "clouds", "temp": 26, "visibility": 8000},
        {"condition": "fog", "temp": 14, "visibility": 1200},
        {"condition": "rain", "temp": 22, "visibility": 3500},
        {"condition": "storm", "temp": 20, "visibility": 1500}
    ]

    lighting_statuses = ["daylight", "well_lit", "poorly_lit", "dark"]

    print(f"[Training] Generating {n_samples} spatial-temporal ground-truth data points...")

    for i in range(n_samples):
        # 60% of samples generated near real hazard clusters with varying jitter
        # 40% generated across urban/regional zones
        if random.random() < 0.60 and all_hazards:
            target_hazard = random.choice(all_hazards)
            h_lat = float(target_hazard.get("lat") or target_hazard.get("latitude") or 22.57)
            h_lng = float(target_hazard.get("lng") or target_hazard.get("lon") or 88.36)

            # Jitter from 0m to 3000m (approx 0.0001 deg ~ 11m)
            jitter_dist_deg = random.choice([
                random.uniform(0.0001, 0.002),   # 10m - 200m (Direct hazard corridor)
                random.uniform(0.002, 0.008),    # 200m - 900m (Buffer zone)
                random.uniform(0.008, 0.030),    # 900m - 3.3km (Peripheral)
            ])
            angle = random.uniform(0, 2 * math.pi)
            lat = h_lat + jitter_dist_deg * math.cos(angle)
            lng = h_lng + jitter_dist_deg * math.sin(angle)
        else:
            center_lat, center_lng = random.choice(urban_centers)
            lat = center_lat + random.uniform(-0.15, 0.15)
            lng = center_lng + random.uniform(-0.15, 0.15)

        hour = random.randint(0, 23)
        day_of_week = random.randint(0, 6)
        weather = random.choice(weather_conditions).copy()
        weather["temp"] += random.uniform(-3, 3)
        lighting = random.choice(lighting_statuses)

        # Compute features
        feats = extract_point_features(
            lat=lat,
            lng=lng,
            hour=hour,
            day_of_week=day_of_week,
            weather_dict=weather,
            lighting_status=lighting,
            hazard_manager=hm
        )

        vec = point_features_to_vector(feats)

        # ── Realistic Calibrated Ground-Truth Safety Score Formula ─────────────
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
                score -= 3.0

        # Proximity to accident blackspots
        if feats["accident_min_dist_km"] < 0.20:
            score -= (12.0 + feats["accident_density_500m"] * 3.0)
        elif feats["accident_min_dist_km"] < 0.50:
            score -= 6.0

        # Flood & Disaster zone ingress
        if feats["in_flood_zone"] > 0.5:
            score -= 14.0
        elif feats["flood_min_dist_km"] < 0.5:
            score -= 5.0

        if feats["in_disaster_zone"] > 0.5:
            score -= 12.0

        # Weather & lighting impact
        if feats["weather_severity"] >= 3.0:  # Rain or storm
            score -= 8.0
            if feats["in_flood_zone"] > 0.5:
                score -= 6.0  # Compound flood + storm penalty
        elif feats["weather_severity"] >= 2.0:  # Fog or mist
            score -= 4.0

        if feats["visibility_km"] < 2.0:
            score -= 5.0

        if feats["lighting_score"] == 0.0:  # Dark unlit stretch
            score -= 8.0
        elif feats["lighting_score"] == 1.0:  # Poorly lit
            score -= 4.0

        # Add slight natural Gaussian noise
        score += random.gauss(0, 1.5)
        score = float(np.clip(score, 10.0, 100.0))

        # Class categorization
        if score >= 75.0:
            label = "Low"      # Low risk / Safe
        elif score >= 55.0:
            label = "Medium"   # Moderate risk
        else:
            label = "High"     # High risk

        X_list.append(vec)
        y_score_list.append(score)
        y_class_list.append(label)

    return np.array(X_list), np.array(y_score_list), np.array(y_class_list)

def train_and_save_model(output_dir: str = "ml_model"):
    """
    Trains production models and serializes artifacts.
    """
    os.makedirs(output_dir, exist_ok=True)
    X, y_score, y_class = generate_synthetic_ground_truth_dataset(n_samples=5000)

    X_train, X_test, y_score_train, y_score_test, y_class_train, y_class_test = train_test_split(
        X, y_score, y_class, test_size=0.2, random_state=42, stratify=y_class
    )

    print("\n[Training] Training Multi-Class Risk Classifier (Random Forest)...")
    clf = RandomForestClassifier(
        n_estimators=120,
        max_depth=14,
        min_samples_split=4,
        class_weight="balanced",
        random_state=42,
        n_jobs=-1
    )
    clf.fit(X_train, y_class_train)

    y_pred_class = clf.predict(X_test)
    print("\n--- Classification Report ---")
    print(classification_report(y_test_class := y_class_test, y_pred_class))

    print("\n[Training] Training Continuous Safety Score Regressor (Gradient Boosting)...")
    reg = GradientBoostingRegressor(
        n_estimators=100,
        max_depth=5,
        learning_rate=0.08,
        random_state=42
    )
    reg.fit(X_train, y_score_train)

    y_pred_score = reg.predict(X_test)
    rmse = np.sqrt(mean_squared_error(y_score_test, y_pred_score))
    r2 = r2_score(y_score_test, y_pred_score)
    print(f"--- Regressor Metrics --- RMSE: {rmse:.2f}, R2 Score: {r2:.4f}")

    # Feature importances
    importances = clf.feature_importances_
    feat_imp_dict = {
        col: round(float(imp), 4)
        for col, imp in sorted(zip(FEATURE_COLUMNS, importances), key=lambda x: x[1], reverse=True)
    }
    print("\nTop 7 Influential Features:")
    for col, imp in list(feat_imp_dict.items())[:7]:
        print(f"  - {col}: {imp * 100:.1f}%")

    model_bundle = {
        "classifier": clf,
        "regressor": reg,
        "feature_names": FEATURE_COLUMNS,
        "classes": clf.classes_.tolist(),
        "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "model_version": "2.0.0-geospatial-balltree"
    }

    model_path = os.path.join(output_dir, "model.pkl")
    meta_path = os.path.join(output_dir, "model_meta.json")

    joblib.dump(model_bundle, model_path)
    print(f"\n[Saved] Serialized model bundle to: {model_path}")

    meta = {
        "version": "2.0.0",
        "algorithm_classifier": "RandomForestClassifier",
        "algorithm_regressor": "GradientBoostingRegressor",
        "feature_columns": FEATURE_COLUMNS,
        "feature_importances": feat_imp_dict,
        "classes": clf.classes_.tolist(),
        "metrics": {
            "regressor_rmse": round(float(rmse), 2),
            "regressor_r2": round(float(r2), 4)
        },
        "training_samples": len(X),
        "trained_at": model_bundle["created_at"]
    }
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)
    print(f"[Saved] Model metadata saved to: {meta_path}")

if __name__ == "__main__":
    train_and_save_model()
