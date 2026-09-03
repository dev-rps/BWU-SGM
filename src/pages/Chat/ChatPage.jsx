/**
 * ChatPage.jsx â€” Momo, Your Safety Guardian 
 *
 * Features:
 *  - First-time animated welcome screen (shown once via localStorage)
 *  - Premium chat UI with Momo guinea pig avatar
 *  - Word-by-word streaming text reveal
 *  - Cute TTS voice (Web Speech Synthesis, high pitch, warm rate)
 *  - Voice input (Web Speech Recognition, preserved from original)
 *  - Emergency detection â†’ SOS redirect or soft guidance
 *  - Multilingual support (10 Indian languages, auto-detect + manual)
 *  - Dynamic quick action buttons
 *  - Copy, Regenerate, Clear chat
 *  - Settings panel (voice on/off, speed, pitch, volume, language)
 *  - Context-aware conversation (pronoun understanding)
 *  - Medical Emergency Triaging via Gemini & Natural Language
 *  - Pre-filled WhatsApp Dispatch & Live GPS sharing
 *  - Nearest Pharmacy/Hospital finder integration
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../../context/store'
import { auth, db } from '../../firebase/firebase'
import { doc, setDoc, serverTimestamp } from 'firebase/firestore'

import {
  detectEmergency,
  detectLanguage,
  getQuickActions,
  LANGUAGES,
} from '../../services/momoAI'
import { askMomo, analyzeMedicalEmergencyWithGemini, MOMO_ERROR_FALLBACK } from '../../services/gemini'
import { reverseGeocode } from '../../services/nominatim'

import {
  detectMedicalEmergency,
  findNearbyMedicalHelp,
  buildMedicalEmergencyMessage,
  sendMedicalWhatsApp,
  callNumber,
} from '../../services/medicalEmergency'
import { loadMedicalProfile } from '../../services/medicalService'

const INTRO_KEY = 'momo_introduced_v1'

// â”€â”€â”€ Default Settings â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const DEFAULT_SETTINGS = {
  voiceEnabled: true,
  speechRate:   1.1,
  speechPitch:  1.35,
  speechVolume: 1.0,
  language:     'en',
  autoPlayVoice: true,
}

function loadSettings() {
  try {
    const saved = localStorage.getItem('momo_settings')
    return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS
  } catch { return DEFAULT_SETTINGS }
}

// â”€â”€â”€ Quick Chips â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const QUICK_CHIPS = [
  { label: ' Flood advice',      text: 'What should I do during a flood?' },
  { label: ' Emergency numbers', text: 'What are the emergency numbers in India?' },
  { label: ' How to SOS',        text: 'How do I trigger an SOS alert?' },
  { label: ' Women safety',      text: 'Give me women safety tips' },
  { label: ' Find hospital',     text: 'How do I find the nearest hospital?' },
  { label: 'ï¸ Route safety',     text: 'How is route safety score calculated?' },
  { label: ' Cyber safety',      text: 'How can I stay safe from online scams?' },
  { label: ' First aid',         text: 'Give me basic first aid tips' },
]

// â”€â”€â”€ Render markdown-style bold + newlines â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function renderText(text) {
  if (!text) return null
  const paragraphs = text.split('\n\n')
  return paragraphs.map((para, pIdx) => {
    const lines = para.split('\n')
    return (
      <p key={pIdx} className={pIdx > 0 ? 'mt-1.5' : ''}>
        {lines.map((line, lIdx) => {
          const parts = line.split(/(\*\*.*?\*\*)/g)
          return (
            <span key={lIdx}>
              {parts.map((part, i) => {
                if (part.startsWith('**') && part.endsWith('**')) {
                  return <strong key={i} className="font-bold">{part.slice(2, -2)}</strong>
                }
                return part
              })}
              {lIdx < lines.length - 1 && <br />}
            </span>
          )
        })}
      </p>
    )
  })
}

// â”€â”€â”€ TTS â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function speakText(text, settings, langCode) {
  if (!window.speechSynthesis || !settings.voiceEnabled) return
  window.speechSynthesis.cancel()

  // Strip markdown bold markers for clean speech
  const clean = text.replace(/\*\*/g, '').replace(/\n/g, ' ')
  const utt   = new SpeechSynthesisUtterance(clean)
  utt.rate   = settings.speechRate
  utt.pitch  = settings.speechPitch
  utt.volume = settings.speechVolume
  utt.lang   = LANGUAGES[langCode]?.code || 'en-IN'

  // Try to pick a female voice for Momo's personality
  const voices = window.speechSynthesis.getVoices()
  const female = voices.find(v =>
    /female|woman|girl|zira|siri|samantha|heera|veena|lekha/i.test(v.name)
  ) || voices.find(v =>
    v.lang.startsWith(utt.lang.split('-')[0])
  )
  if (female) utt.voice = female

  window.speechSynthesis.speak(utt)
}

// â”€â”€â”€ Intro Screen (shown once) â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function IntroScreen({ onDone }) {
  const [phase, setPhase] = useState(0)

  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 500)
    return () => clearTimeout(t1)
  }, [])

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center"
      style={{ background: '#f8f9fc' }}
    >
      <style>{`
        @keyframes floatUp {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .intro-blob { animation: floatUp 0.8s ease-out both; }
        .intro-text { animation: floatUp 0.8s 0.3s ease-out both; }
        .intro-btn  { animation: floatUp 0.8s 0.6s ease-out both; }
      `}</style>

      <div className="flex-1 flex flex-col items-center justify-center w-full px-8">
        <div className="relative flex items-center justify-center intro-blob mb-10" style={{ width: 240, height: 240 }}>
          <div
            className="absolute"
            style={{
              width: '120%', height: '120%',
              background: 'radial-gradient(circle, rgba(139,92,246,0.18) 0%, rgba(59,130,246,0.12) 40%, rgba(248,249,252,0) 70%)',
              filter: 'blur(20px)',
              borderRadius: '50%',
            }}
          />
          <img
            src="/momo-avatar.jpg"
            alt="Momo"
            className="relative z-10"
            style={{
              width: 140, height: 140,
              borderRadius: '50%',
              objectFit: 'cover',
              boxShadow: '0 8px 32px rgba(0,0,0,0.08)',
            }}
          />
        </div>

        {phase >= 1 && (
          <div className="intro-text text-center space-y-2">
            <h1 className="text-[26px] font-medium text-[#111827] leading-tight tracking-tight">
              Hi there! I'm <span className="text-[#4f46e5]">Momo</span> 
            </h1>
            <p className="text-[20px] text-[#374151] leading-snug font-normal px-2">
              I'm here to help you stay safe and secure during any emergency.
            </p>
          </div>
        )}
      </div>

      <div className="w-full px-6 pb-6">
        {phase >= 1 && (
          <button
            onClick={onDone}
            className="intro-btn w-full py-4 rounded-[28px] font-medium text-white text-[17px] active:scale-95 transition-transform"
            style={{
              background: 'linear-gradient(90deg, #6366f1, #3b82f6)',
              boxShadow: '0 10px 25px rgba(59,130,246,0.25)',
            }}
          >
            Let&apos;s Talk!
          </button>
        )}
      </div>
    </div>
  )
}

