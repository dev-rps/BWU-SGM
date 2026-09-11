/**
 * trafficRestrictions.js
 *
 * Real-world Traffic Police Regulation & Corridor Timing Intelligence
 * for Kolkata, Howrah, and West Bengal urban routes.
 *
 * Covers:
 *   1. Time-restricted one-way vs two-way corridors (e.g. 08:00–20:00 vs 8 PM – 8 AM)
 *   2. Police challan warnings (wrong-way entry, lane violations, no-entry windows)
 *   3. Real-time time-of-day evaluation (active restrictions vs open night windows)
 */

export const TRAFFIC_REGULATION_ZONES = [
  {
    id: 'howrah_bridge_approach',
    name: 'Howrah Bridge & Station Approach',
    keywords: ['howrah', 'bridge', 'station', 'foreshore', 'sree ram', 'jogendranath'],
    center: [22.5851, 88.3425],
    radiusMeters: 1400,
    dayRule: {
      type: 'one_way_restricted',
      label: 'One-Way Rush Direction',
      hours: '08:00–20:00',
      description: 'Strict unidirectional traffic control during peak hours towards Kolkata / Howrah',
    },
    nightWindow: {
      type: 'open_two_way',
      label: 'Open 2-Way (8 PM – 8 AM)',
      hours: '20:00–08:00',
      description: 'Two-way unrestricted vehicle flow open from 8:00 PM to 8:00 AM',
    },
    policeAdvisory: 'Kolkata & Howrah Traffic Police strictly enforce one-way entry near station approach. Wrong-way entry attracts immediate e-challan (Sec 177/184 MVA).',
    heavyVehicleWindow: 'Commercial goods entry restricted 07:00–21:00; Open 9 PM – 7 AM',
  },
  {
    id: 'brabourne_road',
    name: 'Brabourne Road & Flyover',
    keywords: ['brabourne', 'tea board', 'canning', 'burrabazar', 'b.b.d'],
    center: [22.5768, 88.3512],
    radiusMeters: 1000,
    dayRule: {
      type: 'one_way',
      label: 'One-Way Northbound Active',
      hours: '08:00–20:00',
      description: 'One-way northbound only from BBD Bagh to Howrah Bridge',
    },
    nightWindow: {
      type: 'open_two_way',
      label: 'Two-Way Open (8 PM – 8 AM)',
      hours: '20:00–08:00',
      description: 'Two-way traffic permitted between 8:00 PM and 8:00 AM',
    },
    policeAdvisory: 'Automatic ANPR speed & wrong-route surveillance cameras active 24/7.',
    heavyVehicleWindow: 'No heavy vehicles permitted during 06:00–22:00',
  },
  {
    id: 'mg_road_corridor',
    name: 'Mahatma Gandhi (M.G.) Road',
    keywords: ['m.g. road', 'mahatma gandhi', 'college street', 'cr avenue', 'central'],
    center: [22.5815, 88.3610],
    radiusMeters: 1200,
    dayRule: {
      type: 'one_way',
      label: 'One-Way Westbound Active',
      hours: '07:00–21:00',
      description: 'Unidirectional westbound traffic flow towards Howrah Bridge',
    },
    nightWindow: {
      type: 'open_two_way',
      label: 'Two-Way Open at Night',
      hours: '21:00–07:00',
      description: 'Two-way traffic open from 9:00 PM to 7:00 AM',
    },
    policeAdvisory: 'No U-turns allowed. Dedicated bus/tram corridor monitored by traffic sergeants.',
    heavyVehicleWindow: 'Strict commercial no-entry 06:00 to 22:00',
  },
  {
    id: 'strand_road',
    name: 'Strand Road Riverfront Corridor',
    keywords: ['strand', 'babughat', 'fairlie', 'eden gardens', 'riverfront'],
    center: [22.5685, 88.3415],
    radiusMeters: 1500,
    dayRule: {
      type: 'time_reversible',
      label: 'Reversible Flow Corridor',
      hours: '08:00–14:00 (Southbound) / 15:00–21:00 (Northbound)',
      description: 'Direction swaps during morning vs evening peak windows',
    },
    nightWindow: {
      type: 'open_two_way',
      label: 'Open 2-Way (9 PM – 7 AM)',
      hours: '21:00–07:00',
      description: 'Two-way standard flow open from 9:00 PM to 7:00 AM',
    },
    policeAdvisory: 'Watch digital overhead directional signals before entering Strand Road.',
    heavyVehicleWindow: 'Port commercial trucks permitted only 22:00–06:00',
  },
  {
    id: 'gt_road_howrah',
    name: 'Grand Trunk (G.T.) Road (Howrah/Bally)',
    keywords: ['g.t. road', 'grand trunk', 'belur', 'bally', 'liluah', 'shri aur'],
    center: [22.6100, 88.3500],
    radiusMeters: 2000,
    dayRule: {
      type: 'two_way_divided',
      label: 'Two-Way Corridor (Divided)',
      hours: '24/7',
      description: 'Standard two-way traffic with central police median barriers',
    },
    nightWindow: {
      type: 'open_two_way',
      label: 'Commercial Window Active (8 PM – 8 AM)',
      hours: '20:00–08:00',
      description: 'Open for all traffic categories from 8:00 PM to 8:00 AM',
    },
    policeAdvisory: 'Commercial goods vehicles prohibited during daytime (07:00–20:00). Heavy fines for daytime truck entry.',
    heavyVehicleWindow: 'Heavy vehicle entry permitted: 8:00 PM to 8:00 AM only',
  },
  {
    id: 'kona_expressway',
    name: 'Kona Expressway (NH 117) & Santragachi',
    keywords: ['kona', 'expressway', 'santragachi', 'nh 117', 'nabanna'],
    center: [22.5650, 88.2900],
    radiusMeters: 2500,
    dayRule: {
      type: 'two_way_arterial',
      label: 'Two-Way Arterial',
      hours: '24/7',
      description: 'Major bidirectional expressway connecting to Second Hooghly Bridge',
    },
    nightWindow: {
      type: 'open_two_way',
      label: 'Full Commercial Movement (8 PM – 8 AM)',
      hours: '20:00–08:00',
      description: 'Freight and long-distance commercial traffic peak window',
    },
    policeAdvisory: 'Santragachi railway bridge stretch has temporary lane merging. Observe police marshals.',
    heavyVehicleWindow: 'Heavy vehicle ban active 08:00–11:00 & 17:00–21:00',
  },
  {
    id: 'maa_flyover',
    name: 'Maa Flyover (AJC Bose to EM Bypass)',
    keywords: ['maa flyover', 'ajc bose', 'park circus', 'em bypass', 'science city'],
    center: [22.5410, 88.3750],
    radiusMeters: 2200,
    dayRule: {
      type: 'two_way_flyover',
      label: 'Two-Way Flyover',
      hours: '06:00–22:00',
      description: 'Bi-directional elevated corridor with 50 km/h speed limit',
    },
    nightWindow: {
      type: 'two_wheeler_restricted',
      label: '2-Wheeler Night Ban (10 PM – 6 AM)',
      hours: '22:00–06:00',
      description: 'Two-wheelers prohibited by Kolkata Police notification at night',
    },
    policeAdvisory: 'Two-wheelers must use ground road after 10 PM. Automatic speed cameras active.',
    heavyVehicleWindow: 'Goods vehicles strictly banned 24/7 on elevated structure',
  },
  {
    id: 'vidyasagar_setu',
    name: 'Vidyasagar Setu (2nd Hooghly Bridge)',
    keywords: ['vidyasagar', 'second hooghly', 'toll plaza', 'nabanna approach'],
    center: [22.5580, 88.3280],
    radiusMeters: 1800,
    dayRule: {
      type: 'two_way_highway',
      label: 'Two-Way Express Tollway',
      hours: '24/7',
      description: 'Multi-lane cable-stayed bridge with dedicated toll lanes',
    },
    nightWindow: {
      type: 'open_two_way',
      label: 'Night Freight Flow (10 PM – 6 AM)',
      hours: '22:00–06:00',
      description: 'Commercial interstate truck clearance window',
    },
    policeAdvisory: 'Maintain designated lane discipline. Overtaking on bridge ramps strictly penalized.',
    heavyVehicleWindow: 'Heavy commercial movement: 10:00 PM to 6:00 AM',
  },
]

