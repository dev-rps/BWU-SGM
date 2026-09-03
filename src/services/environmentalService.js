/**
 * environmentalService.js — AQI, UV Index & Pollen Data Engine
 *
 * Uses Open-Meteo free API (no API key needed, 10,000 req/day limit).
 * - Air Quality: PM2.5, PM10, NO2, European AQI
 * - UV Index: current and max UV
 * - Pollen: grass, birch, mugwort pollen counts
 *
 * Dynamically adjusts route scoring weights based on user Medical Profile:
 *   - Asthma / COPD / Respiratory → AQI weight increases from 5% to 25%
 *   - Allergy / Hay Fever         → Pollen weight increases from 2% to 15%
 *   - Photosensitivity / Lupus    → UV weight increases from 1% to 10%
 *
 * Intelligent distance guard: environmental penalties never exceed 20 pts,
 * to prevent absurd detours (e.g. 30-min → 2-hour routes).
 *
 * Caches data per location (1km grid, 1 hour TTL) to minimize API calls.
 */

// ── Open-Meteo endpoints ──────────────────────────────────────────────────────
const AIR_QUALITY_BASE = 'https://air-quality-api.open-meteo.com/v1/air-quality'
const FORECAST_BASE    = 'https://api.open-meteo.com/v1/forecast'

// ── Cache (simple in-memory + localStorage for cross-session) ─────────────────
const CACHE_TTL_MS   = 60 * 60 * 1000 // 1 hour
const _memCache      = new Map()

function _cacheKey(lat, lng) {
  // Round to ~1km grid to reuse cached data for nearby coordinates
  return `env_${Math.round(lat * 100) / 100}_${Math.round(lng * 100) / 100}`
}

function _readCache(key) {
  // Memory first
  if (_memCache.has(key)) {
    const entry = _memCache.get(key)
    if (Date.now() - entry.ts < CACHE_TTL_MS) return entry.data
    _memCache.delete(key)
  }
  // localStorage fallback
  try {
    const raw = localStorage.getItem(key)
    if (raw) {
      const entry = JSON.parse(raw)
      if (Date.now() - entry.ts < CACHE_TTL_MS) return entry.data
      localStorage.removeItem(key)
    }
  } catch {}
  return null
}

function _writeCache(key, data) {
  const entry = { data, ts: Date.now() }
  _memCache.set(key, entry)
  try { localStorage.setItem(key, JSON.stringify(entry)) } catch {}
}

// ── AQI category labeling (European AQI scale used by Open-Meteo) ─────────────
export function getAqiLabel(europeanAqi) {
  if (europeanAqi === null || europeanAqi === undefined) return { label: 'N/A', color: '#737686', score: 0 }
  if (europeanAqi <= 20)  return { label: 'Good',       color: '#10B981', score: 100 }
  if (europeanAqi <= 40)  return { label: 'Fair',       color: '#84CC16', score: 80  }
  if (europeanAqi <= 60)  return { label: 'Moderate',   color: '#F59E0B', score: 60  }
  if (europeanAqi <= 80)  return { label: 'Poor',       color: '#F97316', score: 40  }
  if (europeanAqi <= 100) return { label: 'Very Poor',  color: '#EF4444', score: 20  }
  return                         { label: 'Hazardous',  color: '#991B1B', score: 0   }
}

// ── Pollen category labeling ──────────────────────────────────────────────────
export function getPollenLabel(grains) {
  // grains/m³ scale
  if (grains === null || grains === undefined) return { label: 'N/A', color: '#737686', level: 0 }
  if (grains < 10)  return { label: 'Low',       color: '#10B981', level: 1 }
  if (grains < 30)  return { label: 'Moderate',  color: '#F59E0B', level: 2 }
  if (grains < 80)  return { label: 'High',      color: '#F97316', level: 3 }
  return                   { label: 'Very High', color: '#EF4444', level: 4 }
}

// ── UV Index category labeling ────────────────────────────────────────────────
export function getUvLabel(uvIndex) {
  if (uvIndex === null || uvIndex === undefined) return { label: 'N/A', color: '#737686' }
  if (uvIndex < 3)  return { label: 'Low',       color: '#10B981' }
  if (uvIndex < 6)  return { label: 'Moderate',  color: '#F59E0B' }
  if (uvIndex < 8)  return { label: 'High',      color: '#F97316' }
  if (uvIndex < 11) return { label: 'Very High', color: '#EF4444' }
  return                   { label: 'Extreme',   color: '#991B1B' }
}

