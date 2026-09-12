// src/services/nominatim.js
// TomTom Search API with proximity bias & English localization, falling back to OSM Nominatim
import { getTomTomKey } from './apiKeys.js'

const TOMTOM_BASE = 'https://api.tomtom.com/search/2'

export async function searchPlaces(query, lat, lng) {
  if (!query || query.trim().length < 2) return []

  const key = getTomTomKey()
  if (!key) {
    return searchOSMNominatim(query, lat, lng)
  }

  try {
    const paramsObj = {
      key,
      limit: '15',
      countrySet: 'IN', // bias to India
      language: 'en-GB', // TomTom uses 'en-GB' or 'en-US' (en-IN is not supported and returns 400)
      typeahead: 'true', // Enables real-time autocomplete as user types characters
    }

    // If user coordinates provided, apply soft proximity bias (WITHOUT hard circular radius fencing)
    // This prioritizes nearby destinations while ensuring destinations in other cities/districts still show up!
    if (lat != null && lng != null && isFinite(lat) && isFinite(lng)) {
      paramsObj.lat = String(lat)
      paramsObj.lon = String(lng)
    }

    const params = new URLSearchParams(paramsObj)
    const res = await fetch(`${TOMTOM_BASE}/search/${encodeURIComponent(query)}.json?${params}`, {
      signal: AbortSignal.timeout(4000)
    })
    if (!res.ok) throw new Error(`TomTom search status ${res.status}`)
    
    const data = await res.json()
    const rawResults = data.results || []

    const seen = new Set()
    const mapped = []

    for (const item of rawResults) {
      const poiName = item.poi?.name
      const street = item.address?.streetName
      const freeform = item.address?.freeformAddress || ''
      const name = poiName || street || freeform || query
      const displayName = name === freeform || !freeform ? name : `${name}, ${freeform}`
      
      // Deduplicate identical names and close coordinates
      const dedupKey = `${name.toLowerCase()}_${item.position.lat.toFixed(3)}_${item.position.lon.toFixed(3)}`
      if (seen.has(dedupKey)) continue
      seen.add(dedupKey)

      mapped.push({
        id: item.id || `tt_${Math.random()}`,
        name: name,
        displayName: displayName,
        lat: item.position.lat,
        lng: item.position.lon,
        type: item.type, // POI, Street, Geography
        address: item.address,
        state: item.address?.countrySubdivision || '',
      })
    }

    // If TomTom returned very few results (< 3), supplement with OSM Nominatim in the background
    if (mapped.length < 3) {
      try {
        const osmResults = await searchOSMNominatim(query, lat, lng)
        for (const osm of osmResults) {
          const dedupKey = `${osm.name.toLowerCase()}_${osm.lat.toFixed(3)}_${osm.lng.toFixed(3)}`
          if (!seen.has(dedupKey)) {
            seen.add(dedupKey)
            mapped.push(osm)
          }
        }
      } catch {
        // Safe to ignore supplement error
      }
    }

    return mapped
  } catch (err) {
    console.warn('[Search] TomTom search fallback to OSM Nominatim:', err.message)
    return searchOSMNominatim(query, lat, lng)
  }
}

async function searchOSMNominatim(query, lat, lng) {
  try {
    const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org'
    const paramsObj = {
      q: `${query}, India`,
      format: 'json',
      limit: '10',
      countrycodes: 'in',
      'accept-language': 'en', // Strictly enforce English place names, preventing Bengali/regional script
    }

    if (lat != null && lng != null && isFinite(lat) && isFinite(lng)) {
      paramsObj.viewbox = `${lng - 0.5},${lat + 0.5},${lng + 0.5},${lat - 0.5}`
      paramsObj.bounded = '0'
    }

    const params = new URLSearchParams(paramsObj)
    const res = await fetch(`${NOMINATIM_BASE}/search?${params}`, {
      headers: {
        'User-Agent': 'SafetyGuardianMap/1.0 (contact: info@safetyguardian.app)',
        'Accept-Language': 'en',
      },
      signal: AbortSignal.timeout(4000)
    })
    if (!res.ok) return []
    const data = await res.json()
    if (!Array.isArray(data)) return []

    return data.map(item => ({
      id: item.place_id,
      name: item.display_name?.split(',')[0]?.trim() || query,
      displayName: item.display_name,
      lat: parseFloat(item.lat),
      lng: parseFloat(item.lon),
      type: item.type,
      state: item.address?.state || '',
    }))
  } catch {
    return []
  }
}

export async function reverseGeocode(lat, lng) {
  try {
    const key = getTomTomKey()
    if (!key) throw new Error('No TomTom Key')
    const params = new URLSearchParams({ key, language: 'en-GB' })
    const res = await fetch(`${TOMTOM_BASE}/reverseGeocode/${lat},${lng}.json?${params}`)
    if (!res.ok) throw new Error('TomTom reverse error')
    const data = await res.json()
    return data
  } catch {
    try {
      const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org'
      const params = new URLSearchParams({ lat, lon: lng, format: 'json', 'accept-language': 'en' })
      const res = await fetch(`${NOMINATIM_BASE}/reverse?${params}`, {
        headers: {
          'User-Agent': 'SafetyGuardianMap/1.0',
          'Accept-Language': 'en',
        }
      })
      return res.json()
    } catch {
      return null
    }
  }
}
