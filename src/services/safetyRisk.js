/**
 * safetyRisk.js — Environmental Crime Risk Estimator
 *
 * Since official crime data exists only in limited areas, this service
 * uses Overpass API (OpenStreetMap) to derive an "Estimated Safety Score"
 * from environmental proxy factors:
 *
 *  Factor                        | Weight  | Rationale
 *  ------------------------------|---------|-------------------------------------------
 *  Street lamp density           | 30%     | Well-lit roads are statistically safer
 *  Police station proximity      | 25%     | Closer police = faster response time
 *  Commercial/Night activity     | 20%     | Busy areas with open shops = more eyes
 *  Building density              | 15%     | Populated areas have lower isolation risk
 *  Road type (primary vs track)  | 10%     | Major roads have better surveillance
 *
 * This score is labeled "Estimated Safety" in UI — never "Official Crime Data".
 * Where official NCRB crime data exists (in crimeHotspots.js), it receives
 * higher weight and overrides this estimate.
 *
 * Caches per 500m grid, 30-minute TTL to limit Overpass API calls.
 */

const OVERPASS_BASE = 'https://overpass-api.de/api/interpreter'

// ── Cache ─────────────────────────────────────────────────────────────────────
const _riskCache = new Map()
const RISK_CACHE_TTL_MS = 30 * 60 * 1000 // 30 minutes

function _cacheKey(lat, lng) {
  // ~500m grid resolution
  return `srisk_${Math.round(lat * 200) / 200}_${Math.round(lng * 200) / 200}`
}

// ── Haversine helper ──────────────────────────────────────────────────────────
function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// ── Fetch safety proxy data from Overpass ─────────────────────────────────────
/**
 * Fetches environmental safety proxy data for a point.
 * Returns a normalized safety score (0-100) and breakdown for explainability.
 *
 * @param {number} lat
 * @param {number} lng
 * @param {number} radiusMeters - Search radius (default 300m)
 * @returns {Promise<Object>} safetyRisk
 */
