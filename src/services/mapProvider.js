/**
 * src/services/mapProvider.js
 * 
 * Centralized Map Tile Provider & Resilient Fallback Engine
 * 
 * Provides:
 *   1. Primary Google Maps raster tiles (with mt0-mt3 subdomain balancing).
 *   2. Secondary OpenStreetMap / CartoDB Voyager fallback tiles.
 *   3. Global error detection & automatic fallback switching with generous error threshold.
 *   4. Subscribable status for UI indicators (Google Maps active vs OSM fallback).
 */

// Google Maps Raster Tile URLs (Standard Roadmap lyrs=m)
export const GOOGLE_MAPS_TILES = [
  'https://mt0.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
  'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
  'https://mt2.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
  'https://mt3.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
]

// Fallback OpenStreetMap / CartoDB Tiles
export const FALLBACK_OSM_TILES = [
  'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
  'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
  'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png',
]

export const FALLBACK_CARTODB_VOYAGER = [
  'https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
  'https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
  'https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
]

// Default Leaflet TileLayer URL template
export const GOOGLE_TILE_LEAFLET_URL = 'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}'
export const FALLBACK_TILE_LEAFLET_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'

// Tile Provider State
class MapProviderState {
  constructor() {
    this.isGoogleFailed = false
    this.errorCount = 0
    this.maxErrorsBeforeFallback = 15
    this.listeners = new Set()
  }

  recordTileError(source = 'google') {
    if (this.isGoogleFailed) return
    this.errorCount++
    if (this.errorCount >= this.maxErrorsBeforeFallback) {
      console.warn(`[MapProvider] Google Maps tile threshold exceeded (${this.errorCount} errors). Switching to Leaflet/OSM fallback.`)
      this.isGoogleFailed = true
      this.notify()
    }
  }

  forceFallback(useFallback = true) {
    this.isGoogleFailed = useFallback
    this.errorCount = 0
    this.notify()
  }

  reset() {
    this.isGoogleFailed = false
    this.errorCount = 0
    this.notify()
  }

  subscribe(fn) {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  notify() {
    for (const listener of this.listeners) {
      try {
        listener({
          isGoogleFailed: this.isGoogleFailed,
          activeProvider: this.isGoogleFailed ? 'osm' : 'google',
          tileUrl: this.isGoogleFailed ? FALLBACK_TILE_LEAFLET_URL : GOOGLE_TILE_LEAFLET_URL,
        })
      } catch (err) {
        console.error('[MapProvider] Listener error:', err)
      }
    }
  }

  getStatus() {
    return {
      isGoogleFailed: this.isGoogleFailed,
      activeProvider: this.isGoogleFailed ? 'osm' : 'google',
      tileUrl: this.isGoogleFailed ? FALLBACK_TILE_LEAFLET_URL : GOOGLE_TILE_LEAFLET_URL,
    }
  }

  // Generate MapLibre raster source style definition
  // Route layers are built-in, but their data is updated imperatively to avoid setStyle() wipes
  getMapLibreStyle() {
    const tiles = this.isGoogleFailed ? FALLBACK_OSM_TILES : GOOGLE_MAPS_TILES
    const attribution = this.isGoogleFailed
      ? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      : '&copy; Google Maps'

    const emptyFc = { type: 'FeatureCollection', features: [] }

    return {
      version: 8,
      sources: {
        'base-tiles': {
          type: 'raster',
          tiles: tiles,
          tileSize: 256,
          attribution: attribution,
          maxzoom: 20,
        },
        'route-source': {
          type: 'geojson',
          data: emptyFc,
        },
        'route-traversed': {
          type: 'geojson',
          data: emptyFc,
        },
      },
      layers: [
        {
          id: 'base-background',
          type: 'background',
          paint: {
            'background-color': '#eef2f6',
          },
        },
        {
          id: 'base-tiles-layer',
          type: 'raster',
          source: 'base-tiles',
          minzoom: 0,
          maxzoom: 20,
        },
        // Faded dashed trail behind the vehicle
        {
          id: 'route-traversed-line',
          type: 'line',
          source: 'route-traversed',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': '#64748b',
            'line-width': 5,
            'line-opacity': 0.3,
            'line-dasharray': [2, 3],
          },
        },
        // Active remaining route casing (dark blue border)
        {
          id: 'route-casing',
          type: 'line',
          source: 'route-source',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': '#0d47a1',
            'line-width': 13,
            'line-opacity': 0.9,
          },
        },
        // Active remaining route core (bright blue)
        {
          id: 'route-core',
          type: 'line',
          source: 'route-source',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': '#1a73e8',
            'line-width': 7.5,
            'line-opacity': 1.0,
          },
        },
      ],
    }
  }
}

export const mapProvider = new MapProviderState()
