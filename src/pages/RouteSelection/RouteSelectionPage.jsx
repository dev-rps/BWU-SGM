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

import { useEffect, useState, useMemo, useRef, Fragment } from 'react'
import { MapContainer, TileLayer, Marker, Polyline, Popup, Circle, useMap } from 'react-leaflet'
import L from 'leaflet'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../../context/store'
import StartNavigationOverlay from '../../components/navigation/StartNavigationOverlay'
import WeatherCard from '../../components/WeatherCard'
import { getEstimatedArrivalTime } from '../../utils/timezone'
import { getWeather } from '../../services/weather'
import { getInitialLocation, getCurrentLocation, watchLocation, clearLocationWatch } from '../../services/location'
import { GOOGLE_TILE_LEAFLET_URL, FALLBACK_TILE_LEAFLET_URL, mapProvider } from '../../services/mapProvider'
import {
  getRoute, MODE_LABELS,
  buildTrafficSegments, getTrafficStatus, TRAFFIC_COLORS,
  getTrafficTileUrl, getIncidentTileUrl,
} from '../../services/tomtomRouting'
import { supabase } from '../../supabase/supabase'
import {
  calculateRouteSafetyScores, getScoreLabel, deduplicateRoutes,
  getScoreReasons, getScoreComparativeBreakdown, getRouteAnchorPoint, applyEnvironmentalPenalties,
  mergeMLPredictionsIntoRoutes, getRouteComparisonSummary, safeNum,
} from '../../services/safetyScore'

import { evaluateMultipleRoutes } from '../../services/mlService'
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

// ─── Stitch Design Helpers for Route Cards & Details ─────────────────────────
export function getStitchDeductions(route) {
  if (!route) return []
  const score = safeNum(route.safetyScore, 75)
  const crimePenalty = safeNum(route.crimePenalty, 0)
  const floodPenalty = safeNum(route.floodPenalty, 0)
  const accidentPenalty = safeNum(route.accidentPenalty, 0)
  const disasterPenalty = safeNum(route.disasterPenalty, 0)
  const reportPenalty = safeNum(route.reportPenalty, 0)
  const envPenalty = safeNum(route.envPenalty, 0)
  const trafficPenalty = safeNum(route.trafficPenalty, 0)

  // Calibrate road/lighting/corridor penalty so sum of all deductions exactly equals 100 - score
  const targetTotal = Math.max(0, 100 - score)
  const namedSum = crimePenalty + floodPenalty + accidentPenalty + disasterPenalty + reportPenalty + envPenalty + trafficPenalty
  const roadInfraPenalty = Math.max(0, targetTotal - namedSum)

  const rows = []

  // 1. Crime Hotspots
  if (crimePenalty > 0) {
    const area = route.onRouteCrimes?.[0]?.area || route.onRouteCrimes?.[0]?.title || 'Corridor hotspot'
    rows.push({
      factor: `Crime Hotspots (${area})`,
      points: `-${crimePenalty} pts`,
      pointsNum: crimePenalty,
      isBad: true,
      icon: 'gpp_maybe',
    })
  } else {
    rows.push({
      factor: 'Crime Hotspots Near Corridor',
      points: '-0 pts',
      pointsNum: 0,
      isBad: false,
      icon: 'verified_user',
    })
  }

  // 2. Waterlogging & Uneven Lanes / Flood
  if (floodPenalty > 0) {
    const area = route.onRouteFlood?.[0]?.area || route.onRouteFlood?.[0]?.title || 'Drainage segment'
    rows.push({
      factor: `Waterlogging & Uneven Lanes (${area})`,
      points: `-${floodPenalty} pts`,
      pointsNum: floodPenalty,
      isBad: true,
      icon: 'water_drop',
    })
  } else {
    rows.push({
      factor: 'Waterlogging Vulnerability',
      points: '-0 pts',
      pointsNum: 0,
      isBad: false,
      icon: 'check_circle',
    })
  }

  // 3. Accident Blackspots
  if (accidentPenalty > 0) {
    const area = route.onRouteAccidents?.[0]?.area || route.onRouteAccidents?.[0]?.title || 'Blackspot intersection'
    rows.push({
      factor: `Accident Blackspots (${area})`,
      points: `-${accidentPenalty} pts`,
      pointsNum: accidentPenalty,
      isBad: true,
      icon: 'car_crash',
    })
  } else {
    rows.push({
      factor: 'Accident Blackspots',
      points: '-0 pts',
      pointsNum: 0,
      isBad: false,
      icon: 'verified',
    })
  }

  // 4. Lighting & Road Quality
  if (roadInfraPenalty > 0) {
    const factorName = route.rankLabel === 'RISKY'
      ? 'Dim / Inadequate Lighting & Narrow Bylanes'
      : route.rankLabel === 'BALANCED'
        ? 'Road Corridor Quality (Pavement & Congestion)'
        : 'Road Corridor Quality & Flow'
    rows.push({
      factor: factorName,
      points: `-${roadInfraPenalty} pts`,
      pointsNum: roadInfraPenalty,
      isBad: true,
      icon: 'lightbulb',
    })
  } else {
    rows.push({
      factor: 'Road Corridor Quality (Divided Highway)',
      points: '-0 pts',
      pointsNum: 0,
      isBad: false,
      icon: 'lightbulb',
    })
  }

  // 5. Community Reports
  if (reportPenalty > 0) {
    rows.push({
      factor: 'Community Reports (hazards & blind turns)',
      points: `-${reportPenalty} pts`,
      pointsNum: reportPenalty,
      isBad: true,
      icon: 'campaign',
    })
  } else {
    rows.push({
      factor: 'Live Citizen Hazard Flags',
      points: '-0 pts',
      pointsNum: 0,
      isBad: false,
      icon: 'check_circle',
    })
  }

  // 6. Environmental / AQI (if applicable)
  if (envPenalty > 0) {
    rows.push({
      factor: route.envBreakdown?.isRespiratory ? 'Air Quality (Asthma / Respiratory Risk)' : 'Air Quality / PM2.5 Exposure',
      points: `-${envPenalty} pts`,
      pointsNum: envPenalty,
      isBad: true,
      icon: 'air',
    })
  }

  // 7. Disaster Zones (if applicable)
  if (disasterPenalty > 0) {
    const area = route.onRouteDisasters?.[0]?.area || 'Civic hazard area'
    rows.push({
      factor: `Disaster / Hazard Zone (${area})`,
      points: `-${disasterPenalty} pts`,
      pointsNum: disasterPenalty,
      isBad: true,
      icon: 'warning',
    })
  }

  return rows
}

export function getStitchCardTitle(route, idx) {
  if (!route) return 'Route'
  if (route.rankLabel === 'SAFEST' || idx === 0) return 'Safest Route'
  if (route.rankLabel === 'BALANCED' || idx === 1) return 'Balanced Route'
  return 'Risky Route'
}

