/**
 * contactsService.js
 *
 * Firestore emergency contacts per-user CRUD.
 * Structure: users/{uid} → emergencyContacts: [...array]
 *
 * Exports:
 *   loadContacts(uid)
 *   saveContacts(uid, contacts)
 *   generateId()
 */

import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore'
import { db } from '../firebase/firebase'

const userRef = (uid) => doc(db, 'users', uid)

/** Load the logged-in user's contacts from Firestore. Returns [] if none. */
export async function loadContacts(uid) {
  if (!uid) return []
  try {
    const snap = await getDoc(userRef(uid))
    if (!snap.exists()) return []
    return snap.data().emergencyContacts || []
  } catch (err) {
    console.error('[contactsService] loadContacts error:', err)
    return []
  }
}

/** Persist the entire contacts array to Firestore (overwrites). */
export async function saveContacts(uid, contacts) {
  if (!uid) return
  try {
    const ref = userRef(uid)
    const snap = await getDoc(ref)
    if (snap.exists()) {
      await updateDoc(ref, { emergencyContacts: contacts })
    } else {
      await setDoc(ref, { emergencyContacts: contacts }, { merge: true })
    }
  } catch (err) {
    console.error('[contactsService] saveContacts error:', err)
    throw err
  }
}

/** Generate a unique string ID for a new contact. */
export function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}
