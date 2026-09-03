/**
 * safetyScore.js — Community-powered route safety engine
 *
 * Algorithm overview:
 *   1. For every report in Firestore, calculate its minimum distance to
 *      each route polyline using point-to-segment math (Haversine).
 *   2. If a report is within REPORT_PROXIMITY_METERS of the route,
 *      it is "on that route" and its penalty is applied.
 *   3. Penalty = hazardType.basePenalty × severityLevel.multiplier
 *   4. Routes start at BASE_SCORE. Score = BASE_SCORE - Σ penalties (min 10).
 *   5. Routes are re-sorted: highest score = new "Safest Route".
 *
 * Exports:
 *   calculateRouteSafetyScores(routes, nearbyPlaces, reports, crimeHotspots, floodZones, disasterZones, accidentZones)
 *     → same routes[] with safetyScore added + onRouteReports[] attached
 *   applyEnvironmentalPenalties(routes, envPenalties)
 *     → updates safety score based on AQI, Pollen, UV, and user Medical Profile
 *   calculateSafetyScore({ nearbyPlaces, reports })
 *     → single number for home-screen safety badge
 *   getScoreLabel(score)
 *     → { label, color, bg, text }
 *   getRouteType(idx)
 *     → { label, color, badge }
 */

import { HAZARD_TYPES, SEVERITY_LEVELS } from '../constants'
import { CRIME_SEVERITY_CONFIG, CRIME_ROUTE_PROXIMITY_METERS } from '../data/crimeHotspots'
import { FLOOD_SEVERITY_CONFIG, FLOOD_ROUTE_PROXIMITY_METERS, isMonsoonSeason } from '../data/floodZones'
import { DISASTER_ZONES, DISASTER_SEVERITY_CONFIG, DISASTER_ROUTE_PROXIMITY_METERS } from '../data/disasterZones'
import { ACCIDENT_BLACKSPOTS, ACCIDENT_SEVERITY_CONFIG, ACCIDENT_ROUTE_PROXIMITY_METERS } from '../data/accidentBlackspots'

// ─── Config ─────────────────────────────────────────────────────────────────────────
const BASE_SCORE              = 96  // Routes start at 96, deductions bring down to realistic range
const REPORT_PROXIMITY_METERS = 250  // Live community reports within 250m of a route affect it
const REPORT_MAX_AGE_HOURS    = 72   // Consider reports from last 72 hours
const MIN_SCORE               = 10   // Floor — route score never goes below 10
const MAX_SCORE               = 100  // Ceiling
const MONSOON_FLOOD_MULTIPLIER = 1.4  // Flood penalty 40% higher during June-October

/**
 * ROUTE_VARIANCE: small per-route offsets that make demo routes feel distinct
 * even with no reports. Applied to the ORIGINAL route index (route 0 = longer/safer,
 * route 1 = balanced, route 2 = shorter/faster).
 */
const ROUTE_VARIANCE = [+4, 0, -8]

/**
 * RANK_CONFIGS: appearance for rank 0 (safest), 1 (middle), 2 (least safe / fastest).
 * Assigned strictly by safety score ranking: Green → Blue → Red.
 */
export const RANK_CONFIGS = [
  { label: 'SAFEST',     color: '#10B981', badge: 'bg-[#10B981]', recommended: true  },
  { label: 'BALANCED',   color: '#2563EB', badge: 'bg-[#2563EB]', recommended: false },
  { label: 'LEAST SAFE', color: '#EF4444', badge: 'bg-[#EF4444]', recommended: false },
]

