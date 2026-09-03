// Overpass API & TomTom API — Real-Time POI Fetching
const OVERPASS_BASE = 'https://overpass-api.de/api/interpreter'

export async function fetchNearbyPlaces(lat, lng, radiusMeters = 2000, categories = []) {
  const categoryFilters = categories.length
    ? categories.map(c => `node[${c}](around:${radiusMeters},${lat},${lng});`).join('\n')
    : `
      node[amenity=hospital](around:${radiusMeters},${lat},${lng});
      node[amenity=police](around:${radiusMeters},${lat},${lng});
      node[amenity=fire_station](around:${radiusMeters},${lat},${lng});
      node[amenity=pharmacy](around:${radiusMeters},${lat},${lng});
      node[amenity=fuel](around:${radiusMeters},${lat},${lng});
      node[shop](around:${radiusMeters},${lat},${lng});
      node[amenity=bank](around:${radiusMeters},${lat},${lng});
      node[amenity=restaurant](around:${radiusMeters},${lat},${lng});
    `

  const query = `[out:json][timeout:15];
(
  ${categoryFilters}
);
out body;`

  const res = await fetch(OVERPASS_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(query)}`,
  })
  
  if (!res.ok) throw new Error('Overpass API error')
  const data = await res.json()
  
  return (data.elements || [])
    .filter(el => el.tags && el.tags.name && el.tags.name !== 'Unnamed')
    .map(el => ({
      id: el.id,
      lat: el.lat,
      lng: el.lon,
      name: el.tags.name,
      amenity: el.tags.amenity || (el.tags.shop ? 'shop' : 'building'),
      tags: el.tags,
      distance: haversineDistance(lat, lng, el.lat, el.lon),
    }))
    .sort((a, b) => a.distance - b.distance)
}

export async function fetchRealtimeNearbyPOIs(lat, lng, radiusMeters = 2500) {
  const TOMTOM_KEY = import.meta.env.VITE_TOMTOM_API_KEY

  // 1. Try TomTom Nearby Search API
  if (TOMTOM_KEY) {
    try {
      const params = new URLSearchParams({
        key: TOMTOM_KEY,
        lat: lat,
        lon: lng,
        radius: radiusMeters,
        limit: 25,
        language: 'en-IN'
      })
      const res = await fetch(`https://api.tomtom.com/search/2/nearbySearch/.json?${params}`)
      if (res.ok) {
        const data = await res.json()
        if (data.results && data.results.length > 0) {
          const pois = data.results
            .filter(item => item.poi && item.poi.name && item.position?.lat && item.position?.lon)
            .map(item => {
              const cat = (item.poi.categories?.[0] || '').toLowerCase()
              const name = item.poi.name
              let amenity = 'shop'
              if (cat.includes('hospital') || cat.includes('medical') || cat.includes('doctor')) amenity = 'hospital'
              else if (cat.includes('pharmacy') || cat.includes('chemist') || cat.includes('drug')) amenity = 'pharmacy'
              else if (cat.includes('police')) amenity = 'police'
              else if (cat.includes('petrol') || cat.includes('gas') || cat.includes('fuel')) amenity = 'fuel'
              else if (cat.includes('bank') || cat.includes('atm')) amenity = 'bank'
              else if (cat.includes('school') || cat.includes('college') || cat.includes('university')) amenity = 'school'
              else if (cat.includes('restaurant') || cat.includes('food') || cat.includes('cafe')) amenity = 'restaurant'

              return {
                id: item.id || `tt-${item.position.lat}-${item.position.lon}`,
                lat: item.position.lat,
                lng: item.position.lon,
                name: name,
                amenity: amenity,
                category: item.poi.categories?.[0] || 'Point of Interest',
                address: item.address?.freeformAddress || ''
              }
            })

          if (pois.length > 0) return pois
        }
      }
    } catch (err) {
      console.warn('[TomTom NearbySearch] Failed, falling back to Overpass API:', err)
    }
  }

  // 2. Overpass API fallback (Real-time OpenStreetMap POIs)
  try {
    return await fetchNearbyPlaces(lat, lng, radiusMeters)
  } catch (err) {
    console.warn('[Overpass API] Failed:', err)
    return []
  }
}

function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371e3
  const p1 = lat1 * Math.PI / 180
  const p2 = lat2 * Math.PI / 180
  const dp = (lat2 - lat1) * Math.PI / 180
  const dl = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function formatNearbyDistance(meters) {
  if (meters < 1000) return `${Math.round(meters)} m`
  return `${(meters / 1000).toFixed(1)} km`
}
