/**
 * src/services/mlService.js
 *
 * Production Client API for communicating with the Python FastAPI Geospatial ML engine.
 *
 * v3.0 Changes:
 *   - Fetches live Open-Meteo weather (WMO code + precipitation) before each ML call
 *   - Passes air_quality PM2.5 from environmentalService cache when available
 *   - Improved lighting derivation: time-of-day aware (dark/poorly_lit/well_lit/daylight)
 *   - Exposed fetchLiveWeatherForML() for direct use from RouteSelectionPage
 *
 * Supports:
 *   1. Production Render URL configured via `VITE_ML_API_URL`
 *   2. Vite local proxy `/api/ml` during local development
 *   3. Direct localhost:8000 fallback
 *   4. High-performance batch route evaluation via `/predict/routes`
 */

const ENV_ML_URL    = (import.meta.env.VITE_ML_API_URL || '').replace(/\/+$/, '')
const ML_DIRECT_BASE = 'http://127.0.0.1:8000'
const ML_PROXY_BASE  = '/api/ml'

// Dynamically caches last known working base URL
let cachedActiveBase = null

// ── Live weather cache (in-memory, 10-min TTL per ~1km grid) ─────────────────
const _wxCache    = new Map()
const WX_TTL_MS   = 10 * 60 * 1000  // 10 minutes

function _wxCacheKey(lat, lng) {
  return `wx_${Math.round(lat * 100)}_${Math.round(lng * 100)}`
}

/**
 * Fetches live weather from Open-Meteo for use in ML payload.
 * Returns WMO weather_code, temperature, visibility, precipitation — no API key required.
 * Caches per ~1km grid for 10 minutes to avoid redundant calls.
 *
 * Per REALTIME_SAFETY_DATA_INTEGRATION.md §6.1
 *
 * @param {number} lat
 * @param {number} lng
 * @returns {Promise<object>} weather context for ML payload
 */
