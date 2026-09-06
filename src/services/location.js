// Geolocation service — Multi-tiered resilient geolocation with mobile GNSS/WiFi/Cell/IP fallback
import { DEFAULT_BWU_CENTER } from '../constants'

const LAST_KNOWN_KEY = 'sg_last_known_location'

/**
 * Persist last verified real user coordinates to localStorage.
 */
export function saveLastKnownLocation(loc) {
  if (!loc || !isFinite(loc.lat) || !isFinite(loc.lng)) return
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem(LAST_KNOWN_KEY, JSON.stringify({
        lat: loc.lat,
        lng: loc.lng,
        accuracy: loc.accuracy || 50,
        timestamp: Date.now(),
        simulated: false,
      }))
    }
  } catch {
    // Ignore storage quota or security errors
  }
}

/**
 * Retrieve last verified real coordinates.
 */
export function getLastKnownLocation() {
  try {
    if (typeof window === 'undefined') return null
    const item = localStorage.getItem(LAST_KNOWN_KEY)
    if (!item) return null
    const parsed = JSON.parse(item)
    if (parsed && isFinite(parsed.lat) && isFinite(parsed.lng)) {
      return parsed
    }
  } catch (_) {}
  return null
}

/**
 * Get initial location before GPS locks:
 * 1. Last verified location from previous session
 * 2. Brainware University, Barasat (Default app anchor)
 */
export function getInitialLocation() {
  const last = getLastKnownLocation()
  if (last) return last
  return {
    lat: DEFAULT_BWU_CENTER[0],
    lng: DEFAULT_BWU_CENTER[1],
    simulated: true,
  }
}

/**
 * Check if the browser currently has location permission granted.
 * Avoids showing demo mode on reload if the user already allowed location in their mobile browser.
 */
export async function checkBrowserLocationPermission() {
  if (typeof window === 'undefined' || !navigator.permissions || !navigator.permissions.query) {
    return 'unsupported'
  }
  try {
    const status = await navigator.permissions.query({ name: 'geolocation' })
    return status.state // 'granted' | 'prompt' | 'denied'
  } catch {
    return 'unsupported'
  }
}

/**
 * Fast IP-based geolocation fallback for when GPS is unavailable,
 * slow, or permission is restricted. Provides city-level accuracy.
 */
export async function fetchIpLocation() {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 3500)

  try {
    // Try freeipapi.com first (fast, HTTPS, CORS-friendly)
    const res = await fetch('https://freeipapi.com/api/json', {
      signal: controller.signal,
    })
    clearTimeout(timer)
    if (res.ok) {
      const data = await res.json()
      if (data && isFinite(data.latitude) && isFinite(data.longitude)) {
        return {
          lat: data.latitude,
          lng: data.longitude,
          accuracy: 5000,
          simulated: false,
          isIpFallback: true,
          cityName: data.cityName || '',
        }
      }
    }
  } catch {
    clearTimeout(timer)
  }

  // Backup IP service: ipapi.co
  try {
    const res2 = await fetch('https://ipapi.co/json/', { timeout: 3000 })
    if (res2.ok) {
      const d = await res2.json()
      if (d && isFinite(d.latitude) && isFinite(d.longitude)) {
        return {
          lat: d.latitude,
          lng: d.longitude,
          accuracy: 5000,
          simulated: false,
          isIpFallback: true,
          cityName: d.city || '',
        }
      }
    }
  } catch (_) {}

  return null
}

/**
 * Returns current GPS position using a resilient multi-tiered strategy:
 *  Tier 1: High accuracy GPS with 30s cache allowed (rapid response, avoids cold GNSS stall on mobile)
 *  Tier 2: Low-accuracy Cell/WiFi network triangulation (if Tier 1 times out indoors)
 *  Tier 3: IP Geolocation (if GPS is denied or fails completely)
 *  Tier 4: Last known location or DEFAULT_BWU_CENTER
 */
export function getCurrentLocation() {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      console.warn('[GPS] Geolocation API not supported — checking fallback')
      fetchIpLocation().then((ipLoc) => {
        if (ipLoc) resolve(ipLoc)
        else resolve(getInitialLocation())
      })
      return
    }

    // Helper to query geolocation with specific options
    const queryCoords = (opts) =>
      new Promise((res, rej) => {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const { latitude: lat, longitude: lng, accuracy } = pos.coords
            saveLastKnownLocation({ lat, lng, accuracy })
            res({ lat, lng, accuracy, simulated: false })
          },
          (err) => rej(err),
          opts
        )
      })

    // ── Tier 1: Try High-Accuracy GPS (allows 30s cache so mobile doesn't stall) ──
    queryCoords({ enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 })
      .then(resolve)
      .catch(async (err) => {
        console.warn('[GPS] High accuracy attempt failed/timed out:', err.code, err.message)

        // If user explicitly denied permission (code 1), don't harass with more prompts
        if (err.code === 1) {
          const ipLoc = await fetchIpLocation()
          if (ipLoc) resolve(ipLoc)
          else resolve(getInitialLocation())
          return
        }

        // ── Tier 2: Try Low-Accuracy (WiFi/Cell network) fallback (fast indoors) ──
        try {
          const lowAccPos = await queryCoords({
            enableHighAccuracy: false,
            timeout: 7000,
            maximumAge: 60000,
          })
          resolve(lowAccPos)
        } catch (tier2Err) {
          console.warn('[GPS] Low accuracy network fallback failed:', tier2Err)

          // ── Tier 3: IP-Based Geolocation ──
          const ipLoc = await fetchIpLocation()
          if (ipLoc) {
            resolve(ipLoc)
          } else {
            // ── Tier 4: Last Known Location or Default ──
            resolve(getInitialLocation())
          }
        }
      })
  })
}

/**
 * Continuously watches for GPS updates with jump filtering.
 * Prevents coarse cell tower fixes (> 2000m) from overriding an established accurate fix.
 */
export function watchLocation(callback, onError) {
  if (typeof window === 'undefined' || !navigator.geolocation) {
    console.warn('[GPS] watchPosition not supported')
    return null
  }

  let bestAccuracy = Infinity
  let lastGoodFixTime = 0

  const id = navigator.geolocation.watchPosition(
    (pos) => {
      const { latitude: lat, longitude: lng, accuracy } = pos.coords
      const now = Date.now()

      // Coarse fix jump filter:
      // If we already have a high precision fix (< 100m) acquired recently (< 60s ago),
      // ignore random coarse cell tower jumps (> 2000m)
      if (bestAccuracy < 100 && accuracy > 2000 && (now - lastGoodFixTime < 60000)) {
        console.debug('[GPS] Ignoring coarse cell-tower jump:', accuracy, 'm')
        return
      }

      if (accuracy <= bestAccuracy || (now - lastGoodFixTime > 30000)) {
        bestAccuracy = accuracy
        lastGoodFixTime = now
      }

      saveLastKnownLocation({ lat, lng, accuracy })
      callback({ lat, lng, accuracy, simulated: false })
    },
    (err) => {
      console.warn('[GPS] watchPosition notice:', err.code, err.message)
      if (onError) onError(err)
    },
    {
      enableHighAccuracy: true,
      maximumAge: 5000,
      timeout: 20000,
    }
  )
  return id
}

export function clearLocationWatch(watchId) {
  if (watchId !== null && watchId !== undefined && typeof window !== 'undefined' && navigator.geolocation) {
    navigator.geolocation.clearWatch(watchId)
  }
}