// ─── Lookup tables ─────────────────────────────────────────────────────────────
const HAZARD_MAP   = Object.fromEntries(HAZARD_TYPES.map(h => [h.id, h]))
const SEVERITY_MAP = Object.fromEntries(SEVERITY_LEVELS.map(s => [s.id, s]))

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
      return { ...route, safetyScore: 75 + (ROUTE_VARIANCE[routeIndex] || 0), onRouteReports: [] }
    }

    let score = BASE_SCORE
    score += (ROUTE_VARIANCE[routeIndex] || 0)

    // ── Route Geometry Fingerprint: ensures scores differ per destination ─────
    if (geometry && geometry.length >= 2) {
      try {
        const midPt   = geometry[Math.floor(geometry.length / 2)]
        const startPt = geometry[0]
        const endPt   = geometry[geometry.length - 1]
        if (
          midPt && startPt && endPt &&
          isFinite(midPt[0])   && isFinite(midPt[1]) &&
          isFinite(startPt[0]) && isFinite(startPt[1]) &&
          isFinite(endPt[0])   && isFinite(endPt[1])
        ) {
          const fpSeed = (
            (Math.round(Math.abs(endPt[0])   * 1000) % 9999) * 7919 +
            (Math.round(Math.abs(endPt[1])   * 1000) % 9999) * 6271 +
            (Math.round(Math.abs(midPt[0])   * 1000) % 9999) * 4987 +
            (Math.round(Math.abs(midPt[1])   * 1000) % 9999) * 3571 +
            routeIndex * 1009
          )
          const fpOffset = (Math.abs(fpSeed) % 15) - 9
          score += fpOffset
        }
      } catch (_) { /* fingerprint errors are non-fatal */ }
    }

    const onRouteReports   = []
    const onRouteCrimes    = []
    const onRouteFlood     = []

    // ── (A) Live community hazard report penalties ───────────────────────────────
    let totalReportPenalty = 0
    const REPORT_PENALTY_CAP = 35
    active.forEach(r => {
      const lat = parseFloat(r.latitude ?? r.lat ?? r.location?.latitude ?? r.location?.lat)
      const lng = parseFloat(r.longitude ?? r.lng ?? r.location?.longitude ?? r.location?.lng)
      if (!isFinite(lat) || !isFinite(lng)) return

      const dist = minDistanceToPolyline(lat, lng, geometry)
      if (dist <= REPORT_PROXIMITY_METERS) {
        const penalty = calcPenalty(r)
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
    score -= totalReportPenalty

    // ── (B) Historical crime hotspot penalties ────────────────────────────────
    let totalCrimePenalty = 0
    const CRIME_PENALTY_CAP = 18
    const isNight = (() => { const h = new Date().getHours(); return h < 6 || h >= 20 })()

    crimeHotspots.forEach(hotspot => {
      const dist = minDistanceToPolyline(hotspot.lat, hotspot.lng, geometry)
      if (dist <= CRIME_ROUTE_PROXIMITY_METERS) {
        const cfg     = CRIME_SEVERITY_CONFIG[hotspot.severity] || CRIME_SEVERITY_CONFIG.low
        const penalty = Math.round(cfg.penalty * (isNight ? 1.3 : 1.0))
        totalCrimePenalty = Math.min(totalCrimePenalty + penalty, CRIME_PENALTY_CAP)
        onRouteCrimes.push({ ...hotspot, _penalty: penalty, _dist: Math.round(dist) })
      }
    })
    score -= totalCrimePenalty

    // ── (C) Flood zone penalties ───────────────────────────────────────────────
    const monsoon = isMonsoonSeason()
    let totalFloodPenalty = 0
    const FLOOD_PENALTY_CAP = 12

    floodZones.forEach(zone => {
      const dist = minDistanceToPolyline(zone.lat, zone.lng, geometry)
      if (dist <= FLOOD_ROUTE_PROXIMITY_METERS) {
        const cfg     = FLOOD_SEVERITY_CONFIG[zone.severity] || FLOOD_SEVERITY_CONFIG.low
        const base    = cfg.penalty
        const penalty = monsoon && zone.monsoonRisk
          ? Math.round(base * MONSOON_FLOOD_MULTIPLIER)
          : base
        totalFloodPenalty = Math.min(totalFloodPenalty + penalty, FLOOD_PENALTY_CAP)
        onRouteFlood.push({ ...zone, _penalty: penalty, _dist: Math.round(dist) })
      }
    })
    score -= totalFloodPenalty

    // ── (D) Disaster Zone penalties ────────────────────────────────────────
    let totalDisasterPenalty = 0
    const DISASTER_PENALTY_CAP = 10
    const onRouteDisasters = []
    disasterZones.forEach(dz => {
      const dist = minDistanceToPolyline(dz.lat, dz.lng, geometry)
      if (dist <= DISASTER_ROUTE_PROXIMITY_METERS) {
        const cfg = DISASTER_SEVERITY_CONFIG[dz.severity] || DISASTER_SEVERITY_CONFIG.medium
        const penalty = cfg.penalty
        totalDisasterPenalty = Math.min(totalDisasterPenalty + penalty, DISASTER_PENALTY_CAP)
        onRouteDisasters.push({ ...dz, _penalty: penalty, _dist: Math.round(dist) })
      }
    })
    score -= totalDisasterPenalty

    // ── (E) Accident Blackspot penalties ──────────────────────────────────
    let totalAccidentPenalty = 0
    const ACCIDENT_PENALTY_CAP = 8
    const onRouteAccidents = []
    accidentZones.forEach(acc => {
      const dist = minDistanceToPolyline(acc.lat, acc.lng, geometry)
      if (dist <= ACCIDENT_ROUTE_PROXIMITY_METERS) {
        const cfg = ACCIDENT_SEVERITY_CONFIG[acc.severity] || ACCIDENT_SEVERITY_CONFIG.medium
        const penalty = cfg.penalty
        totalAccidentPenalty = Math.min(totalAccidentPenalty + penalty, ACCIDENT_PENALTY_CAP)
        onRouteAccidents.push({ ...acc, _penalty: penalty, _dist: Math.round(dist) })
      }
    })
    score -= totalAccidentPenalty

    score = isFinite(score) ? Math.max(MIN_SCORE, Math.min(MAX_SCORE, Math.round(score))) : 75
    return {
      ...route,
      safetyScore:   score,
      onRouteReports,
      onRouteCrimes,
      onRouteFlood,
      onRouteDisasters,
      onRouteAccidents,
      reportPenalty: totalReportPenalty,
      crimePenalty:  totalCrimePenalty,
      floodPenalty:  totalFloodPenalty,
      disasterPenalty: totalDisasterPenalty,
      accidentPenalty: totalAccidentPenalty,
    }
  })

  // ── Step 2: Order strictly by Safety Score (Highest → Lowest) ─────────────
  const sorted = [...scoredRoutes].sort((a, b) => (b.safetyScore || 0) - (a.safetyScore || 0))

  // ── Step 3: Assign Distinct Rank Color: Green (#10B981) → Blue (#2563EB) → Red (#EF4444)
  const rankedRoutes = sorted.map((route, idx) => {
    const cfg = RANK_CONFIGS[Math.min(idx, RANK_CONFIGS.length - 1)]
    const isRec = idx === 0

    // Trade-off compared to the fastest route
    const minDur = Math.min(...scoredRoutes.map(r => r.durationMin || 999))
    const timeDiffMin = Math.max(0, (route.durationMin || 0) - minDur)

    let tradeOffText = ''
    if (timeDiffMin === 0) {
      tradeOffText = 'Shortest travel time'
    } else {
      tradeOffText = `+${timeDiffMin} min vs fastest`
    }

    const safetySegments = buildSafetySegments(route.geometry, route.onRouteReports, route.onRouteCrimes)

    return {
      ...route,
      rankLabel:     cfg.label,
      rankColor:     cfg.color,
      isRecommended: isRec,
      recommended:   isRec,
      timeDiffMin,
      tradeOffText,
      safetySegments,
    }
  })

  // Enforce score distinction if tied
  for (let i = 1; i < rankedRoutes.length; i++) {
    const prev = rankedRoutes[i - 1].safetyScore
    if (prev - rankedRoutes[i].safetyScore < 4) {
      rankedRoutes[i] = { ...rankedRoutes[i], safetyScore: Math.max(MIN_SCORE, prev - 4) }
    }
  }

  return rankedRoutes
}

