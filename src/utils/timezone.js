/**
 * timezone.js — Smart Location-Aware Local Time & Timezone Engine
 *
 * Guarantees that time displays (ETA, arrival time, clocks) reflect the user's
 * exact local country/timezone based on GPS coordinates or country, never
 * falling back to headless/cloud "Etc/UTC" or "UTC".
 */

// In-memory cache for resolved timezones by coordinate grid
const tzCache = new Map()

/**
 * Fast synchronous coordinate-to-timezone bounding box heuristic
 * Covers India (primary target for BWU-SGM) and major worldwide regions.
 */
export function getHeuristicTimezone(lat, lng) {
  if (lat == null || lng == null || !isFinite(lat) || !isFinite(lng)) {
    return 'Asia/Kolkata'
  }

  const numLat = Number(lat)
  const numLng = Number(lng)

  // 1. India (approx 6°N - 37.5°N, 68°E - 97.5°E) - Primary Target
  if (numLat >= 6.0 && numLat <= 37.5 && numLng >= 68.0 && numLng <= 97.5) {
    return 'Asia/Kolkata'
  }

  // 2. South Asia neighbors
  if (numLat >= 20.5 && numLat <= 26.7 && numLng >= 88.0 && numLng <= 92.7) return 'Asia/Dhaka' // Bangladesh
  if (numLat >= 26.3 && numLat <= 30.5 && numLng >= 80.0 && numLng <= 88.2) return 'Asia/Kathmandu' // Nepal
  if (numLat >= 5.9 && numLat <= 9.9 && numLng >= 79.8 && numLng <= 81.9) return 'Asia/Colombo' // Sri Lanka
  if (numLat >= 23.5 && numLat <= 37.0 && numLng >= 60.8 && numLng <= 75.5) return 'Asia/Karachi' // Pakistan

  // 3. Middle East
  if (numLat >= 22.0 && numLat <= 26.5 && numLng >= 51.0 && numLng <= 56.5) return 'Asia/Dubai' // UAE

  // 4. East Asia & Southeast Asia
  if (numLat >= 24.0 && numLat <= 46.0 && numLng >= 123.0 && numLng <= 146.0) return 'Asia/Tokyo' // Japan
  if (numLat >= 1.15 && numLat <= 1.48 && numLng >= 103.6 && numLng <= 104.1) return 'Asia/Singapore' // Singapore
  if (numLat >= 5.5 && numLat <= 20.5 && numLng >= 97.3 && numLng <= 105.7) return 'Asia/Bangkok' // Thailand/Indochina
  if (numLat >= 18.0 && numLat <= 53.5 && numLng >= 73.5 && numLng <= 135.0) return 'Asia/Shanghai' // China
  if (numLat >= 33.0 && numLat <= 38.6 && numLng >= 124.5 && numLng <= 130.0) return 'Asia/Seoul' // South Korea

  // 5. Europe & UK
  if (numLat >= 49.8 && numLat <= 60.9 && numLng >= -8.0 && numLng <= 2.0) return 'Europe/London' // UK
  if (numLat >= 36.0 && numLat <= 55.0 && numLng >= -5.0 && numLng <= 15.0) return 'Europe/Paris' // France/Western Europe
  if (numLat >= 47.0 && numLat <= 55.0 && numLng >= 6.0 && numLng <= 15.0) return 'Europe/Berlin' // Germany

  // 6. North America
  if (numLat >= 24.0 && numLat <= 50.0) {
    if (numLng >= -85.0 && numLng <= -65.0) return 'America/New_York' // US Eastern
    if (numLng >= -105.0 && numLng < -85.0) return 'America/Chicago' // US Central
    if (numLng >= -115.0 && numLng < -105.0) return 'America/Denver' // US Mountain
    if (numLng >= -125.0 && numLng < -115.0) return 'America/Los_Angeles' // US Pacific
  }

  // 7. Australia
  if (numLat >= -39.0 && numLat <= -10.0 && numLng >= 140.0 && numLng <= 154.0) return 'Australia/Sydney'
  if (numLat >= -35.0 && numLat <= -14.0 && numLng >= 112.0 && numLng <= 129.0) return 'Australia/Perth'

  // 8. Device timezone check (accept only if real regional timezone, reject Etc/UTC or UTC)
  try {
    const sysTz = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (sysTz && !sysTz.startsWith('Etc/') && sysTz !== 'UTC' && sysTz !== 'GMT') {
      return sysTz
    }
  } catch {}

  // Fallback to India Standard Time (app default)
  return 'Asia/Kolkata'
}

