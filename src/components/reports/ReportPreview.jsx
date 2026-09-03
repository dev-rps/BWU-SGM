/**
 * ReportPreview.jsx
 *
 * Step 5: Read-only summary of the full report before submission.
 *
 * Props:
 *   location     { lat, lng, name, address }
 *   category     HAZARD_TYPES entry
 *   severity     string id
 *   description  string
 *   imageFile    File | null
 *   anonymous    boolean
 *   submitting   boolean
 *   onSubmit()   — trigger Firestore write
 *   onBack()     — go back to edit
 */

import { useMemo } from 'react'
import { SEVERITY_LEVELS } from '../../constants'
import { useAppStore } from '../../context/store'

function formatDateTime() {
  return new Date().toLocaleDateString('en-IN', {
    day:    '2-digit',
    month:  'short',
    year:   'numeric',
    hour:   '2-digit',
    minute: '2-digit',
  })
}

export default function ReportPreview({
  location, category, severity, description,
  imageFile, anonymous, onSubmit, onBack, submitting,
}) {
  const { user } = useAppStore()
  const sev         = SEVERITY_LEVELS.find(s => s.id === severity)
  const imagePreview = useMemo(
    () => (imageFile ? URL.createObjectURL(imageFile) : null),
    [imageFile]
  )

  return (
    <div className="flex flex-col gap-3">

      {/* Header */}
      <div className="flex items-center gap-2 mb-1">
        <span className="material-symbols-outlined text-[#004ac6] icon-filled" style={{ fontSize: '18px' }}>preview</span>
        <p className="text-sm font-black text-[#191c1e]">Review before submitting</p>
      </div>

      {/* ── Location ─────────────────────────────────────────────────────── */}
      <div className="bg-[#f7f9fb] rounded-xl p-3 flex items-start gap-2.5 border border-[#eceef0]">
        <span className="material-symbols-outlined text-[#004ac6] icon-filled mt-0.5" style={{ fontSize: '18px' }}>location_on</span>
        <div className="min-w-0">
          <p className="text-[9px] font-black text-[#737686] uppercase tracking-wider">Location</p>
          <p className="text-sm font-bold text-[#191c1e] truncate mt-0.5">{location?.name}</p>
          <p className="text-[10px] text-[#737686] mt-0.5 line-clamp-2">{location?.address}</p>
        </div>
      </div>

      {/* ── Hazard + Severity row ─────────────────────────────────────────── */}
      <div className="flex gap-2">
        {/* Hazard */}
        <div className="flex-1 bg-[#f7f9fb] rounded-xl p-3 flex items-center gap-2.5 border border-[#eceef0]">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: category?.color + '18' }}
          >
            <span
              className="material-symbols-outlined icon-filled"
              style={{ color: category?.color, fontSize: '18px' }}
            >
              {category?.icon}
            </span>
          </div>
          <div>
            <p className="text-[9px] font-black text-[#737686] uppercase tracking-wider">Hazard</p>
            <p className="text-xs font-bold text-[#191c1e] mt-0.5">{category?.label}</p>
          </div>
        </div>

        {/* Severity */}
        <div className="flex-1 bg-[#f7f9fb] rounded-xl p-3 flex items-center gap-2.5 border border-[#eceef0]">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: sev?.color + '18' }}
          >
            <div className="w-4 h-4 rounded-full" style={{ background: sev?.color }} />
          </div>
          <div>
            <p className="text-[9px] font-black text-[#737686] uppercase tracking-wider">Severity</p>
            <p className="text-xs font-bold mt-0.5" style={{ color: sev?.color }}>{sev?.label}</p>
          </div>
        </div>
      </div>

      {/* ── Description ─────────────────────────────────────────────────── */}
      {description ? (
        <div className="bg-[#f7f9fb] rounded-xl p-3 border border-[#eceef0]">
          <p className="text-[9px] font-black text-[#737686] uppercase tracking-wider mb-1">Description</p>
          <p className="text-xs text-[#191c1e] leading-relaxed">{description}</p>
        </div>
      ) : (
        <div className="bg-[#f7f9fb] rounded-xl p-3 border border-dashed border-[#c3c6d7]">
          <p className="text-xs text-[#737686] italic">No description provided</p>
        </div>
      )}

      {/* ── Image preview ─────────────────────────────────────────────────── */}
      {imagePreview && (
        <div className="rounded-xl overflow-hidden border border-[#eceef0]" style={{ height: '120px' }}>
          <img src={imagePreview} alt="Attached photo" className="w-full h-full object-cover" />
        </div>
      )}

      {/* ── Reporter ─────────────────────────────────────────────────────── */}
      <div className="bg-[#f7f9fb] rounded-xl p-3 flex items-center gap-2.5 border border-[#eceef0]">
        {anonymous ? (
          <>
            <div className="w-9 h-9 rounded-full bg-[#737686]/15 flex items-center justify-center flex-shrink-0">
              <span className="material-symbols-outlined text-[#737686] icon-filled" style={{ fontSize: '18px' }}>person</span>
            </div>
            <div>
              <p className="text-xs font-bold text-[#191c1e]">Anonymous Report</p>
              <p className="text-[10px] text-[#737686]">Identity hidden from other users</p>
            </div>
          </>
        ) : (
          <>
            {user.avatar ? (
              <img src={user.avatar} className="w-9 h-9 rounded-full object-cover flex-shrink-0" alt={user.name} />
            ) : (
              <div className="w-9 h-9 rounded-full bg-[#004ac6]/15 flex items-center justify-center flex-shrink-0">
                <span className="material-symbols-outlined text-[#004ac6] icon-filled" style={{ fontSize: '18px' }}>person</span>
              </div>
            )}
            <div>
              <p className="text-xs font-bold text-[#191c1e]">{user.name || user.email || 'You'}</p>
              <p className="text-[10px] text-[#737686]">{formatDateTime()}</p>
            </div>
          </>
        )}
      </div>

      {/* ── Action buttons ────────────────────────────────────────────────── */}
      <div className="flex gap-2 pt-1">
        <button
          onClick={onBack}
          disabled={submitting}
          className="flex-1 h-12 rounded-xl border-2 border-[#eceef0] text-[#191c1e] font-bold text-sm flex items-center justify-center gap-1.5 active:scale-95 transition-all"
        >
          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>edit</span>
          Edit
        </button>
        <button
          onClick={onSubmit}
          disabled={submitting}
          className="flex-[2] h-12 rounded-xl bg-[#004ac6] text-white font-bold text-sm flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-60 shadow-lg shadow-blue-300/30"
        >
          {submitting ? (
            <>
              <span className="material-symbols-outlined animate-spin" style={{ fontSize: '18px' }}>refresh</span>
              Submitting…
            </>
          ) : (
            <>
              <span className="material-symbols-outlined icon-filled" style={{ fontSize: '18px' }}>send</span>
              Submit Report
            </>
          )}
        </button>
      </div>

    </div>
  )
}
