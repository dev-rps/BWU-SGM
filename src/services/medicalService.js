/**
 * src/services/medicalService.js — Medical Profile Persistence & Sync
 *
 * Securely manages user medical profile using Supabase Postgres `medical_profiles`
 * and mirrors in localStorage for instant retrieval and offline continuity.
 */

import { supabase } from '../supabase/supabase'

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

  // 2. Fetch from Supabase `medical_profiles` table
  try {
    const { data, error } = await supabase
      .from('medical_profiles')
      .select('*')
      .eq('user_id', uid)
      .maybeSingle()

    if (!error && data) {
      const merged = {
        ...DEFAULT_MEDICAL_PROFILE,
        bloodGroup: data.blood_group || '',
        age: data.age ? String(data.age) : '',
        height: data.height_cm ? String(data.height_cm) : '',
        weight: data.weight_kg ? String(data.weight_kg) : '',
        conditions: data.conditions || [],
        otherCondition: data.other_conditions || '',
        allergies: data.allergies || [],
        otherAllergy: data.other_allergies || '',
        medicines: data.medicines || [],
        emergencyMedicines: data.emergency_medicines || [],
        doctorName: data.doctor_name || '',
        doctorHospital: data.doctor_hospital || '',
        doctorPhone: data.doctor_phone || '',
        insuranceProvider: data.insurance_provider || '',
        insurancePolicyNumber: data.insurance_policy_number || '',
        lastUpdated: data.updated_at || data.created_at,
      }

      // Update local storage
      try {
        localStorage.setItem(`${LOCAL_STORAGE_KEY}_${uid}`, JSON.stringify(merged))
      } catch {}
      return merged
    }
  } catch (err) {
    console.warn('[MedicalProfile] Supabase fetch error (falling back to cache):', err)
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

  // 2. Save to Supabase if user is authenticated
  if (uid) {
    try {
      const row = {
        user_id: uid,
        blood_group: profileData.bloodGroup || null,
        age: profileData.age ? parseInt(profileData.age, 10) : null,
        height_cm: profileData.height ? parseFloat(profileData.height) : null,
        weight_kg: profileData.weight ? parseFloat(profileData.weight) : null,
        conditions: Array.isArray(profileData.conditions) ? profileData.conditions : [],
        other_conditions: profileData.otherCondition || null,
        allergies: Array.isArray(profileData.allergies) ? profileData.allergies : [],
        other_allergies: profileData.otherAllergy || null,
        medicines: Array.isArray(profileData.medicines) ? profileData.medicines : [],
        emergency_medicines: Array.isArray(profileData.emergencyMedicines) ? profileData.emergencyMedicines : [],
        doctor_name: profileData.doctorName || null,
        doctor_hospital: profileData.doctorHospital || null,
        doctor_phone: profileData.doctorPhone || null,
        insurance_provider: profileData.insuranceProvider || null,
        insurance_policy_number: profileData.insurancePolicyNumber || null,
        updated_at: new Date().toISOString(),
      }

      const { error } = await supabase
        .from('medical_profiles')
        .upsert(row, { onConflict: 'user_id' })

      if (error) {
        console.error('[MedicalProfile] Supabase save error:', error)
      }
      return true
    } catch (err) {
      console.error('[MedicalProfile] Supabase save exception:', err)
      return true
    }
  }

  return true
}

/**
 * Calculate medical profile completion percentage (0 - 100%)
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
