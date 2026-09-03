/**
 * ReportsPage.jsx — Google Maps-style layout (light theme)
 *
 * Fixes in this version:
 *  1. FAB (Report Hazard + SOS) rendered ONCE as fixed overlay — no duplicates,
 *     never disappears on map zoom/scroll (z-index 9999, pointer-events: auto).
 *  2. Voting is optimistic — UI updates instantly, Firestore write happens in background.
 *  3. Desktop sidebar + map layout (25% | 75%)
 *  4. Mobile: map + draggable bottom sheet
 *  5. All backend logic (Firebase, voteOnReport, submitReport) unchanged.
 */

import { useState, useMemo, useCallback, useRef } from 'react'
import {
  MapContainer, TileLayer, Marker, Popup, useMapEvents,
} from 'react-leaflet'
import L from 'leaflet'
import { useNavigate } from 'react-router-dom'
import { doc, deleteDoc } from 'firebase/firestore'
import { db, auth } from '../../firebase/firebase'

import { useAppStore }      from '../../context/store'
import {
  HAZARD_TYPES, SEVERITY_COLORS, REPORT_FILTERS,
} from '../../constants'
import { submitReport, voteOnReport } from '../../services/reportService'

import LocationPicker       from '../../components/reports/LocationPicker'
import HazardCategoryPicker from '../../components/reports/HazardCategoryPicker'
import SeverityPicker       from '../../components/reports/SeverityPicker'
import ReportDetailsForm    from '../../components/reports/ReportDetailsForm'
import ReportPreview        from '../../components/reports/ReportPreview'

// ─── Leaflet icon fix ─────────────────────────────────────────────────────────
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

const HAZARD_MAP   = Object.fromEntries(HAZARD_TYPES.map(h => [h.id, h]))
const FORM_STEPS   = ['Location', 'Hazard Type', 'Severity', 'Details', 'Preview']

// ─── Icons ────────────────────────────────────────────────────────────────────
const createHazardIcon = (color, icon) => L.divIcon({
  html: `<div style="
    width:34px;height:34px;border-radius:50%;
    background:white;border:2.5px solid ${color};
    display:flex;align-items:center;justify-content:center;
    box-shadow:0 2px 10px rgba(0,0,0,0.18);">
    <span class="material-symbols-outlined icon-filled" style="color:${color};font-size:16px;">${icon}</span>
  </div>`,
  className: '', iconSize: [34, 34], iconAnchor: [17, 17], popupAnchor: [0, -20],
})

const userIcon = L.divIcon({
  html: `<div style="width:16px;height:16px;border-radius:50%;background:#004ac6;
    border:3px solid white;box-shadow:0 0 0 5px rgba(0,74,198,0.2);"></div>`,
  className: '', iconSize: [16, 16], iconAnchor: [8, 8],
})

// ─── Helpers ──────────────────────────────────────────────────────────────────
function timeAgo(ts) {
  if (!ts) return ''
  const d = ts?.toDate ? ts.toDate() : new Date(ts)
  const m = Math.floor((Date.now() - d.getTime()) / 60000)
  if (m < 1)    return 'Just now'
  if (m < 60)   return `${m}m ago`
  if (m < 1440) return `${Math.floor(m / 60)}h ago`
  return `${Math.floor(m / 1440)}d ago`
}

function sendSOS(contacts, location) {
  const lat  = location?.lat?.toFixed(6) || ''
  const lng  = location?.lng?.toFixed(6) || ''
  const link = lat ? `https://maps.google.com/?q=${lat},${lng}` : ''
  const msg  = encodeURIComponent(`🆘 EMERGENCY: I need immediate help!\nMy location: ${link}\nPlease call me NOW.`)
  const phone = contacts?.[0]?.phone?.replace(/[\s\-()]/g, '') || ''
  window.open(phone ? `sms:${phone}?body=${msg}` : `sms:?body=${msg}`, '_self')
}

