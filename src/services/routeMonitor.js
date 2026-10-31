/**
 * src/services/routeMonitor.js
 *
 * Standalone Headless Route Monitor & Dynamic Rerouting Engine.
 *
 * Decoupled from UI components for pure testability and zero DOM dependence.
 * Features:
 *   - Continuous corridor surveillance with adaptive stationary backoff.
 *   - Off-route deviation detection with debounced consecutive ticks.
 *   - Corridor hazard observer for newly reported incidents ahead.
 *   - Multi-criteria reroute recommendation scoring (ETA + Safety penalty).
 *   - GPS heartbeat watchdog (flags signal degradation / offline GPS loss).
 *   - Clean event callbacks with in-flight request deduplication.
 */

import {
  calculateRouteCompositeCost,
  evaluateRerouteRecommendation,
  OFF_ROUTE_THRESHOLD_METERS,
  OFF_ROUTE_CONSECUTIVE_TICKS,
} from './routeScoring.js'

import {
  filterIncidentsAlongCorridor,
  mergeAndDeduplicateIncidents,
  haversineMeters,
  pointToSegmentMeters,
} from './incidentService.js'

// ─── Default Polling & Watchdog Intervals (ms) ─────────────────────────────────
export const POLL_INTERVAL_FAST_MS = 30000        // > 15 km/h: every 30s
export const POLL_INTERVAL_SLOW_MS = 60000        // 3-15 km/h: every 60s
export const POLL_INTERVAL_STATIONARY_INITIAL_MS = 60000
export const POLL_INTERVAL_STATIONARY_MAX_MS = 180000 // Stationary backoff up to 3 mins
export const GPS_WATCHDOG_TIMEOUT_MS = 12000      // Warn if GPS silent for 12s

export class RouteMonitor {
  /**
   * @param {Object} options
   * @param {Object} options.activeRoute - Active route object (with geometry, duration, distance)
   * @param {Object} [options.destination] - { lat, lng }
   * @param {string} [options.transportMode] - 'driving' | 'motorcycle' | 'walking' | 'bicycle'
   * @param {Function} [options.fetchIncidents] - async () => Array of raw reports
   * @param {Function} [options.fetchAlternativeRoutes] - async (fromLat, fromLng, toLat, toLng, mode) => Array of candidate routes
   * @param {number} [options.corridorBufferMeters] - Buffer width along polyline (default 250m)
   * @param {number} [options.offRouteThresholdMeters] - Distance deviation to flag off-route (default 55m)
   * @param {number} [options.offRouteConsecutiveTicks] - Consecutive readings before reroute (default 2)
   * @param {number} [options.gpsWatchdogTimeoutMs] - GPS timeout threshold (default 12000ms)
   * @param {Function} [options.onReroutePrompt] - ({ recommendation, alternativeRoute }) => void
   * @param {Function} [options.onDeviation] - ({ lat, lng, distanceMeters }) => void
   * @param {Function} [options.onIncidentAhead] - (incident) => void
   * @param {Function} [options.onGpsStatusChange] - ({ isHealthy, lastUpdateAgeMs }) => void
   * @param {Function} [options.onProgressUpdate] - (progressInfo) => void
   */
  constructor(options = {}) {
    this.activeRoute = options.activeRoute || null
    this.transportMode = options.transportMode || 'driving'
    this.corridorBufferMeters = options.corridorBufferMeters || 250
    this.offRouteThresholdMeters = options.offRouteThresholdMeters || OFF_ROUTE_THRESHOLD_METERS
    this.offRouteConsecutiveTicks = options.offRouteConsecutiveTicks || OFF_ROUTE_CONSECUTIVE_TICKS
    this.gpsWatchdogTimeoutMs = options.gpsWatchdogTimeoutMs || GPS_WATCHDOG_TIMEOUT_MS

    // Custom fetch providers (can be injected for tests or production)
    this.fetchIncidents = options.fetchIncidents || null
    this.fetchAlternativeRoutes = options.fetchAlternativeRoutes || null

    // Event callbacks
    this.onReroutePrompt = options.onReroutePrompt || (() => {})
    this.onDeviation = options.onDeviation || (() => {})
    this.onIncidentAhead = options.onIncidentAhead || (() => {})
    this.onGpsStatusChange = options.onGpsStatusChange || (() => {})
    this.onProgressUpdate = options.onProgressUpdate || (() => {})

    // Dynamic Tracking State
    this.isRunning = false
    this.currentPosition = null
    this.currentSpeedKmh = 0
    this.lastPositionTimestamp = null
    this.consecutiveOffRouteCount = 0
    this.isOffRoute = false
    this.isGpsHealthy = true
    this.lastIncidentIdsAhead = new Set()
    this.activeRecommendation = null

    // Polling and Watchdog handles
    this._pollTimer = null
    this._watchdogTimer = null
    this._currentStationaryInterval = POLL_INTERVAL_STATIONARY_INITIAL_MS
    this._inFlightCheck = false

    // Extract destination coordinate
    this.destination = options.destination || this._extractDestination(this.activeRoute)
  }

