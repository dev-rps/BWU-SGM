# 🌐 Google Routes Service (`googleRouting.js`)

The `src/services/googleRouting.js` service provides the primary, high-fidelity routing pipeline for Safety Guardian, communicating directly with the **Google Routes API (v2)**.

---

## 📡 API Endpoint & Configuration

- **Endpoint**: `https://routes.googleapis.com/directions/v2:computeRoutes`
- **HTTP Method**: `POST`
- **Authentication**: Header `X-Goog-Api-Key` from `import.meta.env.VITE_GOOGLE_MAPS_API_KEY`.
- **FieldMask Optimization**:
  `X-Goog-FieldMask: routes.duration,routes.distanceMeters,routes.polyline.encodedPath,routes.description,routes.legs`

---

## 💻 Request Body Structure

```json
{
  "origin": { "location": { "latLng": { "latitude": 22.5726, "longitude": 88.3639 } } },
  "destination": { "location": { "latLng": { "latitude": 22.6000, "longitude": 88.4000 } } },
  "travelMode": "DRIVE",
  "routingPreference": "TRAFFIC_AWARE",
  "computeAlternativeRoutes": true
}
```

---

## 🧬 Polyline Decoding & Transformation

Google Routes returns geometries as **encoded string polylines** to save payload bandwidth. Safety Guardian uses `@mapbox/polyline` to decode these into `[lat, lng]` tuples compatible with Leaflet:

```javascript
import polyline from '@mapbox/polyline'

// Decode Google's encoded polyline into [lat, lng] array
const decodedGeometry = polyline.decode(route.polyline.encodedPath)
```

---

## 🛡️ Error Handling & Fallback Trigger
If Google returns a non-200 HTTP status (such as `403 PERMISSION_DENIED` or `429 RESOURCE_EXHAUSTED`), the service throws a clean error that is caught by [[TomTom-Routing-Service]], seamlessly falling back without user disruption.
