/**
 * RouteSelectionPage.jsx
 *
 * Production Mobile-First Navigation & Route Preview Interface
 * Combines:
 *   1. PROMINENT BIG SAFETY SCORES (The hero feature of Safety Guardian)
 *   2. SMOOTH TOUCH SCROLLING in route selection list (Scrollable route panel)
 *   3. PHYSICAL ROAD GEOGRAPHY (via Jessore Rd, via NH 112, etc.)
 *   4. FULL SAFETY GUARDIAN INTELLIGENCE (Point deductions, crimes, flood, disaster, accident, traffic, reports)
 *   5. AQI + POLLEN + UV + MEDICAL PROFILE (ASTHMA / RESPIRATORY) DYNAMIC DEDUCTIONS
 *   6. ROUTE COLOUR CODING: Safest (Green) · Balanced (Blue) · Least Safe / Fastest (Red)
 *   7. MAP-DOMINANT PREVIEW with closer zoom framing and floating interactive badges.
 */

import { useEffect, useState, useMemo, Fragment } from 'react'
import { MapContainer, TileLayer, Marker, Polyline, Popup, Circle, useMap } from 'react-leaflet'
import L from 'leaflet'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../../context/store'
import StartNavigationOverlay from '../../components/navigation/StartNavigationOverlay'
import { GOOGLE_TILE_LEAFLET_URL, FALLBACK_TILE_LEAFLET_URL, mapProvider } from '../../services/mapProvider'
import {
  getRoute, MODE_LABELS,
  buildTrafficSegments, getTrafficStatus, TRAFFIC_COLORS,
  getTrafficTileUrl, getIncidentTileUrl,
} from '../../services/tomtomRouting'
import { auth } from '../../firebase/firebase'
import {
  calculateRouteSafetyScores, getScoreLabel, deduplicateRoutes,
  getScoreReasons, getRouteAnchorPoint, applyEnvironmentalPenalties,
} from '../../services/safetyScore'
import {
  fetchEnvironmentalData, getEnvironmentalWeights, computeEnvironmentalPenalty,
  getEnvironmentalReasons, getAqiLabel, getUvLabel, getPollenLabel,
} from '../../services/environmentalService'
import {
  fetchEnvironmentalSafetyRisk, computeSafetyRiskPenalty, getSafetyRiskReasons,
} from '../../services/safetyRisk'
import { loadMedicalProfile } from '../../services/medicalService'
import { HAZARD_TYPES, SEVERITY_COLORS } from '../../constants'
import { CRIME_HOTSPOTS, CRIME_SEVERITY_CONFIG } from '../../data/crimeHotspots'
import { FLOOD_ZONES_STATIC, FLOOD_SEVERITY_CONFIG, fetchLiveFloodData, isMonsoonSeason } from '../../data/floodZones'
import { DISASTER_ZONES, DISASTER_SEVERITY_CONFIG } from '../../data/disasterZones'
import { ACCIDENT_BLACKSPOTS, ACCIDENT_SEVERITY_CONFIG } from '../../data/accidentBlackspots'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

const HAZARD_MAP = Object.fromEntries(HAZARD_TYPES.map(h => [h.id, h]))

const destIcon = L.divIcon({
  html: '<div style="width:32px;height:32px;border-radius:50% 50% 50% 0;background:linear-gradient(135deg, #EF4444, #B91C1C);transform:rotate(-45deg);border:2.5px solid white;box-shadow:0 4px 12px rgba(239,68,68,0.45);display:flex;align-items:center;justify-content:center;"><span class="material-symbols-outlined icon-filled" style="color:white;font-size:15px;transform:rotate(45deg);margin-top:2px;margin-left:2px;">flag</span></div>',
  className: '',
  iconSize: [32, 32],
  iconAnchor: [16, 30],
  popupAnchor: [0, -28],
})

const userPuckIcon = L.divIcon({
  html: '<div style="position:relative;width:40px;height:40px;display:flex;align-items:center;justify-content:center;"><div style="position:absolute;width:38px;height:38px;border-radius:50%;background:rgba(56,189,248,0.25);box-shadow:0 0 10px rgba(56,189,248,0.4);animation:ping 2s cubic-bezier(0,0,0.2,1) infinite;"></div><div style="position:absolute;width:24px;height:24px;border-radius:50%;background:rgba(56,189,248,0.35);"></div><div style="position:relative;z-index:10;width:16px;height:16px;border-radius:50%;background:#ffffff;border:3.5px solid #2563EB;box-shadow:0 0 8px rgba(37,99,235,0.7);"></div></div>',
  className: '',
  iconSize: [40, 40],
  iconAnchor: [20, 20],
})

const createHazardPin = (severity, matIcon) => {
  const color = SEVERITY_COLORS[severity] || SEVERITY_COLORS.default
  return L.divIcon({
    html: `<div style="width:24px;height:24px;border-radius:50%;background:${color};border:2px solid white;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px ${color}60;"><span class="material-symbols-outlined icon-filled" style="color:white;font-size:11px;">${matIcon || 'warning'}</span></div>`,
    className:   '',
    iconSize:    [24, 24],
    iconAnchor:  [12, 12],
    popupAnchor: [0, -12],
  })
}

// ─── STRICT ROUTE COLOR MAPPING: Green (Safest) · Blue (Balanced) · Red (Least Safe) ───
export function getRouteColor(route, index) {
  if (!route) return '#10B981'
  if (route.rankLabel === 'SAFEST' || index === 0) return '#10B981'   // Emerald Green for Safest
  if (route.rankLabel === 'BALANCED' || index === 1) return '#2563EB' // Ocean Blue for Balanced
  return '#EF4444'                                                     // Vivid Red for Least Safe / Fastest
}

// ─── Floating Route Map Badge with Big Bold Safety Score ──────────────────────
function createRouteMapBadge(route, isSelected, mode, index = 0) {
  const rankColor = getRouteColor(route, index)
  const isRec = route.isRecommended || index === 0
  const durationText = fmtDuration(route.durationMin)
  const distText = `${route.distanceKm} km`
  const viaText = route.viaRoads ? `<div style="font-size:7.5px;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:115px;font-weight:700;">${route.viaRoads}</div>` : ''

  const recHtml = isRec ? '<div style="font-size:7.5px;font-weight:900;color:#10B981;letter-spacing:0.4px;text-transform:uppercase;">★ Top Recommended</div>' : ''
  const borderStyle = isSelected ? `2.5px solid ${rankColor}` : '1.5px solid #cbd5e1'
  const bgStyle = isSelected ? '#ffffff' : 'rgba(255,255,255,0.95)'
  const shadowStyle = isSelected ? '0 8px 24px rgba(0,0,0,0.25)' : '0 3px 10px rgba(0,0,0,0.14)'
  const scaleStyle = isSelected ? '1.05' : '0.94'

  const html = `<div style="background:${bgStyle};border:${borderStyle};border-radius:12px;padding:${isSelected ? '5px 8px' : '4px 6px'};box-shadow:${shadowStyle};display:flex;flex-direction:column;gap:1.5px;cursor:pointer;pointer-events:auto;transform:scale(${scaleStyle});transition:all 0.15s ease;min-width:105px;max-width:135px;user-select:none;">${recHtml}<div style="display:flex;align-items:center;justify-content:space-between;gap:4px;"><span style="font-size:12px;font-weight:900;color:#0f172a;">${durationText}</span><span style="background:${rankColor};color:white;padding:1px 5px;border-radius:6px;font-size:9.5px;font-weight:900;box-shadow:0 1px 4px ${rankColor}40;">🛡️ ${route.safetyScore || 75}</span></div><div style="display:flex;justify-content:space-between;align-items:center;font-size:8.5px;color:#64748b;font-weight:700;"><span>${distText}</span><span style="color:${isSelected ? rankColor : '#94a3b8'};font-weight:800;">${route.rankLabel || ''}</span></div>${viaText}</div>`

  return L.divIcon({
    html,
    className: 'leaflet-route-badge-marker',
    iconSize: [110, 48],
    iconAnchor: [55, 24],
  })
}

