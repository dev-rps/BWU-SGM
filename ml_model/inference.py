"""
inference.py — High-Performance Spatial-Temporal Route & Point Inference Engine

Evaluates route polyline payloads against trained ML models with BallTree spatial queries,
segment bottleneck detection, and explainable AI insights.
"""

import os
try:
    import joblib
except ImportError:
    from sklearn.utils import _joblib as joblib
import numpy as np
from datetime import datetime
from typing import List, Dict, Any, Tuple, Optional

from ml_model.data_pipeline import HazardManager
from ml_model.feature_engineering import (
    FEATURE_COLUMNS,
    extract_point_features,
    point_features_to_vector
)

class SafetyInferenceEngine:
    _instance: Optional['SafetyInferenceEngine'] = None

    def __init__(self, model_path: Optional[str] = None):
        if model_path is None:
            base_dir = os.path.dirname(os.path.abspath(__file__))
            model_path = os.path.join(base_dir, "model.pkl")
        self.model_path = model_path
        self.hazard_manager = HazardManager.get_instance()
        self.load_model()

    @classmethod
    def get_instance(cls) -> 'SafetyInferenceEngine':
        if cls._instance is None:
            cls._instance = SafetyInferenceEngine()
        return cls._instance

    def load_model(self):
        if not os.path.exists(self.model_path):
            raise FileNotFoundError(f"Model file not found at {self.model_path}. Run train.py first.")
        bundle = joblib.load(self.model_path)
        self.classifier = bundle["classifier"]
        self.regressor = bundle["regressor"]
        self.feature_names = bundle.get("feature_names", FEATURE_COLUMNS)
        self.classes = bundle.get("classes", ["High", "Low", "Medium"])

    def _normalize_coord(self, pt: Any) -> Optional[Tuple[float, float]]:
        """Extracts (lat, lng) with robust heuristic handling of [lng, lat] inversion."""
        if pt is None:
            return None
        lat, lng = None, None
        if isinstance(pt, (list, tuple)) and len(pt) >= 2:
            v0, v1 = float(pt[0]), float(pt[1])
            # In India, Lng is ~68-97, Lat is ~8-37
            if abs(v0) > abs(v1) and abs(v0) > 45.0:
                lng, lat = v0, v1
            else:
                lat, lng = v0, v1
        elif isinstance(pt, dict):
            lat = float(pt.get("lat") or pt.get("latitude"))
            lng = float(pt.get("lng") or pt.get("lon") or pt.get("longitude"))

        if lat is not None and lng is not None:
            if -90 <= lat <= 90 and -180 <= lng <= 180:
                return lat, lng
        return None

    def predict_point(
        self,
        lat: float,
        lng: float,
        hour: int = 12,
        day_of_week: int = 0,
        weather: Optional[Dict[str, Any]] = None,
        lighting: Optional[str] = None
    ) -> Dict[str, Any]:
        """Evaluates a single geospatial coordinate point."""
        feats = extract_point_features(
            lat=lat,
            lng=lng,
            hour=hour,
            day_of_week=day_of_week,
            weather_dict=weather or {},
            lighting_status=lighting,
            hazard_manager=self.hazard_manager
        )
        vec = point_features_to_vector(feats).reshape(1, -1)

        # Predict continuous score and discrete class
        score = float(self.regressor.predict(vec)[0])
        score = max(10, min(100, round(score)))

        probas = self.classifier.predict_proba(vec)[0]
        prob_dict = {
            cls_name: round(float(p), 4)
            for cls_name, p in zip(self.classes, probas)
        }

        # Determine calibrated Risk Level
        if score >= 75:
            risk_level = "Low"
        elif score >= 55:
            risk_level = "Medium"
        elif score >= 40:
            risk_level = "High"
        else:
            risk_level = "Critical"

        nearest_hazards = self.hazard_manager.query_all_nearest(lat, lng)

        reasons = self._generate_explainability_reasons(feats, nearest_hazards, score)

        return {
            "safety_score": int(score),
            "risk_score": round(100.0 - score, 1),
            "risk_level": risk_level,
            "probabilities": prob_dict,
            "nearest_hazards": nearest_hazards,
            "reasons": reasons,
            "features": feats
        }

    def predict_route(
        self,
        waypoints: List[Any],
        timestamp: Optional[str] = None,
        hour: Optional[int] = None,
        day_of_week: Optional[int] = None,
        weather: Optional[Dict[str, Any]] = None,
        lighting: Optional[str] = None
    ) -> Dict[str, Any]:
        """Evaluates an entire route polyline payload."""
        # Parse time context
        if hour is None or day_of_week is None:
            dt = datetime.now()
            if timestamp:
                try:
                    dt = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
                except Exception:
                    pass
            hour = dt.hour if hour is None else hour
            day_of_week = dt.weekday() if day_of_week is None else day_of_week

        # Normalize and filter coordinates
        cleaned_pts: List[Tuple[float, float]] = []
        for wp in waypoints:
            norm = self._normalize_coord(wp)
            if norm:
                cleaned_pts.append(norm)

        if not cleaned_pts:
            return {
                "error": "No valid coordinates in route payload",
                "safety_score": 70,
                "risk_score": 30.0,
                "risk_level": "Medium",
                "probabilities": {"Low": 0.33, "Medium": 0.34, "High": 0.33},
                "reasons": ["Default safety profile used: no valid coordinates received."]
            }

        # Intelligent Downsampling for real-time latency
        # Target ~25 checkpoints along route
        total_pts = len(cleaned_pts)
        if total_pts <= 25:
            sampled_pts = cleaned_pts
        else:
            step = max(1, total_pts // 25)
            sampled_pts = [cleaned_pts[i] for i in range(0, total_pts, step)]
            if cleaned_pts[-1] not in sampled_pts:
                sampled_pts.append(cleaned_pts[-1])

        # Evaluate each sampled waypoint
        sample_results = []
        min_score = 101
        bottleneck_pt = sampled_pts[0]
        bottleneck_hazards = None

        for pt in sampled_pts:
            res = self.predict_point(
                lat=pt[0],
                lng=pt[1],
                hour=hour,
                day_of_week=day_of_week,
                weather=weather,
                lighting=lighting
            )
            res["lat"] = pt[0]
            res["lng"] = pt[1]
            sample_results.append(res)

            if res["safety_score"] < min_score:
                min_score = res["safety_score"]
                bottleneck_pt = pt
                bottleneck_hazards = res["nearest_hazards"]

        # Aggregate metrics across route
        all_scores = [r["safety_score"] for r in sample_results]
        # Route safety score is weighted: 60% mean, 40% worst bottleneck point
        mean_score = float(np.mean(all_scores))
        route_safety_score = round(mean_score * 0.60 + min_score * 0.40)
        route_safety_score = max(10, min(100, route_safety_score))

        # Average class probabilities
        avg_probs = {}
        for cls_name in self.classes:
            avg_probs[cls_name] = round(float(np.mean([r["probabilities"].get(cls_name, 0.0) for r in sample_results])), 4)

        # Risk Level
        if route_safety_score >= 75:
            route_risk_level = "Low"
        elif route_safety_score >= 55:
            route_risk_level = "Medium"
        elif route_safety_score >= 40:
            route_risk_level = "High"
        else:
            route_risk_level = "Critical"

        # Global nearest hazards across the entire route
        global_nearest: Dict[str, Any] = {"crime": None, "accident": None, "flood": None, "disaster": None}
        min_dists = {"crime": float("inf"), "accident": float("inf"), "flood": float("inf"), "disaster": float("inf")}

        for r in sample_results:
            nh = r["nearest_hazards"]
            for cat in ["crime", "accident", "flood", "disaster"]:
                d = nh[cat].get("distance_m")
                if d is not None and d < min_dists[cat]:
                    min_dists[cat] = d
                    global_nearest[cat] = nh[cat]

        # Route-level explanatory reasons
        route_reasons = []
        if min_dists["accident"] < 250:
            acc = global_nearest["accident"]
            route_reasons.append(f"Accident Blackspot on path: {acc['name']} ({round(min_dists['accident'])}m)")
        if min_dists["crime"] < 200:
            cr = global_nearest["crime"]
            route_reasons.append(f"Documented Crime Hotspot nearby: {cr['name']} ({round(min_dists['crime'])}m)")
        if min_dists["flood"] < 500:
            fl = global_nearest["flood"]
            route_reasons.append(f"Flood / Waterlogging Risk Zone: {fl['name']}")
        if min_dists["disaster"] < 600:
            ds = global_nearest["disaster"]
            route_reasons.append(f"Natural Hazard Zone: {ds['name']}")

        # Weather / Lighting reasons
        w_sev = sample_results[0]["features"].get("weather_severity", 0.0)
        if w_sev >= 3.0:
            route_reasons.append("Severe rain/storm conditions: reduced road traction and braking safety.")
        elif w_sev >= 2.0:
            route_reasons.append("Fog / low visibility conditions detected.")

        if hour < 6 or hour >= 20:
            route_reasons.append("Night-time travel window: crime amplification and reduced surveillance active.")
        else:
            route_reasons.append("Daylight travel window: active pedestrian movement and standard visibility.")

        if route_safety_score >= 85:
            route_reasons.insert(0, "High overall safety index: optimal corridor with low hazard intersection.")

        # Segment risks for polyline visual styling
        segment_points = [
            {
                "lat": r["lat"],
                "lng": r["lng"],
                "score": r["safety_score"],
                "risk_level": r["risk_level"]
            }
            for r in sample_results
        ]

        return {
            "safety_score": int(route_safety_score),
            "risk_score": round(100.0 - route_safety_score, 1),
            "risk_level": route_risk_level,
            "probabilities": avg_probs,
            "bottleneck": {
                "lat": bottleneck_pt[0],
                "lng": bottleneck_pt[1],
                "safety_score": min_score,
                "hazards": bottleneck_hazards
            },
            "nearest_hazards": global_nearest,
            "reasons": route_reasons,
            "waypoints_evaluated": len(sampled_pts),
            "segments": segment_points,
            "model_version": "2.0.0-geospatial-balltree"
        }

    def _generate_explainability_reasons(
        self,
        feats: Dict[str, float],
        hazards: Dict[str, Any],
        score: float
    ) -> List[str]:
        reasons = []
        if hazards["accident"].get("distance_m") is not None and hazards["accident"]["distance_m"] <= 250:
            reasons.append(f"Accident Blackspot within {round(hazards['accident']['distance_m'])}m: {hazards['accident']['name']}")

        if hazards["crime"].get("distance_m") is not None and hazards["crime"]["distance_m"] <= 250:
            reasons.append(f"Crime Hotspot within {round(hazards['crime']['distance_m'])}m: {hazards['crime']['name']}")

        if feats.get("in_flood_zone", 0.0) > 0.5:
            reasons.append(f"Inside recorded Flood Inundation Zone: {hazards['flood']['name']}")

        if feats.get("in_disaster_zone", 0.0) > 0.5:
            reasons.append(f"Inside Natural Disaster Zone: {hazards['disaster']['name']}")

        if feats.get("is_night", 0.0) > 0.5:
            reasons.append("Night-time corridor: elevated caution advised")

        if feats.get("weather_severity", 0.0) >= 3.0:
            reasons.append("Severe weather: slippery road surfaces")

        if not reasons:
            reasons.append("Clear corridor with no immediate hazard proximity")

        return reasons