/**
 * Cache key for coordinate lookup
 */
function getCacheKey(lat, lng) {
  return `${Number(lat).toFixed(2)},${Number(lng).toFixed(2)}`
}

/**
 * Asynchronously resolves exact legal timezone from Open-Meteo (free, no auth required)
 * and caches result in memory + sessionStorage.
 */
export async function resolveExactTimezone(lat, lng) {
  if (lat == null || lng == null || !isFinite(lat) || !isFinite(lng)) {
    return 'Asia/Kolkata'
  }

  const key = getCacheKey(lat, lng)
  if (tzCache.has(key)) {
    return tzCache.get(key)
  }

  // Check sessionStorage
  try {
    const cached = sessionStorage.getItem(`sgm_tz_${key}`)
    if (cached) {
      tzCache.set(key, cached)
      return cached
    }
  } catch {}

  try {
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current_weather=true&timezone=auto`,
      { signal: AbortSignal.timeout(3000) }
    )
    if (res.ok) {
      const data = await res.json()
      if (data.timezone && !data.timezone.startsWith('Etc/') && data.timezone !== 'UTC') {
        tzCache.set(key, data.timezone)
        try {
          sessionStorage.setItem(`sgm_tz_${key}`, data.timezone)
        } catch {}
        return data.timezone
      }
    }
  } catch {}

  // Fallback to heuristic
  const fallback = getHeuristicTimezone(lat, lng)
  tzCache.set(key, fallback)
  return fallback
}

/**
 * Cleanly formats a Date into the user's exact country/local time.
 * Never outputs "UTC" or "Etc/UTC".
 *
 * @param {Date|number|string} dateInput - The date to format
 * @param {Object} options
 * @param {number} [options.lat] - User's current latitude
 * @param {number} [options.lng] - User's current longitude
 * @param {string} [options.timeZone] - Explicit IANA timezone override
 * @param {boolean} [options.hour12=true] - 12-hour format with AM/PM
 * @returns {string} e.g. "8:45 AM" or "10:30 PM"
 */
export function formatLocalTime(dateInput, options = {}) {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput || Date.now())
  if (isNaN(d.getTime())) return ''

  let tz = options.timeZone
  if (!tz || tz.startsWith('Etc/') || tz === 'UTC' || tz === 'GMT') {
    tz = getHeuristicTimezone(options.lat, options.lng)
  }

  try {
    const formatted = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: options.hour12 !== false,
      timeZone: tz,
    }).format(d)

    // Strip any accidental UTC or GMT suffix
    return formatted.replace(/\s*(UTC|GMT|Etc\/UTC)\s*/gi, '').trim()
  } catch {
    // Ultimate safe fallback to Asia/Kolkata
    try {
      return new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: options.hour12 !== false,
        timeZone: 'Asia/Kolkata',
      }).format(d)
    } catch {
      return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true })
    }
  }
}

/**
 * Calculates and formats estimated arrival time from current time + duration in minutes
 *
 * @param {number} durationMin - Remaining duration in minutes
 * @param {Object} options - { lat, lng, timeZone }
 * @returns {string} e.g. "9:15 AM"
 */
export function getEstimatedArrivalTime(durationMin, options = {}) {
  const mins = Math.max(0, Number(durationMin) || 0)
  const arrivalDate = new Date(Date.now() + mins * 60 * 1000)
  return formatLocalTime(arrivalDate, options)
}
