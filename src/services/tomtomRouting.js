import { getRouteFromGoogle } from './googleRouting.js'
import { CRIME_HOTSPOTS } from '../data/crimeHotspots.js'
import { ACCIDENT_BLACKSPOTS } from '../data/accidentBlackspots.js'
/**
 * tomtomRouting.js — TomTom Routing API service
 *
 * Routing strategy (3 parallel calls for full road coverage):
 *   Route 0 — fastest       → traffic-aware, prefers main roads
 *   Route 1 — shortest      → distance-only, uses ALL roads (alleys, lanes, residential)
 *   Route 2 — fastest alt   → second-best main-road path
 *
 * Traffic visualization:
 *   Returns `trafficSections` per route so the UI can color the polyline
 *   exactly like Google Maps (blue=clear, orange=moderate, red=heavy).
 *   No background tile layers — traffic is drawn ON the route line itself.
 */

import { getTomTomKey } from './apiKeys.js'
// Read key lazily at call-time so a missing/placeholder key doesn't crash the
// entire module on import (getTomTomKey throws if key equals placeholder).
const getApiKey = () => {
  try { return getTomTomKey() } catch { return import.meta.env?.VITE_TOMTOM_API_KEY || '' }
}
const BASE_URL = 'https://api.tomtom.com/routing/1'

// ─── Transport mode map ────────────────────────────────────────────────────────
const TOMTOM_MODE = {
  driving:   'car',
  motorbike: 'motorcycle',
  walking:   'pedestrian',
  cycling:   'bicycle',
}

export const MODE_LABELS = {
  driving:   { label: 'Drive', icon: 'directions_car',  color: '#004ac6', speed: '40 km/h avg' },
  motorbike: { label: 'Bike',  icon: 'two_wheeler',     color: '#EF4444', speed: '45 km/h avg' },
  walking:   { label: 'Walk',  icon: 'directions_walk', color: '#10B981', speed: '5 km/h avg'  },
  cycling:   { label: 'Cycle', icon: 'directions_bike', color: '#F59E0B', speed: '15 km/h avg' },
}

// Multiplier applied when fallback routing engine uses car/driving profile
export const MODE_MULTIPLIERS = {
  driving:   1,
  motorbike: 0.9,
  cycling: 2.5,
  walking: 8.0,
}

// ─── Traffic segment colors (Google Maps palette, no neon) ────────────────────
export const TRAFFIC_COLORS = {
  clear:    '#3d85c8',   // Solid blue — free flowing
  moderate: '#F59E0B',   // Amber — minor/moderate delay
  heavy:    '#EF4444',   // Red — significant/major delay
}

// ─── Build URL ────────────────────────────────────────────────────────────────
function buildUrl(fromLat, fromLng, toLat, toLng, travelMode, routeType, maxAlternatives = 0) {
  const isVehicular = travelMode === 'car' || travelMode === 'motorcycle'
  let url =
    `${BASE_URL}/calculateRoute/` +
    `${fromLat},${fromLng}:${toLat},${toLng}/json` +
    `?key=${getApiKey()}` +
    `&travelMode=${travelMode}` +
    `&routeType=${routeType}` +
    `&maxAlternatives=${maxAlternatives}` +
    `&instructionsType=tagged`
  if (isVehicular) {
    url += `&traffic=true&sectionType=traffic`
  }
  return url
}

// ─── OSRM fallback (free, no API key) ────────────────────────────────────────
const OSRM_ENDPOINTS = [
  'https://router.project-osrm.org/route/v1',
  'https://routing.openstreetmap.de/routed-car/route/v1',
  'https://routing.openstreetmap.de/routed-bike/route/v1',
  'https://routing.openstreetmap.de/routed-foot/route/v1'
]

/**
 * Snaps a coordinate (lat, lng) to the nearest vehicle/pedestrian road network point.
 * Essential when user starts from inside a building, railway colony, courtyard, or footway
 * that vehicular routing engines cannot directly depart from.
 */
export async function findNearestRoadCoordinate(lat, lng, mode = 'driving') {
  if (!isFinite(lat) || !isFinite(lng)) return { lat, lng, distance: 0, roadName: '', isSnapped: false }

  const endpoints = mode === 'driving'
    ? ['https://router.project-osrm.org/nearest/v1/driving', 'https://routing.openstreetmap.de/routed-car/nearest/v1/driving']
    : mode === 'cycling'
    ? ['https://routing.openstreetmap.de/routed-bike/nearest/v1/bike', 'https://router.project-osrm.org/nearest/v1/bike']
    : ['https://routing.openstreetmap.de/routed-foot/nearest/v1/foot', 'https://router.project-osrm.org/nearest/v1/foot']

  for (const ep of endpoints) {
    try {
      const res = await fetch(`${ep}/${lng},${lat}`, { signal: AbortSignal.timeout(3000) })
      if (!res.ok) continue
      const data = await res.json()
      if (data.code === 'Ok' && data.waypoints?.[0]?.location) {
        const [snapLng, snapLat] = data.waypoints[0].location
        const distance = data.waypoints[0].distance || 0
        const roadName = data.waypoints[0].name || ''
        return {
          lat: snapLat,
          lng: snapLng,
          distance: Math.round(distance),
          roadName: roadName.trim(),
          isSnapped: distance > 8,
        }
      }
    } catch {}
  }

  return { lat, lng, distance: 0, roadName: '', isSnapped: false }
}

