/**
 * Safety Guardian — Firebase Cloud Functions
 * Emergency Gateway: automatic SMS + phone calls from +91 7797822568
 *
 * Trigger: New document in Firestore `sos_events` collection with status = 'pending'
 *
 * Flow:
 *   1. Lock the event (status → 'processing') using atomic transaction
 *   2. Send WhatsApp-style message via Twilio WhatsApp API (optional)
 *   3. Send SMS to ALL emergency contacts from +91 7797822568
 *   4. Call the PRIMARY emergency contact (priority = 1)
 *   5. Update Firestore with delivery status, timestamps, logs
 *
 * Required environment variables (set via `firebase functions:config:set`):
 *   twilio.account_sid   = ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
 *   twilio.auth_token    = your_auth_token
 *   twilio.from_number   = +917797822568   (your company number)
 *
 * Deploy: cd functions && npm install && firebase deploy --only functions
 */

const functions = require('firebase-functions')
const admin     = require('firebase-admin')
const twilio    = require('twilio')

admin.initializeApp()
const db = admin.firestore()

// ─── Twilio config — set via Firebase environment config ──────────────────────
// firebase functions:config:set twilio.account_sid="ACxxx" twilio.auth_token="xxx" twilio.from_number="+917797822568"
function getTwilioClient() {
  const cfg = functions.config().twilio || {}
  const sid   = cfg.account_sid  || process.env.TWILIO_ACCOUNT_SID
  const token = cfg.auth_token   || process.env.TWILIO_AUTH_TOKEN
  if (!sid || !token) throw new Error('Twilio credentials not configured')
  return twilio(sid, token)
}

const FROM_NUMBER = '+917797822568'  // Safety Guardian company number

// ─── Build emergency message ──────────────────────────────────────────────────
function buildMessage(event) {
  const typeEmojis = {
    general: '🚨', medical: '🚑', crime: '🚨',
    fire: '🔥', weather: '⛈️', accident: '🚗',
  }
  const emoji = typeEmojis[event.emergencyType] || '🚨'
  const time  = event.createdAt
    ? new Date(event.createdAt.seconds * 1000).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
    : new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })

  return `${emoji} SAFETY GUARDIAN ALERT

${event.userName} has triggered an SOS emergency.

📍 Live Location:
${event.mapsLink || `https://maps.google.com/?q=${event.latitude},${event.longitude}`}

⏰ Time: ${time}
🆘 Type: ${(event.emergencyType || 'general').toUpperCase()}

Please contact them immediately or go to their location.

— Safety Guardian Emergency System
  +91 7797822568`
}

// ─── Send SMS to a single contact ─────────────────────────────────────────────
async function sendSMS(client, to, message, retries = 2) {
  const phone = normalizePhone(to)
  if (!phone) return { success: false, error: 'Invalid phone number' }

  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    try {
      const result = await client.messages.create({
        body: message,
        from: FROM_NUMBER,
        to:   phone,
      })
      console.log(`[SMS] Sent to ${phone}: ${result.sid}`)
      return { success: true, sid: result.sid, phone }
    } catch (err) {
      console.error(`[SMS] Attempt ${attempt} failed for ${phone}:`, err.message)
      if (attempt > retries) return { success: false, error: err.message, phone }
      await sleep(1000 * attempt)
    }
  }
}

// ─── Make a phone call to a contact ──────────────────────────────────────────
async function makeCall(client, to, message) {
  const phone = normalizePhone(to)
  if (!phone) return { success: false, error: 'Invalid phone number' }

  try {
    // Twilio reads a TwiML instruction to speak the message
    const twiml = `<Response>
  <Say voice="alice" language="en-IN">
    Emergency Alert from Safety Guardian.
    ${message.replace(/[🚨🚑🔥⛈️🚗📍⏰🆘]/g, '').replace(/\n/g, '. ')}
    Please contact the person immediately.
  </Say>
  <Pause length="1"/>
  <Say voice="alice" language="en-IN">Repeating. ${message.replace(/[🚨🚑🔥⛈️🚗📍⏰🆘]/g, '').replace(/\n/g, '. ')}</Say>
