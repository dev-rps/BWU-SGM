/**
 * JourneyReviewPage.jsx — Post-journey review screen
 * Matches exact reference UI: SVG face icons (no emojis), animated checkmark,
 * report card for danger/bad, proper navigation after submit.
 */

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { db, auth } from '../../firebase/firebase'
import { collection, addDoc, serverTimestamp } from 'firebase/firestore'

// ─── SVG Face Icons matching the reference UI exactly ────────────────────────
// Reference: crossed-out face (Danger!), sad face (Bad), slight smile (Good), big smile (Great!)

function FaceDanger({ size = 36, color = '#EF4444' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="18" cy="18" r="17" stroke={color} strokeWidth="2" fill="white"/>
      {/* X eyes */}
      <line x1="11" y1="11" x2="14" y2="14" stroke={color} strokeWidth="2" strokeLinecap="round"/>
      <line x1="14" y1="11" x2="11" y2="14" stroke={color} strokeWidth="2" strokeLinecap="round"/>
      <line x1="22" y1="11" x2="25" y2="14" stroke={color} strokeWidth="2" strokeLinecap="round"/>
      <line x1="25" y1="11" x2="22" y2="14" stroke={color} strokeWidth="2" strokeLinecap="round"/>
      {/* Wavy/distressed mouth */}
      <path d="M11 24 Q14 21 18 24 Q22 27 25 24" stroke={color} strokeWidth="2" strokeLinecap="round" fill="none"/>
    </svg>
  )
}

function FaceSad({ size = 36, color = '#737686' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="18" cy="18" r="17" stroke={color} strokeWidth="2" fill="white"/>
      {/* Dot eyes */}
      <circle cx="13" cy="14" r="1.5" fill={color}/>
      <circle cx="23" cy="14" r="1.5" fill={color}/>
      {/* Sad mouth */}
      <path d="M12 25 Q18 20 24 25" stroke={color} strokeWidth="2" strokeLinecap="round" fill="none"/>
    </svg>
  )
}

function FaceNeutral({ size = 36, color = '#737686' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="18" cy="18" r="17" stroke={color} strokeWidth="2" fill="white"/>
      {/* Dot eyes */}
      <circle cx="13" cy="14" r="1.5" fill={color}/>
      <circle cx="23" cy="14" r="1.5" fill={color}/>
      {/* Slight smile */}
      <path d="M12 22 Q18 26 24 22" stroke={color} strokeWidth="2" strokeLinecap="round" fill="none"/>
    </svg>
  )
}

function FaceHappy({ size = 36, color = '#737686' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="18" cy="18" r="17" stroke={color} strokeWidth="2" fill="white"/>
      {/* Happy eyes */}
      <path d="M11 13 Q13 11 15 13" stroke={color} strokeWidth="1.5" strokeLinecap="round" fill="none"/>
      <path d="M21 13 Q23 11 25 13" stroke={color} strokeWidth="1.5" strokeLinecap="round" fill="none"/>
      {/* Big smile */}
      <path d="M11 21 Q18 29 25 21" stroke={color} strokeWidth="2" strokeLinecap="round" fill="none"/>
    </svg>
  )
}

