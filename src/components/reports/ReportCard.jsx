/**
 * ReportCard.jsx
 *
 * A single hazard report list card with:
 *   - Supports old schema (lat/lng/type/timestamp) and new schema
 *   - 👍 Verify / 👎 Not There voting buttons (one vote per user, togglable)
 *   - Delete button ONLY for the report creator (uid match)
 *   - Confidence score badge
 *
 * Props:
 *   report   — Firestore document data + id
 *   onPress  — () => void
 */

import { useState } from 'react'
import { doc, deleteDoc } from 'firebase/firestore'
import { db, auth } from '../../firebase/firebase'
import { voteOnReport } from '../../services/reportService'
import { HAZARD_TYPES, SEVERITY_LEVELS } from '../../constants'

// ─── Helpers ──────────────────────────────────────────────────────────────────
function timeAgo(timestamp) {
  if (!timestamp) return ''
  const date = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp)
  const diff  = Date.now() - date.getTime()
  const mins  = Math.floor(diff / 60000)
  if (mins < 1)  return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default function ReportCard({ report, onPress }) {
  // ── Normalize schema ──────────────────────────────────────────────────────
  const typeId = report.hazardType  || report.type
  const ht     = HAZARD_TYPES.find(h => h.id === typeId) ||
                 { label: typeId || 'Hazard', icon: 'warning', color: '#737686', basePenalty: 5 }
  const sev    = SEVERITY_LEVELS.find(s => s.id === report.severity)
  const loc    = report.locationName || report.location || 'Unknown location'
  const ts     = report.createdAt   || report.timestamp

  // ── Votes ──────────────────────────────────────────────────────────────────
  const uid        = auth.currentUser?.uid
  const upvotes    = report.upvotes   || []
  const downvotes  = report.downvotes || []
  const confidence = upvotes.length - downvotes.length
  const hasUpvoted   = uid ? upvotes.includes(uid)   : false
  const hasDownvoted = uid ? downvotes.includes(uid) : false

  const [voting, setVoting] = useState(false)

  const handleVote = async (e, type) => {
    e.stopPropagation()
    if (!uid || voting) return
    setVoting(true)
    try { await voteOnReport(report.id, type) }
    catch (err) { console.error('[ReportCard] Vote failed:', err) }
    finally { setVoting(false) }
  }

  // ── Owner check ────────────────────────────────────────────────────────────
  const isOwner = uid && uid === report.uid

  // ── Delete ──────────────────────────────────────────────────────────────────
  const handleDelete = async (e) => {
    e.stopPropagation()
    if (!window.confirm('Delete your report? This cannot be undone.')) return
    try { await deleteDoc(doc(db, 'reports', report.id)) }
    catch (err) { console.error('[ReportCard] Delete failed:', err) }
  }

  return (
    <div
      onClick={onPress}
      className="flex flex-col bg-white rounded-2xl border border-[#eceef0] shadow-sm overflow-hidden active:scale-[0.98] transition-all cursor-pointer"
    >
      {/* ── Main row ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 p-3.5">

        {/* Icon blob */}
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: ht.color + '15' }}
        >
          <span
            className="material-symbols-outlined icon-filled"
            style={{ color: ht.color, fontSize: '22px' }}
          >
            {ht.icon}
          </span>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <p className="text-sm font-bold text-[#191c1e] truncate">{ht.label}</p>
            {sev && (
              <span
                className="text-[8px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-wide flex-shrink-0"
                style={{ color: sev.color, background: sev.color + '20' }}
              >
                {sev.label}
              </span>
            )}
          </div>

          {report.description && (
            <p className="text-xs text-[#737686] truncate">{report.description}</p>
          )}

          <div className="flex items-center gap-1 mt-0.5">
            <span className="material-symbols-outlined text-[#737686]" style={{ fontSize: '10px' }}>location_on</span>
            <p className="text-[10px] text-[#737686] truncate">{loc}</p>
          </div>
        </div>

        {/* Right: time + avatar + delete */}
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <p className="text-[10px] text-[#737686] font-semibold">{timeAgo(ts)}</p>

          {report.anonymous ? (
            <span className="material-symbols-outlined text-[#737686]" style={{ fontSize: '14px' }}>visibility_off</span>
          ) : report.userPhoto ? (
            <img src={report.userPhoto} className="w-5 h-5 rounded-full object-cover" alt="" />
          ) : null}

          {/* Delete — only for creator */}
          {isOwner && (
            <button
              onClick={handleDelete}
              className="w-6 h-6 rounded-lg bg-[#EF4444]/10 flex items-center justify-center mt-0.5 active:bg-[#EF4444] active:scale-90 transition-all"
            >
              <span className="material-symbols-outlined text-[#EF4444]" style={{ fontSize: '13px' }}>delete</span>
            </button>
          )}
        </div>
      </div>

      {/* ── Voting row ────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-0 border-t border-[#f2f4f6]">

        {/* Verify (👍) */}
        <button
          onClick={(e) => handleVote(e, 'up')}
          disabled={voting}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-bold transition-all active:scale-95 ${
            hasUpvoted
              ? 'bg-[#10B981]/10 text-[#10B981]'
              : 'text-[#737686] hover:bg-[#f7f9fb]'
          }`}
        >
          <span className="material-symbols-outlined icon-filled" style={{ fontSize: '14px' }}>
            thumb_up
          </span>
          Verify
          {upvotes.length > 0 && (
            <span
              className="text-[9px] font-black px-1 py-0.5 rounded-full"
              style={{
                background: hasUpvoted ? '#10B981' : '#f2f4f6',
                color:      hasUpvoted ? 'white'   : '#737686',
              }}
            >
              {upvotes.length}
            </span>
          )}
        </button>

        {/* Confidence score divider */}
        <div className="flex flex-col items-center px-2.5 border-x border-[#f2f4f6]">
          <p
            className="text-xs font-black leading-tight"
            style={{
              color: confidence > 0 ? '#10B981' : confidence < 0 ? '#EF4444' : '#737686',
            }}
          >
            {confidence > 0 ? `+${confidence}` : confidence}
          </p>
          <p className="text-[8px] text-[#737686] leading-none">conf.</p>
        </div>

        {/* Not There (👎) */}
        <button
          onClick={(e) => handleVote(e, 'down')}
          disabled={voting}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-bold transition-all active:scale-95 ${
            hasDownvoted
              ? 'bg-[#EF4444]/10 text-[#EF4444]'
              : 'text-[#737686] hover:bg-[#f7f9fb]'
          }`}
        >
          <span className="material-symbols-outlined icon-filled" style={{ fontSize: '14px' }}>
            thumb_down
          </span>
          Not there
          {downvotes.length > 0 && (
            <span
              className="text-[9px] font-black px-1 py-0.5 rounded-full"
              style={{
                background: hasDownvoted ? '#EF4444' : '#f2f4f6',
                color:      hasDownvoted ? 'white'   : '#737686',
              }}
            >
              {downvotes.length}
            </span>
          )}
        </button>
      </div>
    </div>
  )
}
