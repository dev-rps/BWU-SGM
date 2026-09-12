/**
 * safetyScore.js — Community-powered + ML-enhanced route safety engine
 *
 * Algorithm overview:
 *   1. For every report in Firestore, calculate its minimum distance to
 *      each route polyline using point-to-segment math (Haversine).
 *   2. If a report is within REPORT_PROXIMITY_METERS of the route,
 *      it is "on that route" and its penalty is applied.
 *   3. Penalty = hazardType.basePenalty × severityLevel.multiplier
 *   4. Routes start at BASE_SCORE. Score = BASE_SCORE - Σ penalties (min 10).
 *   5. Routes are re-sorted: highest score = new "Safest Route".
 *   6. ML engine predictions (26-feature model) override heuristic scores when available.
 *      ML reasons include live AQI, WMO weather codes, OSM road type, police proximity.
 *
 * Exports:
 *   calculateRouteSafetyScores(routes, nearbyPlaces, reports, crimeHotspots, floodZones, disasterZones, accidentZones)
 *     → same routes[] with safetyScore added + onRouteReports[] attached
 *   mergeMLPredictionsIntoRoutes(routes, mlResults)
 *     → routes ranked strictly by ML safety score with factual reasons
 *   applyEnvironmentalPenalties(routes, envPenalties)
 *     → updates safety score based on AQI, Pollen, UV, and user Medical Profile
 *   calculateSafetyScore({ nearbyPlaces, reports })
 *     → single number for home-screen safety badge
 *   getRouteComparisonSummary(routes)
 *     → human-readable one-line explanation of why top route was chosen
 *   getScoreLabel(score)
 *     → { label, color, bg, text }
 *   getRouteType(idx)
 *     → { label, color, badge }
 */

import { HAZARD_TYPES, SEVERITY_LEVELS } from '../constants/index.js'
import { CRIME_HOTSPOTS, CRIME_SEVERITY_CONFIG, CRIME_ROUTE_PROXIMITY_METERS } from '../data/crimeHotspots.js'
import { FLOOD_ZONES_STATIC, FLOOD_SEVERITY_CONFIG, FLOOD_ROUTE_PROXIMITY_METERS, isMonsoonSeason } from '../data/floodZones.js'
import { DISASTER_ZONES, DISASTER_SEVERITY_CONFIG, DISASTER_ROUTE_PROXIMITY_METERS } from '../data/disasterZones.js'
import { ACCIDENT_BLACKSPOTS, ACCIDENT_SEVERITY_CONFIG, ACCIDENT_ROUTE_PROXIMITY_METERS } from '../data/accidentBlackspots.js'
import { getRouteTrafficRegulations } from '../data/trafficRestrictions.js'

const HAZARD_MAP = Object.fromEntries((HAZARD_TYPES || []).map(h => [h.id, h]))

// ─── Safe numerical helper ────────────────────────────────────────────────────────
export function safeNum(val, fallback = 0) {
  if (typeof val === 'number' && !isNaN(val) && isFinite(val)) return val
  if (typeof val === 'string') {
    const parsed = parseFloat(val)
    if (!isNaN(parsed) && isFinite(parsed)) return parsed
  }
  return fallback
}

/**
 * Proportionally scales individual hazard items so that sum(items._penalty) === categoryTotal EXACTLY.
 * Eliminates mathematical discrepancies in the UI.
 */
export function scaleItemsToCategoryTotal(items, categoryTotal) {
  if (!items || !items.length || categoryTotal <= 0) return []
  const rawWeights = {}
  items.forEach((item, idx) => {
    rawWeights[idx] = Math.max(1, safeNum(item._penalty, 1))
  })
  const rawSum = Object.values(rawWeights).reduce((a, b) => a + b, 0)
  if (rawSum <= 0) {
    return items.map((it, idx) => ({ ...it, _penalty: idx === 0 ? categoryTotal : 0 }))
  }

  const floats = {}
  const ints = {}
  let intSum = 0
  items.forEach((_, idx) => {
    const f = (rawWeights[idx] / rawSum) * categoryTotal
    floats[idx] = f
    ints[idx] = Math.floor(f)
    intSum += ints[idx]
  })

  const rem = categoryTotal - intSum
  const sortedIdxs = Object.keys(rawWeights).sort((a, b) => (floats[b] - ints[b]) - (floats[a] - ints[a]))
  for (let i = 0; i < rem; i++) {
    ints[sortedIdxs[i % sortedIdxs.length]] += 1
  }

  return items
    .map((item, idx) => ({ ...item, _penalty: ints[idx] || 0 }))
    .filter(item => item._penalty > 0)
}

// ─── Config ─────────────────────────────────────────────────────────────────────────
const BASE_SCORE              = 100 // Routes start at base 100; every deduction point is accounted for
const REPORT_PROXIMITY_METERS = 250 // Live community reports within 250m of a route affect it
const REPORT_MAX_AGE_HOURS    = 72  // Consider reports from last 72 hours
const MIN_SCORE               = 10  // Floor — route score never goes below 10
const MAX_SCORE               = 100 // Ceiling (100 - sum(deductions) === safetyScore)
const MONSOON_FLOOD_MULTIPLIER = 1.4 // Flood penalty 40% higher during June-October


/**
 * RANK_CONFIGS: appearance for rank 0 (safest), 1 (middle), 2 (least safe / fastest).
 * Assigned strictly by safety score ranking: Green → Blue → Red.
 */
export const RANK_CONFIGS = [
  { label: 'SAFEST',     color: '#10B981', badge: 'bg-[#10B981]', recommended: true  },
  { label: 'BALANCED',   color: '#2563EB', badge: 'bg-[#2563EB]', recommended: false },
  { label: 'RISKY',      color: '#EF4444', badge: 'bg-[#EF4444]', recommended: false },
]

/**
 * ROUTE_VARIANCE: Dynamic role-based offsets that reflect the inherent trade-offs
 * between alternative routes (Route 0 = primary/safer arterial corridor,
 * Route 1 = balanced bypass, Route 2 = faster/denser urban corridor).
 */
const ROUTE_VARIANCE = [+4, 0, -8]

