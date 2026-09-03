/**
 * smsRedirect.js — SOS Native SMS Redirect Service
 *
 * Purpose:
 *   When SOS is triggered, automatically open the user's default SMS application
 *   with the recipient (first emergency contact) and a fully pre-filled message body.
 *   The user only needs to tap Send — the app never sends anything by itself.
 *
 * Works on:
 *   - Android mobile browsers (Chrome, Firefox, Samsung Internet)
 *   - iOS Safari (uses & separator instead of ?)
 *   - PWA installs on mobile
 *
 * Does NOT work on:
 *   - Desktop browsers (no SMS app present)
 *   - In those cases, the function returns a status object describing why.
 *
 * This module has NO side effects. Call triggerSOSSmsRedirect() and check the
 * returned status to decide whether to show a fallback UI message.
 */

// ─── Detect whether the current platform likely supports sms: URIs ─────────────
function isMobilePlatform() {
  const ua = navigator.userAgent || ''
  return /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)
}

// ─── Detect iOS specifically (needs different sms: URI separator) ──────────────
function isIOS() {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent || '')
}

// ─── Normalise a phone number to E.164-ish format for sms: URIs ───────────────
function normalisePhone(raw) {
  // Strip spaces, dashes, parentheses
  let phone = raw.replace(/[\s\-()]/g, '')
  // Convert leading 0 to +91 (India default)
  if (phone.startsWith('0')) phone = '+91' + phone.slice(1)
  return phone
}

// ─── Build the full SMS body per spec ─────────────────────────────────────────
/**
 * @param {object} params
 * @param {number|null} params.lat           GPS latitude
 * @param {number|null} params.lng           GPS longitude
 * @param {string}      params.readableAddress  Reverse-geocoded address (may be empty)
 * @returns {string} Plain-text SMS body
 */
function buildSMSBody({ lat, lng, readableAddress }) {
  const hasCoords = lat !== null && lat !== undefined && lng !== null && lng !== undefined

  const mapsLink = hasCoords
    ? `https://maps.google.com/?q=${lat.toFixed(6)},${lng.toFixed(6)}`
    : 'Location unavailable'

  const addressLine = readableAddress
    ? readableAddress
    : hasCoords
      ? `${lat.toFixed(6)}, ${lng.toFixed(6)}`
      : 'Unable to determine address'

  const coordsSection = hasCoords
    ? `Coordinates:\nLatitude: ${lat.toFixed(6)}\nLongitude: ${lng.toFixed(6)}`
    : 'Coordinates unavailable'

  return [
    'Emergency Alert!',
    '',
    'I may be in danger and have activated the SOS feature.',
    '',
    'My current location:',
    addressLine,
    '',
    `Google Maps:\n${mapsLink}`,
    '',
    coordsSection,
    '',
    'Please contact me immediately and alert emergency services if you cannot reach me.',
    '',
    'Sent automatically from Safety Guardian.',
  ].join('\n')
}

// ─── Main exported function ────────────────────────────────────────────────────
/**
 * Attempts to open the device's native SMS app with a pre-filled SOS message.
 *
 * @param {object} params
 * @param {Array}  params.emergencyContacts  Array of contact objects from Zustand store
 * @param {object} params.userLocation       { lat, lng } from Zustand store
 * @param {string} params.readableAddress    Optional reverse-geocoded address string
 *
 * @returns {{ success: boolean, reason: string }}
 *   success  — true if the sms: URI was fired
 *   reason   — human-readable description of what happened
 */
export function triggerSOSSmsRedirect({ emergencyContacts = [], userLocation = null, readableAddress = '' }) {
  // 1. Guard: platform check
  if (!isMobilePlatform()) {
    return {
      success: false,
      reason: 'SMS redirection is only available on mobile devices. On desktop, please use WhatsApp or call your contact directly.',
    }
  }

  // 2. Guard: must have at least one contact with a phone number
  const contacts = emergencyContacts.filter(c => c.phone && c.phone.trim() !== '')
  if (contacts.length === 0) {
    return {
      success: false,
      reason: 'No emergency contact with a phone number saved. Please add a contact in your Profile.',
    }
  }

  // 3. Pick the primary (first) contact
  const primary = contacts[0]
  const phone = normalisePhone(primary.phone)

  // 4. Extract coordinates
  const lat = userLocation?.lat ?? null
  const lng = userLocation?.lng ?? null

  // 5. Build the full SMS body
  const body = buildSMSBody({ lat, lng, readableAddress })

  // 6. Compose the sms: URI
  //    iOS uses the & separator; Android/others use ?
  const separator = isIOS() ? '&' : '?'
  const smsURI = `sms:${phone}${separator}body=${encodeURIComponent(body)}`

  // 7. Fire — this opens the default SMS app
  try {
    window.location.href = smsURI
    return {
      success: true,
      reason: `SMS app opened for ${primary.name || phone}. Tap Send to alert your contact.`,
    }
  } catch (err) {
    console.error('[SmsRedirect] Failed to open SMS app:', err)
    return {
      success: false,
      reason: 'Could not open the SMS application. Please manually message your emergency contact.',
    }
  }
}
