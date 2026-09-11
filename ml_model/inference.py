"""
inference.py — High-Performance Spatial-Temporal Route & Point Inference Engine

Evaluates route polyline payloads against trained ML models with BallTree spatial queries,
segment bottleneck detection, and explainable AI insights.

v3.0.0 Changes:
  - Route score weighting: 80% mean + 20% worst-point (was 60/40 — bottleneck over-dominated)
  - Improved _generate_explainability_reasons: factual, quantified strings with hazard names/distances
  - predict_route and predict_point accept live AQI and OSM infrastructure data
  - 26-feature vector support with graceful backward compatibility
"""

import os
import math
try:
    import joblib
except ImportError:
    from sklearn.utils import _joblib as joblib
import numpy as np
from datetime import datetime
from typing import List, Dict, Any, Tuple, Optional

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


# ── AQI label helpers ─────────────────────────────────────────────────────────
def _pm25_label(pm25: Optional[float]) -> str:
    if pm25 is None:
        return "Unknown"
    if pm25 <= 12:    return "Good"
    if pm25 <= 35.4:  return "Moderate"
    if pm25 <= 55.4:  return "Unhealthy (sensitive)"
    if pm25 <= 150.4: return "Unhealthy"
    if pm25 <= 250.4: return "Very Unhealthy"
    return "Hazardous"


def _wmo_description(code: Optional[int]) -> str:
    _WMO_LABELS = {
        0:  "Clear sky",
        1:  "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
        45: "Fog", 48: "Rime fog",
        51: "Light drizzle", 53: "Drizzle", 55: "Heavy drizzle",
        61: "Slight rain", 63: "Moderate rain", 65: "Heavy rain",
        80: "Rain showers", 81: "Moderate showers", 82: "Violent showers",
        95: "Thunderstorm", 96: "Thunderstorm + hail", 99: "Thunderstorm + heavy hail",
    }
    if code is None:
        return "Unknown"
    return _WMO_LABELS.get(code, f"WMO code {code}")


def _road_rank_label(rank: float) -> str:
    if rank >= 1.0:   return "Expressway / National Highway"
    if rank >= 0.85:  return "Major Arterial / Primary Road"
    if rank >= 0.65:  return "Secondary / District Road"
    if rank >= 0.45:  return "Tertiary / Town Connector"
    if rank >= 0.25:  return "Residential / Local Road"
    return "Track / Path (isolated)"