// ── Fetch all environmental data for a location ────────────────────────────────
/**
 * Fetches AQI, UV, and Pollen for a given coordinate.
 * Returns a normalized envData object — never throws, always returns safe defaults.
 *
 * @param {number} lat
 * @param {number} lng
 * @returns {Promise<Object>} envData
 */
export async function fetchEnvironmentalData(lat, lng) {
  const key = _cacheKey(lat, lng)
  const cached = _readCache(key)
  if (cached) return cached

  const defaults = {
    aqi: null, aqiLabel: 'N/A', aqiColor: '#737686', aqiScore: 50,
    pm25: null, pm10: null, no2: null,
    uvIndex: null, uvLabel: 'N/A', uvColor: '#737686',
    pollenGrass: null, pollenBirch: null, pollenMugwort: null,
    pollenTotal: null, pollenLabel: 'N/A', pollenColor: '#737686', pollenLevel: 0,
    fetchedAt: Date.now(),
    error: false,
  }

  try {
    // Parallel fetch — AQI/Pollen + UV both from Open-Meteo free tier
    const [aqRes, uvRes] = await Promise.allSettled([
      fetch(
        `${AIR_QUALITY_BASE}?latitude=${lat}&longitude=${lng}` +
        `&current=european_aqi,pm2_5,pm10,nitrogen_dioxide` +
        `&hourly=grass_pollen,birch_pollen,mugwort_pollen` +
        `&timezone=auto&forecast_days=1`
      ),
      fetch(
        `${FORECAST_BASE}?latitude=${lat}&longitude=${lng}` +
        `&current=uv_index&daily=uv_index_max` +
        `&timezone=auto&forecast_days=1`
      ),
    ])

    let envData = { ...defaults }

    // ── Parse Air Quality ────────────────────────────────────────────────────
    if (aqRes.status === 'fulfilled' && aqRes.value.ok) {
      const aqJson = await aqRes.value.json()
      const curr   = aqJson.current || {}
      const hourly = aqJson.hourly  || {}

      const europeanAqi = curr.european_aqi ?? null
      const aqiInfo     = getAqiLabel(europeanAqi)

      // Take the first hourly pollen value (current hour estimate)
      const pollenGrass   = Array.isArray(hourly.grass_pollen)   ? (hourly.grass_pollen[0]   ?? null) : null
      const pollenBirch   = Array.isArray(hourly.birch_pollen)   ? (hourly.birch_pollen[0]   ?? null) : null
      const pollenMugwort = Array.isArray(hourly.mugwort_pollen) ? (hourly.mugwort_pollen[0] ?? null) : null

      // Composite pollen: max of available types
      const pollenVals  = [pollenGrass, pollenBirch, pollenMugwort].filter(v => v !== null)
      const pollenTotal = pollenVals.length ? Math.max(...pollenVals) : null
      const pollenInfo  = getPollenLabel(pollenTotal)

      envData = {
        ...envData,
        aqi:          europeanAqi,
        aqiLabel:     aqiInfo.label,
        aqiColor:     aqiInfo.color,
        aqiScore:     aqiInfo.score,
        pm25:         curr.pm2_5 ?? null,
        pm10:         curr.pm10  ?? null,
        no2:          curr.nitrogen_dioxide ?? null,
        pollenGrass,
        pollenBirch,
        pollenMugwort,
        pollenTotal,
        pollenLabel:  pollenInfo.label,
        pollenColor:  pollenInfo.color,
        pollenLevel:  pollenInfo.level,
      }
    }

    // ── Parse UV Index ────────────────────────────────────────────────────────
    if (uvRes.status === 'fulfilled' && uvRes.value.ok) {
      const uvJson  = await uvRes.value.json()
      const uvIndex = uvJson.current?.uv_index ?? null
      const uvInfo  = getUvLabel(uvIndex)

      envData = {
        ...envData,
        uvIndex,
        uvLabel: uvInfo.label,
        uvColor: uvInfo.color,
      }
    }

    _writeCache(key, envData)
    return envData

  } catch (err) {
    console.warn('[EnvironmentalService] Fetch failed, using defaults:', err.message)
    const errorData = { ...defaults, error: true }
    return errorData
  }
}

