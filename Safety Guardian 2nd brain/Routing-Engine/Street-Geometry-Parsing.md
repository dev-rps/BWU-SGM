# 📐 Street Geometry & Uniform Route Schema

Regardless of whether a route originates from Google, TomTom, or OSRM, the routing pipeline normalizes it into a strict **Uniform Route Schema**.

---

## 📋 Standardized Route Object Schema

```typescript
interface UnifiedRoute {
  index: number;              // 0, 1, 2 (index in candidate list)
  mode: 'driving' | 'walking' | 'cycling';
  geometry: [number, number][]; // [[lat, lng], [lat, lng], ...]
  steps: StepInstruction[];   // Turn-by-turn instructions
  viaRoads: string;           // e.g. "via Jessore Road / NH 112"
  trafficSections: TrafficSection[];
  distance: number;           // in meters (e.g. 12450)
  duration: number;           // in seconds (e.g. 1820)
  distanceKm: string;         // formatted string (e.g. "12.5")
  durationMin: number;        // formatted integer minutes (e.g. 30)
  trafficDelay: number;       // total delay in seconds
  trafficDelayMin: number;    // total delay in minutes
  liveEtaSeconds: number;     // duration + traffic delay
  arrivalTime: string | null; // ISO timestamp if available
  
  // Appended by Safety Score Engine:
  safetyScore?: number;       // 10 to 100
  rankLabel?: 'SAFEST' | 'BALANCED' | 'LEAST SAFE';
  rankColor?: string;         // '#10B981' | '#2563EB' | '#EF4444'
  onRouteReports?: any[];     // Community hazards within 250m
  onRouteCrimes?: any[];      // Intersecting crime zones
  onRouteFlood?: any[];       // Intersecting flood zones
  onRouteAccidents?: any[];   // Intersecting accident blackspots
  isRecommended?: boolean;    // true for the top composite pick
}
```

---

## 🛣️ Physical Road Corridor Extraction (`viaRoads`)
To ensure users clearly see which physical roads each route option takes before starting navigation, the engine parses street names from maneuver summaries and builds a human-readable corridor name (e.g., `via Grand Trunk Road / Belghoria Expressway`).