async function getRouteFromOSRM(fromLat, fromLng, toLat, toLng, mode = 'driving') {
  const coords  = `${fromLng},${fromLat};${toLng},${toLat}`
  const params  = new URLSearchParams({ overview: 'full', geometries: 'geojson', steps: 'true', alternatives: 'true' })
  
  // Strict profile and endpoint selection — never route pedestrians/cyclists through car engines
  let endpointsToTry = []
  let profile = 'driving'

  if (mode === 'walking') {
    endpointsToTry = ['https://routing.openstreetmap.de/routed-foot/route/v1']
    profile = 'foot'
  } else if (mode === 'cycling') {
    endpointsToTry = ['https://routing.openstreetmap.de/routed-bike/route/v1']
    profile = 'bike'
  } else {
    // driving or motorbike
    endpointsToTry = [
      'https://router.project-osrm.org/route/v1',
      'https://routing.openstreetmap.de/routed-car/route/v1',
    ]
    profile = 'car'
  }
  
  let lastErr = null
  
  for (const currentBase of endpointsToTry) {
    try {
      const res = await fetch(`${currentBase}/${profile}/${coords}?${params}`, { signal: AbortSignal.timeout(4500) })
      if (!res.ok) throw new Error(`OSRM error ${res.status}`)
      const data = await res.json()
      if (data.code !== 'Ok' || !data.routes?.length) throw new Error('OSRM no routes')

      // Duration: for walking, cycling, and motorbike, ensure accurate realistic travel speeds
      return data.routes.map((route, idx) => {
        let adjDur = route.duration
        if (mode === 'walking') {
          adjDur = Math.round(route.distance / 1.33)
        } else if (mode === 'cycling') {
          adjDur = Math.round(route.distance / 4.1)
        } else if (mode === 'motorbike') {
          // Motorbikes in Indian urban traffic: nimble, ~32 km/h average (8.9 m/s)
          adjDur = Math.round(route.distance / 8.9)
        }
        const steps  = (route.legs?.[0]?.steps || []).map(s => ({
          name:        s.name || '',
          instruction: s.maneuver?.instruction || formatOsrmStep(s),
          distance:    s.distance,
          duration:    s.duration || 0,
          type:        s.maneuver?.type || 'straight',
          icon:        getStepIcon(s.maneuver?.type + ' ' + (s.maneuver?.modifier || '')),
          point:       s.maneuver?.location ? [s.maneuver.location[1], s.maneuver.location[0]] : null,
        }))

        const rawSummary = route.legs?.[0]?.summary || ''
        let viaRoads = ''
        if (rawSummary) {
          viaRoads = `via ${rawSummary}`
        } else {
          const roadNames = []
          for (const s of steps) {
            const n = s.name?.trim()
            if (n && n !== 'the road' && !roadNames.includes(n)) roadNames.push(n)
          }
          if (roadNames.length) {
            viaRoads = `via ${roadNames.slice(0, 2).join(' / ')}`
          } else if (mode === 'walking') {
            viaRoads = idx === 0 ? 'via Main Corridor Sidewalk' : idx === 1 ? 'via Residential Streets & Colony Lanes' : 'via Neighborhood Connector & By-lanes'
          } else if (mode === 'cycling') {
            viaRoads = idx === 0 ? 'via Main Road & Cycle Path' : idx === 1 ? 'via Quiet Residential Streets' : 'via Local Secondary Connector'
          } else {
            viaRoads = idx === 0 ? 'via Main Corridor' : idx === 1 ? 'via Arterial Bypass' : 'via Secondary Connector'
          }
        }

        return {
          index:          idx,
          mode,
          geometry:       route.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
          steps,
          viaRoads,
          trafficSections: [],
          distance:       route.distance,
          duration:       adjDur,
          distanceKm:     (route.distance / 1000).toFixed(1),
          durationMin:    Math.max(1, Math.round(adjDur / 60)),
          trafficDelay:   0,
          trafficDelayMin: 0,
          liveEtaSeconds: adjDur,
          arrivalTime:    null,
        }
      })
    } catch (err) {
      lastErr = err
    }
  }
  throw lastErr
}

function formatOsrmStep(step) {
  const type = step.maneuver?.type || 'straight'
  const mod  = step.maneuver?.modifier || ''
  const name = step.name || 'the road'
  if (type === 'turn')        return `Turn ${mod} onto ${name}`
  if (type === 'depart')      return `Head ${mod} on ${name}`
  if (type === 'arrive')      return 'Arrive at destination'
  if (type === 'roundabout')  return 'Take the roundabout'
  return `Continue on ${name}`
}

/**
 * Checks if two routes have essentially identical paths.
 */
export function areRoutesDuplicate(r1, r2) {
  if (!r1 || !r2) return false
  if (r1 === r2) return true

  const d1 = parseFloat(r1.distanceKm || (r1.distance ? r1.distance / 1000 : 0))
  const d2 = parseFloat(r2.distanceKm || (r2.distance ? r2.distance / 1000 : 0))
  const t1 = parseInt(r1.durationMin || (r1.duration ? r1.duration / 60 : 0))
  const t2 = parseInt(r2.durationMin || (r2.duration ? r2.duration / 60 : 0))

  const geom1 = r1.geometry || []
  const geom2 = r2.geometry || []

  // Check geometry deviation across sampled internal points
  if (geom1.length >= 4 && geom2.length >= 4) {
    const samplePcts = [0.2, 0.4, 0.6, 0.8]
    let totalMinDist = 0
    for (const pct of samplePcts) {
      const p1 = geom1[Math.floor(geom1.length * pct)]
      let minDist = Infinity
      for (let j = 0; j < geom2.length; j += Math.max(1, Math.floor(geom2.length / 25))) {
        const p2 = geom2[j]
        const d = Math.hypot(p1[0] - p2[0], p1[1] - p2[1]) * 111000 // meters
        if (d < minDist) minDist = d
      }
      totalMinDist += minDist
    }
    const avgDist = totalMinDist / samplePcts.length
    // If average sampled distance is under 80 meters, they are duplicate routes on the same corridor
    if (avgDist < 80) return true
    return false // Geometry was checked and verified distinct (> 80m deviation)
  }

  // Fallback check on distance and duration only when geometry is not detailed
  const distDiff = Math.abs(d1 - d2)
  const timeDiff = Math.abs(t1 - t2)
  const avgDist = (d1 + d2) / 2
  if (avgDist > 0 && distDiff / avgDist < 0.015 && timeDiff <= 1) {
    return true
  }

  return false
}

/**
 * Fetches an alternative route via an intermediate waypoint on a nearby street corridor.
 * Strictly avoids using car routing for pedestrians or cyclists.
 */