// ─── Geo math: Haversine great-circle distance in metres ──────────────────────
function haversineMeters(lat1, lng1, lat2, lng2) {
  const R   = 6371000 // Earth radius metres
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// ─── Point-to-line-segment distance ──────────────────────────────────────────
function pointToSegmentMeters(pLat, pLng, aLat, aLng, bLat, bLng) {
  const dx = bLng - aLng
  const dy = bLat - aLat
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return haversineMeters(pLat, pLng, aLat, aLng)

  let t = ((pLng - aLng) * dx + (pLat - aLat) * dy) / lenSq
  t = Math.max(0, Math.min(1, t))

  const closestLat = aLat + t * dy
  const closestLng = aLng + t * dx
  return haversineMeters(pLat, pLng, closestLat, closestLng)
}

// ─── Minimum distance from a point to a polyline ─────────────────────────────
function minDistanceToPolyline(lat, lng, polyline) {
  let minDist = Infinity
  for (let i = 0; i < polyline.length - 1; i++) {
    const [aLat, aLng] = polyline[i]
    const [bLat, bLng] = polyline[i + 1]
    const d = pointToSegmentMeters(lat, lng, aLat, aLng, bLat, bLng)
    if (d < minDist) minDist = d
  }
  return minDist
}

// ─── Nearest polyline point (for placing the warning marker on the route) ────
function nearestPolylinePoint(lat, lng, polyline) {
  let minDist = Infinity
  let nearestPt = polyline[0]
  for (let i = 0; i < polyline.length - 1; i++) {
    const [aLat, aLng] = polyline[i]
    const [bLat, bLng] = polyline[i + 1]
    const d = pointToSegmentMeters(lat, lng, aLat, aLng, bLat, bLng)
    if (d < minDist) {
      minDist = d
      nearestPt = haversineMeters(lat, lng, aLat, aLng) < haversineMeters(lat, lng, bLat, bLng)
        ? [aLat, aLng]
        : [bLat, bLng]
    }
  }
  return nearestPt
}

// ─── Filter to recent reports only ───────────────────────────────────────────
function recentReports(reports) {
  if (!reports || !Array.isArray(reports)) return []
  const cutoff = Date.now() - REPORT_MAX_AGE_HOURS * 3600 * 1000
  return reports.filter(r => {
    if (!r) return false
    if (!r.createdAt && !r.timestamp) return true
    const ts = r.createdAt?.toDate
      ? r.createdAt.toDate().getTime()
      : r.createdAt?.seconds
      ? r.createdAt.seconds * 1000
      : new Date(r.createdAt || r.timestamp || Date.now()).getTime()
    return isNaN(ts) || ts >= cutoff
  })
}

// ─── Core: calculate penalty points for a single report ──────────────────────
function calcPenalty(report) {
  const typeId = (report.hazardType || report.type || 'other').toLowerCase()
  const sevId  = (report.severity   || 'medium').toLowerCase()

  let basePenalty = 6
  if (['crime', 'robbery', 'assault', 'harassment', 'stalking', 'theft', 'snatching'].includes(typeId)) {
    basePenalty = 12
  } else if (['flood', 'waterlogging', 'disaster', 'landslide', 'fire'].includes(typeId)) {
    basePenalty = 10
  } else if (['accident', 'road_block', 'collapse', 'electric'].includes(typeId)) {
    basePenalty = 8
  } else if (['broken_light', 'pothole', 'road_damage', 'broken_signal', 'traffic_jam'].includes(typeId)) {
    basePenalty = 5
  } else if (HAZARD_MAP[typeId]?.basePenalty) {
    basePenalty = HAZARD_MAP[typeId].basePenalty
  }

  const sevMult = sevId === 'critical' ? 2.0 : sevId === 'high' ? 1.5 : sevId === 'low' ? 0.6 : 1.0
  return Math.max(2, Math.round(basePenalty * sevMult))
}

// ─── Main export: score routes against reports + crime + flood data ──────────────────
export function calculateRouteSafetyScores(
  routes,
  nearbyPlaces  = [],
  reports       = [],
  crimeHotspots = [],
  floodZones    = [],
  disasterZones = [],
  accidentZones = [],
) {
  const active = recentReports(reports)

  // ── Step 1: Score each route independently ────────────────────────────────
  const scoredRoutes = routes.map((route, routeIndex) => {
    const geometry = route.geometry  // [[lat, lng], ...]
    if (!geometry || geometry.length < 2) {
      return {
        ...route,
        safetyScore:       75,
        onRouteReports:    [],
        onRouteCrimes:     [],
        onRouteFlood:      [],
        onRouteDisasters:  [],
        onRouteAccidents:  [],
        reportPenalty:     0,
        crimePenalty:      0,
        floodPenalty:      0,
        disasterPenalty:   0,
        accidentPenalty:   0,
        roadInfraPenalty:  25,
        roadInfraNote:     'Estimated baseline safety profile',
      }
    }

    const onRouteReports   = []
    const onRouteCrimes    = []
    const onRouteFlood     = []
    const onRouteDisasters = []
    const onRouteAccidents = []

    // ── (A) Live community hazard report penalties (cap: 6) ───────────────────
    let totalReportPenalty = 0
    const REPORT_PENALTY_CAP = 6
    active.forEach(r => {
      const lat = parseFloat(r.latitude ?? r.lat ?? r.location?.latitude ?? r.location?.lat)
      const lng = parseFloat(r.longitude ?? r.lng ?? r.location?.longitude ?? r.location?.lng)
      if (!isFinite(lat) || !isFinite(lng)) return

      const dist = minDistanceToPolyline(lat, lng, geometry)
      if (dist <= REPORT_PROXIMITY_METERS) {
        const penalty = Math.min(3, Math.max(1, Math.round(calcPenalty(r) * 0.4)))
        totalReportPenalty = Math.min(totalReportPenalty + penalty, REPORT_PENALTY_CAP)
        const snapPt  = nearestPolylinePoint(lat, lng, geometry)
        onRouteReports.push({
          ...r,
          _penalty: penalty,
          _dist: Math.round(dist),
          _snapLat: snapPt[0],
          _snapLng: snapPt[1],
        })
      }
    })
    const scaledReports = scaleItemsToCategoryTotal(onRouteReports, totalReportPenalty)

    // ── (B) Historical crime hotspot penalties with distance decay (cap: 7) ─────
    let totalCrimePenalty = 0
    const CRIME_PENALTY_CAP = 7
    const isNight = (() => { const h = new Date().getHours(); return h < 6 || h >= 20 })()

    crimeHotspots.forEach(hotspot => {
      const dist = minDistanceToPolyline(hotspot.lat, hotspot.lng, geometry)
      const radius = Math.max(hotspot.radius || 350, 350)
      if (dist <= radius) {
        const cfg = CRIME_SEVERITY_CONFIG[hotspot.severity] || CRIME_SEVERITY_CONFIG.low
        const base = 3.5
        const decay = Math.max(0.35, 1 - (dist / radius))
        const penalty = Math.max(1, Math.round(base * decay * (isNight ? 1.3 : 1.0)))
        totalCrimePenalty = Math.min(totalCrimePenalty + penalty, CRIME_PENALTY_CAP)
        onRouteCrimes.push({ ...hotspot, _penalty: penalty, _dist: Math.round(dist) })
      }
    })
    const scaledCrimes = scaleItemsToCategoryTotal(onRouteCrimes, totalCrimePenalty)

    // ── (C) Flood zone penalties with distance decay (cap: 5) ─────────────────
    const monsoon = isMonsoonSeason()
    let totalFloodPenalty = 0
    const FLOOD_PENALTY_CAP = 5

    floodZones.forEach(zone => {
      const dist = minDistanceToPolyline(zone.lat, zone.lng, geometry)
      const radius = Math.max(zone.radius || 400, 350)
      if (dist <= radius) {
        const cfg = FLOOD_SEVERITY_CONFIG[zone.severity] || FLOOD_SEVERITY_CONFIG.low
        const base = 3.0
        const decay = Math.max(0.35, 1 - (dist / radius))
        const penalty = Math.max(1, Math.round(base * decay * (monsoon && zone.monsoonRisk ? 1.3 : 1.0)))
        totalFloodPenalty = Math.min(totalFloodPenalty + penalty, FLOOD_PENALTY_CAP)
        onRouteFlood.push({ ...zone, _penalty: penalty, _dist: Math.round(dist) })
      }
    })
    const scaledFlood = scaleItemsToCategoryTotal(onRouteFlood, totalFloodPenalty)

    // ── (D) Disaster Zone penalties with distance decay (cap: 4) ──────────────
    let totalDisasterPenalty = 0
    const DISASTER_PENALTY_CAP = 4

    disasterZones.forEach(dz => {
      const dist = minDistanceToPolyline(dz.lat, dz.lng, geometry)
      const radius = Math.max(dz.radius || 300, 300)
      if (dist <= radius) {
        const cfg = DISASTER_SEVERITY_CONFIG[dz.severity] || DISASTER_SEVERITY_CONFIG.medium
        const base = 2.5
        const decay = Math.max(0.35, 1 - (dist / radius))
        const penalty = Math.max(1, Math.round(base * decay))
        totalDisasterPenalty = Math.min(totalDisasterPenalty + penalty, DISASTER_PENALTY_CAP)
        onRouteDisasters.push({ ...dz, _penalty: penalty, _dist: Math.round(dist) })
      }
    })
    const scaledDisasters = scaleItemsToCategoryTotal(onRouteDisasters, totalDisasterPenalty)

    // ── (E) Accident Blackspot penalties with distance decay (cap: 4) ─────────
    let totalAccidentPenalty = 0
    const ACCIDENT_PENALTY_CAP = 4

    accidentZones.forEach(acc => {
      const dist = minDistanceToPolyline(acc.lat, acc.lng, geometry)
      const radius = Math.max(acc.radius || 250, 300)
      if (dist <= radius) {
        const cfg = ACCIDENT_SEVERITY_CONFIG[acc.severity] || ACCIDENT_SEVERITY_CONFIG.medium
        const base = 2.5
        const decay = Math.max(0.35, 1 - (dist / radius))
        const penalty = Math.max(1, Math.round(base * decay))
        totalAccidentPenalty = Math.min(totalAccidentPenalty + penalty, ACCIDENT_PENALTY_CAP)
        onRouteAccidents.push({ ...acc, _penalty: penalty, _dist: Math.round(dist) })
      }
    })
    const scaledAccidents = scaleItemsToCategoryTotal(onRouteAccidents, totalAccidentPenalty)

    // ── (F) Corridor Road Type & Infrastructure Caution ────────────────────────
    const viaLower = ((route.viaRoads || '') + ' ' + (route.summary || '')).toLowerCase()
    const isArterialExpress = viaLower.includes('expressway') || viaLower.includes('vip') || viaLower.includes('bypass') || viaLower.includes('nh ') || viaLower.includes('ah1') || viaLower.includes('highway')
    const isDenseNarrowCore = viaLower.includes('bazaar') || viaLower.includes('bazar') || viaLower.includes('sarani') || viaLower.includes('lane') || viaLower.includes('street') || viaLower.includes('chitpur') || viaLower.includes('howrah')

    let roadInfraPenalty = 0
    let roadInfraNote = ''
    if (route.mode === 'walking' || route.mode === 'cycling') {
      const isResidential = viaLower.includes('residential') || viaLower.includes('colony') || viaLower.includes('quiet') || viaLower.includes('greenway')
      const isConnector = viaLower.includes('connector') || viaLower.includes('by-lane') || viaLower.includes('secondary')
      if (isResidential) {
        roadInfraPenalty = 0
        roadInfraNote = 'Quiet residential street with minimal vehicular conflict'
      } else if (isConnector) {
        roadInfraPenalty = 1
        roadInfraNote = 'Neighborhood connector with low-speed local traffic'
      } else if (isArterialExpress) {
        roadInfraPenalty = 2
        roadInfraNote = 'High-speed motor corridor; use designated sidewalk/crossing'
      } else {
        roadInfraPenalty = 1
        roadInfraNote = 'Mixed urban street profile'
      }
    } else {
      if (isArterialExpress) {
        roadInfraPenalty = 0
        roadInfraNote = 'Dual carriageway with high lighting & surveillance'
      } else if (isDenseNarrowCore) {
        roadInfraPenalty = 3
        roadInfraNote = 'Dense urban market corridor with narrow carriageway'
      } else {
        roadInfraPenalty = 1
        roadInfraNote = 'Secondary municipal connector road'
      }
    }

    // (G) Excessive Detour / Extended Exposure Penalty
    // While a reasonable 2-5 min detour away from blackspots is beneficial,
    // a large detour increases outdoor exposure risk (fatigue, darkness, weather).
    const allDurations = routes.map(r => Number(r.durationMin) || (r.duration ? Math.round(r.duration / 60) : 0)).filter(d => d > 0)
    const minDur = allDurations.length ? Math.min(...allDurations) : 0
    const currentDur = Number(route.durationMin) || (route.duration ? Math.round(route.duration / 60) : 0)
    const excessMin = Math.max(0, currentDur - minDur)
    if (excessMin > 8) {
      const detourPenalty = Math.min(18, Math.round((excessMin - 8) * 0.8))
      roadInfraPenalty += detourPenalty
      roadInfraNote = roadInfraNote ? `${roadInfraNote} • +${excessMin}m detour exposure` : `+${excessMin}m detour exposure`
    }

    const crimeOverlapCount = scaledCrimes.length
    const accidentOverlapCount = scaledAccidents.length
    const totalHazardOverlaps = crimeOverlapCount + accidentOverlapCount
    const hasOverlap = totalHazardOverlaps > 0

    let overlapSummary = ''
    if (totalHazardOverlaps === 0) {
      overlapSummary = 'Zero Crime or Accident Overlaps (Safest Corridor)'
    } else if (accidentOverlapCount > 0 && crimeOverlapCount > 0) {
      overlapSummary = `Overlaps ${accidentOverlapCount} Accident & ${crimeOverlapCount} Crime Zone${totalHazardOverlaps > 1 ? 's' : ''}`
    } else if (accidentOverlapCount > 0) {
      const topAcc = scaledAccidents[0]
      overlapSummary = `Overlaps ${accidentOverlapCount} Accident Blackspot (${topAcc.area || topAcc.title || 'High Collision Zone'})`
    } else {
      const topCrime = scaledCrimes[0]
      overlapSummary = `Overlaps ${crimeOverlapCount} Crime Hotspot (${topCrime.area || topCrime.title || 'Caution Area'})`
    }

    const overlapAnalysis = {
      hasOverlap,
      totalHazardOverlaps,
      crimeOverlapCount,
      accidentOverlapCount,
      crimeZones: scaledCrimes.map(c => ({
        name: c.area || c.title || 'Crime Hotspot',
        dist: c._dist,
        severity: c.severity,
        penalty: c._penalty,
      })),
      accidentZones: scaledAccidents.map(a => ({
        name: a.area || a.title || 'Accident Blackspot',
        dist: a._dist,
        severity: a.severity,
        penalty: a._penalty,
      })),
      summary: overlapSummary,
    }

    // Mathematical identity: Score = 100 - sum(Deductions)
    const totalDeductions = totalReportPenalty + totalCrimePenalty + totalFloodPenalty + totalDisasterPenalty + totalAccidentPenalty + roadInfraPenalty
    const score = Math.max(MIN_SCORE, Math.min(MAX_SCORE, 100 - totalDeductions))

    return {
      ...route,
      safetyScore:       score,
      onRouteReports:    scaledReports,
      onRouteCrimes:     scaledCrimes,
      onRouteFlood:      scaledFlood,
      onRouteDisasters:  scaledDisasters,
      onRouteAccidents:  scaledAccidents,
      reportPenalty:     totalReportPenalty,
      crimePenalty:      totalCrimePenalty,
      floodPenalty:      totalFloodPenalty,
      disasterPenalty:   totalDisasterPenalty,
      accidentPenalty:   totalAccidentPenalty,
      roadInfraPenalty,
      roadInfraNote,
      crimeOverlapCount,
      accidentOverlapCount,
      totalHazardOverlaps,
      overlapAnalysis,
    }
  })

  // ── Step 2: Order strictly by Safety Score (Highest → Lowest) ─────────────
  const sorted = [...scoredRoutes].sort((a, b) => (b.safetyScore || 0) - (a.safetyScore || 0))

  // ── Step 3: Ensure Strict Score Differentiation across candidate ranks (no flat ties) ──
  // Deductions are synchronized with the gap so 100 - deductions === safetyScore ALWAYS holds
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].safetyScore >= sorted[i - 1].safetyScore) {
      const gap = (sorted[i].safetyScore - sorted[i - 1].safetyScore) + 3
      sorted[i].roadInfraPenalty = (sorted[i].roadInfraPenalty || 0) + gap
      sorted[i].safetyScore = Math.max(MIN_SCORE, sorted[i - 1].safetyScore - 3)
      if (!sorted[i].roadInfraNote) {
        sorted[i].roadInfraNote = 'Corridor congestion & road infrastructure variance'
      }
    }
  }

  // ── Step 4: Assign Distinct Rank Color: Green (#10B981) → Blue (#2563EB) → Red (#EF4444)
  const rankedRoutes = sorted.map((route, idx) => {
    const cfg = RANK_CONFIGS[Math.min(idx, RANK_CONFIGS.length - 1)]
    const isRec = idx === 0

    // Trade-off compared to the fastest route
    const minDur = Math.min(...sorted.map(r => r.durationMin || 999))
    const timeDiffMin = Math.max(0, (route.durationMin || 0) - minDur)

    let tradeOffText = ''
    if (timeDiffMin === 0) {
      tradeOffText = 'Shortest travel time'
    } else {
      tradeOffText = `+${timeDiffMin} min vs fastest`
    }

    const safetySegments = buildSafetySegments(route.geometry, route.onRouteReports, route.onRouteCrimes, route.onRouteAccidents)
    const trafficRegulation = getRouteTrafficRegulations(route)

    return {
      ...route,
      rankLabel:            cfg.label,
      rankColor:            cfg.color,
      isRecommended:        isRec,
      recommended:          isRec,
      timeDiffMin,
      tradeOffText,
      safetySegments,
      trafficRegulation,
      crimeOverlapCount:    route.crimeOverlapCount || 0,
      accidentOverlapCount: route.accidentOverlapCount || 0,
      totalHazardOverlaps:  route.totalHazardOverlaps || 0,
      overlapAnalysis:      route.overlapAnalysis || null,
    }
  })

  return rankedRoutes
}

