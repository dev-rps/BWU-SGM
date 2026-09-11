"""
harvest_weather.py — Downloads 3 years of hourly historical weather data for key WB transit hubs
from the Open-Meteo Historical Archive API (Free, no key needed).

Per REALTIME_SAFETY_DATA_INTEGRATION.md §9.1.

Usage:
    python -m ml_model.harvest_weather
    python ml_model/harvest_weather.py

Output:
    ml_model/data/historical/historical_weather_wb.csv
    (each row = one hourly observation for one city)
"""

import requests
import json
import os
import time

try:
    import pandas as pd
    HAS_PANDAS = True
except ImportError:
    HAS_PANDAS = False
    print("[harvest_weather] pandas not installed. Will write CSV manually.")

CITIES = [
    {"name": "Kolkata",    "lat": 22.5726, "lng": 88.3639},
    {"name": "Barasat",    "lat": 22.7230, "lng": 88.4815},
    {"name": "Howrah",     "lat": 22.5958, "lng": 88.2636},
    {"name": "Durgapur",   "lat": 23.5204, "lng": 87.3119},
    {"name": "Siliguri",   "lat": 26.7271, "lng": 88.3953},
    {"name": "Asansol",    "lat": 23.6889, "lng": 86.9661},
    {"name": "Digha",      "lat": 21.6266, "lng": 87.5074},
]

START_DATE = "2023-01-01"
END_DATE   = "2026-08-31"

HOURLY_VARS = [
    "temperature_2m",
    "relative_humidity_2m",
    "precipitation",
    "rain",
    "weather_code",
    "visibility",
    "wind_speed_10m",
]


def harvest_city_weather(city: dict) -> list:
    """
    Downloads 3-year hourly historical data for a city from Open-Meteo Archive API.
    Returns a list of dicts (rows).
    """
    url = (
        f"https://archive-api.open-meteo.com/v1/archive"
        f"?latitude={city['lat']}&longitude={city['lng']}"
        f"&start_date={START_DATE}&end_date={END_DATE}"
        f"&hourly={','.join(HOURLY_VARS)}"
        f"&timezone=Asia/Kolkata"
    )
    print(f"[harvest_weather] Fetching {city['name']} ({city['lat']}, {city['lng']})...")
    try:
        res = requests.get(url, timeout=60)
        if res.status_code == 200:
            hourly = res.json().get("hourly", {})
            times = hourly.get("time", [])
            rows = []
            for i, ts in enumerate(times):
                row = {
                    "city":       city["name"],
                    "lat":        city["lat"],
                    "lng":        city["lng"],
                    "timestamp":  ts,
                }
                for var in HOURLY_VARS:
                    vals = hourly.get(var, [])
                    row[var] = vals[i] if i < len(vals) else None
                rows.append(row)
            print(f"  -> {len(rows)} hourly records for {city['name']}")
            return rows
        else:
            print(f"  [Error] {city['name']}: HTTP {res.status_code}")
    except Exception as e:
        print(f"  [Error] {city['name']}: {e}")
    return []


def run_harvest():
    os.makedirs("ml_model/data/historical", exist_ok=True)
    out_path = "ml_model/data/historical/historical_weather_wb.csv"

    all_rows = []
    for city in CITIES:
        rows = harvest_city_weather(city)
        all_rows.extend(rows)
        time.sleep(1.5)  # polite rate limiting

    if not all_rows:
        print("[harvest_weather] No data retrieved.")
        return

    print(f"\n[harvest_weather] Total records: {len(all_rows)}")

    if HAS_PANDAS:
        import pandas as pd
        df = pd.DataFrame(all_rows)
        df.to_csv(out_path, index=False)
        print(f"[harvest_weather] Saved to {out_path}")
        print(df.describe())
    else:
        # Fallback: write CSV manually
        import csv
        fieldnames = list(all_rows[0].keys()) if all_rows else []
        with open(out_path, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(all_rows)
        print(f"[harvest_weather] Saved to {out_path} (manual CSV, {len(all_rows)} rows)")


if __name__ == "__main__":
    run_harvest()
