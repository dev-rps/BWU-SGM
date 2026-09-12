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
import { supabase } from '../../supabase/supabase'

import {
  detectEmergency,
  detectLanguage,
  getQuickActions,
  getBotReply,
  LANGUAGES,
} from '../../services/momoAI'
import { askMomo, analyzeMedicalEmergencyWithGemini, MOMO_ERROR_FALLBACK } from '../../services/gemini'
import { reverseGeocode, searchPlaces } from '../../services/nominatim'
import { findNearbyMechanics } from '../../services/mechanicService'
import { loadContacts } from '../../services/contactsService'

import {
  detectMedicalEmergency,
  findNearbyMedicalHelp,
  buildMedicalEmergencyMessage,
  sendMedicalWhatsApp,
  callNumber,
} from '../../services/medicalEmergency'
import { loadMedicalProfile, hasMedicalData } from '../../services/medicalService'
import { speak as playPiperTTS, stopSpeaking as stopAllTTS, checkPiperHealth, createSpeechQueue } from '../../services/ttsService'

const INTRO_KEY = 'momo_introduced_v1'
const CHAT_STORAGE_KEY = 'momo_chat_history_v2'

const DEFAULT_WELCOME_MSG = {
  id: 1,
  sender: 'bot',
  streaming: false,
  text: "Hello! I'm Momo, your Safety Guardian! \n\nAsk me anything about safety, emergencies, or how to use this app. I'm always here for you!",
  timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  quickActions: [],
}

function loadSavedMessages() {
  try {
    const raw = localStorage.getItem(CHAT_STORAGE_KEY)
    if (!raw) return [DEFAULT_WELCOME_MSG]
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed.map(m => ({ ...m, streaming: false }))
    }
    return [DEFAULT_WELCOME_MSG]
  } catch {
    return [DEFAULT_WELCOME_MSG]
  }
}

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

