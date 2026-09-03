import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../../context/store'
import { createSOSEvent, subscribeToSOSEvent, getStatusLabel } from '../../services/sosService'
import { auth } from '../../firebase/firebase'
import { triggerSOSSmsRedirect } from '../../services/smsRedirect'
import { getLocationName } from '../../services/reverseGeocode'

// ── Emergency type definitions ────────────────────────────────────────────────
const EMERGENCY_TYPES = [
  {
    id: 'general', label: 'General Emergency', icon: 'emergency',
    color: '#EF4444', emoji: '🚨',
    getMessage: (loc) =>
      `🚨 *EMERGENCY ALERT*\n\nI need immediate assistance!\n\n📍 *My live location:*\n${loc}\n\nPlease contact me immediately.\n\n_Sent via Safety Guardian_`,
  },
  {
    id: 'medical', label: 'Medical Emergency', icon: 'local_hospital',
    color: '#DC2626', emoji: '🚑',
    getMessage: (loc) =>
      `🚑 *MEDICAL EMERGENCY*\n\nI need urgent medical help!\n\n📍 *My location:*\n${loc}\n\nPlease reach me immediately.\n\n_Sent via Safety Guardian_`,
  },
  {
    id: 'crime', label: 'Criminal Threat', icon: 'gavel',
    color: '#7C3AED', emoji: '🚨',
    getMessage: (loc) =>
      `🚨 *DANGER — I may be unsafe!*\n\nI am in a potentially dangerous situation.\n\n📍 *Live location:*\n${loc}\n\nPlease contact me immediately or alert authorities.\n\n_Sent via Safety Guardian_`,
  },
  {
    id: 'fire', label: 'Fire / Gas Leak', icon: 'local_fire_department',
    color: '#F97316', emoji: '🔥',
    getMessage: (loc) =>
      `🔥 *FIRE / GAS EMERGENCY*\n\nThere is a fire or gas leak near me!\n\n📍 *My location:*\n${loc}\n\nPlease help or notify emergency services.\n\n_Sent via Safety Guardian_`,
  },
  {
    id: 'weather', label: 'Stranded / Weather', icon: 'thunderstorm',
    color: '#3B82F6', emoji: '⛈️',
    getMessage: (loc) =>
      `⛈️ *STRANDED — Need Help*\n\nI am stranded due to severe weather.\n\n📍 *Location:*\n${loc}\n\nPlease check on me urgently.\n\n_Sent via Safety Guardian_`,
  },
  {
    id: 'accident', label: 'Road Accident', icon: 'car_crash',
    color: '#F59E0B', emoji: '🚗',
    getMessage: (loc) =>
      `🚗 *ROAD ACCIDENT*\n\nI have been in a road accident!\n\n📍 *Accident location:*\n${loc}\n\nPlease send an ambulance immediately.\n\n_Sent via Safety Guardian_`,
  },
]