  // ─── Lifecycle Management ────────────────────────────────────────────────────

  start() {
    if (this.isRunning) return
    this.isRunning = true
    this.lastPositionTimestamp = Date.now()
    this.isGpsHealthy = true

    this._startGpsWatchdog()
    this._scheduleNextPoll(1000) // Initial check shortly after start
  }

  stop() {
    this.isRunning = false
    if (this._pollTimer) {
      clearTimeout(this._pollTimer)
      this._pollTimer = null
    }
    if (this._watchdogTimer) {
      clearInterval(this._watchdogTimer)
      this._watchdogTimer = null
    }
    this._inFlightCheck = false
  }

  /**
   * Updates the active route when user accepts a reroute or selects an alternate.
   */
  updateActiveRoute(newRoute) {
    if (!newRoute) return
    this.activeRoute = newRoute
    this.consecutiveOffRouteCount = 0
    this.isOffRoute = false
    this.activeRecommendation = null
    this.lastIncidentIdsAhead.clear()
    this.destination = this._extractDestination(newRoute) || this.destination
  }

  // ─── Location Ingestion & Off-Route Detection ─────────────────────────────────

  /**
   * Ingests a new position update from GPS or simulator.
   *
   * @param {number} lat - Latitude
   * @param {number} lng - Longitude
   * @param {number} [speedKmh] - Speed in km/h
   * @param {number} [heading] - Heading in degrees
   * @returns {Object} { isOffRoute, distanceToRouteMeters, progressMeters }
   */
  updatePosition(lat, lng, speedKmh = 0, heading = 0) {
    if (!isFinite(lat) || !isFinite(lng)) return { isOffRoute: false, distanceToRouteMeters: 0 }

    const now = Date.now()
    this.lastPositionTimestamp = now
    this.currentPosition = { lat, lng, speedKmh, heading }
    this.currentSpeedKmh = speedKmh

    // Recover GPS status if previously marked unhealthy
    if (!this.isGpsHealthy) {
      this.isGpsHealthy = true
      this.onGpsStatusChange({ isHealthy: true, lastUpdateAgeMs: 0 })
    }

    // Measure distance to active polyline
    const polyline = this._getPolylineCoords()
    if (!polyline || polyline.length < 2) {
      return { isOffRoute: false, distanceToRouteMeters: 0 }
    }

    const distMeters = this._calculateDistanceToPolyline(lat, lng, polyline)

    if (distMeters > this.offRouteThresholdMeters) {
      this.consecutiveOffRouteCount += 1
      if (this.consecutiveOffRouteCount >= this.offRouteConsecutiveTicks) {
        if (!this.isOffRoute) {
          this.isOffRoute = true
          this.onDeviation({
            lat,
            lng,
            distanceMeters: Math.round(distMeters),
            threshold: this.offRouteThresholdMeters,
          })
          // Automatically trigger immediate reroute evaluation on verified deviation
          this.evaluateDeviationReroute(lat, lng)
        }
      }
    } else {
      this.consecutiveOffRouteCount = 0
      this.isOffRoute = false
    }

    // Calculate remaining distance along route
    const progress = this._calculateRouteProgress(lat, lng, polyline)
    this.onProgressUpdate(progress)

    return {
      isOffRoute: this.isOffRoute,
      distanceToRouteMeters: Math.round(distMeters),
      consecutiveTicks: this.consecutiveOffRouteCount,
      progress,
    }
  }