// ─── Quick Chips ─────────────────────────────────────────────────────────────
const QUICK_CHIPS = [
  { icon: 'medical_services', label: 'Medical Profile',     text: 'What is in my medical profile?' },
  { icon: 'contacts',         label: 'Emergency Contacts',  text: 'Who are my emergency contacts?' },
  { icon: 'build',            label: 'Find Mechanic',       text: 'My car broke down, locate nearest mechanic' },
  { icon: 'near_me',          label: 'Safe Route',          text: 'Show me road to Howrah' },
  { icon: 'emergency',        label: 'Emergency Numbers',   text: 'What are the emergency numbers in India?' },
  { icon: 'sos',              label: 'How to SOS',          text: 'How do I trigger an SOS alert?' },
  { icon: 'shield',           label: 'Women Safety',        text: 'Give me women safety tips' },
  { icon: 'local_hospital',   label: 'Find Hospital',       text: 'Find nearest hospital and call ambulance' },
  { icon: 'health_and_safety',label: 'First Aid',           text: 'Give me basic first aid tips' },
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
function speakText(text, settings) {
  if (!settings?.voiceEnabled) return
  // Route all speech through Piper Ryan High -- auto-falls back if backend offline
  import('../../services/ttsService').then(({ speak }) => {
    speak(text).catch(() => {})
  })
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

// ── Call Confirmation Modal (Shows recipient name before opening dialpad) ────
function CallConfirmModal({ isOpen, onClose, onConfirm, name, phone, role }) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl border border-[#E5E7EB] animate-scale-up">
        {/* Modal Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-[#1B4332] to-[#2D6A4F] text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center">
              <span className="material-symbols-outlined icon-filled" style={{ fontSize: 20 }}>call</span>
            </div>
            <div>
              <h3 className="font-black text-sm">Confirm Phone Call</h3>
              <p className="text-[10px] text-white/80">Safety Guardian Direct Dial</p>
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center">
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4">
          <div className="p-4 bg-[#F0FDF4] rounded-2xl border border-[#BBF7D0] flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-[#10B981] text-white flex items-center justify-center font-black text-lg flex-shrink-0 shadow-sm">
              <span className="material-symbols-outlined" style={{ fontSize: 26 }}>person</span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-black text-[#059669] uppercase tracking-wider">Calling Contact</p>
              <p className="text-base font-black text-[#111827] truncate">{name || 'Emergency Number'}</p>
              {role && <p className="text-xs text-[#4B5563] font-medium truncate">{role}</p>}
              <p className="text-sm font-bold text-[#065F46] mt-0.5 tracking-wide">{phone}</p>
            </div>
          </div>

          <p className="text-xs text-[#6B7280] leading-relaxed">
            Safety Guardian will open your phone&apos;s dialpad to place this call. Tap below to proceed.
          </p>

          {/* Action Buttons */}
          <div className="flex gap-2 pt-1">
            <button
              onClick={onClose}
              className="flex-1 py-3 rounded-2xl border border-[#D1D5DB] text-xs font-bold text-[#4B5563] hover:bg-slate-50 active:scale-95 transition-all"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              className="flex-1 py-3 rounded-2xl bg-[#10B981] hover:bg-[#059669] text-white text-xs font-black shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-1.5 active:scale-95 transition-all"
            >
              <span className="material-symbols-outlined icon-filled" style={{ fontSize: 18 }}>call</span>
              <span>Call Now</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Mechanic & Vehicle Breakdown Card ───────────────────────────────────────
function MechanicBreakdownCard({ mechanicEmergency, onDismiss, onCall, onNavigate }) {
  if (!mechanicEmergency) return null

  return (
    <div className="mx-4 mb-3 mt-2 rounded-3xl overflow-hidden shadow-xl border-2 border-amber-500 bg-white animate-slide-up">
      {/* Header */}
      <div className="px-4 py-3 bg-gradient-to-r from-amber-600 to-amber-500 text-white flex items-center justify-between">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-lg flex-shrink-0 animate-pulse">
            🔧
          </span>
          <div className="min-w-0">
            <span className="text-[9px] font-black uppercase tracking-wider bg-white/25 px-2 py-0.5 rounded-full">
              Vehicle Assistance
            </span>
            <p className="text-xs font-bold truncate mt-0.5 text-white/95">
              Nearby Mechanics &amp; Garages
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
        {/* Safety tip */}
        <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 flex items-start gap-2.5">
          <span className="material-symbols-outlined text-amber-600 icon-filled flex-shrink-0" style={{ fontSize: 18 }}>
            warning
          </span>
          <p className="text-[11px] text-amber-950 font-medium leading-tight">
            Turn on your hazard lights, stay on the road shoulder or safe pavement, and call the nearest garage below.
          </p>
        </div>

        {/* List of Mechanics */}
        {mechanicEmergency.loading ? (
          <div className="flex items-center justify-center py-4 gap-2">
            <div className="w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-[#6B7280] font-bold">Scanning for automobile mechanics &amp; garages…</p>
          </div>
        ) : mechanicEmergency.places?.length > 0 ? (
          <div className="space-y-2 max-h-56 overflow-y-auto custom-scrollbar pr-0.5">
            {mechanicEmergency.places.slice(0, 5).map((place, idx) => (
              <div
                key={idx}
                className="p-3 rounded-2xl bg-[#F9FAFB] border border-[#E5E7EB] hover:bg-slate-50 transition-colors flex items-center justify-between"
              >
                <div className="min-w-0 flex-1 pr-2">
                  <div className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-amber-600 text-sm">build</span>
                    <p className="text-xs font-black text-[#111827] truncate">{place.name}</p>
                  </div>
                  <p className="text-[10px] text-[#6B7280] truncate mt-0.5">
                    📍 {place.distanceLabel} · {place.specialty || place.address}
                  </p>
                </div>

                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {place.phone && (
                    <button
                      onClick={() => onCall(place.name, place.phone, place.specialty || 'Mechanic')}
                      className="px-2.5 h-8 rounded-xl bg-[#10B981] hover:bg-[#059669] text-white text-[11px] font-black flex items-center gap-1 active:scale-90 shadow-sm"
                      title="Call Mechanic"
                    >
                      <span className="material-symbols-outlined icon-filled" style={{ fontSize: 14 }}>call</span>
                      <span>Call</span>
                    </button>
                  )}
                  <button
                    onClick={() => onNavigate(place)}
                    className="px-2.5 h-8 rounded-xl bg-[#004ac6] hover:bg-[#003bb0] text-white text-[11px] font-black flex items-center gap-1 active:scale-90 shadow-sm"
                    title="Navigate to Garage"
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 14 }}>near_me</span>
                    <span>Route</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-[#6B7280] text-center py-2">
            No mechanics found in immediate radius. Call Highway Helpline: <strong>1033</strong>
          </p>
        )}
      </div>
    </div>
  )
}

// ── Hospital & Emergency Medical Facility Card ─────────────────────────────
function HospitalEmergencyCard({ hospitalEmergency, onDismiss, onCall, onNavigate }) {
  if (!hospitalEmergency) return null

  return (
    <div className="mx-4 mb-3 mt-2 rounded-3xl overflow-hidden shadow-xl border-2 border-red-500 bg-white animate-slide-up">
      {/* Header */}
      <div className="px-4 py-3 bg-gradient-to-r from-red-600 to-rose-600 text-white flex items-center justify-between">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-lg flex-shrink-0 animate-pulse">
            🏥
          </span>
          <div className="min-w-0">
            <span className="text-[9px] font-black uppercase tracking-wider bg-white/25 px-2 py-0.5 rounded-full">
              Emergency Medical Care
            </span>
            <p className="text-xs font-bold truncate mt-0.5 text-white/95">
              Nearby Hospitals &amp; Trauma Centers
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
        {/* Quick Emergency Hotlines */}
        <div className="flex gap-2">
          <button
            onClick={() => onCall('108 Ambulance Dispatch', '108', 'Emergency Ambulance')}
            className="flex-1 py-2.5 px-3 rounded-2xl bg-red-600 hover:bg-red-700 text-white font-black text-xs flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-all"
          >
            <span className="material-symbols-outlined icon-filled" style={{ fontSize: 16 }}>ambulance</span>
            <span>Call 108 (Ambulance)</span>
          </button>
          <button
            onClick={() => onCall('National Emergency', '112', 'SOS')}
            className="flex-1 py-2.5 px-3 rounded-2xl bg-[#004ac6] hover:bg-[#003bb0] text-white font-black text-xs flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-all"
          >
            <span className="material-symbols-outlined icon-filled" style={{ fontSize: 16 }}>emergency</span>
            <span>Call 112 (SOS)</span>
          </button>
        </div>

        {/* List of Hospitals with Call & Route Buttons */}
        {hospitalEmergency.loading ? (
          <div className="flex items-center justify-center py-4 gap-2">
            <div className="w-4 h-4 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-[#6B7280] font-bold">Scanning for verified hospitals &amp; emergency centers…</p>
          </div>
        ) : hospitalEmergency.places?.length > 0 ? (
          <div className="space-y-2 max-h-56 overflow-y-auto custom-scrollbar pr-0.5">
            {hospitalEmergency.places.slice(0, 5).map((place, idx) => (
              <div
                key={idx}
                className="p-3 rounded-2xl bg-[#F9FAFB] border border-[#E5E7EB] hover:bg-slate-50 transition-colors flex items-center justify-between"
              >
                <div className="min-w-0 flex-1 pr-2">
                  <div className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-red-600 text-sm">local_hospital</span>
                    <p className="text-xs font-black text-[#111827] truncate">{place.name}</p>
                  </div>
                  <p className="text-[10px] text-[#6B7280] truncate mt-0.5">
                    📍 {place.distanceLabel} {place.etaMinutes ? `· ~${place.etaMinutes} min` : ''} · {place.openStatus || '24/7 Emergency'}
                  </p>
                </div>

                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => onCall(place.name, place.phone || '108', 'Hospital')}
                    className="px-2.5 h-8 rounded-xl bg-[#10B981] hover:bg-[#059669] text-white text-[11px] font-black flex items-center gap-1 active:scale-90 shadow-sm transition-all"
                    title={place.phone ? `Call ${place.name}` : 'Call 108'}
                  >
                    <span className="material-symbols-outlined icon-filled" style={{ fontSize: 14 }}>call</span>
                    <span>{place.phone ? 'Call' : '108'}</span>
                  </button>

                  <button
                    onClick={() => onNavigate(place)}
                    className="px-2.5 h-8 rounded-xl bg-[#004ac6] hover:bg-[#003bb0] text-white text-[11px] font-black flex items-center gap-1 active:scale-90 shadow-sm transition-all"
                    title="Navigate to Hospital"
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 14 }}>near_me</span>
                    <span>Route</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-[#6B7280] text-center py-2">
            No hospitals located in immediate radius. Call Emergency Ambulance: <strong>108</strong>
          </p>
        )}
      </div>
    </div>
  )
}

// ── Navigation Launch Card ──────────────────────────────────────────────────
function NavigationLaunchCard({ navCard, onDismiss, onStartNavigation }) {
  if (!navCard) return null

  return (
    <div className="mx-4 mb-3 mt-2 rounded-3xl overflow-hidden shadow-xl border-2 border-[#1B4332] bg-white animate-slide-up">
      <div className="px-4 py-3 bg-gradient-to-r from-[#1B4332] to-[#2D6A4F] text-white flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-base flex-shrink-0">
            🗺️
          </span>
          <div className="min-w-0">
            <span className="text-[9px] font-black uppercase tracking-wider bg-white/25 px-2 py-0.5 rounded-full">
              Safe Route Found
            </span>
            <p className="text-xs font-bold truncate mt-0.5 text-white/95">
              {navCard.destination?.name || 'Destination'}
            </p>
          </div>
        </div>
        <button
          onClick={onDismiss}
          className="w-7 h-7 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white flex-shrink-0"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
        </button>
      </div>

      <div className="p-4 space-y-3">
        <div className="flex items-start gap-2.5">
          <span className="material-symbols-outlined text-[#059669] icon-filled flex-shrink-0 mt-0.5" style={{ fontSize: 20 }}>
            location_on
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-black text-[#111827]">{navCard.destination?.name}</p>
            <p className="text-[11px] text-[#6B7280] truncate mt-0.5">
              {navCard.destination?.displayName || navCard.destination?.address}
            </p>
            {navCard.distanceText && (
              <p className="text-[10px] text-[#059669] font-bold mt-1">
                📍 {navCard.distanceText} · Tap below to calculate safe corridors
              </p>
            )}
          </div>
        </div>

        <button
          onClick={onStartNavigation}
          className="w-full h-11 rounded-2xl bg-[#1B4332] hover:bg-[#2D6A4F] text-white font-black text-xs flex items-center justify-center gap-2 active:scale-95 shadow-md shadow-emerald-900/20 transition-all"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>explore</span>
          <span>Open Safe Routes &amp; Navigate</span>
        </button>
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
function MedicalEmergencyCard({ medEmergency, onDismiss, userName, userLocation, medicalProfile, onInitiateCall, onNavigate }) {
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

          {/* Primary Quick Emergency Call Buttons — Immediately Opens Dialpad */}
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

          {/* Doctor Call if available in Profile — Immediately Opens Dialpad */}
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
                      <button
                        onClick={() => callNumber(place.phone || '108')}
                        className="px-2.5 h-8 rounded-xl bg-[#10B981] hover:bg-[#059669] text-white text-[11px] font-black flex items-center gap-1 active:scale-90 shadow-sm transition-all"
                        title={place.phone ? `Call ${place.name}` : "Call 108 Ambulance"}
                      >
                        <span className="material-symbols-outlined icon-filled" style={{ fontSize: 14 }}>call</span>
                        <span>{place.phone ? 'Call' : '108'}</span>
                      </button>

                      {onNavigate && (
                        <button
                          onClick={() => onNavigate(place)}
                          className="px-2.5 h-8 rounded-xl bg-[#004ac6] hover:bg-[#003bb0] text-white text-[11px] font-black flex items-center gap-1 active:scale-90 shadow-sm transition-all"
                          title="Navigate to Hospital"
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>near_me</span>
                          <span>Route</span>
                        </button>
                      )}

                      <button
                        onClick={() => handleOpenConfirm(place)}
                        className="px-2 h-8 rounded-xl bg-[#25D366] hover:bg-[#20bd5a] text-white text-[11px] font-black flex items-center gap-1 active:scale-90 shadow-sm transition-all"
                        title="Send pre-filled emergency WhatsApp"
                      >
                        <span className="text-xs">💬</span>
                        <span>Alert</span>
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
  const { setSosActive, emergencyContacts, userLocation, user, setDestination } = useAppStore()

  // ── Intro screen ──────────────────────────────────────────────────────────
  const [showIntro, setShowIntro] = useState(() => !localStorage.getItem(INTRO_KEY))
  const [readableAddress, setReadableAddress] = useState('')

  const handleIntroDone = () => {
    localStorage.setItem(INTRO_KEY, '1')
    setShowIntro(false)
  }

  // ── Call Confirmation Modal State ─────────────────────────────────────────
  const [callModal, setCallModal] = useState({ isOpen: false, name: '', phone: '', role: '' })
  const initiateCall = useCallback((name, phone, role = '') => {
    if (!phone) return
    setCallModal({ isOpen: true, name: name || 'Emergency Helpline', phone, role })
  }, [])
  const confirmCall = useCallback(() => {
    if (callModal.phone) {
      callNumber(callModal.phone)
    }
    setCallModal({ isOpen: false, name: '', phone: '', role: '' })
  }, [callModal.phone])

  // ── Mechanic & Breakdown State ─────────────────────────────────────────────
  const [mechanicEmergency, setMechanicEmergency] = useState(null)
  const dismissMechanicEmergency = useCallback(() => setMechanicEmergency(null), [])

  // ── Hospital Emergency State ───────────────────────────────────────────────
  const [hospitalEmergency, setHospitalEmergency] = useState(null)
  const dismissHospitalEmergency = useCallback(() => setHospitalEmergency(null), [])

  // ── Navigation Launch Card State ───────────────────────────────────────────
  const [navCard, setNavCard] = useState(null)
  const dismissNavCard = useCallback(() => setNavCard(null), [])

  // ── Medical Profile & Emergency State ─────────────────────────────────────
  const [medEmergency, setMedEmergency] = useState(null)
  const [medicalProfile, setMedicalProfile] = useState(null)

  useEffect(() => {
    let active = true

    async function fetchProfile() {
      let uid = user?.uid || user?.id || ''
      if (!uid) {
        try {
          const { data } = await supabase.auth.getUser()
          uid = data?.user?.id || ''
        } catch {}
      }
      const prof = await loadMedicalProfile(uid)
      if (active) setMedicalProfile(prof)
    }

    fetchProfile()

    const handleUpdate = () => {
      fetchProfile()
    }
    window.addEventListener('sg_medical_profile_updated', handleUpdate)

    return () => {
      active = false
      window.removeEventListener('sg_medical_profile_updated', handleUpdate)
    }
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

      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (authUser && places.length > 0) {
        supabase
          .from('sos_events')
          .insert({
            user_id: authUser.id,
            status: 'pending',
            emergency_type: 'medical',
            latitude: lat,
            longitude: lng,
            medical_summary: `${condition || 'Medical Need'}${medicine ? ` - Medicine: ${medicine}` : ''} - Nearest: ${places[0]?.name || 'Unknown'}`,
            user_name: authUser.user_metadata?.full_name || authUser.email || 'Guardian User',
          })
          .then(() => {})
          .catch(() => {})
      }
    } catch (err) {
      console.warn('[handleMedicalEmergency search error]:', err)
      setMedEmergency(prev => ({ ...prev, loading: false }))
    }
  }, [userLocation])

  const dismissMedEmergency = useCallback(() => setMedEmergency(null), [])

  // ── Settings ──────────────────────────────────────────────────────────────
  const [settings, setSettings] = useState(loadSettings)
  const [showSettings, setShowSettings] = useState(false)
  const [showMedCard, setShowMedCard] = useState(false)

  const updateSettings = (patch) => {
    setSettings(prev => {
      const next = { ...prev, ...patch }
      try { localStorage.setItem('momo_settings', JSON.stringify(next)) } catch {}
      return next
    })
  }

  // ── Messages (Persisted in localStorage) ───────────────────────────────────
  const [messages, setMessages]     = useState(loadSavedMessages)
  const [input, setInput]           = useState('')
  const [isTyping, setIsTyping]     = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [lastUserMsg, setLastUserMsg] = useState('')

  // ── Voice input ─────────────────────────────────────────────────────────────
  const recognitionRef = useRef(null)
  const textareaRef    = useRef(null)
  const messagesEndRef = useRef(null)
  const messagesRef   = useRef([])          // always-current messages for sendMessage
  const streamRef      = useRef(null)
  const sendMessageRef = useRef(null)       // ref to latest sendMessage for Enter key
  const speechQueueRef = useRef(null)       // streaming TTS sentence queue
  const [isListening, setIsListening]   = useState(false)
  const [speechError, setSpeechError]   = useState('')

  // ── Auto-scroll & Save to LocalStorage ──────────────────────────────────────
  useEffect(() => {
    messagesRef.current = messages   // sync ref so sendMessage always sees latest
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })

    try {
      if (Array.isArray(messages) && messages.length > 0) {
        // Save history without lingering streaming states, keep latest 60 messages
        const clean = messages.slice(-60).map(m => ({ ...m, streaming: false }))
        localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(clean))
      }
    } catch (err) {
      console.warn('[ChatStorage] Save failed:', err)
    }
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

  // ── TTS controls (Piper Ryan-High Primary + Web Speech Fallback) ─────────────
  const speak = useCallback((text) => {
    if (!settings.voiceEnabled || !text) return
    playPiperTTS(text, {
      onStart: () => setIsSpeaking(true),
      onEnd:   () => setIsSpeaking(false),
      rate:    settings.speechRate,
      pitch:   settings.speechPitch,
      volume:  settings.speechVolume,
      lang:    LANGUAGES[settings.language]?.code || 'en-IN',
    })
  }, [settings])

  const stopSpeaking = useCallback(() => {
    if (speechQueueRef.current) {
      speechQueueRef.current.stop()
      speechQueueRef.current = null
    }
    stopAllTTS()
    setIsSpeaking(false)
  }, [])

  // Cleanup TTS on unmount
  useEffect(() => () => { stopAllTTS() }, [])

  // ── Call Mechanic with Voice Announcement ("Calling [Name]") ─────────────
  const handleMechanicCall = useCallback((name, phone) => {
    if (!phone) return
    const displayName = name || 'Mechanic'
    if (settings.voiceEnabled) {
      speak(`Calling ${displayName}`)
    }
    // Open dialpad after voice announcement begins
    setTimeout(() => {
      callNumber(phone)
    }, 600)
  }, [settings.voiceEnabled, speak])

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

  // ── Clear chat ─────────────────────────────────────────────────────────────
  const clearChat = () => {
    stopSpeaking()
    try {
      localStorage.removeItem(CHAT_STORAGE_KEY)
    } catch {}
    setMessages([{
      id: Date.now(), sender: 'bot', streaming: false,
      text: "Chat cleared!  I'm still here — ask me anything!",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      quickActions: [],
    }])
  }

  // ── Quick actions handler ───────────────────────────────────────────────────
  const handleQuickAction = (action) => {
    if (!action) return

    if (action.startsWith('CALL_MECHANIC:')) {
      const parts = action.split(':')
      const name = decodeURIComponent(parts[1] || 'Mechanic')
      const phone = parts[2] || ''
      handleMechanicCall(name, phone)
      return
    }

    if (action.startsWith('CALL_CONTACT:')) {
      const phone = action.replace('CALL_CONTACT:', '')
      callNumber(phone)
      return
    }

    if (action.startsWith('CALL_CONFIRM:')) {
      const parts = action.split(':')
      const name = decodeURIComponent(parts[1] || 'Emergency Helpline')
      const phone = parts[2] || ''
      const role = decodeURIComponent(parts[3] || '')
      if (/mechanic|garage|puncture|repair|roadside/i.test(role) || /mechanic|garage|puncture|repair/i.test(name)) {
        handleMechanicCall(name, phone)
      } else {
        callNumber(phone)
      }
      return
    }

    switch (action) {
      case 'CALL_108':
        callNumber('108')
        break
      case 'CALL_112':
        callNumber('112')
        break
      case 'SOS':
        setSosActive(true)
        navigate('/emergency')
        break
      case 'HOSPITAL':
      case 'PHARMACY':
      case 'POLICE':
        navigate('/')
        break
      case 'ROUTE':
        navigate('/routes')
        break
      case 'CONTACTS':
        navigate('/profile')
        break
      case 'REPORT':
        navigate('/reports')
        break
      default:
        if (action.startsWith('CALL_')) {
          const num = action.replace('CALL_', '')
          callNumber(num)
        }
        break
    }
  }

  // ── Send message (Gemini-powered + Real-time Mechanics & Navigation) ──────
  const sendMessage = useCallback(async (text, isRegenerate = false) => {
    const trimmed = (text || input).trim()
    if (!trimmed || isTyping) return

    stopSpeaking()
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

    // A0. Check for Direct Phone Call Intent ("call 108", "call 112", "call dad", "call [contact]")
    const callMatch = trimmed.match(/^call\s+(.+)/i)
    if (callMatch && callMatch[1]) {
      const target = callMatch[1].trim()
      const targetLower = target.toLowerCase()

      // 1. Call 108 (Ambulance) — Immediately Opens Dialpad
      if (/^(108|ambulance|hospital helpline)/i.test(targetLower)) {
        setIsTyping(false)
        const botReply = "Opening dialpad to call 108 Ambulance immediately! 🚑"
        setMessages(prev => [
          ...prev,
          { id: botId, sender: 'bot', streaming: false, text: botReply, timestamp: ts, quickActions: [{ label: '📞 Call 108', action: 'CALL_108' }] }
        ])
        if (settings.voiceEnabled && settings.autoPlayVoice) speak(botReply)
        callNumber('108')
        return
      }

      // 2. Call 112 (National Helpline / SOS) — Immediately Opens Dialpad
      if (/^(112|police|emergency|sos)/i.test(targetLower)) {
        setIsTyping(false)
        const botReply = "Opening dialpad to call 112 Emergency Services immediately! 🚨"
        setMessages(prev => [
          ...prev,
          { id: botId, sender: 'bot', streaming: false, text: botReply, timestamp: ts, quickActions: [{ label: '📞 Call 112', action: 'CALL_112' }] }
        ])
        if (settings.voiceEnabled && settings.autoPlayVoice) speak(botReply)
        callNumber('112')
        return
      }

      // 3. Call Doctor from Medical Profile — Immediately Opens Dialpad
      if (/^(doctor|my doctor|physician)/i.test(targetLower) && medicalProfile?.doctorPhone) {
        setIsTyping(false)
        const docName = medicalProfile.doctorName || 'Doctor'
        const botReply = `Opening dialpad to call Dr. ${docName} (${medicalProfile.doctorPhone}) immediately! 🩺`
        setMessages(prev => [
          ...prev,
          { id: botId, sender: 'bot', streaming: false, text: botReply, timestamp: ts, quickActions: [{ label: `📞 Call ${docName}`, action: `CALL_${medicalProfile.doctorPhone}` }] }
        ])
        if (settings.voiceEnabled && settings.autoPlayVoice) speak(botReply)
        callNumber(medicalProfile.doctorPhone)
        return
      }

      // 4. Call Emergency Contact — Immediately Opens Dialpad
      if (Array.isArray(emergencyContacts) && emergencyContacts.length > 0) {
        const found = emergencyContacts.find(c =>
          targetLower.includes(c.name.toLowerCase()) ||
          (c.relationship && targetLower.includes(c.relationship.toLowerCase())) ||
          targetLower === 'emergency contact' ||
          targetLower === 'my contact' ||
          targetLower === 'contact'
        )
        if (found && found.phone) {
          setIsTyping(false)
          const botReply = `Opening dialpad to call ${found.name} (${found.phone}) immediately! 📞`
          setMessages(prev => [
            ...prev,
            { id: botId, sender: 'bot', streaming: false, text: botReply, timestamp: ts, quickActions: [{ label: `📞 Call ${found.name}`, action: `CALL_CONTACT:${found.phone}` }] }
          ])
          if (settings.voiceEnabled && settings.autoPlayVoice) speak(botReply)
          callNumber(found.phone)
          return
        }
      }
    }

    // A0.5 — Hospital / Nearest Medical Facility Request → Immediately dial nearest hospital/108 + show in-chat routes & cards
    const isHospitalQuery = /(find|locate|nearest|nearby|where is|take me to|show me|i need a?)\s*(the\s*)?(hospital|emergency room|er\b|casualty|ambulance|medical help|medical facility|medical centre|medical center|clinic near)/i.test(trimmed)
      || /^(hospital|nearest hospital|find hospital|hospitals|call ambulance|call 108|emergency hospital)\s*$/i.test(trimmed)
      || /(hospital.*near\s*(me|here)|nearest.*hospital|ambulance.*now|need.*hospital|hospital.*emergency)/i.test(trimmed)

    if (isHospitalQuery) {
      setIsTyping(false)
      const lat = userLocation?.lat || 22.7225
      const lng = userLocation?.lng || 88.4815

      // Show immediate loading card
      setHospitalEmergency({
        places: [],
        loading: true,
      })

      let places = []
      try {
        places = await findNearbyMedicalHelp(lat, lng, 'hospital', 5000)
      } catch (err) {
        console.warn('Failed to find medical help:', err)
      }

      // Filter strictly for hospital/clinic facilities
      const hospitalPlaces = (places || []).filter(p => p.type === 'hospital' || p.type === 'clinic')
      const finalHospitals = hospitalPlaces.length > 0 ? hospitalPlaces : (places || [])

      setHospitalEmergency({
        places: finalHospitals.slice(0, 6),
        loading: false,
      })

      const nearest = finalHospitals && finalHospitals.length > 0 ? finalHospitals[0] : null
      const nearestHasPhone = Boolean(nearest && nearest.phone && nearest.phone !== '108')

      // Intelligent dialpad decision:
      // If the nearest hospital has a direct phone number, launch dialpad with that hospital!
      // Otherwise launch with 108 National Ambulance Helpline!
      const numberToCall = nearestHasPhone ? nearest.phone : '108'
      callNumber(numberToCall)

      const botReply = nearestHasPhone
        ? `🏥 Located **${finalHospitals.length} hospitals** nearby! Dialing **${nearest.name}** (${nearest.distanceLabel}) on your phone dialpad.\n\nYou can review all nearby hospitals below with **Route** and **Call** buttons, or call 108 for ambulance dispatch.`
        : nearest
        ? `🚑 Dialing **108 Ambulance** immediately! The closest hospital to you is **${nearest.name}** (${nearest.distanceLabel} away).\n\nTap **Route** below to start navigation, or tap Call.`
        : `🚑 Dialing **108 Ambulance** immediately! Searching wider medical network around your coordinates.`

      const quickActions = [
        { label: '🚑 Call 108 (Ambulance)', action: 'CALL_108' },
        ...(nearestHasPhone ? [{ label: `📞 Call ${nearest.name.slice(0, 18)}`, action: `CALL_CONFIRM:${encodeURIComponent(nearest.name)}:${nearest.phone}:Hospital` }] : []),
        { label: '🚨 Call 112 (Emergency)', action: 'CALL_112' },
      ]

      setMessages(prev => [
        ...prev,
        {
          id: botId,
          sender: 'bot',
          streaming: false,
          text: botReply,
          timestamp: ts,
          cardType: 'hospital',
          places: finalHospitals.slice(0, 5),
          quickActions,
        },
      ])

      const voiceMsg = nearestHasPhone
        ? `Located ${finalHospitals.length} hospitals nearby. Dialing ${nearest.name} now. Safe routes and call options are on your screen.`
        : `Calling 108 ambulance now. Nearest hospital is ${nearest?.name || 'located'}. Tap route to navigate.`

      if (settings.voiceEnabled && settings.autoPlayVoice) speak(voiceMsg)
      return
    }

    // A. Check for Vehicle Breakdown / Mechanic Query
    const isMechanicQuery = /(mechanic|garage|puncture|flat ty?re|flat tire|car (broke|breakdown|repair|stalled|won't start)|bike (broke|breakdown|repair|puncher)|tow truck|towing|jump ?start|auto repair|vehicle breakdown)/i.test(trimmed)

    if (isMechanicQuery) {
      const lat = userLocation?.lat || 22.7225
      const lng = userLocation?.lng || 88.4815
      try {
        const places = await findNearbyMechanics(lat, lng, 'all', 5000)
        setIsTyping(false)
        setMechanicEmergency({
          issue: trimmed,
          places: places.slice(0, 6),
          loading: false,
        })
        const botReply = `Don't panic! I found **${places.length}** automobile mechanics and emergency puncture repair shops near your live location. 🚗🔧\n\nYou can review them below, tap to call any garage, or start navigation to the nearest one immediately.`
        const quickActions = [
          ...(places.length > 0 && places[0].phone ? [{ label: `📞 Call ${places[0].name}`, action: `CALL_MECHANIC:${encodeURIComponent(places[0].name)}:${places[0].phone}` }] : []),
          { label: '📞 Highway Helpline (1033)', action: 'CALL_CONFIRM:National%20Highway%20Helpline:1033:Emergency%20Roadside%20Assistance' },
          { label: '🆘 SOS Alert', action: 'SOS' },
        ]
        setMessages(prev => [
          ...prev,
          {
            id: botId,
            sender: 'bot',
            streaming: false,
            text: botReply,
            timestamp: ts,
            cardType: 'mechanic',
            places: places.slice(0, 5),
            quickActions,
          },
        ])
        if (settings.voiceEnabled && settings.autoPlayVoice) speak('I have located nearby mechanics and repair shops for you.')
        return
      } catch (err) {
        console.warn('[Mechanic search error]:', err)
      }
    }

    // B. Check for Autonomous Navigation Request ("show me road to X", "navigate to X", etc.)
    const navMatch = trimmed.match(/(?:show (?:me )?(?:the )?(?:road|route|way|directions) to|navigate to|take me to|directions to|route to|how to (?:go|reach) to?|lead me to)\s+([^?.!,]+)/i)

    if (navMatch && navMatch[1] && navMatch[1].trim().length > 1) {
      const destinationQuery = navMatch[1].trim()
      try {
        const places = await searchPlaces(destinationQuery, userLocation?.lat, userLocation?.lng)
        if (places && places.length > 0) {
          const best = places[0]
          const destObj = {
            name: best.name || destinationQuery,
            displayName: best.displayName || best.address,
            lat: best.lat,
            lng: best.lng,
          }
          if (setDestination) setDestination(destObj)
          setNavCard({
            destination: destObj,
            distanceText: best.distanceKm ? `${best.distanceKm} km away` : '',
          })
          setIsTyping(false)
          const botReply = `I found **${destObj.name}**! 🗺️\n\nI have set this as your destination and mapped out the safe corridor routes. Tap **"Open Safe Routes & Navigate"** on the card below to preview the safest, lit corridors and begin turn-by-turn guidance.`
          setMessages(prev => [
            ...prev,
            {
              id: botId,
              sender: 'bot',
              streaming: false,
              text: botReply,
              timestamp: ts,
              quickActions: [
                { label: '🗺️ Open Safe Routes', action: 'ROUTE' },
                { label: '🆘 SOS Alert', action: 'SOS' },
              ],
            },
          ])
          if (settings.voiceEnabled && settings.autoPlayVoice) speak(`I found the route to ${destObj.name}. Tap below to start safe navigation.`)
          return
        }
      } catch (err) {
        console.warn('[Navigation search error]:', err)
      }
    }

    // C. Deep Gemini Medical Triaging with User's Medical Profile Context
    let medResult = { isMedical: false }
    try {
      const geminiAnalysis = await analyzeMedicalEmergencyWithGemini(trimmed, medicalProfile)
      if (geminiAnalysis?.isMedical) {
        medResult = detectMedicalEmergency(trimmed, medicalProfile, geminiAnalysis)
      }
    } catch (e) {
      console.warn('[Gemini Medical Triaging Check]:', e)
    }

    // Offline Conversational Pattern Fallback (if Gemini fails or offline)
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

    // D. Normal Momo Logic (Gemini Chat + Medical Profile + Emergency Contacts + Offline Fallback)
    const softPreamble = isSoft
      ? 'The user may be distressed or in danger. Be warm, calm them first, then guide them to tap SOS or call 112. '
      : ''
    const messageToSend = softPreamble + trimmed
    let bubbleAdded = false

    try {
      let accumulated = ''
      let speechQueue = null
      let enqueuedLength = 0

      if (settings.voiceEnabled && settings.autoPlayVoice) {
        stopSpeaking()
        speechQueue = createSpeechQueue({
          onStart: () => setIsSpeaking(true),
          onEnd:   () => setIsSpeaking(false),
          rate:    settings.speechRate,
          pitch:   settings.speechPitch,
          volume:  settings.speechVolume,
          lang:    LANGUAGES[settings.language]?.code || 'en-IN',
        })
        speechQueueRef.current = speechQueue
      }

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

          // Instant Sentence-by-Sentence Streaming Speech:
          // Immediately start speaking the very moment the first sentence arrives!
          if (speechQueue) {
            const unparsed = accumulated.slice(enqueuedLength)
            const sentenceMatch = unparsed.match(/^([\s\S]*?[.!?\n]+)(\s+|$)/)
            if (sentenceMatch && sentenceMatch[1] && sentenceMatch[1].trim().length > 3) {
              const sentenceToSpeak = sentenceMatch[1].trim()
              speechQueue.enqueue(sentenceToSpeak)
              enqueuedLength += sentenceMatch[0].length
            }
          }
        },
        { lat: userLocation?.lat, lng: userLocation?.lng, address: readableAddress },
        emergencyContacts
      )

      // Send any trailing text that did not end with standard punctuation
      if (speechQueue && enqueuedLength < accumulated.length) {
        const remaining = accumulated.slice(enqueuedLength).trim()
        if (remaining.length > 1) {
          speechQueue.enqueue(remaining)
        }
      }

      const actions = getQuickActions(accumulated, isSoft)
      setMessages(prev => prev.map(m =>
        m.id === botId
          ? { ...m, text: accumulated, streaming: false, quickActions: actions }
          : m
      ))
      if (!speechQueue && settings.voiceEnabled && settings.autoPlayVoice) speak(accumulated)
    } catch {
      // If Gemini API fails or offline, use smart fallback with medicalProfile and contacts
      const offlineReply = getBotReply(trimmed, settings.language, historySnapshot, medicalProfile, emergencyContacts)
      const fallbackText = offlineReply || MOMO_ERROR_FALLBACK
      const actions = getQuickActions(fallbackText, isSoft)

      if (!bubbleAdded) {
        setMessages(prev => [
          ...prev,
          { id: botId, sender: 'bot', text: fallbackText, streaming: false, timestamp: ts, quickActions: actions }
        ])
      } else {
        setMessages(prev => prev.map(m =>
          m.id === botId
            ? { ...m, text: fallbackText, streaming: false, quickActions: actions }
            : m
        ))
      }
      if (settings.voiceEnabled && settings.autoPlayVoice) speak(fallbackText)
    } finally {
      setIsTyping(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input, isTyping, settings, navigate, setSosActive, speak, medicalProfile, emergencyContacts, userLocation, readableAddress, setDestination, handleMedicalEmergency])
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
          @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
          .quick-action-btn:active { transform: scale(0.93); }
        `}</style>

        {/* ── Header ──────────────────────────────────────────────────────────── */}
        <div
          className="flex items-center gap-2 px-4 pt-11 pb-3 flex-shrink-0"
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
            className="flex flex-col items-center justify-center gap-0.5 rounded-2xl px-2.5 py-1.5 active:scale-90 transition-all flex-shrink-0"
            style={{ background: '#f0fdf4', border: '1.5px solid rgba(16,185,129,0.2)' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 22, color: '#059669' }}>arrow_back</span>
            <span className="text-[9px] font-bold uppercase tracking-wide leading-none" style={{ color: '#059669' }}>Back</span>
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
              <p className="text-[10px] text-[#10B981] font-bold">Your Safety Guardian · Always On</p>
            </div>
          </div>

          {/* Medical Profile Quick Card Button — same icon as ProfilePage medical card */}
          {hasMedicalData(medicalProfile) && (
            <button
              onClick={() => setShowMedCard(true)}
              className="flex flex-col items-center justify-center gap-0.5 rounded-2xl px-2.5 py-1.5 active:scale-90 transition-all flex-shrink-0"
              style={{ background: '#fff1f2', border: '1.5px solid rgba(244,63,94,0.2)' }}
              title="View Medical Profile"
            >
              <span className="material-symbols-outlined icon-filled" style={{ fontSize: 22, color: '#f43f5e' }}>medical_services</span>
              <span className="text-[9px] font-bold uppercase tracking-wide leading-none" style={{ color: '#f43f5e' }}>
                {medicalProfile.bloodGroup || 'Med'}
              </span>
            </button>
          )}

          {/* Speaking stop indicator */}
          {isSpeaking && (
            <button
              onClick={stopSpeaking}
              className="flex flex-col items-center justify-center gap-0.5 rounded-2xl px-2.5 py-1.5 active:scale-90 transition-all flex-shrink-0"
              style={{ background: 'rgba(16,185,129,0.1)', border: '1.5px solid rgba(16,185,129,0.3)' }}
            >
              <span className="material-symbols-outlined text-[#10B981] animate-pulse" style={{ fontSize: 22 }}>volume_off</span>
              <span className="text-[9px] font-bold uppercase tracking-wide leading-none text-[#10B981]">Stop</span>
            </button>
          )}

          {/* Clear chat */}
          <button
            onClick={clearChat}
            className="flex flex-col items-center justify-center gap-0.5 rounded-2xl px-2.5 py-1.5 active:scale-90 transition-all flex-shrink-0"
            style={{ background: '#f0fdf4', border: '1.5px solid rgba(16,185,129,0.2)' }}
            title="Clear chat history"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 22, color: '#059669' }}>delete</span>
            <span className="text-[9px] font-bold uppercase tracking-wide leading-none" style={{ color: '#059669' }}>Clear</span>
          </button>

          {/* Voice settings */}
          <button
            onClick={() => setShowSettings(s => !s)}
            className="flex flex-col items-center justify-center gap-0.5 rounded-2xl px-2.5 py-1.5 active:scale-90 transition-all flex-shrink-0"
            style={{
              background: showSettings ? '#10B981' : '#f0fdf4',
              border: '1.5px solid rgba(16,185,129,0.2)',
            }}
            title="Voice & display settings"
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: 22, color: showSettings ? 'white' : '#059669' }}
            >
              tune
            </span>
            <span className="text-[9px] font-bold uppercase tracking-wide leading-none" style={{ color: showSettings ? 'white' : '#059669' }}>Voice</span>
          </button>
        </div>

        {/* ── Settings Panel ──────────────────────────────────────────────────── */}
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
        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-4" style={{ overscrollBehavior: 'contain' }}>
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
                          <span className="text-gray-400 italic text-xs">Thinking…</span>
                        )}
                      </div>

                      {/* In-Chat Interactive Place Cards (Hospitals & Mechanics) */}
                      {!msg.streaming && msg.places && msg.places.length > 0 && (
                        <div className="mt-3 pt-2.5 border-t border-gray-100 space-y-2">
                          <div className="flex items-center justify-between px-0.5">
                            <span className="text-[11px] font-black uppercase tracking-wider text-gray-700 flex items-center gap-1.5">
                              <span
                                className="material-symbols-outlined text-[15px]"
                                style={{ color: msg.cardType === 'hospital' ? '#DC2626' : '#D97706' }}
                              >
                                {msg.cardType === 'hospital' ? 'local_hospital' : 'build'}
                              </span>
                              {msg.cardType === 'hospital' ? 'Nearby Hospitals & Emergency' : 'Nearby Mechanics & Garages'}
                            </span>
                            <span className="text-[10px] font-bold text-gray-400">
                              {msg.places.length} found
                            </span>
                          </div>

                          <div className="space-y-1.5">
                            {msg.places.map((place, idx) => (
                              <div
                                key={idx}
                                className="p-2.5 rounded-2xl bg-[#F8FAFC] border border-[#E2E8F0] flex items-center justify-between gap-2 shadow-xs hover:bg-slate-50 transition-colors"
                              >
                                <div className="min-w-0 flex-1 pr-1">
                                  <p className="text-xs font-bold text-[#0F172A] truncate leading-tight">
                                    {place.name}
                                  </p>
                                  <p className="text-[10px] text-[#64748B] truncate mt-0.5">
                                    📍 {place.distanceLabel} {place.etaMinutes ? `· ~${place.etaMinutes} min` : ''} · {place.openStatus || place.specialty || 'Available'}
                                  </p>
                                </div>

                                <div className="flex items-center gap-1.5 flex-shrink-0">
                                  <button
                                    onClick={() => {
                                      const phone = place.phone || (msg.cardType === 'hospital' ? '108' : '')
                                      if (phone) {
                                        if (msg.cardType === 'mechanic') {
                                          handleMechanicCall(place.name, phone)
                                        } else {
                                          callNumber(phone)
                                        }
                                      }
                                    }}
                                    className="h-8 px-2.5 rounded-xl bg-[#10B981] hover:bg-[#059669] text-white text-[11px] font-black flex items-center gap-1 active:scale-90 shadow-xs transition-all"
                                    title={place.phone ? `Call ${place.name}` : 'Call 108'}
                                  >
                                    <span className="material-symbols-outlined icon-filled" style={{ fontSize: 14 }}>call</span>
                                    <span>{place.phone ? 'Call' : '108'}</span>
                                  </button>

                                  <button
                                    onClick={() => {
                                      if (setDestination) {
                                        setDestination({
                                          name: place.name,
                                          displayName: place.address || place.name,
                                          lat: place.lat,
                                          lng: place.lng,
                                        })
                                      }
                                      navigate('/routes')
                                    }}
                                    className="h-8 px-2.5 rounded-xl bg-[#004ac6] hover:bg-[#003bb0] text-white text-[11px] font-black flex items-center gap-1 active:scale-90 shadow-xs transition-all"
                                    title="Navigate to destination"
                                  >
                                    <span className="material-symbols-outlined" style={{ fontSize: 14 }}>near_me</span>
                                    <span>Route</span>
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
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

        {/* Call Confirmation Dialog */}
        <CallConfirmModal
          isOpen={callModal.isOpen}
          onClose={() => setCallModal({ isOpen: false, name: '', phone: '', role: '' })}
          onConfirm={confirmCall}
          name={callModal.name}
          phone={callModal.phone}
          role={callModal.role}
        />

        {/* Mechanic Breakdown Card */}
        {mechanicEmergency && (
          <MechanicBreakdownCard
            mechanicEmergency={mechanicEmergency}
            onDismiss={dismissMechanicEmergency}
            onCall={(name, phone) => handleMechanicCall(name, phone)}
            onNavigate={(place) => {
              if (setDestination) {
                setDestination({
                  name: place.name,
                  displayName: place.address || place.name,
                  lat: place.lat,
                  lng: place.lng,
                })
              }
              navigate('/routes')
            }}
          />
        )}

        {/* Hospital Emergency Card */}
        {hospitalEmergency && (
          <HospitalEmergencyCard
            hospitalEmergency={hospitalEmergency}
            onDismiss={dismissHospitalEmergency}
            onCall={(name, phone, role) => {
              if (phone) callNumber(phone)
            }}
            onNavigate={(place) => {
              if (setDestination) {
                setDestination({
                  name: place.name,
                  displayName: place.address || place.name,
                  lat: place.lat,
                  lng: place.lng,
                })
              }
              navigate('/routes')
            }}
          />
        )}

        {/* Navigation Launch Card */}
        {navCard && (
          <NavigationLaunchCard
            navCard={navCard}
            onDismiss={dismissNavCard}
            onStartNavigation={() => {
              navigate('/routes')
            }}
          />
        )}

        {/* Medical Emergency Card Mounting Point */}
        {medEmergency && (
          <MedicalEmergencyCard
            medEmergency={medEmergency}
            onDismiss={dismissMedEmergency}
            userName={user?.name}
            userLocation={userLocation}
            medicalProfile={medicalProfile}
            onInitiateCall={(name, phone, role) => initiateCall(name, phone, role)}
            onNavigate={(place) => {
              if (setDestination) {
                setDestination({
                  name: place.name,
                  displayName: place.address || place.name,
                  lat: place.lat,
                  lng: place.lng,
                })
              }
              navigate('/routes')
            }}
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
                className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all active:scale-95 flex items-center gap-1.5 shadow-xs hover:bg-emerald-50"
                style={{
                  background: 'rgba(16,185,129,0.08)',
                  color: '#059669',
                  border: '1px solid rgba(16,185,129,0.2)',
                  whiteSpace: 'nowrap',
                }}
              >
                <span className="material-symbols-outlined text-[15px]">{chip.icon}</span>
                <span>{chip.label}</span>
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
              <p className="text-xs font-bold text-[#1B5E20]">Momo is listening... speak now</p>
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
                placeholder={isListening ? 'Listening...' : 'Ask Momo anything about safety...'}
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

      {/* ── Medical Profile Card Modal ──────────────────────────────────────── */}
      {showMedCard && (
        <div
          className="fixed inset-0 z-[200] flex items-end justify-center"
          style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' }}
          onClick={() => setShowMedCard(false)}
        >
          <div
            className="w-full max-w-lg rounded-t-3xl p-5 pb-8 overflow-y-auto"
            style={{ background: 'white', maxHeight: '80dvh', boxShadow: '0 -8px 40px rgba(0,0,0,0.18)' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Handle bar */}
            <div className="w-10 h-1 rounded-full bg-gray-200 mx-auto mb-4" />

            {/* Header */}
            <div className="flex items-center gap-3 mb-5">
              <div className="w-11 h-11 rounded-2xl flex items-center justify-center" style={{ background: '#fff1f2' }}>
                <span className="material-symbols-outlined icon-filled text-[26px]" style={{ color: '#f43f5e' }}>medical_services</span>
              </div>
              <div>
                <p className="font-black text-[#0f172a] text-base leading-tight">Medical Profile</p>
                <p className="text-[11px] text-gray-500 font-medium">Shared with Momo for emergency context</p>
              </div>
              <button onClick={() => setShowMedCard(false)} className="ml-auto w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                <span className="material-symbols-outlined text-gray-500 text-[18px]">close</span>
              </button>
            </div>

            {/* Blood group + vitals row */}
            <div className="flex gap-3 mb-4">
              {[
                { icon: 'water_drop', label: 'Blood', value: medicalProfile.bloodGroup || '—', color: '#DC2626', bg: '#FFF0F0' },
                { icon: 'person', label: 'Age', value: medicalProfile.age ? `${medicalProfile.age} yrs` : '—', color: '#7C3AED', bg: '#F5F3FF' },
                { icon: 'height', label: 'Height', value: medicalProfile.height ? `${medicalProfile.height} cm` : '—', color: '#0369A1', bg: '#F0F9FF' },
                { icon: 'monitor_weight', label: 'Weight', value: medicalProfile.weight ? `${medicalProfile.weight} kg` : '—', color: '#059669', bg: '#F0FDF4' },
              ].map(item => (
                <div key={item.label} className="flex-1 rounded-2xl p-3 text-center" style={{ background: item.bg }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 20, color: item.color }}>{item.icon}</span>
                  <p className="font-black text-[13px] mt-1" style={{ color: item.color }}>{item.value}</p>
                  <p className="text-[9px] text-gray-500 font-bold uppercase tracking-wide">{item.label}</p>
                </div>
              ))}
            </div>

            {/* Conditions */}
            {(medicalProfile.conditions?.length > 0 || medicalProfile.otherCondition) && (
              <div className="mb-3 p-3 rounded-2xl bg-orange-50 border border-orange-100">
                <p className="text-[11px] font-black text-orange-700 uppercase tracking-wide mb-2 flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px]">warning</span> Medical Conditions
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {[...(medicalProfile.conditions || []), medicalProfile.otherCondition].filter(Boolean).map((c, i) => (
                    <span key={i} className="text-[11px] font-semibold bg-orange-100 text-orange-800 px-2.5 py-1 rounded-full">{c}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Allergies */}
            {(medicalProfile.allergies?.length > 0 || medicalProfile.otherAllergy) && (
              <div className="mb-3 p-3 rounded-2xl bg-red-50 border border-red-100">
                <p className="text-[11px] font-black text-red-700 uppercase tracking-wide mb-2 flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px]">block</span> Allergies
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {[...(medicalProfile.allergies || []), medicalProfile.otherAllergy].filter(Boolean).map((a, i) => (
                    <span key={i} className="text-[11px] font-semibold bg-red-100 text-red-800 px-2.5 py-1 rounded-full">{a}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Medicines */}
            {(medicalProfile.medicines?.length > 0 || medicalProfile.emergencyMedicines?.length > 0) && (
              <div className="mb-3 p-3 rounded-2xl bg-blue-50 border border-blue-100">
                <p className="text-[11px] font-black text-blue-700 uppercase tracking-wide mb-2 flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px]">medication</span> Medicines
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {[...(medicalProfile.medicines || []), ...(medicalProfile.emergencyMedicines || [])].filter(Boolean).map((m, i) => (
                    <span key={i} className="text-[11px] font-semibold bg-blue-100 text-blue-800 px-2.5 py-1 rounded-full">{m}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Doctor */}
            {(medicalProfile.doctorName || medicalProfile.doctorHospital) && (
              <div className="mb-3 p-3 rounded-2xl bg-green-50 border border-green-100">
                <p className="text-[11px] font-black text-green-700 uppercase tracking-wide mb-1 flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px]">local_hospital</span> Doctor / Hospital
                </p>
                {medicalProfile.doctorName && <p className="text-[13px] font-bold text-green-900">{medicalProfile.doctorName}</p>}
                {medicalProfile.doctorHospital && <p className="text-[12px] text-green-700">{medicalProfile.doctorHospital}</p>}
                {medicalProfile.doctorPhone && (
                  <button onClick={() => callNumber(medicalProfile.doctorPhone)} className="mt-2 flex items-center gap-1 text-[12px] font-bold text-green-700">
                    <span className="material-symbols-outlined text-[15px]">call</span> {medicalProfile.doctorPhone}
                  </button>
                )}
              </div>
            )}

            {/* Insurance */}
            {medicalProfile.insuranceProvider && (
              <div className="mb-4 p-3 rounded-2xl bg-purple-50 border border-purple-100">
                <p className="text-[11px] font-black text-purple-700 uppercase tracking-wide mb-1 flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px]">shield</span> Insurance
                </p>
                <p className="text-[13px] font-bold text-purple-900">{medicalProfile.insuranceProvider}</p>
                {medicalProfile.insurancePolicyNumber && (
                  <p className="text-[11px] text-purple-600">Policy: {medicalProfile.insurancePolicyNumber}</p>
                )}
              </div>
            )}

            {/* Full profile link */}
            <button
              onClick={() => { setShowMedCard(false); navigate('/profile') }}
              className="w-full py-3 rounded-2xl font-black text-sm flex items-center justify-center gap-2 active:scale-95 transition-transform"
              style={{ background: 'linear-gradient(135deg,#10B981,#059669)', color: 'white', boxShadow: '0 4px 14px rgba(16,185,129,0.35)' }}
            >
              <span className="material-symbols-outlined text-[18px]">manage_accounts</span>
              Edit Full Medical Profile
            </button>
          </div>
        </div>
      )}
    </>
  )
}