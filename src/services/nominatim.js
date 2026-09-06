// src/services/nominatim.js
// Switched to TomTom Search API for vastly superior POI & Street Data compared to OSM
import { getTomTomKey } from './apiKeys'

const TOMTOM_BASE = 'https://api.tomtom.com/search/2'

export async function searchPlaces(query) {
  if (!query || query.trim().length < 2) return []

  const key = getTomTomKey()
  if (!key) {
    // If no TomTom key, fallback immediately to OSM Nominatim
    return searchOSMNominatim(query)
  }

  try {
    const params = new URLSearchParams({
      key,
      limit: 10,
      countrySet: 'IN', // bias to India
      language: 'en-IN'
    })

    const res = await fetch(`${TOMTOM_BASE}/search/${encodeURIComponent(query)}.json?${params}`)
    if (!res.ok) throw new Error('TomTom search error')
    
    const data = await res.json()
    if (!data.results) return []

    return data.results.map(item => {
      // Build a clean display name
      const name = item.poi ? item.poi.name : (item.address.streetName || item.address.freeformAddress)
      const sub = item.address.freeformAddress || ''
      const displayName = name === sub ? name : `${name}, ${sub}`

      return {
        id: item.id,
        name: name,
        displayName: displayName,
        lat: item.position.lat,
        lng: item.position.lon,
        type: item.type, // POI, Street, Geography
        address: item.address,
        state: item.address.countrySubdivision || '',
      }
    })
  } catch (err) {
    console.error('TomTom Search Failed, falling back to OSM:', err)
    // FALLBACK TO OSM if TomTom fails
    const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org'
    const params = new URLSearchParams({ q: query + ', India', format: 'json', limit: 10, countrycodes: 'in' })
    const res = await fetch(`${NOMINATIM_BASE}/search?${params}`)
    const data = await res.json()
    return data.map(item => ({
      id: item.place_id,
      name: item.display_name?.split(',')[0]?.trim() || query,
      displayName: item.display_name,
      lat: parseFloat(item.lat),
      lng: parseFloat(item.lon),
      type: item.type,
      state: item.address?.state || '',
    }))
  }
}

export async function reverseGeocode(lat, lng) {
  try {
    const params = new URLSearchParams({ key: TOMTOM_KEY })
    const res = await fetch(`${TOMTOM_BASE}/reverseGeocode/${lat},${lng}.json?${params}`)
    if (!res.ok) throw new Error('TomTom reverse error')
    const data = await res.json()
    return data
  } catch {
    const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org'
    const params = new URLSearchParams({ lat, lon: lng, format: 'json' })
    const res = await fetch(`${NOMINATIM_BASE}/reverse?${params}`)
    return res.json()
  }
}
