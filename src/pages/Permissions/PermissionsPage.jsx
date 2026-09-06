import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../../context/store'
import { getCurrentLocation, getInitialLocation } from '../../services/location'

const PERMS = [
  {
    id: 'location',
    icon: 'my_location',
    label: 'Location Access',
    desc: 'Shows your live position on the safety map, detects nearby emergency services, and calculates safe routes.',
    color: '#004ac6',
    fallbackNote: 'Will use simulated West Bengal coordinates in Demo Mode if not allowed.',
  },
  {
    id: 'camera',
    icon: 'photo_camera',
    label: 'Camera Access',
    desc: 'Allows snapping quick photos when reporting road hazards, accidents, or safe zones.',
    color: '#F59E0B',
    fallbackNote: 'You can still report incidents using manual photo uploads.',
  },
  {
    id: 'notifications',
    icon: 'notifications_active',
    label: 'Safety Notifications',
    desc: 'Sends real-time high-risk alerts, SOS friend broadcasts, and severe weather warnings.',
    color: '#10B981',
    fallbackNote: 'Alerts will be displayed inside the application UI only.',
  },
]

export default function PermissionsPage() {
  const navigate = useNavigate()
  const {
    setHasPermissions,
    setUserLocation,
    permissions,
    setPermission,
    isDemoMode,
  } = useAppStore()

  const [statuses, setStatuses] = useState({
    location: permissions?.location ? 'granted' : 'idle',
    camera: permissions?.camera ? 'granted' : 'idle',
    notifications: permissions?.notifications ? 'granted' : 'idle',
  })
  const [requestingId, setRequestingId] = useState(null)
  const [loadingAll, setLoadingAll] = useState(false)

  /* ── Permission Request Handlers ───────────────────────────────────────── */

  const requestLocation = async () => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      setStatuses((s) => ({ ...s, location: 'unsupported' }))
      setPermission('location', false)
      return false
    }

    setRequestingId('location')
    try {
      const loc = await getCurrentLocation()
      if (loc && !loc.simulated) {
        setUserLocation(loc)
        setPermission('location', true)
        setStatuses((s) => ({ ...s, location: 'granted' }))
        return true
      } else {
        setUserLocation(loc || getInitialLocation())
        setPermission('location', false)
        setStatuses((s) => ({ ...s, location: 'denied' }))
        return false
      }
    } catch (err) {
      console.warn('[Location Permission Error]', err)
      setUserLocation(getInitialLocation())
      setPermission('location', false)
      setStatuses((s) => ({ ...s, location: 'denied' }))
      return false
    } finally {
      setRequestingId(null)
    }
  }

  const requestCamera = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setStatuses((s) => ({ ...s, camera: 'unsupported' }))
      setPermission('camera', false)
      return false
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true })
      stream.getTracks().forEach((t) => t.stop())
      setPermission('camera', true)
      setStatuses((s) => ({ ...s, camera: 'granted' }))
      return true
    } catch (err) {
      console.warn('[Camera Permission Error]', err)
      setPermission('camera', false)
      setStatuses((s) => ({ ...s, camera: 'denied' }))
      return false
    }
  }

  const requestNotifications = async () => {
    if (!('Notification' in window)) {
      setStatuses((s) => ({ ...s, notifications: 'unsupported' }))
      setPermission('notifications', false)
      return false
    }

    try {
      const res = await Notification.requestPermission()
      const granted = res === 'granted'
      setPermission('notifications', granted)
      setStatuses((s) => ({ ...s, notifications: granted ? 'granted' : 'denied' }))
      return granted
    } catch (err) {
      console.warn('[Notification Permission Error]', err)
      setPermission('notifications', false)
      setStatuses((s) => ({ ...s, notifications: 'denied' }))
      return false
    }
  }

  const handleSingleGrant = async (id) => {
    setRequestingId(id)
    if (id === 'location') await requestLocation()
    else if (id === 'camera') await requestCamera()
    else if (id === 'notifications') await requestNotifications()
    setRequestingId(null)
  }

  const handleGrantAll = async () => {
    setLoadingAll(true)
    if (statuses.location !== 'granted') await requestLocation()
    if (statuses.camera !== 'granted') await requestCamera()
    if (statuses.notifications !== 'granted') await requestNotifications()
    setLoadingAll(false)
    setHasPermissions(true)
    navigate('/')
  }

  const handleSkipOrDemo = () => {
    setHasPermissions(true)
    navigate('/')
  }

  return (
    <div className="fixed inset-0 bg-[#f8fafc] flex flex-col overflow-y-auto">
      <div className="absolute inset-0 bg-gradient-to-br from-[#004ac6]/5 via-transparent to-[#10B981]/5 pointer-events-none" />

      <div className="relative z-10 flex flex-col min-h-full max-w-md mx-auto w-full justify-center px-6 py-10">
        {/* Header Badge & Title */}
        <div className="text-center mb-6">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-[#004ac6] to-[#2563EB] flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-500/20">
            <span className="material-symbols-outlined text-white text-[32px] icon-filled">shield</span>
          </div>

          <h1 className="text-2xl font-extrabold text-[#0f172a] tracking-tight">Permissions & Privacy</h1>
          <p className="text-sm text-[#64748b] mt-1.5 leading-relaxed">
            Safety Guardian uses your device features to assess routes and provide emergency protection.
          </p>
        </div>

        {/* Demo Mode Notice */}
        {isDemoMode && (
          <div className="mb-5 p-3.5 rounded-xl bg-blue-50 border border-blue-200/80 flex items-start gap-3 text-left">
            <span className="material-symbols-outlined text-[#004ac6] text-[20px] flex-shrink-0 mt-0.5 icon-filled">info</span>
            <div className="text-xs text-[#1e3a8a] leading-relaxed">
              <span className="font-bold">Demo Mode Active:</span> You can allow real device permissions to test hardware features, or continue with simulated Kolkata/West Bengal demo data.
            </div>
          </div>
        )}

        {/* Permission Cards */}
        <div className="space-y-3 mb-6">
          {PERMS.map((p) => {
            const status = statuses[p.id]
            const isBusy = requestingId === p.id

            return (
              <div
                key={p.id}
                className="bg-white/90 backdrop-blur-md rounded-2xl p-4 flex items-center gap-3.5 border border-slate-200/70 shadow-sm transition-all"
              >
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: p.color + '15' }}
                >
                  <span className="material-symbols-outlined icon-filled" style={{ color: p.color, fontSize: 22 }}>
                    {p.icon}
                  </span>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-sm text-[#0f172a]">{p.label}</p>
                  </div>
                  <p className="text-xs text-[#64748b] mt-0.5 leading-relaxed">{p.desc}</p>
                  {status === 'denied' && (
                    <p className="text-[11px] text-amber-600 font-medium mt-1">
                      {p.fallbackNote}
                    </p>
                  )}
                </div>

                <div className="flex-shrink-0">
                  {status === 'granted' ? (
                    <div className="flex items-center gap-1 text-xs font-bold text-[#10B981] bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg">
                      <span className="material-symbols-outlined text-[16px] icon-filled">check_circle</span>
                      Allowed
                    </div>
                  ) : status === 'denied' ? (
                    <button
                      type="button"
                      onClick={() => handleSingleGrant(p.id)}
                      disabled={isBusy}
                      className="text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg px-2.5 py-1 transition-colors"
                    >
                      {isBusy ? 'Asking…' : 'Retry'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleSingleGrant(p.id)}
                      disabled={isBusy}
                      className="text-xs font-bold text-[#004ac6] bg-blue-50 hover:bg-blue-100 border border-[#004ac6]/30 rounded-lg px-3 py-1.5 transition-colors active:scale-95"
                    >
                      {isBusy ? (
                        <span className="inline-block animate-spin material-symbols-outlined text-[14px]">progress_activity</span>
                      ) : (
                        'Allow'
                      )}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Action Buttons */}
        <div className="space-y-2.5">
          <button
            type="button"
            onClick={handleGrantAll}
            disabled={loadingAll || requestingId !== null}
            className="w-full h-13 rounded-xl bg-[#004ac6] hover:bg-[#003da6] text-white font-bold text-sm shadow-lg shadow-blue-600/25 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-70 cursor-pointer"
          >
            {loadingAll ? (
              <>
                <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
                <span>Requesting Permissions…</span>
              </>
            ) : (
              <>
                <span>Allow All & Continue</span>
                <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleSkipOrDemo}
            className="w-full h-11 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-800 bg-transparent hover:bg-slate-100/70 border border-slate-200/80 transition-colors"
          >
            {isDemoMode ? 'Continue with Simulated Demo Data' : 'Skip for now'}
          </button>
        </div>

        <p className="text-[11px] text-slate-400 text-center mt-4">
          You can adjust your camera, location, and notification preferences at any time in your browser or device settings.
        </p>
      </div>
    </div>
  )
}