// ─── Map Camera Controller with Closer Zoom Framing ──────────────────────────
function MapController({ selectedGeometry, startLoc, destLoc, fitTrigger, recenterTrigger, sheetState }) {
  const map = useMap()

  useEffect(() => {
    if (!map) return
    let points = selectedGeometry && selectedGeometry.length > 1
      ? selectedGeometry
      : (destLoc && isFinite(destLoc.lat) && isFinite(destLoc.lng) && startLoc && isFinite(startLoc.lat) && isFinite(startLoc.lng)
          ? [[startLoc.lat, startLoc.lng], [destLoc.lat, destLoc.lng]]
          : null)

    if (points && points.length) {
      const validPoints = points.filter(p => Array.isArray(p) && p.length >= 2 && isFinite(p[0]) && isFinite(p[1]))
      if (validPoints.length >= 2) {
        try {
          const bottomPad = sheetState === 'expanded' ? 240 : sheetState === 'half' ? 180 : 80
          map.fitBounds(validPoints, {
            paddingTopLeft: [15, 50],
            paddingBottomRight: [15, bottomPad],
            maxZoom: 18,
            animate: true,
          })
        } catch (e) {
          console.warn('[MapController] fitBounds error:', e)
        }
      }
    }
  }, [selectedGeometry, destLoc, startLoc?.lat, startLoc?.lng, fitTrigger, sheetState, map])

  useEffect(() => {
    if (!map || !recenterTrigger || !startLoc || !isFinite(startLoc.lat) || !isFinite(startLoc.lng)) return
    try {
      map.setView([startLoc.lat, startLoc.lng], 16, { animate: true })
    } catch (e) {
      console.warn('[MapController] setView error:', e)
    }
  }, [recenterTrigger, startLoc?.lat, startLoc?.lng, map])

  return null
}

const TRANSPORT_MODES = [
  { id: 'driving', label: 'Drive', icon: 'directions_car',  color: '#004ac6' },
  { id: 'cycling', label: 'Cycle', icon: 'directions_bike', color: '#F59E0B' },
  { id: 'walking', label: 'Walk',  icon: 'directions_walk', color: '#10B981' },
]

function timeAgo(ts) {
  if (!ts) return ''
  const d    = ts?.toDate ? ts.toDate() : new Date(ts)
  const mins = Math.floor((Date.now() - d.getTime()) / 60000)
  if (mins < 1)  return 'Just now'
  if (mins < 60) return `${mins}m ago`
  return `${Math.floor(mins / 60)}h ago`
}

function fmtDuration(totalMin) {
  if (!totalMin && totalMin !== 0) return '—'
  const m = Math.round(totalMin)
  if (m < 60) return `${m} min`
  const h   = Math.floor(m / 60)
  const rem = m % 60
  return rem === 0 ? `${h}h` : `${h}h ${rem}min`
}