export default function EmergencyPage() {
  const navigate    = useNavigate()
  const { userLocation, nearbyPlaces, setSosActive, emergencyContacts } = useAppStore()

  // Countdown state
  const [count, setCount]                   = useState(3)
  const [isLive, setIsLive]                 = useState(false)

  // Cancel hold state
  const [cancelProgress, setCancelProgress] = useState(0)

  // Emergency type
  const [selectedType, setSelectedType]     = useState(null)
  const [showTypePicker, setShowTypePicker] = useState(false)
  const [flash, setFlash]                   = useState(false)
  const audioCtxRef                         = useRef(null)
  const oscRef                              = useRef(null)

  // SOS event & gateway status
  const [sosEventId, setSosEventId]         = useState(null)
  const [sosEvent, setSosEvent]             = useState(null)
  const [alertSent, setAlertSent]           = useState(false)
  const [sending, setSending]               = useState(false)
  const [sendError, setSendError]           = useState(null)

  // SMS redirect status message (only set when redirect could NOT happen, e.g. desktop)
  const [smsStatus, setSmsStatus]           = useState(null)

  const holdIntervalRef = useRef(null)
  const unsubRef        = useRef(null)

  const hospitals      = nearbyPlaces.filter(p => p.amenity === 'hospital')
  const police         = nearbyPlaces.filter(p => p.amenity === 'police')
  const nearestHospital = hospitals[0]?.name || 'Nearest Hospital'
  const nearestPolice   = police[0]?.name   || 'Nearest Police Station'

  const lat  = userLocation?.lat
  const lng  = userLocation?.lng
  const locStr = lat && lng
    ? `https://maps.google.com/?q=${lat.toFixed(6)},${lng.toFixed(6)}`
    : 'Location unavailable'

  const currentType = selectedType || EMERGENCY_TYPES[0]

  // ── Countdown 3 → LIVE ────────────────────────────────────────────────────
  useEffect(() => {
    const interval = setInterval(() => {
      setCount(c => {
        if (c <= 1) { setIsLive(true); clearInterval(interval); return 0 }
        return c - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  // ── Auto-create SOS event once countdown ends ─────────────────────────────
  useEffect(() => {
    if (!isLive) return

    // 1. Send Alert to Firestore gateway
    if (!alertSent) {
      handleSendAlert()
    }

    // 2. Auto SMS Redirect — open native SMS app with prefilled emergency message
    //    Fires 3000ms (3 seconds) after LIVE. This ensures the siren starts playing,
    //    the screen flashes, and the Firestore alert is successfully sent BEFORE
    //    the OS switches out of the app to open the SMS messenger.
    const smsTimer = setTimeout(async () => {
      let readableAddress = ''
      try {
        if (lat && lng) {
          readableAddress = await getLocationName(lat, lng) || ''
        }
      } catch {
        readableAddress = ''
      }

      const result = triggerSOSSmsRedirect({
        emergencyContacts,
        userLocation,
        readableAddress,
      })

      if (!result.success) {
        setSmsStatus(result.reason)
      }
    }, 3000)

    // 3. Screen Flash Effect
    const flashInterval = setInterval(() => {
      setFlash(f => !f)
    }, 150)

    // 4. Play Loud Alarm (Requires interaction usually, but we try)
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)()
      }
      if (!oscRef.current) {
        const osc = audioCtxRef.current.createOscillator()
        const gainNode = audioCtxRef.current.createGain()

        osc.type = 'square'
        osc.frequency.setValueAtTime(800, audioCtxRef.current.currentTime)
        osc.frequency.setValueAtTime(1200, audioCtxRef.current.currentTime + 0.2)
        osc.frequency.setValueAtTime(800, audioCtxRef.current.currentTime + 0.4)

        // Loop the frequency changes
        setInterval(() => {
          if (!audioCtxRef.current) return
          const t = audioCtxRef.current.currentTime
          osc.frequency.setValueAtTime(800, t)
          osc.frequency.setValueAtTime(1200, t + 0.2)
          osc.frequency.setValueAtTime(800, t + 0.4)
        }, 600)

        gainNode.gain.value = 0.5
        osc.connect(gainNode)
        gainNode.connect(audioCtxRef.current.destination)
        osc.start()
        oscRef.current = osc
      }
    } catch (err) {
      console.warn('Audio autoplay blocked by browser', err)
    }

    return () => {
      clearTimeout(smsTimer)
      clearInterval(flashInterval)
      if (oscRef.current) {
        oscRef.current.stop()
        oscRef.current.disconnect()
        oscRef.current = null
      }
      if (audioCtxRef.current) {
        audioCtxRef.current.close()
        audioCtxRef.current = null
      }
      setFlash(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLive])

  // ── Cleanup ───────────────────────────────────────────────────────────────
  useEffect(() => () => {
    if (holdIntervalRef.current) clearInterval(holdIntervalRef.current)
    if (unsubRef.current)        unsubRef.current()
  }, [])

  // ── Create Firestore SOS event + subscribe to gateway status ─────────────
  const handleSendAlert = async () => {
    if (alertSent || sending) return
    setSending(true)
    setSendError(null)
    try {
      const user = auth.currentUser
      const userObj = {
        uid:   user?.uid   || 'anonymous',
        name:  user?.displayName || 'Unknown User',
        email: user?.email  || '',
        phone: user?.phoneNumber || '',
      }
      const event = await createSOSEvent({
        user:             userObj,
        userLocation,
        emergencyContacts,
        emergencyType:    currentType.id,
      })
      setSosEventId(event.id)
      setAlertSent(true)

      // Subscribe to real-time gateway status updates
      unsubRef.current = subscribeToSOSEvent(event.id, (updated) => {
        setSosEvent(updated)
      })
    } catch (err) {
      console.error('[SOS] Failed to create event:', err)
      setSendError('Could not reach servers. Use WhatsApp below as backup.')
    } finally {
      setSending(false)
    }
  }

  // ── Open WhatsApp (user sends themselves) ─────────────────────────────────
  const openWhatsApp = () => {
    const msg = currentType.getMessage(locStr)
    const contacts = emergencyContacts.filter(c => c.phone)
    if (contacts.length === 0) {
      window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank')
      return
    }
    contacts.forEach((contact, i) => {
      setTimeout(() => {
        const phone = contact.phone.replace(/[\s\-()]/g, '').replace(/^0/, '+91')
        window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank')
      }, i * 1200)
    })
  }

  // ── Hold-to-cancel ────────────────────────────────────────────────────────
  const handleCancelStart = () => {
    if (holdIntervalRef.current) return
    let prog = 0
    holdIntervalRef.current = setInterval(() => {
      prog += 3.33
      setCancelProgress(prog)
      if (prog >= 100) {
        clearInterval(holdIntervalRef.current)
        holdIntervalRef.current = null
        setSosActive(false)
        navigate(-1)
      }
    }, 100)
  }

  const handleCancelEnd = () => {
    if (holdIntervalRef.current) {
      clearInterval(holdIntervalRef.current)
      holdIntervalRef.current = null
    }
    setCancelProgress(0)
  }

  // ── Gateway status display ────────────────────────────────────────────────
  const status     = sosEvent?.status || (alertSent ? 'pending' : null)
  const statusInfo = status ? getStatusLabel(status) : null

  // Determine what's been done
  const smsDone   = ['sms_sent','call_attempted','completed'].includes(status)
  const callDone  = ['call_attempted','completed'].includes(status)
  const allDone   = status === 'completed'

  return (
    <div className={`fixed inset-0 overflow-hidden transition-colors duration-75 ${flash ? 'bg-white' : ''}`} style={flash ? {} : { background: 'linear-gradient(180deg, #EF4444 0%, #991B1B 100%)' }}>
      {/* Ripple waves */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        {[0, 1, 2].map(i => (
          <div key={i} className="absolute w-64 h-64 rounded-full sos-ripple" style={{ animationDelay: `${i}s` }} />
        ))}
      </div>

      <div className="relative z-10 flex flex-col items-center justify-between h-full py-6 px-5 overflow-y-auto gap-4">

        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="flex flex-col items-center space-y-2 pt-4 w-full">
          <div className="bg-white/20 px-4 py-1 rounded-full border border-white/30">
            <p className="text-xs font-black tracking-[0.2em] uppercase text-white">Emergency Broadcast</p>
          </div>
          <h1 className="text-2xl font-black tracking-tight text-center uppercase text-white">
            SOS EMERGENCY ACTIVATED
          </h1>

          {/* Emergency type selector */}
          <button
            onClick={() => setShowTypePicker(s => !s)}
            className="flex items-center gap-2 bg-white/20 border border-white/30 rounded-2xl px-4 py-2 active:scale-95 transition-transform"
          >
            <span className="material-symbols-outlined text-white icon-filled" style={{ fontSize: '16px' }}>{currentType.icon}</span>
            <span className="text-white font-bold text-sm">{currentType.label}</span>
            <span className="material-symbols-outlined text-white/70" style={{ fontSize: '14px' }}>
              {showTypePicker ? 'expand_less' : 'expand_more'}
            </span>
          </button>

          {showTypePicker && (
            <div className="w-full max-w-sm bg-white/95 rounded-2xl overflow-hidden shadow-2xl">
              {EMERGENCY_TYPES.map(t => (
                <button key={t.id}
                  onClick={() => { setSelectedType(t); setShowTypePicker(false) }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 border-b border-gray-100 last:border-0"
                >
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: t.color + '20' }}>
                    <span className="material-symbols-outlined icon-filled" style={{ color: t.color, fontSize: '18px' }}>{t.icon}</span>
                  </div>
                  <span className="font-bold text-sm text-gray-800">{t.label}</span>
                  {currentType.id === t.id && (
                    <span className="material-symbols-outlined text-[#EF4444] ml-auto" style={{ fontSize: '16px' }}>check_circle</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Central icon ───────────────────────────────────────────── */}
        <div className="relative flex items-center justify-center w-full max-w-xs">
          <div className="absolute w-44 h-44 bg-white/10 rounded-full animate-pulse-ring" />
          <div className="absolute w-60 h-60 bg-white/5  rounded-full animate-pulse-ring" style={{ animationDelay: '0.5s' }} />
          <div className="relative z-20 w-36 h-36 bg-white rounded-full flex flex-col items-center justify-center shadow-2xl animate-pulse-icon">
            <span className="material-symbols-outlined icon-filled" style={{ color: currentType.color, fontSize: 56 }}>{currentType.icon}</span>
            <span className="font-black text-lg tracking-tighter" style={{ color: currentType.color, marginTop: -6 }}>SOS</span>
          </div>
        </div>

        {/* ── Status + info ───────────────────────────────────────────── */}
        <div className="w-full max-w-sm space-y-3">

          {/* Countdown / LIVE */}
          <div className="flex flex-col items-center">
            <div className="text-5xl font-black tabular-nums tracking-tighter text-white">
              {isLive ? 'LIVE' : count}
            </div>
            <p className="text-sm font-medium text-white/80 mt-1 uppercase tracking-widest">
              {isLive ? 'Broadcasting signal...' : 'Activating...'}
            </p>
          </div>

          {/* Info card */}
          <div className="bg-black/20 backdrop-blur-xl rounded-2xl p-4 border border-white/20 space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-[#10B981] rounded-full animate-pulse" />
              <p className="text-xs font-bold uppercase tracking-wider text-white">Live Tracking Active</p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs text-white/80">
              <div>
                <p className="font-bold text-white">📍 Location</p>
                <p>{lat && lng ? `${lat.toFixed(4)}, ${lng.toFixed(4)}` : 'Acquiring...'}</p>
              </div>
              <div>
                <p className="font-bold text-white">👥 Contacts</p>
                <p>{emergencyContacts.length} saved</p>
              </div>
              <div>
                <p className="font-bold text-white">🏥 Hospital</p>
                <p className="truncate">{nearestHospital}</p>
              </div>
              <div>
                <p className="font-bold text-white">🚔 Police</p>
                <p className="truncate">{nearestPolice}</p>
              </div>
            </div>
          </div>

          {/* ── Gateway notification status ─────────────────────────── */}
          {alertSent && (
            <div className="bg-black/25 backdrop-blur-xl rounded-2xl p-4 border border-white/20 space-y-2">
              <p className="text-xs font-black uppercase tracking-widest text-white mb-2">Safety Guardian Gateway</p>

              {/* Status line */}
              {statusInfo && (
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className="material-symbols-outlined icon-filled"
                    style={{ color: statusInfo.color, fontSize: '16px' }}
                  >
                    {statusInfo.icon}
                  </span>
                  <span className="text-white/90 text-xs font-semibold">{statusInfo.text}</span>
                </div>
              )}

              {/* Delivery checklist */}
              <div className="space-y-1.5">
                {/* SMS */}
                <div className="flex items-center gap-2">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${smsDone ? 'bg-[#10B981]' : 'bg-white/20'}`}>
                    {smsDone
                      ? <span className="material-symbols-outlined text-white" style={{ fontSize: '12px' }}>check</span>
                      : <div className="w-2 h-2 rounded-full bg-white/50 animate-pulse" />
                    }
                  </div>
                  <div>
                    <p className="text-white text-xs font-bold">SMS from +91 7797822568</p>
                    <p className="text-white/60 text-[10px]">
                      {smsDone ? `Sent to ${emergencyContacts.length} contact(s)` : 'Sending automatically…'}
                    </p>
                  </div>
                </div>

                {/* Call */}
                <div className="flex items-center gap-2">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${callDone ? 'bg-[#10B981]' : 'bg-white/20'}`}>
                    {callDone
                      ? <span className="material-symbols-outlined text-white" style={{ fontSize: '12px' }}>check</span>
                      : <div className="w-2 h-2 rounded-full bg-white/50 animate-pulse" />
                    }
                  </div>
                  <div>
                    <p className="text-white text-xs font-bold">Call to primary contact</p>
                    <p className="text-white/60 text-[10px]">
                      {callDone
                        ? `Called ${emergencyContacts[0]?.name || 'primary contact'}`
                        : smsDone ? 'Calling now…' : 'Will call after SMS…'}
                    </p>
                  </div>
                </div>

                {/* All done */}
                {allDone && (
                  <div className="mt-2 bg-[#10B981]/20 rounded-xl px-3 py-2 flex items-center gap-2">
                    <span className="material-symbols-outlined text-[#10B981] icon-filled" style={{ fontSize: '18px' }}>check_circle</span>
                    <p className="text-[#10B981] text-xs font-black">All contacts notified!</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Error fallback */}
          {sendError && (
            <div className="bg-black/30 rounded-2xl p-3 border border-orange-400/40">
              <p className="text-orange-300 text-xs">{sendError}</p>
            </div>
          )}

          {/* SMS redirect status — only shown when redirect is not possible (e.g. desktop) */}
          {smsStatus && (
            <div className="bg-black/30 rounded-2xl p-3 border border-yellow-400/40">
              <p className="text-yellow-200 text-xs">📱 {smsStatus}</p>
            </div>
          )}

          {/* ── WhatsApp button (user sends themselves) ─────────────── */}
          <button
            onClick={openWhatsApp}
            className="w-full rounded-2xl py-4 flex items-center justify-center gap-3 shadow-xl active:scale-[0.98] transition-all"
            style={{ background: '#25D366' }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.885 3.49"/>
            </svg>
            <div className="text-left">
              <p className="text-white font-black text-sm">Send WhatsApp Alert</p>
              <p className="text-white/80 text-[10px]">Opens WhatsApp — tap Send to deliver</p>
            </div>
          </button>

          {/* ── Hold to cancel ─────────────────────────────────────── */}
          <button
            className="relative w-full h-16 bg-white rounded-2xl overflow-hidden active:scale-[0.98] transition-all shadow-xl select-none"
            onMouseDown={handleCancelStart}
            onMouseUp={handleCancelEnd}
            onMouseLeave={handleCancelEnd}
            onTouchStart={handleCancelStart}
            onTouchEnd={handleCancelEnd}
          >
            <div className="absolute left-0 top-0 bottom-0 bg-black/10" style={{ width: `${cancelProgress}%`, transition: 'none' }} />
            <div className="relative z-10 flex flex-col items-center justify-center h-full">
              <span className="font-black text-[#EF4444] text-base tracking-tight flex items-center gap-2">
                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>cancel</span>
                HOLD TO CANCEL
              </span>
              <span className="text-[9px] text-[#EF4444]/60 font-bold uppercase tracking-widest">3 Second Safety Lock</span>
            </div>
          </button>

        </div>
      </div>
    </div>
  )
}