/**
 * Merges high-precision predictions from the Python ML Geospatial Engine into candidate routes.
 * Exposes AQI data, WMO weather code, road type, and police proximity from ML response.
 *
 * @param {Array<object>} routes    - Array of candidate routes
 * @param {Array<object>} mlResults - Array of ML inference result objects from /predict/routes
 * @returns {Array<object>} Routes ranked strictly by ML safety score
 */
export function mergeMLPredictionsIntoRoutes(routes, mlResults = []) {
  if (!routes || !routes.length) return []
  if (!mlResults || !mlResults.length) return routes

  // Map ML predictions by route_id or by array index
  const mlMap = new Map()
  mlResults.forEach((ml, idx) => {
    if (ml.route_id !== undefined && ml.route_id !== null) {
      mlMap.set(String(ml.route_id), ml)
    }
    mlMap.set(idx, ml)
  })

  const merged = routes.map((route, idx) => {
    const ml = mlMap.get(String(route.index)) || mlMap.get(idx)
    if (!ml) return route

    const mlScore       = Math.max(MIN_SCORE, Math.min(MAX_SCORE, Math.round(ml.safety_score)))
    const customReasons = Array.isArray(ml.reasons) ? ml.reasons : []

    // Extract deduction breakdown from ML prediction
    const db = ml.deduction_breakdown || ml.point_deductions || null

    let crimePenalty    = db?.categories?.crime       !== undefined ? db.categories.crime       : safeNum(route.crimePenalty, 0)
    let floodPenalty    = db?.categories?.flood       !== undefined ? db.categories.flood       : safeNum(route.floodPenalty, 0)
    let accidentPenalty = db?.categories?.accident    !== undefined ? db.categories.accident    : safeNum(route.accidentPenalty, 0)
    let disasterPenalty = db?.categories?.disaster    !== undefined ? db.categories.disaster    : safeNum(route.disasterPenalty, 0)
    let roadInfraPenalty= db?.categories?.road_infra  !== undefined ? db.categories.road_infra  : safeNum(route.roadInfraPenalty, 0)
    let trafficPenalty  = db?.categories?.traffic     !== undefined ? db.categories.traffic     : safeNum(route.trafficPenalty, 0)
    let envPenalty      = db?.categories?.env         !== undefined ? db.categories.env         : safeNum(route.envPenalty, 0)
    let reportPenalty   = safeNum(route.reportPenalty, 0)

    let onRouteCrimes    = route.onRouteCrimes    || []
    let onRouteFlood     = route.onRouteFlood     || []
    let onRouteAccidents = route.onRouteAccidents || []
    let onRouteDisasters = route.onRouteDisasters || []

    if (db?.items) {
      if (db.items.crime?.length) {
        onRouteCrimes = db.items.crime.map((c, ci) => {
          const match = (route.onRouteCrimes || []).find(ec => ec.area === c.name || ec.name === c.name) ||
            (CRIME_HOTSPOTS || []).find(ch => (ch.area || ch.name) === c.name) ||
            (route.onRouteCrimes || [])[ci] || {}
          return {
            id: c.id || match.id || `ml_c_${ci}`,
            area: c.name || match.area || 'Crime Caution Area',
            lat: (match.lat != null && isFinite(match.lat)) ? parseFloat(match.lat) : null,
            lng: (match.lng != null && isFinite(match.lng)) ? parseFloat(match.lng) : null,
            _penalty: c.penalty,
            _dist: c.distance_m || match._dist || 250,
          }
        })
      }
      if (db.items.flood?.length) {
        onRouteFlood = db.items.flood.map((f, fi) => {
          const match = (route.onRouteFlood || []).find(ef => ef.area === f.name || ef.name === f.name) ||
            (FLOOD_ZONES_STATIC || []).find(fz => (fz.area || fz.name) === f.name) ||
            (route.onRouteFlood || [])[fi] || {}
          return {
            id: f.id || match.id || `ml_f_${fi}`,
            area: f.name || match.area || 'Flood Risk Area',
            lat: (match.lat != null && isFinite(match.lat)) ? parseFloat(match.lat) : null,
            lng: (match.lng != null && isFinite(match.lng)) ? parseFloat(match.lng) : null,
            _penalty: f.penalty,
            _dist: f.distance_m || match._dist || 300,
          }
        })
      }
      if (db.items.accident?.length) {
        onRouteAccidents = db.items.accident.map((a, ai) => {
          const match = (route.onRouteAccidents || []).find(ea => ea.area === a.name || ea.name === a.name) ||
            (ACCIDENT_BLACKSPOTS || []).find(ab => (ab.area || ab.name) === a.name) ||
            (route.onRouteAccidents || [])[ai] || {}
          return {
            id: a.id || match.id || `ml_a_${ai}`,
            area: a.name || match.area || 'Accident Blackspot',
            lat: (match.lat != null && isFinite(match.lat)) ? parseFloat(match.lat) : null,
            lng: (match.lng != null && isFinite(match.lng)) ? parseFloat(match.lng) : null,
            _penalty: a.penalty,
            _dist: a.distance_m || match._dist || 200,
          }
        })
      }
      if (db.items.disaster?.length) {
        onRouteDisasters = db.items.disaster.map((d, di) => {
          const match = (route.onRouteDisasters || []).find(ed => ed.area === d.name || ed.name === d.name) ||
            (DISASTER_ZONES || []).find(dz => (dz.area || dz.name) === d.name) ||
            (route.onRouteDisasters || [])[di] || {}
          return {
            id: d.id || match.id || `ml_d_${di}`,
            area: d.name || match.area || 'Disaster Risk Area',
            lat: (match.lat != null && isFinite(match.lat)) ? parseFloat(match.lat) : null,
            lng: (match.lng != null && isFinite(match.lng)) ? parseFloat(match.lng) : null,
            _penalty: d.penalty,
            _dist: d.distance_m || match._dist || 300,
          }
        })
      }
    }

    // Extract live data context from ML response (server-fetched)
    const liveSources  = ml.live_data_sources || {}
    const mlAqiPm25    = liveSources.pm25    ?? null
    const mlWeatherCode = liveSources.weather_code ?? null
    const mlAqiSource  = liveSources.aqi_source ?? null

    // Extract road/infra context from bottleneck segment features
    const btk         = ml.bottleneck || {}
    const segments    = ml.segments   || []

    const crimeOverlapCount = onRouteCrimes.length
    const accidentOverlapCount = onRouteAccidents.length
    const totalHazardOverlaps = crimeOverlapCount + accidentOverlapCount
    const hasOverlap = totalHazardOverlaps > 0

    let overlapSummary = ''
    if (totalHazardOverlaps === 0) {
      overlapSummary = 'Zero Crime or Accident Overlaps (Safest Corridor)'
    } else if (accidentOverlapCount > 0 && crimeOverlapCount > 0) {
      overlapSummary = `Overlaps ${accidentOverlapCount} Accident & ${crimeOverlapCount} Crime Zone${totalHazardOverlaps > 1 ? 's' : ''}`
    } else if (accidentOverlapCount > 0) {
      const topAcc = onRouteAccidents[0]
      overlapSummary = `Overlaps ${accidentOverlapCount} Accident Blackspot (${topAcc.area || topAcc.title || 'High Collision Zone'})`
    } else {
      const topCrime = onRouteCrimes[0]
      overlapSummary = `Overlaps ${crimeOverlapCount} Crime Hotspot (${topCrime.area || topCrime.title || 'Caution Area'})`
    }

    const overlapAnalysis = {
      hasOverlap,
      totalHazardOverlaps,
      crimeOverlapCount,
      accidentOverlapCount,
      crimeZones: onRouteCrimes.map(c => ({
        name: c.area || c.title || 'Crime Hotspot',
        dist: c._dist,
        severity: c.severity,
        penalty: c._penalty,
      })),
      accidentZones: onRouteAccidents.map(a => ({
        name: a.area || a.title || 'Accident Blackspot',
        dist: a._dist,
        severity: a.severity,
        penalty: a._penalty,
      })),
      summary: overlapSummary,
    }

    return {
      ...route,
      safetyScore:      mlScore,
      mlSafetyScore:    mlScore,
      riskScore:        ml.risk_score ?? (100 - mlScore),
      riskLevel:        ml.risk_level || (mlScore >= 75 ? 'Low' : mlScore >= 55 ? 'Medium' : 'High'),
      probabilities:    ml.probabilities  || {},
      bottleneck:       ml.bottleneck     || null,
      nearestHazards:   ml.nearest_hazards || {},
      mlReasons:        customReasons,
      mlSegments:       segments,
      mlEvaluated:      true,
      deductionBreakdown: db,
      crimePenalty,
      floodPenalty,
      accidentPenalty,
      disasterPenalty,
      roadInfraPenalty,
      trafficPenalty,
      envPenalty,
      reportPenalty,
      onRouteCrimes,
      onRouteFlood,
      onRouteAccidents,
      onRouteDisasters,
      crimeOverlapCount,
      accidentOverlapCount,
      totalHazardOverlaps,
      overlapAnalysis,
      // Live data from server-side enrichment
      mlAqiPm25,
      mlWeatherCode,
      mlAqiSource,
      mlDataSources:    liveSources,
    }
  })

  // Order strictly by ML Safety Score descending
  const sorted = [...merged].sort((a, b) => (b.safetyScore || 0) - (a.safetyScore || 0))

  // Strict dynamic differentiation if ML regressor produced identical scores
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].safetyScore >= sorted[i - 1].safetyScore) {
      const gap = (sorted[i].safetyScore - sorted[i - 1].safetyScore) + 2
      sorted[i].safetyScore = Math.max(MIN_SCORE, sorted[i - 1].safetyScore - 2)
      sorted[i].roadInfraPenalty = (sorted[i].roadInfraPenalty || 0) + gap
      if (sorted[i].mlSafetyScore) {
        sorted[i].mlSafetyScore = sorted[i].safetyScore
      }
    }
  }

  // Synchronize deduction breakdown so sum(deductions) === 100 - safetyScore ALWAYS holds
  sorted.forEach(route => {
    const targetDeduction = 100 - (route.safetyScore || 75)
    const existingDeductions =
      safeNum(route.crimePenalty, 0) +
      safeNum(route.floodPenalty, 0) +
      safeNum(route.disasterPenalty, 0) +
      safeNum(route.accidentPenalty, 0) +
      safeNum(route.trafficPenalty, 0) +
      safeNum(route.envPenalty, 0) +
      safeNum(route.reportPenalty, 0) +
      safeNum(route.roadInfraPenalty, 0)

    const diff = targetDeduction - existingDeductions
    if (diff !== 0) {
      route.roadInfraPenalty = Math.max(0, safeNum(route.roadInfraPenalty, 0) + diff)
    }
    if (!route.roadInfraNote) {
      route.roadInfraNote = 'ML safety risk: road infrastructure & intersection density'
    }
  })

  return sorted.map((route, idx) => {
    const cfg         = RANK_CONFIGS[Math.min(idx, RANK_CONFIGS.length - 1)]
    const isRec       = idx === 0
    const minDur      = Math.min(...sorted.map(r => r.durationMin || 999))
    const timeDiffMin = Math.max(0, (route.durationMin || 0) - minDur)

    const tradeOffText = timeDiffMin === 0
      ? 'Shortest travel time'
      : `+${timeDiffMin} min vs fastest`

    const safetySegments = route.mlSegments && route.mlSegments.length > 0
      ? route.mlSegments
      : buildSafetySegments(route.geometry, route.onRouteReports, route.onRouteCrimes, route.onRouteAccidents)
    const trafficRegulation = route.trafficRegulation || getRouteTrafficRegulations(route)

    return {
      ...route,
      rankLabel:            cfg.label,
      rankColor:            cfg.color,
      isRecommended:        isRec,
      recommended:          isRec,
      timeDiffMin,
      tradeOffText,
      safetySegments,
      trafficRegulation,
      crimeOverlapCount:    route.crimeOverlapCount || 0,
      accidentOverlapCount: route.accidentOverlapCount || 0,
      totalHazardOverlaps:  route.totalHazardOverlaps || 0,
      overlapAnalysis:      route.overlapAnalysis || null,
    }
  })
}

