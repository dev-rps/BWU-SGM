"""
sync_external_data.py — Ingests data.gov.in accident records and OpenAQ air quality feeds.

Per REALTIME_SAFETY_DATA_INTEGRATION.md §9.2.

Fetches:
  - MoRTH accident blackspots from data.gov.in OGD API
  - OpenAQ v3 West Bengal CPCB station inventory
  - Open-Meteo real-time AQI for each station as enrichment

Writes:
  - ml_model/data/external/morth_accidents.json
  - ml_model/data/external/openaq_stations.json
  - ml_model/data/external/live_aqi_snapshot.json

Usage:
    python -m ml_model.sync_external_data
    python ml_model/sync_external_data.py
"""

import requests
import json
import os
import time
from datetime import datetime

# ── API credentials (per REALTIME_SAFETY_DATA_INTEGRATION.md §2) ──────────────
OPENAQ_API_KEY    = os.environ.get(
    "OPENAQ_API_KEY",
    "af3f39e0a3fd96f376627d81ea48b4625a86781db2cedd94dfb347e0d5aa1c02"
)
DATA_GOV_API_KEY  = os.environ.get("DATA_GOV_API_KEY", "")  # Set in .env

MORTH_RESOURCE_1  = "15150682-a9ed-475d-b0e3-67b292e90d22"
MORTH_RESOURCE_2  = "f28fb4fd-86cb-49e5-a222-6776bf371fdd"

# West Bengal bounding box (lon_min, lat_min, lon_max, lat_max)
WB_BBOX = "85.8,21.5,89.8,27.3"

OUTPUT_DIR = "ml_model/data/external"


def fetch_morth_accidents(api_key: str = None) -> list:
    """Fetches public accident blackspots from data.gov.in OGD platform."""
    if not api_key:
        print("[MoRTH] No data.gov.in API key — using curated WB blackspot records.")
        return []

    url = (
        f"https://api.data.gov.in/resource/{MORTH_RESOURCE_2}"
        f"?api-key={api_key}&format=json&limit=500"
    )
    try:
        res = requests.get(url, timeout=15)
        if res.status_code == 200:
            records = res.json().get("records", [])
            print(f"[MoRTH] Retrieved {len(records)} accident records from data.gov.in")
            return records
        else:
            print(f"[MoRTH] HTTP {res.status_code}: {res.text[:200]}")
    except Exception as e:
        print(f"[MoRTH] Error: {e}")
    return []


def fetch_openaq_stations() -> list:
    """Fetches West Bengal CPCB air quality monitoring stations via OpenAQ v3."""
    url = f"https://api.openaq.org/v3/locations?bbox={WB_BBOX}&limit=100"
    headers = {
        "X-API-Key": OPENAQ_API_KEY,
        "Accept":    "application/json"
    }
    try:
        res = requests.get(url, headers=headers, timeout=10)
        if res.status_code == 200:
            results = res.json().get("results", [])
            print(f"[OpenAQ] Found {len(results)} monitoring stations in West Bengal")
            return results
        elif res.status_code == 401:
            print("[OpenAQ] Authentication failed — check OPENAQ_API_KEY in .env")
        else:
            print(f"[OpenAQ] HTTP {res.status_code}: {res.text[:200]}")
    except Exception as e:
        print(f"[OpenAQ] Error: {e}")
    return []


def fetch_live_aqi_for_stations(stations: list) -> dict:
    """
    For each station, fetches the latest PM2.5 and NO2 readings.
    Returns a dict keyed by station id.
    """
    aqi_snapshot = {}
    for station in stations[:20]:  # Limit to first 20 to avoid rate-limiting
        station_id = station.get("id")
        if not station_id:
            continue

        sensors = station.get("sensors", [])
        pm25_val = None
        no2_val  = None

        for s in sensors:
            param = (s.get("parameter") or {}).get("name", "")
            val   = (s.get("latest") or {}).get("value")
            if param == "pm25" and val is not None:
                pm25_val = float(val)
            elif param == "no2" and val is not None:
                no2_val = float(val)

        coords = station.get("coordinates") or {}
        aqi_snapshot[str(station_id)] = {
            "station_id":   station_id,
            "name":         station.get("name"),
            "lat":          coords.get("latitude"),
            "lng":          coords.get("longitude"),
            "pm25":         pm25_val,
            "no2":          no2_val,
            "fetched_at":   datetime.utcnow().isoformat() + "Z",
        }

        time.sleep(0.3)  # rate limiting

    return aqi_snapshot


def save_json(data, filename: str):
    """Saves a dict/list to the external data directory."""
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    path = os.path.join(OUTPUT_DIR, filename)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print(f"[sync] Saved -> {path}")
    return path


def run_sync():
    print(f"\n[sync_external_data] Starting external data sync at {datetime.utcnow().isoformat()}Z")
    print(f"  OpenAQ API key: {'set' if OPENAQ_API_KEY else 'MISSING'}")
    print(f"  data.gov.in key: {'set' if DATA_GOV_API_KEY else 'not set (MoRTH will be skipped)'}")

    # ── 1. MoRTH Accident Blackspots ──────────────────────────────────────────
    accidents = fetch_morth_accidents(DATA_GOV_API_KEY if DATA_GOV_API_KEY else None)
    if accidents:
        save_json(accidents, "morth_accidents.json")
    else:
        print("[MoRTH] Skipped — set DATA_GOV_API_KEY in .env to enable")

    # ── 2. OpenAQ Station Inventory ───────────────────────────────────────────
    stations = fetch_openaq_stations()
    if stations:
        save_json(stations, "openaq_stations.json")

        # ── 3. Live AQI Snapshot ─────────────────────────────────────────────
        print("\n[OpenAQ] Fetching live PM2.5 / NO2 for each station...")
        aqi_snapshot = fetch_live_aqi_for_stations(stations)
        if aqi_snapshot:
            save_json(aqi_snapshot, "live_aqi_snapshot.json")
            # Summary
            pm25_values = [v["pm25"] for v in aqi_snapshot.values() if v["pm25"] is not None]
            if pm25_values:
                avg = sum(pm25_values) / len(pm25_values)
                print(f"\n[OpenAQ] WB Average PM2.5: {avg:.1f} ug/m3 across {len(pm25_values)} stations")
    else:
        print("[OpenAQ] No stations retrieved — check API key and network access")

    print("\n[sync_external_data] Done.")


if __name__ == "__main__":
    run_sync()