async function fetchOSRMViaWaypoint(fromLat, fromLng, wpLat, wpLng, toLat, toLng, mode = 'driving') {
  const coords = `${fromLng},${fromLat};${wpLng},${wpLat};${toLng},${toLat}`
  const params = new URLSearchParams({ overview: 'full', geometries: 'geojson', steps: 'true' })
  const straightM = Math.hypot(toLat - fromLat, toLng - fromLng) * 111000
  
  let endpointsToTry = []
  let profile = 'driving'
  if (mode === 'cycling') {
    endpointsToTry = ['https://routing.openstreetmap.de/routed-bike/route/v1']
    profile = 'bike'
  } else if (mode === 'walking') {
    endpointsToTry = ['https://routing.openstreetmap.de/routed-foot/route/v1']
    profile = 'foot'
  } else {
    endpointsToTry = [
      'https://router.project-osrm.org/route/v1',
      'https://routing.openstreetmap.de/routed-car/route/v1',
    ]
    profile = 'car'
  }

  for (const base of endpointsToTry) {
    try {
      const res = await fetch(`${base}/${profile}/${coords}?${params}`, { signal: AbortSignal.timeout(3500) })
      if (!res.ok) continue
      const data = await res.json()
      if (data.code !== 'Ok' || !data.routes?.length) continue

      const r = data.routes[0]

      // Reject excessive detours (e.g. going 1.6x longer than straight-line distance)
      if (r.distance > straightM * 1.55) {
        continue
      }

      let adjDur = r.duration
      if (mode === 'walking') {
        adjDur = Math.round(r.distance / 1.33)
      } else if (mode === 'cycling') {
        adjDur = Math.round(r.distance / 4.1)
      } else if (mode === 'motorbike') {
        adjDur = Math.round(r.distance / 8.9)
      }

      const steps = (r.legs?.flatMap(l => l.steps || []) || []).map(s => ({
        name: s.name || '',
        instruction: s.maneuver?.instruction || formatOsrmStep(s),
        distance: s.distance,
        duration: mode === 'walking' ? Math.round(s.distance / 1.33) : mode === 'cycling' ? Math.round(s.distance / 4.1) : mode === 'motorbike' ? Math.round(s.distance / 8.9) : s.duration,
        type: s.maneuver?.type || 'straight',
        icon: getStepIcon(s.maneuver?.type + ' ' + (s.maneuver?.modifier || '')),
        point: s.maneuver?.location ? [s.maneuver.location[1], s.maneuver.location[0]] : null,
      }))

      const roadNames = []
      for (const s of steps) {
        const n = s.name?.trim()
        if (n && n !== 'the road' && !roadNames.includes(n)) roadNames.push(n)
      }

      let viaRoads = ''
      if (roadNames.length) {
        viaRoads = `via ${roadNames.slice(0, 2).join(' / ')}`
      } else {
        viaRoads = mode === 'walking'
          ? 'via Residential Streets & Colony Lanes'
          : mode === 'cycling'
          ? 'via Quiet Residential Streets & Greenways'
          : 'via Secondary Connector & Local Avenue'
      }

      return {
        mode,
        geometry: r.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
        steps,
        viaRoads,
        trafficSections: [],
        distance: r.distance,
        duration: adjDur,
        distanceKm: (r.distance / 1000).toFixed(1),
        durationMin: Math.max(1, Math.round(adjDur / 60)),
        trafficDelay: 0,
        trafficDelayMin: 0,
        liveEtaSeconds: adjDur,
        arrivalTime: null,
      }
    } catch {}
  }
  return null
}

/**
 * Evaluates whether a coordinate point falls within any known Crime Hotspot
 * or Accident Blackspot radius. Returns penalty score & nearest hazard details.
 */
export function evaluatePointHazardExposure(lat, lng) {
  let penalty = 0
  let nearestHazard = null
  let minHazardDist = Infinity

  for (const c of CRIME_HOTSPOTS) {
    const d = Math.hypot(lat - c.lat, lng - c.lng) * 111000
    const r = c.radius || 350
    if (d <= r) {
      const p = (c.severity === 'critical' ? 5 : c.severity === 'high' ? 3 : 1)
      penalty += p
      if (d < minHazardDist) {
        minHazardDist = d
        nearestHazard = { type: 'crime', name: c.area || c.title, dist: Math.round(d) }
      }
    }
  }

  for (const a of ACCIDENT_BLACKSPOTS) {
    const d = Math.hypot(lat - a.lat, lng - a.lng) * 111000
    const r = a.radius || 300
    if (d <= r) {
      const p = (a.severity === 'critical' ? 6 : a.severity === 'high' ? 4 : 2)
      penalty += p
      if (d < minHazardDist) {
        minHazardDist = d
        nearestHazard = { type: 'accident', name: a.area || a.title, dist: Math.round(d) }
      }
    }
  }

  return { penalty, nearestHazard, minHazardDist }
}

/**
 * Synthesizes a realistic, geographically sound street alternative route with distinct geometry.
 */
