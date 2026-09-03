import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAppStore } from '../../context/store'
import SOSButton from '../buttons/SOSButton'

// Order: Report | Journey | [HOME center] | Chat | Profile
const NAV_ITEMS = [
  { path: '/reports', label: 'Report',  icon: 'flag'   },
  { path: '/routes',  label: 'Journey', icon: 'map'    },
  { path: '/',        label: 'Home',    icon: 'home',   isCenter: true },
  { path: '/chat',    label: 'Chat',    icon: 'forum'  },
  { path: '/profile', label: 'Profile', icon: 'person' },
]

export default function MainLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const { sosActive } = useAppStore()

  const isActive = (path) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path)

  const isNavigating = location.pathname === '/navigate'

  return (
    <div className="relative w-full overflow-hidden bg-[#f7f9fb]" style={{ height: '100dvh' }}>

      {/* Page content — give bottom padding only when bottom nav is visible */}
      <div className="absolute inset-0" style={{ bottom: isNavigating ? '0px' : '80px' }}>
        <Outlet />
      </div>

      {/* Floating SOS button — hidden on /chat and during active turn-by-turn navigation */}
      {!sosActive && !isNavigating && location.pathname !== '/chat' && <SOSButton />}

      {/* ── Bottom Navigation Bar — hidden during active turn-by-turn navigation ── */}
      {!isNavigating && (
        <nav className="fixed bottom-4 left-4 right-4 z-50 md:left-1/2 md:right-auto md:-translate-x-1/2 md:w-[390px]">
        <div
          className="relative flex items-center justify-between h-16 px-3 rounded-full"
          style={{
            background: 'rgba(255, 255, 255, 0.88)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(255, 255, 255, 0.5)',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.10)',
          }}
        >
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.path)

            // ── Centre floating home button ──
            if (item.isCenter) {
              return (
                <div key={item.path} className="relative flex justify-center" style={{ width: 64 }}>
                  <button
                    onClick={() => navigate(item.path)}
                    className="absolute flex items-center justify-center w-14 h-14 rounded-full text-white transition-transform active:scale-90"
                    style={{
                      top: '-28px',
                      background: 'linear-gradient(135deg, #0062f5, #004ac6)',
                      boxShadow: '0 6px 20px rgba(0, 74, 198, 0.45)',
                      border: '3px solid rgba(247, 249, 251, 0.9)',
                    }}
                  >
                    <span className={`material-symbols-outlined text-[26px] ${active ? 'icon-filled' : ''}`}>
                      {item.icon}
                    </span>
                  </button>
                </div>
              )
            }

            // ── Regular tab button ──
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className="flex flex-col items-center justify-center gap-0.5 transition-all duration-200 active:scale-90 rounded-2xl px-3 py-2"
                style={{ color: active ? '#004ac6' : '#737686' }}
              >
                <span
                  className={`material-symbols-outlined text-[22px] transition-all duration-200 ${active ? 'icon-filled' : ''}`}
                  style={{ transform: active ? 'scale(1.1)' : 'scale(1)' }}
                >
                  {item.icon}
                </span>
                <span className="text-[9px] font-bold uppercase tracking-wider leading-none">
                  {item.label}
                </span>
                {active && (
                  <div
                    className="w-1 h-1 rounded-full mt-0.5"
                    style={{ background: '#004ac6' }}
                  />
                )}
              </button>
            )
          })}
        </div>
      </nav>
      )}
    </div>
  )
}
