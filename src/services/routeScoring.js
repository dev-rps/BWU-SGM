/**
 * src/services/routeScoring.js
 *
 * Unified Route Scoring and Dynamic Reroute Evaluation Engine.
 *
 * Combines route duration (ETA in seconds) with empirical safety risk penalties
 * and traffic incident delays into a single composite cost function:
 *
 *   compositeCost = (durationSeconds * ETA_WEIGHT)
 *                 + (safetyRiskPenalty * SAFETY_PENALTY_WEIGHT)
 *                 + (incidentDelaySeconds * INCIDENT_DELAY_WEIGHT)
 *
 * Lower composite cost = superior overall route.
 */

// ─── Named Scoring Constants & Weights ────────────────────────────────────────
export const ETA_WEIGHT = 1.0                   // 1.0 cost per second of travel time
export const SAFETY_PENALTY_WEIGHT = 18.0       // 18.0 cost per safety point docked (e.g. 10 pt drop = 180s equivalent penalty)
export const INCIDENT_DELAY_WEIGHT = 1.35       // 1.35 multiplier on incident-induced queuing delays
export const BASE_SAFETY_SCORE = 100            // Baseline safety rating
export const MIN_SAFETY_SCORE = 10              // Minimum floor for safety rating
export const MAX_SAFETY_SCORE = 100             // Maximum ceiling for safety rating

// ─── Reroute Decision Thresholds ───────────────────────────────────────────────
export const OFF_ROUTE_THRESHOLD_METERS = 55             // Deviation distance before triggering off-route alert (meters)
export const OFF_ROUTE_CONSECUTIVE_TICKS = 2             // Consecutive off-route GPS readings needed before reroute
export const ETA_DELTA_REROUTE_THRESHOLD_SECONDS = 90    // Minimum time savings (1.5 min) required to recommend reroute
export const SAFETY_DELTA_REROUTE_THRESHOLD = 8          // Minimum safety score improvement required to prompt for safety
export const COMPOSITE_COST_DELTA_THRESHOLD = 120        // Minimum composite score improvement required for general reroute

/**
 * Calculates a unified composite cost for a candidate route.
 *
 * @param {Object} route - Route candidate object with duration, distance, safetyScore
 * @param {Array} onRouteIncidents - Incidents located directly along this route
 * @returns {Object} { compositeCost, durationSeconds, safetyScore, safetyRiskPenalty, incidentDelaySeconds }
 */
export function calculateRouteCompositeCost(route, onRouteIncidents = []) {
  if (!route) {
    return {
      compositeCost: Infinity,
      durationSeconds: 0,
      safetyScore: MIN_SAFETY_SCORE,
      safetyRiskPenalty: BASE_SAFETY_SCORE - MIN_SAFETY_SCORE,
      incidentDelaySeconds: 0,
    }
  }

  const durationSeconds = Number(route.duration) || (Number(route.durationMin || 0) * 60) || 0
  const safetyScore = Math.max(MIN_SAFETY_SCORE, Math.min(MAX_SAFETY_SCORE, Number(route.safetyScore ?? 85)))
  const safetyRiskPenalty = Math.max(0, BASE_SAFETY_SCORE - safetyScore)

  // Sum incident delays on this route
  let incidentDelaySeconds = 0
  if (Array.isArray(onRouteIncidents) && onRouteIncidents.length > 0) {
    for (const inc of onRouteIncidents) {
      if (inc.delaySeconds && inc.delaySeconds > 0) {
        incidentDelaySeconds += Number(inc.delaySeconds)
      } else {
        // Fallback delay estimate by severity
        const sev = String(inc.severity || '').toLowerCase()
        if (sev === 'critical') incidentDelaySeconds += 360
        else if (sev === 'high') incidentDelaySeconds += 180
        else if (sev === 'medium') incidentDelaySeconds += 60
        else incidentDelaySeconds += 20
      }
    }
  }

  const compositeCost = Math.round(
    (durationSeconds * ETA_WEIGHT) +
    (safetyRiskPenalty * SAFETY_PENALTY_WEIGHT) +
    (incidentDelaySeconds * INCIDENT_DELAY_WEIGHT)
  )

  return {
    compositeCost,
    durationSeconds,
    safetyScore,
    safetyRiskPenalty,
    incidentDelaySeconds,
  }
}

