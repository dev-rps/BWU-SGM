/**
 * src/services/sosService.js — SOS Event Gateway Service
 *
 * Responsibilities:
 *  1. Write a complete SOS event to Supabase `sos_events` table
 *  2. Provide status update helpers
 *  3. Subscribe to live status changes via Supabase Realtime for UI updates
 */

import { supabase } from '../supabase/supabase'

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
      priority:     i + 1,
    }))

  const { data: { user: authUser } } = await supabase.auth.getUser()
  const userId = authUser?.id || user?.uid || '00000000-0000-0000-0000-000000000000'

  const eventPayload = {
    user_id:           userId,
    status:            SOS_STATUS.PENDING,
    user_name:         user?.name  || authUser?.user_metadata?.full_name || 'Unknown User',
    user_phone:        user?.phone || '',
    user_email:        user?.email || authUser?.email || '',

    latitude:          lat || 0,
    longitude:         lng || 0,
    accuracy:          userLocation?.accuracy ?? null,
    maps_link:         mapsLink,

    emergency_type:    emergencyType,
    contacts_snapshot: contacts,

    whatsapp_status:   'pending',
    sms_status:        'pending',
    call_status:       'pending',
    retry_count:       0,
    logs:              [],
  }

  const { data, error } = await supabase
    .from('sos_events')
    .insert(eventPayload)
    .select()
    .single()

  if (error) {
    console.error('[SOS] Event create error:', error)
    throw error
  }

  console.log('[SOS] Event created in Supabase:', data.id)
  return data
}

// ─── Update SOS event status ──────────────────────────────────────────────────
export async function updateSOSStatus(sosId, updates) {
  if (!sosId) return
  const { error } = await supabase
    .from('sos_events')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', sosId)

  if (error) console.error('[SOS] Update status error:', error)
}

// ─── Subscribe to live status updates (via Supabase Realtime) ─────────────────
export function subscribeToSOSEvent(sosId, callback) {
  if (!sosId) return () => {}

  // 1. Initial fetch
  supabase
    .from('sos_events')
    .select('*')
    .eq('id', sosId)
    .single()
    .then(({ data }) => {
      if (data) callback(data)
    })

  // 2. Realtime subscription
  const channel = supabase
    .channel(`sos_event_${sosId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'sos_events',
        filter: `id=eq.${sosId}`,
      },
      (payload) => {
        if (payload.new) callback(payload.new)
      }
    )
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
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