// ─── Compact Report Card (with optimistic voting) ────────────────────────────
function ReportCard({ report, isSelected, onClick }) {
  const typeId   = report.hazardType || report.type || 'other'
  const ht       = HAZARD_MAP[typeId] || { label: 'Hazard', icon: 'warning', color: '#737686' }
  const sevColor = SEVERITY_COLORS[report.severity] || '#737686'
  const loc      = report.locationName || report.location || ''
  const uid      = auth.currentUser?.uid

  // Optimistic vote state — starts from Firestore data, updates locally on click
  const [localUpvotes,   setLocalUpvotes]   = useState(() => report.upvotes   || [])
  const [localDownvotes, setLocalDownvotes] = useState(() => report.downvotes || [])
  const [voting, setVoting] = useState(false)

  const conf    = localUpvotes.length - localDownvotes.length
  const hasUp   = uid ? localUpvotes.includes(uid)   : false
  const hasDown = uid ? localDownvotes.includes(uid) : false
  const isOwner = uid && uid === report.uid

  const handleVote = async (e, type) => {
    e.stopPropagation()
    if (!uid) { alert('Please log in to vote.'); return }
    if (voting) return

    // ── Optimistic update — change UI immediately ──
    if (type === 'up') {
      if (hasUp) {
        // Un-vote
        setLocalUpvotes(prev => prev.filter(id => id !== uid))
      } else {
        setLocalUpvotes(prev => [...prev, uid])
        setLocalDownvotes(prev => prev.filter(id => id !== uid))
      }
    } else {
      if (hasDown) {
        setLocalDownvotes(prev => prev.filter(id => id !== uid))
      } else {
        setLocalDownvotes(prev => [...prev, uid])
        setLocalUpvotes(prev => prev.filter(id => id !== uid))
      }
    }

    // ── Write to Firestore in background ──
    setVoting(true)
    try {
      await voteOnReport(report.id, type)
    } catch (err) {
      console.error('Vote error:', err)
      // Revert optimistic update on failure
      setLocalUpvotes(report.upvotes   || [])
      setLocalDownvotes(report.downvotes || [])
    } finally {
      setVoting(false)
    }
  }

  const handleDelete = async (e) => {
    e.stopPropagation()
    if (!window.confirm(`Delete your "${ht.label}" report?`)) return
    try { await deleteDoc(doc(db, 'reports', report.id)) }
    catch (err) { console.error('Delete error:', err) }
  }

  return (
    <div
      onClick={onClick}
      className={`group relative flex flex-col border rounded-xl cursor-pointer transition-all duration-150 ${
        isSelected
          ? 'border-[#004ac6] bg-[#f0f5ff] shadow-md'
          : 'border-[#e8eaed] bg-white hover:border-[#004ac6]/30 hover:shadow-sm'
      }`}
    >
      {/* Info row */}
      <div className="flex items-start gap-3 p-3">
        <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
          style={{ background: ht.color + '15', border: `1.5px solid ${ht.color}30` }}>
          <span className="material-symbols-outlined icon-filled" style={{ color: ht.color, fontSize: '17px' }}>{ht.icon}</span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-sm font-bold text-[#191c1e] leading-tight">{ht.label}</p>
            {report.severity && (
              <span className="text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wide"
                style={{ color: sevColor, background: sevColor + '18' }}>
                {report.severity}
              </span>
            )}
          </div>
          {report.description && (
            <p className="text-xs text-[#737686] mt-0.5 line-clamp-1 leading-snug">{report.description}</p>
          )}
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {loc && (
              <div className="flex items-center gap-0.5">
                <span className="material-symbols-outlined text-[#737686]" style={{ fontSize: '10px' }}>location_on</span>
                <p className="text-[10px] text-[#737686] truncate max-w-[120px]">{loc}</p>
              </div>
            )}
            <p className="text-[10px] text-[#9aa0ab]">{timeAgo(report.createdAt || report.timestamp)}</p>
          </div>
        </div>

        {isOwner && (
          <button onClick={handleDelete}
            className="w-6 h-6 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 hover:bg-[#FEF2F2]">
            <span className="material-symbols-outlined text-[#EF4444]" style={{ fontSize: '14px' }}>delete</span>
          </button>
        )}
      </div>

      {/* ── Vote row — optimistic, updates instantly ── */}
      <div className="flex items-stretch border-t border-[#f0f2f5]">
        <button
          onClick={e => handleVote(e, 'up')}
          disabled={voting}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold transition-all active:scale-95 rounded-bl-xl ${
            hasUp
              ? 'text-[#10B981] bg-[#10B981]/10'
              : 'text-[#737686] hover:text-[#10B981] hover:bg-[#10B981]/05'
          }`}
        >
          <span className="material-symbols-outlined icon-filled" style={{ fontSize: '14px' }}>thumb_up</span>
          Verify
          {localUpvotes.length > 0 && (
            <span className="ml-0.5 font-black text-xs">{localUpvotes.length}</span>
          )}
        </button>

        <div className="flex flex-col items-center justify-center px-3 border-x border-[#f0f2f5] min-w-[48px]">
          <p className="text-sm font-black leading-none"
            style={{ color: conf > 0 ? '#10B981' : conf < 0 ? '#EF4444' : '#c3c6d7' }}>
            {conf >= 0 ? `+${conf}` : conf}
          </p>
          <p className="text-[8px] font-bold text-[#c3c6d7] uppercase tracking-wider">CONF.</p>
        </div>

        <button
          onClick={e => handleVote(e, 'down')}
          disabled={voting}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold transition-all active:scale-95 rounded-br-xl ${
            hasDown
              ? 'text-[#EF4444] bg-[#EF4444]/10'
              : 'text-[#737686] hover:text-[#EF4444] hover:bg-[#EF4444]/05'
          }`}
        >
          <span className="material-symbols-outlined icon-filled" style={{ fontSize: '14px' }}>thumb_down</span>
          Not there
        </button>
      </div>
    </div>
  )
}