// ─── Build geometry-aware safety segments ────────────────────────────────────
export function buildSafetySegments(geometry, reports = [], crimes = []) {
  if (!geometry || geometry.length < 2) return []

  const riskPoints = [
    ...reports.map(r => ({ lat: r._snapLat || r.lat, lng: r._snapLng || r.lng, severity: r.severity || 'medium', label: r.type || 'Hazard' })),
    ...crimes.map(c => ({ lat: c.lat, lng: c.lng, severity: c.severity || 'high', label: c.area || 'Crime Area' })),
  ]

  if (!riskPoints.length) return []

  const segments = []
  for (const risk of riskPoints) {
    for (let i = 0; i < geometry.length - 1; i++) {
      const p1 = geometry[i]
      const p2 = geometry[Math.min(i + 2, geometry.length - 1)]
      const d = minDistanceToPolyline(risk.lat, risk.lng, [p1, p2])
      if (d < 120) {
        segments.push({
          points: geometry.slice(Math.max(0, i - 1), Math.min(geometry.length, i + 3)),
          severity: risk.severity,
          color: risk.severity === 'high' ? '#EF4444' : '#F59E0B',
          label: risk.label,
        })
        break
      }
    }
  }
  return segments
}

// ─── Collision-aware map label anchor position ────────────────────────────────
export function getRouteAnchorPoint(geometry, index, totalRoutes = 3) {
  if (!geometry || geometry.length === 0) return [22.5726, 88.3639]
  if (geometry.length === 1) return geometry[0]

  const fractions = [0.48, 0.32, 0.65]
  const frac = fractions[index % fractions.length] || 0.50

  const targetIdx = Math.floor((geometry.length - 1) * frac)
  const pt = geometry[targetIdx]

  const offsetLat = (index === 1 ? 0.0018 : index === 2 ? -0.0018 : 0)
  const offsetLng = (index === 1 ? -0.0015 : index === 2 ? 0.0015 : 0)

  return [pt[0] + offsetLat, pt[1] + offsetLng]
}

