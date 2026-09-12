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
 * Load medical profile for a user with resilient multi-tier fallback
 * @param {string} uid - User ID
 * @returns {Promise<Object>}
 */
export async function loadMedicalProfile(uid) {
  // 1. Try local cache with multi-tier fallback
  let cached = null
  try {
    // 1a. Try specific UID if provided
    if (uid && uid !== 'guest') {
      const raw = localStorage.getItem(`${LOCAL_STORAGE_KEY}_${uid}`)
      if (raw) cached = JSON.parse(raw)
    }
    // 1b. Try latest saved profile
    if (!cached || !hasMedicalData(cached)) {
      const rawLatest = localStorage.getItem(`${LOCAL_STORAGE_KEY}_latest`)
      if (rawLatest) {
        const parsed = JSON.parse(rawLatest)
        if (hasMedicalData(parsed)) cached = parsed
      }
    }
    // 1c. Try demo-user / guest
    if (!cached || !hasMedicalData(cached)) {
      const rawDemo = localStorage.getItem(`${LOCAL_STORAGE_KEY}_demo-user`) || localStorage.getItem(`${LOCAL_STORAGE_KEY}_guest`)
      if (rawDemo) {
        const parsed = JSON.parse(rawDemo)
        if (hasMedicalData(parsed)) cached = parsed
      }
    }
    // 1d. Scan all localStorage keys starting with LOCAL_STORAGE_KEY
    if (!cached || !hasMedicalData(cached)) {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)
        if (k && k.startsWith(LOCAL_STORAGE_KEY)) {
          try {
            const parsed = JSON.parse(localStorage.getItem(k))
            if (hasMedicalData(parsed)) {
              cached = parsed
              break
            }
          } catch {}
        }
      }
    }
  } catch (e) {
    console.warn('[MedicalProfile] Local cache read error:', e)
  }

  // If no UID (guest / demo), return cached or default
  if (!uid || uid === 'guest' || uid === 'demo-user') {
    return cached || { ...DEFAULT_MEDICAL_PROFILE }
  }

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
        localStorage.setItem(`${LOCAL_STORAGE_KEY}_latest`, JSON.stringify(merged))
      } catch {}
      return merged
    }
  } catch (err) {
    console.warn('[MedicalProfile] Supabase fetch error (falling back to cache):', err)
  }

  return cached || { ...DEFAULT_MEDICAL_PROFILE }
}

/**
 * Quick checker if a profile object has meaningful saved health data
 */
export function hasMedicalData(profile) {
  if (!profile) return false
  return Boolean(
    profile.bloodGroup ||
    (Array.isArray(profile.conditions) && profile.conditions.length > 0) ||
    (Array.isArray(profile.allergies) && profile.allergies.length > 0) ||
    (Array.isArray(profile.medicines) && profile.medicines.length > 0) ||
    profile.doctorName ||
    profile.doctorPhone ||
    profile.age
  )
}

/**
 * Format a human-readable, friendly medical profile summary for Momo AI & Emergency HUD
 */
export function formatMedicalProfileSummary(profile) {
  if (!profile || !hasMedicalData(profile)) return null

  const lines = []
  if (profile.bloodGroup) lines.push(`🩸 **Blood Group:** ${profile.bloodGroup}`)
  if (profile.age) {
    const hw = profile.height && profile.weight ? ` (${profile.height} cm, ${profile.weight} kg)` : ''
    lines.push(`👤 **Age:** ${profile.age} yrs${hw}`)
  }

  const allConditions = [
    ...(Array.isArray(profile.conditions) ? profile.conditions : []),
    ...(profile.otherCondition ? [profile.otherCondition] : [])
  ].filter(Boolean)
  if (allConditions.length > 0) {
    lines.push(`🩺 **Medical Conditions:** ${allConditions.join(', ')}`)
  }

  const allAllergies = [
    ...(Array.isArray(profile.allergies) ? profile.allergies : []),
    ...(profile.otherAllergy ? [profile.otherAllergy] : [])
  ].filter(Boolean)
  if (allAllergies.length > 0) {
    lines.push(`⚠️ **Known Allergies:** ${allAllergies.join(', ')}`)
  }

  if (Array.isArray(profile.medicines) && profile.medicines.length > 0) {
    const medList = profile.medicines
      .map(m => `${m.name}${m.dosage ? ` (${m.dosage})` : ''}${m.frequency ? ` - ${m.frequency}` : ''}`)
      .join(', ')
    lines.push(`💊 **Medications:** ${medList}`)
  }

  if (profile.doctorName || profile.doctorPhone) {
    const docHosp = profile.doctorHospital ? ` [${profile.doctorHospital}]` : ''
    const docPh = profile.doctorPhone ? ` (📞 ${profile.doctorPhone})` : ''
    lines.push(`👨‍⚕️ **Personal Doctor:** ${profile.doctorName || 'Doctor'}${docHosp}${docPh}`)
  }

  if (Array.isArray(profile.emergencyContacts) && profile.emergencyContacts.length > 0) {
    const cList = profile.emergencyContacts
      .map(c => `${c.name} (${c.relationship || 'Contact'}): ${c.phone}`)
      .join(', ')
    lines.push(`📞 **Emergency Contacts:** ${cList}`)
  }

  if (profile.insuranceProvider) {
    lines.push(`🛡️ **Insurance:** ${profile.insuranceProvider}${profile.insurancePolicyNumber ? ` (#${profile.insurancePolicyNumber})` : ''}`)
  }

  return lines.join('\n')
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

  // 1. Save to localStorage immediately under specific key and latest key
  try {
    localStorage.setItem(`${LOCAL_STORAGE_KEY}_${uid || 'guest'}`, JSON.stringify(sanitized))
    localStorage.setItem(`${LOCAL_STORAGE_KEY}_latest`, JSON.stringify(sanitized))
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('sg_medical_profile_updated', { detail: sanitized }))
    }
  } catch (e) {
    console.warn('[MedicalProfile] LocalStorage save error:', e)
  }

  // 2. Save to Supabase if user is authenticated
  if (uid && uid !== 'guest' && uid !== 'demo-user') {
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
  if (profile.age || profile.height || profile.weight) score += 1
  if ((Array.isArray(profile.conditions) && profile.conditions.length > 0) || profile.otherCondition) score += 1
  if ((Array.isArray(profile.allergies) && profile.allergies.length > 0) || profile.otherAllergy) score += 1
  if ((Array.isArray(profile.medicines) && profile.medicines.length > 0) || (Array.isArray(profile.emergencyMedicines) && profile.emergencyMedicines.length > 0)) score += 1
  if (profile.doctorName || profile.doctorPhone || profile.doctorHospital) score += 1
  if ((Array.isArray(profile.emergencyContacts) && profile.emergencyContacts.length > 0) || profile.insuranceProvider || profile.insurancePolicyNumber) score += 1

  return Math.round((score / maxScore) * 100)
}

