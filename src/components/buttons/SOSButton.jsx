import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../../context/store'
import { useRef, useEffect } from 'react'

export default function SOSButton() {
  const navigate = useNavigate()
  const { setSosActive } = useAppStore()
  
  const pressTimerRef = useRef(null)
  const tapCountRef = useRef(0)
  const tapTimerRef = useRef(null)

  const handleSOS = () => {
    setSosActive(true)
    navigate('/emergency')
  }

  const handlePointerDown = () => {
    pressTimerRef.current = setTimeout(() => {
      // Long press triggered (1.5 seconds)
      handleSOS()
    }, 1500)
  }

  const handlePointerUp = () => {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current)
      pressTimerRef.current = null
    }
  }

  const handleClick = (e) => {
    // Prevent default to avoid double-firing with touch
    e.preventDefault()
    
    tapCountRef.current += 1
    
    if (tapCountRef.current >= 2) {
      // Double tap (or triple tap) triggers SOS immediately
      handleSOS()
      tapCountRef.current = 0
      if (tapTimerRef.current) clearTimeout(tapTimerRef.current)
    } else {
      tapTimerRef.current = setTimeout(() => {
        // Reset if they didn't tap again within 500ms
        tapCountRef.current = 0
      }, 500)
    }
  }

  useEffect(() => {
    return () => {
      if (pressTimerRef.current) clearTimeout(pressTimerRef.current)
      if (tapTimerRef.current) clearTimeout(tapTimerRef.current)
    }
  }, [])

  return (
    <button
      id="sos-btn"
      onClick={handleClick}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      className="fixed bottom-24 right-4 z-50 w-14 h-14 rounded-full bg-[#EF4444] text-white shadow-2xl shadow-red-500/40 flex items-center justify-center font-black text-sm tracking-tighter active:scale-90 transition-transform"
      style={{ animation: 'pulse-sos 2s infinite' }}
    >
      <style>{`
        @keyframes pulse-sos {
          0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7); }
          70% { box-shadow: 0 0 0 14px rgba(239, 68, 68, 0); }
          100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
        }
      `}</style>
      SOS
    </button>
  )
}