// ── Determine if user has respiratory/allergy/skin conditions ─────────────────
/**
 * Analyzes user Medical Profile to determine which environmental factors matter.
 * Returns weights object used by route scoring engine.
 *
 * @param {Object|null} medicalProfile
 * @returns {{ aqiWeight, pollenWeight, uvWeight, isRespiratory, isAllergic, isPhotosensitive, isCardiac, isVulnerable }}
 */
export function getEnvironmentalWeights(medicalProfile) {
  const conditions = [
    ...(Array.isArray(medicalProfile?.conditions) ? medicalProfile.conditions : []),
    medicalProfile?.otherCondition || '',
  ].join(' ').toLowerCase()

  const allergies = [
    ...(Array.isArray(medicalProfile?.allergies) ? medicalProfile.allergies : []),
    medicalProfile?.otherAllergy || '',
  ].join(' ').toLowerCase()

  // Respiratory sensitivity detection
  const isRespiratory = /asthma|copd|respiratory|breathing|lung|bronch|emphysema|pulmonary/i.test(conditions)

  // Allergy / hay fever detection
  const isAllergic = /allerg|hay fever|rhinitis|pollen|dust|sinusit/i.test(conditions + ' ' + allergies)

  // Photosensitivity detection
  const isPhotosensitive = /photosensit|lupus|skin disorder|vitiligo|xeroderma|sun sensitiv|uv sensitiv/i.test(conditions)

  // Cardiac sensitivity detection
  const isCardiac = /heart|cardiac|coronary|hypertension|angina|arrhythmia/i.test(conditions)

  // Vulnerable populations
  const isVulnerable = /elderly|senior|child|pediatric|pregnan/i.test(conditions)

  return {
    aqiWeight:    isRespiratory ? 25 : isCardiac ? 15 : 5,
    pollenWeight: isAllergic ? 15 : 2,
    uvWeight:     isPhotosensitive ? 10 : 1,
    isRespiratory,
    isAllergic,
    isPhotosensitive,
    isCardiac,
    isVulnerable,
  }
}

// ── Compute route penalty from environmental data ─────────────────────────────
/**
 * Computes a total environmental penalty (0-5 pts max) for a route.
 * Acts as a secondary modifier calibrated dynamically to the user's medical profile.
 *
 * Scoring Rules:
 *  - Average user:
 *      Good AQI (0-20)     → 0 pts
 *      Fair/Mod (21-60)    → 1 pt
 *      Poor (61-80)        → 2 pts
 *      Very Poor (>80)     → 2-3 pts
 *  - Respiratory user (Asthma/COPD):
 *      Good AQI            → 0 pts
 *      Fair/Mod            → 1 pt
 *      Poor                → 2 pts
 *      Very Poor / Severe  → 3-4 pts
 *  - Compound condition:
 *      High AQI (Poor+) + High Pollen → +1 extra compounding point
 *  - UV (photosensitive user only)     → 1 pt
 *  - STRICT TOTAL CAP: 5 points max.
 *
 * @param {Object} envData    - Result from fetchEnvironmentalData()
 * @param {Object} weights    - Result from getEnvironmentalWeights()
 * @returns {{ penalty, breakdown }}
 */
