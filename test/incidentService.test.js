import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  haversineMeters,
  calculateAgeDecayFactor,
  calculateConfidenceScore,
  mergeAndDeduplicateIncidents,
  filterIncidentsAlongCorridor,
  injectFakeIncident,
  clearFakeIncidents,
  getInjectedFakeIncidents,
  INCIDENT_DEDUPE_METERS,
  INCIDENT_TTL_HOURS,
} from '../src/services/incidentService.js'

describe('Incident Service', () => {
  beforeEach(() => {
    clearFakeIncidents()
  })

  describe('Haversine & Distance Calculations', () => {
    it('calculates geographic distance accurately between two coordinates', () => {
      // Distance between Howrah Station (22.5857, 88.3426) and Dalhousie (22.5726, 88.3508) is ~1.7 km
      const dist = haversineMeters(22.5857, 88.3426, 22.5726, 88.3508)
      assert.ok(dist > 1600 && dist < 1850, `Expected ~1700m, got ${dist}`)
    })
  })

  describe('Age Decay & TTL Cutoff', () => {
    it('returns full weight 1.0 for brand new incidents under 2 hours', () => {
      const fresh = new Date().toISOString()
      assert.equal(calculateAgeDecayFactor(fresh), 1.0)
    })

    it('decays factor for older incidents (e.g. 12 hours old)', () => {
      const twelveHoursAgo = new Date(Date.now() - 12 * 3600 * 1000).toISOString()
      const factor = calculateAgeDecayFactor(twelveHoursAgo)
      assert.ok(factor < 1.0 && factor >= 0.6)
    })

    it('returns 0.0 for incidents exceeding TTL (72 hours)', () => {
      const fourDaysAgo = new Date(Date.now() - 96 * 3600 * 1000).toISOString()
      assert.equal(calculateAgeDecayFactor(fourDaysAgo), 0.0)
    })
  })

  describe('Confidence Scoring', () => {
    it('calculates higher confidence when multiple users confirm and upvote', () => {
      const soloReport = calculateConfidenceScore({
        source: 'user_report',
        clusterCount: 1,
        upvotes: 0,
        verificationCount: 0,
        ageDecay: 1.0,
      })

      const multiConfirmed = calculateConfidenceScore({
        source: 'user_report',
        clusterCount: 3,
        upvotes: 5,
        verificationCount: 2,
        ageDecay: 1.0,
      })

      assert.ok(multiConfirmed > soloReport, `Expected ${multiConfirmed} > ${soloReport}`)
      assert.ok(multiConfirmed >= 0.8)
    })

    it('penalizes confidence when downvoted', () => {
      const downvoted = calculateConfidenceScore({
        source: 'user_report',
        downvotes: 4,
        ageDecay: 1.0,
      })
      assert.ok(downvoted < 0.5)
    })
  })

  describe('Deduplication & Clustering', () => {
    it('clusters multiple user reports within 75m into a single aggregated incident', () => {
      const reports = [
        {
          id: 'rep_1',
          hazard_type: 'waterlogging',
          severity: 'medium',
          latitude: 22.57000,
          longitude: 88.36000,
          upvotes: [1, 2],
        },
        {
          id: 'rep_2',
          hazard_type: 'waterlogging',
          severity: 'high', // Higher severity upgrade
          latitude: 22.57020, // ~25m away
          longitude: 88.36010,
          upvotes: [3],
        },
      ]

      const merged = mergeAndDeduplicateIncidents(reports, [])

      assert.equal(merged.length, 1, 'Should cluster 2 reports within 75m into 1')
      assert.equal(merged[0].clusterCount, 2)
      assert.equal(merged[0].severity, 'high') // Upgraded to highest severity
      assert.ok(merged[0].delaySeconds > 0)
    })

    it('filters out stale expired reports exceeding TTL', () => {
      const reports = [
        {
          id: 'stale_rep',
          hazard_type: 'pothole',
          latitude: 22.58000,
          longitude: 88.37000,
          created_at: new Date(Date.now() - 100 * 3600 * 1000).toISOString(), // 100h old
        },
      ]

      const merged = mergeAndDeduplicateIncidents(reports, [])
      assert.equal(merged.length, 0, 'Stale report must be filtered out')
    })
  })

  describe('Corridor Buffer Filtering', () => {
    it('retains incidents located within corridor buffer and excludes far incidents', () => {
      // Route polyline from [88.350, 22.570] to [88.360, 22.570]
      const polyline = [
        [88.350, 22.570],
        [88.360, 22.570],
      ]

      const incidents = [
        {
          id: 'near_incident',
          lat: 22.5705, // ~55m north of the polyline
          lng: 88.3550,
          type: 'accident',
        },
        {
          id: 'far_incident',
          lat: 22.6100, // ~4.4 km away
          lng: 88.3550,
          type: 'traffic',
        },
      ]

      const corridorIncidents = filterIncidentsAlongCorridor(incidents, polyline, 250, true)

      assert.equal(corridorIncidents.length, 1)
      assert.equal(corridorIncidents[0].id, 'near_incident')
      assert.ok(corridorIncidents[0].distanceToRouteMeters <= 250)
    })
  })

  describe('Synthetic Hazard Injector (Simulation Demo)', () => {
    it('injects fake incident and automatically surfaces in merged list', () => {
      injectFakeIncident({
        lat: 22.5750,
        lng: 88.3650,
        type: 'accident',
        label: 'Simulated Jackknifed Tanker',
        severity: 'critical',
      })

      const list = getInjectedFakeIncidents()
      assert.equal(list.length, 1)
      assert.equal(list[0].label, 'Simulated Jackknifed Tanker')

      const merged = mergeAndDeduplicateIncidents([], [])
      assert.equal(merged.length, 1)
      assert.equal(merged[0].label, 'Simulated Jackknifed Tanker')

      clearFakeIncidents()
      assert.equal(getInjectedFakeIncidents().length, 0)
    })
  })
})