  // ─── Continuous Corridor Surveillance & Reroute Evaluation ────────────────────

  /**
   * Executes a periodic evaluation pass:
   *  1. Merges and filters active corridor incidents ahead.
   *  2. Evaluates alternative candidate routes if hazards or delays appear.
   *  3. Fires `onReroutePrompt` if a better route is found.
   */
  async checkCorridorIncidents() {
    if (!this.isRunning || this._inFlightCheck) return null
    if (!this.currentPosition || !this.activeRoute) return null

    this._inFlightCheck = true

    try {
      // 1. Fetch raw incidents along route
      let rawReports = []
      if (typeof this.fetchIncidents === 'function') {
        try {
          rawReports = await this.fetchIncidents(this.currentPosition)
        } catch (fetchErr) {
          console.warn('[RouteMonitor] Incident fetch failed:', fetchErr.message)
        }
      }

      // Merge & Deduplicate
      const activeIncidents = mergeAndDeduplicateIncidents(rawReports, [])
      const polyline = this._getPolylineCoords()
      const corridorIncidents = filterIncidentsAlongCorridor(
        activeIncidents,
        polyline,
        this.corridorBufferMeters,
        this._isPolylineLngLat(polyline)
      )

      // Filter incidents located *ahead* of current position
      const incidentsAhead = this._filterIncidentsAhead(this.currentPosition, polyline, corridorIncidents)

      // Notify on new high-severity incidents ahead
      for (const inc of incidentsAhead) {
        if (!this.lastIncidentIdsAhead.has(inc.id)) {
          this.lastIncidentIdsAhead.add(inc.id)
          const sev = String(inc.severity || '').toLowerCase()
          if (sev === 'critical' || sev === 'high') {
            this.onIncidentAhead(inc)
          }
        }
      }

      // If incidents ahead or we have alternative routes available, evaluate reroute
      if (this.destination && typeof this.fetchAlternativeRoutes === 'function') {
        const candidates = await this.fetchAlternativeRoutes(
          this.currentPosition.lat,
          this.currentPosition.lng,
          this.destination.lat,
          this.destination.lng,
          this.transportMode
        ).catch(() => [])

        if (Array.isArray(candidates) && candidates.length > 0) {
          this._evaluateCandidates(candidates, incidentsAhead)
        }
      }

      return {
        corridorIncidentsCount: corridorIncidents.length,
        incidentsAheadCount: incidentsAhead.length,
        incidentsAhead,
      }
    } finally {
      this._inFlightCheck = false
    }
  }

  /**
   * Triggered immediately when a deviation off-route is detected.
   */
  async evaluateDeviationReroute(lat, lng) {
    if (!this.destination || typeof this.fetchAlternativeRoutes !== 'function') return null

    try {
      const candidates = await this.fetchAlternativeRoutes(
        lat,
        lng,
        this.destination.lat,
        this.destination.lng,
        this.transportMode
      )

      if (Array.isArray(candidates) && candidates.length > 0) {
        const bestAlt = candidates[0]
        const rec = {
          shouldPrompt: true,
          type: 'OFF_ROUTE_REROUTE',
          reason: 'Recalculating route from current position',
          timeDeltaSeconds: 0,
          timeSavedMinutes: 0,
          safetyDelta: 0,
          alternativeRoute: bestAlt,
        }
        this.activeRecommendation = rec
        this.onReroutePrompt(rec)
        return rec
      }
    } catch (err) {
      console.warn('[RouteMonitor] Off-route recalculation failed:', err.message)
    }
    return null
  }

  // ─── Adaptive Scheduling with Stationary Backoff ──────────────────────────────