export function computeEnvironmentalPenalty(envData, weights) {
  if (!envData || envData.error) return { penalty: 0, breakdown: {} }

  const MAX_ENV_PENALTY = 5 // Hard cap on total
  const now = new Date()
  const hour = now.getHours()
  const isDaytime = hour >= 7 && hour <= 19

  // 1. AQI penalty — PROPORTIONAL to severity, calibrated per medical profile
  let aqiPenalty = 0
  if (envData.aqi !== null && envData.aqi !== undefined) {
    const aqi = envData.aqi
    if (weights.isRespiratory) {
      // Asthma / COPD: meaningful but never huge
      // Good(0-20):0pts, Fair(21-40):1pt, Moderate(41-60):2pts, Poor(61-80):3pts, Very Poor/Haz(>80):4pts
      if (aqi <= 20)       aqiPenalty = 0
      else if (aqi <= 40)  aqiPenalty = 1
      else if (aqi <= 60)  aqiPenalty = 2
      else if (aqi <= 80)  aqiPenalty = 3
      else                 aqiPenalty = 4
    } else if (weights.isCardiac) {
      // Heart disease: moderate concern about air quality
      if (aqi <= 40)      aqiPenalty = 0
      else if (aqi <= 70) aqiPenalty = 1
      else                aqiPenalty = 2
    } else {
      // Normal healthy user: no deduction unless air is actively dangerous
      if (aqi <= 80)      aqiPenalty = 0
      else                aqiPenalty = 1
    }
  }

  // 2. Pollen penalty — only matters for allergy/asthma users
  let pollenPenalty = 0
  if (envData.pollenLevel > 0 && isDaytime) {
    if (weights.isAllergic || weights.isRespiratory) {
      // Allergic: Low(1):0, Moderate(2):0, High(3):1, Very High(4):2
      if (envData.pollenLevel >= 4)      pollenPenalty = 2
      else if (envData.pollenLevel >= 3) pollenPenalty = 1
    }
    // Non-allergic users: no pollen penalty
  }

  // 3. Compounding: High AQI + High Pollen together = +1 extra caution point for at-risk users
  let compoundPenalty = 0
  const isHighAqi = envData.aqi !== null && envData.aqi > 60
  const isHighPollen = envData.pollenLevel >= 3
  if (isHighAqi && isHighPollen && (weights.isRespiratory || weights.isAllergic)) {
    compoundPenalty = 1
  }

  // 4. UV penalty — only for photosensitive users, only during daylight
  let uvPenalty = 0
  if (weights.isPhotosensitive && isDaytime && envData.uvIndex !== null && envData.uvIndex >= 6) {
    uvPenalty = 1
  } else if (!weights.isPhotosensitive && isDaytime && envData.uvIndex !== null && envData.uvIndex >= 11) {
    uvPenalty = 0  // No penalty for normals — UV is a background factor
  }

  // 5. Night-time crime amplification
  const isNighttime = !isDaytime
  
  const rawTotal = aqiPenalty + pollenPenalty + compoundPenalty + uvPenalty
  const total = Math.min(rawTotal, MAX_ENV_PENALTY)

  return {
    penalty: total,
    breakdown: {
      aqiPenalty,
      pollenPenalty,
      compoundPenalty,
      uvPenalty,
      isRespiratory: !!weights.isRespiratory,
      isAllergic: !!weights.isAllergic,
      isPhotosensitive: !!weights.isPhotosensitive,
      isDaytime,
      isNighttime,
    },
  }
}

// ── Build explainability reasons from environmental data ──────────────────────
/**
 * Returns an array of human-readable environmental reason strings
 * for the "Why this score?" accordion.
 *
 * @param {Object} envData
 * @param {Object} weights
 * @returns {string[]}
 */
export function getEnvironmentalReasons(envData, weights) {
  if (!envData || envData.error) return []

  const reasons = []
  const now = new Date()
  const hour = now.getHours()
  const isDaytime = hour >= 7 && hour <= 19

  if (envData.aqi !== null) {
    if (weights.isRespiratory) {
      reasons.push(`AQI ${envData.aqi} — ${envData.aqiLabel} (Respiratory profile: elevated impact)`)
    } else if (weights.isCardiac) {
      reasons.push(`AQI ${envData.aqi} — ${envData.aqiLabel} (Cardiac profile: moderate impact)`)
    } else {
      reasons.push(`AQI ${envData.aqi} — ${envData.aqiLabel}`)
    }
  }

  const isHighAqi = envData.aqi !== null && envData.aqi > 60
  const isHighPollen = envData.pollenLevel >= 3
  if (isHighAqi && isHighPollen && (weights.isRespiratory || weights.isAllergic)) {
    reasons.push(`High AQI + Pollen combination — compounding risk (-1pt)`)
  } else if (envData.pollenTotal !== null && isDaytime) {
    if (weights.isAllergic || weights.isRespiratory) {
      reasons.push(`Pollen: ${envData.pollenLabel} (${Math.round(envData.pollenTotal)} grains/m³) — allergy/respiratory profile active`)
    } else {
      reasons.push(`Pollen: ${envData.pollenLabel}`)
    }
  }

  if (envData.uvIndex !== null && isDaytime) {
    if (weights.isPhotosensitive) {
      reasons.push(`UV Index ${envData.uvIndex} — ${envData.uvLabel} (UV-sensitive profile: -1pt)`)
    } else {
      reasons.push(`UV Index ${envData.uvIndex} — ${envData.uvLabel}`)
    }
  }

  if (!isDaytime) {
    reasons.push('Night-time: reduced visibility, crime risk elevated')
  }

  return reasons
}