/**
 * Compares current active route with an alternative candidate to determine
 * whether a reroute prompt should be surfaced to the user.
 *
 * @param {Object} currentRoute - The route user is currently following
 * @param {Object} alternativeRoute - Newly calculated candidate route
 * @param {Object} options - Current travel parameters (progressMeters, activeIncidentsAhead)
 * @returns {Object} Reroute assessment with `shouldPrompt`, `timeSavedSeconds`, `reason`
 */
export function evaluateRerouteRecommendation(currentRoute, alternativeRoute, options = {}) {
  const {
    currentRemainingSeconds = (currentRoute?.duration || 0),
    activeIncidentsAhead = [],
    alternativeIncidents = [],
  } = options

  if (!currentRoute || !alternativeRoute) {
    return { shouldPrompt: false, reason: 'Missing candidate routes' }
  }

  const currentCostObj = calculateRouteCompositeCost(
    { ...currentRoute, duration: currentRemainingSeconds },
    activeIncidentsAhead
  )
  const altCostObj = calculateRouteCompositeCost(alternativeRoute, alternativeIncidents)

  const timeDeltaSeconds = currentCostObj.durationSeconds - altCostObj.durationSeconds
  const safetyDelta = altCostObj.safetyScore - currentCostObj.safetyScore
  const costDelta = currentCostObj.compositeCost - altCostObj.compositeCost

  // Check 1: Severe incident ahead on current route that alternative avoids
  const severeIncidentAhead = activeIncidentsAhead.find(i => {
    const sev = String(i.severity || '').toLowerCase()
    return sev === 'critical' || sev === 'high' || (i.type && /accident|road_closed|flood/i.test(i.type))
  })

  if (severeIncidentAhead && (!alternativeIncidents.length || safetyDelta >= 5)) {
    const incidentName = severeIncidentAhead.label || severeIncidentAhead.title || severeIncidentAhead.type || 'Severe Hazard'
    return {
      shouldPrompt: true,
      type: 'INCIDENT_AVOIDANCE',
      reason: `Avoids ${incidentName} reported ahead`,
      timeDeltaSeconds,
      timeSavedMinutes: Math.max(0, Math.round(timeDeltaSeconds / 60)),
      safetyDelta,
      currentCost: currentCostObj.compositeCost,
      altCost: altCostObj.compositeCost,
      alternativeRoute,
    }
  }

  // Check 2: Significant time savings (>= 1.5 min) without degrading safety
  if (timeDeltaSeconds >= ETA_DELTA_REROUTE_THRESHOLD_SECONDS && safetyDelta >= -5) {
    const minsSaved = Math.round(timeDeltaSeconds / 60)
    return {
      shouldPrompt: true,
      type: 'FASTER_ROUTE',
      reason: `Saves ${minsSaved} min${minsSaved === 1 ? '' : 's'} via ${alternativeRoute.viaRoads || 'Alternative Corridor'}`,
      timeDeltaSeconds,
      timeSavedMinutes: minsSaved,
      safetyDelta,
      currentCost: currentCostObj.compositeCost,
      altCost: altCostObj.compositeCost,
      alternativeRoute,
    }
  }

  // Check 3: Significant safety improvement (e.g. user took a turn into a well-lit bridge)
  if (safetyDelta >= SAFETY_DELTA_REROUTE_THRESHOLD && timeDeltaSeconds >= -120) {
    return {
      shouldPrompt: true,
      type: 'SAFER_ROUTE',
      reason: `Safer corridor (+${safetyDelta} safety score) with minimal delay`,
      timeDeltaSeconds,
      timeSavedMinutes: Math.round(timeDeltaSeconds / 60),
      safetyDelta,
      currentCost: currentCostObj.compositeCost,
      altCost: altCostObj.compositeCost,
      alternativeRoute,
    }
  }

  // Check 4: General composite cost improvement
  if (costDelta >= COMPOSITE_COST_DELTA_THRESHOLD && timeDeltaSeconds > 0) {
    const mins = Math.max(1, Math.round(timeDeltaSeconds / 60))
    return {
      shouldPrompt: true,
      type: 'OPTIMIZED_ROUTE',
      reason: `Optimized route saves ${mins} min with better road conditions`,
      timeDeltaSeconds,
      timeSavedMinutes: mins,
      safetyDelta,
      currentCost: currentCostObj.compositeCost,
      altCost: altCostObj.compositeCost,
      alternativeRoute,
    }
  }

  return {
    shouldPrompt: false,
    reason: 'Current route remains optimal',
    timeDeltaSeconds,
    safetyDelta,
    costDelta,
  }
}

