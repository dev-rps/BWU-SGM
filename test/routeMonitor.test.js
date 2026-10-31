import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  RouteMonitor,
  POLL_INTERVAL_FAST_MS,
  POLL_INTERVAL_SLOW_MS,
  POLL_INTERVAL_STATIONARY_INITIAL_MS,
  GPS_WATCHDOG_TIMEOUT_MS,
} from '../src/services/routeMonitor.js'

describe('Route Monitor Module', () => {
  let monitor
  const samplePolyline = [
    [88.3500, 22.5700],
    [88.3550, 22.5700],
    [88.3600, 22.5700],
  ]

  const activeRoute = {
    id: 'route_main',
    geometry: samplePolyline,
    duration: 600,
    distance: 1200,
    destination: { lat: 22.5700, lng: 88.3600 },
  }

  afterEach(() => {
    if (monitor) {
      monitor.stop()
      monitor = null
    }
  })

  describe('Deviation Detection', () => {
    it('detects off-route deviation after consecutive off-route ticks', () => {
      let deviationEvent = null

      monitor = new RouteMonitor({
        activeRoute,
        offRouteThresholdMeters: 55,
        offRouteConsecutiveTicks: 2,
        onDeviation: (info) => {
          deviationEvent = info
        },
      })
      monitor.start()

      // Point 1: On-route at [22.5700, 88.3510]
      const tick1 = monitor.updatePosition(22.5700, 88.3510, 20)
      assert.equal(tick1.isOffRoute, false)
      assert.equal(deviationEvent, null)

      // Point 2: Diverges 120m away to the north [22.5711, 88.3510] - Tick 1 of off-route
      const tick2 = monitor.updatePosition(22.5711, 88.3510, 20)
      assert.ok(tick2.distanceToRouteMeters > 55)
      assert.equal(tick2.consecutiveTicks, 1)
      assert.equal(deviationEvent, null) // Needs 2 consecutive ticks

      // Point 3: Still diverged 120m away - Tick 2 of off-route (triggers deviation)
      const tick3 = monitor.updatePosition(22.5711, 88.3510, 20)
      assert.equal(tick3.isOffRoute, true)
      assert.notEqual(deviationEvent, null)
      assert.ok(deviationEvent.distanceMeters > 55)
    })

    it('resets consecutive off-route count when user rejoins route corridor', () => {
      monitor = new RouteMonitor({
        activeRoute,
        offRouteThresholdMeters: 55,
        offRouteConsecutiveTicks: 2,
      })
      monitor.start()

      // Diverge once
      monitor.updatePosition(22.5711, 88.3510, 20)
      assert.equal(monitor.consecutiveOffRouteCount, 1)

      // Re-enter corridor
      const recovered = monitor.updatePosition(22.5700, 88.3510, 20)
      assert.equal(recovered.isOffRoute, false)
      assert.equal(monitor.consecutiveOffRouteCount, 0)
    })
  })

  describe('Incident Ahead Detection & Reroute Prompt', () => {
    it('triggers onIncidentAhead and onReroutePrompt when hazard appears ahead', async () => {
      let promptReceived = null
      let incidentAheadReceived = null

      const fasterAlt = {
        id: 'alt_bypass',
        viaRoads: 'Northern Bypass Corridor',
        duration: 420, // Saves 180s (3 mins)
        safetyScore: 92,
        geometry: [
          [88.3500, 22.5700],
          [88.3550, 22.5750],
          [88.3600, 22.5700],
        ],
      }

      monitor = new RouteMonitor({
        activeRoute,
        fetchIncidents: async () => [
          {
            id: 'tanker_spill',
            lat: 22.5700,
            lng: 88.3580, // Located forward on route polyline
            type: 'accident',
            label: 'Oil Tanker Spill',
            severity: 'critical',
            delaySeconds: 400,
          },
        ],
        fetchAlternativeRoutes: async () => [fasterAlt],
        onIncidentAhead: (inc) => {
          incidentAheadReceived = inc
        },
        onReroutePrompt: (rec) => {
          promptReceived = rec
        },
      })

      monitor.start()
      // Position vehicle at start of route
      monitor.updatePosition(22.5700, 88.3500, 25)

      const result = await monitor.checkCorridorIncidents()

      assert.notEqual(result, null)
      assert.notEqual(incidentAheadReceived, null)
      assert.equal(incidentAheadReceived.id, 'tanker_spill')

      assert.notEqual(promptReceived, null)
      assert.equal(promptReceived.shouldPrompt, true)
      assert.equal(promptReceived.type, 'INCIDENT_AVOIDANCE')
    })
  })

  describe('Adaptive Stationary Backoff', () => {
    it('adapts poll interval depending on moving vs stationary speed', () => {
      monitor = new RouteMonitor({ activeRoute })
      monitor.start()

      // Fast moving (> 15 km/h)
      monitor.updatePosition(22.5700, 88.3500, 35)
      assert.equal(monitor.currentSpeedKmh, 35)

      // Stationary (< 3 km/h)
      monitor.updatePosition(22.5700, 88.3500, 0)
      assert.equal(monitor.currentSpeedKmh, 0)
      assert.equal(monitor._currentStationaryInterval, POLL_INTERVAL_STATIONARY_INITIAL_MS)
    })
  })

  describe('GPS Watchdog', () => {
    it('fires onGpsStatusChange when GPS timeout threshold is exceeded', async () => {
      let gpsStatus = null

      monitor = new RouteMonitor({
        activeRoute,
        gpsWatchdogTimeoutMs: 100, // Short threshold for fast test
        onGpsStatusChange: (status) => {
          gpsStatus = status
        },
      })

      monitor.start()
      monitor.updatePosition(22.5700, 88.3500, 20)
      assert.equal(monitor.isGpsHealthy, true)

      // Simulate passage of time past watchdog threshold
      monitor.lastPositionTimestamp = Date.now() - 500

      // Trigger watchdog interval tick
      await new Promise(r => setTimeout(r, 120))

      // Update position resumes healthy GPS status
      monitor.updatePosition(22.5700, 88.3501, 20)
      assert.equal(monitor.isGpsHealthy, true)
    })
  })

  describe('updateActiveRoute', () => {
    it('seamlessly updates active polyline and resets deviation counts', () => {
      monitor = new RouteMonitor({ activeRoute })
      monitor.start()

      monitor.consecutiveOffRouteCount = 5
      monitor.isOffRoute = true

      const newRoute = {
        id: 'new_route',
        geometry: [[88.350, 22.570], [88.352, 22.572]],
        duration: 500,
        distance: 1000,
      }

      monitor.updateActiveRoute(newRoute)

      assert.equal(monitor.activeRoute.id, 'new_route')
      assert.equal(monitor.consecutiveOffRouteCount, 0)
      assert.equal(monitor.isOffRoute, false)
    })
  })
})

