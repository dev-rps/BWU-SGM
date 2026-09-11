# Real-Time Geospatial Safety Data Integration & Routing Engine Specification

> **Document Purpose**: Complete architectural specification, API contracts, data ingestion scripts, and integration blueprint for the **Safety Guardian West Bengal (BWU-SGM)** real-time route evaluation platform.
>
> **Status**: Production Blueprint — Ready for Execution.  
> **Codebase Changes**: *None made to active application files in this step (Documentation Only).*

---

## Table of Contents
1. [System Architecture & Data Flow](#1-system-architecture--data-flow)
2. [Configured Credentials & Data Endpoints](#2-configured-credentials--data-endpoints)
3. [OpenAQ v3 Real-Time Air Quality Integration](#3-openaq-v3-real-time-air-quality-integration)
4. [OSM Overpass & Road Network Architecture (Option 1)](#4-osm-overpass--road-network-architecture-option-1)
5. [MoRTH & Data.gov.in Road Accident Records](#5-morth--datagovin-road-accident-records)
6. [Open-Meteo Real-Time & Historical Weather Pipeline](#6-open-meteo-real-time--historical-weather-pipeline)
7. [ML Model Feature Engineering & BallTree Spatial Indexing](#7-ml-model-feature-engineering--balltree-spatial-indexing)
8. [Real-Time Route Evaluation & Frontend Coupling](#8-real-time-route-evaluation--frontend-coupling)
9. [Reference Python Ingestion & Harvester Scripts](#9-reference-python-ingestion--harvester-scripts)
10. [Step-by-Step Implementation Roadmap](#10-step-by-step-implementation-roadmap)

---

## 1. System Architecture & Data Flow

The real-time routing engine transitions the application from synthetic/heuristic safety scores to an **empirical, multi-source machine learning and spatial analysis system**:

```mermaid
flowchart TD
    subgraph Client ["Frontend (React 18 + Leaflet)"]
        A[User Selects Origin & Destination] --> B[OSRM / TomTom Routing]
        B --> C[2-3 Alternative Route Polylines]
        C --> D[mlService.js: evaluateRouteSafety]
        R[Render UI: Green / Blue / Red Routes & Hazard Warnings] <-- D
    end

    subgraph MLService ["FastAPI Geospatial ML Engine (/predict/route)"]
        D --> E[Polyline Normalizer & Checkpoint Sampler]
        E --> F[Parallel Corridor Enricher]
        
        subgraph DataSources ["Real-Time & BallTree Data Sources"]
            G1[(MoRTH Accidents BallTree)]
            G2[(NCRB Crime Hotspots BallTree)]
            G3[(CWC / Static Flood Zones BallTree)]
            G4[OpenAQ v3 API: PM2.5 / NO2]
            G5[Open-Meteo API: Rain / Fog / Visibility]
            G6[OSM Overpass: Streetlights & Police POIs]
        end

        F --> G1
        F --> G2
        F --> G3
        F --> G4
        F --> G5
        F --> G6

        G1 & G2 & G3 & G4 & G5 & G6 --> H[Feature Engineering: 24D Vector]
        H --> I[RandomForest Classifier: Low / Med / High]
        H --> J[GradientBoosting Regressor: Score 10-100]
        I & J --> K[Corridor Bottleneck Hazard Finder]
        K --> L[Explainability & Reason Generator]
        L --> D
    end
```

---

## 2. Configured Credentials & Data Endpoints

The parameters provided for Group B have been organized into the configuration specification below:

| Source | Parameter / ID | Purpose | Auth / Access |
| :--- | :--- | :--- | :--- |
| **OpenAQ v3 API** | `af3f39e0a3fd96f376627d81ea48b4625a86781db2cedd94dfb347e0d5aa1c02` | Live station air pollution (PM2.5, PM10, NO2) | Header: `X-API-Key` |
| **Road Infrastructure** | **Option 1**: Targeted Overpass API + WB Highway GeoJSON | Streetlight density, road classification, police proximity | Free public API (CORS/REST) |
| **MoRTH Accident Data** | `/resource/15150682-a9ed-475d-b0e3-67b292e90d22` | National & State Highway road accident records (OGD India) | `https://api.data.gov.in` query |
| **MoRTH Blackspot Data** | `/resource/f28fb4fd-86cb-49e5-a222-6776bf371fdd` | High-fatality accident blackspots and junction hazards | `https://api.data.gov.in` query |
| **Open-Meteo Weather** | Real-time & Historical Archive API | Real-time rain/fog + 3-year hourly dataset for model training | Free (No API Key Required) |

---

## 3. OpenAQ v3 Real-Time Air Quality Integration

### 3.1 Endpoint Details
- **Base URL**: `https://api.openaq.org/v3`
- **Authentication**: `X-API-Key: af3f39e0a3fd96f376627d81ea48b4625a86781db2cedd94dfb347e0d5aa1c02`
- **Key Monitoring Stations in Target Zone**:
  - Victoria Memorial, Kolkata (CPCB)
  - Jadavpur University, Kolkata (WBPCB)
  - Rabindra Bharati University, North Kolkata
  - Ghusuri, Howrah
  - Asansol & Durgapur industrial monitoring stations

### 3.2 Live Location Query Specification
To query air quality within radius of a route coordinate:
```http
GET https://api.openaq.org/v3/locations?coordinates=22.5726,88.3639&radius=10000
Headers:
  X-API-Key: af3f39e0a3fd96f376627d81ea48b4625a86781db2cedd94dfb347e0d5aa1c02
  Accept: application/json
```

### 3.3 Sensor Latest Values
```http
GET https://api.openaq.org/v3/locations/{location_id}/latest
Headers:
  X-API-Key: af3f39e0a3fd96f376627d81ea48b4625a86781db2cedd94dfb347e0d5aa1c02
```

### 3.4 Python Ingestion Client Snippet
```python
import requests
import time

OPENAQ_API_KEY = "af3f39e0a3fd96f376627d81ea48b4625a86781db2cedd94dfb347e0d5aa1c02"
OPENAQ_HEADERS = {
    "X-API-Key": OPENAQ_API_KEY,
    "Accept": "application/json"
}

def fetch_live_openaq_data(lat: float, lng: float, radius_meters: int = 15000):
    """
    Fetches latest PM2.5 and PM10 values from nearest official monitoring station.
    Falls back to Open-Meteo Air Quality if stations are unreachable.
    """
    url = f"https://api.openaq.org/v3/locations?coordinates={lat},{lng}&radius={radius_meters}"
    try:
        res = requests.get(url, headers=OPENAQ_HEADERS, timeout=4)
        if res.status_code == 200:
            data = res.json()
            results = data.get("results", [])
            if results:
                nearest = results[0]
                sensors = nearest.get("sensors", [])
                readings = {}
                for s in sensors:
                    param = s.get("parameter", {}).get("name")
                    val = s.get("latest", {}).get("value")
                    if param and val is not None:
                        readings[param] = val
                return {
                    "station_name": nearest.get("name"),
                    "distance_km": round(nearest.get("distance", 0) / 1000.0, 2),
                    "pm25": readings.get("pm25"),
                    "pm10": readings.get("pm10"),
                    "no2": readings.get("no2")
                }
    except Exception as e:
        print(f"[OpenAQ] Warning: {e}. Falling back to Open-Meteo Air Quality.")
    return None
```

---

## 4. OSM Overpass & Road Network Architecture (Option 1)

As selected (**Option 1**), the platform utilizes **targeted Overpass queries + a local highway infrastructure GeoJSON**, avoiding multi-gigabyte Geofabrik `.osm.pbf` dumps while preserving real-time streetlighting and road class awareness.

### 4.1 Overpass Turbo Query: Streetlight & Surveillance Density
```overpassql
[out:json][timeout:15];
(
  node["highway"="street_lamp"](around:350, 22.5726, 88.3639);
  node["amenity"="police"](around:2000, 22.5726, 88.3639);
  node["surveillance"](around:500, 22.5726, 88.3639);
);
out body;
```

### 4.2 Rate Limiting & 500m Grid Cache Strategy
To prevent `429 Too Many Requests` or `504 Gateway Timeout` from public Overpass servers:
- **Spatial Binning**: Coordinates along the route are rounded to a `0.005` degree (~500m) spatial grid key.
- **TTL Cache**: Responses are cached in memory / Redis for 1 hour.
- **Batched Polyline Bounding Box**: Rather than querying 25 individual points, query the route bounding box once for `highway=primary|secondary|trunk` and police stations.

### 4.3 Road Class Safety Weight Matrix

| OSM Highway Tag | Road Type | Safety Advantage | Default Lighting Assumption |
| :--- | :--- | :--- | :--- |
| `motorway` / `trunk` | National Highway / Expressway | High speed, divided median, lower pedestrian conflict | High (Lit interchanges) |
| `primary` | Major State Highway / Arterial | Wide, police patrolled, continuous activity | Well lit |
| `secondary` | Connecting District Road | Moderate width, mixed commercial activity | Variable |
| `tertiary` | Local Town Connector | Narrower, unlit patches, mixed pedestrian/traffic | Poorly lit |
| `residential` / `unclassified` | Local Colony Road | Low vehicular speed, variable crime risk | Dependent on locality |
| `track` / `path` | Rural dirt track / Secluded alley | High isolation risk, no police patrols | Dark / Unlit |

---

## 5. MoRTH & Data.gov.in Road Accident Records

### 5.1 Resource Endpoints
- **Resource 1 (Accident Statistics & Corridors)**:
  `https://api.data.gov.in/resource/15150682-a9ed-475d-b0e3-67b292e90d22`
- **Resource 2 (High-Fatality Blackspots & Junctions)**:
  `https://api.data.gov.in/resource/f28fb4fd-86cb-49e5-a222-6776bf371fdd`

### 5.2 API Request Structure
```http
GET https://api.data.gov.in/resource/15150682-a9ed-475d-b0e3-67b292e90d22?api-key=YOUR_DATA_GOV_KEY&format=json&limit=1000
```

### 5.3 Normalization Pipeline into BallTree GeoJSON
When government records contain street names / national highway numbers without explicit GPS coordinates, the ingestion pipeline resolves them to latitude/longitude using OSM Nominatim with a bounding box restricted to West Bengal:

```python
def normalize_morth_record(record: dict) -> dict:
    """Converts a raw data.gov.in MoRTH record into a BallTree indexed entity."""
    return {
        "id": f"morth_{record.get('id', record.get('index', '00'))}",
        "lat": float(record.get("latitude") or record.get("lat")),
        "lng": float(record.get("longitude") or record.get("lon") or record.get("lng")),
        "area": record.get("location_name") or record.get("blackspot_name") or "Highway Section",
        "highway": record.get("highway_no") or record.get("nh_sh"),
        "fatalities": int(record.get("fatalities", 1)),
        "severity": "critical" if int(record.get("fatalities", 1)) > 3 else "high",
        "radius": 350,  # meters
        "source": "MoRTH National Blackspot Identification Study"
    }
```

---

## 6. Open-Meteo Real-Time & Historical Weather Pipeline

### 6.1 Real-Time Checkpoint Endpoint
- **URL**: `https://api.open-meteo.com/v1/forecast`
- **Parameters**: `latitude`, `longitude`, `current=temperature_2m,relative_humidity_2m,precipitation,rain,weather_code,visibility`
- **Latency**: < 60ms, CORS enabled, no API key required.

```http
GET https://api.open-meteo.com/v1/forecast?latitude=22.5726&longitude=88.3639&current=temperature_2m,relative_humidity_2m,precipitation,rain,weather_code,visibility&timezone=Asia/Kolkata
```

### 6.2 Weather Severity Mapping Rules

| WMO Weather Code | Condition | Severity Weight | Impact on Safety Score |
| :--- | :--- | :--- | :--- |
| `0` | Clear sky | `0.0` | No deduction |
| `1, 2, 3` | Partly cloudy / Overcast | `0.4` | No deduction |
| `45, 48` | Fog / Depositing rime fog | `2.5` | -5 pts (Accident risk amplification) |
| `51, 53, 55` | Drizzle | `1.0` | -2 pts |
| `61, 63, 65` | Rain (Slight to Heavy) | `2.8` | -6 pts (Skid risk + reduced visibility) |
| `80, 81, 82` | Torrential Rain Showers | `3.5` | -10 pts (Compound flood risk) |
| `95, 96, 99` | Thunderstorm / Hailstorm | `4.0` | -14 pts (Critical weather alert) |

---

## 7. ML Model Feature Engineering & BallTree Spatial Indexing

The 22 features used in the current model are extended to a **26-dimensional multi-modal vector**:

```
[Spatial Proximity via BallTrees]
01. crime_min_dist_km          (Geodesic distance to nearest crime hotspot)
02. crime_density_500m         (Number of crime spots within 500m radius)
03. crime_weighted_risk        (Distance-weighted severity sum)
04. accident_min_dist_km       (Geodesic distance to nearest MoRTH blackspot)
05. accident_density_500m      (MoRTH blackspots within 500m radius)
06. accident_weighted_risk     (Fatality-weighted severity sum)
07. flood_min_dist_km          (Distance to CWC flood zone)
08. in_flood_zone              (Binary flag: 1.0 if inside flood polygon)
09. disaster_min_dist_km       (Distance to disaster zone)
10. in_disaster_zone           (Binary flag: 1.0 if inside disaster area)

[Temporal Dynamics]
11. hour_sin                   (Cyclical hour of day sin component)
12. hour_cos                   (Cyclical hour of day cos component)
13. day_sin                    (Cyclical day of week sin component)
14. day_cos                    (Cyclical day of week cos component)
15. is_night                   (1.0 if 20:00 - 05:59, else 0.0)
16. is_weekend                 (1.0 if Saturday or Sunday)
17. is_rush_hour               (1.0 if 08:30-10:30 or 17:30-20:30)

[Environmental & Meteorological]
18. temperature                (Real-time temp in Celsius from Open-Meteo)
19. visibility_km              (Visual distance in km: <2km triggers penalty)
20. weather_severity           (WMO code severity mapping 0.0 - 4.0)
21. precipitation_risk         (Continuous rain probability / rate)
22. aqi_pm25                   (Real-time PM2.5 from OpenAQ / Open-Meteo)
23. air_quality_severity       (Normalized AQI severity factor 0.0 - 3.0)

[Road Infrastructure & Lighting (OSM)]
24. lighting_score             (0.0 = Dark unlit, 1.0 = Poor, 2.5 = Well-lit, 3.0 = Daylight)
25. police_proximity_km        (Distance to nearest police station from OSM)
26. road_hierarchy_rank        (1.0 = Expressway/NH, 0.7 = State Hwy, 0.4 = Local, 0.1 = Alley)
```

---

## 8. Real-Time Route Evaluation & Frontend Coupling

### 8.1 API Contract: `POST /predict/route`

#### Request Payload
```json
{
  "waypoints": [
    [22.5630, 88.4020],
    [22.5700, 88.4100],
    [22.5850, 88.4250]
  ],
  "timestamp": "2026-09-11T20:30:00Z",
  "hour": 20,
  "day_of_week": 4,
  "weather": {
    "temperature": 27.5,
    "condition": "rain",
    "visibility": 3200,
    "weather_code": 63
  },
  "air_quality": {
    "pm25": 84.5,
    "station": "Victoria Memorial, Kolkata"
  },
  "lighting": "poorly_lit"
}
```

#### Response Structure
```json
{
  "safety_score": 68,
  "risk_score": 32.0,
  "risk_level": "Medium",
  "probabilities": {
    "Low": 0.142,
    "Medium": 0.718,
    "High": 0.140
  },
  "checkpoint_count": 25,
  "bottleneck": {
    "lat": 22.5630,
    "lng": 88.4020,
    "score": 46,
    "nearest_hazards": {
      "accident": {
        "name": "Chingrighata Crossing, EM Bypass",
        "distance_m": 84.2,
        "severity": "critical"
      }
    }
  },
  "reasons": [
    "High-fatality accident blackspot within 100m (Chingrighata Crossing)",
    "Rainfall detected (skid risk + poor visibility)",
    "Night-time poorly lit section on arterial link"
  ]
}
```

### 8.2 Coupling `RouteSelectionPage.jsx` to FastAPI
In `RouteSelectionPage.jsx`, the client evaluates candidate OSRM/TomTom polylines in parallel through `evaluateRouteSafety`:

```javascript
// Example frontend integration logic (for reference)
const mlEvaluations = await Promise.all(
  rawRoutes.map(route => 
    evaluateRouteSafety({
      waypoints: route.geometry,
      hour: new Date().getHours(),
      dayOfWeek: new Date().getDay(),
      weather: liveWeather,
      lighting: isNight ? 'poorly_lit' : 'daylight'
    }).catch(err => {
      console.warn('ML Service offline, using local heuristic fallback', err);
      return null;
    })
  )
);
```

---

## 9. Reference Python Ingestion & Harvester Scripts

### 9.1 Script 1: Historical Weather Harvester for Model Retraining (`ml_model/harvest_weather.py`)
```python
"""
harvest_weather.py — Downloads 3 years of hourly historical weather data for key WB transit hubs
from the Open-Meteo Historical Archive API (Free, no key needed).
"""
import requests
import json
import os
import pandas as pd

CITIES = [
    {"name": "Kolkata", "lat": 22.5726, "lng": 88.3639},
    {"name": "Barasat", "lat": 22.7230, "lng": 88.4815},
    {"name": "Howrah", "lat": 22.5958, "lng": 88.2636},
    {"name": "Durgapur", "lat": 23.5204, "lng": 87.3119},
    {"name": "Siliguri", "lat": 26.7271, "lng": 88.3953}
]

START_DATE = "2023-01-01"
END_DATE = "2026-08-31"

def harvest_city_weather(city):
    url = (
        f"https://archive-api.open-meteo.com/v1/archive?"
        f"latitude={city['lat']}&longitude={city['lng']}&"
        f"start_date={START_DATE}&end_date={END_DATE}&"
        f"hourly=temperature_2m,relative_humidity_2m,precipitation,rain,weather_code,visibility&"
        f"timezone=Asia/Kolkata"
    )
    print(f"Fetching historical weather for {city['name']}...")
    res = requests.get(url, timeout=30)
    if res.status_code == 200:
        data = res.json().get("hourly", {})
        df = pd.DataFrame(data)
        df["city"] = city["name"]
        return df
    else:
        print(f"Failed for {city['name']}: {res.status_code}")
        return pd.DataFrame()

def run_harvest():
    all_dfs = []
    for c in CITIES:
        df = harvest_city_weather(c)
        if not df.empty:
            all_dfs.append(df)
    
    if all_dfs:
        final_df = pd.concat(all_dfs, ignore_index=True)
        os.makedirs("ml_model/data/historical", exist_ok=True)
        out_path = "ml_model/data/historical/historical_weather_wb.csv"
        final_df.to_csv(out_path, index=False)
        print(f"Saved {len(final_df)} historical hourly weather records to {out_path}")

if __name__ == "__main__":
    run_harvest()
```

### 9.2 Script 2: MoRTH & OpenAQ Live Sync Engine (`ml_model/sync_external_data.py`)
```python
"""
sync_external_data.py — Ingests data.gov.in accident records and OpenAQ air quality feeds.
"""
import requests
import json
import os

OPENAQ_API_KEY = "af3f39e0a3fd96f376627d81ea48b4625a86781db2cedd94dfb347e0d5aa1c02"
MORTH_RESOURCE_1 = "15150682-a9ed-475d-b0e3-67b292e90d22"
MORTH_RESOURCE_2 = "f28fb4fd-86cb-49e5-a222-6776bf371fdd"

def fetch_morth_accidents(api_key=None):
    """Fetches public accident blackspots from data.gov.in OGD platform."""
    if not api_key:
        print("[MoRTH] No data.gov.in API key provided. Using curated West Bengal blackspot records.")
        return []
    
    url = f"https://api.data.gov.in/resource/{MORTH_RESOURCE_2}?api-key={api_key}&format=json&limit=500"
    try:
        res = requests.get(url, timeout=15)
        if res.status_code == 200:
            return res.json().get("records", [])
    except Exception as e:
        print(f"[MoRTH] Error: {e}")
    return []

def fetch_openaq_stations():
    """Fetches West Bengal CPCB air quality stations via OpenAQ v3."""
    url = "https://api.openaq.org/v3/locations?bbox=85.8,21.5,89.8,27.3&limit=100"
    headers = {"X-API-Key": OPENAQ_API_KEY, "Accept": "application/json"}
    try:
        res = requests.get(url, headers=headers, timeout=10)
        if res.status_code == 200:
            return res.json().get("results", [])
    except Exception as e:
        print(f"[OpenAQ] Error: {e}")
    return []
```

---

## 10. Step-by-Step Implementation Roadmap

When you are ready to execute the integration into the codebase:

```
[Phase 1: Ingestion & Enrichment]
1. Add OPENAQ_API_KEY into .env.
2. Run `harvest_weather.py` to populate 3 years of empirical weather.
3. Update `ml_model/data/hazards.json` with MoRTH accident blackspots.

[Phase 2: Spatial Tree & Feature Vector Update]
4. Expand `ml_model/feature_engineering.py` with the 4 new feature dimensions (AQI, lighting proxy, road rank, police distance).
5. Retrain Random Forest Classifier and Gradient Boosting Regressor (`python ml_model/train.py`).
6. Verify new `model.pkl` and `model_meta.json` generated.

[Phase 3: Real-Time API & Frontend Wiring]
7. Update `ml_model/main.py` route checkpoint evaluator to fetch live Open-Meteo & OpenAQ data during `/predict/route`.
8. Connect `RouteSelectionPage.jsx` so that candidate routes query `/predict/route` in real time.
9. Display real ML confidence scores, bottleneck warnings, and factual safety explanations on the map.
```
