import { getRouteFromGoogle } from './googleRouting'
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

import { getTomTomKey } from './apiKeys'
const BASE_URL = 'https://api.tomtom.com/routing/1'

// ─── Transport mode map ────────────────────────────────────────────────────────
const TOMTOM_MODE = {
  driving: 'car',
  walking: 'pedestrian',
  cycling: 'bicycle',
}

export const MODE_LABELS = {
  driving: { label: 'Drive', icon: 'directions_car',  color: '#004ac6', speed: '40 km/h avg' },
  walking: { label: 'Walk',  icon: 'directions_walk', color: '#10B981', speed: '5 km/h avg'  },
  cycling: { label: 'Cycle', icon: 'directions_bike', color: '#F59E0B', speed: '15 km/h avg' },
}

// ─── Traffic segment colors (Google Maps palette, no neon) ────────────────────
export const TRAFFIC_COLORS = {
  clear:    '#3d85c8',   // Solid blue — free flowing
  moderate: '#F59E0B',   // Amber — minor/moderate delay
  heavy:    '#EF4444',   // Red — significant/major delay
}

// ─── Build URL ────────────────────────────────────────────────────────────────
function buildUrl(fromLat, fromLng, toLat, toLng, travelMode, routeType, maxAlternatives = 0) {
  const apiKey = getTomTomKey()
  return (
    `${BASE_URL}/calculateRoute/` +
    `${fromLat},${fromLng}:${toLat},${toLng}/json` +
    `?key=${apiKey}` +
    `&travelMode=${travelMode}` +
    `&routeType=${routeType}` +
    `&traffic=true` +
    `&maxAlternatives=${maxAlternatives}` +
    `&instructionsType=tagged` +
    `&sectionType=traffic`   // returns per-segment traffic data for polyline coloring
  )
}

// ─── OSRM fallback (free, no API key) ────────────────────────────────────────
const OSRM_ENDPOINTS = [
  'https://router.project-osrm.org/route/v1',
  'https://routing.openstreetmap.de/routed-car/route/v1',
  'https://routing.openstreetmap.de/routed-bike/route/v1',
  'https://routing.openstreetmap.de/routed-foot/route/v1'
]

const MODE_MULTIPLIERS = {
  driving: 1,
  walking: 4.2,
  cycling: 2.1,
}

