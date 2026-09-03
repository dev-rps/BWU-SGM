// OSRM Routing API — free, no key needed
// Profiles: driving | walking (foot) | cycling (bike)
const OSRM_BASE = 'https://router.project-osrm.org/route/v1'

// Walking/cycling time multipliers (OSRM only has driving profile publicly)
const MODE_MULTIPLIERS = {
  driving: 1,
  walking: 4.2,   // walking ~4x slower than driving
  cycling: 2.1,   // cycling ~2x slower than driving
}

const MODE_LABELS = {
  driving: { label: 'Drive', icon: 'directions_car', color: '#004ac6', speed: '40 km/h avg' },
  walking: { label: 'Walk', icon: 'directions_walk', color: '#10B981', speed: '5 km/h avg' },
  cycling: { label: 'Cycle', icon: 'directions_bike', color: '#F59E0B', speed: '15 km/h avg' },
}

export { MODE_LABELS }

export async function getRoute(fromLat, fromLng, toLat, toLng, mode = 'driving') {
  const profile = 'driving' // OSRM public server only has driving; we adjust time for other modes
  const coords = `${fromLng},${fromLat};${toLng},${toLat}`
  const params = new URLSearchParams({
    overview: 'full',
    geometries: 'geojson',
    steps: true,
    alternatives: true,
    annotations: false,
  })

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 10000)

  const res = await fetch(`${OSRM_BASE}/${profile}/${coords}?${params}`, {
    signal: controller.signal
  })

  clearTimeout(timeoutId)
  if (!res.ok) throw new Error('OSRM routing error')
  const data = await res.json()

  if (data.code !== 'Ok' || !data.routes?.length) throw new Error('No route found')

  const multiplier = MODE_MULTIPLIERS[mode] || 1

  return data.routes.map((route, idx) => {
    const adjustedDuration = route.duration * multiplier
    const steps = route.legs?.[0]?.steps?.map(s => ({
      instruction: s.maneuver?.instruction || formatInstruction(s),
      distance: s.distance,
      duration: s.duration * multiplier,
      type: s.maneuver?.type || 'straight',
      modifier: s.maneuver?.modifier || '',
      icon: getStepIcon(s.maneuver?.type, s.maneuver?.modifier),
    })) || []

    return {
      index: idx,
      geometry: route.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
      distance: route.distance,
      duration: adjustedDuration,
      distanceKm: (route.distance / 1000).toFixed(1),
      durationMin: Math.round(adjustedDuration / 60),
      steps,
      mode,
    }
  })
}

function formatInstruction(step) {
  const type = step.maneuver?.type || 'straight'
  const mod = step.maneuver?.modifier || ''
  const name = step.name || 'the road'
  if (type === 'turn') return `Turn ${mod} onto ${name}`
  if (type === 'depart') return `Head ${mod} on ${name}`
  if (type === 'arrive') return `Arrive at destination`
  if (type === 'roundabout') return `Take the roundabout`
  return `Continue on ${name}`
}

function getStepIcon(type, modifier) {
  if (type === 'arrive') return 'flag'
  if (type === 'depart') return 'my_location'
  if (type === 'roundabout' || type === 'rotary') return 'roundabout_right'
  if (modifier === 'left' || modifier === 'sharp left' || modifier === 'slight left') return 'turn_left'
  if (modifier === 'right' || modifier === 'sharp right' || modifier === 'slight right') return 'turn_right'
  if (modifier === 'uturn') return 'u_turn_left'
  return 'straight'
}

export function formatDistance(meters) {
  if (meters < 1000) return `${Math.round(meters)} m`
  return `${(meters / 1000).toFixed(1)} km`
}

export function formatDuration(seconds) {
  const mins = Math.round(seconds / 60)
  if (mins < 60) return `${mins} min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}