// ── WhatsApp Confirmation Modal ──────────────────────────────────────────────
function WhatsAppConfirmModal({ isOpen, onClose, onConfirm, pharmacy, messageText }) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl border border-[#E5E7EB] animate-scale-up">
        {/* Modal Header */}
        <div className="px-5 py-4 bg-[#25D366] text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined icon-filled" style={{ fontSize: 22 }}>chat</span>
            <h3 className="font-black text-sm">Confirm Emergency Dispatch</h3>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center">
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-5 space-y-3">
          <div>
            <p className="text-[11px] font-black text-[#6B7280] uppercase tracking-wider">Sending To:</p>
            <p className="text-sm font-black text-[#111827]">{pharmacy?.name || 'Nearest Pharmacy / WhatsApp'}</p>
            {pharmacy?.phone && <p className="text-xs text-[#059669] font-bold">{pharmacy.phone}</p>}
          </div>

          <div>
            <p className="text-[11px] font-black text-[#6B7280] uppercase tracking-wider mb-1">Message Preview:</p>
            <div className="p-3 bg-[#F9FAFB] rounded-2xl border border-[#E5E7EB] text-[11px] text-[#374151] max-h-40 overflow-y-auto whitespace-pre-wrap font-sans">
              {messageText}
            </div>
          </div>

          <p className="text-[10px] text-[#6B7280] italic">
            Tap confirm to launch WhatsApp with this pre-filled emergency alert and live location.
          </p>

          {/* Action Buttons */}
          <div className="flex gap-2 pt-2">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-[#D1D5DB] text-xs font-bold text-[#4B5563] hover:bg-slate-50 active:scale-95"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              className="flex-1 py-2.5 rounded-xl bg-[#25D366] hover:bg-[#1EBE5D] text-white text-xs font-black shadow-md flex items-center justify-center gap-1.5 active:scale-95"
            >
              <span>Confirm &amp; Send</span>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>send</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Medical Emergency Card Component ─────────────────────────────────────────
function MedicalEmergencyCard({ medEmergency, onDismiss, userName, userLocation, medicalProfile }) {
  const [selectedPharmacy, setSelectedPharmacy] = useState(null)
  const [confirmModalOpen, setConfirmModalOpen] = useState(false)
  const [previewMsg, setPreviewMsg] = useState('')

  const severityColor = medEmergency?.severity === 'critical'
    ? '#DC2626'
    : medEmergency?.severity === 'high'
      ? '#EA580C'
      : '#2563EB'

  const severityBadge = medEmergency?.severity === 'critical'
    ? 'CRITICAL EMERGENCY'
    : medEmergency?.severity === 'high'
      ? 'HIGH PRIORITY'
      : 'MEDICAL DISTRESS'

  const handleOpenConfirm = (pharmacy = null) => {
    const allergiesList = Array.isArray(medicalProfile?.allergies)
      ? medicalProfile.allergies.join(', ')
      : (medicalProfile?.allergies || '')

    const dosage = Array.isArray(medicalProfile?.medicines) && medicalProfile.medicines.length > 0
      ? medicalProfile.medicines[0]?.dosage || ''
      : (medicalProfile?.dosage || '')

    const msg = buildMedicalEmergencyMessage({
      patientName: userName || medicalProfile?.patientName || 'Citizen',
      condition: medEmergency.condition,
      medicine: medEmergency.medicine,
      dosage,
      doctorName: medicalProfile?.doctorName || '',
      doctorPhone: medicalProfile?.doctorPhone || '',
      allergies: allergiesList,
      bloodGroup: medicalProfile?.bloodGroup || '',
      emergencyContact: medicalProfile?.emergencyContacts?.[0]?.phone || '',
      lat: userLocation?.lat,
      lng: userLocation?.lng,
    })

    setSelectedPharmacy(pharmacy)
    setPreviewMsg(msg)
    setConfirmModalOpen(true)
  }

  const handleConfirmSend = () => {
    setConfirmModalOpen(false)
    sendMedicalWhatsApp(selectedPharmacy?.phone || '', previewMsg)
  }

  if (!medEmergency) return null

  return (
    <>
      <WhatsAppConfirmModal
        isOpen={confirmModalOpen}
        onClose={() => setConfirmModalOpen(false)}
        onConfirm={handleConfirmSend}
        pharmacy={selectedPharmacy}
        messageText={previewMsg}
      />

      <div
        className="mx-4 mb-3 mt-2 rounded-3xl overflow-hidden shadow-xl border-2 bg-white"
        style={{ borderColor: severityColor }}
      >
        {/* Header with Severity Indicator */}
        <div
          className="px-4 py-3 text-white flex items-center justify-between"
          style={{ background: `linear-gradient(135deg, ${severityColor}, ${severityColor}DD)` }}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-lg flex-shrink-0 animate-pulse">
              🚨
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] font-black uppercase tracking-wider bg-white/25 px-2 py-0.5 rounded-full">
                  {severityBadge}
                </span>
                {medEmergency.confidence && (
                  <span className="text-[9px] font-bold text-white/80 bg-black/20 px-1.5 py-0.5 rounded-full">
                    {medEmergency.confidence} confidence
                  </span>
                )}
              </div>
              <p className="text-xs font-bold truncate mt-0.5 text-white/95">
                {medEmergency.condition}
              </p>
            </div>
          </div>
          <button
            onClick={onDismiss}
            className="w-7 h-7 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white flex-shrink-0 ml-2"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
          </button>
        </div>

        <div className="p-4 space-y-3">
          {/* Needed Relief / Medicine */}
          <div className="p-3 rounded-2xl bg-amber-50/70 border border-amber-200/80 flex items-start gap-2.5">
            <span className="material-symbols-outlined text-amber-600 icon-filled flex-shrink-0" style={{ fontSize: 20 }}>
              medication
            </span>
            <div>
              <p className="text-[10px] font-black text-amber-800 uppercase tracking-wider">Recommended Aid / Relief</p>
              <p className="text-xs font-bold text-amber-950 mt-0.5">{medEmergency.medicine || 'Urgent Medical Relief'}</p>
            </div>
          </div>

          {/* First Aid Steps Checklist */}
          {medEmergency.firstAidSteps?.length > 0 && (
            <div className="p-3.5 rounded-2xl bg-[#F0FDF4] border border-[#BBF7D0] space-y-2">
              <p className="text-[11px] font-black text-[#166534] uppercase tracking-wider flex items-center gap-1.5">
                <span className="material-symbols-outlined icon-filled text-[#16A34A]" style={{ fontSize: 16 }}>
                  health_and_safety
                </span>
                Immediate First-Aid Steps
              </p>
              <div className="space-y-1.5">
                {medEmergency.firstAidSteps.map((step, idx) => (
                  <div key={idx} className="flex items-start gap-2">
                    <span className="font-black text-[#16A34A] text-xs flex-shrink-0 mt-0.5">✓</span>
                    <span className="text-xs text-[#1F2937] leading-tight">{step}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Primary Quick Emergency Call Buttons */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => callNumber('108')}
              className="h-11 rounded-2xl bg-[#DC2626] hover:bg-[#B91C1C] text-white font-black text-xs flex items-center justify-center gap-2 active:scale-95 shadow-md transition-all"
            >
              <span className="material-symbols-outlined icon-filled" style={{ fontSize: 18 }}>ambulance</span>
              <span>Call 108 (Ambulance)</span>
            </button>
            <button
              onClick={() => callNumber('112')}
              className="h-11 rounded-2xl bg-[#004ac6] hover:bg-[#003bb0] text-white font-black text-xs flex items-center justify-center gap-2 active:scale-95 shadow-md transition-all"
            >
              <span className="material-symbols-outlined icon-filled" style={{ fontSize: 18 }}>emergency</span>
              <span>Call 112 (SOS)</span>
            </button>
          </div>

          {/* Doctor Call if available in Profile */}
          {medicalProfile?.doctorPhone && (
            <button
              onClick={() => callNumber(medicalProfile.doctorPhone)}
              className="w-full h-10 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-700 font-bold text-xs flex items-center justify-center gap-2 active:scale-95"
            >
              <span className="material-symbols-outlined icon-filled" style={{ fontSize: 16 }}>local_hospital</span>
              <span>Call Doctor: {medicalProfile.doctorName || 'Personal Physician'} ({medicalProfile.doctorPhone})</span>
            </button>
          )}

          {/* Nearest Pharmacies & Hospitals */}
          {medEmergency.loading ? (
            <div className="flex items-center justify-center py-4 gap-2">
              <div className="w-4 h-4 border-2 border-[#10B981] border-t-transparent rounded-full animate-spin" />
              <p className="text-xs text-[#6B7280] font-bold">Locating nearest pharmacies and hospitals…</p>
            </div>
          ) : medEmergency.places?.length > 0 ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-black text-[#374151] uppercase tracking-wider">
                  Nearest Medical Facilities
                </p>
                <span className="text-[10px] text-[#059669] font-bold">
                  {medEmergency.places.length} found nearby
                </span>
              </div>

              <div className="space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar pr-0.5">
                {medEmergency.places.slice(0, 4).map((place, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-2.5 rounded-2xl bg-[#F9FAFB] border border-[#E5E7EB] hover:bg-slate-50 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-xs" style={{ color: place.type === 'hospital' ? '#DC2626' : '#10B981' }}>
                          {place.type === 'hospital' ? 'local_hospital' : 'local_pharmacy'}
                        </span>
                        <p className="text-xs font-black text-[#111827] truncate">{place.name}</p>
                      </div>
                      <p className="text-[10px] text-[#6B7280] truncate mt-0.5">
                        📍 {place.distanceLabel} · {place.openStatus}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                      {place.phone && (
                        <button
                          onClick={() => callNumber(place.phone)}
                          className="w-8 h-8 rounded-xl bg-[#10B981] text-white flex items-center justify-center active:scale-90 shadow-sm"
                          title="Call directly"
                        >
                          <span className="material-symbols-outlined icon-filled" style={{ fontSize: 15 }}>call</span>
                        </button>
                      )}
                      <button
                        onClick={() => handleOpenConfirm(place)}
                        className="px-2.5 h-8 rounded-xl bg-[#25D366] text-white text-[11px] font-black flex items-center gap-1 active:scale-90 shadow-sm"
                        title="Send pre-filled emergency WhatsApp"
                      >
                        <span>WhatsApp</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* Broadcast to WhatsApp button */}
          <button
            onClick={() => handleOpenConfirm(medEmergency.places?.[0] || null)}
            className="w-full h-11 rounded-2xl text-white font-black text-xs flex items-center justify-center gap-2 active:scale-95 shadow-lg transition-all"
            style={{ background: 'linear-gradient(135deg, #25D366, #128C7E)' }}
          >
            <span className="text-sm">💬</span>
            <span>Send Emergency WhatsApp Dispatch</span>
          </button>
        </div>
      </div>
    </>
  )
}

// ──────────────────────────────────────────────────────────────────────────────────────────
export default function ChatPage() {
  const navigate   = useNavigate()
  const { setSosActive, emergencyContacts, userLocation, user } = useAppStore()

  // ── Intro screen ──────────────────────────────────────────────────────────
  const [showIntro, setShowIntro] = useState(() => !localStorage.getItem(INTRO_KEY))
  const [readableAddress, setReadableAddress] = useState('')

  const handleIntroDone = () => {
    localStorage.setItem(INTRO_KEY, '1')
    setShowIntro(false)
  }

  // ── Medical Profile & Emergency State ─────────────────────────────────────
  const [medEmergency, setMedEmergency] = useState(null)
  const [medicalProfile, setMedicalProfile] = useState(null)

  useEffect(() => {
    async function fetchProfile() {
      const uid = auth?.currentUser?.uid || ''
      const prof = await loadMedicalProfile(uid)
      setMedicalProfile(prof)
    }
    fetchProfile()
  }, [user])

  const handleMedicalEmergency = useCallback(async (medicine, condition, targetFacility = 'all', profile = null) => {
    const lat = userLocation?.lat || 22.7225
    const lng = userLocation?.lng || 88.4815

    try {
      const places = await findNearbyMedicalHelp(lat, lng, targetFacility, 5000)
      setMedEmergency(prev => ({
        ...prev,
        places: places.slice(0, 6),
        loading: false,
        _profile: profile,
      }))

      // Auto-contact nearest hospital/pharmacy phone or fallback to doctor/108
      const nearestWithPhone = places.find(p => p.phone)
      if (nearestWithPhone && nearestWithPhone.phone) {
        callNumber(nearestWithPhone.phone)
      } else if (profile?.doctorPhone) {
        callNumber(profile.doctorPhone)
      } else {
        callNumber('108')
      }

      const uid = auth?.currentUser?.uid
      if (uid && places.length > 0) {
        setDoc(doc(db, 'users', uid, 'medicalEmergencies', `${Date.now()}`), {
          medicine,
          condition,
          lat,
          lng,
          nearestFacility: places[0]?.name || null,
          timestamp: serverTimestamp(),
        }).catch(() => {})
      }
    } catch (err) {
      console.warn('[handleMedicalEmergency auto-dial error]:', err)
      setMedEmergency(prev => ({ ...prev, loading: false }))
      // Fallback auto-contact on search failure
      if (profile?.doctorPhone) {
        callNumber(profile.doctorPhone)
      } else {
        callNumber('108')
      }
    }
  }, [userLocation])

  const dismissMedEmergency = useCallback(() => setMedEmergency(null), [])

  // ── Settings ──────────────────────────────────────────────────────────────
  const [settings, setSettings] = useState(loadSettings)
  const [showSettings, setShowSettings] = useState(false)

  const updateSettings = (patch) => {
    setSettings(prev => {
      const next = { ...prev, ...patch }
      try { localStorage.setItem('momo_settings', JSON.stringify(next)) } catch {}
      return next
    })
  }

  // â”€â”€ Messages â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [messages, setMessages]     = useState([{
    id: 1, sender: 'bot', streaming: false,
    text: "Hello! I'm Momo, your Safety Guardian! \n\nAsk me anything about safety, emergencies, or how to use this app. I'm always here for you!",
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    quickActions: [],
  }])
  const [input, setInput]           = useState('')
  const [isTyping, setIsTyping]     = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [lastUserMsg, setLastUserMsg] = useState('')

  // â”€â”€ Voice input â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const recognitionRef = useRef(null)
  const textareaRef    = useRef(null)
  const messagesEndRef = useRef(null)
  const messagesRef   = useRef([])          // always-current messages for sendMessage
  const streamRef      = useRef(null)
  const sendMessageRef = useRef(null)       // ref to latest sendMessage for Enter key
  const [isListening, setIsListening]   = useState(false)
  const [speechError, setSpeechError]   = useState('')

  // â”€â”€ Auto-scroll â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    messagesRef.current = messages   // sync ref so sendMessage always sees latest
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping, medEmergency])

  // ── Reverse geocode user location ─────────────────────────────────────────
  useEffect(() => {
    if (userLocation?.lat && userLocation?.lng) {
      reverseGeocode(userLocation.lat, userLocation.lng)
        .then(data => {
          if (data && data.display_name) {
            setReadableAddress(data.display_name)
          }
        })
        .catch(() => {})
    }
  }, [userLocation])

  // â”€â”€ Voice input init (PRESERVED from original) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    if (typeof window === 'undefined') return
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) return

    const rec = new SR()
    rec.continuous      = false
    rec.interimResults  = true
    rec.lang            = LANGUAGES[settings.language]?.code || 'en-IN'

    rec.onstart  = () => { setIsListening(true); setSpeechError('') }
    rec.onresult = (e) => {
      const t = Array.from(e.results).map(r => r[0].transcript).join('')
      setInput(t)
    }
    rec.onerror  = (e) => {
      setSpeechError(e.error === 'not-allowed' ? 'Microphone permission denied.' : 'Could not hear you. Try again.')
      setIsListening(false)
      // Recreate so it works again next time
      try { rec.abort() } catch {}
    }
    rec.onend = () => setIsListening(false)

    recognitionRef.current = rec
    return () => { try { rec.abort() } catch {} }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.language])

  const toggleVoice = useCallback(() => {
    if (!recognitionRef.current) { setSpeechError('Voice input not supported in this browser.'); return }
    if (isListening) { recognitionRef.current.stop() }
    else {
      setSpeechError('')
      try {
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition
        if (SR) {
          const rec = new SR()
          rec.continuous     = false
          rec.interimResults = true
          rec.lang           = LANGUAGES[settings.language]?.code || 'en-IN'
          rec.onstart  = () => { setIsListening(true); setSpeechError('') }
          rec.onresult = (e) => { setInput(Array.from(e.results).map(r => r[0].transcript).join('')) }
          rec.onerror  = (ev) => { setSpeechError(ev.error === 'not-allowed' ? 'Mic denied.' : 'Try again.'); setIsListening(false) }
          rec.onend    = () => setIsListening(false)
          recognitionRef.current = rec
          rec.start()
        }
      } catch {}
    }
  }, [isListening, settings.language])

  // â”€â”€ TTS controls â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const speak = useCallback((text) => {
    if (!settings.voiceEnabled || !text) return
    if (!window.speechSynthesis) return

    // Cancel any previous speech immediately
    window.speechSynthesis.cancel()

    // Robust regex to strip all emojis and special characters (so TTS doesn't speak them)
    const clean = text
      .replace(/\*\*/g, '')
      .replace(/\n/g, ' ')
      .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '')
      .trim()

    if (!clean) return

    const utt = new SpeechSynthesisUtterance(clean)
    utt.rate   = settings.speechRate
    utt.pitch  = settings.speechPitch
    utt.volume = settings.speechVolume
    utt.lang   = LANGUAGES[settings.language]?.code || 'en-IN'

    utt.onstart = () => setIsSpeaking(true)
    utt.onend   = () => setIsSpeaking(false)
    utt.onerror = () => setIsSpeaking(false)

    const doSpeak = () => {
      const voices = window.speechSynthesis.getVoices()
      const match = voices.find(v =>
        /female|woman|zira|siri|samantha|heera|veena|lekha|karen|moira/i.test(v.name)
      ) || voices.find(v => v.lang.startsWith(utt.lang.split('-')[0]))

      if (match) utt.voice = match

      // Crucial: Chrome has a bug where synchronous cancel() followed by speak()
      // causes the utterance to be ignored. Wrapping speak in a setTimeout resolves this.
      setTimeout(() => {
        window.speechSynthesis.speak(utt)
      }, 60)
    }

    if (window.speechSynthesis.getVoices().length > 0) {
      doSpeak()
    } else {
      window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.onvoiceschanged = null
        doSpeak()
      }
    }
  }, [settings])

  const stopSpeaking = () => {
    window.speechSynthesis?.cancel()
    setIsSpeaking(false)
  }

  // Cleanup TTS on unmount
  useEffect(() => () => { window.speechSynthesis?.cancel() }, [])

  // â”€â”€ Streaming text reveal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const streamBotReply = useCallback((fullText, msgId, actions, isSoftEmergency) => {
    const words = fullText.split(' ')
    let i = 0
    if (streamRef.current) clearInterval(streamRef.current)
    streamRef.current = setInterval(() => {
      i++
      const partial = words.slice(0, i).join(' ')
      setMessages(prev => prev.map(m =>
        m.id === msgId ? { ...m, text: partial, streaming: i < words.length } : m
      ))
      if (i >= words.length) {
        clearInterval(streamRef.current)
        streamRef.current = null
        setMessages(prev => prev.map(m =>
          m.id === msgId
            ? { ...m, text: fullText, streaming: false, quickActions: actions }
            : m
        ))
      }
    }, 55)
  }, [settings, speak])

  // â”€â”€ Copy to clipboard â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const copyMessage = (text) => {
    navigator.clipboard?.writeText(text).catch(() => {})
  }

  // â”€â”€ Regenerate last reply â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const regenerate = useCallback(() => {
    if (!lastUserMsg) return
    // Remove last bot message and re-send
    setMessages(prev => {
      const lastBotIdx = [...prev].reverse().findIndex(m => m.sender === 'bot')
      if (lastBotIdx === -1) return prev
      return prev.slice(0, prev.length - 1 - lastBotIdx + (prev.length - 1 - lastBotIdx))
    })
    sendMessage(lastUserMsg, true)
  }, [lastUserMsg])

  // â”€â”€ Clear chat â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const clearChat = () => {
    window.speechSynthesis?.cancel()
    setMessages([{
      id: Date.now(), sender: 'bot', streaming: false,
      text: "Chat cleared!  I'm still here â€” ask me anything!",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      quickActions: [],
    }])
  }

  // â”€â”€ Quick actions handler â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const handleQuickAction = (action) => {
    switch (action) {
      case 'CALL_108':
        callNumber('108')
        break
      case 'SOS':
        setSosActive(true)
        navigate('/emergency')
        break
      case 'HOSPITAL':
      case 'PHARMACY':
        navigate('/')
        break
      case 'POLICE':
        navigate('/')
        break
      case 'ROUTE':
        navigate('/search')
        break
      case 'CONTACTS':
        navigate('/profile')
        break
      case 'REPORT':
        navigate('/reports')
        break
    }
  }

  // -- Send message (Gemini-powered, bug-free) --------------------------------
  const sendMessage = useCallback(async (text, isRegenerate = false) => {
    const trimmed = (text || input).trim()
    if (!trimmed || isTyping) return

    window.speechSynthesis?.cancel()
    setIsSpeaking(false)

    const { isHard, isSoft } = detectEmergency(trimmed)
    if (isHard) {
      setInput('')
      setSosActive(true)
      navigate('/emergency')
      return
    }

    const ts = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

    // Capture history BEFORE adding the new user message.
    const historySnapshot = messagesRef.current

    // Pre-compute unique IDs so they can never collide inside React batching.
    const userId = Date.now()
    const botId  = userId + 9999

    if (!isRegenerate) {
      setMessages(prev => [
        ...prev,
        { id: userId, sender: 'user', text: trimmed, timestamp: ts, quickActions: [] }
      ])
      setLastUserMsg(trimmed)
      setInput('')
    }

    setIsTyping(true)

    // 1. Deep Gemini Medical Triaging with User's Medical Profile Context
    let medResult = { isMedical: false }
    try {
      const geminiAnalysis = await analyzeMedicalEmergencyWithGemini(trimmed, medicalProfile)
      if (geminiAnalysis?.isMedical) {
        medResult = detectMedicalEmergency(trimmed, medicalProfile, geminiAnalysis)
      }
    } catch (e) {
      console.warn('[Gemini Medical Triaging Check]:', e)
    }

    // 2. Offline Conversational Pattern Fallback (if Gemini fails or offline)
    if (!medResult.isMedical) {
      medResult = detectMedicalEmergency(trimmed, medicalProfile)
    }

    // If Medical Emergency Detected
    if (medResult.isMedical) {
      setIsTyping(false)
      const botText = `${medResult.reassurance}\n\n**Suspected:** ${medResult.condition}\n**Recommended Aid:** ${medResult.medicine}\n\nI have prepared the emergency dispatch and located nearby medical support for you below.`

      setMessages(prev => [
        ...prev,
        {
          id: botId,
          sender: 'bot',
          streaming: false,
          text: botText,
          timestamp: ts,
          quickActions: [
            { label: '📞 Call 108 Ambulance', action: 'CALL_108' },
            { label: '🏥 Nearby Hospital', action: 'HOSPITAL' },
            { label: '💊 Nearby Pharmacy', action: 'PHARMACY' },
            { label: '🆘 Trigger SOS', action: 'SOS' },
          ],
        },
      ])

      setMedEmergency({
        ...medResult,
        places: [],
        loading: true,
        _profile: medicalProfile,
      })

      handleMedicalEmergency(medResult.medicine, medResult.condition, medResult.targetFacility, medicalProfile)
      if (settings.voiceEnabled && settings.autoPlayVoice) speak(medResult.reassurance)
      return
    }

    // Normal Momo Logic
    const softPreamble = isSoft
      ? 'The user may be distressed or in danger. Be warm, calm them first, then guide them to tap SOS or call 112. '
      : ''
    const messageToSend = softPreamble + trimmed
    let bubbleAdded = false

    try {
      let accumulated = ''
      await askMomo(
        messageToSend,
        historySnapshot,   // messages BEFORE the current user message
        medicalProfile,    // Injected medical context
        (chunk) => {
          accumulated += chunk
          if (!bubbleAdded) {
            bubbleAdded = true
            setIsTyping(false)
            setMessages(prev => [
              ...prev,
              { id: botId, sender: 'bot', text: accumulated, streaming: true, timestamp: ts, quickActions: [] }
            ])
          } else {
            setMessages(prev => prev.map(m =>
              m.id === botId ? { ...m, text: accumulated } : m
            ))
          }
        },
        { lat: userLocation?.lat, lng: userLocation?.lng, address: readableAddress }
      )
      const actions = getQuickActions(accumulated, isSoft)
      setMessages(prev => prev.map(m =>
        m.id === botId
          ? { ...m, text: accumulated, streaming: false, quickActions: actions }
          : m
      ))
      if (settings.voiceEnabled && settings.autoPlayVoice) speak(accumulated)
    } catch {
      if (!bubbleAdded) {
        setMessages(prev => [
          ...prev,
          { id: botId, sender: 'bot', text: MOMO_ERROR_FALLBACK, streaming: false, timestamp: ts, quickActions: [] }
        ])
      } else {
        setMessages(prev => prev.map(m =>
          m.id === botId
            ? { ...m, text: MOMO_ERROR_FALLBACK, streaming: false, quickActions: [] }
            : m
        ))
      }
    } finally {
      setIsTyping(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input, isTyping, settings, navigate, setSosActive, speak, medicalProfile, handleMedicalEmergency])
  // Keep sendMessageRef in sync so the Enter onKeyDown always calls latest version
  useEffect(() => { sendMessageRef.current = sendMessage }, [sendMessage])

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // RENDER
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  return (
    <>
      {/* â”€â”€ First-time intro screen â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {showIntro && <IntroScreen onDone={handleIntroDone} />}

      <div
        className="relative w-full h-full flex flex-col overflow-hidden"
        style={{ background: 'linear-gradient(180deg, #f0fdf4 0%, #f8fafc 100%)' }}
      >
        <style>{`
          @keyframes msgIn {
            from { opacity: 0; transform: translateY(10px) scale(0.97); }
            to   { opacity: 1; transform: translateY(0) scale(1); }
          }
          .msg-enter { animation: msgIn 0.28s ease both; }
          .blink-cursor::after {
            content: '|'; animation: blink 0.8s step-end infinite;
            color: #10B981; margin-left: 1px;
          }
          @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
          .quick-action-btn:active { transform: scale(0.93); }
        `}</style>

        {/* â”€â”€ Header â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <div
          className="flex items-center gap-3 px-4 pt-11 pb-3 flex-shrink-0"
          style={{
            background: 'rgba(255,255,255,0.92)',
            backdropFilter: 'blur(20px)',
            borderBottom: '1px solid rgba(16,185,129,0.12)',
            boxShadow: '0 2px 16px rgba(16,185,129,0.06)',
          }}
        >
          {/* Back */}
          <button
            onClick={() => navigate(-1)}
            className="w-9 h-9 rounded-xl flex items-center justify-center active:scale-90 transition-transform flex-shrink-0"
            style={{ background: '#f0fdf4', border: '1px solid rgba(16,185,129,0.2)' }}
          >
            <span className="material-symbols-outlined text-[#059669]" style={{ fontSize: 20 }}>arrow_back</span>
          </button>

          {/* Momo avatar */}
          <div className="relative flex-shrink-0">
            <img
              src="/momo-avatar.jpg"
              alt="Momo"
              className="w-10 h-10 rounded-full object-cover"
              style={{ border: '2px solid rgba(16,185,129,0.4)', boxShadow: '0 2px 10px rgba(16,185,129,0.25)' }}
            />
            <div
              className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-[#10B981]"
              style={{ border: '2px solid white' }}
            />
          </div>

          {/* Name + status */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black text-[#064e3b] leading-tight">Momo </p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <div className="w-1.5 h-1.5 rounded-full bg-[#10B981] animate-pulse" />
              <p className="text-[10px] text-[#10B981] font-bold">Your Safety Guardian Â· Always On</p>
            </div>
          </div>

          {/* Speaking indicator */}
          {isSpeaking && (
            <button
              onClick={stopSpeaking}
              className="flex items-center gap-1 px-2 py-1 rounded-lg active:scale-90 transition-transform"
              style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)' }}
            >
              <span className="material-symbols-outlined text-[#10B981] animate-pulse" style={{ fontSize: 14 }}>volume_up</span>
              <span className="text-[10px] font-bold text-[#10B981]">Stop</span>
            </button>
          )}

          {/* Clear chat */}
          <button
            onClick={clearChat}
            className="w-9 h-9 rounded-xl flex items-center justify-center active:scale-90 transition-transform flex-shrink-0"
            style={{ background: '#f0fdf4', border: '1px solid rgba(16,185,129,0.2)' }}
            title="Clear chat"
          >
            <span className="material-symbols-outlined text-[#059669]" style={{ fontSize: 18 }}>delete_sweep</span>
          </button>

          {/* Settings */}
          <button
            onClick={() => setShowSettings(s => !s)}
            className="w-9 h-9 rounded-xl flex items-center justify-center active:scale-90 transition-transform flex-shrink-0"
            style={{
              background: showSettings ? '#10B981' : '#f0fdf4',
              border: '1px solid rgba(16,185,129,0.2)',
            }}
            title="Settings"
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: 18, color: showSettings ? 'white' : '#059669' }}
            >
              settings
            </span>
          </button>
        </div>

        {/* â”€â”€ Settings Panel â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        {showSettings && (
          <div
            className="flex-shrink-0 px-4 py-4 space-y-4"
            style={{
              background: 'rgba(240,253,244,0.97)',
              borderBottom: '1px solid rgba(16,185,129,0.12)',
            }}
          >
            {/* Voice toggle */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-[#064e3b]"> Voice Responses</p>
                <p className="text-[10px] text-[#059669]/70">Momo will speak her replies aloud</p>
              </div>
              <button
                onClick={() => updateSettings({ voiceEnabled: !settings.voiceEnabled })}
                className="w-12 h-6 rounded-full relative transition-all"
                style={{ background: settings.voiceEnabled ? '#10B981' : '#c3c6d7' }}
              >
                <div
                  className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all"
                  style={{ left: settings.voiceEnabled ? 26 : 2 }}
                />
              </button>
            </div>

            {/* Speed */}
            <div>
              <div className="flex justify-between mb-1">
                <p className="text-xs font-bold text-[#064e3b]"> Speech Speed</p>
                <p className="text-xs text-[#059669]">{settings.speechRate.toFixed(1)}x</p>
              </div>
              <input type="range" min="0.5" max="1.5" step="0.05"
                value={settings.speechRate}
                onChange={e => updateSettings({ speechRate: parseFloat(e.target.value) })}
                className="w-full accent-emerald-500"
              />
            </div>

            {/* Pitch */}
            <div>
              <div className="flex justify-between mb-1">
                <p className="text-xs font-bold text-[#064e3b]"> Voice Pitch</p>
                <p className="text-xs text-[#059669]">{settings.speechPitch.toFixed(1)}</p>
              </div>
              <input type="range" min="0.5" max="2" step="0.05"
                value={settings.speechPitch}
                onChange={e => updateSettings({ speechPitch: parseFloat(e.target.value) })}
                className="w-full accent-emerald-500"
              />
            </div>

            {/* Language */}
            <div>
              <p className="text-xs font-bold text-[#064e3b] mb-2"> Response Language</p>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(LANGUAGES).map(([code, lang]) => (
                  <button
                    key={code}
                    onClick={() => updateSettings({ language: code })}
                    className="px-2.5 py-1 rounded-lg text-xs font-semibold transition-all active:scale-90"
                    style={{
                      background: settings.language === code ? '#10B981' : 'rgba(16,185,129,0.1)',
                      color: settings.language === code ? 'white' : '#059669',
                      border: settings.language === code ? 'none' : '1px solid rgba(16,185,129,0.2)',
                    }}
                  >
                    {lang.flag} {lang.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* â”€â”€ Messages â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4" style={{ overscrollBehavior: 'contain' }}>
          {messages.map((msg, msgIdx) => {
            const isUser = msg.sender === 'user'
            const isLast = msgIdx === messages.length - 1
            return (
              <div key={msg.id} className={`flex flex-col msg-enter ${isUser ? 'items-end' : 'items-start'}`}>
                <div className={`flex gap-2 max-w-[88%] ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>

                  {/* Momo avatar on bot messages */}
                  {!isUser && (
                    <img
                      src="/momo-avatar.jpg"
                      alt="Momo"
                      className="w-8 h-8 rounded-full object-cover flex-shrink-0 self-end"
                      style={{ border: '1.5px solid rgba(16,185,129,0.3)', boxShadow: '0 2px 8px rgba(16,185,129,0.2)' }}
                    />
                  )}

                  {/* Bubble */}
                  <div>
                    <div
                      className={`rounded-2xl px-4 py-3 ${isUser ? 'rounded-tr-sm' : 'rounded-tl-sm'} ${msg.streaming ? 'blink-cursor' : ''}`}
                      style={
                        isUser
                          ? { background: 'linear-gradient(135deg, #10B981, #059669)', color: 'white', boxShadow: '0 4px 14px rgba(16,185,129,0.3)' }
                          : { background: 'white', color: '#191c1e', border: '1px solid rgba(16,185,129,0.12)', boxShadow: '0 2px 10px rgba(0,0,0,0.05)' }
                      }
                    >
                      <div className="text-sm leading-relaxed">
                        {msg.text ? renderText(msg.text) : (
                          <span className="text-gray-400 italic text-xs">Thinkingâ€¦</span>
                        )}
                      </div>
                    </div>

                    {/* Quick actions */}
                    {!isUser && !msg.streaming && msg.quickActions?.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2 ml-1">
                        {msg.quickActions.map((qa, i) => (
                          <button
                            key={i}
                            onClick={() => handleQuickAction(qa.action)}
                            className="quick-action-btn px-3 py-1.5 rounded-xl text-xs font-bold transition-all"
                            style={{
                              background: qa.action === 'SOS' || qa.action === 'CALL_108'
                                ? 'linear-gradient(135deg, #EF4444, #DC2626)'
                                : 'rgba(16,185,129,0.12)',
                              color: qa.action === 'SOS' || qa.action === 'CALL_108' ? 'white' : '#059669',
                              border: qa.action === 'SOS' || qa.action === 'CALL_108' ? 'none' : '1px solid rgba(16,185,129,0.25)',
                              boxShadow: qa.action === 'SOS' || qa.action === 'CALL_108' ? '0 3px 10px rgba(239,68,68,0.35)' : 'none',
                            }}
                          >
                            {qa.label}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Per-message actions: copy + speak + regenerate */}
                    {!isUser && !msg.streaming && isLast && (
                      <div className="flex gap-2 mt-1.5 ml-1">
                        <button
                          onClick={() => copyMessage(msg.text)}
                          className="flex items-center gap-0.5 px-2 py-0.5 rounded-lg text-[10px] font-bold active:scale-90 transition-all"
                          style={{ background: 'rgba(16,185,129,0.08)', color: '#059669' }}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: 11 }}>content_copy</span> Copy
                        </button>
                        {settings.voiceEnabled && (
                          <button
                            onClick={() => speak(msg.text)}
                            className="flex items-center gap-0.5 px-2 py-0.5 rounded-lg text-[10px] font-bold active:scale-90 transition-all"
                            style={{ background: 'rgba(16,185,129,0.08)', color: '#059669' }}
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: 11 }}>volume_up</span> Speak
                          </button>
                        )}
                        <button
                          onClick={() => { window.speechSynthesis?.cancel(); sendMessage(lastUserMsg, false) }}
                          className="flex items-center gap-0.5 px-2 py-0.5 rounded-lg text-[10px] font-bold active:scale-90 transition-all"
                          style={{ background: 'rgba(16,185,129,0.08)', color: '#059669' }}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: 11 }}>refresh</span> Retry
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Timestamp */}
                <p className="text-[9px] text-[#737686] mt-1 mx-1 font-medium">{msg.timestamp}</p>
              </div>
            )
          })}

          {/* Typing indicator */}
          {isTyping && (
            <div className="flex items-end gap-2 msg-enter">
              <img
                src="/momo-avatar.jpg"
                alt="Momo"
                className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                style={{ border: '1.5px solid rgba(16,185,129,0.3)' }}
              />
              <div
                className="rounded-2xl rounded-tl-sm px-4 py-3 flex gap-1 items-center"
                style={{ background: 'white', border: '1px solid rgba(16,185,129,0.12)', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}
              >
                {[0, 150, 300].map(delay => (
                  <div
                    key={delay}
                    className="w-2 h-2 rounded-full animate-bounce"
                    style={{ background: '#10B981', opacity: 0.7, animationDelay: `${delay}ms` }}
                  />
                ))}
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Medical Emergency Card Mounting Point */}
        {medEmergency && (
          <MedicalEmergencyCard
            medEmergency={medEmergency}
            onDismiss={dismissMedEmergency}
            userName={user?.name}
            userLocation={userLocation}
            medicalProfile={medicalProfile}
          />
        )}

        {/* â”€â”€ Input Area â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <div
          className="flex-shrink-0 px-4 pt-3 pb-5"
          style={{
            background: 'rgba(255,255,255,0.97)',
            backdropFilter: 'blur(20px)',
            borderTop: '1px solid rgba(16,185,129,0.1)',
            boxShadow: '0 -4px 20px rgba(16,185,129,0.04)',
          }}
        >
          {/* Quick chips */}
          <div className="flex gap-2 overflow-x-auto pb-3" style={{ scrollbarWidth: 'none' }}>
            {QUICK_CHIPS.map((chip, i) => (
              <button
                key={i}
                onClick={() => sendMessage(chip.text)}
                className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all active:scale-95"
                style={{
                  background: 'rgba(16,185,129,0.08)',
                  color: '#059669',
                  border: '1px solid rgba(16,185,129,0.2)',
                  whiteSpace: 'nowrap',
                }}
              >
                {chip.label}
              </button>
            ))}
          </div>

          {/* Speech error */}
          {speechError && <p className="text-xs text-[#EF4444] mb-2 ml-1">{speechError}</p>}

          {/* Listening banner */}
          {isListening && (
            <div
              className="flex items-center gap-2 rounded-xl px-3 py-2 mb-2"
              style={{ background: 'rgba(27,94,32,0.1)', border: '1px solid rgba(27,94,32,0.3)' }}
            >
              <div className="flex gap-0.5">
                {[0, 100, 200].map(d => (
                  <div
                    key={d}
                    className="w-1 rounded-full animate-bounce"
                    style={{ height: 12 + (d / 100) * 4, background: '#1B5E20', animationDelay: `${d}ms` }}
                  />
                ))}
              </div>
              <p className="text-xs font-bold text-[#1B5E20]">Momo is listeningâ€¦ speak now</p>
            </div>
          )}

          {/* Input row */}
          <div className="flex items-end gap-2">
            {/* Mic */}
            <button
              onClick={toggleVoice}
              title={isListening ? 'Stop listening' : 'Speak your message'}
              className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 transition-all active:scale-90"
              style={{
                background: isListening ? 'rgba(27,94,32,0.15)' : 'rgba(16,185,129,0.08)',
                border: isListening ? '1.5px solid rgba(27,94,32,0.5)' : '1.5px solid rgba(16,185,129,0.2)',
              }}
            >
              <span
                className={`material-symbols-outlined text-[20px] ${isListening ? 'icon-filled animate-pulse' : ''}`}
                style={{ color: isListening ? '#1B5E20' : '#10B981' }}
              >
                {isListening ? 'mic' : 'mic_none'}
              </span>
            </button>

            {/* Textarea */}
            <div
              className="flex-1 rounded-2xl px-4 py-3 flex items-center transition-all"
              style={{
                background: '#f0fdf4',
                border: `1.5px solid ${isListening ? 'rgba(16,185,129,0.4)' : 'rgba(16,185,129,0.2)'}`,
                minHeight: 48,
              }}
            >
              <textarea
                ref={textareaRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessageRef.current(e.currentTarget.value) }
                }}
                placeholder={isListening ? 'Listeningâ€¦' : 'Ask Momo anything about safetyâ€¦'}
                className="w-full bg-transparent outline-none text-sm text-[#191c1e] resize-none leading-relaxed placeholder:text-[#a7f3d0]"
                style={{ maxHeight: 96 }}
                rows={1}
              />
            </div>

            {/* Send */}
            <button
              onClick={() => sendMessage(input)}
              disabled={!input.trim()}
              className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 transition-all active:scale-90"
              style={{
                background: input.trim() ? 'linear-gradient(135deg, #10B981, #059669)' : '#f0fdf4',
                color: input.trim() ? 'white' : '#a7f3d0',
                boxShadow: input.trim() ? '0 4px 14px rgba(16,185,129,0.4)' : 'none',
                border: input.trim() ? 'none' : '1.5px solid rgba(16,185,129,0.2)',
              }}
            >
              <span className="material-symbols-outlined icon-filled text-[20px]">send</span>
            </button>
          </div>
        </div>
      </div>
    </>
  )
}