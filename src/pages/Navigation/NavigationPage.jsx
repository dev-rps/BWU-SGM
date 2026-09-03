/**
 * NavigationPage.jsx — Live Turn-by-Turn 3D Driving Navigation (Uber & Google Maps Grade)
 *
 * Highlights:
 *   1. True 3D Driving Perspective: 62° pitch horizontal horizon view, 18.2x zoom, road-aligned forward bearing.
 *   2. Ultra-Smooth 60 FPS Simulation & Tracking: Parametric polyline interpolation running on requestAnimationFrame.
 *   3. Rock-Solid Static Voice Button: Completely stationary with audio wave bars when speaking (no bouncy animations).
 *   4. Dedicated Re-center Button: Clearly highlights when user pans away, with smooth snap-back to 3D forward follow.
 *   5. Linked Voice Assistant & Turn Directions: Dynamic countdown synchronized with milestone announcements & Momo voice briefing.
 *   6. Resilient Tile Architecture: Google Maps raster tiles primary with safe OpenStreetMap fallback.
 */

import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import Map, { Source, Layer, Marker } from 'react-map-gl/maplibre'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../../context/store'
import { HAZARD_TYPES, SEVERITY_COLORS } from '../../constants'
import { mapProvider } from '../../services/mapProvider'

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
  return ((((target - current + 540) % 360) - 180))
}

const HAZARD_MAP = Object.fromEntries(HAZARD_TYPES.map(h => [h.id, h]))

function fmtDist(m) {
  if (m === null || m === undefined || m < 0) return '—'
  if (m < 1000) return `${Math.round(m)} m`
  return `${(m / 1000).toFixed(1)} km`
}

function fmtDuration(totalMin) {
  if (!totalMin && totalMin !== 0) return '—'
  const m = Math.round(totalMin)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const rem = m % 60
  return rem === 0 ? `${h}h` : `${h}h ${rem}m`
}

