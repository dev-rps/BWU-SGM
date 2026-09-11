/**
 * src/services/supabaseDataService.js
 * Database operations & ML feedback loop gateway for Safety Guardian via Supabase
 */

import { supabase } from '../supabase/supabase'

// ─── Hazard Reports ───────────────────────────────────────────────────────────

export async function fetchHazardReports() {
  const { data, error } = await supabase
    .from('hazard_reports')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[Supabase] Error fetching hazard reports:', error)
    return []
  }
  return data || []
}

export async function submitHazardReport({
  hazardType,
  hazardLabel,
  hazardCategory,
  severity,
  description,
  imageUrl,
  latitude,
  longitude,
  locationName,
  formattedAddress,
  isAnonymous = false,
}) {
  const { data: { user } } = await supabase.auth.getUser()

  const payload = {
    user_id: user ? user.id : null,
    user_name: isAnonymous ? null : (user?.user_metadata?.full_name || user?.email || 'Anonymous Guardian'),
    user_email: isAnonymous ? null : (user?.email || null),
    hazard_type: hazardType,
    hazard_label: hazardLabel,
    hazard_category: hazardCategory,
    severity,
    description,
    image_url: imageUrl || null,
    latitude,
    longitude,
    location_name: locationName,
    formatted_address: formattedAddress,
    is_anonymous: isAnonymous,
    status: 'active',
  }

  const { data, error } = await supabase
    .from('hazard_reports')
    .insert(payload)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function voteHazardReport(reportId, voteType) {
  const { error } = await supabase.rpc('vote_hazard_report', {
    report_id: reportId,
    vote_type: voteType,
  })
  if (error) throw error
}

// ─── Live Location Sharing ───────────────────────────────────────────────────

export async function upsertLiveLocation({ latitude, longitude, speed = null, heading = null }) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const displayName = user.user_metadata?.full_name || user.email || 'Safety Guardian'

  const { error } = await supabase
    .from('live_locations')
    .upsert({
      user_id: user.id,
      latitude,
      longitude,
      display_name: displayName,
      speed,
      heading,
      updated_at: new Date().toISOString(),
    })

  if (error) console.warn('[Supabase] Live location upsert error:', error.message)
}

export async function deleteLiveLocation() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const { error } = await supabase
    .from('live_locations')
    .delete()
    .eq('user_id', user.id)

  if (error) console.warn('[Supabase] Live location delete error:', error.message)
}

export async function fetchActiveLiveLocations() {
  const { data, error } = await supabase
    .from('live_locations')
    .select('*')

  if (error) {
    console.warn('[Supabase] Fetch active live locations error:', error.message)
    return []
  }
  return data || []
}

// ─── Journeys & Route Evaluations ─────────────────────────────────────────────

export async function createJourney({
  startLocation,
  destination,
  travelMode = 'pedestrian',
}) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('User not authenticated')

  const { data, error } = await supabase
    .from('journeys')
    .insert({
      user_id: user.id,
      start_location_name: startLocation?.name || 'Starting Point',
      start_latitude: startLocation?.lat || 0,
      start_longitude: startLocation?.lng || 0,
      start_address: startLocation?.address || '',
      destination_name: destination?.name || 'Destination',
      destination_latitude: destination?.lat || 0,
      destination_longitude: destination?.lng || 0,
      destination_address: destination?.address || '',
      travel_mode: travelMode,
      status: 'active',
    })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function recordRouteEvaluation({
  journeyId,
  routeIndex,
  routeName,
  distanceMeters,
  durationSeconds,
  geometry,
  mlPrediction,
}) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const evalPayload = {
    journey_id: journeyId || null,
    user_id: user.id,
    route_index: routeIndex,
    route_name: routeName,
    distance_meters: distanceMeters,
    duration_seconds: durationSeconds,
    traffic_level: mlPrediction?.trafficLevel || 'clear',
    geometry: geometry || [],
    predicted_safety_score: mlPrediction?.safety_score || 85,
    predicted_risk_score: mlPrediction?.risk_score || 15.0,
    predicted_risk_level: mlPrediction?.risk_level || 'Low',
    class_probabilities: mlPrediction?.probabilities || {},
    bottleneck_lat: mlPrediction?.bottleneck?.lat || null,
    bottleneck_lng: mlPrediction?.bottleneck?.lng || null,
    bottleneck_score: mlPrediction?.bottleneck?.safety_score || null,
    bottleneck_hazards: mlPrediction?.bottleneck?.hazards || null,
    nearest_hazards: mlPrediction?.nearest_hazards || {},
    explanatory_reasons: mlPrediction?.reasons || [],
    model_version: mlPrediction?.model_version || '3.0.0',
    live_weather_snapshot: mlPrediction?.liveWeather || null,
    live_aqi_snapshot: mlPrediction?.airQuality || null,
  }

  const { data, error } = await supabase
    .from('route_evaluations')
    .insert(evalPayload)
    .select()
    .single()

  if (error) {
    console.error('[Supabase] Error saving route evaluation:', error)
    return null
  }
  return data
}

// ─── NEW: Route-Safety Feedback Loop (Model Retraining Bridge) ─────────────────

export async function submitRouteSafetyFeedback({
  journeyId,
  routeEvaluationId,
  perceivedSafetyScore,
  predictedSafetyScore,
  predictedRiskLevel,
  actualLighting,
  actualWeatherCondition,
  encounteredHazards = [],
  feltSafeAtBottleneck = true,
  divertedFromRoute = false,
  deviationReason = null,
  userComments = null,
}) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('User not authenticated')

  // Compute calibrated ground truth score:
  // Base perception + penalty deductions for encountered hazards and forced detours
  let hazardPenalty = encounteredHazards.length * 4.0
  if (divertedFromRoute) hazardPenalty += 12.0
  if (!feltSafeAtBottleneck) hazardPenalty += 8.0

  const computedGroundTruthRisk = Math.max(
    10.0,
    Math.min(100.0, 100.0 - perceivedSafetyScore + (hazardPenalty * 0.5))
  )

  const { data, error } = await supabase
    .from('route_safety_feedbacks')
    .insert({
      journey_id: journeyId || null,
      route_evaluation_id: routeEvaluationId,
      user_id: user.id,
      perceived_safety_score: perceivedSafetyScore,
      predicted_safety_score: predictedSafetyScore,
      predicted_risk_level: predictedRiskLevel,
      actual_lighting: actualLighting,
      actual_weather_condition: actualWeatherCondition,
      encountered_hazards: encounteredHazards,
      felt_safe_at_bottleneck: feltSafeAtBottleneck,
      diverted_from_route: divertedFromRoute,
      deviation_reason: deviationReason,
      user_comments: userComments,
      computed_ground_truth_risk: Math.round(computedGroundTruthRisk * 10) / 10,
    })
    .select()
    .single()

  if (error) throw error
  return data
}

// ─── Journey Review ───────────────────────────────────────────────────────────

export async function submitJourneyReview({ journeyId, rating }) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    console.warn('[Supabase] Anonymous or unauthenticated journey review not persisted in db')
    return null
  }

  const { data, error } = await supabase
    .from('journey_reviews')
    .insert({
      journey_id: journeyId || null,
      user_id: user.id,
      rating,
    })
    .select()
    .single()

  if (error) throw error
  return data
}

