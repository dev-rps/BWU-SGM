/**
 * reportService.js
 * All Firestore + Storage operations for hazard reports.
 *
 * Exports:
 *   submitReport(params)       — write new report to Firestore
 *   uploadReportImage(file, uid) — upload image, return download URL
 *   getReverseGeocode(lat, lng)  — Nominatim reverse geocode → { name, address }
 */

import { addDoc, collection, serverTimestamp, doc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { db, storage, auth } from '../firebase/firebase'

// ─── Submit Report ────────────────────────────────────────────────────────────
/**
 * @param {Object} params
 * @param {{ lat, lng, name, address }} params.location
 * @param {{ id, label, category, icon, color }} params.category
 * @param {string} params.severity  — 'low' | 'medium' | 'high' | 'critical'
 * @param {string} params.description
 * @param {File|null} params.imageFile
 * @param {boolean} params.anonymous
 */
export async function submitReport({ location, category, severity, description, imageFile, anonymous }) {
  const user = auth.currentUser
  if (!user) throw new Error('User not authenticated')

  // Try image upload; gracefully skip if Storage isn't enabled
  let imageUrl = null
  if (imageFile) {
    try {
      imageUrl = await uploadReportImage(imageFile, user.uid)
    } catch (e) {
      console.warn('[reportService] Image upload failed, submitting without image:', e.message)
    }
  }

  const docData = {
    // ── Auth info ──────────────────────────────────────────────────────────
    uid: user.uid,
    userName:  anonymous ? null : (user.displayName || ''),
    userEmail: anonymous ? null : (user.email || ''),
    userPhoto: anonymous ? null : (user.photoURL || null),

    // ── Hazard info ────────────────────────────────────────────────────────
    hazardType:     category.id,
    hazardLabel:    category.label,
    hazardCategory: category.category,
    severity,

    // ── Content ────────────────────────────────────────────────────────────
    description: (description || '').slice(0, 500),
    imageUrl,

    // ── Location (new schema) ──────────────────────────────────────────────
    latitude:         location.lat,
    longitude:        location.lng,
    locationName:     location.name     || '',
    formattedAddress: location.address  || '',

    // ── Legacy fields (backward compat with old Firestore docs) ───────────
    lat:       location.lat,
    lng:       location.lng,
    type:      category.id,
    location:  location.address || `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`,
    timestamp: new Date().toISOString(),

    // ── Metadata ───────────────────────────────────────────────────────────
    anonymous,
    status:            'active',
    verificationCount: 0,

    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }

  const docRef = await addDoc(collection(db, 'reports'), docData)
  return docRef.id
}

// ─── Image Upload ─────────────────────────────────────────────────────────────
export async function uploadReportImage(file, uid) {
  const safeName  = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const filename  = `reports/${uid}/${Date.now()}_${safeName}`
  const storageRef = ref(storage, filename)
  const snapshot  = await uploadBytes(storageRef, file)
  return getDownloadURL(snapshot.ref)
}

// ─── Reverse Geocode ──────────────────────────────────────────────────────────
/**
 * Returns { name: string, address: string }
 */
export async function getReverseGeocode(lat, lng) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`,
      { headers: { 'Accept-Language': 'en' } }
    )
    if (!res.ok) throw new Error('Nominatim error')
    const data = await res.json()
    const addr  = data.address || {}
    const name  =
      addr.road        ||
      addr.suburb      ||
      addr.neighbourhood ||
      addr.village     ||
      addr.town        ||
      addr.city        ||
      data.name        ||
      'Selected Location'
    return {
      name,
      address: data.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
    }
  } catch {
    return {
      name:    'Selected Location',
      address: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
    }
  }
}

// ─── Vote on Report ───────────────────────────────────────────────────────────
/**
 * voteType: 'up' | 'down'
 * - Adds UID to the chosen array, removes from the other (toggle).
 * - A second click on the same button removes the vote (un-vote).
 */
export async function voteOnReport(reportId, voteType) {
  const user = auth.currentUser
  if (!user) throw new Error('Not authenticated')

  const ref = doc(db, 'reports', reportId)
  const uid = user.uid

  if (voteType === 'up') {
    await updateDoc(ref, {
      upvotes:   arrayUnion(uid),
      downvotes: arrayRemove(uid),
    })
  } else {
    await updateDoc(ref, {
      downvotes: arrayUnion(uid),
      upvotes:   arrayRemove(uid),
    })
  }
}