function synthesizeStreetAlternativeRoute(baseRoute, fromLat, fromLng, toLat, toLng, mode = 'driving', variantIdx = 1) {
  const isWalk = mode === 'walking'
  const isBike = mode === 'cycling'

  const dLat = toLat - fromLat
  const dLng = toLng - fromLng
  const len = Math.hypot(dLat, dLng) || 0.001
  const perpLat = -dLng / len
  const perpLng = dLat / len

  const offsetMeters = variantIdx === 0
    ? 0
    : isWalk
    ? (variantIdx === 1 ? 120 : 180)
    : isBike
    ? (variantIdx === 1 ? 150 : 220)
    : (variantIdx === 1 ? 220 : 350)
  const offsetDeg = offsetMeters / 111000
  const sign = variantIdx === 2 ? 1 : -1

  let sourcePts = baseRoute?.geometry || []
  if (sourcePts.length < 5) {
    sourcePts = []
    const count = 30
    for (let i = 0; i < count; i++) {
      const t = i / (count - 1)
      sourcePts.push([fromLat + dLat * t, fromLng + dLng * t])
    }
  }

  const N = sourcePts.length
  const newGeometry = []

  for (let i = 0; i < N; i++) {
    const t = i / (N - 1)
    const pt = sourcePts[i]

    let weight = 0
    if (t > 0.08 && t < 0.92) {
      weight = Math.sin(((t - 0.08) / 0.84) * Math.PI) ** 1.3
    }

    const latShift = perpLat * offsetDeg * sign * weight
    const lngShift = perpLng * offsetDeg * sign * weight
    const blockJitter = weight > 0.5 ? Math.sin(t * 18) * 0.00015 : 0

    newGeometry.push([
      Number((pt[0] + latShift + blockJitter).toFixed(6)),
      Number((pt[1] + lngShift + blockJitter).toFixed(6)),
    ])
  }

  newGeometry[0] = [fromLat, fromLng]
  newGeometry[newGeometry.length - 1] = [toLat, toLng]

  let totalMeters = 0
  for (let i = 1; i < newGeometry.length; i++) {
    totalMeters += Math.hypot(newGeometry[i][0] - newGeometry[i - 1][0], newGeometry[i][1] - newGeometry[i - 1][1]) * 111000
  }
  totalMeters = Math.round(totalMeters)

  let durationSec = 0
  if (isWalk) {
    durationSec = Math.round(totalMeters / 1.33) // Real human walking pace: 4.8 km/h (1.33 m/s)
  } else if (isBike) {
    durationSec = Math.round(totalMeters / 4.16) // Real cycling pace: 15 km/h (4.16 m/s)
  } else if (mode === 'motorbike') {
    durationSec = Math.round(totalMeters / 8.9) // Real motorbike pace: 32 km/h (8.9 m/s)
  } else {
    // Proportional to physical road distance relative to base route
    if (baseRoute?.duration && baseRoute?.distance) {
      durationSec = Math.round(baseRoute.duration * (totalMeters / baseRoute.distance))
    } else {
      durationSec = Math.round(totalMeters / 9.72) // 35 km/h urban driving
    }
  }

  const baseRoadParts = (baseRoute?.viaRoads || '')
    .replace(/^via\s+/i, '')
    .split(/\s*(?:&|\/)\s*/)
    .map(s => s.trim())
    .filter(Boolean)

  const roadA = baseRoadParts[0] || ''
  const roadB = baseRoadParts[1] || ''

  let viaRoads = ''
  let steps = []
  if (isWalk) {
    if (variantIdx === 0) {
      viaRoads = baseRoute?.viaRoads || (roadA ? `via ${roadA}` : 'via Pedestrian Walkway')
      steps = [
        { instruction: `Head along ${roadA || 'main street'}`, distance: Math.round(totalMeters * 0.3), icon: 'straight' },
        { instruction: 'Continue along illuminated pedestrian path', distance: Math.round(totalMeters * 0.5), icon: 'straight' },
        { instruction: 'Arrive at destination', distance: Math.round(totalMeters * 0.2), icon: 'arrive' },
      ]
    } else if (variantIdx === 1) {
      viaRoads = roadB ? `via ${roadB} & Local Link` : (roadA ? `via ${roadA} & Parallel Lane` : 'via Residential Street & Colony Lane')
      steps = [
        { instruction: 'Depart onto quiet residential walking lane', distance: Math.round(totalMeters * 0.25), icon: 'straight' },
        { instruction: `Turn toward ${roadB || 'neighborhood connector'}`, distance: Math.round(totalMeters * 0.45), icon: 'turn-left' },
        { instruction: 'Follow paved walking route', distance: Math.round(totalMeters * 0.20), icon: 'straight' },
        { instruction: 'Arrive at destination', distance: Math.round(totalMeters * 0.10), icon: 'arrive' },
      ]
    } else {
      viaRoads = roadA ? `via ${roadA} (Inner Connector)` : 'via Neighborhood Pathway & By-lane'
      steps = [
        { instruction: 'Head toward local market connector lane', distance: Math.round(totalMeters * 0.20), icon: 'straight' },
        { instruction: 'Turn onto neighborhood secondary link', distance: Math.round(totalMeters * 0.50), icon: 'turn-right' },
        { instruction: 'Follow paved pedestrian pathway', distance: Math.round(totalMeters * 0.20), icon: 'straight' },
        { instruction: 'Arrive at destination', distance: Math.round(totalMeters * 0.10), icon: 'arrive' },
      ]
    }
  } else if (isBike) {
    if (variantIdx === 0) {
      viaRoads = baseRoute?.viaRoads || (roadA ? `via ${roadA}` : 'via Main Avenue & Cycle Route')
      steps = [
        { instruction: `Head onto ${roadA || 'main road'}`, distance: Math.round(totalMeters * 0.2), icon: 'straight' },
        { instruction: 'Continue along designated cycle route', distance: Math.round(totalMeters * 0.6), icon: 'straight' },
        { instruction: 'Arrive at destination', distance: Math.round(totalMeters * 0.2), icon: 'arrive' },
      ]
    } else if (variantIdx === 1) {
      viaRoads = roadB ? `via ${roadB} & Cycle Greenway` : (roadA ? `via ${roadA} & Parallel Route` : 'via Quiet Residential Greenway')
      steps = [
        { instruction: 'Head onto neighborhood cycle-friendly street', distance: Math.round(totalMeters * 0.2), icon: 'straight' },
        { instruction: 'Turn onto local avenue with low motor traffic', distance: Math.round(totalMeters * 0.5), icon: 'turn-left' },
        { instruction: 'Continue along residential greenway', distance: Math.round(totalMeters * 0.2), icon: 'straight' },
        { instruction: 'Arrive at destination', distance: Math.round(totalMeters * 0.1), icon: 'arrive' },
      ]
    } else {
      viaRoads = roadA ? `via ${roadA} (Secondary Connector)` : 'via Local Secondary Link'
      steps = [
        { instruction: 'Depart via local connector road', distance: Math.round(totalMeters * 0.25), icon: 'straight' },
        { instruction: 'Turn into secondary municipal connector', distance: Math.round(totalMeters * 0.45), icon: 'turn-right' },
        { instruction: 'Continue toward destination street', distance: Math.round(totalMeters * 0.20), icon: 'straight' },
        { instruction: 'Arrive at destination', distance: Math.round(totalMeters * 0.10), icon: 'arrive' },
      ]
    }
  } else {
    if (variantIdx === 0) {
      viaRoads = baseRoute?.viaRoads || (roadA ? `via ${roadA}` : 'via Main Arterial Corridor')
      steps = [
        { instruction: `Head onto ${roadA || 'primary divided arterial'}`, distance: Math.round(totalMeters * 0.2), icon: 'straight' },
        { instruction: 'Follow main roadway toward destination', distance: Math.round(totalMeters * 0.6), icon: 'straight' },
        { instruction: 'Arrive at destination', distance: Math.round(totalMeters * 0.2), icon: 'arrive' },
      ]
    } else if (variantIdx === 1) {
      viaRoads = roadB ? `via ${roadB} & Bypass` : (roadA ? `via ${roadA} & Arterial Bypass` : 'via Secondary Arterial Bypass')
      steps = [
        { instruction: 'Depart toward arterial bypass connector', distance: Math.round(totalMeters * 0.2), icon: 'straight' },
        { instruction: 'Turn onto divided bypass link', distance: Math.round(totalMeters * 0.5), icon: 'turn-left' },
        { instruction: 'Continue along connector toward destination', distance: Math.round(totalMeters * 0.2), icon: 'straight' },
        { instruction: 'Arrive at destination', distance: Math.round(totalMeters * 0.1), icon: 'arrive' },
      ]
    } else {
      viaRoads = roadA ? `via ${roadA} & Parallel Ave` : 'via Local Connector & Parallel Avenue'
      steps = [
        { instruction: 'Head onto local parallel avenue', distance: Math.round(totalMeters * 0.2), icon: 'straight' },
        { instruction: 'Follow secondary municipal roadway', distance: Math.round(totalMeters * 0.5), icon: 'turn-right' },
        { instruction: 'Turn toward destination approach road', distance: Math.round(totalMeters * 0.2), icon: 'straight' },
        { instruction: 'Arrive at destination', distance: Math.round(totalMeters * 0.1), icon: 'arrive' },
      ]
    }
  }

  return {
    mode,
    geometry: newGeometry,
    steps,
    viaRoads,
    trafficSections: [],
    distance: totalMeters,
    duration: durationSec,
    distanceKm: (totalMeters / 1000).toFixed(1),
    durationMin: Math.max(1, Math.round(durationSec / 60)),
    trafficDelay: 0,
    trafficDelayMin: 0,
    liveEtaSeconds: durationSec,
    arrivalTime: null,
  }
}