// ─── Rating config ────────────────────────────────────────────────────────────
const RATINGS = [
  {
    id: 'danger',
    label: 'Danger!',
    Icon: FaceDanger,
    activeColor: '#EF4444',
    activeBg: '#FEF2F2',
    activeBorder: '#EF4444',
    successMsg: 'Thank you for reporting your experience. Your feedback helps improve safety.',
  },
  {
    id: 'bad',
    label: 'Bad',
    Icon: FaceSad,
    activeColor: '#F97316',
    activeBg: '#FFF7ED',
    activeBorder: '#F97316',
    successMsg: 'Thank you for sharing your experience.',
  },
  {
    id: 'good',
    label: 'Good',
    Icon: FaceNeutral,
    activeColor: '#10B981',
    activeBg: '#F0FDF4',
    activeBorder: '#10B981',
    successMsg: 'Thanks for your feedback. Have a safe day.',
  },
  {
    id: 'great',
    label: 'Great!',
    Icon: FaceHappy,
    activeColor: '#004ac6',
    activeBg: '#EFF6FF',
    activeBorder: '#004ac6',
    successMsg: "We're glad you reached home safely. Thank you for helping make the community safer.",
  },
]

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function JourneyReviewPage() {
  const navigate = useNavigate()
  const [selected,       setSelected]       = useState(null)
  const [showReportCard, setShowReportCard] = useState(false)
  const [submitting,     setSubmitting]     = useState(false)
  const [submitted,      setSubmitted]      = useState(false)
  const [successMsg,     setSuccessMsg]     = useState('')

  // Auto-navigate home after successful submit
  useEffect(() => {
    if (!submitted) return
    const t = setTimeout(() => navigate('/'), 2500)
    return () => clearTimeout(t)
  }, [submitted, navigate])

  const handleSelect = (id) => {
    setSelected(id)
    setShowReportCard(id === 'danger' || id === 'bad')
  }

  const handleSubmit = async () => {
    if (!selected || submitting) return
    setSubmitting(true)
    const rating = RATINGS.find(r => r.id === selected)
    try {
      await addDoc(collection(db, 'journeyReviews'), {
        userId:    auth.currentUser?.uid || 'anonymous',
        rating:    selected,
        timestamp: serverTimestamp(),
      })
    } catch (err) {
      // Non-critical — Firestore write failed (e.g. offline), but still complete the flow
      console.warn('journeyReviews write failed (non-critical):', err.message)
    }
    // Always show success and navigate — even if Firestore write failed offline
    setSuccessMsg(rating?.successMsg || 'Thank you!')
    setSubmitting(false)  // ← THIS was missing, causing infinite loading
    setSubmitted(true)
  }

  // ── Success screen ──────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="fixed inset-0 bg-white flex flex-col items-center justify-center px-6 text-center z-50">
        <style>{`
          @keyframes popIn {
            0%   { transform: scale(0) rotate(-10deg); opacity: 0; }
            70%  { transform: scale(1.1) rotate(2deg); }
            100% { transform: scale(1) rotate(0deg); opacity: 1; }
          }
        `}</style>
        <div
          className="w-24 h-24 rounded-full bg-[#dcfce7] border-4 border-[#10B981] flex items-center justify-center mb-6"
          style={{ animation: 'popIn 0.5s cubic-bezier(0.175,0.885,0.32,1.275) both' }}
        >
          <span className="material-symbols-outlined icon-filled text-[#10B981] text-[48px]">check_circle</span>
        </div>
        <h2 className="text-2xl font-black text-[#0f172a] mb-3">Thank You!</h2>
        <p className="text-sm text-[#64748b] leading-relaxed max-w-xs">{successMsg}</p>
        <p className="text-xs text-[#94a3b8] mt-4">Returning home…</p>
      </div>
    )
  }

  // ── Review screen ───────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-white z-50 overflow-y-auto">
      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes popIn {
          0%   { transform: scale(0) rotate(-10deg); opacity: 0; }
          70%  { transform: scale(1.1) rotate(2deg); }
          100% { transform: scale(1) rotate(0deg); opacity: 1; }
        }
        .review-page { animation: fadeUp 0.4s ease-out both; }
        .face-btn { transition: transform 0.2s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.2s ease; }
        .face-btn.active { transform: scale(1.08); }
      `}</style>

      <div className="review-page flex flex-col items-center pt-14 pb-10 px-5 min-h-full">

        {/* ── Animated checkmark ── */}
        <div
          className="w-[100px] h-[100px] rounded-full bg-[#dcfce7] border-4 border-[#10B981] flex items-center justify-center mb-5"
          style={{ animation: 'popIn 0.5s cubic-bezier(0.175,0.885,0.32,1.275) 0.1s both' }}
        >
          <span className="material-symbols-outlined icon-filled text-[#10B981] text-[52px]">check_circle</span>
        </div>

        {/* ── Title ── */}
        <h1 className="text-[28px] font-black text-[#0f172a] mb-1">You're Here!</h1>
        <p className="text-[14px] text-[#64748b] mb-8 text-center">How was your journey, traveller?</p>

        {/* ── Emoji rating row ── */}
        <div className="flex justify-between w-full max-w-xs mb-6 px-2">
          {RATINGS.map(r => {
            const isActive = selected === r.id
            return (
              <div key={r.id} className="flex flex-col items-center gap-2">
                <button
                  onClick={() => handleSelect(r.id)}
                  className={`face-btn w-16 h-16 rounded-full border-2 flex items-center justify-center ${isActive ? 'active' : ''}`}
                  style={{
                    borderColor:     isActive ? r.activeBorder : '#e2e8f0',
                    backgroundColor: isActive ? r.activeBg     : 'white',
                    boxShadow:       isActive ? `0 0 0 3px ${r.activeBorder}22` : 'none',
                  }}
                >
                  <r.Icon
                    size={34}
                    color={isActive ? r.activeColor : '#94a3b8'}
                  />
                </button>
                <span
                  className="text-[11px] font-bold"
                  style={{ color: isActive ? r.activeColor : '#64748b' }}
                >
                  {r.label}
                </span>
              </div>
            )
          })}
        </div>

        {/* ── Report card (danger/bad only) ── */}
        {showReportCard && (
          <div
            className="w-full max-w-xs bg-[#f8fafc] border border-[#e2e8f0] rounded-2xl p-4 mb-6"
            style={{ animation: 'fadeUp 0.3s ease-out both' }}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="material-symbols-outlined icon-filled text-[#F59E0B] text-[18px]">warning</span>
              <h3 className="text-sm font-black text-[#0f172a]">Report a Safety Issue</h3>
            </div>
            <p className="text-xs text-[#64748b] mb-4 leading-relaxed">
              Notice something unsafe during your trip? Help keep others safe by becoming a Safety Guardian!!
            </p>
            <button
              onClick={() => navigate('/reports')}
              className="w-full bg-[#004ac6] text-white font-bold text-sm py-3 rounded-xl mb-2 flex items-center justify-center gap-2 active:scale-95 transition-transform"
            >
              <span className="material-symbols-outlined icon-filled text-[16px]">report</span>
              Report an Issue!
            </button>
            <button
              onClick={() => setShowReportCard(false)}
              className="w-full bg-white text-[#475569] font-semibold text-sm py-3 rounded-xl border border-[#e2e8f0] active:scale-95 transition-transform"
            >
              Cancel
            </button>
          </div>
        )}

        {/* ── Submit button ── */}
        <div className="w-full max-w-xs flex flex-col items-center gap-3 mt-auto">
          <button
            disabled={!selected || submitting}
            onClick={handleSubmit}
            className="w-full h-14 rounded-2xl font-black text-base text-white flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: selected ? '#004ac6' : '#94a3b8',
              boxShadow:  selected ? '0 4px 16px rgba(0,74,198,0.35)' : 'none',
            }}
          >
            {submitting
              ? <span className="material-symbols-outlined animate-spin text-[20px]">refresh</span>
              : <span className="material-symbols-outlined icon-filled text-[20px]">check_circle</span>
            }
            {submitting ? 'Submitting…' : 'Submit Review'}
          </button>

          <button
            onClick={() => navigate('/')}
            className="text-sm font-semibold text-[#64748b] hover:text-[#334155] transition-colors py-1"
          >
            Not Now
          </button>

          <button
            onClick={() => navigate('/')}
            className="text-xs text-[#94a3b8] hover:text-[#64748b] transition-colors"
          >
            Skip
          </button>
        </div>
      </div>
    </div>
  )
}