// ─── Map Bounds Tracker ───────────────────────────────────────────────────────
function BoundsTracker({ onChange }) {
  useMapEvents({
    load:    e => onChange(e.target.getBounds()),
    moveend: e => onChange(e.target.getBounds()),
    zoomend: e => onChange(e.target.getBounds()),
  })
  return null
}

// ─── Shared Map Markers (reused for desktop + mobile maps) ───────────────────
function MapMarkers({ validReports, mapCenter, selectedId, onSelectId }) {
  return (
    <>
      <Marker position={mapCenter} icon={userIcon}>
        <Popup><p className="text-xs font-bold">📍 Your Location</p></Popup>
      </Marker>
      {validReports.map(r => {
        const lat    = r.latitude ?? r.lat
        const lng    = r.longitude ?? r.lng
        const typeId = r.hazardType || r.type || 'other'
        const ht     = HAZARD_MAP[typeId] || { icon: 'warning', color: '#737686', label: 'Hazard' }
        const color  = SEVERITY_COLORS[r.severity] || ht.color
        return (
          <Marker key={r.id} position={[lat, lng]} icon={createHazardIcon(color, ht.icon)}
            eventHandlers={{ click: () => onSelectId(r.id) }}>
            <Popup>
              <div style={{ minWidth: '150px', maxWidth: '210px' }}>
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="material-symbols-outlined icon-filled" style={{ color: ht.color, fontSize: '13px' }}>{ht.icon}</span>
                  <p className="font-bold text-xs text-[#191c1e]">{ht.label}</p>
                </div>
                {r.severity && (
                  <span className="text-[9px] font-black px-1.5 py-0.5 rounded uppercase"
                    style={{ color: SEVERITY_COLORS[r.severity], background: SEVERITY_COLORS[r.severity] + '18' }}>
                    {r.severity}
                  </span>
                )}
                {r.description && <p className="text-[10px] text-[#737686] mt-1">{r.description}</p>}
                {(r.locationName || r.location) && <p className="text-[9px] text-[#737686] mt-1">📍 {r.locationName || r.location}</p>}
              </div>
            </Popup>
          </Marker>
        )
      })}
    </>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ReportsPage() {
  const navigate = useNavigate()
  const { userLocation, reports, emergencyContacts } = useAppStore()
  const user = useAppStore(s => s.user)

  const [mapBounds,    setMapBounds]    = useState(null)
  const [selectedId,   setSelectedId]   = useState(null)
  const [activeFilter, setActiveFilter] = useState('all')
  const [sidebarOpen,  setSidebarOpen]  = useState(true)

  // Mobile bottom sheet
  const [sheetState,   setSheetState]   = useState('half') // 'peek'|'half'|'full'
  const dragStart = useRef(null)
  const SHEET_HEIGHTS = { peek: '72px', half: '44vh', full: '80vh' }

  // Form
  const [showForm,    setShowForm]    = useState(false)
  const [step,        setStep]        = useState(0)
  const [location,    setLocation]    = useState(null)
  const [category,    setCategory]    = useState(null)
  const [severity,    setSeverity]    = useState(null)
  const [description, setDescription] = useState('')
  const [imageFile,   setImageFile]   = useState(null)
  const [anonymous,   setAnonymous]   = useState(false)
  const [submitting,  setSubmitting]  = useState(false)
  const [success,     setSuccess]     = useState(false)

  const canAdvance = useMemo(() => {
    if (step === 0) return !!location
    if (step === 1) return !!category
    if (step === 2) return !!severity
    return true
  }, [step, location, category, severity])

  const validReports = useMemo(() =>
    reports.filter(r => {
      const lat = r.latitude ?? r.lat
      const lng = r.longitude ?? r.lng
      return typeof lat === 'number' && typeof lng === 'number'
    }), [reports])

  const filteredReports = useMemo(() => {
    if (activeFilter === 'all') return validReports
    if (activeFilter === 'critical') return validReports.filter(r => r.severity === 'critical')
    if (activeFilter === 'today') {
      const sod = new Date(); sod.setHours(0, 0, 0, 0)
      return validReports.filter(r => {
        const d = r.createdAt?.toDate ? r.createdAt.toDate() : new Date(r.timestamp || 0)
        return d >= sod
      })
    }
    return validReports.filter(r =>
      r.hazardCategory === activeFilter ||
      HAZARD_MAP[r.hazardType || r.type]?.category === activeFilter
    )
  }, [validReports, activeFilter])

  const resetForm = useCallback(() => {
    setStep(0); setLocation(null); setCategory(null); setSeverity(null)
    setDescription(''); setImageFile(null); setAnonymous(false)
  }, [])
  const openForm  = () => { resetForm(); setShowForm(true) }
  const closeForm = useCallback(() => { setShowForm(false); resetForm() }, [resetForm])

  const handleSubmit = async () => {
    if (!location || !category || !severity) return
    setSubmitting(true)
    try {
      await submitReport({ location, category, severity, description, imageFile, anonymous })
      setSuccess(true); closeForm()
      setTimeout(() => setSuccess(false), 4000)
    } catch { alert('Submission failed. Check your connection and try again.') }
    finally { setSubmitting(false) }
  }

  const onTouchStart = e => { dragStart.current = e.touches[0].clientY }
  const onTouchEnd   = e => {
    if (!dragStart.current) return
    const dy = e.changedTouches[0].clientY - dragStart.current
    if (dy >  60) setSheetState(s => s === 'full' ? 'half' : 'peek')
    if (dy < -60) setSheetState(s => s === 'peek' ? 'half' : 'full')
    dragStart.current = null
  }

  const mapCenter = [userLocation?.lat || 22.6186, userLocation?.lng || 88.4746]

  // Mobile sheet bottom offset for FABs
  const mobileSheetBottom = SHEET_HEIGHTS[sheetState]

  // ─── Sidebar contents (shared component) ─────────────────────────────────
  const SidebarContent = () => (
    <>
      <div className="flex-shrink-0 px-4 pt-4 pb-2 border-b border-[#f0f2f5]">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined icon-filled text-[#F59E0B]" style={{ fontSize: '17px' }}>flag</span>
            <h2 className="text-sm font-black text-[#191c1e]">{filteredReports.length} Reports</h2>
            {filteredReports.length !== validReports.length && (
              <span className="text-[10px] text-[#737686]">of {validReports.length}</span>
            )}
          </div>
          <button onClick={() => setSidebarOpen(false)}
            className="hidden md:flex lg:hidden w-7 h-7 items-center justify-center rounded-full hover:bg-[#f0f2f5] transition-colors">
            <span className="material-symbols-outlined text-[#737686]" style={{ fontSize: '16px' }}>chevron_left</span>
          </button>
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1" style={{ scrollbarWidth: 'none' }}>
          {REPORT_FILTERS.map(f => {
            const active = activeFilter === f.id
            return (
              <button key={f.id} onClick={() => setActiveFilter(f.id)}
                className={`flex-shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-semibold transition-all active:scale-95 ${
                  active ? 'bg-[#004ac6] text-white shadow-sm' : 'bg-[#f0f2f5] text-[#5f6368] hover:bg-[#e8eaed]'
                }`}>
                <span className="material-symbols-outlined icon-filled" style={{ fontSize: '11px' }}>{f.icon}</span>
                {f.label}
              </button>
            )
          })}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2" style={{ scrollbarWidth: 'thin' }}>
        {filteredReports.length === 0 ? (
          <div className="text-center py-10">
            <span className="material-symbols-outlined text-[#c3c6d7]" style={{ fontSize: '44px' }}>flag</span>
            <p className="text-sm font-semibold text-[#737686] mt-2">No reports found</p>
            <button onClick={openForm}
              className="mt-3 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold text-white mx-auto bg-[#004ac6] hover:bg-[#003da8] active:scale-95 transition-all">
              <span className="material-symbols-outlined icon-filled" style={{ fontSize: '13px' }}>add</span>
              Add Report
            </button>
          </div>
        ) : (
          filteredReports.map(r => (
            <ReportCard key={r.id} report={r}
              isSelected={r.id === selectedId}
              onClick={() => setSelectedId(r.id === selectedId ? null : r.id)} />
          ))
        )}
      </div>
    </>
  )

  return (
    <div className="relative w-full h-full overflow-hidden bg-white">

      {/* ════════════════════════════════════════════════
          FLOATING ACTION BUTTONS — fixed overlay, ALWAYS on top.
          z-index: 9999 so Leaflet can never cover them.
          pointer-events: none on wrapper, auto on buttons,
          so map interaction still works through the gaps.
          ════════════════════════════════════════════════ */}
      <div
        className="fixed right-4 z-[9999] flex flex-col items-end gap-3"
        style={{ bottom: `calc(64px + 16px)`, pointerEvents: 'none' }}
      >
        {/* Report Hazard button */}
        <button
          onClick={openForm}
          className="flex items-center gap-2 px-4 py-2.5 rounded-full font-bold text-sm text-white shadow-lg active:scale-95 transition-all hover:shadow-xl"
          style={{
            background: '#004ac6',
            boxShadow: '0 4px 16px rgba(0,74,198,0.4)',
            pointerEvents: 'auto',
          }}
        >
          <span className="material-symbols-outlined icon-filled" style={{ fontSize: '18px' }}>add_location_alt</span>
          Report Hazard
        </button>

        {/* SOS button */}
        <button
          onClick={() => sendSOS(emergencyContacts, userLocation)}
          className="w-14 h-14 rounded-full font-black text-white text-sm active:scale-90 transition-all"
          style={{
            background: '#EF4444',
            boxShadow: '0 0 0 4px rgba(239,68,68,0.2), 0 4px 24px rgba(239,68,68,0.5)',
            pointerEvents: 'auto',
          }}
        >
          SOS
        </button>
      </div>

      {/* ════════════════════════════════════════════════
          SUCCESS TOAST
          ════════════════════════════════════════════════ */}
      {success && (
        <div
          className="fixed top-20 left-1/2 -translate-x-1/2 z-[9998] flex items-center gap-2 px-4 py-2.5 rounded-2xl animate-fade-in"
          style={{ background: '#10B981', boxShadow: '0 4px 20px rgba(16,185,129,0.4)' }}
        >
          <span className="material-symbols-outlined text-white icon-filled" style={{ fontSize: '18px' }}>check_circle</span>
          <p className="text-white font-bold text-sm whitespace-nowrap">Report submitted! Live on map now.</p>
        </div>
      )}

      {/* ════════════════════════════════════════════════
          DESKTOP & TABLET LAYOUT (md+): Sidebar | Map
          ════════════════════════════════════════════════ */}
      <div className="hidden md:flex w-full h-full">

        {/* Sidebar */}
        {sidebarOpen && (
          <div className="flex flex-col h-full bg-white border-r border-[#e8eaed] shadow-lg z-10 flex-shrink-0"
            style={{ width: '320px', minWidth: '280px', maxWidth: '360px' }}>
            {/* Avatar link to profile */}
            <div className="flex items-center justify-between px-4 pt-3 pb-0">
              <div className="flex items-center gap-2">
                <button onClick={() => navigate('/profile')}
                  className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 border-2 border-[#e8eaed] active:scale-90 transition-transform">
                  {user?.avatar
                    ? <img src={user.avatar} className="w-full h-full object-cover" alt="avatar" />
                    : <div className="w-full h-full bg-[#004ac6] flex items-center justify-center">
                        <span className="material-symbols-outlined text-white icon-filled" style={{ fontSize: '15px' }}>person</span>
                      </div>
                  }
                </button>
                <p className="text-xs font-semibold text-[#737686] truncate max-w-[140px]">{user?.name || 'My Account'}</p>
              </div>
            </div>
            <SidebarContent />
          </div>
        )}

        {/* Collapsed sidebar tab */}
        {!sidebarOpen && (
          <button onClick={() => setSidebarOpen(true)}
            className="absolute left-0 top-1/2 -translate-y-1/2 z-20 w-8 h-20 bg-white border border-l-0 border-[#e8eaed] rounded-r-2xl flex items-center justify-center shadow-md hover:bg-[#f7f9fb] transition-colors">
            <span className="material-symbols-outlined text-[#737686]" style={{ fontSize: '18px' }}>chevron_right</span>
          </button>
        )}

        {/* Map */}
        <div className="flex-1 relative">
          <MapContainer center={mapCenter} zoom={14} style={{ height: '100%', width: '100%' }} zoomControl={false} attributionControl={false}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="© OpenStreetMap" />
            <BoundsTracker onChange={setMapBounds} />
            <MapMarkers validReports={validReports} mapCenter={mapCenter} selectedId={selectedId} onSelectId={setSelectedId} />
          </MapContainer>

          {/* Custom zoom controls */}
          <div className="absolute bottom-24 right-4 z-20 flex flex-col gap-0.5">
            {[
              { icon: 'add',    cls: 'rounded-t-xl',  sel: '.leaflet-control-zoom-in' },
              { icon: 'remove', cls: 'rounded-b-xl',  sel: '.leaflet-control-zoom-out' },
            ].map(b => (
              <button key={b.icon} onClick={() => document.querySelector(b.sel)?.click()}
                className={`w-9 h-9 bg-white border border-[#e8eaed] ${b.cls} flex items-center justify-center shadow-sm hover:bg-[#f7f9fb] transition-colors`}>
                <span className="material-symbols-outlined text-[#5f6368]" style={{ fontSize: '18px' }}>{b.icon}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════════════
          MOBILE LAYOUT (< md): Map top + Bottom Sheet
          ════════════════════════════════════════════════ */}
      <div className="flex md:hidden flex-col w-full h-full">

        {/* Map fills remaining height above sheet */}
        <div className="flex-1 relative">
          <MapContainer center={mapCenter} zoom={14} style={{ height: '100%', width: '100%' }} zoomControl={false} attributionControl={false}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <BoundsTracker onChange={setMapBounds} />
            <MapMarkers validReports={validReports} mapCenter={mapCenter} selectedId={selectedId} onSelectId={setSelectedId} />
          </MapContainer>

          {/* Top-right avatar to profile */}
          <button onClick={() => navigate('/profile')}
            className="absolute top-3 right-3 z-20 w-9 h-9 rounded-full overflow-hidden border-2 border-white shadow-md active:scale-90 transition-transform"
            style={{ background: '#004ac6' }}>
            {user?.avatar
              ? <img src={user.avatar} className="w-full h-full object-cover" alt="avatar" />
              : <span className="material-symbols-outlined text-white icon-filled" style={{ fontSize: '19px' }}>person</span>
            }
          </button>
        </div>

        {/* Bottom sheet */}
        <div
          className="flex-shrink-0 bg-white rounded-t-3xl border-t border-[#e8eaed] shadow-2xl flex flex-col transition-all duration-300 ease-out overflow-hidden"
          style={{ height: SHEET_HEIGHTS[sheetState] }}
        >
          {/* Drag handle */}
          <div
            className="flex justify-center pt-2.5 pb-1 flex-shrink-0 cursor-pointer select-none"
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
            onClick={() => setSheetState(s => s === 'peek' ? 'half' : s === 'half' ? 'full' : 'half')}
          >
            <div className="w-10 h-1 rounded-full bg-[#c3c6d7]" />
          </div>

          {/* Filters */}
          <div className="flex-shrink-0 px-3 pb-2 border-b border-[#f0f2f5]">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="material-symbols-outlined icon-filled text-[#F59E0B]" style={{ fontSize: '14px' }}>flag</span>
              <p className="text-xs font-black text-[#191c1e]">{filteredReports.length} Reports</p>
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
              {REPORT_FILTERS.map(f => {
                const active = activeFilter === f.id
                return (
                  <button key={f.id} onClick={() => setActiveFilter(f.id)}
                    className={`flex-shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-semibold transition-all ${
                      active ? 'bg-[#004ac6] text-white' : 'bg-[#f0f2f5] text-[#5f6368]'
                    }`}>
                    <span className="material-symbols-outlined icon-filled" style={{ fontSize: '11px' }}>{f.icon}</span>
                    {f.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Cards */}
          <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2" style={{ scrollbarWidth: 'thin' }}>
            {filteredReports.length === 0 ? (
              <div className="text-center py-6">
                <span className="material-symbols-outlined text-[#c3c6d7]" style={{ fontSize: '40px' }}>flag</span>
                <p className="text-sm text-[#737686] mt-2">No reports found</p>
              </div>
            ) : (
              filteredReports.map(r => (
                <ReportCard key={r.id} report={r}
                  isSelected={r.id === selectedId}
                  onClick={() => setSelectedId(r.id === selectedId ? null : r.id)} />
              ))
            )}
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════════════
          REPORT FORM SHEET (shared desktop + mobile)
          ════════════════════════════════════════════════ */}
      {showForm && (
        <>
          <div className="fixed inset-0 z-[500] bg-black/50 backdrop-blur-sm" onClick={closeForm} />
          <div
            className="fixed bottom-0 left-0 right-0 z-[600] flex flex-col rounded-t-3xl bg-white
              md:bottom-auto md:top-1/2 md:-translate-y-1/2 md:left-1/2 md:-translate-x-1/2 md:w-[680px] md:rounded-3xl shadow-2xl"
            style={{ maxHeight: '92vh' }}
          >
            <div className="flex justify-center pt-3 flex-shrink-0 md:hidden">
              <div className="w-10 h-1 rounded-full bg-[#c3c6d7]" />
            </div>

            <div className="flex items-center gap-3 px-8 pb-4 pt-4 flex-shrink-0 border-b border-[#f0f2f5]">
              <button onClick={step === 0 ? closeForm : () => setStep(s => s - 1)}
                className="w-8 h-8 rounded-full flex items-center justify-center active:scale-90 hover:bg-[#f0f2f5] transition-colors">
                <span className="material-symbols-outlined text-[#5f6368]" style={{ fontSize: '20px' }}>arrow_back</span>
              </button>
              <div className="flex-1">
                <h2 className="text-sm font-black text-[#191c1e]">Report a Hazard</h2>
                <p className="text-[10px] text-[#737686]">Step {step + 1} of {FORM_STEPS.length} — {FORM_STEPS[step]}</p>
              </div>
              <div className="flex items-center gap-1">
                {FORM_STEPS.map((_, i) => (
                  <div key={i} className="h-1.5 rounded-full transition-all duration-300"
                    style={{ width: i === step ? '18px' : '5px', background: i <= step ? '#004ac6' : '#e8eaed' }} />
                ))}
              </div>
              <button onClick={closeForm} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-[#f0f2f5]">
                <span className="material-symbols-outlined text-[#5f6368]" style={{ fontSize: '20px' }}>close</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-8 py-6" style={{ scrollbarWidth: 'thin' }}>
              {step === 0 && <LocationPicker onLocationSelect={loc => { setLocation(loc); setTimeout(() => setStep(1), 200) }} />}
              {step === 1 && <HazardCategoryPicker selectedId={category?.id} onSelect={setCategory} />}
              {step === 2 && <SeverityPicker selected={severity} onSelect={setSeverity} />}
              {step === 3 && (
                <ReportDetailsForm
                  description={description} onDescriptionChange={setDescription}
                  imageFile={imageFile} onImageChange={setImageFile}
                  anonymous={anonymous} onAnonymousChange={setAnonymous} />
              )}
              {step === 4 && (
                <ReportPreview
                  location={location} category={category} severity={severity}
                  description={description} imageFile={imageFile} anonymous={anonymous}
                  onSubmit={handleSubmit} onBack={() => setStep(3)} submitting={submitting} />
              )}
            </div>

            {step < 4 && (
              <div className="flex-shrink-0 px-8 pb-8 pt-3 border-t border-[#f0f2f5]">
                {step > 0 && location && (
                  <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-xl bg-[#f7f9fb] border border-[#e8eaed]">
                    <span className="material-symbols-outlined text-[#004ac6] icon-filled" style={{ fontSize: '12px' }}>location_on</span>
                    <p className="text-[10px] font-semibold truncate flex-1 text-[#737686]">{location.name}</p>
                    <button onClick={() => setStep(0)} className="text-[10px] font-bold text-[#004ac6]">Change</button>
                  </div>
                )}
                <button
                  onClick={() => canAdvance && setStep(s => Math.min(s + 1, FORM_STEPS.length - 1))}
                  disabled={!canAdvance}
                  className="w-full h-12 rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-30 active:scale-95 transition-all"
                  style={{ background: canAdvance ? '#004ac6' : '#e8eaed', color: canAdvance ? 'white' : '#9aa0ab',
                    boxShadow: canAdvance ? '0 4px 14px rgba(0,74,198,0.35)' : 'none' }}
                >
                  {step === 3 ? 'Review Report' : 'Continue'}
                  <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>arrow_forward</span>
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
