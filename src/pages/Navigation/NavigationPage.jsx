/**
 * NavigationPage.jsx — Live Turn-by-Turn 3D Driving Navigation (Uber & Google Maps Grade)
 *
 * Highlights:
 *   1. True 3D Driving Perspective: Native WebGL 62° pitch horizontal horizon view with ZERO corner clipping.
 *   2. Forward Heading-Up Road Follow: Camera smoothly rotates and aligns with road tangent towards destination.
 *   3. Dynamic Compass Widget: Real-time compass needle pointing to True North, tap to toggle North-Up.
 *   4. Responsive Recenter: Clearly highlights when user pans away; snaps back to forward follow and aligns heading.
 *   5. Ultra-Smooth 60 FPS Simulation: Parametric polyline interpolation on requestAnimationFrame.
 *   6. Resilient Tile Architecture: Google Maps raster tiles primary with safe OSM fallback.
 *   7. Full Voice Guidance & Maneuver HUD: Dynamic countdowns, Momo voice briefing, turn instructions.
 */

import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import Map, { Source, Layer, Marker } from 'react-map-gl/maplibre'
import { setWorkerUrl } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAppStore } from '../../context/store'
import { HAZARD_TYPES, SEVERITY_COLORS } from '../../constants'
import { VehicleAvatar } from '../../components/navigation/VehicleIcons'
import { mapProvider } from '../../services/mapProvider'
import { getWeather } from '../../services/weather'
import { getCurrentLocation, watchLocation, clearLocationWatch, getInitialLocation } from '../../services/location'
import { ACCIDENT_BLACKSPOTS } from '../../data/accidentBlackspots'
import { CRIME_HOTSPOTS } from '../../data/crimeHotspots'
import { FLOOD_ZONES_STATIC } from '../../data/floodZones'
import { formatLocalTime, getEstimatedArrivalTime, resolveExactTimezone, getHeuristicTimezone } from '../../utils/timezone'

import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'

// Route worker through Vite's native worker bundling pipeline
if (typeof window !== 'undefined') {
  setWorkerUrl(workerUrl)
}

// ─── Math & Geometry Helpers ──────────────────────────────────────────────────
function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function calculateBearing(lat1, lng1, lat2, lng2) {
  const toRad = (deg) => (deg * Math.PI) / 180
  const toDeg = (rad) => (rad * 180) / Math.PI
  const dLng = toRad(lng2 - lng1)
  const y = Math.sin(dLng) * Math.cos(toRad(lat2))
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLng)
  return (toDeg(Math.atan2(y, x)) + 360) % 360
}

function getShortestAngleDiff(target, current) {
  return (((target - current + 540) % 360) - 180)
}

const HAZARD_MAP = Object.fromEntries(HAZARD_TYPES.map(h => [h.id, h]))

function fmtDist(m) {
  if (m === null || m === undefined || m < 0) return '—'
  if (m < 1000) return `${Math.round(m)} m`
  return `${(m / 1000).toFixed(1)} km`
}

function fmtDuration(totalMin) {
  if (!totalMin && totalMin !== 0) return '—'
  const m = Math.max(0, Math.round(totalMin))
  if (m === 0) return '0 min'
  const days = Math.floor(m / 1440)
  const hours = Math.floor((m % 1440) / 60)
  const mins = m % 60

  if (days > 0) {
    return hours > 0 ? `${days} d ${hours} h ${mins}min` : `${days} d ${mins}min`
  }
  if (hours > 0) {
    return mins > 0 ? `${hours} h ${mins}min` : `${hours} h`
  }
  return `${mins} min`
}