function getArrivalTimeStr(durationMin) {
  if (!durationMin) return ''
  const d = new Date(Date.now() + durationMin * 60 * 1000)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export default function RouteSelectionPage() {
  const navigate = useNavigate()
  const {
    userLocation, startLocation, destination, setRoutes,
    selectedRouteIdx, setSelectedRouteIdx,
    nearbyPlaces, reports, setIsNavigating,
  } = useAppStore()

  const [loading,          setLoading]          = useState(false)
  const [routeError,       setRouteError]       = useState(false)
  const [rawRoutes,        setRawRoutes]        = useState([])
  const [transportMode,    setTransportMode]    = useState('driving')
  const [sheetState,       setSheetState]       = useState('half') // 'collapsed' | 'half' | 'expanded'
  const [expandedCardIdx,  setExpandedCardIdx]  = useState(null)   // per-card safety breakdown toggle
  const [showCrimes,       setShowCrimes]       = useState(true)
  const [showFloodRisk,    setShowFloodRisk]    = useState(true)
  const [showDisasters,    setShowDisasters]    = useState(true)
  const [showAccidents,    setShowAccidents]    = useState(true)
  const [showTraffic,      setShowTraffic]      = useState(false)
  const [fitTrigger,       setFitTrigger]       = useState(0)
  const [recenterTrigger,  setRecenterTrigger]  = useState(0)
  const [liveFloodData,    setLiveFloodData]    = useState([])
  const [floodLoading,     setFloodLoading]     = useState(false)
  const [medicalProfile,   setMedicalProfile]   = useState(null)
  const [envPenalties,     setEnvPenalties]     = useState([])
  const [envLoading,       setEnvLoading]       = useState(false)
  const [routeEnvData,     setRouteEnvData]     = useState({})
  const [isStartingNav,    setIsStartingNav]    = useState(false)
  const [tileUrl,          setTileUrl]          = useState(mapProvider.getStatus().tileUrl)

  // Subscribe to central map provider tile updates (Google Maps vs OSM fallback)
  useEffect(() => {
    return mapProvider.subscribe(status => {
      setTileUrl(status.tileUrl)
    })
  }, [])

  // ── Load user's saved Medical Profile (Asthma / Allergy detection) ─────────
  useEffect(() => {
    const uid = auth?.currentUser?.uid
    if (!uid) return
    loadMedicalProfile(uid)
      .then(profile => setMedicalProfile(profile))
      .catch(() => setMedicalProfile(null))
  }, [])

  useEffect(() => {
    setFloodLoading(true)
    fetchLiveFloodData()
      .then(data => setLiveFloodData(data))
      .catch(() => setLiveFloodData([]))
      .finally(() => setFloodLoading(false))
  }, [])

  const TRAFFIC_PENALTY_MAP = {
    heavy:    8,
    moderate: 4,
    clear:    0,
  }

  const routesWithScores = useMemo(() => {
    if (!rawRoutes.length) return []

    const baseScored = calculateRouteSafetyScores(
      rawRoutes, nearbyPlaces, reports,
      CRIME_HOTSPOTS,
      FLOOD_ZONES_STATIC,
      DISASTER_ZONES,
      ACCIDENT_BLACKSPOTS,
    )

    const withTraffic = baseScored.map((route, rIdx) => {
      const trafficInfo = getTrafficStatus(route)
      let trafficLevel = 'clear'
      if (trafficInfo.color === TRAFFIC_COLORS.heavy) trafficLevel = 'heavy'
      else if (trafficInfo.color === TRAFFIC_COLORS.moderate) trafficLevel = 'moderate'
      const trafficPenalty = TRAFFIC_PENALTY_MAP[trafficLevel] || 0
      return {
        ...route,
        viaRoads: route.viaRoads || (rIdx === 0 ? 'via Main Corridor' : rIdx === 1 ? 'via Arterial Bypass' : 'via Alternate Link'),
        safetyScore: Math.max(10, route.safetyScore - trafficPenalty),
        trafficPenalty,
        trafficLevel,
        trafficInfo,
      }
    })
    return deduplicateRoutes(withTraffic)
  }, [rawRoutes, nearbyPlaces, reports])

  const rawStart = startLocation || userLocation || { lat: 22.5726, lng: 88.3639 }
  const startLoc = {
    ...rawStart,
    lat: isFinite(parseFloat(rawStart?.lat)) ? parseFloat(rawStart.lat) : 22.5726,
    lng: isFinite(parseFloat(rawStart?.lng ?? rawStart?.lon)) ? parseFloat(rawStart.lng ?? rawStart.lon) : 88.3639,
  }

  const destLoc = destination && (destination.lat !== undefined && destination.lat !== null) ? {
    ...destination,
    lat: isFinite(parseFloat(destination.lat)) ? parseFloat(destination.lat) : 22.5726,
    lng: isFinite(parseFloat(destination.lng ?? destination.lon)) ? parseFloat(destination.lng ?? destination.lon) : 88.3639,
  } : null

  // ── Fetch Environmental & AQI Data per Route Midpoint (Linked with Medical Profile) ──
  useEffect(() => {
    if (!routesWithScores.length || !destLoc) return

    const fetchEnvData = async () => {
      setEnvLoading(true)
      try {
        const weights = getEnvironmentalWeights(medicalProfile)

        const penalties = await Promise.all(
          routesWithScores.map(async (route, idx) => {
            const geometry = route.geometry || []
            const midIdx = Math.floor(geometry.length / 2)
            const sampleLat = geometry[midIdx]?.[0] ?? destLoc.lat
            const sampleLng = geometry[midIdx]?.[1] ?? destLoc.lng

            const [envData, riskData] = await Promise.all([
              fetchEnvironmentalData(sampleLat, sampleLng),
              fetchEnvironmentalSafetyRisk(sampleLat, sampleLng),
            ])

            const { penalty: envPenalty, breakdown: envBreakdown } = computeEnvironmentalPenalty(envData, weights)
            const { penalty: riskPenalty, reasons: riskReasons }   = computeSafetyRiskPenalty(riskData)
            const envReasons = getEnvironmentalReasons(envData, weights)
            const safetyRiskReasons = getSafetyRiskReasons(riskData)

            setRouteEnvData(prev => ({ ...prev, [idx]: envData }))

            return {
              routeIdx: idx,
              envPenalty,
              riskPenalty,
              envBreakdown,
              envReasons,
              riskReasons: [...riskReasons, ...safetyRiskReasons],
              envData,
            }
          })
        )
        setEnvPenalties(penalties)
      } catch (err) {
        console.warn('[RouteSelection] Env fetch error:', err.message)
        setEnvPenalties([])
      } finally {
        setEnvLoading(false)
      }
    }

    fetchEnvData()
  }, [routesWithScores, medicalProfile])

  // ── Routes with Environmental & AQI Penalties Applied ──────────────────────
  const displayedRoutes = useMemo(() => {
    if (!routesWithScores.length || !envPenalties.length) return routesWithScores
    return applyEnvironmentalPenalties(routesWithScores, envPenalties)
  }, [routesWithScores, envPenalties])

  useEffect(() => {
    if (!destination) { navigate('/search'); return }
    loadRoutes(transportMode)
  }, [destination, startLocation])

  const loadRoutes = async (mode) => {
    setLoading(true)
    setRouteError(false)
    setRawRoutes([])
    try {
      const fetched = await getRoute(startLoc.lat, startLoc.lng, destLoc.lat, destLoc.lng, mode)
      setRawRoutes(fetched)
      setRoutes(fetched)
      setSelectedRouteIdx(0)
      setFitTrigger(prev => prev + 1)
    } catch (err) {
      console.warn('[RouteSelection] All routing engines failed/timed out.', err)
      setRouteError(true)
      setRoutes([])
    } finally {
      setLoading(false)
    }
  }

  const handleModeChange = (mode) => {
    setTransportMode(mode)
    loadRoutes(mode)
  }

  const handleSelectRoute = (idx) => {
    setSelectedRouteIdx(idx)
    setFitTrigger(prev => prev + 1)
  }

  const handleStartJourney = () => {
    setIsStartingNav(true)
  }

  const proceedToNavigation = () => {
    if (displayedRoutes && displayedRoutes.length > 0) {
      setRoutes(displayedRoutes)
    }
    setIsNavigating(true)
    navigate('/navigate')
  }

  const selectedRoute = displayedRoutes[selectedRouteIdx] || displayedRoutes[0]
  const onRouteReports = selectedRoute?.onRouteReports || []
  const monsoon = isMonsoonSeason()

  return (
    <div className="relative w-full h-full overflow-hidden bg-slate-900 select-none">
      {/* ════════ MAP CANVAS (FULL SCREEN GOOGLE MAP TILES) ════════ */}
      <div className="absolute inset-0 z-0">
        <MapContainer
          center={[startLoc.lat, startLoc.lng]}
          zoom={14}
          style={{ height: '100%', width: '100%' }}
          zoomControl={false}
          attributionControl={false}
        >
          <TileLayer
            url={tileUrl}
            subdomains="abcd"
            maxZoom={19}
            eventHandlers={{
              tileerror: () => {
                mapProvider.recordTileError('google')
              },
            }}
          />

          {showTraffic && (
            <>
              <TileLayer url={getTrafficTileUrl('relative')} opacity={0.5} zIndex={5} />
              <TileLayer url={getIncidentTileUrl()} opacity={0.7} zIndex={6} />
            </>
          )}

          {/* CRIME HOTSPOTS */}
          {showCrimes && CRIME_HOTSPOTS.map(hotspot => {
            const cfg = CRIME_SEVERITY_CONFIG[hotspot.severity] || CRIME_SEVERITY_CONFIG.low
            return (
              <Circle
                key={hotspot.id}
                center={[hotspot.lat, hotspot.lng]}
                radius={hotspot.radius}
                pathOptions={{
                  color: cfg.color,
                  fillColor: cfg.fillColor,
                  fillOpacity: cfg.fillOpacity,
                  weight: 1.5,
                  opacity: 0.65,
                }}
              >
                <Popup>
                  <div style={{ minWidth: 160 }}>
                    <p style={{ fontWeight: 900, fontSize: 11, color: cfg.color }}>{cfg.label} — {hotspot.area}</p>
                    <p style={{ fontSize: 10, color: '#475569', marginTop: 4 }}>{hotspot.description}</p>
                    <p style={{ fontSize: 9, color: '#94a3b8', marginTop: 4 }}>Source: {hotspot.source}</p>
                  </div>
                </Popup>
              </Circle>
            )
          })}

          {/* FLOOD ZONES */}
          {(showDisasters && showFloodRisk) && FLOOD_ZONES_STATIC.map(zone => {
            const cfg = FLOOD_SEVERITY_CONFIG[zone.severity] || FLOOD_SEVERITY_CONFIG.low
            const livePoint = liveFloodData.find(p =>
              Math.abs(p.lat - zone.lat) < 0.5 && Math.abs(p.lng - zone.lng) < 1.0
            )
            return (
              <Circle
                key={zone.id}
                center={[zone.lat, zone.lng]}
                radius={zone.radius}
                pathOptions={{
                  color: cfg.color,
                  fillColor: cfg.fillColor,
                  fillOpacity: monsoon && zone.monsoonRisk ? cfg.fillOpacity * 1.5 : cfg.fillOpacity,
                  weight: 1.5,
                  opacity: 0.6,
                }}
              >
                <Popup>
                  <div style={{ minWidth: 170 }}>
                    <p style={{ fontWeight: 900, fontSize: 11, color: cfg.color }}>{cfg.label} — {zone.area}</p>
                    <p style={{ fontSize: 10, color: '#475569', marginTop: 4 }}>{zone.description}</p>
                    {livePoint && (
                      <p style={{ fontSize: 9, fontWeight: 700, color: cfg.color, marginTop: 4 }}>
                        Live: {livePoint.currentDischarge.toLocaleString()} m³/s · {livePoint.trend === 'rising' ? '↑ Rising' : '↓ Falling'}
                      </p>
                    )}
                    {monsoon && zone.monsoonRisk && (
                      <p style={{ fontSize: 9, fontWeight: 900, color: '#1D4ED8', marginTop: 2 }}>⚡ Monsoon risk active</p>
                    )}
                  </div>
                </Popup>
              </Circle>
            )
          })}

          {/* DISASTER ZONES */}
          {showDisasters && DISASTER_ZONES.map(dz => {
            const cfg = DISASTER_SEVERITY_CONFIG[dz.severity] || DISASTER_SEVERITY_CONFIG.medium
            return (
              <Circle
                key={dz.id}
                center={[dz.lat, dz.lng]}
                radius={dz.radius}
                pathOptions={{
                  color: cfg.color,
                  fillColor: cfg.fillColor,
                  fillOpacity: cfg.fillOpacity,
                  weight: 1.5,
                  opacity: 0.65,
                }}
              >
                <Popup>
                  <div style={{ minWidth: 170 }}>
                    <p style={{ fontWeight: 900, fontSize: 11, color: cfg.color }}>{dz.title}</p>
                    <p style={{ fontSize: 10, fontWeight: 700, color: '#1e293b', marginTop: 2 }}>{dz.area}</p>
                    <p style={{ fontSize: 9.5, color: '#475569', marginTop: 3 }}>{dz.description}</p>
                    <p style={{ fontSize: 8.5, color: '#94a3b8', marginTop: 4 }}>Source: {dz.source}</p>
                  </div>
                </Popup>
              </Circle>
            )
          })}

          {/* ACCIDENT BLACKSPOTS */}
          {showAccidents && ACCIDENT_BLACKSPOTS.map(acc => {
            const cfg = ACCIDENT_SEVERITY_CONFIG[acc.severity] || ACCIDENT_SEVERITY_CONFIG.medium
            return (
              <Circle
                key={acc.id}
                center={[acc.lat, acc.lng]}
                radius={acc.radius}
                pathOptions={{
                  color: cfg.color,
                  fillColor: cfg.fillColor,
                  fillOpacity: cfg.fillOpacity,
                  weight: 1.5,
                  opacity: 0.7,
                }}
              >
                <Popup>
                  <div style={{ minWidth: 170 }}>
                    <p style={{ fontWeight: 900, fontSize: 11, color: cfg.color }}>⚠️ {acc.title}</p>
                    <p style={{ fontSize: 10, fontWeight: 700, color: '#1e293b', marginTop: 2 }}>{acc.area}</p>
                    <p style={{ fontSize: 9.5, color: '#475569', marginTop: 3 }}>{acc.description}</p>
                    <p style={{ fontSize: 8.5, color: '#94a3b8', marginTop: 4 }}>Source: {acc.source}</p>
                  </div>
                </Popup>
              </Circle>
            )
          })}

          {/* Map Camera Controller */}
          <MapController
            selectedGeometry={selectedRoute?.geometry}
            startLoc={startLoc}
            destLoc={destLoc}
            fitTrigger={fitTrigger}
            recenterTrigger={recenterTrigger}
            sheetState={sheetState}
          />

          {/* ════════ LAYERED ROUTE RENDERING WITH STRICT GREEN / BLUE / RED COLORS ════════ */}
          {/* 1. Alternative unselected routes (Dashed lines) */}
          {displayedRoutes.map((route, idx) => {
            if (idx === selectedRouteIdx) return null
            const baseColor = getRouteColor(route, idx)
            return (
              <Fragment key={`alt-route-frag-${idx}`}>
                <Polyline
                  key={`alt-casing-${idx}`}
                  positions={route.geometry}
                  pathOptions={{
                    color: 'white',
                    weight: 7,
                    opacity: 0.75,
                    lineCap: 'round',
                    lineJoin: 'round',
                  }}
                  eventHandlers={{ click: () => handleSelectRoute(idx) }}
                />
                <Polyline
                  key={`alt-body-${idx}`}
                  positions={route.geometry}
                  pathOptions={{
                    color: baseColor,
                    weight: 4.5,
                    opacity: 0.7,
                    dashArray: idx === 0 ? '8 6' : '6 6',
                    lineCap: 'round',
                    lineJoin: 'round',
                  }}
                  eventHandlers={{ click: () => handleSelectRoute(idx) }}
                />
              </Fragment>
            )
          })}

          {/* 2. Selected route with clean casing + body + safety accents */}
          {selectedRoute && (() => {
            const primaryColor = getRouteColor(selectedRoute, selectedRouteIdx)
            return (
              <Fragment key={`sel-route-frag-${selectedRouteIdx}`}>
                <Polyline
                  key={`sel-casing-${selectedRouteIdx}`}
                  positions={selectedRoute.geometry}
                  pathOptions={{
                    color: '#ffffff',
                    weight: 10,
                    opacity: 0.95,
                    lineCap: 'round',
                    lineJoin: 'round',
                  }}
                />
                <Polyline
                  key={`sel-body-${selectedRouteIdx}`}
                  positions={selectedRoute.geometry}
                  pathOptions={{
                    color: primaryColor,
                    weight: 6,
                    opacity: 1,
                    lineCap: 'round',
                    lineJoin: 'round',
                  }}
                />
                {(selectedRoute.safetySegments || []).map((seg, sIdx) => (
                  <Polyline
                    key={`sel-seg-${selectedRouteIdx}-${sIdx}`}
                    positions={seg.points}
                    pathOptions={{
                      color: seg.color,
                      weight: 3.5,
                      opacity: 0.95,
                      lineCap: 'round',
                      lineJoin: 'round',
                    }}
                  />
                ))}
              </Fragment>
            )
          })()}

          {/* 3. Floating Interactive Route Map Badges */}
          {displayedRoutes.map((route, idx) => {
            const anchor = getRouteAnchorPoint(route.geometry, idx, displayedRoutes.length)
            const isSelected = idx === selectedRouteIdx
            return (
              <Marker
                key={`map-badge-${idx}`}
                position={anchor}
                icon={createRouteMapBadge(route, isSelected, transportMode, idx)}
                eventHandlers={{ click: () => handleSelectRoute(idx) }}
                zIndexOffset={isSelected ? 1000 : 500}
              />
            )
          })}

          {/* Hazard warning pins on selected route */}
          {onRouteReports.map(r => {
            const lat = r._snapLat ?? r.latitude ?? r.lat
            const lng = r._snapLng ?? r.longitude ?? r.lng
            if (!isFinite(lat) || !isFinite(lng)) return null
            const typeId = r.hazardType || r.type || 'other'
            const ht     = HAZARD_MAP[typeId] || { icon: 'warning', label: 'Hazard', color: '#737686' }
            const color  = SEVERITY_COLORS[r.severity] || SEVERITY_COLORS.default
            return (
              <Marker
                key={r.id || `report-${lat}-${lng}`}
                position={[lat, lng]}
                icon={createHazardPin(r.severity, ht.icon)}
                zIndexOffset={800}
              >
                <Popup>
                  <div style={{ minWidth: '150px', maxWidth: '200px' }}>
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="material-symbols-outlined icon-filled" style={{ color: ht.color, fontSize: '14px' }}>{ht.icon}</span>
                      <p className="font-black text-xs text-[#0f172a]">{ht.label}</p>
                    </div>
                    <span className="text-[8px] font-black px-1.5 py-0.5 rounded-full uppercase" style={{ color, background: color + '22' }}>
                      {r.severity || 'medium'}
                    </span>
                    {r.description && <p className="text-[10px] text-[#64748b] mt-1 leading-relaxed">{r.description}</p>}
                    <p className="text-[9px] text-[#94a3b8] mt-1">⚠️ -{r._penalty || 2}pts · {timeAgo(r.createdAt || r.timestamp)}</p>
                  </div>
                </Popup>
              </Marker>
            )
          })}

          {startLoc && isFinite(startLoc.lat) && isFinite(startLoc.lng) && (
            <Marker position={[startLoc.lat, startLoc.lng]} icon={userPuckIcon} zIndexOffset={2000} />
          )}
          {destLoc && isFinite(destLoc.lat) && isFinite(destLoc.lng) && (
            <Marker position={[destLoc.lat, destLoc.lng]} icon={destIcon} zIndexOffset={2000}>
              <Popup><div className="text-xs font-bold text-slate-800">{destination?.name || 'Destination'}</div></Popup>
            </Marker>
          )}
        </MapContainer>
      </div>

      {/* ════════ FLOATING MAP CONTROLS ════════ */}
      <div className="absolute top-[170px] right-3 z-20 flex flex-col gap-2 items-end">
        {/* Fit Route Button */}
        <button
          onClick={() => setFitTrigger(f => f + 1)}
          title="Fit route into view"
          className="w-9 h-9 rounded-full bg-white/95 backdrop-blur-md shadow-md border border-slate-200 flex items-center justify-center text-slate-700 active:scale-90 transition-transform"
        >
          <span className="material-symbols-outlined text-[19px]">crop_free</span>
        </button>

        {/* Recenter User GPS */}
        <button
          onClick={() => setRecenterTrigger(r => r + 1)}
          title="Center my location"
          className="w-9 h-9 rounded-full bg-white/95 backdrop-blur-md shadow-md border border-slate-200 flex items-center justify-center text-[#004ac6] active:scale-90 transition-transform"
        >
          <span className="material-symbols-outlined icon-filled text-[19px]">my_location</span>
        </button>

        {/* Crime Zones Toggle */}
        <button
          onClick={() => setShowCrimes(c => !c)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full shadow-md border active:scale-95 transition-all"
          style={{
            background:  showCrimes ? '#EF4444' : 'rgba(255,255,255,0.95)',
            borderColor: showCrimes ? '#DC2626' : '#e2e8f0',
            backdropFilter: 'blur(8px)',
          }}
        >
          <span className="material-symbols-outlined icon-filled" style={{ fontSize: 13, color: showCrimes ? 'white' : '#EF4444' }}>report</span>
          <span className="text-[10px] font-black tracking-wide" style={{ color: showCrimes ? 'white' : '#475569' }}>Crime</span>
          {showCrimes && (
            <span style={{ fontSize: 9, fontWeight: 900, background: 'rgba(255,255,255,0.3)', color: 'white', padding: '0 4px', borderRadius: 99 }}>
              {CRIME_HOTSPOTS.length}
            </span>
          )}
        </button>

        {/* Flood & Disaster Hazards Toggle */}
        <button
          onClick={() => {
            setShowDisasters(d => !d)
            setShowFloodRisk(f => !f)
          }}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full shadow-md border active:scale-95 transition-all"
          style={{
            background:  showDisasters ? '#1D4ED8' : 'rgba(255,255,255,0.95)',
            borderColor: showDisasters ? '#1E40AF' : '#e2e8f0',
            backdropFilter: 'blur(8px)',
          }}
        >
          <span className="material-symbols-outlined icon-filled" style={{ fontSize: 13, color: showDisasters ? 'white' : '#1D4ED8' }}>flood</span>
          <span className="text-[10px] font-black tracking-wide" style={{ color: showDisasters ? 'white' : '#475569' }}>
            Disaster & Flood{monsoon ? ' ⚡' : ''}
          </span>
          {showDisasters && (
            <span style={{ fontSize: 9, fontWeight: 900, background: 'rgba(255,255,255,0.3)', color: 'white', padding: '0 4px', borderRadius: 99 }}>
              {DISASTER_ZONES.length + liveFloodData.length}
            </span>
          )}
        </button>

        {/* Accident Blackspots Toggle */}
        <button
          onClick={() => setShowAccidents(a => !a)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full shadow-md border active:scale-95 transition-all"
          style={{
            background:  showAccidents ? '#B91C1C' : 'rgba(255,255,255,0.95)',
            borderColor: showAccidents ? '#991B1B' : '#e2e8f0',
            backdropFilter: 'blur(8px)',
          }}
        >
          <span className="material-symbols-outlined icon-filled" style={{ fontSize: 13, color: showAccidents ? 'white' : '#B91C1C' }}>car_crash</span>
          <span className="text-[10px] font-black tracking-wide" style={{ color: showAccidents ? 'white' : '#475569' }}>Accidents</span>
        </button>

        {/* Traffic Toggle */}
        <button
          onClick={() => setShowTraffic(t => !t)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full shadow-md border active:scale-95 transition-all"
          style={{
            background:  showTraffic ? '#F59E0B' : 'rgba(255,255,255,0.95)',
            borderColor: showTraffic ? '#D97706' : '#e2e8f0',
            backdropFilter: 'blur(8px)',
          }}
        >
          <span className="material-symbols-outlined icon-filled" style={{ fontSize: 13, color: showTraffic ? 'white' : '#F59E0B' }}>traffic</span>
          <span className="text-[10px] font-black tracking-wide" style={{ color: showTraffic ? 'white' : '#475569' }}>Traffic</span>
        </button>
      </div>

      {/* ════════ FLOATING COMPACT TOP BAR ════════ */}
      <div className="absolute top-0 left-0 right-0 z-30 px-3 pt-3 md:w-[410px] md:left-4 md:top-4 md:px-0 md:pt-0 pointer-events-none">
        <div className="glass-panel rounded-2xl flex flex-col p-2.5 shadow-xl border border-white/40 gap-1.5 pointer-events-auto">
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate(-1)}
              className="w-7 h-7 rounded-xl bg-[#f1f5f9] hover:bg-[#e2e8f0] flex items-center justify-center active:scale-90 transition-transform flex-shrink-0"
            >
              <span className="material-symbols-outlined text-[#334155] text-[16px]">arrow_back</span>
            </button>
            <div className="flex-1 min-w-0">
              <h1 className="text-xs font-black text-[#0f172a] truncate">Preview Routes</h1>
            </div>
            <div className="flex items-center gap-1 bg-[#10B981]/15 px-2 py-0.5 rounded-full flex-shrink-0">
              <div className="w-1.5 h-1.5 rounded-full bg-[#10B981] animate-pulse" />
              <span className="text-[9px] font-black text-[#059669]">Safety Active</span>
            </div>
          </div>

          {/* From / To Compact Badges */}
          <div className="flex flex-col gap-1 text-[11px]">
            <button
              onClick={() => navigate('/search?type=start')}
              className="w-full flex items-center gap-2 bg-white/70 hover:bg-white rounded-lg px-2 py-1 text-left transition-colors border border-slate-100/80"
            >
              <div className="w-2 h-2 rounded-full bg-[#004ac6] flex-shrink-0" />
              <p className="font-semibold text-slate-800 truncate flex-1">
                {startLocation?.name || 'Current Location'}
              </p>
              <span className="material-symbols-outlined text-slate-400 text-[12px]">edit</span>
            </button>

            <button
              onClick={() => navigate('/search')}
              className="w-full flex items-center gap-2 bg-white/70 hover:bg-white rounded-lg px-2 py-1 text-left transition-colors border border-slate-100/80"
            >
              <div className="w-2 h-2 bg-[#EF4444] flex-shrink-0 rotate-45" />
              <p className="font-semibold text-slate-800 truncate flex-1">
                {destination?.name || 'Destination'}
              </p>
              <span className="material-symbols-outlined text-slate-400 text-[12px]">edit</span>
            </button>
          </div>
        </div>
      </div>

      {/* ════════ 3-STATE COLLAPSIBLE BOTTOM SHEET (MAP DOMINANT & FULLY SCROLLABLE) ════════ */}
      <div className={`absolute left-0 right-0 bottom-0 z-30 transition-all duration-300 ease-in-out md:w-[410px] md:left-4 md:right-auto md:bottom-2 md:top-[155px] md:flex md:flex-col md:max-h-[calc(100vh-175px)] min-h-0 pointer-events-auto ${
        sheetState === 'collapsed' ? 'translate-y-[calc(100%-80px)] md:translate-y-0' :
        sheetState === 'half' ? 'translate-y-0 md:translate-y-0' :
        'translate-y-0 md:translate-y-0'
      }`}>
        <div className={`bg-white/95 backdrop-blur-md rounded-t-3xl md:rounded-3xl shadow-[0_-8px_30px_rgba(0,0,0,0.18)] border border-slate-200/90 flex flex-col min-h-0 transition-all duration-300 ${
          sheetState === 'collapsed' ? 'h-[85px]' :
          sheetState === 'half' ? 'h-[58vh] max-h-[60vh] md:h-full md:max-h-full flex-1' :
          'h-[84vh] max-h-[86vh] md:h-full md:max-h-full flex-1'
        }`}>
          {/* Drag handle / State Toggle */}
          <div
            className="flex flex-col items-center pt-2 pb-1 cursor-pointer select-none"
            onClick={() => setSheetState(s => s === 'collapsed' ? 'half' : s === 'half' ? 'collapsed' : 'half')}
          >
            <div className="w-10 h-1.5 rounded-full bg-slate-300 hover:bg-slate-400 transition-colors" />
          </div>

          {/* STATE 1: COLLAPSED PEEK BAR */}
          {sheetState === 'collapsed' && selectedRoute && (
            <div className="px-4 py-1.5 flex items-center justify-between gap-3">
              <div
                className="flex-1 min-w-0 cursor-pointer"
                onClick={() => setSheetState('half')}
              >
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: getRouteColor(selectedRoute, selectedRouteIdx) }} />
                  <span className="text-xs font-black text-slate-900 truncate">
                    {selectedRoute.rankLabel} · {fmtDuration(selectedRoute.durationMin)}
                  </span>
                  <span className="text-[9px] font-bold text-slate-500">({selectedRoute.distanceKm} km)</span>
                </div>
                <p className="text-[10px] text-slate-500 font-semibold truncate mt-0.5">
                  {selectedRoute.viaRoads} · <strong className="text-emerald-700 font-black">🛡️ {selectedRoute.safetyScore || 75}/100</strong>
                </p>
              </div>

              <button
                onClick={handleStartJourney}
                className="h-9 px-4 rounded-xl bg-[#004ac6] text-white font-black text-xs shadow-md active:scale-95 transition-all flex items-center gap-1 flex-shrink-0"
              >
                <span>Start</span>
                <span className="material-symbols-outlined text-[14px]">navigation</span>
              </button>
            </div>
          )}

          {/* STATE 2 & 3: HALF COMPARISON & FULL EXPANDED CONTENT */}
          {sheetState !== 'collapsed' && (
            <div className="px-3 pb-3 flex flex-col overflow-hidden flex-1 min-h-0">
              {/* Mode Tabs */}
              <div className="flex items-center justify-between gap-2 mb-2 flex-shrink-0">
                <div className="flex-1 bg-slate-100/90 rounded-xl p-1 flex gap-1">
                  {TRANSPORT_MODES.map(m => (
                    <button
                      key={m.id}
                      onClick={() => handleModeChange(m.id)}
                      className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-black transition-all ${
                        transportMode === m.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      <span className="material-symbols-outlined icon-filled text-[14px]" style={transportMode === m.id ? { color: m.color } : {}}>{m.icon}</span>
                      {m.label}
                    </button>
                  ))}
                </div>

                {/* Sheet expand/collapse toggler */}
                <button
                  onClick={() => setSheetState(s => s === 'expanded' ? 'half' : 'expanded')}
                  title={sheetState === 'expanded' ? 'Collapse view' : 'Expand full details'}
                  className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 active:scale-90 transition-transform flex-shrink-0"
                >
                  <span className="material-symbols-outlined text-[18px]">
                    {sheetState === 'expanded' ? 'unfold_less' : 'unfold_more'}
                  </span>
                </button>
              </div>

              {/* Route Alternatives List with SMOOTH TOUCH & MOUSE SCROLLING */}
              <div
                className="flex flex-col gap-2.5 overflow-y-auto flex-1 min-h-0 custom-scrollbar pr-1"
                style={{
                  WebkitOverflowScrolling: 'touch',
                  overscrollBehaviorY: 'contain',
                  scrollBehavior: 'smooth',
                  touchAction: 'pan-y',
                  pointerEvents: 'auto',
                }}
              >
                {loading && (
                  <div className="text-center py-4">
                    <span className="material-symbols-outlined text-slate-400 text-[24px] animate-spin">refresh</span>
                    <p className="text-xs text-slate-500 font-bold mt-1">Calculating road geometries & safety…</p>
                  </div>
                )}

                {displayedRoutes.map((route, idx) => {
                  const isSelected = selectedRouteIdx === idx
                  const color = getRouteColor(route, idx)
                  const isExpanded = expandedCardIdx === idx || (sheetState === 'expanded' && isSelected)
                  const scoreInfo = getScoreLabel(route.safetyScore || 75)
                  const hazardCnt = route.onRouteReports?.length || 0

                  return (
                    <div
                      key={idx}
                      onClick={() => handleSelectRoute(idx)}
                      className={`w-full p-3 rounded-2xl border-2 cursor-pointer transition-all duration-150 active:scale-[0.99] ${
                        isSelected
                          ? 'bg-blue-50/60 shadow-sm'
                          : 'bg-white hover:bg-slate-50 border-slate-200/90'
                      }`}
                      style={isSelected ? { borderColor: color, backgroundColor: color + '0a' } : {}}
                    >
                      {/* Row 1: Badges, Via Road Name, Duration, Distance & BIG SAFETY SCORE HERO */}
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span
                              className="text-white text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wide"
                              style={{ backgroundColor: color }}
                            >
                              {route.rankLabel}
                            </span>
                            {route.isRecommended && (
                              <span className="text-[8.5px] font-black px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-800">
                                ★ Top Pick
                              </span>
                            )}
                            {route.envData?.aqi !== null && route.envData?.aqi !== undefined && (
                              <span
                                className="text-[8.5px] font-black px-1.5 py-0.5 rounded-md flex items-center gap-0.5"
                                style={{
                                  backgroundColor: route.envData.aqi <= 30 ? '#dcfce7' : route.envData.aqi <= 60 ? '#fef3c7' : '#fee2e2',
                                  color: route.envData.aqi <= 30 ? '#166534' : route.envData.aqi <= 60 ? '#92400e' : '#991b1b',
                                }}
                              >
                                <span>🍃 AQI {route.envData.aqi}</span>
                                <span className="opacity-80">({route.envData.aqiLabel || 'Moderate'})</span>
                              </span>
                            )}
                            {route.envBreakdown?.isRespiratory && (
                              <span className="text-[8.5px] font-black px-1.5 py-0.5 rounded-md bg-rose-100 text-rose-800 flex items-center gap-0.5">
                                <span>🫁 Asthma Profile</span>
                                {route.envPenalty > 0 && <span className="font-extrabold">(-{route.envPenalty}pts)</span>}
                              </span>
                            )}
                            <span className="text-[11.5px] font-bold text-slate-800 truncate">
                              {route.viaRoads}
                            </span>
                          </div>

                          {/* Row 2: Duration, Distance & Numerical Trade-off */}
                          <div className="flex items-baseline gap-2 mt-1.5">
                            <span className="text-base font-black text-slate-900 leading-none">{fmtDuration(route.durationMin)}</span>
                            <span className="text-xs font-bold text-slate-500">{route.distanceKm} km</span>
                            <span className="text-[10px] text-slate-500 font-semibold">· {route.tradeOffText}</span>
                          </div>
                        </div>

                        {/* BIG BOLD SAFETY SCORE BADGE (HERO ELEMENT) */}
                        <div
                          className="flex flex-col items-center justify-center px-2.5 py-1.5 rounded-xl border flex-shrink-0 shadow-sm"
                          style={{ background: color + '12', borderColor: color + '40' }}
                        >
                          <div className="flex items-baseline gap-0.5">
                            <span className="text-xl font-black leading-none" style={{ color }}>{route.safetyScore || 75}</span>
                            <span className="text-[9px] font-bold text-slate-400">/100</span>
                          </div>
                          <span className="text-[8.5px] font-black uppercase tracking-wider mt-0.5" style={{ color }}>
                            {scoreInfo.label}
                          </span>
                        </div>
                      </div>

                      {/* Row 3: Horizontal Safety Score Indicator Bar */}
                      <div className="mt-2 pt-1.5 border-t border-slate-100 flex items-center gap-2">
                        <span className="text-[8.5px] font-black text-slate-400 uppercase tracking-wider">Safety Level</span>
                        <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${route.safetyScore || 75}%`,
                              backgroundColor: color,
                            }}
                          />
                        </div>
                      </div>

                      {/* Row 4: Expandable Safety Impact & Detailed Intelligence */}
                      <div className="mt-2 pt-1 border-t border-slate-100/80">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedCardIdx(isExpanded ? null : idx);
                          }}
                          className="w-full flex items-center justify-between text-[10px] font-bold text-slate-600 hover:text-slate-900"
                        >
                          <span className="flex items-center gap-1">
                            <span className="material-symbols-outlined text-[13px]" style={{ color }}>analytics</span>
                            <span>{isExpanded ? 'Hide Safety Breakdown' : 'Why this score & safety breakdown?'}</span>
                          </span>
                          <span className="material-symbols-outlined text-[14px]">
                            {isExpanded ? 'expand_less' : 'expand_more'}
                          </span>
                        </button>

                        {/* FULL RESTORED SAFETY BREAKDOWN */}
                        {isExpanded && (
                          <div className="mt-2 rounded-xl bg-white p-2.5 border border-slate-200/90 shadow-sm space-y-2 text-[10px]">
                            {/* Score Reasons Checklist */}
                            <div>
                              <p className="font-black text-slate-800 uppercase tracking-wider text-[9px] mb-1">✓ Safety Advantages & Profile</p>
                              <div className="space-y-1 text-slate-600">
                                {getScoreReasons(
                                  route.safetyScore || 75,
                                  route.rankLabel,
                                  route.envReasons || [],
                                  route.riskReasons || [],
                                  route,
                                ).map((r, ri) => (
                                  <div key={ri} className="flex items-start gap-1.5">
                                    <span className="text-emerald-600 font-black flex-shrink-0">✓</span>
                                    <span>{r}</span>
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* Point Deductions & Risk Factors */}
                            {(route.crimePenalty > 0 || route.floodPenalty > 0 || route.disasterPenalty > 0 || route.accidentPenalty > 0 || route.trafficPenalty > 0 || route.envPenalty > 0 || hazardCnt > 0) && (
                              <div className="pt-2 border-t border-slate-100 space-y-1.5">
                                <p className="font-black text-slate-800 uppercase tracking-wider text-[9px]">⚠️ Safety Deductions (Points Lost)</p>

                                {/* Environmental / AQI / Asthma Deductions */}
                                {route.envPenalty > 0 && (
                                  <div className="bg-rose-50/70 p-1.5 rounded-lg border border-rose-100">
                                    <div className="flex justify-between items-center text-rose-700 font-bold text-[9.5px]">
                                      <span>🫁 Environmental & Air Quality Factor</span>
                                      <span className="font-black">-{route.envPenalty} pts</span>
                                    </div>
                                    <div className="mt-0.5 text-[8.5px] text-rose-600">
                                      {route.envBreakdown?.isRespiratory
                                        ? `Asthma Profile: AQI ${route.envData?.aqi || 'elevated'} causes increased respiratory penalty`
                                        : `AQI ${route.envData?.aqi || 'moderate'}`}
                                    </div>
                                  </div>
                                )}

                                {/* Crime Deductions */}
                                {route.onRouteCrimes?.length > 0 && (
                                  <div className="bg-red-50/70 p-1.5 rounded-lg border border-red-100">
                                    <div className="flex justify-between items-center text-red-700 font-bold text-[9.5px]">
                                      <span>🚨 Crime Zones on Route</span>
                                      <span className="font-black">-{route.crimePenalty} pts</span>
                                    </div>
                                    <div className="mt-1 space-y-0.5 text-[8.5px] text-red-600">
                                      {route.onRouteCrimes.slice(0, 2).map(c => (
                                        <div key={c.id} className="flex justify-between">
                                          <span>• {c.area} ({c.severity} risk)</span>
                                          <span>-{c._penalty}pts</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {/* Flood Risk Deductions */}
                                {route.onRouteFlood?.length > 0 && (
                                  <div className="bg-blue-50/70 p-1.5 rounded-lg border border-blue-100">
                                    <div className="flex justify-between items-center text-blue-700 font-bold text-[9.5px]">
                                      <span>🌊 Flood Risk Zones</span>
                                      <span className="font-black">-{route.floodPenalty} pts</span>
                                    </div>
                                    <div className="mt-1 space-y-0.5 text-[8.5px] text-blue-600">
                                      {route.onRouteFlood.slice(0, 2).map(z => (
                                        <div key={z.id} className="flex justify-between">
                                          <span>• {z.area} ({z.severity} risk)</span>
                                          <span>-{z._penalty}pts</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {/* Disaster Risk Deductions */}
                                {route.onRouteDisasters?.length > 0 && (
                                  <div className="bg-orange-50/70 p-1.5 rounded-lg border border-orange-100">
                                    <div className="flex justify-between items-center text-orange-700 font-bold text-[9.5px]">
                                      <span>⚡ Natural Hazard & Subsidence Zones</span>
                                      <span className="font-black">-{route.disasterPenalty} pts</span>
                                    </div>
                                    <div className="mt-1 space-y-0.5 text-[8.5px] text-orange-600">
                                      {route.onRouteDisasters.slice(0, 2).map(dz => (
                                        <div key={dz.id} className="flex justify-between">
                                          <span>• {dz.area}</span>
                                          <span>-{dz._penalty}pts</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {/* Accident Blackspots */}
                                {route.onRouteAccidents?.length > 0 && (
                                  <div className="bg-rose-50/70 p-1.5 rounded-lg border border-rose-100">
                                    <div className="flex justify-between items-center text-rose-700 font-bold text-[9.5px]">
                                      <span>🚗 Accident Blackspots</span>
                                      <span className="font-black">-{route.accidentPenalty} pts</span>
                                    </div>
                                    <div className="mt-1 space-y-0.5 text-[8.5px] text-rose-600">
                                      {route.onRouteAccidents.slice(0, 2).map(acc => (
                                        <div key={acc.id} className="flex justify-between">
                                          <span>• {acc.area}</span>
                                          <span>-{acc._penalty}pts</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {/* Traffic Delay Deductions */}
                                {route.trafficPenalty > 0 && (
                                  <div className="bg-amber-50/70 p-1.5 rounded-lg border border-amber-100 flex justify-between items-center text-amber-800 text-[9.5px] font-bold">
                                    <span>🚦 Congestion Delay ({route.trafficInfo?.label || 'Traffic slowdown'})</span>
                                    <span className="font-black text-amber-700">-{route.trafficPenalty} pts</span>
                                  </div>
                                )}

                                {/* Community Hazard Reports */}
                                {hazardCnt > 0 && (
                                  <div className="bg-orange-50/70 p-1.5 rounded-lg border border-orange-100">
                                    <div className="flex justify-between items-center text-orange-700 font-bold text-[9.5px]">
                                      <span>⚠️ Live Community Reports</span>
                                      <span className="font-black">-{route.onRouteReports.reduce((s, r) => s + (r._penalty || 0), 0)} pts</span>
                                    </div>
                                    <div className="mt-1 space-y-0.5 text-[8.5px] text-orange-600">
                                      {route.onRouteReports.slice(0, 2).map(r => (
                                        <div key={r.id} className="flex justify-between">
                                          <span>• {r.type || r.hazardType || 'Hazard'} ({timeAgo(r.createdAt || r.timestamp)})</span>
                                          <span>-{r._penalty}pts</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Error State UI */}
              {routeError && (
                <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 rounded-xl p-4 border border-rose-100">
                  <span className="material-symbols-outlined icon-filled text-rose-500 text-[40px] mb-2">signal_disconnected</span>
                  <p className="text-slate-800 font-bold text-center mb-1">Route Request Failed</p>
                  <p className="text-slate-500 text-xs text-center mb-4 leading-relaxed">We couldn't connect to the routing servers. This may be due to a timeout or network issue.</p>
                  <button
                    onClick={() => loadRoutes(transportMode)}
                    className="h-10 px-6 rounded-full bg-slate-900 text-white font-bold text-xs shadow-md active:scale-95 transition-all flex items-center justify-center gap-1.5"
                  >
                    <span className="material-symbols-outlined icon-filled text-[16px]">refresh</span>
                    <span>Retry Route</span>
                  </button>
                </div>
              )}

              {/* Primary Action Button (Start Navigation) */}
              <button
                onClick={handleStartJourney}
                disabled={displayedRoutes.length === 0 || routeError}
                className="w-full h-11 rounded-xl bg-[#004ac6] hover:bg-[#003da6] text-white font-black text-xs shadow-md shadow-blue-600/25 active:scale-95 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 mt-auto flex-shrink-0"
              >
                <span className="material-symbols-outlined icon-filled text-[16px]">navigation</span>
                <span>Start Navigation</span>
              </button>
            </div>
          )}
        </div>
      </div>
      {/* Cinematic Start Navigation Launch Overlay */}
      {isStartingNav && (
        <StartNavigationOverlay
          route={selectedRoute}
          destination={destination}
          onComplete={proceedToNavigation}
          onCancel={() => setIsStartingNav(false)}
        />
      )}
    </div>
  )
}
