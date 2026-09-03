import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

export default function SplashPage() {
  const navigate = useNavigate()

  useEffect(() => {
    const t = setTimeout(() => navigate('/onboarding'), 2500)
    return () => clearTimeout(t)
  }, [navigate])

  return (
    <div className="fixed inset-0 bg-[#004ac6] flex flex-col items-center justify-center overflow-hidden">
      {/* Background mesh */}
      <div className="absolute inset-0 opacity-10" style={{
        backgroundImage: 'radial-gradient(#ffffff 1px, transparent 1px)',
        backgroundSize: '24px 24px',
      }} />
      <div className="absolute inset-0 bg-gradient-to-br from-[#2563eb]/40 via-transparent to-[#10B981]/20" />

      {/* Logo */}
      <div className="relative z-10 flex flex-col items-center gap-6 animate-fade-in">
        <div className="w-24 h-24 rounded-3xl bg-white/15 backdrop-blur-md border border-white/25 flex items-center justify-center shadow-2xl p-2">
          <img src="/logo.png" style={{ width: '100%', height: '100%', objectFit: 'contain', mixBlendMode: 'multiply' }} alt="Logo" />
        </div>
        <div className="text-center">
          <h1 className="text-4xl font-black text-white tracking-tight">Safety Guardian</h1>
          <p className="text-white/70 text-sm font-medium mt-1 tracking-wide">West Bengal Safe Navigation</p>
        </div>
        <div className="flex gap-2 mt-4">
          <div className="w-2 h-2 rounded-full bg-white/40 animate-bounce" style={{ animationDelay: '0ms' }} />
          <div className="w-2 h-2 rounded-full bg-white/40 animate-bounce" style={{ animationDelay: '150ms' }} />
          <div className="w-2 h-2 rounded-full bg-white/40 animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>

      {/* Footer */}
      <div className="absolute bottom-8 text-white/40 text-xs font-medium tracking-widest uppercase">
        Brainware University © 2025
      </div>
    </div>
  )
}
