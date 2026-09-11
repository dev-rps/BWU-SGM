/**
 * src/services/contactsService.js
 *
 * Emergency Contacts CRUD backed by Supabase Postgres `emergency_contacts` table.
 */

import { supabase } from '../supabase/supabase'

/**
 * Load the logged-in user's emergency contacts. Returns [] if none.
 */
export async function loadContacts(uid) {
  if (!uid) return []
  try {
    const { data, error } = await supabase
      .from('emergency_contacts')
      .select('*')
      .eq('user_id', uid)
      .order('priority', { ascending: true })

    if (error) {
      console.error('[contactsService] loadContacts error:', error)
      return []
    }

    // Format for frontend consumption
    return (data || []).map(c => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      relationship: c.relationship || '',
      priority: c.priority || 1,
      createdAt: c.created_at,
    }))
  } catch (err) {
    console.error('[contactsService] loadContacts exception:', err)
    return []
  }
}

/**
 * Persist contacts array to Supabase (synchronizes user contacts).
 */
export async function saveContacts(uid, contacts) {
  if (!uid) return
  try {
    // 1. Delete existing contacts for user
    await supabase
      .from('emergency_contacts')
      .delete()
      .eq('user_id', uid)

    // 2. Insert updated contacts
    if (contacts && contacts.length > 0) {
      const rows = contacts.map((c, idx) => ({
        user_id: uid,
        name: c.name || 'Emergency Contact',
        phone: c.phone || '',
        relationship: c.relationship || '',
        priority: c.priority !== undefined ? c.priority : (idx + 1),
      }))

      const { error } = await supabase
        .from('emergency_contacts')
        .insert(rows)

      if (error) throw error
    }
  } catch (err) {
    console.error('[contactsService] saveContacts error:', err)
    throw err
  }
}

/** Generate a unique string ID for local UI tracking before persist */
export function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}