async function getRouteFromOSRM(fromLat, fromLng, toLat, toLng, mode = 'driving') {
  const coords  = `${fromLng},${fromLat};${toLng},${toLat}`
  const params  = new URLSearchParams({ overview: 'full', geometries: 'geojson', steps: 'true', alternatives: 'true' })
  
  let endpointIdx = 0
  if (mode === 'cycling') endpointIdx = 2
  else if (mode === 'walking') endpointIdx = 3
  
  let lastErr = null
  
  // Try up to 2 endpoints for redundancy
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const base = OSRM_ENDPOINTS[endpointIdx] || OSRM_ENDPOINTS[0]
      // Fallback to primary if specific mode router fails
      const currentBase = attempt === 0 ? base : OSRM_ENDPOINTS[0]
      const profile = (attempt === 0 && endpointIdx > 0) ? mode : 'driving'
      
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000)

      const res = await fetch(`${currentBase}/${profile}/${coords}?${params}`, { signal: controller.signal })
      clearTimeout(timeoutId)

      if (!res.ok) throw new Error(`OSRM error ${res.status}`)
      const data = await res.json()
      if (data.code !== 'Ok' || !data.routes?.length) throw new Error('OSRM no routes')

      const mult = MODE_MULTIPLIERS[mode] || 1
      return data.routes.map((route, idx) => {
        const adjDur = route.duration * mult
        const steps  = (route.legs?.[0]?.steps || []).map(s => ({
          name:        s.name || '',
          instruction: s.maneuver?.instruction || formatOsrmStep(s),
          distance:    s.distance,
          duration:    s.duration * mult,
          type:        s.maneuver?.type || 'straight',
          icon:        getStepIcon(s.maneuver?.type + ' ' + (s.maneuver?.modifier || '')),
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
          viaRoads = roadNames.length ? `via ${roadNames.slice(0, 2).join(' / ')}` : (idx === 0 ? 'via Main Corridor' : idx === 1 ? 'via Arterial Bypass' : 'via Alternate Corridor')
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

// ─── Main route fetcher — TomTom primary, OSRM fallback ───────────────────────
export async function getRoute(fromLat, fromLng, toLat, toLng, mode = 'driving') {
  // 1. TRY GOOGLE ROUTES API (Highest Success Rate)
  try {
    const googleRoutes = await getRouteFromGoogle(fromLat, fromLng, toLat, toLng, mode)
    return googleRoutes
  } catch (googleErr) {
    console.warn('[Routing] Google Routes failed:', googleErr.message)
  }

  // 2. TRY TOMTOM API
  const travelMode = TOMTOM_MODE[mode] || 'car'
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000)

    const [resultA, resultB] = await Promise.allSettled([
      fetch(buildUrl(fromLat, fromLng, toLat, toLng, travelMode, 'fastest', 1), { signal: controller.signal }).then(r => {
        if (!r.ok) throw new Error(`TomTom ${r.status}`)
        return r.json()
      }),
      fetch(buildUrl(fromLat, fromLng, toLat, toLng, travelMode, 'shortest', 0), { signal: controller.signal }).then(r => {
        if (!r.ok) throw new Error(`TomTom ${r.status}`)
        return r.json()
      }),
    ])

    clearTimeout(timeoutId)

    const routes = []
    if (resultA.status === 'fulfilled' && resultA.value.routes?.length) {
      if (resultA.value.detailedError || resultA.value.errorText) throw new Error('TomTom auth error')
      routes.push(parseRoute(resultA.value.routes[0], 0, mode))
      if (resultA.value.routes[1]) routes.push(parseRoute(resultA.value.routes[1], 2, mode))
    }
    if (resultB.status === 'fulfilled' && resultB.value.routes?.length && !resultB.value.detailedError) {
      routes.splice(1, 0, parseRoute(resultB.value.routes[0], 1, mode))
    }

    if (routes.length > 0) return routes.map((r, i) => ({ ...r, index: i }))
    throw new Error('No TomTom routes')
  } catch (tomtomErr) {
    console.warn('[Routing] TomTom failed, falling back to OSRM:', tomtomErr.message)
    // 3. FALLBACK TO MULTI-ENDPOINT OSRM
    const osrmRoutes = await getRouteFromOSRM(fromLat, fromLng, toLat, toLng, mode)
    return osrmRoutes.map((r, i) => ({ ...r, index: i }))
  }
}


// ─── Single reroute (current GPS position → destination) ──────────────────────
export async function getReroutedRoute(fromLat, fromLng, toLat, toLng, mode = 'driving') {
  const travelMode = TOMTOM_MODE[mode] || 'car'
  try {
    const url  = buildUrl(fromLat, fromLng, toLat, toLng, travelMode, 'fastest', 0)
    
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000)

    const res  = await fetch(url, { signal: controller.signal })
    clearTimeout(timeoutId)

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
  // sectionType=traffic returns one section per congested segment:
  //   startPointIndex / endPointIndex = indices into the flat geometry array
  //   simpleCategory: NO_DELAY | MINOR_DELAY | SIGNIFICANT_DELAY | MAJOR_DELAY
  //   effectiveSpeedInKmh / freeFlowSpeedInKmh = speed ratio for color picking
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

  const roadNames = []
  for (const s of steps) {
    if (s.street && !roadNames.includes(s.street)) roadNames.push(s.street)
  }
  const viaRoads = roadNames.length
    ? `via ${roadNames.slice(0, 2).join(' / ')}`
    : (index === 0 ? 'via Main Arterial' : 'via Secondary Corridor')

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
  return instructions.map(inst => ({
    instruction: (inst.message || '').replace(/<[^>]+>/g, '').trim() || maneuverText(inst.maneuver),
    distance:    inst.routeOffsetInMeters ?? 0,
    type:        inst.maneuver || 'straight',
    icon:        getStepIcon(inst.maneuver),
    laneInfo:    inst.laneInfo ? { lanes: inst.laneInfo.lanes || [], targetLane: inst.laneInfo.targetLane } : null,
    point:       inst.point ? [inst.point.latitude, inst.point.longitude] : null,
    street:      inst.street || '',
  }))
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
  const key = getTomTomKey()
  return `https://api.tomtom.com/traffic/map/4/tile/flow/${style}/{z}/{x}/{y}.png?key=${key}`
}

export function getIncidentTileUrl() {
  const key = getTomTomKey()
  return `https://api.tomtom.com/traffic/map/4/tile/incidents/s3/{z}/{x}/{y}.png?key=${key}`
}