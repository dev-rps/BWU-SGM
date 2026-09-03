import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../../context/store'
import { getCurrentLocation } from '../../services/location'

const PERMS = [
  { id: 'location', icon: 'my_location', label: 'Location Access', desc: 'Required to show your position on the map and calculate safe routes.', color: '#004ac6' },
  { id: 'notifications', icon: 'notifications', label: 'Notifications', desc: 'Get real-time alerts about nearby hazards and emergency updates.', color: '#10B981' },
  { id: 'camera', icon: 'camera_alt', label: 'Camera', desc: 'Used to attach photos when reporting hazards in your area.', color: '#F59E0B' },
]

export default function PermissionsPage() {
  const navigate = useNavigate()
  const { setHasPermissions, setUserLocation } = useAppStore()
  const [granted, setGranted] = useState({})
  const [loading, setLoading] = useState(false)

  const handleGrantAll = async () => {
    setLoading(true)
    // Try to get real location, fallback gracefully
    const loc = await getCurrentLocation()
    setUserLocation(loc)
    setGranted({ location: true, notifications: true, camera: true })
    await new Promise(r => setTimeout(r, 600))
    setHasPermissions(true)
    navigate('/')
  }

  const handleGrant = (id) => setGranted(prev => ({ ...prev, [id]: true }))

  return (
    <div className="fixed inset-0 bg-[#f7f9fb] flex flex-col overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-[#004ac6]/5 to-transparent" />

      <div className="relative z-10 flex flex-col h-full max-w-md mx-auto w-full justify-center px-6">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-[#004ac6]/10 flex items-center justify-center mx-auto mb-4">
            <span className="material-symbols-outlined text-[#004ac6] text-[32px] icon-filled">shield</span>
          </div>
          <h1 className="text-2xl font-bold text-[#191c1e] tracking-tight">Enable Permissions</h1>
          <p className="text-sm text-[#737686] mt-2 leading-relaxed">Safety Guardian needs these permissions to keep you safe.</p>
        </div>

        <div className="space-y-3 mb-8">
          {PERMS.map(p => (
            <div key={p.id} className="glass-panel rounded-2xl p-4 flex items-center gap-4 border border-white/30">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: p.color + '18' }}>
                <span className="material-symbols-outlined icon-filled" style={{ color: p.color }}>{p.icon}</span>
              </div>
              <div className="flex-1">
                <p className="font-semibold text-sm text-[#191c1e]">{p.label}</p>
                <p className="text-xs text-[#737686] mt-0.5 leading-relaxed">{p.desc}</p>
              </div>
              {granted[p.id] ? (
                <span className="material-symbols-outlined text-[#10B981] icon-filled">check_circle</span>
              ) : (
                <button onClick={() => handleGrant(p.id)}
                  className="text-xs font-bold text-[#004ac6] border border-[#004ac6]/30 rounded-lg px-3 py-1 hover:bg-[#004ac6]/10 transition-colors"
                >
                  Allow
                </button>
              )}
            </div>
          ))}
        </div>

        <button onClick={handleGrantAll} disabled={loading}
          className="w-full h-14 rounded-xl bg-[#004ac6] text-white font-semibold shadow-lg shadow-blue-300/30 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-70"
        >
          {loading ? <span className="material-symbols-outlined animate-spin">refresh</span> : 'Allow All & Continue'}
        </button>

        <button onClick={() => { setHasPermissions(true); navigate('/') }}
          className="text-center text-xs text-[#737686] mt-4 hover:text-[#004ac6] transition-colors"
        >
          Skip for now
        </button>
      </div>
    </div>
  )
}