export default function NavigationPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const mapRef = useRef(null)

  const {
    userLocation,
    startLocation,
    destination,
    routes,
    selectedRouteIdx,
    transportMode: storeTransportMode,
    setIsNavigating,
    setJourneyComplete,
    setLiveUserLocation,
    addReport,
  } = useAppStore()

  const locationStateRoute = location.state?.selectedRoute
  const effectiveRouteIdx = location.state?.selectedRouteIdx ?? selectedRouteIdx
  const selectedRoute = locationStateRoute || routes[effectiveRouteIdx] || routes[0]
  const activeMode = selectedRoute?.mode || selectedRoute?.travelMode || storeTransportMode || 'driving'
  const isMotorbike = activeMode === 'motorbike' || activeMode === 'motorcycle' || activeMode === 'bike'
  const isWalking   = activeMode === 'walking' || activeMode === 'pedestrian' || activeMode === 'walk'
  const isCycling   = activeMode === 'cycling' || activeMode === 'bicycle' || activeMode === 'cycle'

  const modeIcon = isMotorbike ? 'two_wheeler'
    : isWalking ? 'directions_walk'
    : isCycling ? 'directions_bike'
    : 'directions_car'

  const modeLabel = isMotorbike ? 'Bike'
    : isWalking ? 'Walking'
    : isCycling ? 'Cycling'
    : 'Driving'

  const onRouteReports = useMemo(() => selectedRoute?.onRouteReports || [], [selectedRoute?.onRouteReports])
  const rawGeometry = useMemo(() => selectedRoute?.geometry || [], [selectedRoute?.geometry])

  // ── Weather condition & AQI state during active navigation ─────────────
  const [navWeather, setNavWeather] = useState(null)

  useEffect(() => {
    const lat = userLocation?.lat || startLocation?.lat
    const lng = userLocation?.lng || startLocation?.lng
    if (!lat || !lng) return
    getWeather(lat, lng).then(setNavWeather).catch(() => {})
  }, [userLocation?.lat, userLocation?.lng, startLocation?.lat, startLocation?.lng])

  const navCondition = useMemo(() => {
    if (!navWeather?.current?.weather?.[0]) {
      return { text: 'Clear', icon: 'wb_sunny', color: '#F59E0B' }
    }
    const w = navWeather.current.weather[0]
    const main = (w.main || '').toLowerCase()
    const desc = (w.description || '').toLowerCase()
    if (main.includes('rain') || desc.includes('rain') || desc.includes('drizzle')) {
      return { text: 'Rainy', icon: 'rainy', color: '#2563EB' }
    }
    if (main.includes('cloud') || desc.includes('cloud')) {
      return { text: 'Cloudy', icon: 'cloud', color: '#64748B' }
    }
    if (main.includes('thunder') || desc.includes('thunder')) {
      return { text: 'Storm', icon: 'thunderstorm', color: '#7C3AED' }
    }
    if (main.includes('clear') || desc.includes('clear') || desc.includes('sun')) {
      return { text: 'Clear', icon: 'wb_sunny', color: '#F59E0B' }
    }
    if (main.includes('fog') || desc.includes('mist') || desc.includes('haze')) {
      return { text: 'Hazy', icon: 'foggy', color: '#9CA3AF' }
    }
    return { text: w.main || 'Clear', icon: 'partly_cloudy_day', color: '#0284C7' }
  }, [navWeather])

  const liveAqi = useMemo(() => {
    return selectedRoute?.envData?.aqi || Math.round(selectedRoute?.mlAqiPm25 || 35)
  }, [selectedRoute])

  // Coordinate normalizer that guarantees [lng, lat] for MapLibre GeoJSON
  const normalizeToLngLat = useCallback((p) => {
    if (!p) return null
    let lat = null
    let lng = null

    if (Array.isArray(p) && p.length >= 2) {
      const v0 = Number(p[0])
      const v1 = Number(p[1])
      if (!isFinite(v0) || !isFinite(v1)) return null

      // In West Bengal / India, lng is ~88, lat is ~22
      if (Math.abs(v0) > Math.abs(v1) && Math.abs(v0) > 45) {
        lng = v0
        lat = v1
      } else {
        lat = v0
        lng = v1
      }
    } else if (typeof p === 'object') {
      lat = Number(p.lat ?? p.latitude)
      lng = Number(p.lng ?? p.lon ?? p.longitude)
    }

    if (isFinite(lat) && isFinite(lng)) {
      return [lng, lat]
    }
    return null
  }, [])

  const geometry = useMemo(() => {
    if (rawGeometry && rawGeometry.length >= 2) return rawGeometry
    const defLoc = getInitialLocation()
    const sLat = parseFloat(startLocation?.lat || userLocation?.lat || defLoc.lat)
    const sLng = parseFloat(startLocation?.lng || startLocation?.lon || userLocation?.lng || userLocation?.lon || defLoc.lng)
    const dLat = parseFloat(destination?.lat || (defLoc.lat + 0.008))
    const dLng = parseFloat(destination?.lng || destination?.lon || (defLoc.lng + 0.008))
    if (sLat && sLng && dLat && dLng) {
      return [[sLat, sLng], [dLat, dLng]]
    }
    return []
  }, [rawGeometry, startLocation, userLocation, destination])

  const validCoords = useMemo(() => {
    if (!geometry || geometry.length < 2) return []
    return geometry.map(normalizeToLngLat).filter(Boolean)
  }, [geometry, normalizeToLngLat])

  const routeGeoJson = useMemo(() => {
    if (!validCoords.length) return null
    return {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: validCoords,
          },
        },
      ],
    }
  }, [validCoords])

  const EMPTY_FC = useMemo(() => ({ type: 'FeatureCollection', features: [] }), [])
  const [routeAheadData, setRouteAheadData] = useState(() => routeGeoJson || null)
  const [routeTraversedData, setRouteTraversedData] = useState(() => EMPTY_FC)

  useEffect(() => {
    if (routeGeoJson) {
      setRouteAheadData(routeGeoJson)
      setRouteTraversedData(EMPTY_FC)
    }
  }, [routeGeoJson, EMPTY_FC])

  // Sync initial user position with the true starting waypoint of the route
  useEffect(() => {
    if (validCoords && validCoords.length >= 2) {
      const [startLng, startLat] = validCoords[0]
      setCurrentLat(startLat)
      setCurrentLng(startLng)
    }
  }, [validCoords])

  // Polyline Parameterization for 60 FPS Smooth Interpolation
  const polylineData = useMemo(() => {
    if (!validCoords || validCoords.length < 2) return null
    const cumDists = [0]
    let total = 0
    for (let i = 0; i < validCoords.length - 1; i++) {
      // validCoords[i][1] is latitude, validCoords[i][0] is longitude
      const d = haversineMeters(validCoords[i][1], validCoords[i][0], validCoords[i + 1][1], validCoords[i + 1][0])
      total += d
      cumDists.push(total)
    }
    return { cumDists, totalDistance: Math.max(total, 1) }
  }, [validCoords])

  // Initial road segment bearing
  const initialBearing = useMemo(() => {
    if (validCoords && validCoords.length > 1) {
      return calculateBearing(validCoords[0][1], validCoords[0][0], validCoords[1][1], validCoords[1][0])
    }
    return 0
  }, [validCoords])

  // Coordinates & State
  const initLoc = startLocation || userLocation || getInitialLocation()
  const [currentLat, setCurrentLat] = useState(parseFloat(initLoc?.lat || 22.73))
  const [currentLng, setCurrentLng] = useState(parseFloat(initLoc?.lng || initLoc?.lon || 88.48))
  const [bearing, setBearing] = useState(initialBearing)
  const [mapBearing, setMapBearing] = useState(initialBearing)
  const [arrowHeading, setArrowHeading] = useState(initialBearing)
  const [continuousArrowAngle, setContinuousArrowAngle] = useState(0)
  const prevContinuousAngleRef = useRef(0)

  // Direct DOM and MapLibre Refs for rock-solid 60 FPS synchronization without vibration
  const markerRef = useRef(null)
  const arrowIconRef = useRef(null)
  const compassNeedleRef = useRef(null)
  const vehicleHeadingRef = useRef(initialBearing)
  const currentLatRef = useRef(parseFloat(initLoc?.lat || 22.73))
  const currentLngRef = useRef(parseFloat(initLoc?.lng || initLoc?.lon || 88.48))

  const [stepIdx, setStepIdx] = useState(0)
  const [gpsMode, setGpsMode] = useState('live')
  const [speed, setSpeed] = useState(() => {
    if (activeMode === 'walking') return 5
    if (activeMode === 'cycling') return 15
    if (activeMode === 'motorbike') return 40
    return 48
  })
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(true)
  const [is3DMode, setIs3DMode] = useState(true)
  const [isNorthUp, setIsNorthUp] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [isFollowing, setIsFollowing] = useState(true)
  const [momoToast, setMomoToast] = useState(null)
  const [showHazardModal, setShowHazardModal] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [activeProvider, setActiveProvider] = useState(() => mapProvider.getStatus().activeProvider)
  const mapStyle = useMemo(() => mapProvider.getMapLibreStyle(), [activeProvider])

  // ── Local Timezone & Real-Time Clock (Calculates user country's exact time, never Etc/UTC) ──
  const [userTimezone, setUserTimezone] = useState(() => getHeuristicTimezone(initLoc?.lat, initLoc?.lng))
  const [clockTick, setClockTick] = useState(0)

  // Keep clock updated every 20 seconds so arrival ETA advances cleanly
  useEffect(() => {
    const timer = setInterval(() => setClockTick(t => t + 1), 20000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    const lat = currentLat || userLocation?.lat || startLocation?.lat
    const lng = currentLng || userLocation?.lng || startLocation?.lng
    if (lat && lng) {
      resolveExactTimezone(lat, lng).then(setUserTimezone).catch(() => {})
    }
  }, [currentLat, currentLng, userLocation?.lat, userLocation?.lng, startLocation?.lat, startLocation?.lng])

  // Simulation State
  const [isSimulating, setIsSimulating] = useState(false)
  const [simSpeedMultiplier, setSimSpeedMultiplier] = useState(2)
  const [routeDistanceProgress, setRouteDistanceProgress] = useState(0)

  const simDistanceRef = useRef(0)
  const cameraBearingRef = useRef(initialBearing)
  const rafIdRef = useRef(null)
  const lastRafTimeRef = useRef(null)
  const isFollowingRef = useRef(true)
  const is3DModeRef = useRef(true)
  const isNorthUpRef = useRef(false)
  const isSimulatingRef = useRef(false)
  const simMultiplierRef = useRef(2)
  const lastUiThrottleRef = useRef(0)
  const announcedMilestonesRef = useRef(new Set())
  const lastProgressSpokenTimeRef = useRef(0)
  const watchRef = useRef(null)
  const prevGpsPos = useRef(null)
  const lastSpokenHazardRef = useRef(false)

  // Arrowhead rotation angle for LIVE GPS mode (Not active during 60 FPS simulation to prevent CSS transition fighting)
  useEffect(() => {
    if (isSimulating) return
    const currentMapHeading = mapBearing
    const relativeAngle = isNorthUp
      ? arrowHeading
      : 0
    const diff = ((relativeAngle - (prevContinuousAngleRef.current % 360) + 540) % 360) - 180
    const nextAngle = prevContinuousAngleRef.current + diff
    prevContinuousAngleRef.current = nextAngle
    setContinuousArrowAngle(nextAngle)
  }, [arrowHeading, mapBearing, isNorthUp, isFollowing, isSimulating])

  useEffect(() => {
    if (validCoords && validCoords.length > 1) {
      const b = calculateBearing(validCoords[0][1], validCoords[0][0], validCoords[1][1], validCoords[1][0])
      cameraBearingRef.current = b
      vehicleHeadingRef.current = b
      setBearing(b)
      const initMapB = isNorthUpRef.current ? 0 : b
      setMapBearing(initMapB)
      if (compassNeedleRef.current) {
        compassNeedleRef.current.style.transform = `rotate(${-initMapB}deg)`
      }
      setArrowHeading(b)
    }
  }, [validCoords, is3DMode])

  useEffect(() => { isFollowingRef.current = isFollowing }, [isFollowing])
  useEffect(() => { is3DModeRef.current = is3DMode }, [is3DMode])
  useEffect(() => { isNorthUpRef.current = isNorthUp }, [isNorthUp])
  useEffect(() => { isSimulatingRef.current = isSimulating }, [isSimulating])
  useEffect(() => { simMultiplierRef.current = simSpeedMultiplier }, [simSpeedMultiplier])

  useEffect(() => {
    return mapProvider.subscribe(status => {
      setActiveProvider(status.activeProvider)
    })
  }, [])

  // Continuous position, smooth tangent bearing, and forward lookahead bearing along route
  const getInterpolatedRouteState = useCallback((s) => {
    if (!polylineData || !validCoords || validCoords.length < 2) {
      return {
        lat: currentLatRef.current,
        lng: currentLngRef.current,
        tangentBearing: vehicleHeadingRef.current,
        lookaheadBearing: cameraBearingRef.current,
        distance: 0,
      }
    }

    const { cumDists, totalDistance } = polylineData
    const clampedS = Math.max(0, Math.min(s, totalDistance))

    let low = 0
    let high = cumDists.length - 1
    while (low <= high) {
      const mid = (low + high) >> 1
      if (cumDists[mid] <= clampedS) low = mid + 1
      else high = mid - 1
    }
    const segIdx = Math.max(0, Math.min(high, validCoords.length - 2))
    const segStartDist = cumDists[segIdx]
    const segEndDist = cumDists[segIdx + 1]
    const segLen = Math.max(0.001, segEndDist - segStartDist)
    const ratio = Math.max(0, Math.min(1, (clampedS - segStartDist) / segLen))

    const p0 = validCoords[segIdx]      // [lng, lat]
    const p1 = validCoords[segIdx + 1]  // [lng, lat]

    const lng = p0[0] + (p1[0] - p0[0]) * ratio
    const lat = p0[1] + (p1[1] - p0[1]) * ratio

    // Sample road tangent 8 meters ahead (smooth continuous tangent, eliminates discrete vertex jumps)
    const tangentDist = Math.min(totalDistance, clampedS + 8)
    let tLow = 0
    let tHigh = cumDists.length - 1
    while (tLow <= tHigh) {
      const mid = (tLow + tHigh) >> 1
      if (cumDists[mid] <= tangentDist) tLow = mid + 1
      else tHigh = mid - 1
    }
    const tIdx = Math.max(0, Math.min(tHigh, validCoords.length - 2))
    const tRatio = Math.max(0, Math.min(1, (tangentDist - cumDists[tIdx]) / Math.max(0.001, cumDists[tIdx + 1] - cumDists[tIdx])))
    const tLng = validCoords[tIdx][0] + (validCoords[tIdx + 1][0] - validCoords[tIdx][0]) * tRatio
    const tLat = validCoords[tIdx][1] + (validCoords[tIdx + 1][1] - validCoords[tIdx][1]) * tRatio

    const tangentBearing = (tangentDist > clampedS + 0.5)
      ? calculateBearing(lat, lng, tLat, tLng)
      : calculateBearing(p0[1], p0[0], p1[1], p1[0])

    // Sample camera lookahead 28 meters ahead for gentle road curvature preview
    const lookaheadDist = Math.min(totalDistance, clampedS + 28)
    let aLow = 0
    let aHigh = cumDists.length - 1
    while (aLow <= aHigh) {
      const mid = (aLow + aHigh) >> 1
      if (cumDists[mid] <= lookaheadDist) aLow = mid + 1
      else aHigh = mid - 1
    }
    const aIdx = Math.max(0, Math.min(aHigh, validCoords.length - 2))
    const aRatio = Math.max(0, Math.min(1, (lookaheadDist - cumDists[aIdx]) / Math.max(0.001, cumDists[aIdx + 1] - cumDists[aIdx])))
    const aLng = validCoords[aIdx][0] + (validCoords[aIdx + 1][0] - validCoords[aIdx][0]) * aRatio
    const aLat = validCoords[aIdx][1] + (validCoords[aIdx + 1][1] - validCoords[aIdx][1]) * aRatio

    const lookaheadBearing = (lookaheadDist > clampedS + 0.5)
      ? calculateBearing(lat, lng, aLat, aLng)
      : tangentBearing

    return { lat, lng, tangentBearing, lookaheadBearing, distance: clampedS }
  }, [polylineData, validCoords])

  // Dynamic Route Progress
  const updateRouteProgress = useCallback((vehicleLng, vehicleLat, distanceAlongRoute) => {
    if (!validCoords || validCoords.length < 2 || !polylineData) return

    try {
      const { cumDists } = polylineData

      let segIdx = 0
      for (let i = 0; i < cumDists.length - 1; i++) {
        if (distanceAlongRoute >= cumDists[i]) {
          segIdx = i
        } else {
          break
        }
      }

      const vehiclePoint = [vehicleLng, vehicleLat]
      const aheadCoords = [vehiclePoint, ...validCoords.slice(segIdx + 1)]
      const behindCoords = [...validCoords.slice(0, segIdx + 1), vehiclePoint]

      const makeGeoJson = (coords) => ({
        type: 'FeatureCollection',
        features: coords.length >= 2 ? [{
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates: coords },
        }] : [],
      })

      setRouteAheadData(makeGeoJson(aheadCoords))
      setRouteTraversedData(makeGeoJson(behindCoords))
    } catch (err) {
      console.debug('[NavigationMap] route progress update:', err)
    }
  }, [validCoords, polylineData])

  // Steps & Maneuver Waypoints
  // Steps & Maneuver Waypoints
  // Polyline-driven windowed turn detection helper to ensure EVERY physical turn on the road is mapped
  const { steps, stepTargetDistances } = useMemo(() => {
    if (!validCoords || validCoords.length < 2 || !polylineData) {
      const defSteps = [
        { instruction: 'Head towards main road', shortInstruction: 'Head towards main road', streetName: 'Main Rd', distance: 350, distanceText: '350 m', icon: 'north', type: 'depart', turnDist: 0, completionDist: 350 },
        { instruction: 'Turn right onto main corridor', shortInstruction: 'Turn right onto main corridor', streetName: 'Main corridor', distance: 1200, distanceText: '1.2 km', icon: 'turn_right', type: 'turn', turnDist: 350, completionDist: 1550 },
        { instruction: 'Continue straight on high-safety arterial', shortInstruction: 'Continue straight', streetName: 'Arterial', distance: 3400, distanceText: '3.4 km', icon: 'straight', type: 'straight', turnDist: 1550, completionDist: 4950 },
        { instruction: 'Arrive at destination', shortInstruction: 'Arrive at destination', streetName: 'Destination', distance: 100, distanceText: '100 m', icon: 'flag', type: 'arrive', turnDist: 4950, completionDist: 5050 },
      ]
      return {
        steps: defSteps,
        stepTargetDistances: [350, 1550, 4950, 5050],
      }
    }

    const { cumDists, totalDistance } = polylineData
    const rawSteps = selectedRoute?.steps || []
    const detectedTurns = []
    let lastTurnMeters = -100

    // Scan polyline geometry points for real physical turns (bearing changes >= 25 degrees)
    // Uses windowed sampling (~16-22m before and after) to capture sharp and curved intersections smoothly
    for (let i = 1; i < validCoords.length - 1; i++) {
      const curDist = cumDists[i]
      if (curDist < 25 || curDist > totalDistance - 25) continue
      if (curDist - lastTurnMeters < 28) continue

      // Look back ~16-22m for incoming approach heading
      let backIdx = i - 1
      while (backIdx > 0 && curDist - cumDists[backIdx] < 16) {
        backIdx--
      }

      // Look forward ~16-22m for outgoing departure heading
      let fwdIdx = i + 1
      while (fwdIdx < validCoords.length - 1 && cumDists[fwdIdx] - curDist < 16) {
        fwdIdx++
      }

      const pBack = validCoords[backIdx]
      const pCurr = validCoords[i]
      const pFwd = validCoords[fwdIdx]

      // CRITICAL: validCoords are [lng, lat]. In calculateBearing, arg1=lat1, arg2=lng1, arg3=lat2, arg4=lng2!
      const inBearing = calculateBearing(pBack[1], pBack[0], pCurr[1], pCurr[0])
      const outBearing = calculateBearing(pCurr[1], pCurr[0], pFwd[1], pFwd[0])
      const diff = getShortestAngleDiff(outBearing, inBearing)

      if (Math.abs(diff) >= 25) {
        let turnText = 'Continue'
        let icon = 'straight'
        let type = 'turn'

        if (diff > 120) {
          turnText = 'Make a sharp right'
          icon = 'u_turn_right'
          type = 'sharp_right'
        } else if (diff < -120) {
          turnText = 'Make a sharp left'
          icon = 'u_turn_left'
          type = 'sharp_left'
        } else if (diff >= 45) {
          turnText = 'Turn right'
          icon = 'turn_right'
          type = 'turn_right'
        } else if (diff <= -45) {
          turnText = 'Turn left'
          icon = 'turn_left'
          type = 'turn_left'
        } else if (diff > 0) {
          turnText = 'Bear right'
          icon = 'turn_slight_right'
          type = 'slight_right'
        } else {
          turnText = 'Bear left'
          icon = 'turn_slight_left'
          type = 'slight_left'
        }

        // Match with nearby road name in rawSteps if available
        let matchedRoad = ''
        for (const rs of rawSteps) {
          if (rs.point && isFinite(rs.point[0]) && isFinite(rs.point[1])) {
            const distToStep = haversineMeters(pCurr[1], pCurr[0], rs.point[0], rs.point[1])
            if (distToStep < 90 && (rs.name || rs.street)) {
              matchedRoad = rs.name || rs.street
              break
            }
          }
        }

        const fullInstruction = matchedRoad ? `${turnText} onto ${matchedRoad}` : turnText

        detectedTurns.push({
          turnDist: curDist,
          instruction: fullInstruction,
          shortInstruction: fullInstruction,
          streetName: matchedRoad || (diff > 0 ? 'Right turn' : 'Left turn'),
          icon,
          type,
          point: pCurr,
          diff,
        })
        lastTurnMeters = curDist
      }
    }

    const stepsList = []
    const targets = []

    // Step 0: Initial departure
    const firstTurnDist = detectedTurns[0]?.turnDist || totalDistance
    const depCompDist = Math.min(45, firstTurnDist * 0.4)
    const depStreet = rawSteps[0]?.name || selectedRoute?.viaRoads || ''
    stepsList.push({
      instruction: rawSteps[0]?.instruction || (depStreet ? `Head toward ${depStreet}` : 'Head toward route corridor'),
      shortInstruction: depStreet ? `Head toward ${depStreet}` : 'Head toward route corridor',
      streetName: depStreet || 'Start corridor',
      turnDist: 0,
      completionDist: depCompDist,
      icon: 'north',
      type: 'depart',
      point: validCoords[0],
    })
    targets.push(depCompDist)

    // Step 1 to N: Detected Turns
    for (let j = 0; j < detectedTurns.length; j++) {
      const dt = detectedTurns[j]
      const nextTurnDist = detectedTurns[j + 1]?.turnDist || totalDistance
      // Keep turn active until 18m past apex (or until next turn), so current turn stays displayed during cornering
      const compDist = Math.min(nextTurnDist - 12, dt.turnDist + 18)

      stepsList.push({
        ...dt,
        completionDist: compDist,
      })
      targets.push(compDist)
    }

    // Final Step: Destination Arrival
    stepsList.push({
      instruction: `Arrive at ${destination?.name || 'destination'}`,
      shortInstruction: 'Arrive at destination',
      streetName: destination?.name || 'Destination',
      turnDist: totalDistance,
      completionDist: totalDistance,
      icon: 'flag',
      type: 'arrive',
      point: validCoords[validCoords.length - 1],
    })
    targets.push(totalDistance)

    return {
      steps: stepsList,
      stepTargetDistances: targets,
    }
  }, [validCoords, polylineData, selectedRoute, destination])

  const lastSpokenRef = useRef({ text: '', time: 0 })

  // Snappy, instant browser voice synthesis -- 0ms network latency, cancels outdated speech immediately
  const speakText = useCallback((text, force = false) => {
    if (!('speechSynthesis' in window)) return
    if (!isVoiceEnabled && !force) return
    if (!text || typeof text !== 'string') return

    const now = Date.now()
    const clean = text.replace(/\*\*/g, '').replace(/\n/g, ' ').trim()

    // Prevent repeating identical speech within 3.5 seconds
    if (!force && clean === lastSpokenRef.current.text && now - lastSpokenRef.current.time < 3500) {
      return
    }

    try {
      window.speechSynthesis.cancel()
      lastSpokenRef.current = { text: clean, time: now }

      const utt = new SpeechSynthesisUtterance(clean)
      const multiplier = simMultiplierRef.current || 1
      utt.rate = Math.min(1.4, 1.02 + (multiplier - 1) * 0.12)
      utt.pitch = 0.95
      utt.volume = 1.0
      utt.lang = 'en-US'

      const voices = window.speechSynthesis.getVoices()
      const isFemale = (name) => /female|woman|girl|zira|siri|samantha|heera|veena|lekha|karen|moira|victoria|susan|hazel|catherine|jenny|aria|lind/i.test(name)

      const enVoice =
        voices.find(v => /\b(david|mark|ryan|george|ravi|prabhat|james|daniel|richard|aaron|guy|alex|oliver)\b/i.test(v.name) && !isFemale(v.name)) ||
        voices.find(v => /\bmale\b/i.test(v.name) && !isFemale(v.name)) ||
        voices.find(v => v.lang.startsWith('en') && !isFemale(v.name)) ||
        voices.find(v => !isFemale(v.name)) ||
        voices[0]

      if (enVoice) utt.voice = enVoice

      utt.onstart = () => setIsSpeaking(true)
      utt.onend = () => setIsSpeaking(false)
      utt.onerror = () => setIsSpeaking(false)

      window.speechSynthesis.speak(utt)
    } catch (err) {
      console.warn('Navigation speech error:', err)
      setIsSpeaking(false)
    }
  }, [isVoiceEnabled])

  const toggleVoice = () => {
    if (isVoiceEnabled) {
      setIsVoiceEnabled(false)
      if ('speechSynthesis' in window) window.speechSynthesis.cancel()
      setIsSpeaking(false)
    } else {
      setIsVoiceEnabled(true)
      const currentStep = steps[stepIdx] || steps[0]
      speakText(`Voice guidance active. ${currentStep?.instruction || 'Continue on route'}.`, true)
    }
  }

  // ── Safety Score Helpers ─────────────────────────────────────────────────────

  const safetyScore = selectedRoute?.safetyScore ?? 88
  const safetyLabel = safetyScore >= 80 ? 'Safe' : safetyScore >= 50 ? 'Moderate' : 'Risky'

  const hazardCount = onRouteReports.length +
    (selectedRoute?.onRouteAccidents?.length || 0) +
    (selectedRoute?.onRouteCrimes?.length || 0) +
    (selectedRoute?.onRouteFlood?.length || 0)

  const currentStep = steps[stepIdx] || steps[steps.length - 1]
  const nextStep = steps[stepIdx + 1] || null

  const targetManeuverDist = currentStep?.turnDist ?? (polylineData?.totalDistance || 1000)
  const isAtManeuver = routeDistanceProgress >= targetManeuverDist && routeDistanceProgress < (currentStep?.completionDist ?? (targetManeuverDist + 18))
  const liveMetersToStep = Math.max(0, targetManeuverDist - routeDistanceProgress)
  const liveStepDistanceText = isAtManeuver ? 'Now' : (liveMetersToStep <= 15 ? 'Now' : fmtDist(liveMetersToStep))

  const totalRouteDist = Math.max(
    1,
    Number(selectedRoute?.distance) > 0
      ? Number(selectedRoute.distance)
      : (polylineData?.totalDistance || (Number(selectedRoute?.distanceKm) > 0 ? Number(selectedRoute.distanceKm) * 1000 : 1000))
  )
  const distRemainingMeters = Math.max(0, totalRouteDist - routeDistanceProgress)

  // Determine mode speed for fallback duration: walking 4.5 km/h, cycling 15 km/h, motorbike 35 km/h, driving 35 km/h
  const speedKmh = isWalking ? 4.5 : isCycling ? 15 : isMotorbike ? 35 : 35
  const fallbackDurationMin = Math.max(1, Math.round((totalRouteDist / 1000 / speedKmh) * 60))
  const routeDurMin = Number(selectedRoute?.durationMin) > 0
    ? Number(selectedRoute.durationMin)
    : (Number(selectedRoute?.duration) > 0 ? Math.round(Number(selectedRoute.duration) / 60) : fallbackDurationMin)
  const baseRouteDurationMin = Math.max(1, routeDurMin)

  const progressFraction = Math.min(1, Math.max(0, routeDistanceProgress / (totalRouteDist || 1)))
  const remainingMin = Math.max(1, Math.round(baseRouteDurationMin * (1 - progressFraction)))
  const progressPct = Math.min(100, Math.round(progressFraction * 100))

  const arrivalTime = useMemo(() => {
    return getEstimatedArrivalTime(remainingMin, {
      lat: currentLat || userLocation?.lat || startLocation?.lat,
      lng: currentLng || userLocation?.lng || startLocation?.lng,
      timeZone: userTimezone,
    })
  }, [remainingMin, currentLat, currentLng, userLocation?.lat, userLocation?.lng, startLocation?.lat, startLocation?.lng, userTimezone, clockTick])

  const handleMomoBriefing = () => {
    const safetyScore = selectedRoute?.safetyScore || 88
    let hazardMsg = onRouteReports.length > 0
      ? `Notice: ${onRouteReports.length} road hazard reported on route.`
      : 'All road corridors ahead are safe and clear.'

    if (selectedRoute?.bottleneck?.hazards?.accident?.name && selectedRoute.bottleneck.hazards.accident.name !== 'None') {
      hazardMsg += ` Watch for accident blackspot near ${selectedRoute.bottleneck.hazards.accident.name}.`
    } else if (selectedRoute?.mlReasons?.length > 0) {
      hazardMsg += ` Note: ${selectedRoute.mlReasons[0]}.`
    }

    const msg = `Momo here! In ${liveStepDistanceText}, ${currentStep.instruction}. ${fmtDist(distRemainingMeters)} remaining, arriving at ${arrivalTime}. Route safety score is ${safetyScore}. ${hazardMsg}`
    setMomoToast(`In ${liveStepDistanceText}, ${currentStep.instruction} • ${fmtDist(distRemainingMeters)} to destination`)
    setTimeout(() => setMomoToast(null), 5500)
    speakText(msg, true)
  }

  const handleArrived = useCallback(() => {
    if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current)
    if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current)
    if ('speechSynthesis' in window) window.speechSynthesis.cancel()
    if (isVoiceEnabled) speakText('You have arrived at your destination.', true)

    setLiveUserLocation(null)
    setIsNavigating(false)
    setJourneyComplete(true)
    navigate('/review')
  }, [navigate, setLiveUserLocation, setIsNavigating, setJourneyComplete, isVoiceEnabled, speakText])

  useEffect(() => {
    if (!isVoiceEnabled || !currentStep) return

    const stepKeyPre = `${stepIdx}-pre`
    const stepKeyNow = `${stepIdx}-now`

    // 1. Advance warning when 90m - 220m away from the turn (for steps that are long enough)
    if (liveMetersToStep <= 220 && liveMetersToStep > 90 && !announcedMilestonesRef.current.has(stepKeyPre)) {
      announcedMilestonesRef.current.add(stepKeyPre)
      const roundedMeters = Math.round(liveMetersToStep / 10) * 10
      speakText(`In ${roundedMeters} meters, ${currentStep.shortInstruction || currentStep.instruction}`)
    } else if ((liveMetersToStep <= 30 || isAtManeuver) && !announcedMilestonesRef.current.has(stepKeyNow)) {
      // 2. Immediate maneuver at the turn intersection
      announcedMilestonesRef.current.add(stepKeyNow)
      speakText(currentStep.shortInstruction || currentStep.instruction, true)
    } else if (liveMetersToStep >= 380) {
      // 3. Periodic countdown for long stretches: announce distance every 200 meters (e.g. 1.2 km, 1 km, 800m, 600m, 400m to go)
      const speedMult = simMultiplierRef.current || 1
      const interval = speedMult >= 5 ? 500 : 200
      const milestone = Math.round(liveMetersToStep / interval) * interval
      const stepKeyProg = `${stepIdx}-prog-${milestone}`
      const now = Date.now()

      if (
        milestone >= 400 &&
        Math.abs(liveMetersToStep - milestone) <= 25 &&
        !announcedMilestonesRef.current.has(stepKeyProg) &&
        now - lastProgressSpokenTimeRef.current >= 6500
      ) {
        announcedMilestonesRef.current.add(stepKeyProg)
        lastProgressSpokenTimeRef.current = now

        const distText = milestone >= 1000
          ? (milestone === 1000 ? '1 kilometer to go' : `${(milestone / 1000).toFixed(1)} kilometers to go`)
          : `${milestone} meters to go`

        let speech = ''
        if (currentStep.type === 'arrive') {
          speech = `${distText} to destination`
        } else {
          const roadName = currentStep.streetName && !/right|left|start/i.test(currentStep.streetName)
            ? currentStep.streetName
            : ''
          speech = roadName
            ? `Continue on ${roadName}, ${distText}`
            : `Continue straight, ${distText}`
        }

        speakText(speech)
      }
    }
  }, [stepIdx, liveMetersToStep, isAtManeuver, currentStep, isVoiceEnabled, speakText])

  const hazardNearby = useMemo(() => {
    if (!isFinite(currentLat) || !isFinite(currentLng)) {
      return { active: false, title: '', message: '', distance: 0, type: '', icon: '' }
    }

    let closestHazard = null
    let minDistance = 300 // Alert threshold: 300 meters

    // 1. Check live community reports on route
    for (const r of onRouteReports) {
      const lat = r._snapLat ?? r.latitude ?? r.lat
      const lng = r._snapLng ?? r.longitude ?? r.lng
      if (!isFinite(lat) || !isFinite(lng)) continue
      const dist = haversineMeters(currentLat, currentLng, lat, lng)
      if (dist < minDistance) {
        minDistance = dist
        const typeInfo = HAZARD_MAP[r.hazardType || r.type] || { label: r.type || 'Hazard', icon: 'warning' }
        closestHazard = {
          active: true,
          title: `Reported ${typeInfo.label}`,
          message: `${Math.round(dist)}m ahead${r.description ? ` · ${r.description}` : ''}`,
          distance: Math.round(dist),
          type: 'report',
          icon: typeInfo.icon || 'warning',
          bg: 'bg-rose-600/95 border-rose-400/50',
        }
      }
    }

    // 2. Check Accident Blackspots on or near route
    const accidentList = selectedRoute?.onRouteAccidents?.length ? selectedRoute.onRouteAccidents : ACCIDENT_BLACKSPOTS
    for (const acc of accidentList) {
      if (!isFinite(acc.lat) || !isFinite(acc.lng)) continue
      const dist = haversineMeters(currentLat, currentLng, acc.lat, acc.lng)
      if (dist < minDistance) {
        minDistance = dist
        closestHazard = {
          active: true,
          title: 'Accident Blackspot',
          message: `${Math.round(dist)}m ahead · ${acc.title || acc.area || 'High collision risk'}`,
          distance: Math.round(dist),
          type: 'accident',
          icon: 'car_crash',
          bg: 'bg-rose-600/95 border-rose-400/50',
        }
      }
    }

    // 3. Check Crime Hotspots on or near route
    const crimeList = selectedRoute?.onRouteCrimes?.length ? selectedRoute.onRouteCrimes : CRIME_HOTSPOTS
    for (const crime of crimeList) {
      if (!isFinite(crime.lat) || !isFinite(crime.lng)) continue
      const dist = haversineMeters(currentLat, currentLng, crime.lat, crime.lng)
      if (dist < minDistance) {
        minDistance = dist
        closestHazard = {
          active: true,
          title: 'Crime Risk Hotspot',
          message: `${Math.round(dist)}m ahead · ${crime.area || 'Exercise caution'}`,
          distance: Math.round(dist),
          type: 'crime',
          icon: 'local_police',
          bg: 'bg-amber-600/95 border-amber-400/50',
        }
      }
    }

    // 4. Check Flood / Waterlogging Risk
    const floodList = selectedRoute?.onRouteFlood?.length ? selectedRoute.onRouteFlood : FLOOD_ZONES_STATIC
    for (const flood of floodList) {
      if (!isFinite(flood.lat) || !isFinite(flood.lng)) continue
      const dist = haversineMeters(currentLat, currentLng, flood.lat, flood.lng)
      if (dist < minDistance) {
        minDistance = dist
        closestHazard = {
          active: true,
          title: 'Waterlogging Zone',
          message: `${Math.round(dist)}m ahead · ${flood.area || 'Submerged road risk'}`,
          distance: Math.round(dist),
          type: 'flood',
          icon: 'water',
          bg: 'bg-blue-600/95 border-blue-400/50',
        }
      }
    }

    // 5. Check ML Bottleneck Danger Zone
    if (selectedRoute?.bottleneck?.lat && selectedRoute?.bottleneck?.lng) {
      const dist = haversineMeters(currentLat, currentLng, selectedRoute.bottleneck.lat, selectedRoute.bottleneck.lng)
      if (dist < minDistance) {
        minDistance = dist
        closestHazard = {
          active: true,
          title: 'Bottleneck Danger Zone',
          message: `${Math.round(dist)}m ahead · ML Danger Score ${selectedRoute.bottleneck.safety_score ?? '—'}/100`,
          distance: Math.round(dist),
          type: 'bottleneck',
          icon: 'fmd_bad',
          bg: 'bg-orange-600/95 border-orange-400/50',
        }
      }
    }

    if (closestHazard) {
      return closestHazard
    }

    return { active: false, title: '', message: '', distance: 0, type: '', icon: '' }
  }, [onRouteReports, selectedRoute, currentLat, currentLng])

  useEffect(() => {
    if (hazardNearby.active && !lastSpokenHazardRef.current) {
      lastSpokenHazardRef.current = true
      if (isVoiceEnabled) {
        speakText(`${hazardNearby.title}: ${hazardNearby.message}`)
      }
    } else if (!hazardNearby.active) {
      lastSpokenHazardRef.current = false
    }
  }, [hazardNearby, isVoiceEnabled, speakText])

  // ── Camera Recenter Handler (Uber / Google Maps 3D View) ───────────────────
  // Locks forward direction along route towards destination
  const recenterCamera = useCallback(() => {
    setIsFollowing(true)
    isFollowingRef.current = true

    if (!mapRef.current) return
    const map = mapRef.current.getMap ? mapRef.current.getMap() : mapRef.current
    if (!map) return

    const targetBearing = isNorthUpRef.current ? 0 : (cameraBearingRef.current || 0)
    const lat = currentLatRef.current
    const lng = currentLngRef.current

    map.easeTo({
      center: [lng, lat],
      bearing: targetBearing,
      pitch: is3DMode ? 62 : 0,
      zoom: is3DMode ? 18.2 : 16.5,
      padding: is3DMode
        ? { top: 60, bottom: 200, left: 0, right: 0 }
        : { top: 40, bottom: 180, left: 0, right: 0 },
      duration: 650,
    })
    setMapBearing(targetBearing)
    if (compassNeedleRef.current) {
      compassNeedleRef.current.style.transform = `rotate(${-targetBearing}deg)`
    }
  }, [is3DMode])

  const handleCompassClick = useCallback(() => {
    const nextNorthUp = !isNorthUp
    setIsNorthUp(nextNorthUp)
    isNorthUpRef.current = nextNorthUp

    const targetB = nextNorthUp ? 0 : (cameraBearingRef.current || 0)
    setMapBearing(targetB)

    if (mapRef.current) {
      const map = mapRef.current.getMap ? mapRef.current.getMap() : mapRef.current
      if (map) {
        map.easeTo({
          bearing: targetB,
          pitch: nextNorthUp ? 0 : (is3DMode ? 62 : 0),
          duration: 500,
        })
      }
    }

    if (compassNeedleRef.current) {
      compassNeedleRef.current.style.transform = `rotate(${-targetB}deg)`
    }

    if (arrowIconRef.current) {
      arrowIconRef.current.style.transform = nextNorthUp
        ? `rotate(${vehicleHeadingRef.current}deg)`
        : 'rotate(0deg)'
    }

    if (nextNorthUp && is3DMode) {
      setIs3DMode(false)
      is3DModeRef.current = false
    }
  }, [isNorthUp, is3DMode])

  // ── 60 FPS Smooth Parametric Simulation Loop (Zero Jitter, Synchronous WebGL Marker) ──
  useEffect(() => {
    if (!isSimulating) {
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current)
      // When simulation ends, restore smooth CSS transitions for live GPS ticks
      if (arrowIconRef.current) {
        arrowIconRef.current.style.transition = 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)'
      }
      if (compassNeedleRef.current) {
        compassNeedleRef.current.style.transition = 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
      }
      return
    }

    lastRafTimeRef.current = performance.now()

    // During continuous 60 FPS animation, disable CSS transitions to eliminate transition fighting and jitter
    if (arrowIconRef.current) {
      arrowIconRef.current.style.transition = 'none'
    }
    if (compassNeedleRef.current) {
      compassNeedleRef.current.style.transition = 'none'
    }

    const loop = (timestamp) => {
      if (!isSimulatingRef.current) return

      const dt = Math.min((timestamp - lastRafTimeRef.current) / 1000, 0.08)
      lastRafTimeRef.current = timestamp

      const baseSpeedKmh = 42
      const currentSpeed = baseSpeedKmh * simMultiplierRef.current
      const speedMps = (currentSpeed * 1000) / 3600

      simDistanceRef.current += speedMps * dt
      const totalDist = polylineData?.totalDistance || 1000

      if (simDistanceRef.current >= totalDist) {
        simDistanceRef.current = totalDist
        setIsSimulating(false)
        handleArrived()
        return
      }

      const state = getInterpolatedRouteState(simDistanceRef.current)
      currentLatRef.current = state.lat
      currentLngRef.current = state.lng

      // 1. Smooth vehicle heading towards forward tangent (critically damped filter, no node jerk)
      const headingDiff = getShortestAngleDiff(state.tangentBearing, vehicleHeadingRef.current)
      vehicleHeadingRef.current = (vehicleHeadingRef.current + headingDiff * Math.min(1, dt * 7.5) + 360) % 360

      // 2. Smooth camera bearing following behind vehicle heading
      const camDiff = getShortestAngleDiff(state.lookaheadBearing, cameraBearingRef.current)
      cameraBearingRef.current = (cameraBearingRef.current + camDiff * Math.min(1, dt * 4.2) + 360) % 360

      // 3. Synchronous WebGL Map Camera update in follow perspective (Course-Up in both 2D and 3D)
      const activeMapBearing = isNorthUpRef.current ? 0 : cameraBearingRef.current

      if (isFollowingRef.current && mapRef.current) {
        const map = mapRef.current.getMap ? mapRef.current.getMap() : mapRef.current
        if (map) {
          map.jumpTo({
            center: [state.lng, state.lat],
            bearing: activeMapBearing,
            pitch: is3DModeRef.current ? 62 : 0,
            zoom: is3DModeRef.current ? 18.2 : 16.5,
            padding: is3DModeRef.current
              ? { top: 60, bottom: 200, left: 0, right: 0 }
              : { top: 40, bottom: 180, left: 0, right: 0 },
          })
        }
      }

      // 4. Synchronous MapLibre Marker position update (ZERO WebGL canvas vs DOM lag)
      if (markerRef.current) {
        markerRef.current.setLngLat([state.lng, state.lat])
      }

      // 5. Arrowhead / Vehicle Avatar On-Screen Orientation:
      // In Heading-Up (!isNorthUpRef.current): avatar stays straight upright (rotate(0deg)) pointing forward along the road!
      // In North-Up (isNorthUpRef.current): avatar rotates with vehicle heading relative to North.
      if (arrowIconRef.current) {
        if (!isNorthUpRef.current) {
          arrowIconRef.current.style.transform = 'rotate(0deg)'
        } else {
          arrowIconRef.current.style.transform = `rotate(${vehicleHeadingRef.current}deg)`
        }
      }

      // 6. Mini Compass Needle Direct Update (Syncs with real North in real time!)
      if (compassNeedleRef.current) {
        compassNeedleRef.current.style.transform = `rotate(${-activeMapBearing}deg)`
      }

      // 7. Throttled UI State updates (~4 Hz) — eliminates React 60 FPS re-render overhead
      if (timestamp - lastUiThrottleRef.current > 220) {
        lastUiThrottleRef.current = timestamp
        updateRouteProgress(state.lng, state.lat, simDistanceRef.current)
        setRouteDistanceProgress(simDistanceRef.current)
        setSpeed(Math.round(currentSpeed))
        setLiveUserLocation({ lat: state.lat, lng: state.lng })
        setCurrentLat(state.lat)
        setCurrentLng(state.lng)
        setBearing(cameraBearingRef.current)
        setMapBearing(activeMapBearing)
        setArrowHeading(vehicleHeadingRef.current)

        let activeIdx = 0
        for (let i = 0; i < stepTargetDistances.length; i++) {
          if (simDistanceRef.current < stepTargetDistances[i]) {
            activeIdx = i
            break
          }
          activeIdx = i
        }
        setStepIdx(s => {
          if (s !== activeIdx) {
            // Cancel stale speech immediately when vehicle completes turn or steps advance
            if ('speechSynthesis' in window) {
              window.speechSynthesis.cancel()
            }
            setIsSpeaking(false)

            const cur = steps[activeIdx]
            const distToTurn = (cur?.turnDist ?? 0) - simDistanceRef.current
            if (cur && isVoiceEnabled) {
              if (distToTurn <= 30 || simDistanceRef.current >= (cur.turnDist ?? 0)) {
                announcedMilestonesRef.current.add(`${activeIdx}-now`)
                speakText(cur.shortInstruction || cur.instruction, true)
              } else if (distToTurn <= 180 && distToTurn > 30) {
                announcedMilestonesRef.current.add(`${activeIdx}-pre`)
                const rounded = Math.round(distToTurn / 10) * 10
                speakText(`In ${rounded} meters, ${cur.shortInstruction || cur.instruction}`)
              }
            }
          }
          return activeIdx
        })
      }

      rafIdRef.current = requestAnimationFrame(loop)
    }

    rafIdRef.current = requestAnimationFrame(loop)

    return () => {
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current)
    }
  }, [isSimulating, polylineData, getInterpolatedRouteState, updateRouteProgress, stepTargetDistances, steps, isVoiceEnabled, speakText, handleArrived, setLiveUserLocation])

  const toggleSimulation = () => {
    if (isSimulating) {
      setIsSimulating(false)
      setGpsMode('live')
      if (arrowIconRef.current) {
        arrowIconRef.current.style.transition = 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)'
      }
      if (compassNeedleRef.current) {
        compassNeedleRef.current.style.transition = 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
      }
    } else {
      setIsSimulating(true)
      setGpsMode('simulated')
      setIsFollowing(true)
      isFollowingRef.current = true
      recenterCamera()
    }
  }

  // Live GPS Watcher (When not simulating) with stationary jitter filter
  const handlePosition = useCallback((pos) => {
    if (isSimulatingRef.current) return
    const lat = pos.coords.latitude
    const lng = pos.coords.longitude
    const spd = pos.coords.speed

    currentLatRef.current = lat
    currentLngRef.current = lng
    setCurrentLat(lat)
    setCurrentLng(lng)
    setLiveUserLocation({ lat, lng })
    setGpsMode('live')

    if (markerRef.current) {
      markerRef.current.setLngLat([lng, lat])
    }

    if (spd !== null && spd >= 0) {
      setSpeed(Math.round(spd * 3.6))
    }

    // Determine heading with stationary jitter filter
    let nextHeading = null
    if (pos.coords.heading !== null && !isNaN(pos.coords.heading) && pos.coords.heading >= 0) {
      nextHeading = pos.coords.heading
    } else if (prevGpsPos.current) {
      const moved = haversineMeters(lat, lng, prevGpsPos.current.lat, prevGpsPos.current.lng)
      // Only recalculate bearing if moved > 4 meters and moving (prevents arrow spinning when stopped)
      if (moved > 4 && (spd === null || spd > 1)) {
        nextHeading = calculateBearing(prevGpsPos.current.lat, prevGpsPos.current.lng, lat, lng)
      }
    }

    if (nextHeading !== null) {
      vehicleHeadingRef.current = nextHeading
      setArrowHeading(nextHeading)
      const diff = getShortestAngleDiff(nextHeading, cameraBearingRef.current)
      cameraBearingRef.current = (cameraBearingRef.current + diff * 0.4 + 360) % 360
      setBearing(cameraBearingRef.current)
      const activeMapBearing = isNorthUpRef.current ? 0 : cameraBearingRef.current
      setMapBearing(activeMapBearing)

      if (arrowIconRef.current) {
        if (!isNorthUpRef.current) {
          arrowIconRef.current.style.transform = 'rotate(0deg)'
        } else {
          arrowIconRef.current.style.transform = `rotate(${nextHeading}deg)`
        }
      }
      if (compassNeedleRef.current) {
        compassNeedleRef.current.style.transform = `rotate(${-activeMapBearing}deg)`
      }
    }

    prevGpsPos.current = { lat, lng }

    // Update route progress & step in live GPS mode
    if (polylineData && validCoords && validCoords.length > 1) {
      let minDist = Infinity
      let closestIdx = 0
      for (let i = 0; i < validCoords.length; i++) {
        // validCoords[i][1] is latitude, validCoords[i][0] is longitude
        const d = haversineMeters(lat, lng, validCoords[i][1], validCoords[i][0])
        if (d < minDist) {
          minDist = d
          closestIdx = i
        }
      }
      const curProgress = polylineData.cumDists?.[closestIdx] || 0
      setRouteDistanceProgress(curProgress)
      updateRouteProgress(lng, lat, curProgress)

      if (stepTargetDistances && stepTargetDistances.length) {
        let activeIdx = 0
        for (let i = 0; i < stepTargetDistances.length; i++) {
          if (curProgress < stepTargetDistances[i]) {
            activeIdx = i
            break
          }
          activeIdx = i
        }
        setStepIdx(s => {
          if (s !== activeIdx) {
            if ('speechSynthesis' in window) {
              window.speechSynthesis.cancel()
            }
            setIsSpeaking(false)
          }
          return activeIdx
        })
      }
    }

    if (isFollowingRef.current && mapRef.current) {
      const map = mapRef.current.getMap ? mapRef.current.getMap() : mapRef.current
      if (map) {
        const activeMapBearing = isNorthUpRef.current ? 0 : cameraBearingRef.current
        map.easeTo({
          center: [lng, lat],
          bearing: activeMapBearing,
          pitch: is3DModeRef.current ? 62 : 0,
          zoom: is3DModeRef.current ? 18.2 : 16.5,
          padding: is3DModeRef.current
            ? { top: 60, bottom: 200, left: 0, right: 0 }
            : { top: 40, bottom: 180, left: 0, right: 0 },
          duration: 500,
        })
      }
    }
  }, [setLiveUserLocation, polylineData, validCoords, updateRouteProgress, stepTargetDistances])

  useEffect(() => {
    if (typeof window === 'undefined' || !navigator.geolocation) return

    // Multi-tier fast initial fix
    getCurrentLocation().then(loc => {
      if (loc && isFinite(loc.lat) && isFinite(loc.lng) && !isSimulatingRef.current) {
        handlePosition({ coords: { latitude: loc.lat, longitude: loc.lng, speed: null, heading: null } })
      }
    })

    const watchId = watchLocation((loc) => {
      if (!isSimulatingRef.current) {
        handlePosition({ coords: { latitude: loc.lat, longitude: loc.lng, speed: null, heading: null } })
      }
    })
    watchRef.current = watchId

    return () => {
      if (watchRef.current !== null) clearLocationWatch(watchRef.current)
      setLiveUserLocation(null)
    }
  }, [handlePosition, setLiveUserLocation])

  const handleQuickReport = (type) => {
    const reportData = {
      id: `report-${Date.now()}`,
      hazardType: type,
      latitude: currentLat,
      longitude: currentLng,
      createdAt: new Date().toISOString(),
      severity: 'medium',
      description: `Reported hazard: ${type}`,
    }
    addReport(reportData)
    setShowHazardModal(false)
    speakText(`Hazard reported: ${type}. Thank you for keeping roads safe.`, true)
  }

  const handleMapError = useCallback((e) => {
    if (e?.error?.status === 404 || e?.error?.status === 403) {
      console.warn('[NavigationMap] Google tile HTTP error:', e.error?.status)
      mapProvider.recordTileError('google')
    }
  }, [])

  return (
    <div className="relative w-full h-full overflow-hidden bg-slate-950 select-none">

      {/* ════════ MAP CANVAS (3D WEBGL GOOGLE MAPS WITH HORIZONTAL PERSPECTIVE) ════════ */}
      <div className="absolute inset-0 z-0">
        <Map
          ref={mapRef}
          initialViewState={{
            longitude: currentLng,
            latitude: currentLat,
            zoom: 18.2,
            pitch: is3DMode ? 62 : 0,
            bearing: cameraBearingRef.current,
            padding: is3DMode
              ? { top: 60, bottom: 200, left: 0, right: 0 }
              : { top: 40, bottom: 180, left: 0, right: 0 },
          }}
          maxPitch={85}
          mapStyle={mapStyle}
          style={{ width: '100%', height: '100%' }}
          attributionControl={false}
          onError={handleMapError}
          onLoad={(e) => {
            const map = e.target
            if (validCoords && validCoords.length >= 2) {
              const [startLng, startLat] = validCoords[0]
              map.jumpTo({
                center: [startLng, startLat],
                zoom: is3DMode ? 18.2 : 16.5,
                bearing: cameraBearingRef.current || initialBearing,
                pitch: is3DMode ? 62 : 0,
              })
            }
          }}
          onDragStart={() => setIsFollowing(false)}
          onPitchStart={() => setIsFollowing(false)}
          onRotateStart={() => setIsFollowing(false)}
          onZoomStart={() => setIsFollowing(false)}
          onMove={(e) => {
            const b = e.viewState.bearing
            setMapBearing(b)
            if (compassNeedleRef.current) {
              compassNeedleRef.current.style.transform = `rotate(${-b}deg)`
            }
          }}
          onRotate={(e) => {
            const b = e.viewState.bearing
            setMapBearing(b)
            if (compassNeedleRef.current) {
              compassNeedleRef.current.style.transform = `rotate(${-b}deg)`
            }
          }}
        >

          {/* ═══ ROUTE POLYLINE LAYERS ═══ */}
          {/* Traversed trail (faded dashed line behind vehicle) */}
          <Source id="route-traversed" type="geojson" data={routeTraversedData || EMPTY_FC}>
            <Layer
              id="route-traversed-line"
              type="line"
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{
                'line-color': '#64748b',
                'line-width': 5,
                'line-opacity': 0.35,
                'line-dasharray': [2, 3],
              }}
            />
          </Source>

          {/* Active remaining route (bright blue with dark casing) */}
          <Source id="route-source" type="geojson" data={routeAheadData || routeGeoJson || EMPTY_FC}>
            <Layer
              id="route-casing"
              type="line"
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{
                'line-color': '#0d47a1',
                'line-width': 13,
                'line-opacity': 0.95,
              }}
            />
            <Layer
              id="route-core"
              type="line"
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{
                'line-color': '#1a73e8',
                'line-width': 7.5,
                'line-opacity': 1.0,
              }}
            />
          </Source>

          {/* User Navigation Vehicle on Road (Replaces blue circle puck with mode-adapted vehicle) */}
          <Marker ref={markerRef} longitude={currentLng} latitude={currentLat} anchor="center">
            <div className="relative flex items-center justify-center pointer-events-none" style={{ width: 84, height: 84 }}>
              {/* Radar pulse */}
              <div className="absolute w-16 h-16 rounded-full bg-emerald-500/25 animate-ping opacity-60" />
              <div className="absolute w-12 h-12 rounded-full bg-emerald-500/15 border border-emerald-500/30" />

              {/* Vehicle Avatar:
                  In 3D mode: ALWAYS upright / straight (rotate(0deg)) facing horizon!
                  In 2D mode: rotates with continuousArrowAngle along the road heading.
              */}
              <div
                ref={arrowIconRef}
                className="relative z-10 flex items-center justify-center will-change-transform filter drop-shadow-[0_6px_14px_rgba(0,0,0,0.5)]"
                style={{
                  transform: isNorthUp ? `rotate(${continuousArrowAngle}deg)` : 'rotate(0deg)',
                  transition: 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                }}
              >
                <VehicleAvatar
                  mode={activeMode}
                  is3D={is3DMode}
                  className={is3DMode ? "w-14 h-16" : "w-10 h-14"}
                />
              </div>
            </div>
          </Marker>

          {/* Destination Pin */}
          {destination && (
            <Marker
              longitude={parseFloat(destination.lng || destination.lon)}
              latitude={parseFloat(destination.lat)}
              anchor="bottom"
            >
              <div className="relative flex flex-col items-center">
                <div className="w-9 h-9 rounded-full bg-rose-600 border-2 border-white shadow-xl flex items-center justify-center">
                  <span className="material-symbols-outlined text-white icon-filled text-[20px]">flag</span>
                </div>
                <div className="w-2.5 h-1.5 rounded-full bg-black/40 blur-[1px] mt-0.5" />
              </div>
            </Marker>
          )}

          {/* On-Route Hazard Warning Pins */}
          {onRouteReports.map(r => {
            const hLat = r._snapLat ?? r.lat
            const hLng = r._snapLng ?? r.lng
            if (!hLat || !hLng) return null
            const typeId = r.hazardType || r.type || 'other'
            const ht = HAZARD_MAP[typeId] || { icon: 'warning', label: 'Hazard', color: '#EF4444' }
            const color = SEVERITY_COLORS[r.severity] || SEVERITY_COLORS.default

            return (
              <Marker key={r.id} longitude={hLng} latitude={hLat} anchor="center">
                <div
                  className="w-7 h-7 rounded-full border-2 border-slate-900 flex items-center justify-center shadow-lg"
                  style={{ background: color }}
                >
                  <span className="material-symbols-outlined icon-filled text-white text-[14px]">
                    {ht.icon || 'warning'}
                  </span>
                </div>
              </Marker>
            )
          })}
        </Map>
      </div>

      {/* ════════ TOP HEADER - Safety Guardian Map Brand Bar ════════ */}
      <header className="absolute top-0 left-0 right-0 z-30 pt-2.5 px-3.5 flex items-center justify-between pointer-events-auto md:left-1/2 md:-translate-x-1/2 md:w-[480px] md:right-auto">
        {/* Brand Chip with Momo Navigation Avatar */}
        <div className="flex items-center gap-2 bg-white/95 backdrop-blur-md px-2.5 py-1.5 rounded-full border border-slate-200/90 shadow-sm flex-shrink-0">
          <button
            type="button"
            onClick={handleMomoBriefing}
            className="w-7.5 h-7.5 rounded-full overflow-hidden border border-emerald-400/80 bg-emerald-50 flex items-center justify-center shrink-0 cursor-pointer active:scale-95 transition-transform shadow-xs p-0"
            title="Momo Safety Guardian Briefing"
          >
            <img
              src="/momo-nav.png"
              alt="Momo Safety Guardian"
              className="w-full h-full object-cover"
            />
          </button>
          <div className="flex flex-col leading-tight">
            <span className="text-[12px] font-black tracking-tight text-slate-900">Safety Guardian Map</span>
            <span className="text-[9px] font-bold text-emerald-700 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block animate-pulse" />
              {is3DMode ? '3D Navigation Active' : '2D Navigation Active'}
            </span>
          </div>
        </div>

        {/* Quick Controls: Voice Toggle */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={toggleVoice}
            className="w-9 h-9 rounded-full bg-white/95 backdrop-blur-md border border-slate-200/90 shadow-sm flex items-center justify-center text-slate-700 hover:text-[#1B4332] active:scale-95 transition cursor-pointer"
            title={isVoiceEnabled ? 'Voice On' : 'Voice Off'}
          >
            {isSpeaking ? (
              <div className="flex items-end gap-0.5 h-4 justify-center">
                <span className="w-0.5 bg-emerald-500 rounded-full animate-pulse h-3" />
                <span className="w-0.5 bg-emerald-400 rounded-full animate-pulse h-4" style={{ animationDelay: '150ms' }} />
                <span className="w-0.5 bg-emerald-500 rounded-full animate-pulse h-2" style={{ animationDelay: '300ms' }} />
              </div>
            ) : (
              <span className="material-symbols-outlined text-[19px]">{isVoiceEnabled ? 'volume_up' : 'volume_off'}</span>
            )}
          </button>
        </div>
      </header>

      {/* ════════ NAVIGATION INSTRUCTION CARD (Positioned with zero overlap) ════════ */}
      <div className="absolute top-[56px] left-0 right-0 z-30 px-3.5 pointer-events-auto md:left-1/2 md:-translate-x-1/2 md:w-[480px] md:right-auto">
        <div className="bg-white/95 backdrop-blur-md border border-slate-200/90 rounded-2xl p-3 shadow-xl flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-11 h-11 rounded-xl bg-[#1B4332] text-white flex items-center justify-center shadow-md flex-shrink-0">
              <span className="material-symbols-outlined text-[28px]" style={{ fontVariationSettings: "'FILL' 1, 'wght' 600, 'GRAD' 0, 'opsz' 24" }}>{currentStep?.icon || 'straight'}</span>
            </div>
            <div className="flex flex-col min-w-0 flex-1">
              <div className="flex items-baseline gap-1.5 flex-wrap">
                <span className="text-sm font-black text-slate-900">{liveStepDistanceText}</span>
                <span className="text-xs font-semibold text-slate-500 truncate">• {currentStep?.instruction || 'Continue on route'}</span>
              </div>
              <div className="text-[14px] font-extrabold text-slate-900 tracking-tight truncate">{currentStep?.streetName || currentStep?.name || selectedRoute?.viaRoads || ''}</div>
              
              {/* Route & Clean Weather/AQI Info (No bulky background) */}
              <div className="flex items-center gap-2 mt-1 text-[11px] font-bold flex-wrap">
                <div className="flex items-center gap-1.5 text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-md border border-emerald-200/80">
                  <span className="material-symbols-outlined text-[14px] icon-filled text-emerald-700">verified_user</span>
                  <span className="font-bold">{selectedRoute?.rankLabel || 'BALANCED'}</span>
                </div>

                {/* Dark cloud weather icon & AQI (Clean, non-bulky, no background box) */}
                <div className="flex items-center gap-1.5 text-slate-700">
                  <span className="material-symbols-outlined icon-filled text-slate-700 text-[15px]">
                    {navCondition.text.toLowerCase().includes('cloud') ? 'cloud' : navCondition.icon}
                  </span>
                  <span className="font-extrabold capitalize text-slate-800">{navCondition.text}</span>
                  <span className="text-slate-300 font-light">·</span>
                  <span className="text-emerald-800 font-extrabold flex items-center gap-0.5">
                    <span className="material-symbols-outlined text-[12px] text-emerald-600">air</span>
                    <span>AQI {liveAqi}</span>
                  </span>
                </div>
              </div>
            </div>
          </div>
          {nextStep && (
            <div className="pl-2 border-l border-slate-100 flex flex-col items-center text-slate-400 flex-shrink-0">
              <span className="text-[9px] font-bold uppercase tracking-wider">Then</span>
              <span className="material-symbols-outlined text-[20px] text-slate-700" style={{ fontVariationSettings: "'FILL' 1, 'wght' 600" }}>{nextStep?.icon || 'straight'}</span>
            </div>
          )}
        </div>
        {momoToast && (
          <div className="mt-2 animate-fade-in">
            <div className="bg-slate-900/95 backdrop-blur-md text-white rounded-xl px-3 py-2 shadow-lg border border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-5.5 h-5.5 rounded-full overflow-hidden flex-shrink-0 border border-emerald-400/50 bg-emerald-50">
                  <img
                    src="/momo-nav.png"
                    alt="Momo"
                    className="w-full h-full object-cover"
                  />
                </div>
                <p className="text-xs font-medium leading-snug">{momoToast}</p>
              </div>
              <button onClick={() => setMomoToast(null)} className="text-slate-400 hover:text-white ml-2 flex-shrink-0 cursor-pointer"><span className="material-symbols-outlined text-[16px]">close</span></button>
            </div>
          </div>
        )}
        {!momoToast && hazardCount > 0 && (
          <div className="mt-2 animate-fade-in">
            <div className="bg-amber-600/95 backdrop-blur-md text-white rounded-xl px-3 py-2 shadow-lg border border-amber-400/40 flex items-center gap-2">
              <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center font-black text-[11px] flex-shrink-0">!</div>
              <p className="text-xs font-semibold">{hazardCount} hazard{hazardCount > 1 ? 's' : ''} reported on this route - stay alert</p>
            </div>
          </div>
        )}
      </div>

      {/* ════════ FLOATING MAP CONTROLS (Left side) ════════ */}
      <div className={`absolute left-3 z-30 flex flex-col gap-2.5 pointer-events-auto md:left-6 ${isSimulating ? 'bottom-[255px]' : 'bottom-[215px]'} transition-all duration-300`}>
        {/* 3D / 2D Toggle */}
        <button
          onClick={() => {
            const next = !is3DMode
            setIs3DMode(next)
            is3DModeRef.current = next
            // In both 3D and 2D, follow the travel direction unless explicitly in North-Up!
            const targetB = isNorthUpRef.current ? 0 : cameraBearingRef.current
            setMapBearing(targetB)
            if (mapRef.current) {
              const map = mapRef.current.getMap ? mapRef.current.getMap() : mapRef.current
              if (map) map.easeTo({
                pitch: next ? 62 : 0,
                bearing: targetB,
                zoom: next ? 18.2 : 16.5,
                duration: 500,
              })
            }
            if (compassNeedleRef.current) {
              compassNeedleRef.current.style.transform = `rotate(${-targetB}deg)`
            }
          }}
          className={`w-10 h-10 rounded-xl backdrop-blur-md border shadow-lg flex items-center justify-center font-black text-xs active:scale-95 transition cursor-pointer ${is3DMode ? 'bg-[#1B4332] text-white border-emerald-700/50' : 'bg-white/95 text-[#1B4332] border-slate-200'}`}
          title={is3DMode ? 'Switch to 2D' : 'Switch to 3D'}
        >
          {is3DMode ? '3D' : '2D'}
        </button>

        {/* Compass Button with Real Rotating Needle & North-Up Toggle */}
        <button
          onClick={handleCompassClick}
          className={`w-10 h-10 rounded-xl backdrop-blur-md border shadow-lg flex items-center justify-center active:scale-95 transition cursor-pointer relative overflow-hidden ${isNorthUp ? 'bg-rose-50 border-rose-300 ring-2 ring-rose-400/30' : 'bg-white/95 border-slate-200'}`}
          title={isNorthUp ? "Switch to Heading-Up (Road Ahead)" : "Align to North"}
        >
          {/* Compass Dial Needle that points to Magnetic North in Real Time */}
          <div
            ref={compassNeedleRef}
            className="w-7 h-7 flex items-center justify-center will-change-transform pointer-events-none transition-transform duration-200"
            style={{ transform: `rotate(${-mapBearing}deg)` }}
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5 filter drop-shadow-sm">
              {/* North needle pointer (Red) */}
              <polygon points="12,2 15.5,12 12,9.5 8.5,12" fill="#EF4444" stroke="#DC2626" strokeWidth="0.5" />
              {/* South needle pointer (Slate grey) */}
              <polygon points="12,22 15.5,12 12,9.5 8.5,12" fill="#94A3B8" stroke="#64748B" strokeWidth="0.5" />
              {/* Center pivot pin */}
              <circle cx="12" cy="12" r="1.5" fill="#1E293B" />
            </svg>
          </div>
          {/* Subtle North Indicator 'N' */}
          <span className="absolute top-0.5 right-1 text-[8px] font-black text-rose-600 leading-none pointer-events-none select-none">
            N
          </span>
        </button>

        {/* Recenter Camera */}
        <button
          onClick={recenterCamera}
          className={`w-10 h-10 rounded-xl backdrop-blur-md border shadow-lg flex items-center justify-center active:scale-95 transition cursor-pointer ${isFollowing ? 'bg-white/95 border-slate-200 text-[#2563EB]' : 'bg-[#2563EB] border-blue-400/50 text-white ring-2 ring-blue-400/30'}`}
          title="Recenter camera on vehicle"
        >
          <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1, 'wght' 600" }}>my_location</span>
        </button>
      </div>

      {/* ════════ FLOATING QUICK ACTIONS (Right side) ════════ */}
      <div className={`absolute right-3 z-30 flex flex-col gap-2.5 items-end pointer-events-auto md:right-6 ${isSimulating ? 'bottom-[255px]' : 'bottom-[215px]'} transition-all duration-300`}>
        {/* Safe Havens */}
        <button
          onClick={() => setShowSuggestions(true)}
          className="flex items-center gap-1.5 bg-white/95 backdrop-blur-md border border-emerald-300 shadow-lg px-3 py-1.5 rounded-full text-emerald-800 font-bold text-xs hover:bg-emerald-50 active:scale-95 transition cursor-pointer"
        >
          <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center flex-shrink-0">
            <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'FILL' 1, 'wght' 600" }}>local_hospital</span>
          </span>
          <span className="pr-1 text-[11px]">Safe Havens</span>
        </button>

        {/* Report Hazard */}
        <button
          onClick={() => setShowHazardModal(true)}
          className="flex items-center gap-1.5 bg-white/95 backdrop-blur-md border border-amber-300 shadow-lg px-3 py-1.5 rounded-full text-amber-800 font-bold text-xs hover:bg-amber-50 active:scale-95 transition cursor-pointer"
        >
          <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center flex-shrink-0">
            <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'FILL' 1, 'wght' 600" }}>warning</span>
          </span>
          <span className="pr-1 text-[11px]">Report Hazard</span>
        </button>

        {/* SOS Emergency */}
        <button
          onClick={() => navigate('/emergency')}
          className="flex items-center gap-2 bg-[#EF4444] hover:bg-rose-700 text-white border-2 border-white shadow-xl px-4 py-2 rounded-full font-black text-xs active:scale-90 transition cursor-pointer"
        >
          <span className="w-2.5 h-2.5 rounded-full bg-white animate-ping flex-shrink-0" />
          <span className="tracking-wide">SOS</span>
        </button>
      </div>

      {/* ════════ HAZARD PROXIMITY ALERT (ACCIDENT BLACKSPOT / WATERLOGGING / CRIME) ════════ */}
      {hazardNearby?.active && (
        <div className={`absolute left-4 right-4 z-30 pointer-events-none md:left-1/2 md:-translate-x-1/2 md:w-[460px] md:right-auto ${isSimulating ? 'bottom-[195px]' : 'bottom-[155px]'} transition-all duration-300 animate-in slide-in-from-bottom duration-200`}>
          <div className={`flex items-center gap-3 rounded-2xl px-4 py-2.5 text-white shadow-2xl border backdrop-blur-md ${hazardNearby.bg || 'bg-rose-600/95 border-rose-400/50'}`}>
            <span className="material-symbols-outlined text-[22px] flex-shrink-0" style={{ fontVariationSettings: "'FILL' 1, 'wght' 600" }}>{hazardNearby.icon || 'warning'}</span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-black uppercase tracking-wide leading-tight">{hazardNearby.title}</p>
              <p className="text-[11px] font-medium opacity-90 truncate leading-tight mt-0.5">{hazardNearby.message}</p>
            </div>
          </div>
        </div>
      )}

      {/* ════════ BOTTOM STATS PANEL (Clean White Stitch Design) ════════ */}
      <div className="absolute bottom-0 left-0 right-0 z-20 bg-white/95 backdrop-blur-md border-t border-slate-200/90 shadow-[0_-8px_30px_rgba(0,0,0,0.12)] px-4 pt-2 pb-3 flex flex-col gap-1.5 pointer-events-auto md:left-1/2 md:-translate-x-1/2 md:w-[480px] md:right-auto md:rounded-t-[24px]">
        {/* Drag handle */}
        <div className="w-10 h-1 bg-slate-300 rounded-full mx-auto" />

        {/* Row 1: Left Safety Score Hero + Center Time/ETA + Right Distance & Speed */}
        <div className="flex items-center justify-between gap-3">
          {/* Left: Prominent Hero Safety Score in Number */}
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border shrink-0 ${
            safetyScore >= 80 ? 'bg-emerald-50 text-emerald-800 border-emerald-200/90 shadow-2xs' :
            safetyScore >= 50 ? 'bg-blue-50 text-blue-800 border-blue-200/90 shadow-2xs' :
            'bg-rose-50 text-rose-800 border-rose-200/90 shadow-2xs'
          }`}>
            <span
              className={`material-symbols-outlined text-[20px] shrink-0 ${
                safetyScore >= 80 ? 'text-emerald-600' : safetyScore >= 50 ? 'text-blue-600' : 'text-rose-600'
              }`}
              style={{ fontVariationSettings: "'FILL' 1, 'wght' 600" }}
            >
              {safetyScore >= 80 ? 'verified_user' : safetyScore >= 50 ? 'shield' : 'warning'}
            </span>
            <div className="flex flex-col leading-none">
              <div className="flex items-baseline gap-0.5">
                <span className="text-xl font-black tracking-tight">{safetyScore}</span>
                <span className="text-[10px] font-bold opacity-75">/100</span>
              </div>
              <span className="text-[8.5px] font-black uppercase tracking-wider opacity-90 mt-0.5">
                {safetyLabel}
              </span>
            </div>
          </div>

          {/* Center: Duration & Country Local Arrival Time (Zero ETA prefix) */}
          <div className="flex flex-col justify-center min-w-0 flex-1 px-1">
            <span className="text-lg font-black text-slate-900 tracking-tight leading-tight whitespace-nowrap truncate">
              {fmtDuration(remainingMin)}
            </span>
            <span className="text-[12.5px] font-extrabold text-slate-600 leading-tight whitespace-nowrap mt-0.5 truncate">
              {arrivalTime}
            </span>
          </div>

          {/* Right: Distance on top, Speed below it */}
          <div className="flex flex-col items-end justify-center shrink-0 text-right">
            <span className="text-sm font-black text-slate-900 leading-tight whitespace-nowrap">
              {fmtDist(distRemainingMeters)}
            </span>
            <div className="flex items-center gap-1 text-[11.5px] font-extrabold text-slate-700 leading-tight mt-0.5 whitespace-nowrap">
              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0 animate-pulse" />
              <span>{speed} km/h</span>
            </div>
          </div>
        </div>

        {/* Row 2: Balanced Info Strip (Mode + Active Road Corridor + Hazard Counter) — Zero Empty Gap */}
        <div className="flex items-center justify-between gap-2 py-1 border-y border-slate-100/90 text-xs">
          {/* Mode Pill */}
          <div className="flex items-center gap-1.5 bg-slate-100 text-slate-800 border border-slate-200/90 px-2.5 py-1 rounded-xl transition-colors shrink-0 shadow-2xs">
            <span className="material-symbols-outlined text-[17px] text-emerald-700" style={{ fontVariationSettings: "'FILL' 1, 'wght' 600" }}>
              {modeIcon}
            </span>
            <span className="text-[12px] font-black tracking-tight">{modeLabel}</span>
          </div>

          {/* Center Active Corridor — Fills the previous empty gap with high-value road corridor info */}
          <div className="flex items-center justify-center gap-1.5 min-w-0 flex-1 px-2.5 py-1 bg-slate-50/90 border border-slate-200/70 rounded-xl text-slate-700 font-bold text-[11.5px] truncate shadow-2xs">
            <span className="material-symbols-outlined text-[14px] text-slate-400 shrink-0">alt_route</span>
            <span className="truncate">{currentStep?.streetName || selectedRoute?.viaRoads || 'Safe Route Corridor'}</span>
          </div>

          {/* Hazards Ahead Pill */}
          <div className={`flex items-center gap-1.5 text-[11.5px] font-black px-2.5 py-1 rounded-xl border shrink-0 shadow-2xs ${
            hazardCount > 0 ? 'bg-amber-50 text-amber-900 border-amber-200/90' : 'bg-emerald-50 text-emerald-900 border-emerald-200/90'
          }`}>
            <span className={`w-2 h-2 rounded-full shrink-0 ${hazardCount > 0 ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`} />
            <span>{hazardCount > 0 ? `${hazardCount} hazard${hazardCount > 1 ? 's' : ''} ahead` : '0 Hazards ahead'}</span>
          </div>
        </div>

        {/* Row 3: Action Controls + Simulation Multipliers */}
        <div className="flex items-center gap-2 pt-0.5">
          <button
            onClick={handleArrived}
            className="flex-1 bg-[#1B4332] hover:bg-slate-900 active:scale-[0.98] text-white py-2.5 px-3.5 rounded-xl font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-md transition cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1, 'wght' 600" }}>flag</span>
            <span>Finish Journey</span>
          </button>
          <button
            onClick={toggleSimulation}
            className={`w-9 h-9 rounded-xl flex items-center justify-center transition border active:scale-95 flex-shrink-0 cursor-pointer ${isSimulating ? 'bg-amber-500 text-white border-amber-400' : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'}`}
            title={isSimulating ? 'Pause Simulation' : 'Start Simulation'}
          >
            <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1, 'wght' 600" }}>{isSimulating ? 'stop' : 'play_arrow'}</span>
          </button>
          <button
            onClick={() => setShowSuggestions(true)}
            className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-700 flex items-center justify-center transition border border-slate-200 flex-shrink-0 cursor-pointer"
            title="Route Insights"
          >
            <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1, 'wght' 600" }}>tune</span>
          </button>
        </div>

        {/* Row 4: Speed Multiplier (When Simulating) */}
        {isSimulating && (
          <div className="flex items-center gap-2 bg-slate-100 rounded-lg px-2.5 py-1 border border-slate-200 mt-0.5">
            <span className="material-symbols-outlined text-amber-500 text-[14px]" style={{ fontVariationSettings: "'FILL' 1, 'wght' 600" }}>speed</span>
            <span className="text-[10px] font-bold text-slate-700 mr-1">Speed:</span>
            {[1, 2, 5, 10].map(x => (
              <button
                key={x}
                onClick={() => {
                  if ('speechSynthesis' in window) window.speechSynthesis.cancel()
                  setIsSpeaking(false)
                  setSimSpeedMultiplier(x)
                }}
                className={`px-2 py-0.5 rounded text-[10px] font-black transition cursor-pointer ${simSpeedMultiplier === x ? 'bg-amber-500 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}
              >
                {x}x
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ════════ REPORT HAZARD MODAL ════════ */}
      {showHazardModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-end justify-center p-0 animate-fade-in">
          <div className="w-full max-w-[480px] bg-white rounded-t-3xl p-5 pb-8 shadow-2xl">
            <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-4" />
            <h2 className="text-base font-black text-slate-900 mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-amber-500 text-[22px]" style={{ fontVariationSettings: "'FILL' 1, 'wght' 600" }}>warning</span>
              Report Hazard
            </h2>
            <div className="grid grid-cols-3 gap-2.5">
              {HAZARD_TYPES.slice(0, 9).map(h => (
                <button
                  key={h.id}
                  onClick={() => handleQuickReport(h.id)}
                  className="flex flex-col items-center gap-1.5 p-3 rounded-2xl bg-slate-50 border border-slate-200 hover:bg-amber-50 hover:border-amber-300 active:scale-95 transition cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[22px] text-amber-600" style={{ fontVariationSettings: "'FILL' 1, 'wght' 600" }}>{h.icon}</span>
                  <span className="text-[10px] font-bold text-slate-700 text-center leading-tight">{h.label}</span>
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowHazardModal(false)}
              className="mt-4 w-full py-2.5 rounded-xl bg-slate-100 text-slate-600 font-bold text-xs hover:bg-slate-200 active:scale-[0.98] transition cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ════════ SAFE HAVENS MODAL ════════ */}
      {showSuggestions && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-end justify-center p-0 animate-fade-in">
          <div className="w-full max-w-[480px] bg-white rounded-t-3xl p-5 pb-8 shadow-2xl">
            <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-4" />
            <h2 className="text-base font-black text-slate-900 mb-2 flex items-center gap-2">
              <span className="material-symbols-outlined text-emerald-600 text-[22px]" style={{ fontVariationSettings: "'FILL' 1, 'wght' 600" }}>local_hospital</span>
              Nearby Safe Havens
            </h2>
            <p className="text-xs text-slate-500 mb-4">Verified safe locations along your route</p>
            {[
              { name: 'Police Station', sub: '~0.4 km · Always open', icon: 'local_police', color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200' },
              { name: 'Hospital / Clinic', sub: '~0.8 km · 24hr emergency', icon: 'local_hospital', color: 'text-rose-700', bg: 'bg-rose-50 border-rose-200' },
              { name: 'Petrol Station', sub: '~0.3 km · Open now', icon: 'local_gas_station', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200' },
            ].map(item => (
              <div key={item.name} className={`flex items-center gap-3 p-3 rounded-xl border mb-2 ${item.bg}`}>
                <span className={`material-symbols-outlined text-[22px] ${item.color}`} style={{ fontVariationSettings: "'FILL' 1, 'wght' 600" }}>{item.icon}</span>
                <div>
                  <p className={`text-sm font-extrabold ${item.color}`}>{item.name}</p>
                  <p className="text-[11px] text-slate-500">{item.sub}</p>
                </div>
              </div>
            ))}
            <button
              onClick={() => setShowSuggestions(false)}
              className="mt-3 w-full py-2.5 rounded-xl bg-slate-100 text-slate-600 font-bold text-xs hover:bg-slate-200 active:scale-[0.98] transition cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