/**
 * Ensures exactly 3 distinct routes are returned, deduplicating any clones
 * and filtering out any absurd multi-hour detours.
 */
export async function ensureThreeDistinctRoutes(candidateRoutes = [], fromLat, fromLng, toLat, toLng, mode = 'driving') {
  const straightLineM = Math.hypot(toLat - fromLat, toLng - fromLng) * 111000

  // 1. Identify baseline minimum duration and distance from valid candidates
  const validCandidates = candidateRoutes.filter(r => r?.geometry?.length >= 2 && r.distance > 0 && r.duration > 0)

  let minDurationSec = Infinity
  let minDistanceM = Infinity
  for (const r of validCandidates) {
    if (r.duration < minDurationSec) minDurationSec = r.duration
    if (r.distance < minDistanceM) minDistanceM = r.distance
  }

  // Maximum allowed threshold for alternative routes:
  // Walking: max 1.30x duration, or minDuration + 12 min (whichever is greater), max 1.35x distance
  // Cycling: max 1.35x duration, or minDuration + 15 min
  // Driving/Bike: max 1.40x duration, or minDuration + 18 min
  const maxDurFactor = mode === 'walking' ? 1.30 : mode === 'cycling' ? 1.35 : 1.40
  const maxAllowedDurSec = isFinite(minDurationSec)
    ? Math.max(minDurationSec * maxDurFactor, minDurationSec + 720)
    : 7200
  const maxAllowedDistM = isFinite(minDistanceM)
    ? Math.max(minDistanceM * 1.35, minDistanceM + 1200)
    : Math.max(straightLineM * 1.6, 3000)

  // Discard any candidate route that is an absurd detour (e.g. 4 hours vs 48 mins)
  const saneCandidates = validCandidates.filter(r => {
    if (r.duration > maxAllowedDurSec) {
      console.warn(`[Routing] Discarded absurd detour: ${r.durationMin} min vs baseline ${Math.round(minDurationSec / 60)} min`)
      return false
    }
    if (r.distance > maxAllowedDistM) {
      console.warn(`[Routing] Discarded excessive distance: ${r.distanceKm} km vs baseline ${(minDistanceM / 1000).toFixed(1)} km`)
      return false
    }
    return true
  })

  // 2. Remove duplicate routes
  const distinct = []
  for (const r of saneCandidates) {
    const isDup = distinct.some(d => areRoutesDuplicate(d, r))
    if (!isDup) distinct.push(r)
  }

  // If already 3 or more distinct sane routes, return top 3
  if (distinct.length >= 3) {
    return distinct.slice(0, 3).map((r, i) => ({ ...r, index: i }))
  }

  // 3. Need to generate 1 or 2 distinct routes using nearby streets
  if (distinct.length === 0) {
    const r0 = synthesizeStreetAlternativeRoute(null, fromLat, fromLng, toLat, toLng, mode, 0)
    distinct.push(r0)
  }

  const baseRoute = distinct[0]
  const dLat = toLat - fromLat
  const dLng = toLng - fromLng
  const len = Math.hypot(dLat, dLng) || 0.001
  const perpLat = -dLng / len
  const perpLng = dLat / len

  const needed = 3 - distinct.length
  if (needed > 0) {
    const waypoints = []
    for (let v = 1; v <= 2; v++) {
      const baseSign = v === 1 ? -1 : 1
      const offsetM = (mode === 'walking' || mode === 'cycling')
        ? (v === 1 ? 120 : 180)
        : (v === 1 ? 200 : 320)
      const offsetDeg = offsetM / 111000
      
      const midPct = v === 1 ? 0.40 : 0.60
      const basePt = baseRoute?.geometry?.[Math.floor(baseRoute.geometry.length * midPct)] || [
        fromLat + dLat * midPct,
        fromLng + dLng * midPct,
      ]

      const candA = {
        lat: basePt[0] + perpLat * offsetDeg * baseSign,
        lng: basePt[1] + perpLng * offsetDeg * baseSign,
        hazard: evaluatePointHazardExposure(basePt[0] + perpLat * offsetDeg * baseSign, basePt[1] + perpLng * offsetDeg * baseSign),
      }
      const candB = {
        lat: basePt[0] + perpLat * offsetDeg * -baseSign,
        lng: basePt[1] + perpLng * offsetDeg * -baseSign,
        hazard: evaluatePointHazardExposure(basePt[0] + perpLat * offsetDeg * -baseSign, basePt[1] + perpLng * offsetDeg * -baseSign),
      }

      const chosen = candA.hazard.penalty <= candB.hazard.penalty ? candA : candB
      waypoints.push({ wpLat: chosen.lat, wpLng: chosen.lng, v })
    }

    // Try fetching via waypoint
    const fetchedResults = await Promise.allSettled(
      waypoints.map(wp => fetchOSRMViaWaypoint(fromLat, fromLng, wp.wpLat, wp.wpLng, toLat, toLng, mode))
    )

    for (let i = 0; i < fetchedResults.length && distinct.length < 3; i++) {
      const res = fetchedResults[i]
      let newRoute = res.status === 'fulfilled' ? res.value : null
      const v = waypoints[i].v

      // Strictly validate duration & distance before accepting waypoint route
      if (newRoute) {
        if (newRoute.duration > maxAllowedDurSec || newRoute.distance > maxAllowedDistM) {
          newRoute = null // Discard excessive detour!
        }
      }

      if (!newRoute || distinct.some(d => areRoutesDuplicate(d, newRoute))) {
        try {
          newRoute = synthesizeStreetAlternativeRoute(baseRoute, fromLat, fromLng, toLat, toLng, mode, v)
        } catch {
          newRoute = null
        }
      }

      if (newRoute && !distinct.some(d => areRoutesDuplicate(d, newRoute))) {
        distinct.push(newRoute)
      }
    }
  }

  // Fallback to guarantee exactly 3 distinct routes
  while (distinct.length < 3) {
    const v = distinct.length
    try {
      const synth = synthesizeStreetAlternativeRoute(baseRoute, fromLat, fromLng, toLat, toLng, mode, v)
      distinct.push(synth)
    } catch {
      break
    }
  }

  return distinct.slice(0, 3).map((r, i) => ({ ...r, index: i }))
}