class SafetyInferenceEngine:
    _instance: Optional["SafetyInferenceEngine"] = None

    def __init__(self, model_path: Optional[str] = None):
        if model_path is None:
            base_dir   = os.path.dirname(os.path.abspath(__file__))
            model_path = os.path.join(base_dir, "model.pkl")
        self.model_path     = model_path
        self.hazard_manager = HazardManager.get_instance()
        self.load_model()

    @classmethod
    def get_instance(cls) -> "SafetyInferenceEngine":
        if cls._instance is None:
            cls._instance = SafetyInferenceEngine()
        return cls._instance

    def load_model(self):
        if not os.path.exists(self.model_path):
            raise FileNotFoundError(
                f"Model file not found at {self.model_path}. Run train.py first."
            )
        bundle = joblib.load(self.model_path)
        self.classifier   = bundle["classifier"]
        self.regressor    = bundle["regressor"]
        self.feature_names = bundle.get("feature_names", FEATURE_COLUMNS)
        self.classes       = bundle.get("classes", ["High", "Low", "Medium"])
        print(f"[Engine] Loaded model with {len(self.feature_names)} features: {self.feature_names[:5]}...")

    def _normalize_coord(self, pt: Any) -> Optional[Tuple[float, float]]:
        """Extracts (lat, lng) with robust heuristic handling of [lng, lat] inversion."""
        if pt is None:
            return None
        if isinstance(pt, (list, tuple)) and len(pt) >= 2:
            v0, v1 = float(pt[0]), float(pt[1])
            # In India: Lng ~68–97, Lat ~8–37. If first value is longitude-range, swap.
            if abs(v0) > 45.0 and abs(v1) <= 45.0:
                lng, lat = v0, v1
            else:
                lat, lng = v0, v1
        elif isinstance(pt, dict):
            lat = float(pt.get("lat") or pt.get("latitude") or 0)
            lng = float(pt.get("lng") or pt.get("lon") or pt.get("longitude") or 0)
        else:
            return None

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
        lighting: Optional[str] = None,
        aqi_pm25: Optional[float] = None,
        osm_data: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Evaluates a single geospatial coordinate point with the 26-feature model."""
        osm_data   = osm_data or {}
        police_km  = osm_data.get("police_proximity_km")
        road_rank  = osm_data.get("road_hierarchy_rank")

        # Derive lighting from OSM if not provided by client
        effective_lighting = lighting
        if not effective_lighting and "lighting_score" in osm_data:
            osm_ls = float(osm_data["lighting_score"])
            if osm_ls >= 2.5:
                effective_lighting = "well_lit"
            elif osm_ls >= 1.0:
                effective_lighting = "poorly_lit"
            else:
                effective_lighting = "dark"

        feats = extract_point_features(
            lat=lat,
            lng=lng,
            hour=hour,
            day_of_week=day_of_week,
            weather_dict=weather or {},
            lighting_status=effective_lighting,
            hazard_manager=self.hazard_manager,
            aqi_pm25=aqi_pm25,
            police_proximity_km=police_km,
            road_hierarchy_rank=road_rank,
        )

        # Align feature vector to trained model's feature order
        vec = self._align_feature_vector(feats).reshape(1, -1)

        # Predict continuous score and discrete class
        score  = float(self.regressor.predict(vec)[0])
        score  = max(10, min(100, round(score)))

        probas    = self.classifier.predict_proba(vec)[0]
        prob_dict = {
            cls_name: round(float(p), 4)
            for cls_name, p in zip(self.classes, probas)
        }

        # Calibrated risk level from score
        if score >= 75:   risk_level = "Low"
        elif score >= 55: risk_level = "Medium"
        elif score >= 40: risk_level = "High"
        else:             risk_level = "Critical"

        nearest_hazards = self.hazard_manager.query_all_nearest(lat, lng)
        reasons = self._generate_explainability_reasons(
            feats, nearest_hazards, score, weather or {}, osm_data
        )

        return {
            "safety_score":   int(score),
            "risk_score":     round(100.0 - score, 1),
            "risk_level":     risk_level,
            "probabilities":  prob_dict,
            "nearest_hazards": nearest_hazards,
            "reasons":        reasons,
            "features":       feats,
        }

    def _align_feature_vector(self, feats: Dict[str, float]) -> np.ndarray:
        """
        Aligns a feature dict to the trained model's feature_names order.
        Handles backward compatibility between 22-feature and 26-feature models.
        """
        vec = []
        for col in self.feature_names:
            if col in feats:
                vec.append(feats[col])
            else:
                # New feature not in old model: use safe neutral default
                defaults = {
                    "aqi_pm25":             45.0,
                    "air_quality_severity":  0.5,
                    "police_proximity_km":   2.0,
                    "road_hierarchy_rank":   0.65,
                }
                vec.append(defaults.get(col, 0.0))
        return np.array(vec, dtype=np.float32)

    def predict_route(
        self,
        waypoints: List[Any],
        timestamp: Optional[str] = None,
        hour: Optional[int] = None,
        day_of_week: Optional[int] = None,
        weather: Optional[Dict[str, Any]] = None,
        lighting: Optional[str] = None,
        aqi_pm25: Optional[float] = None,
        osm_data: Optional[Dict[str, Any]] = None,
        traffic_level: Optional[str] = None,
        distance_m: Optional[float] = None,
        duration_s: Optional[float] = None,
    ) -> Dict[str, Any]:
        """Evaluates an entire route polyline against the 26-feature ML model."""

        # Parse time context
        if hour is None or day_of_week is None:
            dt = datetime.now()
            if timestamp:
                try:
                    dt = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
                except Exception:
                    pass
            hour        = dt.hour        if hour is None else hour
            day_of_week = dt.weekday()   if day_of_week is None else day_of_week

        # Normalize and filter coordinates
        cleaned_pts: List[Tuple[float, float]] = []
        for wp in waypoints:
            norm = self._normalize_coord(wp)
            if norm:
                cleaned_pts.append(norm)

        if not cleaned_pts:
            return {
                "error":        "No valid coordinates in route payload",
                "safety_score": 70,
                "risk_score":   30.0,
                "risk_level":   "Medium",
                "probabilities": {"Low": 0.33, "Medium": 0.34, "High": 0.33},
                "reasons":      ["Default safety profile used: no valid coordinates received."]
            }

        # ── Intelligent Downsampling — target ~25 checkpoints ─────────────────
        total_pts = len(cleaned_pts)
        if total_pts <= 25:
            sampled_pts = cleaned_pts
        else:
            step        = max(1, total_pts // 25)
            sampled_pts = [cleaned_pts[i] for i in range(0, total_pts, step)]
            if cleaned_pts[-1] not in sampled_pts:
                sampled_pts.append(cleaned_pts[-1])

        # ── Evaluate each checkpoint ──────────────────────────────────────────
        sample_results = []
        min_score      = 101
        bottleneck_pt  = sampled_pts[0]
        bottleneck_hazards = None

        for pt in sampled_pts:
            res = self.predict_point(
                lat=pt[0], lng=pt[1],
                hour=hour, day_of_week=day_of_week,
                weather=weather, lighting=lighting,
                aqi_pm25=aqi_pm25, osm_data=osm_data,
            )
            res["lat"] = pt[0]
            res["lng"] = pt[1]
            sample_results.append(res)

            if res["safety_score"] < min_score:
                min_score          = res["safety_score"]
                bottleneck_pt      = pt
                bottleneck_hazards = res["nearest_hazards"]

        # ── Aggregate: 80% mean + 20% worst-point (was 60/40) ─────────────────
        # Rationale: A single dangerous checkpoint should flag the route but not
        # catastrophically tank the score. 80/20 gives a representative corridor
        # safety average while still penalizing genuine danger zones.
        all_scores        = [r["safety_score"] for r in sample_results]
        mean_score        = float(np.mean(all_scores))
        route_safety_score = round(mean_score * 0.80 + min_score * 0.20)
        route_safety_score = max(10, min(100, route_safety_score))

        # ── Average class probabilities ───────────────────────────────────────
        avg_probs = {
            cls_name: round(float(np.mean(
                [r["probabilities"].get(cls_name, 0.0) for r in sample_results]
            )), 4)
            for cls_name in self.classes
        }

        # ── Risk level ────────────────────────────────────────────────────────
        if route_safety_score >= 75:   route_risk_level = "Low"
        elif route_safety_score >= 55: route_risk_level = "Medium"
        elif route_safety_score >= 40: route_risk_level = "High"
        else:                          route_risk_level = "Critical"

        # ── Global nearest hazards across entire route ────────────────────────
        global_nearest = {"crime": None, "accident": None, "flood": None, "disaster": None}
        min_dists      = {k: float("inf") for k in global_nearest}

        for r in sample_results:
            nh = r["nearest_hazards"]
            for cat in global_nearest:
                d = nh[cat].get("distance_m")
                if d is not None and d < min_dists[cat]:
                    min_dists[cat]    = d
                    global_nearest[cat] = nh[cat]

        # ── Route-level factual explanatory reasons ───────────────────────────
        route_reasons = self._generate_route_reasons(
            sample_results=sample_results,
            global_nearest=global_nearest,
            min_dists=min_dists,
            route_safety_score=route_safety_score,
            hour=hour,
            weather=weather or {},
            osm_data=osm_data or {},
            aqi_pm25=aqi_pm25,
        )

        # ── Dynamic Traffic Adjustment ────────────────────────────────────────
        if traffic_level == "heavy":
            route_safety_score = max(10, route_safety_score - 7)
            route_reasons.insert(0, "🚦 Heavy traffic congestion: higher collision risk & delay (-7 pts)")
        elif traffic_level == "moderate":
            route_safety_score = max(10, route_safety_score - 3)
            route_reasons.insert(0, "🚦 Moderate traffic flow: standard urban congestion (-3 pts)")
        elif traffic_level == "clear":
            route_reasons.insert(0, "🚗 Clear traffic flow: smooth corridor travel")

        # Recalibrate risk level if score adjusted
        if route_safety_score >= 75:   route_risk_level = "Low"
        elif route_safety_score >= 55: route_risk_level = "Medium"
        elif route_safety_score >= 40: route_risk_level = "High"
        else:                          route_risk_level = "Critical"

        # ── Segment risk for polyline visual styling ──────────────────────────
        segment_points = [
            {
                "lat":        r["lat"],
                "lng":        r["lng"],
                "score":      r["safety_score"],
                "risk_level": r["risk_level"],
            }
            for r in sample_results
        ]

        # ── Mathematical Deduction Breakdown (Linked strictly to ML Score) ──
        deduction_breakdown = self._calculate_deduction_breakdown(
            sample_results=sample_results,
            global_nearest=global_nearest,
            min_dists=min_dists,
            route_safety_score=int(route_safety_score),
            traffic_level=traffic_level,
            weather=weather or {},
            osm_data=osm_data or {},
            aqi_pm25=aqi_pm25,
            hour=hour,
        )

        return {
            "safety_score":       int(route_safety_score),
            "risk_score":         round(100.0 - route_safety_score, 1),
            "risk_level":         route_risk_level,
            "probabilities":      avg_probs,
            "bottleneck": {
                "lat":         bottleneck_pt[0],
                "lng":         bottleneck_pt[1],
                "safety_score": min_score,
                "hazards":     bottleneck_hazards,
            },
            "nearest_hazards":    global_nearest,
            "reasons":            route_reasons,
            "deduction_breakdown": deduction_breakdown,
            "point_deductions":   deduction_breakdown,
            "waypoints_evaluated": len(sampled_pts),
            "segments":           segment_points,
            "model_version":      "3.0.0-26feature-live-data",
        }

    def _generate_route_reasons(
        self,
        sample_results: List[Dict],
        global_nearest: Dict,
        min_dists: Dict,
        route_safety_score: int,
        hour: int,
        weather: Dict,
        osm_data: Dict,
        aqi_pm25: Optional[float],
    ) -> List[str]:
        """
        Generates factual, quantified route-level explanation reasons.
        Reasons are ordered by impact: spatial hazards first, then environmental, then temporal.
        """
        reasons = []

        # ── Spatial Hazards ───────────────────────────────────────────────────
        if min_dists["accident"] < 300:
            acc = global_nearest["accident"]
            name = acc.get("name", "Accident Blackspot")
            dist = round(min_dists["accident"])
            sev  = acc.get("severity", "high")
            reasons.append(
                f"🚗 Accident blackspot on route: {name} ({dist}m, {sev} severity) — "
                f"reduced road traction expected"
            )

        if min_dists["crime"] < 250:
            cr   = global_nearest["crime"]
            name = cr.get("name", "Crime Hotspot")
            dist = round(min_dists["crime"])
            sev  = cr.get("severity", "medium")
            reasons.append(
                f"🚨 Crime hotspot within {dist}m: {name} ({sev} severity) — "
                f"heightened vigilance advised"
            )

        if min_dists["flood"] < 600:
            fl   = global_nearest["flood"]
            name = fl.get("name", "Flood Zone")
            reasons.append(
                f"🌊 Flood / waterlogging zone: {name} — "
                f"road submersion risk, check live conditions"
            )

        if min_dists["disaster"] < 700:
            ds   = global_nearest["disaster"]
            name = ds.get("name", "Disaster Zone")
            reasons.append(f"⚠️ Natural hazard zone on route: {name}")

        # ── Air Quality ───────────────────────────────────────────────────────
        if aqi_pm25 is not None:
            label = _pm25_label(aqi_pm25)
            if aqi_pm25 > 55.4:
                reasons.append(
                    f"💨 Air quality: PM2.5 = {round(aqi_pm25, 1)} μg/m³ ({label}) — "
                    f"N95 mask recommended for this corridor"
                )
            elif aqi_pm25 > 35.4:
                reasons.append(
                    f"💨 Moderate air quality: PM2.5 = {round(aqi_pm25, 1)} μg/m³ ({label})"
                )

        # ── Weather ───────────────────────────────────────────────────────────
        w_code = weather.get("weather_code")
        w_sev  = sample_results[0]["features"].get("weather_severity", 0.0) if sample_results else 0.0
        if w_code is not None:
            desc = _wmo_description(int(w_code))
            if w_sev >= 4.0:
                reasons.append(
                    f"⛈️ Severe weather: {desc} — critical skid risk and near-zero visibility"
                )
            elif w_sev >= 3.5:
                reasons.append(
                    f"🌧️ Heavy rain showers ({desc}) — compound flood risk, skid-prone"
                )
            elif w_sev >= 2.8:
                reasons.append(
                    f"🌧️ Rainfall detected ({desc}) — reduced road traction and braking distance"
                )
            elif w_sev >= 2.5:
                reasons.append(
                    f"🌫️ Fog / low-visibility conditions ({desc}) — accident risk amplified"
                )
        elif w_sev >= 3.0:
            reasons.append("🌧️ Severe rain / storm conditions — reduced road traction and braking safety")
        elif w_sev >= 2.0:
            reasons.append("🌫️ Fog or low-visibility conditions detected")

        vis_km = sample_results[0]["features"].get("visibility_km", 10.0) if sample_results else 10.0
        if vis_km < 2.0:
            reasons.append(
                f"👁️ Visibility: {round(vis_km, 1)} km — critically reduced, high collision risk"
            )

        # ── Road Infrastructure ────────────────────────────────────────────────
        road_rank = osm_data.get("road_hierarchy_rank")
        if road_rank is not None:
            label = _road_rank_label(float(road_rank))
            if float(road_rank) <= 0.35:
                reasons.append(
                    f"🛣️ Road type: {label} — isolated corridor, no median barrier or patrol coverage"
                )

        l_score = osm_data.get("lighting_score")
        if l_score is not None and float(l_score) < 1.0:
            reasons.append("🔦 Unlit road section — high isolation risk, no ambient lighting")
        elif l_score is not None and float(l_score) < 1.5:
            reasons.append("🔦 Poorly lit corridor — increased personal safety risk at night")

        police_km = osm_data.get("police_proximity_km")
        if police_km is not None and float(police_km) > 5.0:
            reasons.append(
                f"🚔 No police station within {round(float(police_km), 1)} km — "
                f"limited emergency response coverage"
            )

        # ── Temporal ──────────────────────────────────────────────────────────
        if hour < 6 or hour >= 20:
            reasons.append(
                "🌙 Night-time travel (20:00–05:59): crime risk elevated, "
                "reduced bystander presence and surveillance coverage"
            )
        else:
            if 8 <= hour <= 10 or 17 <= hour <= 20:
                reasons.append(
                    "🚦 Rush hour window: increased traffic density and accident exposure"
                )

        # ── Overall summary ───────────────────────────────────────────────────
        if route_safety_score >= 85 and not reasons:
            reasons.append(
                "✅ High safety corridor: low hazard proximity, good lighting, "
                "adequate police coverage, favorable weather"
            )
        elif route_safety_score >= 85:
            reasons.insert(0, "✅ Overall safe corridor despite minor risk factors above")
        elif not reasons:
            reasons.append("Corridor evaluated — no immediate high-severity hazards detected")

        return reasons

    def _generate_explainability_reasons(
        self,
        feats: Dict[str, float],
        hazards: Dict[str, Any],
        score: float,
        weather: Dict,
        osm_data: Dict,
    ) -> List[str]:
        """Point-level explainability reasons with factual, quantified strings."""
        reasons = []

        if hazards["accident"].get("distance_m") is not None and hazards["accident"]["distance_m"] <= 250:
            d    = round(hazards["accident"]["distance_m"])
            name = hazards["accident"].get("name", "Accident Blackspot")
            sev  = hazards["accident"].get("severity", "high")
            reasons.append(f"🚗 Accident blackspot {d}m away: {name} ({sev})")

        if hazards["crime"].get("distance_m") is not None and hazards["crime"]["distance_m"] <= 250:
            d    = round(hazards["crime"]["distance_m"])
            name = hazards["crime"].get("name", "Crime Hotspot")
            sev  = hazards["crime"].get("severity", "medium")
            reasons.append(f"🚨 Crime hotspot {d}m: {name} ({sev} severity)")

        if feats.get("in_flood_zone", 0.0) > 0.5:
            name = hazards["flood"].get("name", "Flood Zone")
            reasons.append(f"🌊 Inside flood inundation zone: {name}")

        if feats.get("in_disaster_zone", 0.0) > 0.5:
            name = hazards["disaster"].get("name", "Disaster Zone")
            reasons.append(f"⚠️ Inside natural disaster zone: {name}")

        pm25 = feats.get("aqi_pm25")
        if pm25 and pm25 > 55.4:
            reasons.append(f"💨 PM2.5: {round(pm25, 1)} μg/m³ ({_pm25_label(pm25)})")

        if feats.get("weather_severity", 0.0) >= 4.0:
            reasons.append("⛈️ Thunderstorm / critical weather — extreme accident risk")
        elif feats.get("weather_severity", 0.0) >= 2.8:
            w_code = weather.get("weather_code")
            desc   = _wmo_description(int(w_code)) if w_code else "Rain"
            reasons.append(f"🌧️ {desc} — slippery surfaces, skid risk")

        if feats.get("is_night", 0.0) > 0.5:
            l = feats.get("lighting_score", 2.0)
            if l < 1.0:
                reasons.append("🌙 Night + unlit road — critical isolation risk")
            elif l < 1.5:
                reasons.append("🌙 Night-time corridor: elevated caution advised")

        road_rank = feats.get("road_hierarchy_rank", 0.65)
        if road_rank <= 0.35:
            reasons.append(f"🛣️ {_road_rank_label(road_rank)} — low patrol coverage")

        if not reasons:
            reasons.append("✅ Clear corridor — no immediate hazard proximity")

        return reasons

    def _calculate_deduction_breakdown(
        self,
        sample_results: List[Dict],
        global_nearest: Dict,
        min_dists: Dict,
        route_safety_score: int,
        traffic_level: Optional[str],
        weather: Dict,
        osm_data: Dict,
        aqi_pm25: Optional[float],
        hour: int,
    ) -> Dict[str, Any]:
        """
        Calculates mathematically airtight point deductions directly linked to the ML score.
        Identity: 100 - sum(categories) == route_safety_score
                  sum(category items) == category deduction
        """
        total_deductions = max(0, 100 - route_safety_score)
        if total_deductions == 0:
            return {
                "base_score": 100,
                "total_deductions": 0,
                "formula": f"100 - 0 = {route_safety_score}",
                "categories": {
                    "crime": 0, "accident": 0, "flood": 0,
                    "disaster": 0, "road_infra": 0, "traffic": 0, "env": 0
                },
                "items": {
                    "crime": [], "accident": [], "flood": [],
                    "disaster": [], "road_infra": [], "traffic": [], "env": []
                }
            }

        # 1. Collect unique hazards along the route within relevant distances
        crimes_found = {}
        accidents_found = {}
        floods_found = {}
        disasters_found = {}

        for r in sample_results:
            nh = r.get("nearest_hazards", {})
            cr = nh.get("crime")
            if cr and cr.get("distance_m", float("inf")) <= 450:
                name = cr.get("name") or "Crime Hotspot"
                crimes_found[name] = min(crimes_found.get(name, float("inf")), cr["distance_m"])
            
            acc = nh.get("accident")
            if acc and acc.get("distance_m", float("inf")) <= 350:
                name = acc.get("name") or "Accident Blackspot"
                accidents_found[name] = min(accidents_found.get(name, float("inf")), acc["distance_m"])
                
            fl = nh.get("flood")
            if fl and fl.get("distance_m", float("inf")) <= 500:
                name = fl.get("name") or "Waterlogging Zone"
                floods_found[name] = min(floods_found.get(name, float("inf")), fl["distance_m"])
                
            ds = nh.get("disaster")
            if ds and ds.get("distance_m", float("inf")) <= 500:
                name = ds.get("name") or "Natural Hazard Zone"
                disasters_found[name] = min(disasters_found.get(name, float("inf")), ds["distance_m"])

        # 2. Evaluate raw weights for each category
        raw_weights = {}

        # Crime weight: proximity, number of hotspots, night factor
        is_night = hour < 6 or hour >= 20
        crime_w = 0.0
        if crimes_found:
            crime_w = sum(max(1.0, 5.0 - (d / 100.0)) for d in crimes_found.values()) * (1.3 if is_night else 1.0)
        elif min_dists.get("crime", float("inf")) < 600:
            crime_w = 2.0
        if crime_w > 0: raw_weights["crime"] = crime_w

        # Accident weight
        acc_w = 0.0
        if accidents_found:
            acc_w = sum(max(1.0, 4.0 - (d / 100.0)) for d in accidents_found.values())
        elif min_dists.get("accident", float("inf")) < 500:
            acc_w = 1.5
        if acc_w > 0: raw_weights["accident"] = acc_w

        # Flood weight
        flood_w = 0.0
        if floods_found:
            flood_w = sum(max(1.0, 4.0 - (d / 150.0)) for d in floods_found.values())
        elif min_dists.get("flood", float("inf")) < 600:
            flood_w = 1.5
        if flood_w > 0: raw_weights["flood"] = flood_w

        # Disaster weight
        dis_w = 0.0
        if disasters_found:
            dis_w = sum(max(1.0, 3.5 - (d / 150.0)) for d in disasters_found.values())
        elif min_dists.get("disaster", float("inf")) < 600:
            dis_w = 1.0
        if dis_w > 0: raw_weights["disaster"] = dis_w

        # Road infrastructure & lighting weight
        road_w = 0.0
        road_rank = osm_data.get("road_hierarchy_rank", 0.65)
        lighting_score = osm_data.get("lighting_score", 2.0)
        if road_rank < 0.65:
            road_w += (0.65 - road_rank) * 8.0
        if lighting_score < 2.0:
            road_w += (2.0 - lighting_score) * 2.0
        if road_w > 0 or not raw_weights: # Fallback base corridor weight
            raw_weights["road_infra"] = max(1.0, road_w)

        # Traffic delay
        if traffic_level == "heavy":
            raw_weights["traffic"] = 6.0
        elif traffic_level == "moderate":
            raw_weights["traffic"] = 3.0

        # Environmental / AQI / Weather
        env_w = 0.0
        if aqi_pm25 and aqi_pm25 > 55.4:
            env_w += 3.0
        elif aqi_pm25 and aqi_pm25 > 35.4:
            env_w += 1.5
        w_sev = sample_results[0]["features"].get("weather_severity", 0.0) if sample_results else 0.0
        if w_sev >= 2.8:
            env_w += 3.0
        if env_w > 0:
            raw_weights["env"] = env_w

        # 3. Largest Remainder Integer Allocation across categories
        raw_sum = sum(raw_weights.values())
        if raw_sum <= 0:
            raw_weights["road_infra"] = 1.0
            raw_sum = 1.0

        cat_alloc = {}
        floats = {k: (v / raw_sum) * total_deductions for k, v in raw_weights.items()}
        ints = {k: int(math.floor(v)) for k, v in floats.items()}
        rem = total_deductions - sum(ints.values())
        
        remainders = sorted([(floats[k] - ints[k], k) for k in raw_weights], reverse=True)
        for i in range(rem):
            ints[remainders[i % len(remainders)][1]] += 1
        cat_alloc = ints

        # 4. Allocate item-level deductions for categories with multiple hazards
        def distribute_items(item_dict, cat_total, default_name):
            if cat_total <= 0:
                return []
            if not item_dict:
                return [{"name": default_name, "penalty": cat_total}]
            
            weights = {k: max(1.0, 1000.0 / max(50.0, d)) for k, d in item_dict.items()}
            w_sum = sum(weights.values())
            f_vals = {k: (w / w_sum) * cat_total for k, w in weights.items()}
            i_vals = {k: int(math.floor(v)) for k, v in f_vals.items()}
            r_rem = cat_total - sum(i_vals.values())
            
            rems = sorted([(f_vals[k] - i_vals[k], k) for k in weights], reverse=True)
            for j in range(r_rem):
                i_vals[rems[j % len(rems)][1]] += 1
                
            return [{"name": k, "penalty": v, "distance_m": round(item_dict[k])} for k, v in i_vals.items() if v > 0]

        items_breakdown = {
            "crime": distribute_items(crimes_found, cat_alloc.get("crime", 0), "Urban Crime Caution Zone"),
            "accident": distribute_items(accidents_found, cat_alloc.get("accident", 0), "Accident-Prone Section"),
            "flood": distribute_items(floods_found, cat_alloc.get("flood", 0), "Low-Lying Waterlogging Zone"),
            "disaster": distribute_items(disasters_found, cat_alloc.get("disaster", 0), "Natural Hazard Caution Area"),
            "road_infra": [{"name": _road_rank_label(road_rank), "penalty": cat_alloc.get("road_infra", 0)}] if cat_alloc.get("road_infra", 0) > 0 else [],
            "traffic": [{"name": f"{traffic_level.capitalize() if traffic_level else 'Moderate'} Congestion Delay", "penalty": cat_alloc.get("traffic", 0)}] if cat_alloc.get("traffic", 0) > 0 else [],
            "env": [{"name": f"Air Quality (PM2.5 {round(aqi_pm25, 1) if aqi_pm25 else 'elevated'})", "penalty": cat_alloc.get("env", 0)}] if cat_alloc.get("env", 0) > 0 else [],
        }

        categories_dict = {
            "crime": cat_alloc.get("crime", 0),
            "accident": cat_alloc.get("accident", 0),
            "flood": cat_alloc.get("flood", 0),
            "disaster": cat_alloc.get("disaster", 0),
            "road_infra": cat_alloc.get("road_infra", 0),
            "traffic": cat_alloc.get("traffic", 0),
            "env": cat_alloc.get("env", 0),
        }

        return {
            "base_score": 100,
            "total_deductions": total_deductions,
            "formula": f"100 - {total_deductions} = {route_safety_score}",
            "categories": categories_dict,
            "items": items_breakdown,
        }
