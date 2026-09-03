import { useEffect, useState, useRef } from 'react'

/**
 * Play a clean futuristic GPS lock chime via Web Audio API.
 * No external mp3/wav files required — 100% reliable and instant.
 */
function playGpsLockSound() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext
    if (!AudioContext) return
    const ctx = new AudioContext()

    const playTone = (freq, start, duration) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, ctx.currentTime + start)
      gain.gain.setValueAtTime(0.001, ctx.currentTime + start)
      gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + start + 0.05)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + duration)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(ctx.currentTime + start)
      osc.stop(ctx.currentTime + start + duration)
    }

    // Dual-tone harmonic ascending chime (587.33Hz D5 -> 880Hz A5)
    playTone(587.33, 0.05, 0.25)
    playTone(880.00, 0.22, 0.45)
  } catch (err) {
    // AudioContext may be blocked before interaction, safe to ignore
    console.debug('Audio chime skipped:', err)
  }
}

export default function StartNavigationOverlay({ route, destination, onComplete, onCancel }) {
  const [progress, setProgress] = useState(0)
  const [stage, setStage] = useState(0)
  const hasTriggeredRef = useRef(false)

  const STAGES = [
    { text: 'Locking GPS Satellite Fix...', icon: 'satellite_alt', color: '#38BDF8' },
    { text: 'Analyzing Live Road & Safety Shield...', icon: 'shield', color: '#10B981' },
    { text: 'Turn-by-Turn Guidance Ready!', icon: 'navigation', color: '#004ac6' },
  ]

  useEffect(() => {
    // Play chime immediately on launch
    playGpsLockSound()

    // Smooth progress animation over 1.3 seconds
    const startTime = Date.now()
    const duration = 1300

    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime
      const pct = Math.min(100, Math.round((elapsed / duration) * 100))
      setProgress(pct)

      if (pct < 40) {
        setStage(0)
      } else if (pct < 85) {
        setStage(1)
      } else {
        setStage(2)
      }

      if (pct >= 100 && !hasTriggeredRef.current) {
        hasTriggeredRef.current = true
        clearInterval(interval)
        setTimeout(() => {
          onComplete()
        }, 180)
      }
    }, 25)

    return () => clearInterval(interval)
  }, [onComplete])

  const currentStage = STAGES[stage]

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/80 backdrop-blur-xl transition-opacity animate-fade-in p-4 select-none">
      <div className="relative w-full max-w-sm rounded-3xl bg-gradient-to-b from-slate-900 to-slate-950 p-6 border border-slate-800 shadow-[0_20px_50px_rgba(0,0,0,0.8)] text-center overflow-hidden">
        
        {/* Ambient background glow */}
        <div 
          className="absolute -top-24 left-1/2 -translate-x-1/2 w-48 h-48 rounded-full blur-3xl opacity-30 pointer-events-none transition-colors duration-500"
          style={{ background: currentStage.color }}
        />

        {/* Radar Scanner Animation */}
        <div className="relative mx-auto my-4 w-28 h-28 flex items-center justify-center">
          {/* Concentric pulsing rings */}
          <div className="absolute inset-0 rounded-full border border-sky-500/20 animate-ping opacity-40" />
          <div className="absolute inset-2 rounded-full border border-sky-500/30" />
          <div className="absolute inset-6 rounded-full border border-sky-500/40" />
          
          {/* Radar sweeping line */}
          <div 
            className="absolute inset-0 rounded-full"
            style={{
              background: 'conic-gradient(from 0deg, transparent 70%, rgba(56,189,248,0.4) 100%)',
              animation: 'spin 2s linear infinite',
            }}
          />

          {/* Center 3D Navigation Chevron */}
          <div className="relative z-10 w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-600 to-sky-400 p-0.5 shadow-[0_0_25px_rgba(14,165,233,0.5)] flex items-center justify-center animate-pulse">
            <div className="w-full h-full rounded-[14px] bg-slate-950 flex items-center justify-center">
              <span className="material-symbols-outlined text-sky-400 icon-filled text-[32px] transform rotate-45">
                near_me
              </span>
            </div>
          </div>
        </div>

        {/* Title */}
        <h2 className="text-xl font-black text-white tracking-tight mt-2 mb-1">
          Starting Navigation
        </h2>

        {/* Destination preview */}
        <p className="text-xs text-slate-400 font-medium truncate max-w-[240px] mx-auto mb-4">
          To: {destination?.name || 'Destination'}
        </p>

        {/* Live Status Stage */}
        <div className="flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-slate-800/60 border border-slate-700/50 mb-5">
          <span 
            className="material-symbols-outlined icon-filled text-[18px] animate-bounce"
            style={{ color: currentStage.color }}
          >
            {currentStage.icon}
          </span>
          <span className="text-xs font-bold text-slate-200">
            {currentStage.text}
          </span>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden mb-2 relative">
          <div
            className="h-full bg-gradient-to-r from-blue-500 via-sky-400 to-emerald-400 transition-all duration-75 rounded-full"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="flex justify-between items-center text-[10px] text-slate-500 font-semibold px-1 mb-4">
          <span>Route: {route?.viaRoads || 'Optimal Path'}</span>
          <span>{progress}%</span>
        </div>

        {/* Cancel / Skip buttons */}
        <div className="flex items-center justify-between gap-3 pt-1">
          {onCancel && (
            <button
              onClick={onCancel}
              className="flex-1 py-2 text-xs font-bold text-slate-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
          )}
          <button
            onClick={onComplete}
            className="flex-1 py-2 text-xs font-bold text-sky-400 hover:text-sky-300 transition-colors"
          >
            Skip &gt;&gt;
          </button>
        </div>
      </div>
    </div>
  )
}
