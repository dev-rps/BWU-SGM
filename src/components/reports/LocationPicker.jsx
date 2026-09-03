/**
 * LocationPicker.jsx
 *
 * Three-tab location selection widget used inside the report form.
 *   Tab 0 – GPS       : auto-detect user GPS, place marker
 *   Tab 1 – Search    : Nominatim text search → zoom map → draggable marker
 *   Tab 2 – Drop Pin  : tap map to place marker, drag to adjust
 *
 * Props:
 *   onLocationSelect({ lat, lng, name, address }) — called on "Confirm"
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet'
import L from 'leaflet'
import { useAppStore } from '../../context/store'
import { searchPlaces } from '../../services/nominatim'
import { getReverseGeocode } from '../../services/reportService'

// Fix Leaflet icon paths (already done in app but safe to repeat per component)
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

// Red draggable pin icon
const PIN_ICON = L.divIcon({
  html: `<div style="display:flex;align-items:flex-end;justify-content:center;width:32px;height:44px;filter:drop-shadow(0 3px 6px rgba(0,0,0,0.35));">
    <span class="material-symbols-outlined icon-filled" style="color:#EF4444;font-size:42px;line-height:1;">location_on</span>
  </div>`,
  className:  '',
  iconSize:   [32, 44],
  iconAnchor: [16, 44],
})

// ─── Inner: handle map tap for Pin tab ───────────────────────────────────────
function MapClickHandler({ enabled, onMapClick }) {
  useMapEvents({
    click: (e) => { if (enabled) onMapClick(e.latlng) },
  })
  return null
}

// ─── Inner: fly map to a target programmatically ─────────────────────────────
function MapFlyTo({ target }) {
  const map = useMap()
  useEffect(() => {
    if (target?.lat && target?.lng) {
      map.flyTo([target.lat, target.lng], target.zoom || 15, { duration: 0.8 })
    }
  }, [target, map])
  return null
}

// ─── Tabs config ─────────────────────────────────────────────────────────────
const TABS = [
  { id: 'gps',    icon: 'my_location',  label: 'GPS' },
  { id: 'search', icon: 'search',       label: 'Search' },
  { id: 'pin',    icon: 'location_on',  label: 'Drop Pin' },
]

// ─── Main Component ───────────────────────────────────────────────────────────
export default function LocationPicker({ onLocationSelect }) {
  const { userLocation } = useAppStore()

  const [tab,          setTab]          = useState('gps')
  const [markerPos,    setMarkerPos]    = useState(null)
  const [flyTarget,    setFlyTarget]    = useState(null)
  const [locationInfo, setLocationInfo] = useState(null)
  const [loadingGeo,   setLoadingGeo]   = useState(false)

  // Search tab state
  const [searchQuery,   setSearchQuery]   = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [showResults,   setShowResults]   = useState(false)
  const debounceRef = useRef(null)

  const mapCenter = [userLocation?.lat || 22.6186, userLocation?.lng || 88.4746]

  // ── Reverse geocode helper ────────────────────────────────────────────────
  const loadGeoInfo = useCallback(async (lat, lng) => {
    setLoadingGeo(true)
    try {
      const info = await getReverseGeocode(lat, lng)
      setLocationInfo(info)
    } finally {
      setLoadingGeo(false)
    }
  }, [])

  // ── GPS tab: auto-load GPS location ──────────────────────────────────────
  useEffect(() => {
    if (tab === 'gps' && userLocation?.lat) {
      const pos = { lat: userLocation.lat, lng: userLocation.lng }
      setMarkerPos(pos)
      setFlyTarget({ ...pos, zoom: 15 })
      loadGeoInfo(pos.lat, pos.lng)
    }
  }, [tab, userLocation, loadGeoInfo])

  // ── Tab change ────────────────────────────────────────────────────────────
  const handleTabChange = (newTab) => {
    setTab(newTab)
    setMarkerPos(null)
    setLocationInfo(null)
    setFlyTarget(null)
    setSearchQuery('')
    setSearchResults([])
    setShowResults(false)
  }

  // ── Map click (Pin tab) ───────────────────────────────────────────────────
  const handleMapClick = useCallback((latlng) => {
    const pos = { lat: latlng.lat, lng: latlng.lng }
    setMarkerPos(pos)
    loadGeoInfo(pos.lat, pos.lng)
  }, [loadGeoInfo])

  // ── Marker drag end ───────────────────────────────────────────────────────
  const handleMarkerDrag = useCallback((e) => {
    const ll  = e.target.getLatLng()
    const pos = { lat: ll.lat, lng: ll.lng }
    setMarkerPos(pos)
    loadGeoInfo(pos.lat, pos.lng)
  }, [loadGeoInfo])

  // ── Nominatim search ──────────────────────────────────────────────────────
  const handleSearch = (val) => {
    setSearchQuery(val)
    clearTimeout(debounceRef.current)
    if (!val.trim()) { setSearchResults([]); setShowResults(false); return }
    debounceRef.current = setTimeout(async () => {
      try {
        const results = await searchPlaces(val)
        setSearchResults(results)
        setShowResults(results.length > 0)
      } catch { setSearchResults([]) }
    }, 400)
  }

  const handleSelectResult = (place) => {
    const pos = { lat: place.lat, lng: place.lng }
    setMarkerPos(pos)
    setFlyTarget({ ...pos, zoom: 16 })
    setSearchQuery(place.name)
    setShowResults(false)
    setLocationInfo({ name: place.name, address: place.displayName || place.name })
  }

  // ── Confirm ───────────────────────────────────────────────────────────────
  const handleConfirm = () => {
    if (!markerPos || !locationInfo) return
    onLocationSelect({
      lat:     markerPos.lat,
      lng:     markerPos.lng,
      name:    locationInfo.name,
      address: locationInfo.address,
    })
  }

  return (
    <div className="flex flex-col gap-3">

      {/* ── Tab selector ─────────────────────────────────────────────────── */}
      <div className="flex bg-[#f2f4f6] rounded-xl p-1 gap-1">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => handleTabChange(t.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition-all active:scale-95 ${
              tab === t.id
                ? 'bg-white text-[#004ac6] shadow-sm'
                : 'text-[#737686]'
            }`}
          >
            <span className="material-symbols-outlined icon-filled" style={{ fontSize: '14px' }}>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Search input (Search tab) ─────────────────────────────────────── */}
      {tab === 'search' && (
        <div className="relative">
          <div className="flex items-center gap-2 bg-[#f2f4f6] rounded-xl px-3 py-2.5">
            <span className="material-symbols-outlined text-[#004ac6]" style={{ fontSize: '18px' }}>search</span>
            <input
              type="text"
              value={searchQuery}
              onChange={e => handleSearch(e.target.value)}
              placeholder="Brainware University, Park Street, Howrah Station…"
              className="flex-1 bg-transparent outline-none text-sm text-[#191c1e] placeholder:text-[#737686]"
              autoFocus
            />
            {searchQuery && (
              <button onClick={() => { setSearchQuery(''); setSearchResults([]); setShowResults(false) }}>
                <span className="material-symbols-outlined text-[#737686]" style={{ fontSize: '16px' }}>close</span>
              </button>
            )}
          </div>
          {showResults && (
            <div className="mt-2 bg-white rounded-xl border border-[#eceef0] max-h-48 overflow-y-auto custom-scrollbar">
              {searchResults.map(r => (
                <button key={r.id} onClick={() => handleSelectResult(r)}
                  className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-[#f7f9fb] text-left border-b border-[#eceef0] last:border-0 active:bg-[#f2f4f6]">
                  <span className="material-symbols-outlined text-[#004ac6]" style={{ fontSize: '16px' }}>place</span>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-[#191c1e] truncate">{r.name}</p>
                    <p className="text-[10px] text-[#737686] truncate">{r.displayName}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Pin instruction banner ────────────────────────────────────────── */}
      {tab === 'pin' && (
        <div className="flex items-center gap-2 bg-[#004ac6]/8 rounded-xl px-3 py-2 border border-[#004ac6]/15">
          <span className="material-symbols-outlined text-[#004ac6] icon-filled" style={{ fontSize: '16px' }}>touch_app</span>
          <p className="text-xs font-semibold text-[#004ac6]">
            Tap anywhere on the map to drop a pin. Drag to fine-tune the position.
          </p>
        </div>
      )}

      {/* ── Mini Map ─────────────────────────────────────────────────────── */}
      <div className="rounded-2xl overflow-hidden border border-[#eceef0] shadow-sm" style={{ height: '280px' }}>
        <MapContainer
          center={mapCenter}
          zoom={14}
          style={{ height: '100%', width: '100%' }}
          zoomControl={false}
          attributionControl={false}
        >
          <TileLayer url="https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}" />
          <MapFlyTo target={flyTarget} />
          <MapClickHandler enabled={tab === 'pin'} onMapClick={handleMapClick} />
          {markerPos && (
            <Marker
              position={[markerPos.lat, markerPos.lng]}
              icon={PIN_ICON}
              draggable
              eventHandlers={{ dragend: handleMarkerDrag }}
            />
          )}
        </MapContainer>
      </div>

      {/* ── Selected location info ────────────────────────────────────────── */}
      {locationInfo ? (
        <div className="bg-[#004ac6]/5 rounded-xl p-3 flex items-start gap-2.5 animate-fade-in border border-[#004ac6]/10">
          <div className="w-7 h-7 rounded-full bg-[#004ac6]/15 flex items-center justify-center flex-shrink-0 mt-0.5">
            <span className="material-symbols-outlined text-[#004ac6] icon-filled" style={{ fontSize: '14px' }}>location_on</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-[#191c1e] truncate">{locationInfo.name}</p>
            <p className="text-[10px] text-[#737686] mt-0.5 line-clamp-2 leading-relaxed">{locationInfo.address}</p>
            {markerPos && (
              <p className="text-[9px] text-[#737686]/70 mt-1 font-mono">
                {markerPos.lat.toFixed(5)}, {markerPos.lng.toFixed(5)}
              </p>
            )}
          </div>
          {loadingGeo && (
            <span className="material-symbols-outlined text-[#737686] animate-spin flex-shrink-0 mt-0.5" style={{ fontSize: '16px' }}>refresh</span>
          )}
        </div>
      ) : (
        <div className="bg-[#f2f4f6] rounded-xl p-3 text-center">
          <p className="text-xs text-[#737686]">
            {tab === 'gps'    ? 'Detecting your GPS location…'
           : tab === 'search' ? 'Search for a place to see it on the map'
                              : 'Tap the map above to drop a pin'}
          </p>
        </div>
      )}

      {/* ── Confirm button ────────────────────────────────────────────────── */}
      <button
        onClick={handleConfirm}
        disabled={!markerPos || !locationInfo || loadingGeo}
        className="w-full h-12 rounded-xl bg-[#004ac6] text-white font-bold flex items-center justify-center gap-2 disabled:opacity-40 active:scale-95 transition-all"
      >
        <span className="material-symbols-outlined icon-filled" style={{ fontSize: '18px' }}>check_circle</span>
        Confirm This Location
      </button>

    </div>
  )
}
