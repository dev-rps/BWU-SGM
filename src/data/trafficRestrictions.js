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
    id: 'jn_mukherjee_road',
    town: 'Howrah',
    name: 'J.N. Mukherjee Road (Salkia/Ghusuri)',
    keywords: ['jn mukherjee', 'j.n. mukherjee', 'mukherjee road', 'ghusuri', 'bandhaghat', 'salkia chowrasta'],
    center: [22.6050, 88.3540],
    radiusMeters: 2200,
    accessibleWindow: 'Open 2-Way: 8:00 PM – 8:00 AM',
    avoidWindow: 'Avoid: 8:00 AM – 8:00 PM (Strict 1-way northbound)',
    suggestion: 'Accessible 2-way from 8 PM to 8 AM. Avoid during daytime to prevent wrong-way police challans.',
    dayRule: {
      type: 'one_way',
      label: '1-Way Northbound (8 AM – 8 PM)',
      hours: '08:00–20:00',
      description: 'Strict unidirectional northbound flow from Salkia Chowrasta towards Ghusuri',
    },
    nightWindow: {
      type: 'open_two_way',
      label: 'Open 2-Way (8 PM – 8 AM)',
      hours: '20:00–08:00',
      description: 'Two-way unrestricted vehicle flow open between 8:00 PM and 8:00 AM',
    },
    policeAdvisory: 'Howrah Traffic Police strictly enforces one-way entry. ANPR cameras active.',
    heavyVehicleWindow: 'Commercial goods banned 07:00–21:00; Open 9 PM – 7 AM',
  },
  {
    id: 'gt_road_howrah',
    town: 'Howrah',
    name: 'Grand Trunk (G.T.) Road (Salkia & Belur)',
    keywords: ['g.t. road', 'grand trunk', 'belur', 'salkia', 'liluah', 'bally', 'golabari', 'kadamtala'],
    center: [22.6100, 88.3500],
    radiusMeters: 3000,
    accessibleWindow: 'Open 2-Way: 8:00 PM – 8:00 AM',
    avoidWindow: 'Avoid: 8:00 AM – 8:00 PM (Peak one-way diversions & commercial ban)',
    suggestion: 'Open two-way between 8 PM and 8 AM. Use Kona/Bypass during daytime peak rush.',
    dayRule: {
      type: 'two_way_divided',
      label: 'Divided Corridor (Diversions 8 AM – 8 PM)',
      hours: '08:00–20:00',
      description: 'Two-way traffic with peak one-way median diversions near market areas',
    },
    nightWindow: {
      type: 'open_two_way',
      label: 'Open 2-Way (8 PM – 8 AM)',
      hours: '20:00–08:00',
      description: 'Open for all traffic categories from 8:00 PM to 8:00 AM',
    },
    policeAdvisory: 'Commercial goods prohibited daytime (07:00–20:00). Police median barriers active.',
    heavyVehicleWindow: 'Heavy vehicle entry permitted: 8:00 PM to 8:00 AM only',
  },
  {
    id: 'howrah_bridge_approach',
    town: 'Howrah',
    name: 'Howrah Bridge & Station Approach',
    keywords: ['howrah', 'bridge', 'station', 'foreshore', 'dobson', 'sree ram', 'jogendranath'],
    center: [22.5851, 88.3425],
    radiusMeters: 1400,
    accessibleWindow: 'Open 2-Way: 8:00 PM – 8:00 AM',
    avoidWindow: 'Avoid: 8:00 AM – 8:00 PM (Unidirectional rush to station)',
    suggestion: 'Unidirectional rush towards station in daytime. Open 2-way after 8 PM.',
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
    policeAdvisory: 'Howrah Traffic Police strictly enforce one-way entry near station approach. Wrong-way entry attracts immediate e-challan.',
    heavyVehicleWindow: 'Commercial goods entry restricted 07:00–21:00; Open 9 PM – 7 AM',
  },
  {
    id: 'brabourne_road',
    town: 'Kolkata',
    name: 'Brabourne Road (BBD Bagh to Howrah Bridge)',
    keywords: ['brabourne', 'tea board', 'canning', 'burrabazar', 'b.b.d'],
    center: [22.5768, 88.3512],
    radiusMeters: 1000,
    accessibleWindow: 'Open 2-Way: 8:00 PM – 8:00 AM',
    avoidWindow: 'Avoid Southbound: 8:00 AM – 8:00 PM (1-Way Northbound only)',
    suggestion: 'Accessible two-way from 8 PM to 8 AM. Northbound only during day (avoid opposite direction).',
    dayRule: {
      type: 'one_way',
      label: 'One-Way Northbound Active',
      hours: '08:00–20:00',
      description: 'One-way northbound only from BBD Bagh to Howrah Bridge',
    },
    nightWindow: {
      type: 'open_two_way',
      label: 'Open 2-Way (8 PM – 8 AM)',
      hours: '20:00–08:00',
      description: 'Two-way traffic permitted between 8:00 PM and 8:00 AM',
    },
    policeAdvisory: 'Automatic ANPR speed & wrong-route surveillance cameras active 24/7.',
    heavyVehicleWindow: 'No heavy vehicles permitted during 06:00–22:00',
  },
  {
    id: 'mg_road_corridor',
    town: 'Kolkata',
    name: 'Mahatma Gandhi (M.G.) Road Corridor',
    keywords: ['m.g. road', 'mahatma gandhi', 'college street', 'cr avenue', 'central'],
    center: [22.5815, 88.3610],
    radiusMeters: 1200,
    accessibleWindow: 'Open 2-Way: 9:00 PM – 7:00 AM',
    avoidWindow: 'Avoid Eastbound: 7:00 AM – 9:00 PM (1-Way Westbound only)',
    suggestion: 'Open 2-way after 9 PM. Strictly westbound only towards Howrah Bridge during day.',
    dayRule: {
      type: 'one_way',
      label: 'One-Way Westbound Active',
      hours: '07:00–21:00',
      description: 'Unidirectional westbound traffic flow towards Howrah Bridge',
    },
    nightWindow: {
      type: 'open_two_way',
      label: 'Open 2-Way (9 PM – 7 AM)',
      hours: '21:00–07:00',
      description: 'Two-way traffic open from 9:00 PM to 7:00 AM',
    },
    policeAdvisory: 'No U-turns allowed. Dedicated bus/tram corridor monitored by traffic sergeants.',
    heavyVehicleWindow: 'Strict commercial no-entry 06:00 to 22:00',
  },
  {
    id: 'strand_road',
    town: 'Kolkata',
    name: 'Strand Road Riverfront Corridor',
    keywords: ['strand', 'babughat', 'fairlie', 'eden gardens', 'riverfront'],
    center: [22.5685, 88.3415],
    radiusMeters: 1500,
    accessibleWindow: 'Open 2-Way: 9:00 PM – 7:00 AM',
    avoidWindow: 'Avoid: 8 AM – 2 PM (Southbound only) / 3 PM – 9 PM (Northbound only)',
    suggestion: 'Reversible direction during day. Open standard 2-way from 9 PM to 7 AM.',
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
    id: 'kona_expressway',
    town: 'Howrah',
    name: 'Kona Expressway (NH 117 / Santragachi)',
    keywords: ['kona', 'expressway', 'santragachi', 'nh 117', 'nabanna'],
    center: [22.5650, 88.2900],
    radiusMeters: 2500,
    accessibleWindow: 'Accessible 24/7 (Two-way expressway)',
    avoidWindow: 'Avoid Peak Hours: 8:30–11:00 AM & 5:30–8:30 PM (Santragachi bottleneck)',
    suggestion: 'Open 24/7. Expect Santragachi railway bridge lane merging delays during daytime peak.',
    dayRule: {
      type: 'two_way_arterial',
      label: 'Two-Way Arterial',
      hours: '24/7',
      description: 'Major bidirectional expressway connecting to Second Hooghly Bridge',
    },
    nightWindow: {
      type: 'open_two_way',
      label: 'Open 2-Way (Commercial Window 8 PM – 8 AM)',
      hours: '20:00–08:00',
      description: 'Freight and long-distance commercial traffic peak window',
    },
    policeAdvisory: 'Santragachi railway bridge stretch has temporary lane merging. Observe police marshals.',
    heavyVehicleWindow: 'Heavy vehicle ban active 08:00–11:00 & 17:00–21:00',
  },
  {
    id: 'maa_flyover',
    town: 'Kolkata',
    name: 'Maa Flyover (AJC Bose – EM Bypass)',
    keywords: ['maa flyover', 'ajc bose', 'park circus', 'em bypass', 'science city'],
    center: [22.5410, 88.3750],
    radiusMeters: 2200,
    accessibleWindow: 'Four-Wheelers: Open 24/7 (Speed limit 50 km/h)',
    avoidWindow: 'Two-Wheelers Avoid: 10:00 PM – 6:00 AM (Police Night Ban)',
    suggestion: 'Bikes prohibited 10 PM – 6 AM (take ground road). 4-wheelers open 24/7.',
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
    town: 'Howrah / Kolkata',
    name: 'Vidyasagar Setu (2nd Hooghly Bridge)',
    keywords: ['vidyasagar', 'second hooghly', 'toll plaza', 'nabanna approach'],
    center: [22.5580, 88.3280],
    radiusMeters: 1800,
    accessibleWindow: 'Accessible 24/7 (All non-commercial vehicles)',
    avoidWindow: 'Heavy Trucks Avoid: 6:00 AM – 10:00 PM (Day truck ban)',
    suggestion: 'Open 24/7 for cars and bikes. Heavy commercial trucks only allowed 10 PM – 6 AM.',
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
        town: matchedZone.town || 'Urban Corridor',
        zoneName: matchedZone.name,
        accessibleWindow: matchedZone.accessibleWindow || 'Open 2-Way: 8:00 PM – 8:00 AM',
        avoidWindow: matchedZone.avoidWindow || 'Avoid: 8:00 AM – 8:00 PM (1-Way active)',
        suggestion: matchedZone.suggestion || 'Accessible two-way tonight.',
        policeAdvisory: matchedZone.policeAdvisory,
        badgeLabel: matchedZone.nightWindow.label || 'Open 2-Way',
        badgeColor: '#10B981', // Emerald green
        badgeBg: 'bg-emerald-50 text-emerald-800 border-emerald-200',
        timingRule: matchedZone.accessibleWindow || 'Open 2-Way: 8:00 PM – 8:00 AM',
        isOneWayNow: false,
        summary: `✓ ${matchedZone.name}: Open 2-Way (8 PM – 8 AM).`,
      }
    } else {
      // Daytime: active restriction
      const isOneWay = matchedZone.dayRule.type.includes('one_way')
      return {
        hasRestriction: true,
        isNightWindowActive: false,
        roadType: isOneWay ? 'one_way' : 'two_way_restricted',
        town: matchedZone.town || 'Urban Corridor',
        zoneName: matchedZone.name,
        accessibleWindow: matchedZone.accessibleWindow || 'Open 2-Way: 8:00 PM – 8:00 AM',
        avoidWindow: matchedZone.avoidWindow || `Avoid: ${matchedZone.dayRule.hours} (1-Way active)`,
        suggestion: matchedZone.suggestion || `Avoid during ${matchedZone.dayRule.hours} to prevent wrong-way challans.`,
        policeAdvisory: matchedZone.policeAdvisory,
        badgeLabel: isOneWay ? '⛔ 1-Way (Avoid 8 AM – 8 PM)' : '⚡ 2-Way Divided',
        badgeColor: isOneWay ? '#EF4444' : '#F59E0B',
        badgeBg: isOneWay ? 'bg-rose-50 text-rose-800 border-rose-200' : 'bg-amber-50 text-amber-800 border-amber-200',
        timingRule: matchedZone.avoidWindow || `1-Way (${matchedZone.dayRule.hours}) · 2-Way after 8 PM`,
        isOneWayNow: isOneWay,
        summary: `⚠️ ${matchedZone.name}: ${matchedZone.dayRule.label} active. Opens 2-way after 8 PM.`,
      }
    }
  }

  // Standard corridor fallback (based on route rank)
  if (route.rankLabel === 'LEAST SAFE') {
    return {
      hasRestriction: true,
      isNightWindowActive: isNightWindow,
      roadType: isNightWindow ? 'two_way' : 'variable_direction',
      town: 'Howrah / Kolkata',
      zoneName: 'Local Urban Shortcuts',
      accessibleWindow: 'Open 2-Way: 8:00 PM – 8:00 AM',
      avoidWindow: 'Avoid: 8:00 AM – 8:00 PM (Side-street one-way rules apply)',
      suggestion: 'Check municipal road entrance signboards to avoid wrong-way police challans.',
      policeAdvisory: 'Traffic police mobile patrol active. Avoid entering no-entry alleys.',
      badgeLabel: isNightWindow ? '🌙 Night 2-Way' : '⚠️ Check 1-Way Signs',
      badgeColor: isNightWindow ? '#10B981' : '#F97316',
      badgeBg: isNightWindow ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-orange-50 text-orange-800 border-orange-200',
      timingRule: isNightWindow ? 'Open 2-way until 8:00 AM' : 'Side streets: 1-way daytime · 2-way after 8 PM',
      isOneWayNow: !isNightWindow,
      summary: isNightWindow
        ? '✓ Night window active: two-way movement allowed.'
        : '⚠️ Side-street one-way rules active.',
    }
  }

  return {
    hasRestriction: false,
    isNightWindowActive: isNightWindow,
    roadType: 'two_way',
    town: 'Primary Arterial',
    zoneName: 'Main Arterial Highway',
    accessibleWindow: 'Accessible 24/7 (Two-way road)',
    avoidWindow: 'Avoid Peak Rush: 8:30–11:00 AM & 5:00–8:30 PM (Heavy congestion)',
    suggestion: 'Accessible 24/7. Maintain lane speed and traffic signal compliance.',
    policeAdvisory: 'Standard traffic police patrol and signal rules apply.',
    badgeLabel: '✓ Two-Way Road',
    badgeColor: '#10B981',
    badgeBg: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    timingRule: 'Standard 2-way road open 24/7',
    isOneWayNow: false,
    summary: '✓ Standard two-way corridor open 24/7.',
  }
}
