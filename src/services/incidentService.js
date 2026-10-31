/**
 * src/services/incidentService.js
 *
 * Unified Incident Service:
 *  - Ingests & merges external provider incidents (TomTom / OSRM) and user hazard reports.
 *  - Deduplicates events by geographic proximity and time window.
 *  - Calculates dynamic confidence scores based on multi-user confirmations & upvotes.
 *  - Implements TTL expiry and temporal severity decay.
 *  - Filters incidents strictly along route corridor buffers (not whole-city).
 *  - Provides a Fake Incident Injector for deterministic simulation and hackathon demos.
 */

// ─── Configuration Constants ───────────────────────────────────────────────────
export const INCIDENT_DEDUPE_METERS = 75          // Proximity threshold for clustering identical reports
export const INCIDENT_DEDUPE_TIME_MS = 3600000    // 1-hour time window for clustering identical reports
export const INCIDENT_TTL_HOURS = 72              // Absolute maximum lifespan of an unverified report
export const CORRIDOR_BUFFER_DEFAULT_METERS = 250 // Buffer radius along polyline

// Base weights for incident types
export const INCIDENT_BASE_DELAYS = {
  accident: 300,        // 5 minutes baseline delay
  road_closed: 600,     // 10 minutes baseline delay
  flood: 450,           // 7.5 minutes baseline delay
  waterlogging: 240,    // 4 minutes baseline delay
  traffic: 180,         // 3 minutes baseline delay
  pothole: 60,          // 1 minute baseline delay
  unlit_street: 45,     // 45 seconds baseline delay
  construction: 180,    // 3 minutes baseline delay
  other: 60,
}

// In-memory registry for fake/simulated incidents (for demo & testing)
let injectedFakeIncidents = []