export async function fetchEnvironmentalSafetyRisk(lat, lng, radiusMeters = 300) {
  const key = _cacheKey(lat, lng)
  if (_riskCache.has(key)) {
    const entry = _riskCache.get(key)
    if (Date.now() - entry.ts < RISK_CACHE_TTL_MS) return entry.data
    _riskCache.delete(key)
  }

  const defaults = {
    estimatedSafetyScore: 60, // Neutral default — not safe, not dangerous
    lampDensity:     0,
    policeNearby:    false,
    commercialCount: 0,
    buildingCount:   0,
    hasMainRoad:     false,
    breakdown: {},
    estimated: true, // Always label this as estimated
    error: false,
  }

  try {
    const query = `[out:json][timeout:12];
(
  node[highway=street_lamp](around:${radiusMeters},${lat},${lng});
  node[amenity=police](around:1000,${lat},${lng});
  node[amenity~"restaurant|cafe|bar|shop|pharmacy|bank|atm"](around:${radiusMeters},${lat},${lng});
  way[building](around:${radiusMeters},${lat},${lng});
  way[highway~"primary|secondary|trunk|motorway"](around:${radiusMeters},${lat},${lng});
);
out body;`

    const res = await fetch(OVERPASS_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(query)}`,
      signal: AbortSignal.timeout(15000),
    })

    if (!res.ok) throw new Error('Overpass error: ' + res.status)
    const data = await res.json()
    const elements = data.elements || []

    // ── Count each factor ────────────────────────────────────────────────────
    const lamps       = elements.filter(e => e.tags?.highway === 'street_lamp')
    const police      = elements.filter(e => e.tags?.amenity === 'police')
    const commercial  = elements.filter(e =>
      e.tags?.amenity && ['restaurant','cafe','bar','shop','pharmacy','bank','atm'].includes(e.tags.amenity)
    )
    const buildings   = elements.filter(e => e.tags?.building)
    const mainRoads   = elements.filter(e =>
      e.tags?.highway && ['primary','secondary','trunk','motorway'].includes(e.tags.highway)
    )

    // ── Closest police station distance ──────────────────────────────────────
    let closestPoliceMeters = Infinity
    police.forEach(p => {
      if (p.lat && p.lon) {
        const d = haversineMeters(lat, lng, p.lat, p.lon)
        if (d < closestPoliceMeters) closestPoliceMeters = d
      }
    })

    // ── Score each factor (0-100 per factor) ─────────────────────────────────
    const lampScore    = Math.min(100, (lamps.length / 10) * 100)

    const policeScore  = closestPoliceMeters <= 200 ? 100
      : closestPoliceMeters <= 500 ? 80
      : closestPoliceMeters <= 1000 ? 60
      : closestPoliceMeters <= 2000 ? 30
      : 0

    const commercialScore = Math.min(100, (commercial.length / 5) * 100)
    const buildingScore   = Math.min(100, (buildings.length / 10) * 100)
    const roadScore       = mainRoads.length > 0 ? 100 : 30

    // ── Weighted composite ─────────────────────────────────────────────────
    const estimatedSafetyScore = Math.round(
      lampScore    * 0.30 +
      policeScore  * 0.25 +
      commercialScore * 0.20 +
      buildingScore   * 0.15 +
      roadScore       * 0.10
    )

    const result = {
      estimatedSafetyScore,
      lampDensity:     lamps.length,
      policeNearby:    closestPoliceMeters <= 1000,
      policeDistanceM: Math.round(closestPoliceMeters === Infinity ? 9999 : closestPoliceMeters),
      commercialCount: commercial.length,
      buildingCount:   buildings.length,
      hasMainRoad:     mainRoads.length > 0,
      breakdown: {
        lampScore:      Math.round(lampScore),
        policeScore:    Math.round(policeScore),
        commercialScore: Math.round(commercialScore),
        buildingScore:  Math.round(buildingScore),
        roadScore,
      },
      estimated: true,
      error: false,
    }

    _riskCache.set(key, { data: result, ts: Date.now() })
    return result

  } catch (err) {
    console.warn('[SafetyRisk] Overpass fetch failed, using defaults:', err.message)
    return { ...defaults, error: true }
  }
}

/**
 * Compute environmental penalty on a route based on safety risk at midpoint.
 * Penalty: 0-15 pts. Inverted from estimatedSafetyScore.
 *
 * @param {Object} safetyRisk - Result from fetchEnvironmentalSafetyRisk()
 * @returns {{ penalty, reasons }}
 */
export function computeSafetyRiskPenalty(safetyRisk) {
  if (!safetyRisk || safetyRisk.error) return { penalty: 0, reasons: [] }

  const MAX_RISK_PENALTY = 15
  const penalty = Math.round(((100 - safetyRisk.estimatedSafetyScore) / 100) * MAX_RISK_PENALTY)

  const reasons = []
  if (safetyRisk.lampDensity < 3)      reasons.push('Limited street lighting detected')
  if (!safetyRisk.policeNearby)        reasons.push('No police station within 1km')
  if (safetyRisk.commercialCount < 2)  reasons.push('Low commercial activity on route')
  if (safetyRisk.buildingCount < 3)    reasons.push('Low building density — isolated area')
  if (!safetyRisk.hasMainRoad)         reasons.push('No major road — less surveillance')

  return { penalty: Math.min(penalty, MAX_RISK_PENALTY), reasons }
}

/**
 * Get route safety factors for "Why this score?" — positive framing.
 *
 * @param {Object} safetyRisk
 * @returns {string[]}
 */
export function getSafetyRiskReasons(safetyRisk) {
  if (!safetyRisk || safetyRisk.error) return []
  const reasons = []

  if (safetyRisk.lampDensity >= 5)    reasons.push(`${safetyRisk.lampDensity} street lamps nearby — well lit`)
  if (safetyRisk.policeNearby)        reasons.push(`Police station within ${safetyRisk.policeDistanceM}m`)
  if (safetyRisk.commercialCount >= 3) reasons.push(`${safetyRisk.commercialCount} active businesses on route`)
  if (safetyRisk.buildingCount >= 5)  reasons.push('High building density — populated area')
  if (safetyRisk.hasMainRoad)         reasons.push('Major road — better surveillance')
  if (safetyRisk.estimated)           reasons.push('Estimated from street infrastructure data')

  return reasons
}