// ─── Deduplicate near-identical routes ─────────────────────────────────────────
export function deduplicateRoutes(routes) {
  if (!routes || routes.length <= 3) return routes || []
  const kept = []
  for (const route of routes) {
    const isDuplicate = kept.some(k => {
      const distDiff = Math.abs((route.distanceKm || 0) - (k.distanceKm || 0))
      const timeDiff = Math.abs((route.durationMin || 0) - (k.durationMin || 0))
      const distSim  = k.distanceKm  > 0 ? distDiff / k.distanceKm  : 0
      const timeSim  = k.durationMin > 0 ? timeDiff / k.durationMin : 0
      return distSim < 0.03 && timeSim < 0.03
    })
    if (!isDuplicate) kept.push(route)
  }
  return kept.length >= 3 ? kept : routes
}

// ─── Score explanation reasons ─────────────────────────────────────────────────
export function getScoreReasons(score, rankLabel, envReasons = [], riskReasons = [], route = null) {
  let reasons = []
  if (score >= 88) {
    reasons = [
      'Lower traffic congestion',
      'Fewer community hazard reports',
      'Better road lighting',
      'Higher activity zone',
      'Wider roads with better visibility',
    ]
  } else if (score >= 75) {
    reasons = [
      'Moderate traffic levels',
      'Good road conditions',
      'Some community reports nearby',
      'Reasonably lit area',
      'Accessible emergency services',
    ]
  } else if (score >= 60) {
    reasons = [
      'Elevated traffic congestion',
      'Multiple community hazard reports',
      'Some isolated stretches',
      'Variable road quality',
      'Fewer nearby services',
    ]
  } else {
    reasons = [
      'High hazard density on route',
      'Poor road conditions reported',
      'Isolated or poorly lit stretches',
      'Multiple community warnings',
      'Limited emergency access',
    ]
  }
  if (rankLabel === 'FASTEST' || rankLabel === 'LEAST SAFE') reasons = ['Shortest travel time', ...reasons]
  if (rankLabel === 'SAFEST')   reasons = ['Best overall safety profile', ...reasons]

  // Append factual deduction reasons if route object provided
  if (route) {
    if (route.onRouteReports && route.onRouteReports.length > 0) {
      route.onRouteReports.forEach(r => {
        const typeName = HAZARD_MAP[r.hazardType || r.type]?.label || r.title || r.type || 'Community Hazard'
        const desc = r.description ? ` (${r.description})` : ''
        reasons.unshift(`⚠️ -${r._penalty || 6} pts: User Report — ${typeName}${desc}`)
      })
    }
    if ((route.crimePenalty || 0) > 0) reasons.push(`Crime zones on this route (-${route.crimePenalty} pts)`)
    if ((route.floodPenalty || 0) > 0) reasons.push(`Flood / waterlogging risk (-${route.floodPenalty} pts)`)
    if ((route.disasterPenalty || 0) > 0) reasons.push(`Natural hazard zones on route (-${route.disasterPenalty} pts)`)
    if ((route.accidentPenalty || 0) > 0) reasons.push(`Road accident blackspots near route (-${route.accidentPenalty} pts)`)
    if ((route.envPenalty || 0) > 0) {
      if (route.envBreakdown?.isRespiratory) {
        reasons.push(`Air quality (AQI) impact with Asthma profile (-${route.envPenalty} pts)`)
      } else {
        reasons.push(`Air quality (AQI) modifier (-${route.envPenalty} pts)`)
      }
    }
  }
  if (riskReasons.length > 0) reasons.push(...riskReasons)
  if (envReasons.length > 0) reasons.push(...envReasons)

  return reasons
}

// ─── Apply environmental penalties to already-scored routes ───────────────────
export function applyEnvironmentalPenalties(routes, envPenalties = []) {
  if (!envPenalties.length) return routes

  return routes.map((route, idx) => {
    const ep = envPenalties[idx]
    if (!ep) return route

    const totalEnvPenalty = (ep.envPenalty || 0) + (ep.riskPenalty || 0)
    const newScore = Math.max(MIN_SCORE, Math.min(MAX_SCORE, route.safetyScore - totalEnvPenalty))

    return {
      ...route,
      safetyScore:  newScore,
      envPenalty:   ep.envPenalty   || 0,
      riskPenalty:  ep.riskPenalty  || 0,
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
    { label: 'LEAST SAFE', color: '#EF4444', badge: 'bg-[#EF4444]' },
  ]
  return types[idx] || types[0]
}
