// Geolocation service — production-grade, never falls back unless truly unavailable
import { DEFAULT_CENTER } from '../constants'

/**
 * Returns the current GPS position.
 * Rules:
 *  - maximumAge: 0   → always request a fresh fix, never use a stale cache
 *  - timeout: 15000  → give the device up to 15s to produce a real fix
 *  - enableHighAccuracy: true → use GPS chip, not cell/wifi triangulation
 * Only falls back to DEFAULT_CENTER when:
 *  - The browser does not support geolocation (very rare)
 *  - The user explicitly denied permission (PERMISSION_DENIED)
 *  - A genuine timeout occurred despite waiting the full 15 seconds
 */
export function getCurrentLocation() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      console.warn('[GPS] Geolocation API not supported — using fallback')
      resolve({ lat: DEFAULT_CENTER[0], lng: DEFAULT_CENTER[1], simulated: true })
      return
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng, accuracy } = pos.coords
        resolve({ lat, lng, accuracy, simulated: false })
      },
      (err) => {
        console.warn('[GPS] getCurrentPosition error:', err.code, err.message)
        resolve({ lat: DEFAULT_CENTER[0], lng: DEFAULT_CENTER[1], simulated: true })
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,       // CRITICAL: 0 = never use cached position
        timeout: 15000,      // wait up to 15s for a real fix
      }
    )
  })
}

/**
 * Continuously watches for GPS updates.
 * Calls callback({ lat, lng, accuracy, simulated }) on every update.
 * Returns the watchId so the caller can clear it on unmount.
 */
export function watchLocation(callback) {
  if (!navigator.geolocation) {
    console.warn('[GPS] watchPosition not supported')
    return null
  }

  const id = navigator.geolocation.watchPosition(
    (pos) => {
      const { latitude: lat, longitude: lng, accuracy } = pos.coords
      callback({ lat, lng, accuracy, simulated: false })
    },
    (err) => {
      console.warn('[GPS] watchPosition error:', err.code, err.message)
      // Do NOT call callback with fallback — let the last real position persist
    },
    {
      enableHighAccuracy: true,
      maximumAge: 0,     // always fresh
      timeout: 20000,
    }
  )
  return id
}

export function clearLocationWatch(watchId) {
  if (watchId !== null && watchId !== undefined && navigator.geolocation) {
    navigator.geolocation.clearWatch(watchId)
  }
}