  _scheduleNextPoll(delayMs = null) {
    if (!this.isRunning) return
    if (this._pollTimer) clearTimeout(this._pollTimer)

    let nextDelay = delayMs
    if (nextDelay === null) {
      if (this.currentSpeedKmh > 15) {
        // Fast moving: normal 30s polling
        nextDelay = POLL_INTERVAL_FAST_MS
        this._currentStationaryInterval = POLL_INTERVAL_STATIONARY_INITIAL_MS
      } else if (this.currentSpeedKmh >= 3) {
        // Slow moving: 60s polling
        nextDelay = POLL_INTERVAL_SLOW_MS
        this._currentStationaryInterval = POLL_INTERVAL_STATIONARY_INITIAL_MS
      } else {
        // Stationary (< 3 km/h): exponential backoff up to 180s
        nextDelay = this._currentStationaryInterval
        this._currentStationaryInterval = Math.min(
          POLL_INTERVAL_STATIONARY_MAX_MS,
          Math.round(this._currentStationaryInterval * 1.5)
        )
      }
    }

    this._pollTimer = setTimeout(async () => {
      await this.checkCorridorIncidents()
      if (this.isRunning) {
        this._scheduleNextPoll()
      }
    }, nextDelay)
  }

  // ─── GPS Watchdog ────────────────────────────────────────────────────────────

  _startGpsWatchdog() {
    if (this._watchdogTimer) clearInterval(this._watchdogTimer)

    this._watchdogTimer = setInterval(() => {
      if (!this.isRunning) return
      const now = Date.now()
      const ageMs = now - (this.lastPositionTimestamp || now)

      if (ageMs > this.gpsWatchdogTimeoutMs && this.isGpsHealthy) {
        this.isGpsHealthy = false
        this.onGpsStatusChange({
          isHealthy: false,
          lastUpdateAgeMs: ageMs,
          message: 'GPS signal weak or lost. Retaining last active route.',
        })
      }
    }, 3000)
  }

  // ─── Internal Candidates Evaluation ──────────────────────────────────────────

  _evaluateCandidates(candidates, activeIncidentsAhead) {
    if (!this.activeRoute || !candidates.length) return

    for (const alt of candidates) {
      // Don't compare identical route objects
      if (alt === this.activeRoute) continue

      const rec = evaluateRerouteRecommendation(this.activeRoute, alt, {
        activeIncidentsAhead,
        alternativeIncidents: [],
      })

      if (rec.shouldPrompt) {
        this.activeRecommendation = rec
        this.onReroutePrompt(rec)
        break // Prompt user with the best recommendation
      }
    }
  }

  // ─── Polyline & Spatial Utilities ─────────────────────────────────────────────

  _getPolylineCoords() {
    if (!this.activeRoute) return []
    if (Array.isArray(this.activeRoute.geometry)) {
      return this.activeRoute.geometry
    }
    if (Array.isArray(this.activeRoute.coordinates)) {
      return this.activeRoute.coordinates
    }
    return []
  }

  _isPolylineLngLat(coords) {
    if (!coords || !coords[0]) return true
    const first = coords[0]
    // In India (Kolkata/WB), Lat is ~22-23, Lng is ~88.
    // If first[0] is > 50, then first[0] is Lng, so [lng, lat] format is true.
    return (first[0] || 0) > 50
  }

  _calculateDistanceToPolyline(lat, lng, polyline) {
    let minDist = Infinity
    const isLngLat = this._isPolylineLngLat(polyline)

    for (let i = 0; i < polyline.length - 1; i++) {
      const a = polyline[i]
      const b = polyline[i + 1]

      const aLat = isLngLat ? a[1] : a[0]
      const aLng = isLngLat ? a[0] : a[1]
      const bLat = isLngLat ? b[1] : b[0]
      const bLng = isLngLat ? b[0] : b[1]

      const d = pointToSegmentMeters(lat, lng, aLat, aLng, bLat, bLng)
      if (d < minDist) {
        minDist = d
      }
    }

    return minDist === Infinity ? 0 : minDist
  }