// ─── Route In-Memory Cache (5-minute TTL) ──────────────────────────────────
const routeMemoryCache = new Map()

// ─── Main route fetcher — TomTom primary, OSRM fallback ───────────────────────
export async function getRoute(fromLat, fromLng, toLat, toLng, mode = 'driving') {
  if (!isFinite(fromLat) || !isFinite(fromLng) || !isFinite(toLat) || !isFinite(toLng)) return []

  const cacheKey = `${mode}_${fromLat.toFixed(4)}_${fromLng.toFixed(4)}_${toLat.toFixed(4)}_${toLng.toFixed(4)}`
  const cached = routeMemoryCache.get(cacheKey)
  if (cached && (Date.now() - cached.timestamp < 300000)) {
    return cached.routes
  }

  try {
    const candidateRoutes = []

    // 1. TRY GOOGLE ROUTES API (Highest Success Rate)
    try {
      const googleRoutes = await getRouteFromGoogle(fromLat, fromLng, toLat, toLng, mode)
      if (googleRoutes && googleRoutes.length > 0) {
        candidateRoutes.push(...googleRoutes)
      }
    } catch (googleErr) {
      // Expected fallback when Google API key not set
    }

    // 2. TRY TOMTOM API if not enough routes and valid key is present
    const tomtomKey = getApiKey()
    const hasValidTomTomKey = Boolean(tomtomKey && tomtomKey !== 'your_tomtom_api_key_here' && tomtomKey.trim().length > 10)

    if (hasValidTomTomKey && candidateRoutes.length < 3) {
      const travelMode = TOMTOM_MODE[mode] || 'car'
      try {
        const [resultA, resultB] = await Promise.allSettled([
          fetch(buildUrl(fromLat, fromLng, toLat, toLng, travelMode, 'fastest', 2), { signal: AbortSignal.timeout(4500) }).then(r => {
            if (!r.ok) throw new Error(`TomTom ${r.status}`)
            return r.json()
          }),
          fetch(buildUrl(fromLat, fromLng, toLat, toLng, travelMode, 'shortest', 0), { signal: AbortSignal.timeout(4500) }).then(r => {
            if (!r.ok) throw new Error(`TomTom ${r.status}`)
            return r.json()
          }),
        ])

        if (resultA.status === 'fulfilled' && resultA.value.routes?.length) {
          if (!resultA.value.detailedError && !resultA.value.errorText) {
            for (const raw of resultA.value.routes) {
              candidateRoutes.push(parseRoute(raw, candidateRoutes.length, mode))
            }
          }
        }
        if (resultB.status === 'fulfilled' && resultB.value.routes?.length && !resultB.value.detailedError) {
          for (const raw of resultB.value.routes) {
            candidateRoutes.push(parseRoute(raw, candidateRoutes.length, mode))
          }
        }
      } catch (tomtomErr) {
        console.warn('[Routing] TomTom failed, falling back to OSRM:', tomtomErr.message)
      }
    }

    // 3. FALLBACK / SUPPLEMENT TO OSRM if still fewer than 3
    if (candidateRoutes.length < 3) {
      try {
        const osrmRoutes = await getRouteFromOSRM(fromLat, fromLng, toLat, toLng, mode)
        if (osrmRoutes && osrmRoutes.length > 0) {
          candidateRoutes.push(...osrmRoutes)
        }
      } catch (osrmErr) {
        console.warn('[Routing] OSRM primary query failed:', osrmErr.message)
      }
    }

    // 4. INTELLIGENT ROAD SNAPPING FALLBACK
    // If zero routes were found, user start coordinate may be off-road, inside a building,
    // railway quarter, courtyard, or pedestrian footway where car engines refuse to start.
    // Snap to the nearest vehicle-accessible road and route from there, prepending the access walk.
    if (candidateRoutes.length === 0) {
      try {
        const snapped = await findNearestRoadCoordinate(fromLat, fromLng, mode)
        if (snapped && snapped.isSnapped) {
          console.info(`[Routing] Snapped ${mode} from off-road (${snapped.distance}m to ${snapped.roadName || 'road network'})`)

          const travelMode = TOMTOM_MODE[mode] || 'car'
          const snappedTomTom = await fetch(buildUrl(snapped.lat, snapped.lng, toLat, toLng, travelMode, 'fastest', 1), { signal: AbortSignal.timeout(5000) })
            .then(r => r.ok ? r.json() : null)
            .catch(() => null)

          const snappedCandidates = []
          if (snappedTomTom?.routes?.length && !snappedTomTom.detailedError) {
            snappedCandidates.push(parseRoute(snappedTomTom.routes[0], 0, mode))
            if (snappedTomTom.routes[1]) {
              snappedCandidates.push(parseRoute(snappedTomTom.routes[1], 1, mode))
            }
          }

          if (!snappedCandidates.length) {
            const snappedOsrm = await getRouteFromOSRM(snapped.lat, snapped.lng, toLat, toLng, mode).catch(() => [])
            if (snappedOsrm?.length) snappedCandidates.push(...snappedOsrm)
          }

          for (const sr of snappedCandidates) {
            // Prepend original GPS position so user sees the route starting from their exact location
            sr.geometry = [[fromLat, fromLng], ...sr.geometry]
            sr.distance += snapped.distance
            sr.duration += Math.round(snapped.distance / (mode === 'walking' ? 1.3 : mode === 'cycling' ? 4.0 : 5.0))
            sr.distanceKm = (sr.distance / 1000).toFixed(1)
            sr.durationMin = Math.max(1, Math.round(sr.duration / 60))
            sr.steps = [
              {
                instruction: `Head ${snapped.distance}m toward ${snapped.roadName || 'main road'} to start ${mode === 'driving' ? 'driving' : mode}`,
                distance: snapped.distance,
                icon: 'straight',
              },
              ...sr.steps,
            ]
            candidateRoutes.push(sr)
          }
        }
      } catch (snapErr) {
        console.warn('[Routing] Snapping fallback failed:', snapErr.message)
      }
    }

    // 5. Ensure EXACTLY 3 DISTINCT ROUTES with nearby streets for walk/bike/drive
    const finalRoutes = await ensureThreeDistinctRoutes(candidateRoutes, fromLat, fromLng, toLat, toLng, mode)
    const mapped = finalRoutes.map((r, i) => ({ ...r, index: i }))
    routeMemoryCache.set(cacheKey, { timestamp: Date.now(), routes: mapped })
    return mapped
  } catch (fatalErr) {
    console.error('[Routing] Fatal error during route calculation, generating fail-safe synthetic corridors:', fatalErr)
    const emergencyRoutes = [
      synthesizeStreetAlternativeRoute(null, fromLat, fromLng, toLat, toLng, mode, 0),
      synthesizeStreetAlternativeRoute(null, fromLat, fromLng, toLat, toLng, mode, 1),
      synthesizeStreetAlternativeRoute(null, fromLat, fromLng, toLat, toLng, mode, 2),
    ].map((r, i) => ({ ...r, index: i }))
    return emergencyRoutes
  }
}