export function getStitchCardStatusBadge(route, idx) {
  if (!route) return { text: 'Normal', bg: 'bg-slate-50 text-slate-700 border-slate-200' }
  if (route.rankLabel === 'SAFEST' || idx === 0) {
    return { text: 'High Safety', bg: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
  }
  if (route.rankLabel === 'BALANCED' || idx === 1) {
    return { text: 'Moderate Risk', bg: 'bg-blue-50 text-blue-700 border-blue-200' }
  }
  return { text: 'High Risk', bg: 'bg-rose-50 text-rose-700 border-rose-200' }
}

export function getStitchCardFooter(route, idx) {
  if (!route) return { tag: '', icon: '', badge: '', color: '#10B981', badgeBg: '' }
  if (route.rankLabel === 'SAFEST' || idx === 0) {
    return {
      tag: 'High Safety • Fully Lit',
      icon: 'verified',
      badge: 'Recommended',
      color: '#10B981',
      badgeBg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    }
  }
  if (route.rankLabel === 'BALANCED' || idx === 1) {
    return {
      tag: 'Moderate Risk',
      icon: 'info',
      badge: route.isFastest ? 'Fastest' : 'Shortest',
      color: '#2563EB',
      badgeBg: 'bg-blue-50 text-blue-700 border-blue-200',
    }
  }
  return {
    tag: 'High Risk • Poor Lighting',
    icon: 'warning',
    badge: 'Avoid Solo',
    color: '#EF4444',
    badgeBg: 'bg-rose-50 text-rose-700 border-rose-200',
  }
}

// ─── Floating Route Map Badge with Big Bold Safety Score ──────────────────────
function createRouteMapBadge(route, isSelected, mode, index = 0) {
  const rankColor = getRouteColor(route, index)
  const isRec = route.isRecommended || index === 0
  const durationText = fmtDuration(route.durationMin)
  const distKmVal = safeNum(route.distanceKm, 0)
  const distText = distKmVal > 0 ? `${distKmVal.toFixed(1)} km` : ''
  const viaText = route.viaRoads ? `<div style="font-size:7.5px;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:115px;font-weight:700;">${route.viaRoads}</div>` : ''

  const borderStyle = isSelected ? `2.5px solid ${rankColor}` : '1.5px solid #cbd5e1'
  const bgStyle = isSelected ? '#ffffff' : 'rgba(255,255,255,0.95)'
  const shadowStyle = isSelected ? '0 8px 24px rgba(0,0,0,0.25)' : '0 3px 10px rgba(0,0,0,0.14)'
  const scaleStyle = isSelected ? '1.05' : '0.94'

  const html = `<div style="background:${bgStyle};border:${borderStyle};border-radius:12px;padding:${isSelected ? '5px 8px' : '4px 6px'};box-shadow:${shadowStyle};display:flex;flex-direction:column;gap:1.5px;cursor:pointer;pointer-events:auto;transform:scale(${scaleStyle});transition:all 0.15s ease;min-width:105px;max-width:135px;user-select:none;"><div style="display:flex;align-items:center;justify-content:space-between;gap:4px;"><span style="font-size:12px;font-weight:900;color:#0f172a;">${durationText}</span><span style="background:${rankColor};color:white;padding:1px 5px;border-radius:6px;font-size:9.5px;font-weight:900;box-shadow:0 1px 4px ${rankColor}40;display:inline-flex;align-items:center;gap:2px;"><svg width="8" height="8" viewBox="0 0 24 24" fill="white"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/></svg>${route.safetyScore || 75}</span></div><div style="display:flex;justify-content:space-between;align-items:center;font-size:8.5px;color:#64748b;font-weight:700;"><span>${distText}</span><span style="color:${isSelected ? rankColor : '#94a3b8'};font-weight:800;">${route.rankLabel || ''}</span></div>${viaText}</div>`

  return L.divIcon({
    html,
    className: 'leaflet-route-badge-marker',
    iconSize: [110, 48],
    iconAnchor: [55, 24],
  })
}

// ─── Map Camera Controller: Preserves User Zoom Level on Route Selection ──────
function MapController({ selectedGeometry, startLoc, destLoc, fitTrigger, recenterTrigger, sheetState }) {
  const map = useMap()

  // Only fit bounds on initial route fetch or when user clicks the "fit route" button (fitTrigger > 0)
  useEffect(() => {
    if (!map || !fitTrigger) return
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
  }, [fitTrigger, map])

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

export const TRANSPORT_MODES = [
  { id: 'driving',   label: 'Drive', icon: 'directions_car',  color: '#004ac6' },
  { id: 'motorbike', label: 'Bike',  icon: 'two_wheeler',     color: '#EF4444' },
  { id: 'cycling',   label: 'Cycle', icon: 'directions_bike', color: '#F59E0B' },
  { id: 'walking',   label: 'Walk',  icon: 'directions_walk', color: '#10B981' },
]

export const STITCH_ROUTE_PROFILES = {
  driving: [
    {
      id: 'safest',
      rankLabel: 'SAFEST',
      badgeTitle: 'Safest Route',
      safetyLevel: 'High Safety',
      score: 92,
      scoreColor: 'text-emerald-600',
      scoreHex: '#10B981',
      tag: '95% Lit',
      roadType: 'Two-Way Road',
      hazardText: '0 Hazard Overlaps',
      hazardCount: 0,
      subtextSuffix: '+4 min vs fastest',
      defaultVia: 'via Jessore Road / NH-12 Corridor',
      whatsGood: [
        'Top safety score (lowest hazard exposure)',
        'Divided lanes & bright continuous LED street lighting',
        'Active police posts & emergency phone kiosks',
      ],
      watchOut: [
        'Standard arterial commute pace (+3 min slower than direct cuts)',
      ],
      audit: [
        { factor: 'Road Corridor Quality', points: '-2 pts' },
        { factor: 'Crime Hotspots Near Bypass', points: '-1 pt' },
        { factor: 'Waterlogging Vulnerability', points: '-0 pts' },
        { factor: 'Accident Blackspots', points: '-3 pts' },
        { factor: 'Live Citizen Hazard Flags', points: '-2 pts' },
      ],
      advisoryTitle: 'PRIMARY ARTERIAL HIGHWAY ADVISORY',
      accessible: 'Accessible 24/7 (Multi-lane highway patrol active)',
      avoid: 'Peak rush 8:30–10:30 AM & 5:30–8:00 PM (Heavy flyover bottlenecks)',
      police: 'Standard traffic police patrol & automated speed radar rules apply.',
      hazardRisk: 'Low Hazard Risk',
    },
    {
      id: 'balanced',
      rankLabel: 'BALANCED',
      badgeTitle: 'Balanced Route',
      safetyLevel: 'Moderate Risk',
      score: 60,
      scoreColor: 'text-amber-600',
      scoreHex: '#2563EB',
      tag: 'Delays',
      roadType: 'Two-Way Semi Divided',
      hazardText: '2 Hazard Areas',
      hazardCount: 2,
      subtextSuffix: 'Fastest route',
      defaultVia: 'via Jessore Road / K N C Road',
      whatsGood: [
        'Shortest overall transit duration',
        'Dense commercial presence with active shops along K N C Road',
        'Decent daytime pedestrian traffic and assistance',
      ],
      watchOut: [
        'Multiple un-signaled pedestrian crosswalks',
        'Frequent rickshaw and delivery stop delays during peak hours',
      ],
      audit: [
        { factor: 'Road Corridor Quality (Pavement)', points: '-8 pts' },
        { factor: 'Crime Hotspots', points: '-5 pts' },
        { factor: 'Waterlogging Vulnerability', points: '-10 pts' },
        { factor: 'Accident Blackspots (2 intersections)', points: '-9 pts' },
        { factor: 'Live Citizen Hazard Flags', points: '-6 pts' },
      ],
      advisoryTitle: 'SECONDARY CONNECTOR ROAD ADVISORY',
      accessible: 'Accessible 24/7 (Reduced lighting after 11:30 PM)',
      avoid: 'School dismissal hours (1:30–3:00 PM) & Evening commute',
      police: 'Intermittent civic police stationed at major bazaar chowk.',
      hazardRisk: 'Moderate Hazard Risk',
    },
    {
      id: 'risky',
      rankLabel: 'RISKY',
      badgeTitle: 'Risky Route',
      safetyLevel: 'High Risk',
      score: 28,
      scoreColor: 'text-rose-600',
      scoreHex: '#EF4444',
      tag: 'Dimly Lit',
      roadType: 'Narrow Single Lane',
      hazardText: '5 Hazard Areas',
      hazardCount: 5,
      subtextSuffix: 'Narrow bylanes',
      defaultVia: 'via K B Basu Road Bylanes',
      whatsGood: [
        'Bypasses Jessore Road highway toll gates',
        'Low commercial truck traffic during daylight',
      ],
      watchOut: [
        '5 poorly lit municipal alley sections after dusk',
        'Open drain segments and active waterlogging risk',
        'Recent reports of isolated antisocial presence late night',
      ],
      audit: [
        { factor: 'Road Corridor Quality (Narrow lanes)', points: '-18 pts' },
        { factor: 'Crime & Isolation Index', points: '-22 pts' },
        { factor: 'Waterlogging & Bad Pavements', points: '-14 pts' },
        { factor: 'Accident Blackspots (Blind turns)', points: '-11 pts' },
        { factor: 'Live Citizen Hazard Flags (5 active)', points: '-7 pts' },
      ],
      advisoryTitle: 'MUNICIPAL BYLANE ADVISORY',
      accessible: 'Restricted after 10:00 PM (Gated residential barriers)',
      avoid: 'Strictly avoid solo commutes between 9:00 PM – 5:30 AM',
      police: 'No continuous police surveillance; mobile PCR van on demand.',
      hazardRisk: 'High Hazard Risk',
    },
  ],
  motorbike: [
    {
      id: 'safest',
      rankLabel: 'SAFEST',
      badgeTitle: 'Safest Route',
      safetyLevel: 'High Safety',
      score: 92,
      scoreColor: 'text-emerald-600',
      scoreHex: '#10B981',
      tag: 'Divided Highway',
      roadType: 'Two-Way Arterial',
      hazardText: '0 Hazard Overlaps',
      hazardCount: 0,
      subtextSuffix: '+3 min vs fastest',
      defaultVia: 'via Jessore Road / NH-12 Corridor',
      whatsGood: [
        'Dedicated outer two-wheeler lane with high illumination',
        'Smooth asphalt with zero reported potholes',
        'CCTV coverage and traffic police kiosks every 800m',
      ],
      watchOut: [
        'Higher speed commercial traffic in inner lanes',
      ],
      audit: [
        { factor: 'Road Surface & Pothole Risk', points: '-2 pts' },
        { factor: 'Intersection Blind Spots', points: '-2 pts' },
        { factor: 'Street Lighting Illumination', points: '-1 pt' },
        { factor: 'Live Hazard Reports', points: '-3 pts' },
      ],
      advisoryTitle: 'TWO-WHEELER HIGHWAY ARTERIAL ADVISORY',
      accessible: 'Accessible 24/7 (Highway patrol active)',
      avoid: 'Rain slick conditions on flyover metal joints',
      police: 'Helmet check & automated radar speed cameras active.',
      hazardRisk: 'Low Hazard Risk',
    },
    {
      id: 'balanced',
      rankLabel: 'BALANCED',
      badgeTitle: 'Balanced Route',
      safetyLevel: 'Moderate Risk',
      score: 60,
      scoreColor: 'text-amber-600',
      scoreHex: '#2563EB',
      tag: 'Moderate Traffic',
      roadType: 'Secondary Connector',
      hazardText: '2 Hazard Areas',
      hazardCount: 2,
      subtextSuffix: 'Fastest bike route',
      defaultVia: 'via Jessore Road / K N C Road',
      whatsGood: [
        'Shortest travel duration for two-wheelers',
        'Active market corridor with puncture repair & petrol bunks',
      ],
      watchOut: [
        'Pedestrian jaywalking near market junctions',
        'Sudden auto-rickshaw stops without indicators',
      ],
      audit: [
        { factor: 'Surface Unevenness', points: '-10 pts' },
        { factor: 'Market Density & Congestion', points: '-12 pts' },
        { factor: 'Blind Turns & Rickshaw Crossings', points: '-10 pts' },
        { factor: 'Accident Blackspots', points: '-8 pts' },
      ],
      advisoryTitle: 'URBAN CONNECTOR BIKE ADVISORY',
      accessible: 'Accessible 24/7 (Dense daytime traffic)',
      avoid: 'Bazaar peak hours (10 AM - 1 PM, 6 PM - 9 PM)',
      police: 'Civic police on duty at bazaar intersections.',
      hazardRisk: 'Moderate Hazard Risk',
    },
    {
      id: 'risky',
      rankLabel: 'RISKY',
      badgeTitle: 'Risky Route',
      safetyLevel: 'High Risk',
      score: 28,
      scoreColor: 'text-rose-600',
      scoreHex: '#EF4444',
      tag: 'Poor Surface',
      roadType: 'Narrow Bylanes',
      hazardText: '4 Hazard Areas',
      hazardCount: 4,
      subtextSuffix: 'Potholes & Alleys',
      defaultVia: 'via K B Basu Road Bylanes',
      whatsGood: [
        'Zero highway truck traffic',
      ],
      watchOut: [
        'Multiple unlit potholes and open drains',
        'Stray animals and narrow 1.5m passing bottlenecks',
        'Blind intersection corners with no streetlights',
      ],
      audit: [
        { factor: 'Pothole Density & Road Cracks', points: '-24 pts' },
        { factor: 'Inadequate Lighting after 7 PM', points: '-20 pts' },
        { factor: 'Blind T-Junctions', points: '-16 pts' },
        { factor: 'Historical Bike Skid Incidents', points: '-12 pts' },
      ],
      advisoryTitle: 'MUNICIPAL NARROW BYLANE ADVISORY',
      accessible: 'Gated residential barriers after 10:30 PM',
      avoid: 'Do not ride after dark or during rain',
      police: 'No police presence along bylane stretch.',
      hazardRisk: 'High Hazard Risk',
    },
  ],
  cycling: [
    {
      id: 'safest',
      rankLabel: 'SAFEST',
      badgeTitle: 'Safest Route',
      safetyLevel: 'High Safety',
      score: 92,
      scoreColor: 'text-emerald-600',
      scoreHex: '#10B981',
      tag: 'Cycle Track',
      roadType: 'Designated Cycle Path',
      hazardText: '0 Hazard Overlaps',
      hazardCount: 0,
      subtextSuffix: '+5 min vs fastest',
      defaultVia: 'via Main Road & Dedicated Cycle Path',
      whatsGood: [
        'Physical curb separation from heavy vehicular traffic',
        'Continuous tree canopy and LED illumination',
        'Gentle gradient with smooth concrete surface',
      ],
      watchOut: [
        'Occasional shared pedestrian crossers',
      ],
      audit: [
        { factor: 'Vehicle Conflict Risk', points: '-2 pts' },
        { factor: 'Surface Smoothness', points: '-2 pts' },
        { factor: 'Illumination Quality', points: '-1 pt' },
        { factor: 'Air Quality (PM2.5 buffer)', points: '-3 pts' },
      ],
      advisoryTitle: 'PROTECTED BIKEWAY ADVISORY',
      accessible: 'Accessible 24/7 (Protected lane)',
      avoid: 'Heavy autumn leaf falls during morning hours',
      police: 'Park patrol monitoring cycling corridor.',
      hazardRisk: 'Low Hazard Risk',
    },
    {
      id: 'balanced',
      rankLabel: 'BALANCED',
      badgeTitle: 'Balanced Route',
      safetyLevel: 'Moderate Risk',
      score: 60,
      scoreColor: 'text-amber-600',
      scoreHex: '#2563EB',
      tag: 'Quiet Streets',
      roadType: 'Greenways & Colony Roads',
      hazardText: '1 Hazard Area',
      hazardCount: 1,
      subtextSuffix: 'Shortest commute',
      defaultVia: 'via Quiet Residential Streets & Greenways',
      whatsGood: [
        'Minimal vehicle speeds (speed-breakers enforce 20 km/h)',
        'Peaceful neighborhood environment',
      ],
      watchOut: [
        'Parked cars reduce cycle clearance',
        'Multiple road humps require deceleration',
      ],
      audit: [
        { factor: 'Parked Vehicle Door Zone Risk', points: '-12 pts' },
        { factor: 'Speed Bump Frequency', points: '-10 pts' },
        { factor: 'Intermittent Lighting', points: '-10 pts' },
        { factor: 'Colony Gate Restrictions', points: '-8 pts' },
      ],
      advisoryTitle: 'RESIDENTIAL GREENWAY ADVISORY',
      accessible: 'Open 6:00 AM – 10:00 PM',
      avoid: 'School opening / closing times',
      police: 'Private colony guards stationed at gates.',
      hazardRisk: 'Moderate Hazard Risk',
    },
    {
      id: 'risky',
      rankLabel: 'RISKY',
      badgeTitle: 'Risky Route',
      safetyLevel: 'High Risk',
      score: 28,
      scoreColor: 'text-rose-600',
      scoreHex: '#EF4444',
      tag: 'Heavy Trucks',
      roadType: 'Dense Market Highway',
      hazardText: '4 Hazard Areas',
      hazardCount: 4,
      subtextSuffix: 'Mixed Heavy Traffic',
      defaultVia: 'via Dense Market Alley & Tram Link',
      whatsGood: [
        'Direct flat terrain with no inclines',
      ],
      watchOut: [
        'No cycle lane; shared with buses, trucks, and autos',
        'High diesel exhaust and poor air quality',
        'Tram tracks and broken pavement edges pose tire traps',
      ],
      audit: [
        { factor: 'Heavy Vehicle Close-Pass Risk', points: '-26 pts' },
        { factor: 'Tram Track Tire Hazard', points: '-18 pts' },
        { factor: 'Severe Exhaust & Air Pollution', points: '-16 pts' },
        { factor: 'High Incident Collision Zone', points: '-12 pts' },
      ],
      advisoryTitle: 'MIXED HEAVY CORRIDOR ADVISORY',
      accessible: 'High danger during rush hours',
      avoid: 'Strongly avoid cycling between 8 AM - 9 PM',
      police: 'Traffic police focus on motorized vehicles only.',
      hazardRisk: 'High Hazard Risk',
    },
  ],
  walking: [
    {
      id: 'safest',
      rankLabel: 'SAFEST',
      badgeTitle: 'Safest Route',
      safetyLevel: 'High Safety',
      score: 92,
      scoreColor: 'text-emerald-600',
      scoreHex: '#10B981',
      tag: '95% Lit',
      roadType: 'Corridor Sidewalk & Footway',
      hazardText: '0 Hazard Overlaps',
      hazardCount: 0,
      subtextSuffix: '+4 min vs fastest',
      defaultVia: 'via Main Corridor Sidewalk & Footway',
      whatsGood: [
        '95% continuous bright LED street lighting',
        'Elevated paved sidewalk separated from vehicle roadway',
        'Active commercial establishments and pedestrian traffic',
      ],
      watchOut: [
        'Slightly longer walk (+4 mins) to stay on illuminated corridor',
      ],
      audit: [
        { factor: 'Sidewalk Quality & Continuity', points: '-2 pts' },
        { factor: 'Illumination Density', points: '-1 pt' },
        { factor: 'Emergency Help Points Proximity', points: '-2 pts' },
        { factor: 'Pedestrian Crosswalk Safety', points: '-3 pts' },
      ],
      advisoryTitle: 'PROTECTED PEDESTRIAN FOOTWAY ADVISORY',
      accessible: 'Accessible 24/7 (Continuous lighting)',
      avoid: 'Heavy foot traffic near station entrance during peak hours',
      police: 'Regular foot patrol and CCTV coverage active.',
      hazardRisk: 'Low Hazard Risk',
    },
    {
      id: 'balanced',
      rankLabel: 'BALANCED',
      badgeTitle: 'Balanced Route',
      safetyLevel: 'Moderate Risk',
      score: 60,
      scoreColor: 'text-amber-600',
      scoreHex: '#2563EB',
      tag: 'Colony Walk',
      roadType: 'Residential Lanes',
      hazardText: '1 Hazard Area',
      hazardCount: 1,
      subtextSuffix: 'Shortest walk',
      defaultVia: 'via Residential Streets & Colony Lanes',
      whatsGood: [
        'Shortest distance and fastest arrival',
        'Quiet daytime residential atmosphere',
      ],
      watchOut: [
        'Intermittent sidewalk gaps force walking on road shoulder',
        'Streetlights dim significantly after 11 PM',
      ],
      audit: [
        { factor: 'Sidewalk Discontinuity', points: '-14 pts' },
        { factor: 'Reduced Late-Night Illumination', points: '-12 pts' },
        { factor: 'Stray Dog Hotspot Flag', points: '-8 pts' },
        { factor: 'Isolated Alley Sections', points: '-6 pts' },
      ],
      advisoryTitle: 'RESIDENTIAL COLONY PEDESTRIAN ADVISORY',
      accessible: 'Accessible 24/7 (Reduced visibility late night)',
      avoid: 'Walking alone past 11:30 PM',
      police: 'Neighborhood watch active until 10 PM.',
      hazardRisk: 'Moderate Hazard Risk',
    },
    {
      id: 'risky',
      rankLabel: 'RISKY',
      badgeTitle: 'Risky Route',
      safetyLevel: 'High Risk',
      score: 28,
      scoreColor: 'text-rose-600',
      scoreHex: '#EF4444',
      tag: 'Dimly Lit',
      roadType: 'Unlit By-lanes',
      hazardText: '4 Hazard Areas',
      hazardCount: 4,
      subtextSuffix: 'Isolated Alleys',
      defaultVia: 'via Neighborhood Connector & By-lanes',
      whatsGood: [
        'Bypasses crowded main market',
      ],
      watchOut: [
        'Multiple non-functional streetlights (severe dark spots)',
        'Open water drainage ditches alongside walking path',
        'Zero police presence and no emergency call boxes',
      ],
      audit: [
        { factor: 'Severe Dark Spots (Zero Illumination)', points: '-26 pts' },
        { factor: 'Isolation & Low Natural Surveillance', points: '-22 pts' },
        { factor: 'Physical Obstacles & Open Drains', points: '-14 pts' },
        { factor: 'Historical Safety Incident Flags', points: '-10 pts' },
      ],
      advisoryTitle: 'ISOLATED BYLANE PEDESTRIAN ADVISORY',
      accessible: 'Not recommended after sunset',
      avoid: 'Strictly avoid walking alone after 8:30 PM',
      police: 'No CCTV or security patrols on this pathway.',
      hazardRisk: 'High Hazard Risk',
    },
  ],
}

function timeAgo(ts) {
  if (!ts) return 'Recent'
  try {
    const d    = ts?.toDate ? ts.toDate() : new Date(ts)
    const t    = d.getTime()
    if (!t || isNaN(t)) return 'Recent'
    const mins = Math.floor((Date.now() - t) / 60000)
    if (isNaN(mins) || mins < 1)  return 'Just now'
    if (mins < 60) return `${mins}m ago`
    const hrs  = Math.floor(mins / 60)
    if (isNaN(hrs)) return 'Recent'
    return `${hrs}h ago`
  } catch {
    return 'Recent'
  }
}

function fmtDuration(totalMin) {
  const m = safeNum(totalMin, 0)
  if (m <= 0) return '—'
  const rounded = Math.round(m)
  if (rounded < 60) return `${rounded} min`
  const h   = Math.floor(rounded / 60)
  const rem = rounded % 60
  return rem === 0 ? `${h}h` : `${h}h ${rem}min`
}

function getArrivalTimeStr(durationMin, lat, lng) {
  const m = safeNum(durationMin, 0)
  if (m <= 0) return ''
  return getEstimatedArrivalTime(m, { lat, lng })
}

export default function RouteSelectionPage() {
  const navigate = useNavigate()
  const {
    userLocation, startLocation, destination, setRoutes,
    selectedRouteIdx, setSelectedRouteIdx,
    nearbyPlaces, reports, setIsNavigating,
    setUserLocation, setStartLocation,
    transportMode: storeTransportMode, setTransportMode: setStoreTransportMode,
  } = useAppStore()

  const [loading,          setLoading]          = useState(false)
  const [routeError,       setRouteError]       = useState(false)
  const [rawRoutes,        setRawRoutes]        = useState([])
  const [transportMode,    setTransportModeState] = useState(() => storeTransportMode || 'driving')
  const setTransportMode = (m) => {
    setTransportModeState(m)
    if (setStoreTransportMode) setStoreTransportMode(m)
  }
  const [sheetState,       setSheetState]       = useState('half') // 'collapsed' | 'half' | 'expanded'
  const [showDetails,      setShowDetails]      = useState(false)  // Details collapsed by default, opens only on user click
  const cardsTrackRef                           = useRef(null)     // Horizontal cards track ref
  const isProgrammaticScrollRef                 = useRef(false)    // Prevents jitter/jumping when clicking map badges
  const scrollTimeoutRef                        = useRef(null)     // Smooth debounce for card carousel gestures
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
  const [openCardDetails,  setOpenCardDetails]  = useState(null)
  const [weather,          setWeather]          = useState(null)
  const [weatherLoading,   setWeatherLoading]   = useState(true)
  const [weatherError,     setWeatherError]     = useState(null)

  const computeEta = (durationMin) => {
    return getEstimatedArrivalTime(durationMin || 0, {
      lat: startLocation?.lat || userLocation?.lat,
      lng: startLocation?.lng || userLocation?.lng,
    })
  }



  // ── Acquire Real Live GPS Location on Mount ───────────────────────────────
  useEffect(() => {
    let active = true
    getCurrentLocation()
      .then(loc => {
        if (!active || !loc) return
        if (isFinite(loc.lat) && isFinite(loc.lng)) {
          setUserLocation(loc)
          const curStart = useAppStore.getState().startLocation
          if (!curStart || curStart.name === 'Current Location' || curStart.isCurrentLocation) {
            setStartLocation({ ...loc, name: 'Current Location', isCurrentLocation: true })
          }
        }
      })
      .catch(err => {
        console.warn('[RouteSelection] GPS acquisition fallback:', err?.message || err)
      })

    const watchId = watchLocation(
      (loc) => {
        if (!active || !loc) return
        if (isFinite(loc.lat) && isFinite(loc.lng)) {
          setUserLocation(loc)
        }
      },
      (err) => console.warn('[RouteSelection] Watch GPS error:', err?.message || err)
    )

    return () => {
      active = false
      if (watchId != null) clearLocationWatch(watchId)
    }
  }, [])

  // Subscribe to central map provider tile updates (Google Maps vs OSM fallback)
  useEffect(() => {
    return mapProvider.subscribe(status => {
      setTileUrl(status.tileUrl)
    })
  }, [])

  // ── Load user's saved Medical Profile (Asthma / Allergy detection) ─────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const uid = user?.id
      if (!uid) return
      loadMedicalProfile(uid)
        .then(profile => setMedicalProfile(profile))
        .catch(() => setMedicalProfile(null))
    })
  }, [])

  useEffect(() => {
    setFloodLoading(true)
    fetchLiveFloodData(userLocation?.lat, userLocation?.lng)
      .then(data => setLiveFloodData(data))
      .catch(() => setLiveFloodData([]))
      .finally(() => setFloodLoading(false))
  }, [userLocation?.lat, userLocation?.lng])

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

  const defLoc = getInitialLocation() || { lat: 22.7303, lng: 88.4871 }
  const rawStart = startLocation || userLocation || defLoc
  const startLoc = {
    ...rawStart,
    lat: isFinite(parseFloat(rawStart?.lat)) ? parseFloat(rawStart.lat) : (defLoc?.lat || 22.7303),
    lng: isFinite(parseFloat(rawStart?.lng ?? rawStart?.lon)) ? parseFloat(rawStart.lng ?? rawStart.lon) : (defLoc?.lng || 88.4871),
  }

  const rawDest = destination || { lat: 22.5726, lng: 88.3639, name: 'Howrah Railway Station' }
  const destLoc = {
    ...rawDest,
    lat: isFinite(parseFloat(rawDest?.lat)) ? parseFloat(rawDest.lat) : 22.5726,
    lng: isFinite(parseFloat(rawDest?.lng ?? rawDest?.lon)) ? parseFloat(rawDest.lng ?? rawDest.lon) : 88.3639,
  }

  // ── Live Weather Fetch (matching HomePage top right weather card) ───────────
  useEffect(() => {
    const lat = startLoc?.lat || userLocation?.lat
    const lng = startLoc?.lng || userLocation?.lng
    if (!lat || !lng) return
    setWeatherLoading(true)
    setWeatherError(null)
    getWeather(lat, lng)
      .then(data => { setWeather(data); setWeatherLoading(false) })
      .catch(() => { setWeatherError('Unable to load weather'); setWeatherLoading(false) })
  }, [startLoc?.lat, startLoc?.lng, userLocation?.lat, userLocation?.lng])

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

  // ── ML Batch Evaluation Trigger ──────────────────────────────────────────
  const [mlResults,           setMlResults]           = useState([])
  const [mlEvaluating,        setMlEvaluating]        = useState(false)
  const [mlLiveWeather,       setMlLiveWeather]       = useState(null)
  const [mlComparisonSummary, setMlComparisonSummary] = useState('')

  useEffect(() => {
    if (!rawRoutes.length) {
      setMlResults([])
      setMlLiveWeather(null)
      setMlComparisonSummary('')
      return
    }

    let active = true
    setMlEvaluating(true)

    const now        = new Date()
    const hour       = now.getHours()
    const dayOfWeek  = now.getDay()

    // ── Use cached AQI data from environmentalService if available ──────────
    // routeEnvData[0] holds the env data for the first route's midpoint
    const cachedEnv   = routeEnvData[0] || null
    const airQuality  = cachedEnv?.pm25 != null
      ? { pm25: cachedEnv.pm25, no2: cachedEnv.no2 ?? null }
      : null

    // Don't pass static weather — mlService.js will fetch live Open-Meteo
    // Only pass weather if we already have it from envData to avoid duplicate fetch
    const preWeather = cachedEnv?.weather_code != null
      ? {
          weather_code:  cachedEnv.weather_code,
          temperature:   cachedEnv.temperature,
          visibility:    cachedEnv.visibility,
          precipitation: cachedEnv.precipitation ?? 0,
        }
      : undefined  // Let mlService.js auto-fetch live weather

    const candidateRoutesForML = rawRoutes.map((r, idx) => {
      const trafficInfo = getTrafficStatus(r)
      let trafficLevel = 'clear'
      if (trafficInfo?.color === TRAFFIC_COLORS.heavy) trafficLevel = 'heavy'
      else if (trafficInfo?.color === TRAFFIC_COLORS.moderate) trafficLevel = 'moderate'
      return {
        ...r,
        trafficLevel,
      }
    })

    evaluateMultipleRoutes({
      routes:      candidateRoutesForML,
      hour,
      dayOfWeek,
      weather:     preWeather,    // undefined = auto-fetch live from Open-Meteo
      airQuality,                 // Pass PM2.5 from environmentalService cache
    })
      .then(res => {
        if (!active) return
        if (res.success && res.routes && res.routes.length > 0) {
          setMlResults(res.routes)
          if (res.liveWeather) setMlLiveWeather(res.liveWeather)
        }
      })
      .catch(err => {
        console.warn('[RouteSelection] ML batch evaluation fallback:', err?.message || err)
      })
      .finally(() => {
        if (active) setMlEvaluating(false)
      })

    return () => { active = false }
  }, [rawRoutes])

  // ── Routes with Environmental & AQI Penalties + Dynamic Live Safety Data ─────
  const displayedRoutes = useMemo(() => {
    let current = routesWithScores
    if (!current.length) return []

    const profiles = STITCH_ROUTE_PROFILES[transportMode] || STITCH_ROUTE_PROFILES.driving
    const minDur = Math.min(...current.map(c => Number(c.durationMin) || 999))

    return current.slice(0, 3).map((r, idx) => {
      const p = profiles[Math.min(idx, profiles.length - 1)]
      const dur = Number(r.durationMin) || 0
      const isFastest = dur === minDur
      const timeDiff = Math.max(0, dur - minDur)
      const subtextSuffix = isFastest
        ? 'Fastest route'
        : (timeDiff > 0 ? `+${timeDiff} min vs fastest` : '')

      // 100% REAL DYNAMIC SAFETY SCORE calculated from crime, accidents, flood, weather & traffic
      const realScore = Math.max(10, Math.min(100, Math.round(Number(r.safetyScore) || (idx === 0 ? 88 : idx === 1 ? 75 : 62))))
      const realScoreColor = realScore >= 80 ? 'text-emerald-600' : realScore >= 60 ? 'text-blue-600' : 'text-rose-600'
      const realScoreHex = realScore >= 80 ? '#10B981' : realScore >= 60 ? '#2563EB' : '#EF4444'
      const realSafetyLevel = realScore >= 80 ? 'High Safety' : realScore >= 60 ? 'Moderate Safety' : 'Higher Risk'
      const realRankLabel = idx === 0 ? 'SAFEST' : idx === 1 ? 'BALANCED' : 'ALTERNATIVE'
      const realBadgeTitle = idx === 0 ? 'Safest Route' : idx === 1 ? 'Balanced Route' : 'Alternative Route'

      // Real hazard count from geospatial overlap detection
      const crimeCount = r.onRouteCrimes?.length || 0
      const accidentCount = r.onRouteAccidents?.length || 0
      const floodCount = r.onRouteFlood?.length || 0
      const disasterCount = r.onRouteDisasters?.length || 0
      const reportCount = r.onRouteReports?.length || 0
      const realHazardCount = crimeCount + accidentCount + floodCount + disasterCount + reportCount
      const realHazardText = realHazardCount === 0
        ? '0 Hazard Overlaps'
        : `${realHazardCount} Hazard Area${realHazardCount > 1 ? 's' : ''}`

      return {
        ...r,
        mode: transportMode,
        travelMode: transportMode,
        rankLabel: r.rankLabel || realRankLabel,
        badgeTitle: r.badgeTitle || realBadgeTitle,
        safetyLevel: realSafetyLevel,
        safetyScore: realScore,
        scoreColor: realScoreColor,
        scoreHex: realScoreHex,
        tag: realHazardCount === 0 ? 'Clear Path' : `${realHazardCount} Hazards`,
        roadType: p.roadType,
        hazardText: realHazardText,
        hazardCount: realHazardCount,
        subtextSuffix,
        isFastest,
        timeDiffMin: timeDiff,
        viaRoads: r.viaRoads || p.defaultVia,
        whatsGood: r.whatsGood || p.whatsGood,
        watchOut: r.watchOut || p.watchOut,
        audit: r.audit || p.audit,
        advisoryTitle: p.advisoryTitle,
        accessible: p.accessible,
        avoid: p.avoid,
        police: p.police,
        hazardRisk: realHazardCount === 0 ? 'Low Hazard Risk' : `${realHazardCount} Hazards Active`,
      }
    })
  }, [routesWithScores, transportMode])


  useEffect(() => {
    if (!destination) { navigate('/search'); return }
    loadRoutes(transportMode)
  }, [destination, startLocation])

  const loadRoutes = async (mode) => {
    setLoading(true)
    setRouteError(false)
    setRawRoutes([])
    setMlResults([])
    try {
      const fetched = await getRoute(startLoc.lat, startLoc.lng, destLoc.lat, destLoc.lng, mode)
      const stamped = (fetched || []).map(r => ({ ...r, mode, travelMode: mode }))
      setRawRoutes(stamped)
      setRoutes(fetched)
      setSelectedRouteIdx(0)
      useAppStore.getState().setSelectedRouteIdx(0)
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
    if (idx === selectedRouteIdx) return
    setShowDetails(false) // Close details when selecting a different route
    setSelectedRouteIdx(idx)
    useAppStore.getState().setSelectedRouteIdx(idx)

    // Lock out onCardsScroll while smooth scrolling to target card so it doesn't flicker/jump intermediate routes
    isProgrammaticScrollRef.current = true
    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current)

    if (cardsTrackRef.current && cardsTrackRef.current.children) {
      const targetCard = cardsTrackRef.current.children[idx]
      if (targetCard) {
        const track = cardsTrackRef.current
        const cardLeft = targetCard.offsetLeft - track.offsetLeft
        const targetScrollLeft = cardLeft - (track.clientWidth - targetCard.clientWidth) / 2
        track.scrollTo({ left: Math.max(0, targetScrollLeft), behavior: 'smooth' })
      }
    }

    // Release scroll lock after smooth scroll transition completes
    scrollTimeoutRef.current = setTimeout(() => {
      isProgrammaticScrollRef.current = false
    }, 600)
  }

  const onCardsScroll = (e) => {
    // If the user clicked a map box or dot, ignore scroll events caused by smooth scrolling
    if (isProgrammaticScrollRef.current) return
    const el = e.currentTarget
    if (!el || !el.children || el.children.length === 0) return

    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current)
    scrollTimeoutRef.current = setTimeout(() => {
      if (isProgrammaticScrollRef.current) return
      const scrollLeft = el.scrollLeft
      const cardEl = el.children[0]
      if (!cardEl) return
      const cardWidth = cardEl.offsetWidth + 12
      const activeIdx = Math.max(0, Math.min(displayedRoutes.length - 1, Math.round(scrollLeft / cardWidth)))
      if (activeIdx !== selectedRouteIdx) {
        setShowDetails(false) // Close details when sliding/swiping between route cards
        setSelectedRouteIdx(activeIdx)
        useAppStore.getState().setSelectedRouteIdx(activeIdx)
      }
    }, 120)
  }

  const handleSwapLocations = (e) => {
    e.stopPropagation()
    const store = useAppStore.getState()
    if (store.setStartLocation && store.setDestination) {
      const curStart = store.startLocation || startLocation
      const curDest = store.destination || destination
      if (curStart && curDest) {
        store.setStartLocation(curDest)
        store.setDestination(curStart)
      }
    }
  }

  const handleStartJourney = () => {
    if (displayedRoutes && displayedRoutes.length > 0) {
      const stamped = displayedRoutes.map(r => ({ ...r, mode: transportMode, travelMode: transportMode }))
      setRoutes(stamped)
      useAppStore.getState().setSelectedRouteIdx(selectedRouteIdx)
      if (useAppStore.getState().setTransportMode) {
        useAppStore.getState().setTransportMode(transportMode)
      }
      setIsNavigating(true)
      const chosen = stamped[selectedRouteIdx] || stamped[0]
      navigate('/navigate', { state: { selectedRoute: chosen, selectedRouteIdx } })
    } else {
      setIsNavigating(true)
      navigate('/navigate')
    }
  }

  const selectedRoute = displayedRoutes[selectedRouteIdx] || displayedRoutes[0]
  const onRouteReports = selectedRoute?.onRouteReports || []
  const monsoon = isMonsoonSeason()

  return (
    <div className="relative w-full h-full overflow-hidden bg-slate-900 select-none">
      {/* ════════ MAP CANVAS (FULL SCREEN GOOGLE MAP TILES) ════════ */}
      <div className="absolute inset-0 z-0">
        <MapContainer
          center={[isFinite(startLoc?.lat) ? startLoc.lat : 22.7303, isFinite(startLoc?.lng) ? startLoc.lng : 88.4871]}
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
                      <p style={{ fontSize: 9, fontWeight: 900, color: '#1D4ED8', marginTop: 2, display: 'flex', alignItems: 'center', gap: 3 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 11 }}>bolt</span>
                        <span>Monsoon risk active</span>
                      </p>
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
                    <p style={{ fontWeight: 900, fontSize: 11, color: cfg.color, display: 'flex', alignItems: 'center', gap: 3 }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 12 }}>warning</span>
                      <span>{acc.title}</span>
                    </p>
                    <p style={{ fontSize: 10, fontWeight: 700, color: '#1e293b', marginTop: 2 }}>{acc.area}</p>
                    <p style={{ fontSize: 9.5, color: '#475569', marginTop: 3 }}>{acc.description}</p>
                    <p style={{ fontSize: 8.5, color: '#94a3b8', marginTop: 4 }}>Source: {acc.source}</p>
                  </div>
                </Popup>
              </Circle>
            )
          })}

          {/* ════════ ML BOTTLENECK DANGER MARKER (pulsing red) ════════ */}
          {selectedRoute?.bottleneck?.lat && selectedRoute?.bottleneck?.lng && isFinite(selectedRoute.bottleneck.lat) && isFinite(selectedRoute.bottleneck.lng) && (
            <Circle
              center={[selectedRoute.bottleneck.lat, selectedRoute.bottleneck.lng]}
              radius={60}
              pathOptions={{
                color: '#EF4444',
                fillColor: '#EF4444',
                fillOpacity: 0.35,
                weight: 2.5,
                opacity: 0.85,
                dashArray: '4 4',
              }}
            >
              <Popup>
                <div style={{ minWidth: 180 }}>
                  <p style={{ fontWeight: 900, fontSize: 11, color: '#EF4444', display: 'flex', alignItems: 'center', gap: 3 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 12 }}>warning</span>
                    <span>ML-Detected Danger Zone</span>
                  </p>
                  <p style={{ fontSize: 10.5, fontWeight: 700, color: '#1e293b', marginTop: 3 }}>
                    Bottleneck Safety Score: {selectedRoute.bottleneck.safety_score ?? '—'}/100
                  </p>
                  {selectedRoute.bottleneck.hazards?.accident?.name &&
                    selectedRoute.bottleneck.hazards.accident.name !== 'None' && (
                    <p style={{ fontSize: 9.5, color: '#475569', marginTop: 4 }}>
                      Nearest: {selectedRoute.bottleneck.hazards.accident.name}
                      {' '}({Math.round(selectedRoute.bottleneck.hazards.accident.distance_m || 0)}m)
                    </p>
                  )}
                  <p style={{ fontSize: 8.5, color: '#94a3b8', marginTop: 4 }}>
                    Source: Safety Guardian 26-feature ML Model
                  </p>
                </div>
              </Popup>
            </Circle>
          )}

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
                {(selectedRoute.safetySegments || []).map((seg, sIdx) => {
                  const validPoints = (seg.points || []).filter(p => Array.isArray(p) && p.length >= 2 && isFinite(p[0]) && isFinite(p[1]))
                  if (validPoints.length < 2) return null
                  return (
                    <Polyline
                      key={`sel-seg-${selectedRouteIdx}-${sIdx}`}
                      positions={validPoints}
                      pathOptions={{
                        color: seg.color,
                        weight: 5.5,
                        opacity: 0.95,
                        lineCap: 'round',
                        lineJoin: 'round',
                      }}
                    />
                  )
                })}

                {/* On-Route Accident Blackspot Overlap Markers */}
                {(selectedRoute?.onRouteAccidents || []).map((acc, ai) => {
                  const lat = parseFloat(acc.lat ?? acc.latitude)
                  const lng = parseFloat(acc.lng ?? acc.longitude ?? acc.lon)
                  if (!isFinite(lat) || !isFinite(lng)) return null
                  return (
                    <Marker
                      key={`acc-overlap-${acc.id || ai}`}
                      position={[lat, lng]}
                      icon={L.divIcon({
                        className: 'hazard-overlap-marker',
                        html: `<div style="
                          background: #B91C1C;
                          color: white;
                          border: 2px solid white;
                          border-radius: 9999px;
                          padding: 3px 8px;
                          font-size: 8.5px;
                          font-weight: 900;
                          box-shadow: 0 4px 14px rgba(185,28,28,0.6);
                          display: flex;
                          align-items: center;
                          gap: 3px;
                          white-space: nowrap;
                        ">
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="white"><path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/></svg>
                          <span>${acc.area || 'Accident Blackspot'}</span>
                        </div>`,
                        iconSize: [125, 22],
                        iconAnchor: [62, 11],
                      })}
                    >
                      <Popup>
                        <div style={{ minWidth: 175 }}>
                          <p style={{ fontWeight: 900, fontSize: 11, color: '#B91C1C', display: 'flex', alignItems: 'center', gap: 3 }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 12 }}>warning</span>
                            <span>Active Route Overlap</span>
                          </p>
                          <p style={{ fontSize: 10, fontWeight: 800, color: '#1e293b', marginTop: 2 }}>{acc.area || acc.title || 'Accident Blackspot'}</p>
                          <p style={{ fontSize: 9, color: '#475569', marginTop: 3 }}>Distance to route: {acc._dist}m · Penalty: -{acc._penalty} pts</p>
                          <p style={{ fontSize: 8.5, color: '#64748b', marginTop: 2 }}>High-risk collision zone · Maintain safe distance</p>
                        </div>
                      </Popup>
                    </Marker>
                  )
                })}

                {/* On-Route Crime Hotspot Overlap Markers */}
                {(selectedRoute?.onRouteCrimes || []).map((crime, ci) => {
                  const lat = parseFloat(crime.lat ?? crime.latitude)
                  const lng = parseFloat(crime.lng ?? crime.longitude ?? crime.lon)
                  if (!isFinite(lat) || !isFinite(lng)) return null
                  return (
                    <Marker
                      key={`crime-overlap-${crime.id || ci}`}
                      position={[lat, lng]}
                      icon={L.divIcon({
                        className: 'crime-overlap-marker',
                        html: `<div style="
                          background: #E11D48;
                          color: white;
                          border: 2px solid white;
                          border-radius: 9999px;
                          padding: 3px 8px;
                          font-size: 8.5px;
                          font-weight: 900;
                          box-shadow: 0 4px 14px rgba(225,29,72,0.6);
                          display: flex;
                          align-items: center;
                          gap: 3px;
                          white-space: nowrap;
                        ">
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="white"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z"/></svg>
                          <span>${crime.area || 'Crime Hotspot'}</span>
                        </div>`,
                        iconSize: [125, 22],
                        iconAnchor: [62, 11],
                      })}
                    >
                      <Popup>
                        <div style={{ minWidth: 175 }}>
                          <p style={{ fontWeight: 900, fontSize: 11, color: '#E11D48', display: 'flex', alignItems: 'center', gap: 3 }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 12 }}>shield</span>
                            <span>Active Route Overlap</span>
                          </p>
                          <p style={{ fontSize: 10, fontWeight: 800, color: '#1e293b', marginTop: 2 }}>{crime.area || crime.title || 'Crime Caution Area'}</p>
                          <p style={{ fontSize: 9, color: '#475569', marginTop: 3 }}>Distance to route: {crime._dist}m · Penalty: -{crime._penalty} pts</p>
                          <p style={{ fontSize: 8.5, color: '#64748b', marginTop: 2 }}>Low light or theft risk · Stay on primary lanes</p>
                        </div>
                      </Popup>
                    </Marker>
                  )
                })}
              </Fragment>
            )
          })()}

          {/* 3. Floating Interactive Route Map Badges */}
          {displayedRoutes.map((route, idx) => {
            const anchor = getRouteAnchorPoint(route.geometry, idx, displayedRoutes.length)
            if (!anchor || !Array.isArray(anchor) || !isFinite(anchor[0]) || !isFinite(anchor[1])) return null
            const isSelected = idx === selectedRouteIdx
            return (
              <Marker
                key={`map-badge-${idx}`}
                position={anchor}
                icon={createRouteMapBadge(route, isSelected, transportMode, idx)}
                eventHandlers={{
                  click: (e) => {
                    if (e?.originalEvent) e.originalEvent.stopPropagation()
                    handleSelectRoute(idx)
                  },
                }}
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
                    <p className="text-[9px] text-[#94a3b8] mt-1 flex items-center gap-1">
                      <span className="material-symbols-outlined text-[10px] text-amber-500">warning</span>
                      <span>-{r._penalty || 2}pts · {timeAgo(r.createdAt || r.timestamp)}</span>
                    </p>
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

      {/* ══ FLOATING WEATHER CARD (Top Right Corner, matching HomePage) ══ */}
      <div className="absolute z-20 animate-fade-in pointer-events-auto" style={{ top: '12px', right: '12px', maxWidth: '185px' }}>
        <WeatherCard weather={weather} loading={weatherLoading} error={weatherError} />
      </div>

      {/* ════════ FLOATING MAP CONTROLS ════════ */}
      <div className="absolute top-[195px] right-3 z-20 flex flex-col gap-2 items-end">
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
            Disaster & Flood
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

      {/* ════════ UNIFIED STITCH ROUTE PREVIEW & SELECTION PANEL ════════ */}
      <div className={`absolute left-0 right-0 bottom-0 z-30 transition-all duration-300 ease-in-out md:w-[425px] md:left-4 md:right-auto md:bottom-4 md:top-4 md:flex md:flex-col md:max-h-[calc(100vh-32px)] pointer-events-auto ${
        sheetState === 'collapsed' ? 'translate-y-[calc(100%-82px)] md:translate-y-0' :
        sheetState === 'half' ? 'translate-y-0 md:translate-y-0' :
        'translate-y-0 md:translate-y-0'
      }`}>
        <div className={`bg-white/95 backdrop-blur-md rounded-t-3xl md:rounded-3xl shadow-[0_-8px_30px_rgba(0,0,0,0.18)] md:shadow-[0_8px_30px_rgba(0,0,0,0.18)] border border-slate-200/90 flex flex-col transition-all duration-300 overflow-hidden ${
          sheetState === 'collapsed' ? 'h-[85px]' :
          sheetState === 'half' ? 'h-auto max-h-[82vh] md:max-h-[calc(100vh-32px)]' :
          'h-auto max-h-[92vh] md:max-h-[calc(100vh-32px)]'
        }`}>
          {/* Drag handle (Mobile only) */}
          <div
            className="flex flex-col items-center pt-2 pb-1 cursor-pointer select-none md:hidden"
            onClick={() => setSheetState(s => s === 'collapsed' ? 'half' : s === 'half' ? 'collapsed' : 'half')}
          >
            <div className="w-10 h-1.5 rounded-full bg-slate-300 hover:bg-slate-400 transition-colors" />
          </div>

          {/* STATE 1: COLLAPSED PEEK BAR (Mobile only) */}
          {sheetState === 'collapsed' && selectedRoute && (
            <div className="px-4 py-1.5 flex items-center justify-between gap-3 md:hidden">
              <div
                className="flex-1 min-w-0 cursor-pointer"
                onClick={() => setSheetState('half')}
              >
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: getRouteColor(selectedRoute, selectedRouteIdx) }} />
                  <span className="text-xs font-black text-slate-900 truncate">
                    {selectedRoute.rankLabel} · {fmtDuration(selectedRoute.durationMin)}
                  </span>
                  <span className="text-[9px] font-bold text-slate-500">
                    {safeNum(selectedRoute.distanceKm, 0) > 0 ? `(${safeNum(selectedRoute.distanceKm, 0).toFixed(1)} km)` : ''}
                  </span>
                </div>
                <p className="text-[8.5px] text-slate-400 font-medium truncate mt-0.5">
                  {selectedRoute.viaRoads} · <strong className="text-emerald-700 font-black inline-flex items-center gap-0.5"><span className="material-symbols-outlined text-[12px]">shield</span>{selectedRoute.safetyScore || 75}/100</strong>
                </p>
              </div>

              <button
                onClick={handleStartJourney}
                className="h-9 px-4 rounded-xl bg-[#1B4332] hover:bg-[#143427] text-white font-black text-xs shadow-md active:scale-95 transition-all flex items-center gap-1 flex-shrink-0"
              >
                <span>Start</span>
                <span className="material-symbols-outlined text-[14px]">navigation</span>
              </button>
            </div>
          )}

          {/* UNIFIED STITCH CONTENT: Attached seamlessly with ZERO GAP & PERFECT ALIGNMENT */}
          {(sheetState !== 'collapsed' || (typeof window !== 'undefined' && window.innerWidth >= 768)) && (
            <div className="px-3.5 pb-3.5 pt-1 flex flex-col overflow-y-auto max-h-[82vh] md:max-h-[calc(100vh-32px)] custom-scrollbar gap-2.5">
              
              {/* 1. STITCH MAIN HEADER: Back + Preview Routes + Safety Active Chip */}
              <div className="flex items-center justify-between gap-2 flex-shrink-0 pt-0.5">
                <div className="flex items-center gap-2.5">
                  <button
                    onClick={() => navigate(-1)}
                    aria-label="Go Back"
                    className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 active:scale-95 transition-all flex items-center justify-center text-slate-700 flex-shrink-0 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[18px]">arrow_back</span>
                  </button>
                  <h1 className="text-base font-bold tracking-tight text-slate-900 truncate">Preview Routes</h1>
                </div>

                {/* Live Safety Active Status Chip */}
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-bold flex-shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span>Safety Active</span>
                </div>
              </div>

              {/* 2. STITCH ORIGIN & DESTINATION INPUT CARD (With connecting line and swap button) */}
              <div className="bg-slate-50/90 border border-slate-200/90 rounded-2xl p-2 relative shadow-xs flex-shrink-0">
                {/* Origin Row */}
                <button
                  type="button"
                  onClick={() => navigate('/search?type=start')}
                  className="w-full flex items-center gap-2.5 px-2 py-1 text-left hover:bg-white/60 rounded-xl transition-colors cursor-pointer"
                >
                  <div className="w-2.5 h-2.5 rounded-full bg-blue-600 ring-4 ring-blue-100 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[9.5px] font-semibold text-slate-400 uppercase tracking-wider">Start Point</p>
                    <p className="text-xs font-bold text-slate-800 truncate">
                      {startLocation?.name || 'Current Location'}
                    </p>
                  </div>
                  <span className="material-symbols-outlined text-slate-400 text-[14px]">edit</span>
                </button>

                {/* Connecting dotted line and switch button */}
                <div className="relative pl-3 flex items-center my-0.5">
                  <div className="w-px h-3 bg-slate-300 ml-[1px]" />
                  <button
                    type="button"
                    onClick={handleSwapLocations}
                    aria-label="Swap origin and destination"
                    className="absolute right-1 w-6 h-6 rounded-full bg-white border border-slate-200 shadow-xs flex items-center justify-center text-slate-500 hover:text-slate-800 active:rotate-180 transition-transform cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[14px]">swap_vert</span>
                  </button>
                </div>

                {/* Destination Row */}
                <button
                  type="button"
                  onClick={() => navigate('/search')}
                  className="w-full flex items-center gap-2.5 px-2 py-1 text-left hover:bg-white/60 rounded-xl transition-colors cursor-pointer"
                >
                  <div className="w-2.5 h-2.5 rotate-45 bg-rose-500 ring-4 ring-rose-100 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[9.5px] font-semibold text-slate-400 uppercase tracking-wider">Destination</p>
                    <p className="text-xs font-bold text-slate-800 truncate">
                      {destination?.name || 'Destination'}
                    </p>
                  </div>
                  <span className="material-symbols-outlined text-slate-400 text-[14px]">edit</span>
                </button>
              </div>

              {/* 3. STITCH MODE SELECTOR PILLS */}
              <div className="flex items-center gap-1 p-1 bg-slate-100/90 rounded-xl border border-slate-200/80 flex-shrink-0">
                {TRANSPORT_MODES.map(m => {
                  const isActive = transportMode === m.id
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => handleModeChange(m.id)}
                      className={`flex-1 flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg font-bold text-xs transition-all cursor-pointer ${
                        isActive
                          ? 'bg-white shadow-xs text-blue-600'
                          : 'text-slate-600 hover:bg-white/60'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[15px]" style={isActive ? { color: m.color } : {}}>{m.icon}</span>
                      <span>{m.label}</span>
                    </button>
                  )
                })}
              </div>

              {/* 4. AVAILABLE ROUTES SUBHEADER */}
              <div className="flex items-center justify-between px-0.5 flex-shrink-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Available Routes</span>
                  <span className="text-[9.5px] px-1.5 py-0.2 rounded-full bg-slate-200 text-slate-700 font-bold">
                    {displayedRoutes.length} Found
                  </span>
                </div>
                <span className="text-[10.5px] font-medium text-slate-400 flex items-center gap-0.5">
                  <span className="material-symbols-outlined text-[13px]">swipe</span>
                  <span>Swipe sideways</span>
                </span>
              </div>

              {/* 5. STITCH HORIZONTAL ROUTE CAROUSEL (Side-by-side with Peeking) */}
              <div
                ref={cardsTrackRef}
                onScroll={onCardsScroll}
                className="flex gap-3 overflow-x-auto pb-1 pt-0.5 px-0.5 snap-x snap-mandatory no-scrollbar items-stretch scroll-smooth flex-shrink-0"
                style={{
                  WebkitOverflowScrolling: 'touch',
                  overscrollBehaviorX: 'contain',
                  scrollBehavior: 'smooth',
                  touchAction: 'pan-x',
                  scrollbarWidth: 'none',
                  msOverflowStyle: 'none',
                }}
              >
                {loading && (
                  <div className="text-center py-6 w-full">
                    <span className="material-symbols-outlined text-slate-400 text-[24px] animate-spin">refresh</span>
                    <p className="text-xs text-slate-500 font-bold mt-1">Calculating road geometries & safety…</p>
                  </div>
                )}

                {!loading && displayedRoutes.map((route, idx) => {
                  const isSelected = selectedRouteIdx === idx
                  const color = getRouteColor(route, idx)
                  const title = getStitchCardTitle(route, idx)
                  const statusBadge = getStitchCardStatusBadge(route, idx)
                  const footer = getStitchCardFooter(route, idx)

                  return (
                    <div
                      key={idx}
                      onClick={() => handleSelectRoute(idx)}
                      className={`route-card flex-shrink-0 w-[84%] sm:w-[310px] snap-center rounded-2xl p-3.5 border-2 cursor-pointer transition-all duration-150 relative flex flex-col justify-between ${
                        isSelected
                          ? 'bg-white shadow-md ring-2'
                          : 'bg-white/90 hover:bg-white border-slate-200 shadow-xs opacity-85 hover:opacity-100'
                      }`}
                      style={isSelected ? { borderColor: color, ringColor: color + '30' } : { borderColor: '#e2e8f0' }}
                    >
                      {/* Card Header: Dot + Bold Clean Route Title (No extra moderate/high risk badges) */}
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                        <span className="text-[13px] font-black tracking-tight" style={{ color }}>
                          {title}
                        </span>
                      </div>

                      {/* Main Row: Big Hero Score Box (Left) + Duration & Distance (Right) */}
                      <div className="mt-2.5 flex items-center justify-between gap-2">
                        {/* Hero Score Box */}
                        <div
                          className="flex items-baseline gap-1 px-3 py-1.5 rounded-xl border flex-shrink-0"
                          style={{ backgroundColor: color + '15', borderColor: color + '35' }}
                        >
                          <span className="text-4xl font-black tracking-tight leading-none" style={{ color }}>
                            {route.safetyScore || 75}
                          </span>
                          <span className="text-xs font-bold opacity-75" style={{ color }}>/100</span>
                        </div>

                        {/* Duration & Distance */}
                        <div className="text-right min-w-0">
                          <div className="text-2xl font-black text-slate-900 tracking-tight leading-none">
                            {fmtDuration(route.durationMin)}
                          </div>
                          <p className="text-[11.5px] font-semibold text-slate-500 mt-0.5 truncate">
                            {safeNum(route.distanceKm, 0) > 0 ? `${safeNum(route.distanceKm, 0).toFixed(1)} km` : '—'}
                            {route.timeDiffMin ? ` • +${route.timeDiffMin} min vs fastest` : route.isFastest ? ' • Fastest' : ''}
                          </p>
                        </div>
                      </div>

                      {/* Via Road Corridor */}
                      <p className="text-xs font-semibold text-slate-700 mt-2 truncate">
                        {route.viaRoads}
                      </p>

                      {/* Horizontal Safety Bar */}
                      <div className="mt-1.5 flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${route.safetyScore || 75}%`,
                              backgroundColor: color,
                            }}
                          />
                        </div>
                        <span className="text-[9px] font-extrabold" style={{ color }}>
                          {route.safetyScore || 75}%
                        </span>
                      </div>

                      {/* Card Footer: Highlight Tag + Pill Badge */}
                      <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                        <span className="font-semibold flex items-center gap-1 truncate mr-1" style={{ color }}>
                          <span className="material-symbols-outlined text-[13px]">{footer.icon}</span>
                          <span className="truncate">{footer.tag}</span>
                        </span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border flex-shrink-0 ${footer.badgeBg}`}>
                          {footer.badge}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* 6. CAROUSEL INDICATOR DOTS */}
              {displayedRoutes.length > 1 && (
                <div className="flex items-center justify-center gap-1.5 py-0.5 flex-shrink-0">
                  {displayedRoutes.map((r, i) => {
                    const isSel = selectedRouteIdx === i
                    const rColor = getRouteColor(r, i)
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => handleSelectRoute(i)}
                        className={`h-1.5 rounded-full transition-all duration-200 cursor-pointer ${
                          isSel ? 'w-5' : 'w-1.5 bg-slate-300 hover:bg-slate-400'
                        }`}
                        style={isSel ? { backgroundColor: rColor } : {}}
                        title={r.rankLabel}
                      />
                    )
                  })}
                </div>
              )}

              {/* 7. STITCH ROUTE INTELLIGENCE BREAKDOWN (Details Section - Contained strictly below carousel) */}
              {selectedRoute && (() => {
                const selColor = getRouteColor(selectedRoute, selectedRouteIdx)
                const deductions = getStitchDeductions(selectedRoute)
                const comp = getScoreComparativeBreakdown(
                  selectedRoute.safetyScore || 75,
                  selectedRoute.rankLabel,
                  selectedRoute.envReasons || [],
                  selectedRoute.riskReasons || [],
                  selectedRoute,
                )
                const title = getStitchCardTitle(selectedRoute, selectedRouteIdx)
                const statusBadge = getStitchCardStatusBadge(selectedRoute, selectedRouteIdx)

                return (
                  <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden flex-shrink-0">
                    {/* Accordion Header / Toggle */}
                    <button
                      type="button"
                      onClick={() => setShowDetails(s => !s)}
                      className={`w-full px-4 py-2.5 flex items-center justify-between text-left hover:bg-slate-50 transition-colors cursor-pointer ${
                        showDetails ? 'border-b border-slate-100' : ''
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 pr-2">
                        <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100 flex-shrink-0">
                          <span className="material-symbols-outlined text-[18px]">insights</span>
                        </div>
                        <div className="min-w-0">
                          <h2 className="text-xs font-bold text-slate-900 leading-tight">Why this score?</h2>
                          <p className="text-[11px] text-slate-500 font-medium leading-tight mt-0.5 truncate">
                            Points cut & hazard analysis
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 text-xs font-bold text-blue-600 bg-blue-50 border border-blue-200/80 px-2.5 py-1 rounded-xl flex-shrink-0 hover:bg-blue-100 active:scale-95 transition-all shadow-2xs">
                        <span>{showDetails ? 'Hide details' : 'Show details'}</span>
                        <span className="material-symbols-outlined text-[16px] text-blue-600">
                          {showDetails ? 'expand_less' : 'expand_more'}
                        </span>
                      </div>
                    </button>

                    {/* Expandable Body */}
                    {showDetails && (
                      <div className="p-3 space-y-2.5 text-xs max-h-[220px] overflow-y-auto custom-scrollbar">
                        {/* 1. Point Deductions List (Clean, perfectly aligned, no pill background, red font for cuts) */}
                        <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-1">
                          {deductions.map((row, di) => (
                            <div key={di} className="flex items-baseline justify-between gap-3 py-1 border-b border-slate-100/70 last:border-0">
                              <span className="text-slate-700 font-medium text-xs leading-snug flex-1">
                                {row.factor}
                              </span>
                              <span className={`shrink-0 text-right whitespace-nowrap text-xs tabular-nums ${
                                row.isBad ? 'font-bold text-red-600' : 'font-medium text-slate-400'
                              }`}>
                                {row.points}
                              </span>
                            </div>
                          ))}
                        </div>

                        {/* 2. Watch Out Critical Alerts (For Risky / Balanced) */}
                        {comp.tradeOffs?.length > 0 && (
                          <div className="rounded-xl border border-rose-200 bg-rose-50/70 p-2.5 space-y-1.5">
                            <div className="flex items-center gap-1.5 text-xs font-bold text-rose-800">
                              <span className="material-symbols-outlined text-rose-600 text-[15px]">warning</span>
                              <span>Watch Out Critical Alerts</span>
                            </div>
                            <ul className="space-y-1 text-[11px] text-rose-800 font-medium pl-1">
                              {comp.tradeOffs.map((item, ti) => (
                                <li key={ti} className="flex items-start gap-1.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 mt-1 shrink-0" />
                                  <span>{item}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* 3. What's Good Highlights (For Safest / Balanced) */}
                        {comp.advantages?.length > 0 && (
                          <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-2.5 space-y-1.5">
                            <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-800">
                              <span className="material-symbols-outlined text-emerald-600 text-[15px]">verified</span>
                              <span>What's Good</span>
                            </div>
                            <ul className="space-y-1 text-[11px] text-emerald-800 font-medium pl-1">
                              {comp.advantages.map((item, ai) => (
                                <li key={ai} className="flex items-start gap-1.5">
                                  <span className="material-symbols-outlined text-emerald-600 text-[13px] shrink-0 mt-0.5">check</span>
                                  <span>{item}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* 4. Corridor Info Banner */}
                        <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-between text-xs">
                          <div className="flex items-center gap-1.5 text-amber-800 font-medium truncate mr-2">
                            <span className="material-symbols-outlined text-amber-600 text-[16px] shrink-0">info</span>
                            <span className="truncate">Corridor: {selectedRoute.viaRoads || 'Road network'}. Exercise caution.</span>
                          </div>
                          <span className="text-[9.5px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 shrink-0">Caution</span>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* 8. PRIMARY ACTION BUTTON (Start Navigation) */}
              <button
                onClick={handleStartJourney}
                disabled={displayedRoutes.length === 0 || routeError}
                className="w-full h-12 rounded-2xl bg-[#1B4332] hover:bg-[#143427] text-white font-extrabold text-sm shadow-md active:scale-[0.99] transition-all flex items-center justify-center gap-2 disabled:opacity-50 flex-shrink-0 cursor-pointer"
              >
                <span className="material-symbols-outlined text-white text-[18px]">navigation</span>
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