  _filterIncidentsAhead(currentPos, polyline, corridorIncidents) {
    if (!corridorIncidents.length) return []
    const isLngLat = this._isPolylineLngLat(polyline)

    // Find index of closest polyline segment to current position
    let closestSegmentIdx = 0
    let minDist = Infinity

    for (let i = 0; i < polyline.length - 1; i++) {
      const a = polyline[i]
      const b = polyline[i + 1]
      const aLat = isLngLat ? a[1] : a[0]
      const aLng = isLngLat ? a[0] : a[1]
      const bLat = isLngLat ? b[1] : b[0]
      const bLng = isLngLat ? b[0] : b[1]

      const d = pointToSegmentMeters(currentPos.lat, currentPos.lng, aLat, aLng, bLat, bLng)
      if (d < minDist) {
        minDist = d
        closestSegmentIdx = i
      }
    }

    // Remaining polyline forward from closest segment
    const remainingPolyline = polyline.slice(closestSegmentIdx)

    return corridorIncidents.filter(inc => {
      // Must be along the forward remaining segment
      let distToForward = Infinity
      for (let i = 0; i < remainingPolyline.length - 1; i++) {
        const a = remainingPolyline[i]
        const b = remainingPolyline[i + 1]
        const aLat = isLngLat ? a[1] : a[0]
        const aLng = isLngLat ? a[0] : a[1]
        const bLat = isLngLat ? b[1] : b[0]
        const bLng = isLngLat ? b[0] : b[1]

        const d = pointToSegmentMeters(inc.lat, inc.lng, aLat, aLng, bLat, bLng)
        if (d < distToForward) distToForward = d
        if (d <= this.corridorBufferMeters) return true
      }
      return distToForward <= this.corridorBufferMeters
    })
  }

  _calculateRouteProgress(lat, lng, polyline) {
    const isLngLat = this._isPolylineLngLat(polyline)
    const totalDist = (this.activeRoute?.distance || 0)

    if (!polyline.length || totalDist <= 0) {
      return { remainingMeters: 0, percentComplete: 100 }
    }

    // Find closest segment index
    let closestIdx = 0
    let minD = Infinity
    for (let i = 0; i < polyline.length - 1; i++) {
      const a = polyline[i]
      const b = polyline[i + 1]
      const aLat = isLngLat ? a[1] : a[0]
      const aLng = isLngLat ? a[0] : a[1]
      const bLat = isLngLat ? b[1] : b[0]
      const bLng = isLngLat ? b[0] : b[1]

      const d = pointToSegmentMeters(lat, lng, aLat, aLng, bLat, bLng)
      if (d < minD) {
        minD = d
        closestIdx = i
      }
    }

    // Measure remaining polyline distance from closestIdx to end
    let remainingMeters = 0
    for (let i = closestIdx; i < polyline.length - 1; i++) {
      const a = polyline[i]
      const b = polyline[i + 1]
      const aLat = isLngLat ? a[1] : a[0]
      const aLng = isLngLat ? a[0] : a[1]
      const bLat = isLngLat ? b[1] : b[0]
      const bLng = isLngLat ? b[0] : b[1]
      remainingMeters += haversineMeters(aLat, aLng, bLat, bLng)
    }

    const percentComplete = Math.max(0, Math.min(100, Math.round(((totalDist - remainingMeters) / totalDist) * 100)))

    return {
      remainingMeters: Math.round(remainingMeters),
      percentComplete,
    }
  }

  _extractDestination(route) {
    if (!route) return null
    if (route.destination && isFinite(route.destination.lat) && isFinite(route.destination.lng)) {
      return route.destination
    }
    const polyline = this._getPolylineCoords()
    if (polyline.length > 0) {
      const last = polyline[polyline.length - 1]
      const isLngLat = this._isPolylineLngLat(polyline)
      return {
        lat: isLngLat ? last[1] : last[0],
        lng: isLngLat ? last[0] : last[1],
      }
    }
    return null
  }
}

