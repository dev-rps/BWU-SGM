// src/services/googleRouting.js
import polyline from '@mapbox/polyline'

const GOOGLE_ROUTES_API = 'https://routes.googleapis.com/directions/v2:computeRoutes'
const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY

const MODE_MAP = {
  driving: 'DRIVE',
  walking: 'WALK',
  cycling: 'BICYCLE',
}

export async function getRouteFromGoogle(fromLat, fromLng, toLat, toLng, mode = 'driving') {
  if (!GOOGLE_API_KEY) {
    throw new Error('Google Routes API key is not configured, falling back to TomTom/OSRM.')
  }
  const travelMode = MODE_MAP[mode] || 'DRIVE'

  const body = {
    origin: { location: { latLng: { latitude: fromLat, longitude: fromLng } } },
    destination: { location: { latLng: { latitude: toLat, longitude: toLng } } },
    travelMode,
    routingPreference: travelMode === 'DRIVE' ? 'TRAFFIC_AWARE' : 'ROUTING_PREFERENCE_UNSPECIFIED',
    computeAlternativeRoutes: true,
  }

  const res = await fetch(GOOGLE_ROUTES_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GOOGLE_API_KEY,
      'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters,routes.polyline.encodedPath,routes.description,routes.legs',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.json()
    throw new Error(`Google Routes error: ${err.error?.message || res.status}`)
  }

  const data = await res.json()
  if (!data.routes || !data.routes.length) {
    throw new Error('Google Routes returned no routes')
  }

  return data.routes.map((route, idx) => {
    // Decode Google's encoded polyline into [lat, lng] array
    const decodedGeometry = polyline.decode(route.polyline.encodedPath)
    
    const steps = []
    if (route.legs && route.legs[0] && route.legs[0].steps) {
      for (const s of route.legs[0].steps) {
        let instruction = s.navigationInstruction?.instructions || 'Continue straight'
        steps.push({
          instruction,
          distance: s.distanceMeters || 0,
          duration: parseInt(s.duration || '0'),
          icon: 'straight' 
        })
      }
    }

    const durationSecs = parseInt(route.duration || '0')
    const distanceMeters = route.distanceMeters || 0

    return {
      index: idx,
      mode,
      geometry: decodedGeometry,
      steps: steps.length > 0 ? steps : [{ instruction: 'Follow route to destination', distance: distanceMeters, icon: 'straight' }],
      viaRoads: route.description ? `via ${route.description}` : (idx === 0 ? 'via Main Route' : 'via Alternative Route'),
      trafficSections: [], 
      distance: distanceMeters,
      duration: durationSecs,
      distanceKm: (distanceMeters / 1000).toFixed(1),
      durationMin: Math.max(1, Math.round(durationSecs / 60)),
      trafficDelay: 0,
      trafficDelayMin: 0,
      liveEtaSeconds: durationSecs,
      arrivalTime: null,
    }
  })
}
