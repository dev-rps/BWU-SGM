/**
 * src/services/reportService.js
 * Supabase operations for community hazard reports and reverse geocoding.
 */

import { supabase } from '../supabase/supabase'

/**
 * Submit new report to Supabase `hazard_reports`
 */
export async function submitReport({ location, category, severity, description, imageFile, anonymous }) {
  const { data: { user } } = await supabase.auth.getUser()

  // Process image if supplied
  let imageUrl = null
  if (imageFile) {
    try {
      imageUrl = await uploadReportImage(imageFile, user?.id || 'anon')
    } catch (e) {
      console.warn('[reportService] Image upload failed, submitting without image:', e.message)
    }
  }

  const payload = {
    user_id: anonymous ? null : user?.id,
    user_name: anonymous ? null : (user?.user_metadata?.full_name || user?.email || ''),
    user_email: anonymous ? null : (user?.email || ''),
    user_photo: anonymous ? null : (user?.user_metadata?.avatar_url || null),

    hazard_type: category.id,
    hazard_label: category.label,
    hazard_category: category.category,
    severity,

    description: (description || '').slice(0, 500),
    image_url: imageUrl,

    latitude: location.lat,
    longitude: location.lng,
    location_name: location.name || '',
    formatted_address: location.address || '',

    is_anonymous: !!anonymous,
    status: 'active',
    verification_count: 0,
  }

  const { data, error } = await supabase
    .from('hazard_reports')
    .insert(payload)
    .select('id')
    .single()

  if (error) {
    console.error('[reportService] submitReport error:', error)
    throw error
  }

  return data?.id
}

/**
 * Image Upload — uses Supabase Storage if bucket exists, or falls back to Base64 data URL
 */
export async function uploadReportImage(file, uid) {
  try {
    const fileExt = file.name.split('.').pop()
    const fileName = `${uid}/${Date.now()}_${Math.random().toString(36).slice(2)}.${fileExt}`

    const { error: uploadError } = await supabase.storage
      .from('report-images')
      .upload(fileName, file)

    if (!uploadError) {
      const { data: { publicUrl } } = supabase.storage
        .from('report-images')
        .getPublicUrl(fileName)
      return publicUrl
    }
  } catch (err) {
    console.warn('[reportService] Storage upload failed, converting to DataURL:', err)
  }

  // Graceful fallback to DataURL so photo is preserved even without bucket configuration
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

/**
 * Reverse Geocode via OpenStreetMap Nominatim
 */
export async function getReverseGeocode(lat, lng) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`,
      { headers: { 'Accept-Language': 'en' } }
    )
    if (!res.ok) throw new Error('Nominatim error')
    const data = await res.json()
    const addr = data.address || {}
    const name =
      addr.road ||
      addr.suburb ||
      addr.neighbourhood ||
      addr.village ||
      addr.town ||
      addr.city ||
      data.name ||
      'Selected Location'
    return {
      name,
      address: data.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
    }
  } catch {
    return {
      name: 'Selected Location',
      address: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
    }
  }
}

/**
 * Vote on Report using Supabase RPC function `vote_hazard_report`
 */
export async function voteOnReport(reportId, voteType) {
  const { error } = await supabase.rpc('vote_hazard_report', {
    report_id: reportId,
    vote_type: voteType,
  })

  if (error) {
    console.error('[reportService] voteOnReport error:', error)
    throw error
  }
}

/**
 * Delete a report from Supabase `hazard_reports`
 */
export async function deleteReport(reportId) {
  const { error } = await supabase
    .from('hazard_reports')
    .delete()
    .eq('id', reportId)

  if (error) {
    console.error('[reportService] deleteReport error:', error)
    throw error
  }
}