export default function NavigationPage() {
  const navigate = useNavigate()
  const mapRef = useRef(null)

  const {
    userLocation,
    startLocation,
    destination,
    routes,
    selectedRouteIdx,
    setIsNavigating,
    setJourneyComplete,
    setLiveUserLocation,
    addReport,
  } = useAppStore()

  const selectedRoute = routes[selectedRouteIdx] || routes[0]
  const onRouteReports = useMemo(() => selectedRoute?.onRouteReports || [], [selectedRoute?.onRouteReports])
  
  const rawGeometry = useMemo(() => selectedRoute?.geometry || [], [selectedRoute?.geometry])

  const geometry = useMemo(() => {
    if (rawGeometry && rawGeometry.length >= 2) return rawGeometry
    const sLat = parseFloat(startLocation?.lat || userLocation?.lat || 22.5726)
    const sLng = parseFloat(startLocation?.lng || startLocation?.lon || userLocation?.lng || userLocation?.lon || 88.3639)
    const dLat = parseFloat(destination?.lat || 22.5800)
    const dLng = parseFloat(destination?.lng || destination?.lon || 88.3700)
    if (sLat && sLng && dLat && dLng) {
      return [[sLat, sLng], [dLat, dLng]]
    }
    return []
  }, [rawGeometry, startLocation, userLocation, destination])

  // Coordinate normalizer that guarantees [lng, lat] GeoJSON format without lat/lng flipping
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

  // ── Route Polyline GeoJSON (Standard FeatureCollection for MapLibre) ─────────
  // ── Normalized Route Coordinates: guaranteed [ [lng, lat], ... ] ────────────
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

  // ── Polyline Parameterization for 60 FPS Smooth Interpolation ───────────────
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

  // Continuous position & forward tangent bearing at distance s along route
  const getInterpolatedRouteState = useCallback((s) => {
    if (!polylineData || !validCoords || validCoords.length < 2) {
      const init = startLocation || userLocation
      return {
        lat: parseFloat(init?.lat || 22.57),
        lng: parseFloat(init?.lng || init?.lon || 88.36),
        bearing: 0,
        lookaheadBearing: 0,
        distance: 0,
      }
    }

    const { cumDists, totalDistance } = polylineData
    const clampedS = Math.max(0, Math.min(s, totalDistance))

    // Binary search for segment
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
    const segmentBearing = calculateBearing(p0[1], p0[0], p1[1], p1[0])

    // Sample 25m ahead for smooth cornering anticipation
    const lookaheadDist = Math.min(totalDistance, clampedS + 25)
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

    const lookaheadBearing = calculateBearing(lat, lng, aLat, aLng)

    return { lat, lng, bearing: segmentBearing, lookaheadBearing, distance: clampedS }
  }, [polylineData, validCoords, startLocation, userLocation])

  // ── Steps & Maneuver Waypoints ──────────────────────────────────────────────
  const steps = useMemo(() => {
    if (selectedRoute?.steps?.length > 0) {
      return selectedRoute.steps.map(s => ({
        ...s,
        instruction: s.instruction || s.name || 'Continue on route',
        distanceText: s.distance < 1000 ? `${Math.round(s.distance)} m` : `${(s.distance / 1000).toFixed(1)} km`,
      }))
    }
    return [
      { instruction: 'Head towards main road', distance: 350, distanceText: '350 m', icon: 'north' },
      { instruction: 'Turn right onto main corridor', distance: 1200, distanceText: '1.2 km', icon: 'turn_right' },
      { instruction: 'Continue straight on high-safety arterial', distance: 3400, distanceText: '3.4 km', icon: 'straight' },
      { instruction: 'Turn left towards destination approach', distance: 800, distanceText: '800 m', icon: 'turn_left' },
      { instruction: 'Arrive at destination', distance: 100, distanceText: '100 m', icon: 'flag' },
    ]
  }, [selectedRoute])

  // Map each step to its target distance along the route
  const stepTargetDistances = useMemo(() => {
    if (!polylineData) return []
    const { totalDistance, cumDists } = polylineData
    return steps.map((s, idx) => {
      if (s.point && Array.isArray(s.point) && geometry.length > 0) {
        let minD = Infinity
        let bestDist = ((idx + 1) / steps.length) * totalDistance
        for (let i = 0; i < geometry.length; i++) {
          const d = haversineMeters(s.point[0], s.point[1], geometry[i][0], geometry[i][1])
          if (d < minD) {
            minD = d
            bestDist = cumDists[i]
          }
        }
        return bestDist
      }
      return Math.min(totalDistance, ((idx + 1) / steps.length) * totalDistance)
    })
  }, [polylineData, steps, geometry])

  // Initial road segment bearing
  const initialBearing = useMemo(() => {
    if (geometry && geometry.length > 1) {
      return calculateBearing(geometry[0][0], geometry[0][1], geometry[1][0], geometry[1][1])
    }
    return 0
  }, [geometry])

  // ── Coordinates & State ─────────────────────────────────────────────────────
  const initLoc = startLocation || userLocation
  const [currentLat, setCurrentLat] = useState(parseFloat(initLoc?.lat || 22.57))
  const [currentLng, setCurrentLng] = useState(parseFloat(initLoc?.lng || initLoc?.lon || 88.36))
  const [bearing, setBearing] = useState(initialBearing)
  const [mapBearing, setMapBearing] = useState(initialBearing)
  const [arrowHeading, setArrowHeading] = useState(initialBearing)
  const [deviceHeading, setDeviceHeading] = useState(null)
  const [continuousArrowAngle, setContinuousArrowAngle] = useState(0)
  const prevContinuousAngleRef = useRef(0)
  const [stepIdx, setStepIdx] = useState(0)
  const [gpsMode, setGpsMode] = useState('live') // 'live' | 'simulated'
  const [speed, setSpeed] = useState(38) // km/h
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(true)
  const [is3DMode, setIs3DMode] = useState(true)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [isFollowing, setIsFollowing] = useState(true)
  const [momoToast, setMomoToast] = useState(null)
  const [showHazardModal, setShowHazardModal] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [activeProvider, setActiveProvider] = useState(() => mapProvider.getStatus().activeProvider)
  const mapStyle = useMemo(() => mapProvider.getMapLibreStyle(), [activeProvider])

  // Continuously interpolate screen rotation angle for smooth animation without 360° flip
  useEffect(() => {
    const relativeAngle = is3DMode && isFollowing
      ? (arrowHeading - cameraBearingRef.current)
      : (arrowHeading - mapBearing)
    const diff = ((relativeAngle - (prevContinuousAngleRef.current % 360) + 540) % 360) - 180
    const nextAngle = prevContinuousAngleRef.current + diff
    prevContinuousAngleRef.current = nextAngle
    setContinuousArrowAngle(nextAngle)
  }, [arrowHeading, mapBearing, is3DMode, isFollowing])

  // Real Device Compass Heading Sensor (for smooth physical orientation)
  useEffect(() => {
    const handleOrientation = (e) => {
      let h = null
      if (typeof e.webkitCompassHeading === 'number') {
        h = e.webkitCompassHeading
      } else if (typeof e.alpha === 'number') {
        h = (360 - e.alpha) % 360
      }
      if (h !== null && !isNaN(h)) {
        setDeviceHeading(h)
        if (!isSimulatingRef.current && speed < 5) {
          setArrowHeading(h)
        }
      }
    }

    if (window.DeviceOrientationEvent) {
      window.addEventListener('deviceorientationabsolute', handleOrientation, true)
      window.addEventListener('deviceorientation', handleOrientation, true)
    }

    return () => {
      window.removeEventListener('deviceorientationabsolute', handleOrientation, true)
      window.removeEventListener('deviceorientation', handleOrientation, true)
    }
  }, [speed])

  // Simulation State
  const [isSimulating, setIsSimulating] = useState(false)
  const [simSpeedMultiplier, setSimSpeedMultiplier] = useState(2) // 1x, 2x, 4x

  // Distance progressed along route (meters)
  const [routeDistanceProgress, setRouteDistanceProgress] = useState(0)

  // Refs for 60 FPS animation loop
  const simDistanceRef = useRef(0)
  const cameraBearingRef = useRef(initialBearing)
  const rafIdRef = useRef(null)
  const lastRafTimeRef = useRef(null)
  const isFollowingRef = useRef(true)
  const is3DModeRef = useRef(true)
  const isSimulatingRef = useRef(false)
  const simMultiplierRef = useRef(2)
  const lastUiThrottleRef = useRef(0)
  const announcedMilestonesRef = useRef(new Set())
  const watchRef = useRef(null)
  const prevGpsPos = useRef(null)
  const lastSpokenHazardRef = useRef(false)

  // Ensure camera bearing updates when route geometry changes
  useEffect(() => {
    if (geometry && geometry.length > 1) {
      const b = calculateBearing(geometry[0][0], geometry[0][1], geometry[1][0], geometry[1][1])
      cameraBearingRef.current = b
      setBearing(b)
    }
  }, [geometry])

  // Sync refs with state
  useEffect(() => {
    isFollowingRef.current = isFollowing
  }, [isFollowing])

  useEffect(() => {
    is3DModeRef.current = is3DMode
  }, [is3DMode])

  useEffect(() => {
    isSimulatingRef.current = isSimulating
  }, [isSimulating])

  useEffect(() => {
    simMultiplierRef.current = simSpeedMultiplier
  }, [simSpeedMultiplier])

  // ── Synchronize with MapProvider fallback ──────────────────────────────────
  useEffect(() => {
    return mapProvider.subscribe(status => {
      setActiveProvider(status.activeProvider)
    })
  }, [])



  const handleMapError = useCallback((e) => {
    if (e?.error?.status === 404 || e?.error?.status === 403) {
      console.warn('[NavigationMap] Google tile HTTP error:', e.error?.status)
      mapProvider.recordTileError('google')
    }
  }, [])

  // ── Robust Imperative Route Sync (survives setStyle) ───────────────────────
  // Whenever the map style changes (or finishes loading), we must re-inject the route
  // data because MapLibre's setStyle() wipes out the current source data.
  useEffect(() => {
    if (!mapRef.current) return
    const map = mapRef.current.getMap ? mapRef.current.getMap() : mapRef.current
    if (!map) return

    const syncRouteData = () => {
      try {
        if (!map.isStyleLoaded()) return
        if (routeGeoJson) {
          const src = map.getSource('route-source')
          if (src && src.setData) src.setData(routeGeoJson)
        }
      } catch (err) {
        console.debug('[NavigationMap] sync route source:', err)
      }
    }

    // Attempt immediately if style is already loaded
    syncRouteData()

    // And listen to style data events (fires when setStyle completes)
    map.on('styledata', syncRouteData)
    return () => {
      map.off('styledata', syncRouteData)
    }
  }, [routeGeoJson])  // ── Dynamic Route Progress: split route at vehicle position ────────────────
  const updateRouteProgress = useCallback((vehicleLng, vehicleLat, distanceAlongRoute) => {
    if (!validCoords || validCoords.length < 2 || !polylineData) return

    try {
      const { cumDists } = polylineData

      // Find the segment index where the vehicle currently is
      let segIdx = 0
      for (let i = 0; i < cumDists.length - 1; i++) {
        if (distanceAlongRoute >= cumDists[i]) {
          segIdx = i
        } else {
          break
        }
      }

      const vehiclePoint = [vehicleLng, vehicleLat]

      // Remaining route: from vehicle position to destination
      const aheadCoords = [vehiclePoint, ...validCoords.slice(segIdx + 1)]

      // Traversed route: from start to vehicle position
      const behindCoords = [...validCoords.slice(0, segIdx + 1), vehiclePoint]

      const makeGeoJson = (coords) => ({
        type: 'FeatureCollection',
        features: coords.length >= 2 ? [{
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates: coords },
        }] : [],
      })

      // Update imperative sources directly
      const map = mapRef.current.getMap ? mapRef.current.getMap() : mapRef.current
      if (!map || !map.isStyleLoaded()) return

      const routeSrc = map.getSource('route-source')
      if (routeSrc && routeSrc.setData) {
        routeSrc.setData(makeGeoJson(aheadCoords))
      }

      const traversedSrc = map.getSource('route-traversed')
      if (traversedSrc && traversedSrc.setData) {
        traversedSrc.setData(makeGeoJson(behindCoords))
      }
    } catch (err) {
      console.debug('[NavigationMap] route progress update:', err)
    }
  }, [validCoords, polylineData])

  // ── Speech Synthesis Engine (Clean, Non-overlapping) ────────────────────────
  const speakText = useCallback((text, force = false) => {
    if (!('speechSynthesis' in window)) return
    if (!isVoiceEnabled && !force) return

    try {
      window.speechSynthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.rate = 1.02
      utterance.pitch = 1.05
      utterance.volume = 1.0

      const voices = window.speechSynthesis.getVoices()
      const enVoice = voices.find(v => v.lang.startsWith('en')) || voices[0]
      if (enVoice) utterance.voice = enVoice

      utterance.onstart = () => setIsSpeaking(true)
      utterance.onend = () => setIsSpeaking(false)
      utterance.onerror = () => setIsSpeaking(false)

      window.speechSynthesis.speak(utterance)
    } catch (err) {
      console.warn('Speech error:', err)
      setIsSpeaking(false)
    }
  }, [isVoiceEnabled])

  // Toggle Voice Guidance
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

  // ── Current Step & Live Distance Countdown ──────────────────────────────────
  const currentStep = steps[stepIdx] || steps[steps.length - 1]
  const nextStep = steps[stepIdx + 1] || null

  const targetStepDist = stepTargetDistances[stepIdx] || (polylineData?.totalDistance || 1000)
  const liveMetersToStep = Math.max(0, targetStepDist - routeDistanceProgress)
  const liveStepDistanceText = fmtDist(liveMetersToStep)

  // Distance & Duration remaining to final destination
  const totalRouteDist = polylineData?.totalDistance || (selectedRoute?.distanceKm ? selectedRoute.distanceKm * 1000 : 5000)
  const distRemainingMeters = Math.max(0, totalRouteDist - routeDistanceProgress)
  const remainingMin = Math.max(1, Math.round(distRemainingMeters / (Math.max(speed, 20) * 1000 / 60)))
  const progressPct = Math.min(100, Math.round((routeDistanceProgress / totalRouteDist) * 100))

  const arrivalTime = useMemo(() => {
    const d = new Date()
    d.setMinutes(d.getMinutes() + remainingMin)
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }, [remainingMin])

  // ── Momo Voice Assistant Briefing ───────────────────────────────────────────
  const handleMomoBriefing = () => {
    const safetyScore = selectedRoute?.safetyScore || 88
    const hazardMsg = onRouteReports.length > 0
      ? `Notice: ${onRouteReports.length} road hazard reported on route.`
      : 'All road corridors ahead are safe and clear.'

    const msg = `Momo here! In ${liveStepDistanceText}, ${currentStep.instruction}. ${fmtDist(distRemainingMeters)} remaining, ETA ${arrivalTime}. Safety score is ${safetyScore}. ${hazardMsg}`
    
    setMomoToast(`In ${liveStepDistanceText}, ${currentStep.instruction} • ${fmtDist(distRemainingMeters)} to destination`)
    setTimeout(() => setMomoToast(null), 5500)
    speakText(msg, true)
  }

  // ── Arrival Handler ─────────────────────────────────────────────────────────
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

  // ── Synchronized Voice Guidance Milestones ──────────────────────────────────
  useEffect(() => {
    if (!isVoiceEnabled) return

    const stepKey400 = `${stepIdx}-400`
    const stepKey100 = `${stepIdx}-100`

    if (liveMetersToStep <= 450 && liveMetersToStep > 350 && !announcedMilestonesRef.current.has(stepKey400)) {
      announcedMilestonesRef.current.add(stepKey400)
      speakText(`In 400 meters, ${currentStep.instruction}`)
    } else if (liveMetersToStep <= 120 && liveMetersToStep > 60 && !announcedMilestonesRef.current.has(stepKey100)) {
      announcedMilestonesRef.current.add(stepKey100)
      speakText(`In 100 meters, ${currentStep.instruction}`)
    }
  }, [stepIdx, liveMetersToStep, currentStep, isVoiceEnabled, speakText])

  // ── Hazard Warning Detection (<300m) ────────────────────────────────────────
  const hazardNearby = useMemo(() => {
    return onRouteReports.some(r => {
      const hLat = r._snapLat ?? r.lat
      const hLng = r._snapLng ?? r.lng
      if (!hLat || !hLng) return false
      return haversineMeters(currentLat, currentLng, hLat, hLng) < 300
    })
  }, [onRouteReports, currentLat, currentLng])

  useEffect(() => {
    if (hazardNearby && !lastSpokenHazardRef.current) {
      lastSpokenHazardRef.current = true
      if (isVoiceEnabled) {
        speakText('Caution: Safety Hazard reported ahead within 300 meters.')
      }
    } else if (!hazardNearby) {
      lastSpokenHazardRef.current = false
    }
  }, [hazardNearby, isVoiceEnabled, speakText])

  // ── Camera Recenter Handler (Uber / Google Maps 3D View) ───────────────────
  const recenterCamera = useCallback(() => {
    setIsFollowing(true)
    isFollowingRef.current = true

    if (!mapRef.current) return
    const map = mapRef.current.getMap ? mapRef.current.getMap() : mapRef.current
    if (!map) return

    map.easeTo({
      center: [currentLng, currentLat],
      bearing: is3DMode ? cameraBearingRef.current : 0,
      pitch: is3DMode ? 62 : 0,
      zoom: is3DMode ? 18.2 : 16.5,
      padding: is3DMode
        ? { top: 60, bottom: 180, left: 0, right: 0 }
        : { top: 40, bottom: 180, left: 0, right: 0 },
      duration: 650,
    })
  }, [currentLat, currentLng, is3DMode])

  // ── 60 FPS Smooth Parametric Simulation Loop (requestAnimationFrame) ─────────
  useEffect(() => {
    if (!isSimulating) {
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current)
      return
    }

    lastRafTimeRef.current = performance.now()

    const loop = (timestamp) => {
      if (!isSimulatingRef.current) return

      const dt = Math.min((timestamp - lastRafTimeRef.current) / 1000, 0.08)
      lastRafTimeRef.current = timestamp

      // Speed in meters per second
      const baseSpeedKmh = 42
      const currentSpeed = baseSpeedKmh * simMultiplierRef.current
      const speedMps = (currentSpeed * 1000) / 3600

      // Advance distance along route
      simDistanceRef.current += speedMps * dt
      const totalDist = polylineData?.totalDistance || 1000

      if (simDistanceRef.current >= totalDist) {
        simDistanceRef.current = totalDist
        setIsSimulating(false)
        handleArrived()
        return
      }

      // Exact interpolated coordinate & tangent
      const state = getInterpolatedRouteState(simDistanceRef.current)

      // Smooth camera bearing interpolation towards forward lookahead road tangent
      const angleDiff = getShortestAngleDiff(state.lookaheadBearing, cameraBearingRef.current)
      cameraBearingRef.current = (cameraBearingRef.current + angleDiff * Math.min(1, dt * 5.5) + 360) % 360

      // Update Native Map Camera at 60 FPS without React re-render overhead
      if (isFollowingRef.current && mapRef.current) {
        const map = mapRef.current.getMap ? mapRef.current.getMap() : mapRef.current
        if (map) {
          map.jumpTo({
            center: [state.lng, state.lat],
            bearing: is3DModeRef.current ? cameraBearingRef.current : 0,
            pitch: is3DModeRef.current ? 62 : 0,
            zoom: is3DModeRef.current ? 18.2 : 16.5,
            padding: is3DModeRef.current
              ? { top: 60, bottom: 180, left: 0, right: 0 }
              : { top: 40, bottom: 180, left: 0, right: 0 },
          })
        }
      }

      // Update vehicle marker coordinate and live direction
      setCurrentLat(state.lat)
      setCurrentLng(state.lng)
      setBearing(cameraBearingRef.current)
      setArrowHeading(state.bearing)
      setMapBearing(cameraBearingRef.current)

      // Throttled UI State updates (at ~4Hz) to keep React thread super light
      if (timestamp - lastUiThrottleRef.current > 220) {
        lastUiThrottleRef.current = timestamp
        // Dynamically update route line: shrink ahead, grow trail behind
        updateRouteProgress(state.lng, state.lat, simDistanceRef.current)
        setRouteDistanceProgress(simDistanceRef.current)
        setSpeed(Math.round(currentSpeed))
        setLiveUserLocation({ lat: state.lat, lng: state.lng })

        // Check if passed step waypoint to advance to next instruction
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
            const newStep = steps[activeIdx]
            if (newStep && isVoiceEnabled) {
              speakText(newStep.instruction)
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

  // Toggle Simulation Play/Pause
  const toggleSimulation = () => {
    if (isSimulating) {
      setIsSimulating(false)
      setGpsMode('live')
    } else {
      setIsSimulating(true)
      setGpsMode('simulated')
      setIsFollowing(true)
      isFollowingRef.current = true
      recenterCamera()
    }
  }

  // ── Live Real GPS Watcher (When not simulating) ─────────────────────────────
  const handlePosition = useCallback((pos) => {
    if (isSimulating) return
    const lat = pos.coords.latitude
    const lng = pos.coords.longitude
    const spd = pos.coords.speed

    setCurrentLat(lat)
    setCurrentLng(lng)
    setLiveUserLocation({ lat, lng })
    setGpsMode('live')

    if (spd !== null && spd >= 0) {
      setSpeed(Math.round(spd * 3.6))
    }

    if (pos.coords.heading !== null && !isNaN(pos.coords.heading)) {
      setArrowHeading(pos.coords.heading)
    } else if (prevGpsPos.current) {
      const moved = haversineMeters(lat, lng, prevGpsPos.current.lat, prevGpsPos.current.lng)
      if (moved > 2) {
        const newBearing = calculateBearing(prevGpsPos.current.lat, prevGpsPos.current.lng, lat, lng)
        setArrowHeading(newBearing)
        const diff = getShortestAngleDiff(newBearing, cameraBearingRef.current)
        cameraBearingRef.current = (cameraBearingRef.current + diff * 0.4 + 360) % 360
        setBearing(cameraBearingRef.current)
        setMapBearing(cameraBearingRef.current)
      }
    }
    prevGpsPos.current = { lat, lng }

    // Follow camera if user hasn't manually panned
    if (isFollowingRef.current && mapRef.current) {
      const map = mapRef.current.getMap ? mapRef.current.getMap() : mapRef.current
      if (map) {
        map.easeTo({
          center: [lng, lat],
          bearing: is3DModeRef.current ? cameraBearingRef.current : 0,
          pitch: is3DModeRef.current ? 62 : 0,
          zoom: is3DModeRef.current ? 18.2 : 16.5,
          padding: is3DModeRef.current
            ? { top: 260, bottom: 40, left: 0, right: 0 }
            : { top: 40, bottom: 180, left: 0, right: 0 },
          duration: 500,
        })
      }
    }
  }, [isSimulating, setLiveUserLocation])

  useEffect(() => {
    if (!navigator.geolocation) return

    navigator.geolocation.getCurrentPosition(handlePosition, () => {}, {
      enableHighAccuracy: true,
      timeout: 8000,
    })

    watchRef.current = navigator.geolocation.watchPosition(handlePosition, () => {}, {
      enableHighAccuracy: true,
      maximumAge: 1500,
      timeout: 10000,
    })

    return () => {
      if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current)
      setLiveUserLocation(null)
    }
  }, [handlePosition, setLiveUserLocation])

  // ── Quick Hazard Reporter ───────────────────────────────────────────────────
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

  return (
    <div className="relative w-full h-full overflow-hidden bg-slate-950 select-none">

      {/* ════════ MAP CANVAS (3D GOOGLE MAPS WITH LEAFLET/OSM FALLBACK) ════════ */}
      <div className="absolute inset-0 z-0">
        <Map
          ref={mapRef}
          initialViewState={{
            longitude: currentLng,
            latitude: currentLat,
            zoom: 18.2,
            pitch: is3DMode ? 62 : 0,
            bearing: cameraBearingRef.current,
          }}
          maxPitch={85}
          mapStyle={mapStyle}
          style={{ width: '100%', height: '100%' }}
          attributionControl={false}
          onError={handleMapError}
          onDragStart={() => setIsFollowing(false)}
          onPitchStart={() => setIsFollowing(false)}
          onRotateStart={() => setIsFollowing(false)}
          onZoomStart={() => setIsFollowing(false)}
          onMove={(e) => {
            setMapBearing(e.viewState.bearing)
          }}
          onRotate={(e) => {
            setMapBearing(e.viewState.bearing)
          }}

        >

          {/* 3D User Navigation Puck with Ultra-Smooth Rotating Directional Arrow & Heading Beam */}
          <Marker longitude={currentLng} latitude={currentLat} anchor="center">
            <div className="relative flex items-center justify-center pointer-events-none" style={{ width: 84, height: 84 }}>

              {/* Ultra-Smooth Rotating 3D Navigation Arrowhead (Points towards movement/facing direction) */}
              <div
                className="relative z-10 w-11 h-11 rounded-full bg-white shadow-[0_8px_24px_rgba(0,0,0,0.5)] border-[2.5px] border-blue-600 flex items-center justify-center"
                style={{
                  transform: `rotate(${continuousArrowAngle}deg)`,
                  transition: 'transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)',
                }}
              >
                {/* Precision 3D Directional Chevron (Tip naturally points UP / North at 0°) */}
                <svg viewBox="0 0 24 24" className="w-6 h-6 drop-shadow-sm">
                  <path
                    d="M12 2.5 L20 20.5 L12 16.5 L4 20.5 Z"
                    fill="#1d4ed8"
                    stroke="#2563eb"
                    strokeWidth="1.2"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M12 3 L19 19.5 L12 16 Z"
                    fill="rgba(255,255,255,0.35)"
                  />
                  <circle cx="12" cy="14" r="1.8" fill="#ffffff" />
                </svg>
              </div>
            </div>
          </Marker>

          {/* Destination Pin (Clean, non-bouncing drop pin) */}
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

      {/* ════════ TOP MANEUVER HUD (Google Maps Obsidian/Emerald Style) ════════ */}
      <div className="absolute top-0 left-0 right-0 z-30 p-3 pt-4 select-none">
        <div className="relative bg-gradient-to-b from-[#0A3622] to-[#0F5132] text-white rounded-3xl p-4 shadow-[0_12px_32px_rgba(0,0,0,0.6)] border border-emerald-600/40 backdrop-blur-md overflow-hidden">
          
          {/* Top Status Indicators (Map Provider + GPS Mode + Momo Assistant + Voice) */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              {/* Interactive Map Provider Switcher & Status Badge */}
              <button 
                type="button"
                onClick={() => {
                  const next = activeProvider === 'google' ? 'osm' : 'google'
                  mapProvider.forceFallback(next === 'osm')
                  setActiveProvider(next)
                }}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/40 border border-white/10 text-[10px] font-black uppercase tracking-wider hover:bg-black/60 active:scale-95 transition-all cursor-pointer"
                title={`Active: ${activeProvider === 'google' ? 'Google Maps 3D' : 'OpenStreetMap Fallback'}. Click to toggle provider.`}
              >
                <div className={`w-2 h-2 rounded-full ${activeProvider === 'google' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                <span>{activeProvider === 'google' ? 'Google Maps' : 'OSM Fallback'}</span>
                <span className="text-[9px] text-slate-400 ml-0.5">⇄</span>
              </button>

              {/* GPS status */}
              <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/40 border border-white/10 text-[10px] font-bold">
                <span className="material-symbols-outlined text-[12px] text-sky-400">
                  {gpsMode === 'simulated' ? 'sports_esports' : 'gps_fixed'}
                </span>
                <span className="text-slate-300 capitalize">{gpsMode}</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Momo Voice Assistant Quick Briefing Button */}
              <button
                onClick={handleMomoBriefing}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-900/60 hover:bg-emerald-800/80 border border-emerald-500/40 text-emerald-200 text-[11px] font-bold active:scale-95 transition-all cursor-pointer shadow-sm"
                title="Hear Momo's Route Briefing"
              >
                <span className="text-[13px] leading-none">🐹</span>
                <span>Momo</span>
              </button>

              {/* Rock-Solid Static Voice Guidance Speaker (NO Bouncing!) */}
              <button
                onClick={toggleVoice}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-black transition-all active:scale-95 ${
                  isVoiceEnabled
                    ? 'bg-emerald-500/25 border border-emerald-400/50 text-emerald-200'
                    : 'bg-black/30 border border-white/10 text-slate-400'
                }`}
                title={isVoiceEnabled ? 'Voice Guidance Active (Tap to mute)' : 'Voice Muted (Tap to enable)'}
              >
                {/* Audio Wave Visualizer when speaking (Clean & Static) */}
                {isSpeaking ? (
                  <div className="flex items-end gap-0.5 h-3.5 w-3.5 justify-center">
                    <span className="w-0.5 bg-emerald-300 rounded-full animate-pulse h-3" />
                    <span className="w-0.5 bg-emerald-200 rounded-full animate-pulse h-3.5" style={{ animationDelay: '150ms' }} />
                    <span className="w-0.5 bg-emerald-300 rounded-full animate-pulse h-2" style={{ animationDelay: '300ms' }} />
                  </div>
                ) : (
                  <span className="material-symbols-outlined text-[15px]">
                    {isVoiceEnabled ? 'volume_up' : 'volume_off'}
                  </span>
                )}
                <span>{isVoiceEnabled ? 'Voice ON' : 'Muted'}</span>
              </button>
            </div>
          </div>

          {/* Maneuver Icon & Distance Countdown */}
          <div className="flex items-center gap-3.5">
            {/* Big Direction Icon */}
            <div className="w-14 h-14 rounded-2xl bg-black/30 border border-white/15 flex items-center justify-center flex-shrink-0 shadow-inner">
              <span className="material-symbols-outlined text-white text-[38px] font-black">
                {currentStep.icon || 'straight'}
              </span>
            </div>

            {/* Distance & Street Instruction */}
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-1.5">
                <span className="text-3xl font-black tracking-tight text-white drop-shadow-sm">
                  {liveStepDistanceText}
                </span>
              </div>
              <p className="text-base font-bold text-emerald-100 truncate leading-snug">
                {currentStep.instruction}
              </p>
            </div>
          </div>

          {/* Next Turn Preview Pill */}
          {nextStep && (
            <div className="mt-3 pt-2.5 border-t border-emerald-700/50 flex items-center gap-2 text-xs font-semibold text-emerald-200/90">
              <span className="text-[10px] font-black uppercase tracking-wider text-emerald-300 bg-black/30 px-1.5 py-0.5 rounded">
                Then
              </span>
              <span className="material-symbols-outlined text-[15px] text-emerald-300">
                {nextStep.icon || 'straight'}
              </span>
              <span className="truncate">{nextStep.instruction}</span>
            </div>
          )}

          {/* Progress Bar at bottom edge of card */}
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/40">
            <div
              className="h-full bg-sky-400 transition-all duration-300 rounded-r-full shadow-[0_0_8px_#38bdf8]"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {/* Momo Floating Speech Toast */}
        {momoToast && (
          <div className="mt-2.5 px-3.5 py-2 rounded-2xl bg-slate-900/95 border border-emerald-500/40 shadow-xl backdrop-blur-md flex items-center gap-2 animate-fade-in text-xs font-bold text-emerald-200">
            <span className="text-[16px]">🐹</span>
            <span className="truncate">{momoToast}</span>
          </div>
        )}
      </div>

      {/* ════════ FLOATING CONTROLS (Right Edge) ════════ */}
      <div className="absolute right-3.5 top-1/2 -translate-y-1/2 z-30 flex flex-col gap-2.5 items-center">
        
        {/* Floating Interactive Mini Compass Widget (Rotates dynamically to True North, tap to reset North-Up) */}
        <button
          type="button"
          onClick={() => {
            if (!mapRef.current) return
            const map = mapRef.current.getMap ? mapRef.current.getMap() : mapRef.current
            if (!map) return

            const isNorthUp = Math.abs(mapBearing % 360) < 3
            const targetBearing = isNorthUp ? (arrowHeading || 0) : 0

            map.easeTo({
              bearing: targetBearing,
              duration: 450,
            })
            setMapBearing(targetBearing)
          }}
          className="relative w-12 h-12 rounded-2xl bg-slate-900/95 backdrop-blur-md border border-slate-700/80 shadow-[0_8px_24px_rgba(0,0,0,0.5)] flex items-center justify-center active:scale-90 transition-transform cursor-pointer group hover:border-slate-500"
          title={`Compass: ${Math.round((360 - (mapBearing % 360)) % 360)}° — Tap to orient True North`}
        >
          {/* Compass Dial Cardinal Markers */}
          <div className="absolute inset-0 rounded-2xl flex items-center justify-center pointer-events-none">
            <div className="absolute top-1 w-1.5 h-1.5 rounded-full bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.8)]" />
            <div className="absolute bottom-1 w-1 h-1 rounded-full bg-slate-500" />
            <div className="absolute left-1 w-1 h-1 rounded-full bg-slate-600" />
            <div className="absolute right-1 w-1 h-1 rounded-full bg-slate-600" />
          </div>

          {/* Rotating Compass Needle (Red needle points to True North) */}
          <div
            className="relative w-8 h-8 flex items-center justify-center pointer-events-none"
            style={{
              transform: `rotate(${-mapBearing}deg)`,
              transition: 'transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)',
            }}
          >
            {/* North Red Pointer */}
            <div className="absolute top-0.5 flex flex-col items-center">
              <div
                className="w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-b-[10px] border-b-rose-500 drop-shadow-[0_0_4px_rgba(244,63,94,0.8)]"
              />
              <span className="text-[7.5px] font-black text-rose-400 leading-none mt-0.5 select-none tracking-tighter">N</span>
            </div>

            {/* Pivot Center Pin */}
            <div className="w-2 h-2 rounded-full bg-white shadow-md z-10 border border-slate-400" />

            {/* South Silver Pointer */}
            <div className="absolute bottom-0.5 flex flex-col items-center">
              <span className="text-[7px] font-black text-slate-400 leading-none mb-0.5 select-none tracking-tighter">S</span>
              <div
                className="w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-t-[9px] border-t-slate-300"
              />
            </div>
          </div>
        </button>

        {/* Dedicated Re-center Button (Permanently Available & Non-Bouncing) */}
        <button
          onClick={recenterCamera}
          className={`relative w-12 h-12 rounded-2xl flex flex-col items-center justify-center transition-all duration-200 shadow-xl border-2 active:scale-90 ${
            !isFollowing
              ? 'bg-blue-600 text-white border-white ring-4 ring-blue-500/40 shadow-blue-500/40'
              : 'bg-slate-900/90 text-slate-300 border-slate-700/80 hover:text-white'
          }`}
          title={!isFollowing ? 'Re-center camera on vehicle (Tracking paused)' : 'Camera locked on vehicle'}
        >
          <span className={`material-symbols-outlined text-[22px] ${!isFollowing ? 'text-white' : 'text-slate-300'}`}>
            {!isFollowing ? 'near_me' : 'my_location'}
          </span>
          {!isFollowing && (
            <span className="text-[7.5px] font-black uppercase tracking-tight leading-none mt-0.5">
              Recenter
            </span>
          )}
          {!isFollowing && (
            <span className="absolute -top-1 -right-1 flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500 border-2 border-white"></span>
            </span>
          )}
        </button>

        {/* 3D vs 2D Tilt & Compass Toggle */}
        <button
          onClick={() => {
            const next3D = !is3DMode
            setIs3DMode(next3D)
            if (mapRef.current) {
              const map = mapRef.current.getMap ? mapRef.current.getMap() : mapRef.current
              if (map) {
                map.easeTo({
                  pitch: next3D ? 62 : 0,
                  bearing: next3D ? cameraBearingRef.current : 0,
                  zoom: next3D ? 18.2 : 16.5,
                  padding: next3D
                    ? { top: 260, bottom: 40, left: 0, right: 0 }
                    : { top: 40, bottom: 180, left: 0, right: 0 },
                  duration: 500,
                })
              }
            }
          }}
          className="w-11 h-11 rounded-2xl bg-slate-900/90 backdrop-blur-md text-white border border-slate-700/70 shadow-lg flex items-center justify-center active:scale-90 transition-all"
          title={is3DMode ? 'Switch to 2D North-Up' : 'Switch to 3D Driving Perspective'}
        >
          <span 
            className="material-symbols-outlined text-[20px] transition-transform duration-300"
            style={{
              transform: is3DMode ? `rotate(${bearing}deg)` : 'rotate(0deg)',
              color: is3DMode ? '#38BDF8' : '#94A3B8'
            }}
          >
            explore
          </span>
        </button>

        {/* Quick Report Road Hazard */}
        <button
          onClick={() => setShowHazardModal(true)}
          className="w-11 h-11 rounded-2xl bg-amber-500 text-slate-950 shadow-lg flex items-center justify-center active:scale-90 transition-transform font-bold"
          title="Report road hazard at current location"
        >
          <span className="material-symbols-outlined icon-filled text-[22px]">warning</span>
        </button>

        {/* Route Suggestions / Safety Insights Toggle */}
        <button
          onClick={() => setShowSuggestions(s => !s)}
          className={`w-11 h-11 rounded-2xl border shadow-lg flex items-center justify-center active:scale-90 transition-all ${
            showSuggestions ? 'bg-sky-500 text-slate-950 border-sky-400' : 'bg-slate-900/90 text-slate-200 border-slate-700/70'
          }`}
          title="Safety route advisory"
        >
          <span className="material-symbols-outlined text-[20px]">shield</span>
        </button>
      </div>

      {/* ════════ QUICK HAZARD REPORT MODAL ════════ */}
      {showHazardModal && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="w-full max-w-sm rounded-3xl bg-slate-900 border border-slate-700 p-5 shadow-2xl">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-black text-white flex items-center gap-1.5">
                <span className="material-symbols-outlined text-amber-400">report</span>
                Report Hazard at Current Spot
              </h3>
              <button onClick={() => setShowHazardModal(false)} className="text-slate-400 text-sm">✕</button>
            </div>
            <p className="text-xs text-slate-400 mb-4">Tap to notify upcoming drivers on this road corridor:</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'pothole', label: 'Pothole / Bump', icon: 'minor_crash', color: '#F59E0B' },
                { id: 'waterlogged', label: 'Waterlogging', icon: 'flood', color: '#38BDF8' },
                { id: 'accident', label: 'Accident Scene', icon: 'car_crash', color: '#EF4444' },
                { id: 'unlit', label: 'Dark / No Lights', icon: 'nightlight', color: '#8B5CF6' },
              ].map(h => (
                <button
                  key={h.id}
                  onClick={() => handleQuickReport(h.id)}
                  className="flex items-center gap-2 p-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-left border border-slate-700/60 active:scale-95 transition-transform"
                >
                  <span className="material-symbols-outlined text-[20px]" style={{ color: h.color }}>{h.icon}</span>
                  <span className="text-xs font-bold text-slate-200">{h.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ════════ HAZARD PROXIMITY ALERT BANNER (<300m) ════════ */}
      {hazardNearby && (
        <div className="absolute bottom-[235px] left-4 right-4 z-30 flex items-center gap-3 rounded-2xl px-4 py-3 bg-rose-600/95 text-white shadow-2xl animate-pulse border border-rose-400/50 backdrop-blur-md">
          <span className="material-symbols-outlined icon-filled text-[26px]">warning</span>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-black uppercase tracking-wide">Hazard Nearby on Route</p>
            <p className="text-[11px] text-rose-100 truncate">Caution: Active road hazard reported within 300 meters.</p>
          </div>
        </div>
      )}

      {/* ════════ BOTTOM TRIP STATUS HUD (Google Maps & Uber Grade) ════════ */}
      <div className="absolute bottom-0 left-0 right-0 z-30 bg-gradient-to-t from-slate-950 via-slate-900 to-slate-900/95 border-t border-slate-800 rounded-t-[32px] shadow-[0_-12px_40px_rgba(0,0,0,0.7)] p-4 pb-6 select-none backdrop-blur-xl">
        
        {/* Main Stats Row */}
        <div className="flex items-center justify-between gap-4 mb-3">
          
          {/* Big ETA Duration */}
          <div className="flex items-baseline gap-1">
            <h2 className="text-4xl font-black text-emerald-400 tracking-tight leading-none drop-shadow-sm">
              {fmtDuration(remainingMin)}
            </h2>
          </div>

          {/* Distance & Arrival Clock */}
          <div className="flex flex-col items-center">
            <p className="text-sm font-bold text-slate-200">
              {fmtDist(distRemainingMeters)}
            </p>
            <p className="text-xs font-semibold text-slate-400">
              ETA {arrivalTime}
            </p>
          </div>

          {/* Live Speedometer Widget */}
          <div className="flex flex-col items-center px-3 py-1.5 rounded-2xl bg-slate-800/80 border border-slate-700/60 shadow-inner">
            <span className="text-xl font-black text-white leading-none">
              {speed}
            </span>
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
              km/h
            </span>
          </div>

          {/* Safety Score Shield */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-emerald-950/70 border border-emerald-500/40 text-emerald-300">
            <span className="material-symbols-outlined icon-filled text-[18px]">shield</span>
            <span className="text-xs font-black">{selectedRoute?.safetyScore || 88}</span>
          </div>
        </div>

        {/* Action Buttons: Finish Journey & Exit */}
        <div className="flex items-center gap-3">
          {/* Exit Navigation */}
          <button
            onClick={() => {
              if ('speechSynthesis' in window) window.speechSynthesis.cancel()
              setIsNavigating(false)
              navigate(-1)
            }}
            className="w-12 h-12 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center active:scale-95 transition-all border border-slate-700"
            title="Exit Navigation"
          >
            <span className="material-symbols-outlined text-[24px]">close</span>
          </button>

          {/* Finish Journey */}
          <button
            onClick={handleArrived}
            className="flex-1 h-12 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-black text-sm shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2 active:scale-98 transition-all"
          >
            <span className="material-symbols-outlined icon-filled text-[20px]">flag</span>
            <span>Finish Journey</span>
          </button>
        </div>

        {/* ── Interactive Drive Simulator Control Bar (Desktop / Testing) ── */}
        <div className="mt-3 pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <button
              onClick={toggleSimulation}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-xl font-bold transition-all ${
                isSimulating
                  ? 'bg-amber-500 text-slate-950'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">
                {isSimulating ? 'pause' : 'play_arrow'}
              </span>
              <span>{isSimulating ? 'Pause Sim' : 'Simulate Drive'}</span>
            </button>

            {isSimulating && (
              <button
                onClick={() => setSimSpeedMultiplier(s => s === 1 ? 2 : s === 2 ? 4 : s === 4 ? 8 : 1)}
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-sky-400 font-extrabold text-[11px] border border-slate-700 active:scale-95 transition-all cursor-pointer"
                title="Toggle simulation speed (1x, 2x, 4x, 8x)"
              >
                {simSpeedMultiplier}x Speed
              </button>
            )}
          </div>

          <button
            onClick={() => {
              const nextIdx = Math.min(stepIdx + 1, steps.length - 1)
              setStepIdx(nextIdx)
              if (stepTargetDistances[nextIdx]) {
                const targetDist = Math.max(0, stepTargetDistances[nextIdx] - 50)
                simDistanceRef.current = targetDist
                setRouteDistanceProgress(targetDist)
                const state = getInterpolatedRouteState(targetDist)
                setCurrentLat(state.lat)
                setCurrentLng(state.lng)
                updateRouteProgress(state.lng, state.lat, targetDist)
              }
              const st = steps[nextIdx]
              if (st && isVoiceEnabled) speakText(st.instruction)
            }}
            className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1 active:scale-95 transition-all cursor-pointer"
            title="Advance step manually"
          >
            <span>Next Step</span>
            <span className="material-symbols-outlined text-[14px]">skip_next</span>
          </button>
        </div>

      </div>
    </div>
  )
}