export async function fetchLiveWeatherForML(lat, lng) {
  const key    = _wxCacheKey(lat, lng)
  const cached = _wxCache.get(key)
  if (cached && (Date.now() - cached.ts) < WX_TTL_MS) {
    return cached.data
  }

  try {
    const url = (
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}` +
      `&current=temperature_2m,relative_humidity_2m,precipitation,rain,weather_code,visibility` +
      `&timezone=Asia%2FKolkata`
    )
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) })
    if (res.ok) {
      const json    = await res.json()
      const current = json.current || {}
      const data = {
        weather_code:  current.weather_code  ?? 0,
        temperature:   current.temperature_2m ?? 26.0,
        visibility:    current.visibility     ?? 10000.0,
        precipitation: current.precipitation  ?? 0.0,
        rain:          current.rain           ?? 0.0,
        humidity:      current.relative_humidity_2m ?? 65.0,
      }
      _wxCache.set(key, { data, ts: Date.now() })
      return data
    }
  } catch {
    // Silently fall back to safe defaults
  }

  // Safe defaults — server will also auto-fetch if not supplied
  return {
    weather_code:  0,
    temperature:   26.0,
    visibility:    10000.0,
    precipitation: 0.0,
    rain:          0.0,
    humidity:      65.0,
  }
}

/**
 * Determines effective lighting condition from time of day.
 * @param {number} [hour]
 * @returns {string}
 */
function deriveLighting(hour) {
  const h = hour !== undefined ? hour : new Date().getHours()
  if (h >= 6 && h < 8)   return 'poorly_lit'   // Dawn
  if (h >= 8 && h < 18)  return 'daylight'      // Day
  if (h >= 18 && h < 20) return 'well_lit'      // Dusk — still lit
  return 'dark'                                  // Night
}

/**
 * Returns prioritized list of candidate ML base URLs to try.
 */
function getCandidateBases() {
  const bases = []
  if (cachedActiveBase) bases.push(cachedActiveBase)
  if (ENV_ML_URL && !bases.includes(ENV_ML_URL)) bases.push(ENV_ML_URL)

  if (import.meta.env.DEV) {
    if (!bases.includes(ML_PROXY_BASE))  bases.push(ML_PROXY_BASE)
    if (!bases.includes(ML_DIRECT_BASE)) bases.push(ML_DIRECT_BASE)
  } else {
    if (!bases.includes(ML_PROXY_BASE)) bases.push(ML_PROXY_BASE)
  }
  return bases
}

/**
 * Checks whether the Python FastAPI service is active.
 * @returns {Promise<{ online: boolean, data?: object, endpoint?: string, error?: string }>}
 */
export async function checkMLHealth() {
  const bases = getCandidateBases()

  for (const base of bases) {
    try {
      const res = await fetch(`${base}/health`, { signal: AbortSignal.timeout(3000) })
      if (res.ok) {
        const data = await res.json()
        cachedActiveBase = base
        return { online: true, data, endpoint: base }
      }
    } catch {
      // try next base
    }
  }

  return { online: false, error: 'ML service offline or unreachable' }
}

/**
 * Evaluates route safety for a single route.
 * Fetches live Open-Meteo weather before the ML call if not provided.
 *
 * @param {object} params
 * @param {Array<[number, number]>|Array<{lat: number, lng: number}>} params.waypoints
 * @param {number}  [params.hour]
 * @param {number}  [params.dayOfWeek]
 * @param {object}  [params.weather]       — If provided, skips live fetch
 * @param {object}  [params.airQuality]    — { pm25, no2, station }
 * @param {string}  [params.lighting]
 * @param {string}  [params.timestamp]
 * @returns {Promise<object>}
 */
export async function evaluateRouteSafety({
  waypoints,
  hour,
  dayOfWeek,
  weather,
  airQuality,
  lighting,
  timestamp,
}) {
  const now    = new Date()
  const h      = hour      !== undefined ? hour      : now.getHours()
  const dow    = dayOfWeek !== undefined ? dayOfWeek : now.getDay()
  const lit    = lighting  || deriveLighting(h)

  // ── Live weather fetch if not supplied ─────────────────────────────────────
  let liveWeather = weather
  if (!liveWeather || liveWeather.weather_code === undefined) {
    // Use midpoint coordinate for the weather query
    const midWp = waypoints[Math.floor(waypoints.length / 2)] || waypoints[0]
    if (midWp) {
      const midLat = Array.isArray(midWp) ? midWp[0] : midWp.lat
      const midLng = Array.isArray(midWp) ? midWp[1] : midWp.lng
      if (isFinite(midLat) && isFinite(midLng)) {
        liveWeather = await fetchLiveWeatherForML(midLat, midLng)
      }
    }
    if (!liveWeather) {
      liveWeather = { weather_code: 0, temperature: 26, visibility: 10000, precipitation: 0 }
    }
  }

  const payload = {
    waypoints,
    hour:         h,
    day_of_week:  dow,
    weather:      liveWeather,
    air_quality:  airQuality || null,
    lighting:     lit,
    timestamp:    timestamp || now.toISOString(),
    auto_enrich:  true,   // server will also fetch AQI & OSM infra
  }

  const bases = getCandidateBases()
  let lastError = null

  for (const base of bases) {
    try {
      const res = await fetch(`${base}/predict/route`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
        signal:  AbortSignal.timeout(10000),
      })

      if (res.ok) {
        cachedActiveBase = base
        return await res.json()
      }
      const errBody = await res.json().catch(() => ({ detail: res.statusText }))
      lastError = new Error(errBody.detail || `ML Error ${res.status}`)
    } catch (err) {
      lastError = err
    }
  }

  throw lastError || new Error('Failed to reach ML service on all endpoints.')
}

/**
 * High-performance batch evaluation for multiple candidate routes.
 * Fetches live weather once for the shared midpoint, then passes to all routes.
 *
 * @param {object} params
 * @param {Array<object>} params.routes       — [{ id, name, geometry, trafficLevel }]
 * @param {number}  [params.hour]
 * @param {number}  [params.dayOfWeek]
 * @param {object}  [params.weather]          — Pre-fetched weather (skips live fetch)
 * @param {object}  [params.airQuality]       — { pm25, no2 } from environmentalService
 * @param {string}  [params.lighting]
 * @param {string}  [params.timestamp]
 * @returns {Promise<{ success: boolean, routes: Array<object>, error?: string }>}
 */
export async function evaluateMultipleRoutes({
  routes,
  hour,
  dayOfWeek,
  weather,
  airQuality,
  lighting,
  timestamp,
}) {
  if (!routes || !routes.length) {
    return { success: true, routes: [] }
  }

  const now = new Date()
  const h   = hour      !== undefined ? hour      : now.getHours()
  const dow = dayOfWeek !== undefined ? dayOfWeek : now.getDay()
  const lit = lighting  || deriveLighting(h)

  // ── Fetch live weather once for all routes (shared midpoint) ───────────────
  let liveWeather = weather
  if (!liveWeather || liveWeather.weather_code === undefined) {
    const firstRoute = routes[0]
    const geom       = firstRoute?.geometry || []
    const midWp      = geom[Math.floor(geom.length / 2)] || geom[0]
    if (midWp && isFinite(Array.isArray(midWp) ? midWp[0] : midWp.lat)) {
      const midLat = Array.isArray(midWp) ? midWp[0] : midWp.lat
      const midLng = Array.isArray(midWp) ? midWp[1] : midWp.lng
      try {
        liveWeather = await fetchLiveWeatherForML(midLat, midLng)
        console.info(
          `[ML] Live weather fetched: WMO=${liveWeather.weather_code}, ` +
          `T=${liveWeather.temperature}°C, vis=${(liveWeather.visibility / 1000).toFixed(1)}km, ` +
          `precip=${liveWeather.precipitation}mm`
        )
      } catch {
        liveWeather = { weather_code: 0, temperature: 26, visibility: 10000, precipitation: 0 }
      }
    }
  }
  if (!liveWeather) {
    liveWeather = { weather_code: 0, temperature: 26, visibility: 10000, precipitation: 0 }
  }

  const payload = {
    routes: routes.map((r, idx) => ({
      id:              r.index !== undefined ? r.index : idx,
      name:            r.viaRoads || r.name || `Route ${idx + 1}`,
      waypoints:       r.geometry || [],
      trafficLevel:    r.trafficLevel || 'clear',
      distanceMeters:  r.distance || 0,
      durationSeconds: r.duration || 0,
    })),
    hour:         h,
    day_of_week:  dow,
    weather:      liveWeather,
    air_quality:  airQuality || null,
    lighting:     lit,
    timestamp:    timestamp || now.toISOString(),
    auto_enrich:  true,  // server also fetches AQI + OSM infra
  }

  const bases = getCandidateBases()
  let lastError = null

  // ── 1. Try batch endpoint /predict/routes ──────────────────────────────────
  for (const base of bases) {
    try {
      const res = await fetch(`${base}/predict/routes`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
        signal:  AbortSignal.timeout(12000),
      })

      if (res.ok) {
        const data = await res.json()
        cachedActiveBase = base
        console.info(
          `[ML] Batch evaluated ${data.total_routes_evaluated} routes via ${base}. ` +
          `AQI source: ${data.live_data_sources?.aqi_source || 'unknown'}`
        )
        return {
          success:     true,
          routes:      data.routes || [],
          endpoint:    base,
          liveWeather: liveWeather,
        }
      }
      const errBody = await res.json().catch(() => ({ detail: res.statusText }))
      lastError = new Error(errBody.detail || `ML Error ${res.status}`)
    } catch (err) {
      lastError = err
    }
  }

  // ── 2. Fallback: evaluate routes individually ──────────────────────────────
  try {
    const singleResults = await Promise.all(
      routes.map(async (r, idx) => {
        try {
          const evalRes = await evaluateRouteSafety({
            waypoints:   r.geometry || [],
            hour:        h,
            dayOfWeek:   dow,
            weather:     liveWeather,
            airQuality,
            lighting:    lit,
            timestamp,
          })
          evalRes.route_id = r.index !== undefined ? r.index : idx
          return evalRes
        } catch {
          return null
        }
      })
    )

    const validResults = singleResults.filter(Boolean)
    if (validResults.length > 0) {
      return { success: true, routes: validResults, liveWeather }
    }
  } catch (err) {
    lastError = err
  }

  return {
    success: false,
    routes:  [],
    error:   lastError?.message || 'ML service unreachable',
  }
}

/**
 * Evaluates safety for a single coordinate point.
 * Includes live weather enrichment.
 */
export async function evaluatePointSafety({
  lat,
  lng,
  hour,
  dayOfWeek,
  weather,
  airQuality,
  lighting,
}) {
  const h   = hour      !== undefined ? hour      : new Date().getHours()
  const dow = dayOfWeek !== undefined ? dayOfWeek : new Date().getDay()
  const lit = lighting  || deriveLighting(h)

  let liveWeather = weather
  if (!liveWeather || liveWeather.weather_code === undefined) {
    liveWeather = await fetchLiveWeatherForML(lat, lng)
  }

  const payload = {
    lat,
    lng,
    hour:        h,
    day_of_week: dow,
    weather:     liveWeather || { weather_code: 0, temperature: 26, visibility: 10000 },
    air_quality: airQuality || null,
    lighting:    lit,
    auto_enrich: true,
  }

  const bases = getCandidateBases()
  for (const base of bases) {
    try {
      const res = await fetch(`${base}/predict/point`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
        signal:  AbortSignal.timeout(6000),
      })
      if (res.ok) {
        cachedActiveBase = base
        return await res.json()
      }
    } catch {}
  }
  return null
}

/**
 * Fetches model metadata and feature importance from the ML service.
 */
export async function fetchModelMetadata() {
  const bases = getCandidateBases()
  for (const base of bases) {
    try {
      const res = await fetch(`${base}/model/metadata`, { signal: AbortSignal.timeout(3000) })
      if (res.ok) {
        cachedActiveBase = base
        return await res.json()
      }
    } catch {}
  }
  return null
}