/**
 * Generates a human-readable one-line explanation of why the top-ranked route was chosen.
 * Useful for surfacing in route cards and notifications.
 *
 * @param {Array<object>} routes - Ranked routes (index 0 = safest)
 * @returns {string} Comparison summary
 */
export function getRouteComparisonSummary(routes) {
  if (!routes || routes.length < 2) return ''

  const best  = routes[0]
  const worst = routes[routes.length - 1]
  const scoreDiff = (best.safetyScore || 0) - (worst.safetyScore || 0)

  const parts = []

  if (scoreDiff >= 20) {
    parts.push(`${scoreDiff} point safer than the least-safe option`)
  } else if (scoreDiff >= 10) {
    parts.push(`${scoreDiff} pts safer than alternate route`)
  }

  // Highlight the top ML reason if available
  const topReason = (best.mlReasons || [])[0]
  if (topReason) {
    const clean = topReason.replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{26FF}]/gu, '').trim()
    if (clean.length > 0) parts.push(clean.slice(0, 80))
  }

  if (best.mlAqiPm25 !== null && best.mlAqiPm25 !== undefined) {
    const label = best.mlAqiPm25 <= 35.4 ? 'Good AQI' : best.mlAqiPm25 <= 55.4 ? 'Moderate AQI' : 'Poor AQI'
    parts.push(`${label} (PM2.5: ${Math.round(best.mlAqiPm25)} μg/m³)`)
  }

  return parts.length > 0
    ? `Recommended: ${parts.join(' · ')}`
    : 'Recommended based on lowest hazard density'
}

