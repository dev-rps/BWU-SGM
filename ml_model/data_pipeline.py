"""
data_pipeline.py — Modular Hazard Data Ingestion & Spatial BallTree Engine

Provides:
  1. Extensible data sources (JSON, GeoJSON, CSV, and Live Open API).
  2. High-performance BallTrees using the geodesic Haversine metric.
  3. Real-time sub-millisecond proximity queries to hazard clusters.
"""

import os
import json
import numpy as np
import pandas as pd
from abc import ABC, abstractmethod
from typing import List, Dict, Any, Tuple, Optional
from sklearn.neighbors import BallTree

EARTH_RADIUS_METERS = 6371000.0

class BaseHazardDataSource(ABC):
    """Abstract data source interface allowing zero-code-change swaps to live APIs or government GeoJSON feeds."""
    @abstractmethod
    def load_hazards(self) -> Dict[str, List[Dict[str, Any]]]:
        pass

class JsonHazardDataSource(BaseHazardDataSource):
    """Loads hazard datasets from local JSON / GeoJSON files."""
    def __init__(self, filepath: Optional[str] = None):
        if filepath is None:
            base_dir = os.path.dirname(os.path.abspath(__file__))
            filepath = os.path.join(base_dir, "data", "hazards.json")
        self.filepath = filepath

    def load_hazards(self) -> Dict[str, List[Dict[str, Any]]]:
        if not os.path.exists(self.filepath):
            return {
                "crime_hotspots": [],
                "accident_blackspots": [],
                "flood_zones": [],
                "disaster_zones": []
            }
        with open(self.filepath, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data

class CsvHazardDataSource(BaseHazardDataSource):
    """Loads hazard points from CSV files."""
    def __init__(self, crime_csv: Optional[str] = None, accident_csv: Optional[str] = None):
        self.crime_csv = crime_csv
        self.accident_csv = accident_csv

    def load_hazards(self) -> Dict[str, List[Dict[str, Any]]]:
        res: Dict[str, List[Dict[str, Any]]] = {
            "crime_hotspots": [],
            "accident_blackspots": [],
            "flood_zones": [],
            "disaster_zones": []
        }
        if self.crime_csv and os.path.exists(self.crime_csv):
            df = pd.read_csv(self.crime_csv)
            res["crime_hotspots"] = df.to_dict(orient="records")
        if self.accident_csv and os.path.exists(self.accident_csv):
            df = pd.read_csv(self.accident_csv)
            res["accident_blackspots"] = df.to_dict(orient="records")
        return res

class SpatialHazardIndex:
    """Wraps an sklearn.neighbors.BallTree using the Haversine metric for geodesic queries."""
    def __init__(self, items: List[Dict[str, Any]], name: str):
        self.name = name
        self.raw_items: List[Dict[str, Any]] = []
        valid_coords = []
        for item in items:
            lat = item.get("lat") or item.get("latitude")
            lng = item.get("lng") or item.get("lon") or item.get("longitude")
            if lat is not None and lng is not None:
                try:
                    lat_f = float(lat)
                    lng_f = float(lng)
                    if -90 <= lat_f <= 90 and -180 <= lng_f <= 180:
                        valid_coords.append([np.radians(lat_f), np.radians(lng_f)])
                        self.raw_items.append(item)
                except (ValueError, TypeError):
                    continue

        self.count = len(self.raw_items)
        if self.count > 0:
            self.coords_rad = np.array(valid_coords)
            self.tree = BallTree(self.coords_rad, metric="haversine")
        else:
            self.coords_rad = np.empty((0, 2))
            self.tree = None

    def query_nearest(self, lat: float, lng: float) -> Tuple[float, Optional[Dict[str, Any]]]:
        """Returns (distance_in_meters, nearest_item_dict)."""
        if self.tree is None or self.count == 0:
            return float("inf"), None
        q_rad = np.radians([[lat, lng]])
        dists_rad, indices = self.tree.query(q_rad, k=1)
        dist_meters = float(dists_rad[0][0]) * EARTH_RADIUS_METERS
        nearest_item = self.raw_items[indices[0][0]]
        return dist_meters, nearest_item

    def query_radius(self, lat: float, lng: float, radius_meters: float) -> List[Tuple[float, Dict[str, Any]]]:
        """Returns list of (distance_in_meters, item_dict) within radius_meters."""
        if self.tree is None or self.count == 0:
            return []
        q_rad = np.radians([[lat, lng]])
        radius_rad = radius_meters / EARTH_RADIUS_METERS
        indices_list, dists_list = self.tree.query_radius(q_rad, r=radius_rad, return_distance=True)
        results = []
        for idx, dist_rad in zip(indices_list[0], dists_list[0]):
            dist_m = float(dist_rad) * EARTH_RADIUS_METERS
            results.append((dist_m, self.raw_items[idx]))
        # Sort by distance
        results.sort(key=lambda x: x[0])
        return results

class HazardManager:
    """Central repository holding spatial trees for all hazard categories."""
    _instance: Optional['HazardManager'] = None

    def __init__(self, data_source: Optional[BaseHazardDataSource] = None):
        self.data_source = data_source or JsonHazardDataSource()
        self.reload()

    @classmethod
    def get_instance(cls) -> 'HazardManager':
        if cls._instance is None:
            cls._instance = HazardManager()
        return cls._instance

    def reload(self):
        data = self.data_source.load_hazards()
        self.crime_index = SpatialHazardIndex(data.get("crime_hotspots", []), "crime")
        self.accident_index = SpatialHazardIndex(data.get("accident_blackspots", []), "accident")
        self.flood_index = SpatialHazardIndex(data.get("flood_zones", []), "flood")
        self.disaster_index = SpatialHazardIndex(data.get("disaster_zones", []), "disaster")

    def query_all_nearest(self, lat: float, lng: float) -> Dict[str, Any]:
        """Queries nearest hazard across all 4 categories in one call."""
        c_dist, c_item = self.crime_index.query_nearest(lat, lng)
        a_dist, a_item = self.accident_index.query_nearest(lat, lng)
        f_dist, f_item = self.flood_index.query_nearest(lat, lng)
        d_dist, d_item = self.disaster_index.query_nearest(lat, lng)

        def format_res(dist_m: float, item: Optional[Dict[str, Any]]):
            if item is None or dist_m == float("inf"):
                return {"distance_m": None, "name": "None", "severity": "none", "radius_m": 0}
            name = item.get("area") or item.get("title") or item.get("name") or "Hazard Zone"
            severity = item.get("severity") or "medium"
            radius_m = float(item.get("radius") or 250)
            return {
                "distance_m": round(dist_m, 1),
                "name": name,
                "severity": severity,
                "radius_m": radius_m,
                "type": item.get("type", "unknown")
            }

        return {
            "crime": format_res(c_dist, c_item),
            "accident": format_res(a_dist, a_item),
            "flood": format_res(f_dist, f_item),
            "disaster": format_res(d_dist, d_item),
        }