// ─── Geo proximity check helper ──────────────────────────────────────────────
function getPolylineMinDistance(lat, lng, geometry = []) {
  if (!geometry || geometry.length < 2) return Infinity
  let minDist = Infinity
  for (let i = 0; i < geometry.length; i++) {
    const pt = geometry[i]
    const pLat = Array.isArray(pt) ? pt[0] : pt.lat
    const pLng = Array.isArray(pt) ? pt[1] : pt.lng
    if (!isFinite(pLat) || !isFinite(pLng)) continue

    const dLat = (pLat - lat) * 111320
    const dLng = (pLng - lng) * 111320 * Math.cos(lat * Math.PI / 180)
    const dist = Math.sqrt(dLat * dLat + dLng * dLng)
    if (dist < minDist) minDist = dist
  }
  return minDist
}

/**
 * Evaluates real-time traffic regulations and time restrictions for a candidate route.
 *
 * @param {object} route - Candidate route object
 * @param {number} [hour] - Hour of day (0-23, defaults to current local hour)
 * @returns {object} Timing regulations & police advisory profile
 */
export function getRouteTrafficRegulations(route, hour) {
  const currentHour = hour !== undefined ? hour : new Date().getHours()
  const viaText = (route.viaRoads || route.name || '').toLowerCase()
  const geometry = route.geometry || []

  // Find matching traffic regulation zones
  let matchedZone = null
  let minMatchDist = Infinity

  for (const zone of TRAFFIC_REGULATION_ZONES) {
    // 1. Text keyword match
    const textMatched = zone.keywords.some(kw => viaText.includes(kw))
    if (textMatched) {
      matchedZone = zone
      break
    }

    // 2. Spatial proximity match
    const dist = getPolylineMinDistance(zone.center[0], zone.center[1], geometry)
    if (dist <= zone.radiusMeters && dist < minMatchDist) {
      minMatchDist = dist
      matchedZone = zone
    }
  }

  const isNightWindow = currentHour >= 20 || currentHour < 8 // 8:00 PM to 8:00 AM

  if (matchedZone) {
    if (isNightWindow) {
      return {
        hasRestriction: false,
        isNightWindowActive: true,
        roadType: 'two_way',
        badgeLabel: matchedZone.nightWindow.label,
        badgeColor: '#10B981', // Emerald green
        badgeBg: 'bg-emerald-50 text-emerald-800 border-emerald-200',
        timingRule: `${matchedZone.nightWindow.label} · ${matchedZone.nightWindow.description}`,
        policeAdvisory: matchedZone.policeAdvisory,
        heavyVehicleInfo: matchedZone.heavyVehicleWindow,
        zoneName: matchedZone.name,
        isOneWayNow: false,
        summary: `✓ ${matchedZone.name}: ${matchedZone.nightWindow.label} (Current time is within unrestricted window).`,
      }
    } else {
      // Daytime: active restriction
      const isOneWay = matchedZone.dayRule.type.includes('one_way')
      return {
        hasRestriction: true,
        isNightWindowActive: false,
        roadType: isOneWay ? 'one_way' : 'two_way_restricted',
        badgeLabel: matchedZone.dayRule.label,
        badgeColor: isOneWay ? '#EF4444' : '#F59E0B', // Red if one-way, Amber if divided/restricted
        badgeBg: isOneWay ? 'bg-rose-50 text-rose-800 border-rose-200' : 'bg-amber-50 text-amber-800 border-amber-200',
        timingRule: `${matchedZone.dayRule.label} (${matchedZone.dayRule.hours}) · Opens 2-way at 8:00 PM`,
        policeAdvisory: matchedZone.policeAdvisory,
        heavyVehicleInfo: matchedZone.heavyVehicleWindow,
        zoneName: matchedZone.name,
        isOneWayNow: isOneWay,
        summary: `⚠️ ${matchedZone.name}: ${matchedZone.dayRule.label} active (${matchedZone.dayRule.hours}). Opens 2-way after 8 PM. ${matchedZone.policeAdvisory}`,
      }
    }
  }

  // Standard corridor fallback (based on route rank)
  if (route.rankLabel === 'LEAST SAFE') {
    return {
      hasRestriction: true,
      isNightWindowActive: isNightWindow,
      roadType: isNightWindow ? 'two_way' : 'variable_direction',
      badgeLabel: isNightWindow ? '🌙 Night Window (8 PM – 8 AM)' : '⚠️ Check One-Way Signs',
      badgeColor: isNightWindow ? '#10B981' : '#F97316',
      badgeBg: isNightWindow ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-orange-50 text-orange-800 border-orange-200',
      timingRule: 'Side-street corridor: some municipal alleys operate as one-way during 8 AM – 8 PM. Open two-way 8 PM to 8 AM.',
      policeAdvisory: 'Watch for local traffic police signboards at street entrances to avoid wrong-way fines.',
      heavyVehicleInfo: 'No commercial trucks allowed during daytime hours.',
      zoneName: 'Dense Urban Shortcut Corridor',
      isOneWayNow: !isNightWindow,
      summary: isNightWindow
        ? '✓ Night window active: two-way movement allowed until 8:00 AM.'
        : '⚠️ Daytime side-streets may have active one-way enforcement. Confirm direction to avoid challans.',
    }
  }

  return {
    hasRestriction: false,
    isNightWindowActive: isNightWindow,
    roadType: 'two_way',
    badgeLabel: '✓ Two-Way Corridor',
    badgeColor: '#10B981',
    badgeBg: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    timingRule: 'Standard two-way arterial road open 24/7 with regular traffic police coverage.',
    policeAdvisory: 'Standard traffic regulations apply. Maintain lane speed and traffic signal compliance.',
    heavyVehicleInfo: 'Standard Kolkata Police commercial vehicle timings apply (truck entry: 10 PM – 6 AM).',
    zoneName: 'Primary Arterial Corridor',
    isOneWayNow: false,
    summary: '✓ Standard two-way corridor open 24/7. Regular traffic police patrol active.',
  }
}