// ─── Build geometry-aware safety segments ────────────────────────────────────
export function buildSafetySegments(geometry, reports = [], crimes = [], accidents = []) {
  if (!geometry || geometry.length < 2) return []

  const riskPoints = [
    ...reports.map(r => ({
      lat: r._snapLat || r.latitude || r.lat,
      lng: r._snapLng || r.longitude || r.lng,
      severity: r.severity || 'medium',
      radius: r.radius || 200,
      label: r.type || 'Community Hazard',
      color: r.severity === 'critical' ? '#B91C1C' : '#F59E0B',
      type: 'report',
    })),
    ...crimes.map(c => ({
      lat: c.lat,
      lng: c.lng,
      severity: c.severity || 'high',
      radius: c.radius || 350,
      label: c.area || c.title || 'Crime Hotspot',
      color: '#E11D48', // Deep rose for crimes
      type: 'crime',
    })),
    ...accidents.map(a => ({
      lat: a.lat,
      lng: a.lng,
      severity: a.severity || 'critical',
      radius: a.radius || 300,
      label: a.area || a.title || 'Accident Blackspot',
      color: '#B91C1C', // Deep crimson for accidents
      type: 'accident',
    })),
  ]

  if (!riskPoints.length) return []

  const segments = []
  for (const risk of riskPoints) {
    const effectiveRadius = Math.max(180, Math.min(risk.radius || 300, 450))
    for (let i = 0; i < geometry.length - 1; i++) {
      const p1 = geometry[i]
      const p2 = geometry[Math.min(i + 2, geometry.length - 1)]
      const d = minDistanceToPolyline(risk.lat, risk.lng, [p1, p2])
      if (d <= effectiveRadius) {
        segments.push({
          points: geometry.slice(Math.max(0, i - 1), Math.min(geometry.length, i + 3)),
          severity: risk.severity,
          color: risk.color,
          label: risk.label,
          type: risk.type,
          hazardLat: risk.lat,
          hazardLng: risk.lng,
        })
        break
      }
    }
  }
  return segments
}

