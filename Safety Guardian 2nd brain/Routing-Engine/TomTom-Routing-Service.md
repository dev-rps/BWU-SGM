# 🗺️ TomTom Routing Service (`tomtomRouting.js`)

`src/services/tomtomRouting.js` serves as both the secondary routing engine and the central router orchestrator. It queries TomTom's Routing API to generate multiple route alternatives with per-segment traffic congestion analysis.

---

## 🔄 Dual-Request Alternative Strategy

To generate rich alternative routes (Fastest vs. Shortest/Arterial Bypass), `tomtomRouting.js` fires two concurrent requests using `Promise.allSettled`:

```javascript
const [resultA, resultB] = await Promise.allSettled([
  // Request A: Fastest route with 1 alternative
  fetch(buildUrl(fromLat, fromLng, toLat, toLng, travelMode, 'fastest', 1)),
  // Request B: Shortest route
  fetch(buildUrl(fromLat, fromLng, toLat, toLng, travelMode, 'shortest', 0))
])
```

---

## 🚦 Per-Segment Traffic Data Extraction

TomTom returns fine-grained traffic delay segments via the `sectionType=traffic` parameter:

```javascript
const trafficSections = (route.sections || [])
  .filter(s => s.sectionType === 'TRAFFIC')
  .map(s => ({
    startIdx:        s.startPointIndex,
    endIdx:          s.endPointIndex,
    category:        s.simpleCategory || 'UNDEFINED',
    speedKmh:        s.effectiveSpeedInKmh  || null,
    freeFlowSpeedKmh: s.freeFlowSpeedInKmh || null,
    delaySeconds:    s.delayInSeconds       || 0,
  }))
```
These segments are consumed by [[RouteSelectionPage]] to render red/orange/green polyline highlights on the map.