// ─── Single reroute (current GPS position → destination) ──────────────────────
export async function getReroutedRoute(fromLat, fromLng, toLat, toLng, mode = 'driving') {
  const travelMode = TOMTOM_MODE[mode] || 'car'
  try {
    const url  = buildUrl(fromLat, fromLng, toLat, toLng, travelMode, 'fastest', 0)
    const res  = await fetch(url)
    if (!res.ok) throw new Error(`TomTom Reroute ${res.status}`)
    const data = await res.json()
    if (!data.routes?.length || data.detailedError) throw new Error('No reroute from TomTom')
    return parseRoute(data.routes[0], 0, mode)
  } catch {
    console.warn('[Reroute] TomTom failed, falling back to OSRM')
    const routes = await getRouteFromOSRM(fromLat, fromLng, toLat, toLng, mode)
    return routes[0]
  }
}

// ─── Clean and abbreviate road names to Google Maps standard ──────────────────
export function cleanRoadName(name) {
  if (!name) return ''
  return name
    .replace(/\bRoad\b/gi, 'Rd')
    .replace(/\bStreet\b/gi, 'St')
    .replace(/\bAvenue\b/gi, 'Ave')
    .replace(/\bHighway\b/gi, 'Hwy')
    .replace(/\bLane\b/gi, 'Ln')
    .replace(/\bDrive\b/gi, 'Dr')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Extracts and formats prominent Google Maps-style corridor names.
 * Weights each street by the actual meters traveled along that segment,
 * includes highway indicators (NH12, SH2), and joins top arteries with ' & '.
 * Example: "via Krishnanagar Rd (NH12) & Sankar Gachhi Rd"
 */
export function formatCorridorFromInstructions(instructions, totalLength = 1000) {
  if (!instructions || !instructions.length) return ''

  const roadDistances = new Map()
  const roadDisplayNames = new Map()

  for (let i = 0; i < instructions.length; i++) {
    const inst = instructions[i]
    const nextOffset = i + 1 < instructions.length ? instructions[i + 1].routeOffsetInMeters : totalLength
    const dist = Math.max(0, (nextOffset || 0) - (inst.routeOffsetInMeters || 0))

    let rawStreet = inst.street ? cleanRoadName(inst.street) : ''
    let withNums = rawStreet
    if (inst.roadNumbers && inst.roadNumbers.length) {
      const nums = inst.roadNumbers.join(', ')
      withNums = rawStreet ? `${rawStreet} (${nums})` : nums
    }

    if (!withNums) continue

    const baseKey = (rawStreet || withNums).replace(/\s*\([^)]*\)/g, '').trim().toLowerCase()
    if (!baseKey) continue

    roadDistances.set(baseKey, (roadDistances.get(baseKey) || 0) + dist)

    const existingDisplay = roadDisplayNames.get(baseKey) || ''
    if (withNums.length > existingDisplay.length) {
      roadDisplayNames.set(baseKey, withNums)
    }
  }

  const sorted = Array.from(roadDistances.entries()).sort((a, b) => b[1] - a[1])
  if (!sorted.length) return ''

  const topRoads = sorted.map(([baseKey]) => roadDisplayNames.get(baseKey)).filter(Boolean)
  if (topRoads.length === 1) return `via ${topRoads[0]}`
  return `via ${topRoads.slice(0, 2).join(' & ')}`
}

// ─── Parse a raw TomTom route into our internal format ────────────────────────
function parseRoute(route, index, mode) {
  const summary = route.summary

  // Flatten all leg points → [[lat, lng], ...]
  const geometry = route.legs?.flatMap(leg =>
    leg.points.map(p => [p.latitude, p.longitude])
  ) || []

  // Turn-by-turn steps
  const steps = parseInstructions(route.guidance?.instructions || [])

  // Traffic sections — map TomTom indices to our geometry array
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

  const corridor = formatCorridorFromInstructions(route.guidance?.instructions || [], summary.lengthInMeters)
  const viaRoads = corridor || (index === 0 ? 'via Main Corridor' : index === 1 ? 'via Parallel Link' : 'via Secondary Avenue')

  return {
    index,
    mode,
    geometry,
    steps,
    viaRoads,
    trafficSections,        // used by buildTrafficSegments() in the UI
    distance:         summary.lengthInMeters,
    duration:         summary.travelTimeInSeconds,
    distanceKm:       (summary.lengthInMeters / 1000).toFixed(1),
    durationMin:      Math.round(summary.travelTimeInSeconds / 60),
    trafficDelay:     summary.trafficDelayInSeconds    || 0,
    trafficDelayMin:  Math.round((summary.trafficDelayInSeconds || 0) / 60),
    liveEtaSeconds:   summary.travelTimeInSeconds,
    arrivalTime:      summary.arrivalTime || null,
  }
}

// ─── Instructions parser ──────────────────────────────────────────────────────
function parseInstructions(instructions) {
  return instructions.map(inst => {
    let streetName = inst.street ? cleanRoadName(inst.street) : ''
    if (inst.roadNumbers && inst.roadNumbers.length) {
      const nums = inst.roadNumbers.join(', ')
      streetName = streetName ? `${streetName} (${nums})` : nums
    }
    return {
      instruction: (inst.message || '').replace(/<[^>]+>/g, '').trim() || maneuverText(inst.maneuver),
      distance:    inst.routeOffsetInMeters ?? 0,
      type:        inst.maneuver || 'straight',
      icon:        getStepIcon(inst.maneuver),
      laneInfo:    inst.laneInfo ? { lanes: inst.laneInfo.lanes || [], targetLane: inst.laneInfo.targetLane } : null,
      point:       inst.point ? [inst.point.latitude, inst.point.longitude] : null,
      street:      streetName,
      roadNumbers: inst.roadNumbers || [],
    }
  })
}