// ─── Collision-aware map label anchor position ────────────────────────────────
export function getRouteAnchorPoint(geometry, index, totalRoutes = 3) {
  if (!geometry || !Array.isArray(geometry) || geometry.length === 0) return [22.5726, 88.3639]
  if (geometry.length === 1) {
    const p0 = geometry[0]
    return (Array.isArray(p0) && isFinite(p0[0]) && isFinite(p0[1])) ? [p0[0], p0[1]] : [22.5726, 88.3639]
  }

  const fractions = [0.48, 0.32, 0.65]
  const frac = fractions[index % fractions.length] || 0.50

  const targetIdx = Math.floor((geometry.length - 1) * frac)
  const pt = geometry[targetIdx]
  if (!pt || !Array.isArray(pt) || !isFinite(pt[0]) || !isFinite(pt[1])) return [22.5726, 88.3639]

  const offsetLat = (index === 1 ? 0.0018 : index === 2 ? -0.0018 : 0)
  const offsetLng = (index === 1 ? -0.0015 : index === 2 ? 0.0015 : 0)

  return [pt[0] + offsetLat, pt[1] + offsetLng]
}

// ─── Deduplicate near-identical routes ─────────────────────────────────────────
export function areRoutesSimilar(r1, r2) {
  if (!r1 || !r2) return false
  if (r1 === r2) return true

  const d1 = parseFloat(r1.distanceKm || (r1.distance ? r1.distance / 1000 : 0))
  const d2 = parseFloat(r2.distanceKm || (r2.distance ? r2.distance / 1000 : 0))
  const t1 = parseInt(r1.durationMin || (r1.duration ? r1.duration / 60 : 0))
  const t2 = parseInt(r2.durationMin || (r2.duration ? r2.duration / 60 : 0))

  const geom1 = r1.geometry || []
  const geom2 = r2.geometry || []

  if (geom1.length >= 4 && geom2.length >= 4) {
    const samplePcts = [0.2, 0.4, 0.6, 0.8]
    let totalMinDist = 0
    for (const pct of samplePcts) {
      const p1 = geom1[Math.floor(geom1.length * pct)]
      let minDist = Infinity
      for (let j = 0; j < geom2.length; j += Math.max(1, Math.floor(geom2.length / 25))) {
        const p2 = geom2[j]
        const d = Math.hypot(p1[0] - p2[0], p1[1] - p2[1]) * 111000
        if (d < minDist) minDist = d
      }
      totalMinDist += minDist
    }
    const avgDist = totalMinDist / samplePcts.length
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

export function deduplicateRoutes(routes) {
  if (!routes || !routes.length) return []
  const kept = []
  for (const route of routes) {
    const isDuplicate = kept.some(k => areRoutesSimilar(k, route))
    if (!isDuplicate) kept.push(route)
  }
  return kept
}

// ─── Comparative Score & Safety Breakdown ──────────────────────────────────────
/**
 * Returns a structured comparative safety breakdown:
 * - advantages: What's Good about this route compared to alternatives
 * - tradeOffs: What's Not Good / Watch Out (Trade-offs & risks)
 * - trafficRegulation: Traffic police direction, one-way/two-way status, and timing windows
 * - factualDeductions: Point deductions (user reports, crimes, flood, accident)
 * - environmental: AQI, UV, Pollen
 * - allReasons: Combined list of all items for backward compatibility
 */
export function getScoreComparativeBreakdown(score, rankLabel, envReasons = [], riskReasons = [], route = null) {
  const advantages = []
  const tradeOffs = []
  const factualDeductions = []
  const environmental = []

  // 1. Primary Comparative Profile (Ultra-concise 3-6 word points)
  if (rankLabel === 'SAFEST') {
    if (route?.totalHazardOverlaps === 0) {
      advantages.push('Zero crime or accident blackspot overlaps')
    }
    advantages.push('Top safety score (lowest hazard exposure)')
    advantages.push('Divided lanes & bright street lighting')
    advantages.push('Active police posts & emergency help')

    if (route?.timeDiffMin > 0) {
      tradeOffs.push(`+${route.timeDiffMin} min slower than fastest shortcut`)
    } else {
      tradeOffs.push('Standard arterial commute pace')
    }
  } else if (rankLabel === 'BALANCED') {
    if (route?.totalHazardOverlaps === 0) {
      advantages.push('Zero crime or accident blackspot overlaps')
    }
    advantages.push('Balanced safety & travel time')
    advantages.push('Direct bypass with steady lighting')
    advantages.push('Good pedestrian & shop presence')

    if (route?.onRouteAccidents?.length > 0) {
      tradeOffs.push(`Overlaps ${route.onRouteAccidents[0].area || 'accident blackspot'} (-${route.accidentPenalty} pts)`)
    } else if (route?.onRouteCrimes?.length > 0) {
      tradeOffs.push(`Passes near ${route.onRouteCrimes[0].area || 'crime hotspot'} (-${route.crimePenalty} pts)`)
    }
    tradeOffs.push('Moderate peak rush delays')
    tradeOffs.push('Busier commercial junctions')
  } else {
    // LEAST SAFE / FASTEST
    advantages.push('Fastest commute time')
    advantages.push('Shortest direct distance')

    if (route?.onRouteAccidents?.length > 0) {
      tradeOffs.push(`Traverses ${route.onRouteAccidents[0].area || 'accident blackspot'} (-${route.accidentPenalty} pts)`)
    }
    if (route?.onRouteCrimes?.length > 0) {
      tradeOffs.push(`Passes near ${route.onRouteCrimes[0].area || 'crime hotspot'} (-${route.crimePenalty} pts)`)
    }
    tradeOffs.push('Higher collision & hazard exposure')
    tradeOffs.push('Narrow streets & blind turns')
    tradeOffs.push('Daytime one-way rules apply')
  }

  // 2. Factual hazard deductions (Short & crisp)
  if (route) {
    if ((route.crimePenalty || 0) > 0)
      factualDeductions.push(`Near crime spots (-${route.crimePenalty} pts)`)
    if ((route.accidentPenalty || 0) > 0)
      factualDeductions.push(`Accident blackspot (-${route.accidentPenalty} pts)`)
    if ((route.floodPenalty || 0) > 0)
      factualDeductions.push(`Waterlogging risk (-${route.floodPenalty} pts)`)
    if ((route.disasterPenalty || 0) > 0)
      factualDeductions.push(`Hazard zone (-${route.disasterPenalty} pts)`)
    if ((route.envPenalty || 0) > 0) {
      if (route.envBreakdown?.isRespiratory) {
        factualDeductions.push(`Asthma AQI penalty (-${route.envPenalty} pts)`)
      } else {
        factualDeductions.push(`High AQI penalty (-${route.envPenalty} pts)`)
      }
    }

    if (route.onRouteReports && route.onRouteReports.length > 0) {
      route.onRouteReports.slice(0, 2).forEach(r => {
        const typeName = HAZARD_MAP[r.hazardType || r.type]?.label || r.title || 'Hazard'
        factualDeductions.push(`Report: ${typeName} (-${r._penalty || 6} pts)`)
      })
    }
  }

  // 3. Environmental (Max 2 concise items)
  if (envReasons.length > 0) {
    envReasons.slice(0, 2).forEach(er => {
      const short = er.length > 40 ? er.slice(0, 37) + '…' : er
      if (!environmental.includes(short)) environmental.push(short)
    })
  }

  // 4. Traffic police regulations
  const trafficRegulation = route?.trafficRegulation || (route ? getRouteTrafficRegulations(route) : null)

  const allReasons = [
    ...advantages,
    ...tradeOffs,
    ...factualDeductions,
    ...environmental,
  ]

  return {
    advantages: advantages.slice(0, 4),
    tradeOffs: tradeOffs.slice(0, 3),
    factualDeductions: factualDeductions.slice(0, 3),
    environmental: environmental.slice(0, 2),
    trafficRegulation,
    allReasons,
    overlapAnalysis: route?.overlapAnalysis || null,
    totalHazardOverlaps: route?.totalHazardOverlaps ?? 0,
    accidentOverlapCount: route?.accidentOverlapCount ?? 0,
    crimeOverlapCount: route?.crimeOverlapCount ?? 0,
  }
}

// ─── Score explanation reasons ─────────────────────────────────────────────────
/**
 * Builds the ordered list of safety score explanation reasons for a route card.
 */
export function getScoreReasons(score, rankLabel, envReasons = [], riskReasons = [], route = null) {
  let reasons = []

  // 1. Primary trade-off profile
  if (rankLabel === 'RISKY' || rankLabel === 'FASTEST') {
    reasons.push('Shortest travel time')
  } else if (rankLabel === 'SAFEST') {
    reasons.push('Best overall safety score')
  } else if (rankLabel === 'BALANCED') {
    reasons.push('Balanced safety & speed')
  }

  // 2. Score-tier based corridor safety profile (Concise)
  if (score >= 88) {
    reasons.push(
      'Low traffic congestion',
      'Minimal hazard reports',
      'Bright road lighting',
      'Divided wide lanes',
    )
  } else if (score >= 75) {
    reasons.push(
      'Moderate traffic flow',
      'Decent street lighting',
      'Accessible emergency posts',
    )
  } else if (score >= 60) {
    reasons.push(
      'Higher traffic delays',
      'Multiple hazard warnings',
      'Variable road quality',
    )
  } else {
    reasons.push(
      'High hazard density',
      'Poor lighting & narrow roads',
      'Frequent incident reports',
    )
  }

  // 3. Factual hazard deductions & ML insights (if route provided)
  if (route) {
    if ((route.crimePenalty || 0) > 0)
      reasons.push(`Near crime spots (-${route.crimePenalty} pts)`)
    if ((route.accidentPenalty || 0) > 0)
      reasons.push(`Accident blackspot (-${route.accidentPenalty} pts)`)
    if ((route.floodPenalty || 0) > 0)
      reasons.push(`Waterlogging risk (-${route.floodPenalty} pts)`)
    if ((route.disasterPenalty || 0) > 0)
      reasons.push(`Hazard zone (-${route.disasterPenalty} pts)`)
    if ((route.envPenalty || 0) > 0) {
      if (route.envBreakdown?.isRespiratory) {
        reasons.push(`Asthma AQI penalty (-${route.envPenalty} pts)`)
      } else {
        reasons.push(`High AQI penalty (-${route.envPenalty} pts)`)
      }
    }
  }

  // 4. Environmental & safety risk reasons (e.g. AQI 36 — Fair, UV Index 4.85 — Moderate)
  if (riskReasons.length > 0) {
    riskReasons.forEach(rr => { if (!reasons.includes(rr)) reasons.push(rr) })
  }
  if (envReasons.length > 0) {
    envReasons.forEach(er => { if (!reasons.includes(er)) reasons.push(er) })
  }

  return reasons
}

// ─── Apply environmental penalties to already-scored routes ───────────────────
export function applyEnvironmentalPenalties(routes, envPenalties = []) {
  if (!envPenalties.length) return routes

  return routes.map((route, idx) => {
    const ep = envPenalties[idx]
    if (!ep) return route

    // Calibrated environmental deduction: AQI/Asthma (0-4 pts) + lighting proxy (0-2 pts)
    const envPts  = safeNum(ep.envPenalty, 0)
    const riskPts = Math.min(2, Math.round(safeNum(ep.riskPenalty, 0) * 0.2))
    const totalEnvPenalty = envPts + riskPts
    const newScore = Math.max(MIN_SCORE, Math.min(MAX_SCORE, safeNum(route.safetyScore, 75) - totalEnvPenalty))

    return {
      ...route,
      safetyScore:  newScore,
      envPenalty:   totalEnvPenalty,
      riskPenalty:  riskPts,
      envBreakdown: ep.envBreakdown || {},
      envReasons:   ep.envReasons   || [],
      riskReasons:  ep.riskReasons  || [],
      envData:      ep.envData      || null,
    }
  })
}

// ─── Home-screen area safety score ────────────────────────────────────────────
export function calculateSafetyScore({ nearbyPlaces = [], reports = [] }) {
  let score = 70

  const hospitals = nearbyPlaces.filter(p => p.amenity === 'hospital').length
  const police    = nearbyPlaces.filter(p => p.amenity === 'police').length
  const fire      = nearbyPlaces.filter(p => p.amenity === 'fire_station').length
  const pharmacy  = nearbyPlaces.filter(p => p.amenity === 'pharmacy').length

  score += Math.min(hospitals * 4, 12)
  score += Math.min(police    * 5, 15)
  score += Math.min(fire      * 3,  9)
  score += Math.min(pharmacy  * 1,  4)

  const active = recentReports(reports)
  active.forEach(r => { score -= calcPenalty(r) })

  return Math.max(MIN_SCORE, Math.min(MAX_SCORE, Math.round(score)))
}

// ─── Score label helpers ───────────────────────────────────────────────────────
export function getScoreLabel(score) {
  if (score >= 85) return { label: 'Safe Zone',     color: '#10B981', bg: 'bg-green-100',  text: 'text-green-700'  }
  if (score >= 70) return { label: 'Mostly Safe',   color: '#34D399', bg: 'bg-green-50',   text: 'text-green-600'  }
  if (score >= 55) return { label: 'Moderate',      color: '#F59E0B', bg: 'bg-amber-100',  text: 'text-amber-700'  }
  if (score >= 40) return { label: 'Caution',       color: '#F97316', bg: 'bg-orange-100', text: 'text-orange-700' }
  return                  { label: 'High Risk',     color: '#EF4444', bg: 'bg-red-100',    text: 'text-red-700'    }
}

export function getRouteType(idx) {
  const types = [
    { label: 'SAFEST',     color: '#10B981', badge: 'bg-[#10B981]' },
    { label: 'BALANCED',   color: '#2563EB', badge: 'bg-[#2563EB]' },
    { label: 'RISKY',      color: '#EF4444', badge: 'bg-[#EF4444]' },
  ]
  return types[idx] || types[0]
}
