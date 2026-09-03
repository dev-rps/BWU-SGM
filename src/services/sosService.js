/**
 * sosService.js — SOS Event Gateway Service
 *
 * Responsibilities:
 *  1. Write a complete SOS event to Firestore `sos_events` collection
 *  2. Provide status update helpers
 *  3. Subscribe to live status changes for UI updates
 *
 * The web app's ONLY job is to create the event.
 * All notifications (WhatsApp, SMS, calls) are handled by the
 * Company Emergency Gateway app running on the dedicated Android phone.
 */

import {
  collection,
  addDoc,
  doc,
  updateDoc,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from '../firebase/firebase'

// ─── SOS Event Status States ──────────────────────────────────────────────────
export const SOS_STATUS = {
  PENDING:           'pending',
  PROCESSING:        'processing',
  WHATSAPP_SENT:     'whatsapp_sent',
  SMS_SENT:          'sms_sent',
  CALL_ATTEMPTED:    'call_attempted',
  COMPLETED:         'completed',
  FAILED:            'failed',
}

// ─── Create a new SOS event ───────────────────────────────────────────────────
/**
 * Creates a new SOS event document in Firestore.
 * Includes ALL data the gateway needs — no extra reads required.
 *
 * @param {Object} params
 * @param {Object} params.user             Zustand user object
 * @param {Object} params.userLocation     { lat, lng, accuracy }
 * @param {Array}  params.emergencyContacts Array of contact objects
 * @param {string} params.emergencyType    e.g. 'general' | 'medical' | 'crime' | ...
 * @returns {Promise<{ id: string, ...event }>}
 */
export async function createSOSEvent({
  user,
  userLocation,
  emergencyContacts = [],
  emergencyType = 'general',
}) {
  const lat = userLocation?.lat ?? null
  const lng = userLocation?.lng ?? null
  const mapsLink =
    lat !== null && lng !== null
      ? `https://maps.google.com/?q=${lat.toFixed(6)},${lng.toFixed(6)}`
      : null

  // Build contacts array — sorted by priority, include only contacts with phone
  const contacts = emergencyContacts
    .filter(c => c.phone && c.phone.trim() !== '')
    .map((c, i) => ({
      name:         c.name         || 'Emergency Contact',
      phone:        c.phone.trim(),
      relationship: c.relationship || '',
      priority:     i + 1,          // 1 = primary, 2 = secondary, etc.
    }))

  const event = {
    // ── Identity ──────────────────────────────────────────────────────
    status:   SOS_STATUS.PENDING,
    userId:   user?.uid   || 'anonymous',
    userName: user?.name  || 'Unknown User',
    userPhone: user?.phone || '',
    userEmail: user?.email || '',

    // ── Location ──────────────────────────────────────────────────────
    latitude:  lat,
    longitude: lng,
    accuracy:  userLocation?.accuracy ?? null,
    mapsLink,

    // ── Emergency info ─────────────────────────────────────────────────
    emergencyType,
    contacts,        // Full list — gateway uses this directly

    // ── Timestamps ────────────────────────────────────────────────────
    createdAt:         serverTimestamp(),
    processedAt:       null,
    whatsappSentAt:    null,
    smsSentAt:         null,
    callAttemptedAt:   null,
    completedAt:       null,

    // ── Delivery tracking ──────────────────────────────────────────────
    whatsappStatus: 'pending',   // pending | sent | failed
    smsStatus:      'pending',   // pending | sent | failed
    callStatus:     'pending',   // pending | attempted | failed

    // ── Gateway metadata ───────────────────────────────────────────────
    retryCount:    0,
    failureReason: null,
    logs:          [],           // Gateway appends log entries here
    gatewayId:     null,         // Which gateway processed this event
  }

  const docRef = await addDoc(collection(db, 'sos_events'), event)
  console.log('[SOS] Event created:', docRef.id)
  return { id: docRef.id, ...event }
}

// ─── Update SOS event status ──────────────────────────────────────────────────
export async function updateSOSStatus(sosId, updates) {
  if (!sosId) return
  const ref = doc(db, 'sos_events', sosId)
  await updateDoc(ref, {
    ...updates,
    updatedAt: serverTimestamp(),
  })
}

// ─── Subscribe to live status updates (for UI) ────────────────────────────────
/**
 * Subscribes to real-time updates for a specific SOS event.
 * Returns an unsubscribe function.
 *
 * @param {string}   sosId     Firestore document ID
 * @param {Function} callback  Called with the latest event data
 * @returns {Function} unsubscribe
 */
export function subscribeToSOSEvent(sosId, callback) {
  if (!sosId) return () => {}
  const ref = doc(db, 'sos_events', sosId)
  return onSnapshot(ref, (snap) => {
    if (snap.exists()) {
      callback({ id: snap.id, ...snap.data() })
    }
  })
}

// ─── Status display helpers ───────────────────────────────────────────────────
export function getStatusLabel(status) {
  const labels = {
    [SOS_STATUS.PENDING]:        { text: 'Alert sent — gateway receiving…',     color: '#F59E0B', icon: 'hourglass_top' },
    [SOS_STATUS.PROCESSING]:     { text: 'Gateway processing your alert…',      color: '#3B82F6', icon: 'sync' },
    [SOS_STATUS.WHATSAPP_SENT]:  { text: 'WhatsApp alerts sent!',               color: '#25D366', icon: 'chat' },
    [SOS_STATUS.SMS_SENT]:       { text: 'SMS alerts sent!',                    color: '#10B981', icon: 'sms' },
    [SOS_STATUS.CALL_ATTEMPTED]: { text: 'Calling primary contact…',            color: '#7C3AED', icon: 'call' },
    [SOS_STATUS.COMPLETED]:      { text: 'All contacts notified!',              color: '#10B981', icon: 'check_circle' },
    [SOS_STATUS.FAILED]:         { text: 'Gateway error — contacts may retry',  color: '#EF4444', icon: 'error' },
  }
  return labels[status] || labels[SOS_STATUS.PENDING]
}
