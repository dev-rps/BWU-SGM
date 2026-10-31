import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  calculateRouteCompositeCost,
  evaluateRerouteRecommendation,
  ETA_WEIGHT,
  SAFETY_PENALTY_WEIGHT,
  INCIDENT_DELAY_WEIGHT,
  OFF_ROUTE_THRESHOLD_METERS,
  ETA_DELTA_REROUTE_THRESHOLD_SECONDS,
  SAFETY_DELTA_REROUTE_THRESHOLD,
  COMPOSITE_COST_DELTA_THRESHOLD,
} from '../src/services/routeScoring.js'

describe('Route Scoring Engine', () => {
  it('correctly calculates composite cost from duration, safety score, and incidents', () => {
    const route = {
      duration: 600, // 10 minutes (600s)
      safetyScore: 90, // 10 point penalty
    }
    const incidents = [
      { severity: 'high', delaySeconds: 120 },
    ]

    const result = calculateRouteCompositeCost(route, incidents)

    // Expected compositeCost = (600 * 1.0) + ((100 - 90) * 18.0) + (120 * 1.35)
    // = 600 + 180 + 162 = 942
    assert.equal(result.durationSeconds, 600)
    assert.equal(result.safetyScore, 90)
    assert.equal(result.safetyRiskPenalty, 10)
    assert.equal(result.incidentDelaySeconds, 120)
    assert.equal(result.compositeCost, 942)
  })

  it('handles empty or missing route gracefully with infinite cost', () => {
    const result = calculateRouteCompositeCost(null)
    assert.equal(result.compositeCost, Infinity)
  })

  it('evaluates incident avoidance when active hazard appears on current route', () => {
    const currentRoute = {
      id: 'current_1',
      duration: 900,
      safetyScore: 85,
    }
    const alternativeRoute = {
      id: 'alt_1',
      viaRoads: 'Belgharia Expressway Bypass',
      duration: 880,
      safetyScore: 92,
    }
    const activeIncidentsAhead = [
      { id: 'inc_1', type: 'accident', severity: 'critical', label: 'Overturned Tanker' },
    ]

    const decision = evaluateRerouteRecommendation(currentRoute, alternativeRoute, {
      activeIncidentsAhead,
      alternativeIncidents: [],
    })

    assert.equal(decision.shouldPrompt, true)
    assert.equal(decision.type, 'INCIDENT_AVOIDANCE')
    assert.match(decision.reason, /Overturned Tanker/i)
  })

  it('recommends faster route when time saved exceeds threshold without compromising safety', () => {
    const currentRoute = {
      id: 'current_1',
      duration: 1200,
      safetyScore: 88,
    }
    const alternativeRoute = {
      id: 'alt_1',
      viaRoads: 'Kona Expressway Flyover',
      duration: 960, // 240 seconds faster (4 mins)
      safetyScore: 88,
    }

    const decision = evaluateRerouteRecommendation(currentRoute, alternativeRoute, {
      activeIncidentsAhead: [],
      alternativeIncidents: [],
    })

    assert.equal(decision.shouldPrompt, true)
    assert.equal(decision.type, 'FASTER_ROUTE')
    assert.equal(decision.timeSavedMinutes, 4)
    assert.match(decision.reason, /Kona Expressway Flyover/i)
  })

  it('does NOT prompt reroute when time saved is trivial (e.g. 20s)', () => {
    const currentRoute = {
      id: 'current_1',
      duration: 600,
      safetyScore: 90,
    }
    const alternativeRoute = {
      id: 'alt_1',
      duration: 580, // only 20 seconds
      safetyScore: 90,
    }

    const decision = evaluateRerouteRecommendation(currentRoute, alternativeRoute, {
      activeIncidentsAhead: [],
      alternativeIncidents: [],
    })

    assert.equal(decision.shouldPrompt, false)
    assert.match(decision.reason, /optimal/i)
  })

  it('prompts safer route when route safety score improves significantly with minimal delay', () => {
    const currentRoute = {
      id: 'current_dark_alley',
      duration: 700,
      safetyScore: 72,
    }
    const alternativeRoute = {
      id: 'alt_well_lit_arterial',
      viaRoads: 'Vidyasagar Setu Arterial',
      duration: 730, // 30s slower but +16 safety points
      safetyScore: 88,
    }

    const decision = evaluateRerouteRecommendation(currentRoute, alternativeRoute, {
      activeIncidentsAhead: [],
      alternativeIncidents: [],
    })

    assert.equal(decision.shouldPrompt, true)
    assert.equal(decision.type, 'SAFER_ROUTE')
    assert.equal(decision.safetyDelta, 16)
  })
})