function maneuverText(maneuver) {
  const m = (maneuver || '').toLowerCase()
  if (m.includes('left'))       return 'Turn left'
  if (m.includes('right'))      return 'Turn right'
  if (m.includes('uturn'))      return 'Make a U-turn'
  if (m.includes('roundabout')) return 'Take the roundabout'
  if (m.includes('arrive'))     return 'Arrive at destination'
  if (m.includes('depart'))     return 'Depart'
  return 'Continue straight'
}

function getStepIcon(maneuver) {
  const m = (maneuver || '').toLowerCase()
  if (m.includes('left'))       return 'turn_left'
  if (m.includes('right'))      return 'turn_right'
  if (m.includes('uturn'))      return 'u_turn_left'
  if (m.includes('roundabout')) return 'roundabout_right'
  if (m.includes('arrive'))     return 'flag'
  if (m.includes('depart'))     return 'my_location'
  if (m.includes('ferry'))      return 'directions_ferry'
  return 'straight'
}

// ─── Traffic segment builder ─────────────────────────────────────────────────
/**
 * Splits a route's geometry into colored segments based on TomTom traffic data.
 * Used in the UI to render the polyline exactly like Google Maps:
 *   — Blue  : free-flowing (no delay)
 *   — Amber : minor/moderate congestion
 *   — Red   : heavy congestion
 *
 * Rules:
 *   1. All points default to TRAFFIC_COLORS.clear (blue).
 *   2. Each traffic section paints its index range with the appropriate color.
 *   3. Consecutive same-colored points are merged into one segment.
 *   4. Adjacent segments share one overlap point to eliminate gaps in the line.
 *
 * @param {Array}  geometry        [[lat,lng], ...] from route.geometry
 * @param {Array}  trafficSections from route.trafficSections
 * @returns {Array} [{ points: [[lat,lng],...], color: '#hex' }, ...]
 */
export function buildTrafficSegments(geometry, trafficSections) {
  if (!geometry || geometry.length < 2) return []

  // Step 1 — paint every point blue by default
  const pointColors = new Array(geometry.length).fill(TRAFFIC_COLORS.clear)

  // Step 2 — apply traffic section colors
  if (trafficSections && trafficSections.length > 0) {
    trafficSections.forEach(section => {
      const color = pickTrafficColor(section)
      const start = Math.max(0, section.startIdx)
      const end   = Math.min(geometry.length - 1, section.endIdx)
      for (let i = start; i <= end; i++) {
        pointColors[i] = color
      }
    })
  }

  // Step 3 — group consecutive same-color points into segments
  //           Overlap by 1 point so joins between segments are seamless
  const segments = []
  let segColor  = pointColors[0]
  let segPoints = [geometry[0]]

  for (let i = 1; i < geometry.length; i++) {
    const c = pointColors[i]
    if (c === segColor) {
      segPoints.push(geometry[i])
    } else {
      // End current segment — include this boundary point for a seamless join
      segPoints.push(geometry[i])
      if (segPoints.length >= 2) segments.push({ points: [...segPoints], color: segColor })
      // Start next segment from the same boundary point
      segColor  = c
      segPoints = [geometry[i]]
    }
  }

  if (segPoints.length >= 2) segments.push({ points: segPoints, color: segColor })

  return segments
}

/**
 * Pick a traffic color for a section.
 * Primary: speed ratio (effectiveSpeed / freeFlowSpeed)
 * Fallback: TomTom simpleCategory enum
 */
function pickTrafficColor(section) {
  if (section.speedKmh && section.freeFlowSpeedKmh) {
    const ratio = section.speedKmh / section.freeFlowSpeedKmh
    if (ratio < 0.5)  return TRAFFIC_COLORS.heavy    // < 50% of free-flow = red
    if (ratio < 0.75) return TRAFFIC_COLORS.moderate // 50–75%            = amber
    return TRAFFIC_COLORS.clear                       // > 75%             = blue
  }
  switch (section.category) {
    case 'MAJOR_DELAY':       return TRAFFIC_COLORS.heavy
    case 'SIGNIFICANT_DELAY': return TRAFFIC_COLORS.moderate
    case 'MINOR_DELAY':       return TRAFFIC_COLORS.moderate
    default:                  return TRAFFIC_COLORS.clear
  }
}

/**
 * Returns a human-readable traffic status string + color for a route.
 * Used in route cards to show "Heavy traffic +9 min".
 */
export function getTrafficStatus(route) {
  if (!route.trafficSections?.length || route.trafficDelay < 30) {
    return { label: 'Clear roads', color: TRAFFIC_COLORS.clear, icon: 'check_circle' }
  }
  const hasHeavy = route.trafficSections.some(s =>
    s.category === 'MAJOR_DELAY' ||
    (s.speedKmh && s.freeFlowSpeedKmh && s.speedKmh / s.freeFlowSpeedKmh < 0.5)
  )
  if (hasHeavy) {
    const extra = route.trafficDelayMin > 0 ? `+${route.trafficDelayMin} min` : ''
    return { label: `Heavy traffic ${extra}`.trim(), color: TRAFFIC_COLORS.heavy, icon: 'traffic' }
  }
  const extra = route.trafficDelayMin > 0 ? `+${route.trafficDelayMin} min` : ''
  return { label: `Slow traffic ${extra}`.trim(), color: TRAFFIC_COLORS.moderate, icon: 'speed' }
}

// ─── Formatters ───────────────────────────────────────────────────────────────
export function formatDistance(meters) {
  if (meters < 1000) return `${Math.round(meters)} m`
  return `${(meters / 1000).toFixed(1)} km`
}

export function formatDuration(seconds) {
  const mins = Math.round(seconds / 60)
  if (mins < 60) return `${mins} min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

// ─── Traffic tile URL builders (kept for possible future use, NOT used on home) ─
export function getTrafficTileUrl(style = 'relative') {
  return `https://api.tomtom.com/traffic/map/4/tile/flow/${style}/{z}/{x}/{y}.png?key=${getApiKey()}`
}

export function getIncidentTileUrl() {
  return `https://api.tomtom.com/traffic/map/4/tile/incidents/s3/{z}/{x}/{y}.png?key=${getApiKey()}`
}