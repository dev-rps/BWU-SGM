import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, Marker, Circle, Popup } from 'react-leaflet'
import L from 'leaflet'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../../context/store'
import { calculateSafetyScore, getScoreLabel } from '../../services/safetyScore'
import { formatNearbyDistance } from '../../services/overpass'
import { NEARBY_CATEGORIES } from '../../constants'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

const createColorIcon = (color, icon) => L.divIcon({
  html: `<div style="width:34px;height:34px;border-radius:50%;background:white;border:2.5px solid ${color};display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.15);">
    <span class="material-symbols-outlined icon-filled" style="color:${color};font-size:16px;">${icon}</span>
  </div>`,
  className: '', iconSize: [34, 34], iconAnchor: [17, 17], popupAnchor: [0, -20],
})

const AMENITY_CFG = {
  hospital: { color: '#EF4444', icon: 'local_hospital' },
  police: { color: '#004ac6', icon: 'local_police' },
  fire_station: { color: '#F59E0B', icon: 'local_fire_department' },
  pharmacy: { color: '#10B981', icon: 'local_pharmacy' },
  fuel: { color: '#737686', icon: 'local_gas_station' },
}

export default function SafetyPage() {
  const navigate = useNavigate()
  const { userLocation, nearbyPlaces, safetyScore, reports } = useAppStore()
  const [activeFilter, setActiveFilter] = useState('all')

  const scoreInfo = getScoreLabel(safetyScore)

  const filters = [
    { id: 'all', label: 'All', icon: 'apps' },
    { id: 'hospital', label: 'Hospital', icon: 'local_hospital' },
    { id: 'police', label: 'Police', icon: 'local_police' },
    { id: 'fire_station', label: 'Fire', icon: 'local_fire_department' },
    { id: 'pharmacy', label: 'Pharmacy', icon: 'local_pharmacy' },
  ]

  const filtered = activeFilter === 'all'
    ? nearbyPlaces
    : nearbyPlaces.filter(p => p.amenity === activeFilter)

  const safetyFactors = [
    { label: 'Hospitals Nearby', value: nearbyPlaces.filter(p => p.amenity === 'hospital').length, icon: 'local_hospital', color: '#EF4444' },
    { label: 'Police Stations', value: nearbyPlaces.filter(p => p.amenity === 'police').length, icon: 'local_police', color: '#004ac6' },
    { label: 'Pharmacies', value: nearbyPlaces.filter(p => p.amenity === 'pharmacy').length, icon: 'local_pharmacy', color: '#10B981' },
    { label: 'Active Reports', value: reports.length, icon: 'flag', color: '#F59E0B' },
  ]

  return (
    <div className="relative w-full h-full flex flex-col bg-[#f7f9fb] overflow-hidden animate-fade-in">
      {/* MAP mini view */}
      <div className="h-52 relative flex-shrink-0">
        <MapContainer
          center={[userLocation.lat, userLocation.lng]}
          zoom={13}
          style={{ height: '100%', width: '100%', zIndex: 0 }}
          zoomControl={false}
          attributionControl={false}
        >
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <Circle
            center={[userLocation.lat, userLocation.lng]}
            radius={2000}
            pathOptions={{ color: '#004ac6', fillColor: '#004ac6', fillOpacity: 0.06, weight: 1, opacity: 0.4 }}
          />
          {filtered.map(p => {
            const cfg = AMENITY_CFG[p.amenity] || { color: '#737686', icon: 'place' }
            return (
              <Marker key={p.id} position={[p.lat, p.lng]} icon={createColorIcon(cfg.color, cfg.icon)}>
                <Popup><div className="text-xs font-semibold">{p.name}</div></Popup>
              </Marker>
            )
          })}
        </MapContainer>
        {/* Overlay title */}
        <div className="absolute top-3 left-3 z-20 glass-panel px-3 py-1.5 rounded-full flex items-center gap-2">
          <span className="material-symbols-outlined text-[#004ac6] icon-filled text-[16px]">security</span>
          <span className="text-xs font-bold text-[#191c1e]">Safety Analysis</span>
        </div>
      </div>

      {/* Content scroll */}
      <div className="flex-1 overflow-y-auto custom-scrollbar px-4 pt-4 pb-2">
        {/* Safety Score Banner */}
        <div
          className="rounded-2xl p-4 mb-4 flex items-center gap-4"
          style={{ background: `linear-gradient(135deg, ${scoreInfo.color}18, ${scoreInfo.color}08)`, border: `1.5px solid ${scoreInfo.color}30` }}
        >
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center flex-shrink-0"
            style={{ background: scoreInfo.color + '20' }}
          >
            <span className="text-3xl font-black" style={{ color: scoreInfo.color }}>{safetyScore}</span>
          </div>
          <div>
            <p className="text-xs font-bold text-[#737686] uppercase tracking-wider">Area Safety Score</p>
            <p className="text-xl font-black text-[#191c1e]" style={{ color: scoreInfo.color }}>{scoreInfo.label}</p>
            <p className="text-xs text-[#737686] mt-0.5">Based on {nearbyPlaces.length} nearby facilities</p>
          </div>
        </div>

        {/* Factors grid */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          {safetyFactors.map(f => (
            <div key={f.label} className="glass-panel rounded-2xl p-3.5 border border-white/30">
              <span className="material-symbols-outlined icon-filled text-[22px]" style={{ color: f.color }}>{f.icon}</span>
              <p className="text-2xl font-black text-[#191c1e] mt-1">{f.value}</p>
              <p className="text-[10px] font-bold text-[#737686] uppercase tracking-wider">{f.label}</p>
            </div>
          ))}
        </div>

        {/* Filter chips */}
        <div className="flex gap-2 overflow-x-auto pb-2 mb-3 custom-scrollbar">
          {filters.map(f => (
            <button
              key={f.id}
              onClick={() => setActiveFilter(f.id)}
              className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all active:scale-90 ${
                activeFilter === f.id
                  ? 'bg-[#004ac6] text-white shadow-lg shadow-blue-300/30'
                  : 'bg-white text-[#434655] border border-[#c3c6d7]'
              }`}
            >
              <span className="material-symbols-outlined icon-filled text-[14px]">{f.icon}</span>
              {f.label}
            </button>
          ))}
        </div>

        {/* Nearby list */}
        <p className="text-xs font-bold text-[#737686] uppercase tracking-wider mb-3">
          {filtered.length} Safe Places Nearby
        </p>
        <div className="space-y-2 pb-4">
          {filtered.length === 0 ? (
            <div className="text-center py-8">
              <span className="material-symbols-outlined text-[#c3c6d7] text-[48px]">location_searching</span>
              <p className="text-sm text-[#737686] mt-2">No places found. Loading from Overpass API...</p>
            </div>
          ) : filtered.map(p => {
            const cfg = AMENITY_CFG[p.amenity] || { color: '#737686', icon: 'place' }
            return (
              <div key={p.id} className="flex items-center gap-3 p-3.5 bg-white rounded-2xl border border-[#eceef0] shadow-sm">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: cfg.color + '15' }}>
                  <span className="material-symbols-outlined icon-filled text-[22px]" style={{ color: cfg.color }}>{cfg.icon}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[#191c1e] truncate">{p.name}</p>
                  <p className="text-xs text-[#737686] capitalize">{p.amenity?.replace('_', ' ')}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-bold text-[#191c1e]">{formatNearbyDistance(p.distance)}</p>
                  <p className="text-[9px] text-[#737686] uppercase">away</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