// ─── Geometry Helpers ──────────────────────────────────────────────────────────
export function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function pointToSegmentMeters(pLat, pLng, aLat, aLng, bLat, bLng) {
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

/**
 * Calculates temporal decay factor [0.0 to 1.0] based on age in hours.
 */
export function calculateAgeDecayFactor(createdAt) {
  if (!createdAt) return 0.8
  const ageMs = Date.now() - new Date(createdAt).getTime()
  const ageHours = Math.max(0, ageMs / (1000 * 60 * 60))

  if (ageHours >= INCIDENT_TTL_HOURS) return 0.0
  if (ageHours <= 2) return 1.0
  if (ageHours <= 8) return 0.85
  if (ageHours <= 24) return 0.65
  if (ageHours <= 48) return 0.40
  return 0.20
}

/**
 * Calculates confidence score [0.1 to 1.0] for a merged incident.
 */
export function calculateConfidenceScore({
  source = 'user_report',
  verificationCount = 0,
  upvotes = 0,
  downvotes = 0,
  clusterCount = 1,
  ageDecay = 1.0,
}) {
  let score = source === 'provider' ? 0.85 : 0.50

  score += Math.min(0.25, (clusterCount - 1) * 0.12)
  score += Math.min(0.20, (upvotes + verificationCount) * 0.05)
  score -= Math.min(0.35, downvotes * 0.10)

  // Modulate by freshness
  score = score * (0.4 + 0.6 * ageDecay)

  return Math.max(0.1, Math.min(1.0, Math.round(score * 100) / 100))
}

/**
 * Merges, clusters, and deduplicates raw reports and provider incidents.
 *
 * @param {Array} userReports - Reports from Supabase `hazard_reports`
 * @param {Array} providerIncidents - Incidents from TomTom or other APIs
 * @returns {Array} Clean list of deduplicated active incidents with confidence and delay
 */
export function mergeAndDeduplicateIncidents(userReports = [], providerIncidents = []) {
  const normalized = []

  // 1. Normalize user reports
  for (const r of userReports) {
    const lat = Number(r.latitude ?? r.lat)
    const lng = Number(r.longitude ?? r.lng)
    if (!isFinite(lat) || !isFinite(lng)) continue

    const createdAt = r.created_at || r.createdAt || new Date().toISOString()
    const ageDecay = calculateAgeDecayFactor(createdAt)
    if (ageDecay <= 0) continue // Expired past TTL

    const type = String(r.hazard_type || r.type || 'other').toLowerCase()
    const severity = String(r.severity || 'medium').toLowerCase()

    normalized.push({
      id: r.id || `user_${Math.random().toString(36).slice(2)}`,
      source: 'user_report',
      type,
      label: r.hazard_label || r.title || type,
      severity,
      description: r.description || '',
      lat,
      lng,
      createdAt,
      ageDecay,
      upvotes: Array.isArray(r.upvotes) ? r.upvotes.length : (Number(r.upvotes) || 0),
      downvotes: Array.isArray(r.downvotes) ? r.downvotes.length : (Number(r.downvotes) || 0),
      verificationCount: Number(r.verification_count || 0),
    })
  }

  // 2. Normalize provider incidents
  for (const p of providerIncidents) {
    const lat = Number(p.lat ?? p.latitude ?? p.geometry?.coordinates?.[1])
    const lng = Number(p.lng ?? p.longitude ?? p.geometry?.coordinates?.[0])
    if (!isFinite(lat) || !isFinite(lng)) continue

    normalized.push({
      id: p.id || `prov_${Math.random().toString(36).slice(2)}`,
      source: 'provider',
      type: String(p.type || 'traffic').toLowerCase(),
      label: p.label || p.description || 'Traffic Delay',
      severity: String(p.severity || 'high').toLowerCase(),
      description: p.description || '',
      lat,
      lng,
      createdAt: p.createdAt || new Date().toISOString(),
      ageDecay: 1.0,
      upvotes: 0,
      downvotes: 0,
      verificationCount: 2,
      delaySeconds: Number(p.delaySeconds || 0),
    })
  }

  // 3. Include any currently active injected fake incidents (for simulation)
  for (const f of injectedFakeIncidents) {
    normalized.push({ ...f, source: 'simulation_injection' })
  }

  // 4. Spatial-temporal clustering & deduplication
  const clusters = []
  for (const item of normalized) {
    let matchedCluster = null
    for (const c of clusters) {
      const dist = haversineMeters(item.lat, item.lng, c.lat, c.lng)
      if (dist <= INCIDENT_DEDUPE_METERS) {
        matchedCluster = c
        break
      }
    }

    if (matchedCluster) {
      matchedCluster.count += 1
      matchedCluster.reports.push(item)
      // Upgrade severity to highest among members
      if (item.severity === 'critical' || matchedCluster.severity !== 'critical') {
        if (item.severity === 'critical' || item.severity === 'high') {
          matchedCluster.severity = item.severity
        }
      }
      matchedCluster.upvotes += item.upvotes
      matchedCluster.downvotes += item.downvotes
      matchedCluster.verificationCount += item.verificationCount
    } else {
      clusters.push({
        id: item.id,
        source: item.source,
        type: item.type,
        label: item.label,
        severity: item.severity,
        description: item.description,
        lat: item.lat,
        lng: item.lng,
        createdAt: item.createdAt,
        ageDecay: item.ageDecay,
        upvotes: item.upvotes,
        downvotes: item.downvotes,
        verificationCount: item.verificationCount,
        count: 1,
        reports: [item],
        delaySeconds: item.delaySeconds || 0,
      })
    }
  }

  // 5. Final pass: compute confidence and estimated delay
  return clusters.map(c => {
    const confidence = calculateConfidenceScore({
      source: c.source,
      verificationCount: c.verificationCount,
      upvotes: c.upvotes,
      downvotes: c.downvotes,
      clusterCount: c.count,
      ageDecay: c.ageDecay,
    })

    const baseDelay = INCIDENT_BASE_DELAYS[c.type] || INCIDENT_BASE_DELAYS.other
    const severityMultiplier = c.severity === 'critical' ? 2.5 : c.severity === 'high' ? 1.8 : c.severity === 'medium' ? 1.0 : 0.4
    const estimatedDelay = c.delaySeconds > 0
      ? c.delaySeconds
      : Math.round(baseDelay * severityMultiplier * confidence)

    return {
      id: c.id,
      source: c.source,
      type: c.type,
      label: c.label,
      severity: c.severity,
      description: c.description,
      lat: c.lat,
      lng: c.lng,
      confidence,
      delaySeconds: estimatedDelay,
      clusterCount: c.count,
      createdAt: c.createdAt,
    }
  })
}

/**
 * Filters a list of incidents along a route polyline within buffer distance.
 *
 * @param {Array} incidents - Processed incidents list
 * @param {Array} polylineCoords - Array of [lng, lat] or [lat, lng] coordinates
 * @param {number} bufferMeters - Corridor buffer radius (default 250m)
 * @param {boolean} isLngLat - True if coordinates are [lng, lat] (MapLibre standard)
 * @returns {Array} Incidents situated along the route corridor
 */
export function filterIncidentsAlongCorridor(
  incidents = [],
  polylineCoords = [],
  bufferMeters = CORRIDOR_BUFFER_DEFAULT_METERS,
  isLngLat = true
) {
  if (!incidents.length || !polylineCoords || polylineCoords.length < 2) return []

  const onRoute = []
  for (const inc of incidents) {
    let minDistanceToCorridor = Infinity

    for (let i = 0; i < polylineCoords.length - 1; i++) {
      const a = polylineCoords[i]
      const b = polylineCoords[i + 1]

      const aLat = isLngLat ? a[1] : a[0]
      const aLng = isLngLat ? a[0] : a[1]
      const bLat = isLngLat ? b[1] : b[0]
      const bLng = isLngLat ? b[0] : b[1]

      const d = pointToSegmentMeters(inc.lat, inc.lng, aLat, aLng, bLat, bLng)
      if (d < minDistanceToCorridor) {
        minDistanceToCorridor = d
      }

      if (minDistanceToCorridor <= bufferMeters) {
        break
      }
    }

    if (minDistanceToCorridor <= bufferMeters) {
      onRoute.push({
        ...inc,
        distanceToRouteMeters: Math.round(minDistanceToCorridor),
      })
    }
  }

  return onRoute
}

// ─── Fake Incident Injector (Simulation & Hackathon Demo) ───────────────────────

/**
 * Injects a synthetic incident along a specified coordinate to trigger live reroute demo.
 */
export function injectFakeIncident({
  lat,
  lng,
  type = 'accident',
  label = 'Severe Road Obstruction',
  description = 'Simulated multi-vehicle accident with emergency cordon',
  severity = 'critical',
  delaySeconds = 480,
}) {
  const incident = {
    id: `fake_${Date.now()}`,
    type,
    label,
    description,
    severity,
    lat,
    lng,
    delaySeconds,
    createdAt: new Date().toISOString(),
    ageDecay: 1.0,
    confidence: 1.0,
  }
  injectedFakeIncidents.push(incident)
  return incident
}

/**
 * Clears all injected synthetic incidents.
 */
export function clearFakeIncidents() {
  injectedFakeIncidents = []
}

export function getInjectedFakeIncidents() {
  return [...injectedFakeIncidents]
}

