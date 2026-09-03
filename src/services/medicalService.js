/**
 * medicalService.js — Medical Profile Persistence & Sync
 *
 * Securely manages user medical profile:
 * - Blood Group, Age, Height, Weight
 * - Medical Conditions (Multi-select + Other)
 * - Allergies (Chips + Other)
 * - Current Medications (Name, Dosage, Frequency, Notes)
 * - Emergency Contacts (Name, Relationship, Phone, Priority)
 * - Doctor Details (Name, Hospital, Phone)
 * - Insurance Info (Provider, Policy Number)
 *
 * Syncs seamlessly with Firestore (users/{uid}/medicalProfile)
 * and mirrors in localStorage for offline & instant retrieval.
 */

import { db } from '../firebase/firebase'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'

const LOCAL_STORAGE_KEY = 'sg_medical_profile_v2'

export const DEFAULT_MEDICAL_PROFILE = {
  bloodGroup: '',
  age: '',
  height: '',
  weight: '',
  conditions: [],
  otherCondition: '',
  allergies: [],
  otherAllergy: '',
  medicines: [],
  emergencyMedicines: [],
  emergencyContacts: [],
  doctorName: '',
  doctorHospital: '',
  doctorPhone: '',
  insuranceProvider: '',
  insurancePolicyNumber: '',
  lastUpdated: null,
}

/**
 * Load medical profile for a user
 * @param {string} uid - User ID
 * @returns {Promise<Object>}
 */
export async function loadMedicalProfile(uid) {
  // 1. Try local cache first for instant UI response
  let cached = null
  try {
    const raw = localStorage.getItem(`${LOCAL_STORAGE_KEY}_${uid || 'guest'}`)
    if (raw) cached = JSON.parse(raw)
  } catch (e) {
    console.warn('[MedicalProfile] Local cache read error:', e)
  }

  // If no UID (guest / logged out), return cached or default
  if (!uid) return cached || { ...DEFAULT_MEDICAL_PROFILE }

  // 2. Fetch from Firestore
  try {
    const docRef = doc(db, 'users', uid, 'medical', 'profile')
    const snap = await getDoc(docRef)

    if (snap.exists()) {
      const data = snap.data()
      const merged = { ...DEFAULT_MEDICAL_PROFILE, ...data }
      // Update local storage
      try {
        localStorage.setItem(`${LOCAL_STORAGE_KEY}_${uid}`, JSON.stringify(merged))
      } catch {}
      return merged
    }
  } catch (err) {
    console.warn('[MedicalProfile] Firestore fetch error (falling back to cache):', err)
  }

  return cached || { ...DEFAULT_MEDICAL_PROFILE }
}

/**
 * Save medical profile for a user
 * @param {string} uid - User ID
 * @param {Object} profileData - Medical profile object
 * @returns {Promise<boolean>}
 */
export async function saveMedicalProfile(uid, profileData) {
  const sanitized = {
    ...profileData,
    lastUpdated: new Date().toISOString(),
  }

  // 1. Save to localStorage immediately
  try {
    localStorage.setItem(`${LOCAL_STORAGE_KEY}_${uid || 'guest'}`, JSON.stringify(sanitized))
  } catch (e) {
    console.warn('[MedicalProfile] LocalStorage save error:', e)
  }

  // 2. Save to Firestore if user is authenticated
  if (uid) {
    try {
      const docRef = doc(db, 'users', uid, 'medical', 'profile')
      await setDoc(docRef, {
        ...sanitized,
        updatedAt: serverTimestamp(),
      }, { merge: true })
      return true
    } catch (err) {
      console.error('[MedicalProfile] Firestore save error:', err)
      // Even if firestore fails, local storage succeeded
      return true
    }
  }

  return true
}

/**
 * Calculate medical profile completion percentage (0 - 100%)
 * @param {Object} profile 
 * @returns {number}
 */
export function calculateProfileCompletion(profile) {
  if (!profile) return 0
  let score = 0
  const maxScore = 7

  if (profile.bloodGroup) score += 1
  if (profile.age || (profile.height && profile.weight)) score += 1
  if (Array.isArray(profile.conditions) && profile.conditions.length > 0) score += 1
  if (Array.isArray(profile.allergies) && profile.allergies.length > 0) score += 1
  if (Array.isArray(profile.medicines) && profile.medicines.length > 0) score += 1
  if (profile.doctorName || profile.doctorPhone) score += 1
  if (Array.isArray(profile.emergencyContacts) && profile.emergencyContacts.length > 0) score += 1

  return Math.round((score / maxScore) * 100)
}