</Response>`

    const result = await client.calls.create({
      twiml,
      from: FROM_NUMBER,
      to:   phone,
    })
    console.log(`[CALL] Initiated to ${phone}: ${result.sid}`)
    return { success: true, sid: result.sid, phone }
  } catch (err) {
    console.error(`[CALL] Failed to call ${phone}:`, err.message)
    return { success: false, error: err.message, phone }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function normalizePhone(phone) {
  if (!phone) return null
  let p = phone.replace(/[\s\-().]/g, '')
  if (p.startsWith('0'))  p = '+91' + p.slice(1)
  if (!p.startsWith('+')) p = '+91' + p
  return p.length >= 12 ? p : null
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

function appendLog(logs, entry) {
  return [...(logs || []), { ...entry, time: new Date().toISOString() }]
}

// ─── MAIN FUNCTION: triggered on every new sos_events document ────────────────
exports.processSOSEvent = functions
  .region('asia-south1')   // Mumbai — lowest latency for India
  .firestore
  .document('sos_events/{sosId}')
  .onCreate(async (snap, context) => {
    const sosId = context.params.sosId
    const event = snap.data()

    // Only process pending events
    if (event.status !== 'pending') {
      console.log(`[SOS] ${sosId} not pending (${event.status}), skipping`)
      return null
    }

    const ref = db.collection('sos_events').doc(sosId)
    let logs  = event.logs || []

    // ── Step 1: Atomic lock — prevent duplicate processing ──────────────────
    try {
      await db.runTransaction(async (tx) => {
        const doc = await tx.get(ref)
        if (doc.data().status !== 'pending') {
          throw new Error('Already being processed by another gateway')
        }
        tx.update(ref, {
          status:      'processing',
          processedAt: admin.firestore.FieldValue.serverTimestamp(),
          gatewayId:   'cloud-function',
        })
      })
    } catch (lockErr) {
      console.log(`[SOS] ${sosId} lock failed: ${lockErr.message}`)
      return null
    }

    logs = appendLog(logs, { step: 'LOCKED', msg: 'Gateway acquired lock, processing started' })

    // ── Build message ────────────────────────────────────────────────────────
    const message = buildMessage(event)
    const contacts = (event.contacts || []).filter(c => c.phone)

    if (contacts.length === 0) {
      await ref.update({
        status:        'failed',
        failureReason: 'No emergency contacts with phone numbers',
        logs:          appendLog(logs, { step: 'FAILED', msg: 'No contacts to notify' }),
      })
      return null
    }

    let twilioClient
    try {
      twilioClient = getTwilioClient()
    } catch (err) {
      await ref.update({
        status:        'failed',
        failureReason: 'Twilio not configured: ' + err.message,
        logs:          appendLog(logs, { step: 'CONFIG_ERROR', msg: err.message }),
      })
      return null
    }

    // ── Step 2: Send SMS to ALL contacts ─────────────────────────────────────
    console.log(`[SOS] ${sosId} — sending SMS to ${contacts.length} contact(s)`)
    const smsResults = []

    for (const contact of contacts) {
      const result = await sendSMS(twilioClient, contact.phone, message)
      smsResults.push({ name: contact.name, ...result })
      logs = appendLog(logs, {
        step: result.success ? 'SMS_SENT' : 'SMS_FAILED',
        contact: contact.name,
        phone: contact.phone,
        msg: result.success ? `SMS delivered (${result.sid})` : result.error,
      })
    }

    const smsSent = smsResults.some(r => r.success)
    await ref.update({
      smsStatus:   smsSent ? 'sent' : 'failed',
      smsSentAt:   admin.firestore.FieldValue.serverTimestamp(),
      smsResults,
      status:      'sms_sent',
      logs,
    })

    await sleep(1000)

    // ── Step 3: Call the PRIMARY contact (priority = 1) ───────────────────────
    const primaryContact = contacts.find(c => c.priority === 1) || contacts[0]
    console.log(`[SOS] ${sosId} — calling primary contact: ${primaryContact.name}`)

    const callResult = await makeCall(twilioClient, primaryContact.phone, message)
    logs = appendLog(logs, {
      step: callResult.success ? 'CALL_INITIATED' : 'CALL_FAILED',
      contact: primaryContact.name,
      phone: primaryContact.phone,
      msg: callResult.success ? `Call initiated (${callResult.sid})` : callResult.error,
    })

    await ref.update({
      callStatus:       callResult.success ? 'attempted' : 'failed',
      callAttemptedAt:  admin.firestore.FieldValue.serverTimestamp(),
      callResult,
      status:          'call_attempted',
      logs,
    })

    await sleep(500)

    // ── Step 4: Mark completed ────────────────────────────────────────────────
    const allDone = smsSent || callResult.success
    logs = appendLog(logs, {
      step: 'COMPLETED',
      msg: `Processing complete. SMS: ${smsSent ? 'OK' : 'FAILED'}. Call: ${callResult.success ? 'OK' : 'FAILED'}`,
    })

    await ref.update({
      status:      allDone ? 'completed' : 'failed',
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
      logs,
    })

    console.log(`[SOS] ${sosId} — completed. SMS=${smsSent}, Call=${callResult.success}`)
    return null
  })
