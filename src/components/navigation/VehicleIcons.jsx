import React from 'react'

export function MotorbikeIcon2D({ className = "w-12 h-16", style = {} }) {
  return (
    <svg className={className} style={style} fill="none" viewBox="0 0 64 80" xmlns="http://www.w3.org/2000/svg">
      <rect fill="#0f172a" height="15" rx="3.5" stroke="#334155" strokeWidth="1" width="8" x="28" y="2" />
      <rect fill="#1B4332" height="8" rx="2" width="9" x="27.5" y="8" />
      <path d="M 12 18 L 52 18" stroke="#1e293b" strokeLinecap="round" strokeWidth="3" />
      <circle cx="12" cy="18" fill="#334155" r="2.5" />
      <circle cx="52" cy="18" fill="#334155" r="2.5" />
      <ellipse cx="8" cy="15" fill="#0284c7" rx="3.5" ry="2" stroke="#0f172a" strokeWidth="1" />
      <ellipse cx="56" cy="15" fill="#0284c7" rx="3.5" ry="2" stroke="#0f172a" strokeWidth="1" />
      <path d="M 27 15 L 37 15 L 35 22 L 29 22 Z" fill="#38bdf8" stroke="#0284c7" strokeWidth="0.8" />
      <circle cx="32" cy="17" fill="#ffffff" r="2" />
      <path d="M 25 20 C 23 28 22 46 24 64 C 25 68 39 68 40 64 C 42 46 41 28 39 20 Z" fill="#1B4332" stroke="#0f172a" strokeWidth="1.2" />
      <rect fill="#334155" height="14" rx="1.5" width="4" x="20" y="34" />
      <rect fill="#334155" height="14" rx="1.5" width="4" x="40" y="34" />
      <rect fill="#0f172a" height="17" rx="3.5" stroke="#334155" strokeWidth="1" width="8" x="28" y="60" />
      <rect fill="#ef4444" height="2.5" rx="1" width="10" x="27" y="68" />
      <path d="M 21 34 C 21 28 43 28 43 34 C 43 45 42 50 40 52 C 37 54 27 54 24 52 C 22 50 21 45 21 34 Z" fill="#0f172a" />
      <line stroke="#10B981" strokeLinecap="round" strokeWidth="2" x1="22" x2="28" y1="33" y2="38" />
      <line stroke="#10B981" strokeLinecap="round" strokeWidth="2" x1="42" x2="36" y1="33" y2="38" />
      <path d="M 23 33 L 15 20" stroke="#0f172a" strokeLinecap="round" strokeWidth="3" />
      <path d="M 41 33 L 49 20" stroke="#0f172a" strokeLinecap="round" strokeWidth="3" />
      <ellipse cx="32" cy="35" fill="#ffffff" rx="9" ry="11" stroke="#0f172a" strokeWidth="1.5" />
      <path d="M 26 27 C 29 25 35 25 38 27 C 39 30 39 32 38 33 C 35 34 29 34 26 33 Z" fill="#0284c7" stroke="#0369a1" strokeWidth="0.8" />
      <path d="M 32 26 L 32 44" stroke="#10B981" strokeLinecap="round" strokeWidth="1.5" />
    </svg>
  )
}

export function MotorbikeIcon3D({ className = "w-28 h-36", style = {} }) {
  return (
    <svg className={className} style={style} fill="none" viewBox="0 0 112 144" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="mb-chassis" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#2d5242" />
          <stop offset="50%" stopColor="#143427" />
          <stop offset="100%" stopColor="#0a1a13" />
        </linearGradient>
        <linearGradient id="mb-exhaust" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#94a3b8" />
          <stop offset="100%" stopColor="#334155" />
        </linearGradient>
      </defs>
      <ellipse cx="56" cy="138" fill="#0f172a" opacity="0.45" rx="26" ry="6" />
      <rect fill="#090d16" height="42" rx="7" stroke="#1e293b" strokeWidth="1.5" width="18" x="47" y="94" />
      <path d="M 49 104 L 56 109 L 63 104" fill="none" stroke="#334155" strokeLinecap="round" strokeWidth="1.5" />
      <path d="M 49 116 L 56 121 L 63 116" fill="none" stroke="#334155" strokeLinecap="round" strokeWidth="1.5" />
      <rect fill="url(#mb-exhaust)" height="24" rx="3" stroke="#1e293b" strokeWidth="1" width="6" x="36" y="98" />
      <rect fill="url(#mb-exhaust)" height="24" rx="3" stroke="#1e293b" strokeWidth="1" width="6" x="70" y="98" />
      <path d="M 38 68 C 38 52 74 52 74 68 C 74 78 68 94 66 98 C 64 101 48 101 46 98 C 44 94 38 78 38 68 Z" fill="url(#mb-chassis)" stroke="#0f172a" strokeWidth="1.5" />
      <rect fill="#ef4444" height="4.5" rx="2" stroke="#b91c1c" strokeWidth="0.8" width="24" x="44" y="86" />
      <path d="M 16 48 L 96 48" stroke="#1e293b" strokeLinecap="round" strokeWidth="4.5" />
      <ellipse cx="12" cy="46" fill="#38bdf8" rx="4.5" ry="3.5" stroke="#0f172a" strokeWidth="1.5" />
      <ellipse cx="100" cy="46" fill="#38bdf8" rx="4.5" ry="3.5" stroke="#0f172a" strokeWidth="1.5" />
      <rect fill="#334155" height="5" rx="1.5" width="10" x="18" y="45.5" />
      <rect fill="#334155" height="5" rx="1.5" width="10" x="84" y="45.5" />
      <polygon fill="#10B981" opacity="0.9" points="50,44 62,44 60,39 52,39" />
      <path d="M 32 44 C 32 32 80 32 80 44 C 80 66 74 82 68 86 C 63 89 49 89 44 86 C 38 82 32 66 32 44 Z" fill="#0f172a" stroke="#1e293b" strokeWidth="1" />
      <path d="M 36 42 Q 56 46 76 42" fill="none" stroke="#10B981" strokeLinecap="round" strokeWidth="3" />
      <line stroke="#10B981" strokeLinecap="round" strokeWidth="2.5" x1="56" x2="56" y1="46" y2="76" />
      <rect fill="#1e293b" height="18" rx="2" width="8" x="52" y="52" />
      <path d="M 34 44 L 25 47" stroke="#0f172a" strokeLinecap="round" strokeWidth="6" />
      <path d="M 78 44 L 87 47" stroke="#0f172a" strokeLinecap="round" strokeWidth="6" />
      <ellipse cx="56" cy="25" fill="#ffffff" rx="14" ry="17" stroke="#0f172a" strokeWidth="2" />
      <path d="M 56 8 L 56 36" stroke="#10B981" strokeLinecap="round" strokeWidth="3" />
      <path d="M 44 14 Q 56 18 68 14" fill="none" stroke="#0284c7" strokeLinecap="round" strokeWidth="2" />
      <path d="M 48 34 L 64 34 L 61 38 L 51 38 Z" fill="#0f172a" />
    </svg>
  )
}

export function CyclingIcon2D({ className = "w-11 h-11", style = {} }) {
  return (
    <svg className={className} style={style} fill="none" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      <rect fill="#1e293b" height="13" rx="1.5" width="3" x="30.5" y="4" />
      <rect fill="#1e293b" height="13" rx="1.5" width="3" x="30.5" y="47" />
      <line stroke="#059669" strokeLinecap="round" strokeWidth="3" x1="32" x2="32" y1="14" y2="49" />
      <path d="M 21 16 Q 32 14 43 16" stroke="#0f172a" strokeLinecap="round" strokeWidth="3.5" />
      <circle cx="21" cy="17" fill="#334155" r="2" />
      <circle cx="43" cy="17" fill="#334155" r="2" />
      <path d="M 23 26 L 24 18" stroke="#f1a87d" strokeLinecap="round" strokeWidth="3" />
      <path d="M 41 26 L 40 18" stroke="#f1a87d" strokeLinecap="round" strokeWidth="3" />
      <ellipse cx="32" cy="33" fill="#10b981" rx="11" ry="8" />
      <path d="M 23 33 L 41 33" stroke="#059669" strokeWidth="2" />
      <ellipse cx="32" cy="27" fill="#ffffff" rx="7.5" ry="9.5" stroke="#0f172a" strokeWidth="1.5" />
      <line stroke="#10b981" strokeLinecap="round" strokeWidth="1.5" x1="30" x2="29" y1="21" y2="29" />
      <line stroke="#10b981" strokeLinecap="round" strokeWidth="1.5" x1="34" x2="35" y1="21" y2="29" />
      <line stroke="#0f172a" strokeLinecap="round" strokeWidth="1.2" x1="32" x2="32" y1="20" y2="31" />
      <path d="M 30 43 L 34 43 L 33 46 L 31 46 Z" fill="#0f172a" />
    </svg>
  )
}

export function CyclingIcon3D({ className = "w-24 h-28", style = {} }) {
  return (
    <svg className={className} style={style} fill="none" viewBox="0 0 80 96" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="40" cy="92" fill="#0f172a" opacity="0.4" rx="20" ry="4" />
      <rect fill="#0f172a" height="32" rx="3.5" stroke="#334155" strokeWidth="1.5" width="7" x="36.5" y="60" />
      <line stroke="#059669" strokeLinecap="round" strokeWidth="3" x1="40" x2="40" y1="42" y2="76" />
      <line stroke="#10b981" strokeLinecap="round" strokeWidth="2.5" x1="34" x2="40" y1="52" y2="74" />
      <line stroke="#10b981" strokeLinecap="round" strokeWidth="2.5" x1="46" x2="40" y1="52" y2="74" />
      <path d="M 33 50 Q 40 48 47 50 L 40 56 Z" fill="#1e293b" />
      <path d="M 18 36 Q 40 33 62 36" stroke="#1e293b" strokeLinecap="round" strokeWidth="3" />
      <circle cx="18" cy="36" fill="#334155" r="2.5" />
      <circle cx="62" cy="36" fill="#334155" r="2.5" />
      <path d="M 28 32 C 28 22 52 22 52 32 C 52 48 48 58 40 60 C 32 58 28 48 28 32 Z" fill="#10b981" stroke="#059669" strokeWidth="1" />
      <path d="M 32 30 Q 40 33 48 30" fill="none" stroke="#fef08a" strokeLinecap="round" strokeWidth="2.5" />
      <line stroke="#fef08a" strokeLinecap="round" strokeWidth="2" x1="40" x2="40" y1="33" y2="52" />
      <path d="M 30 32 L 22 37" stroke="#10b981" strokeLinecap="round" strokeWidth="4" />
      <path d="M 50 32 L 58 37" stroke="#10b981" strokeLinecap="round" strokeWidth="4" />
      <ellipse cx="40" cy="18" fill="#ffffff" rx="10" ry="12" stroke="#0f172a" strokeWidth="1.5" />
      <path d="M 40 6 L 40 26" stroke="#10b981" strokeLinecap="round" strokeWidth="2.5" />
      <path d="M 34 12 Q 40 15 46 12" fill="none" stroke="#0284c7" strokeLinecap="round" strokeWidth="1.5" />
    </svg>
  )
}

export function WalkingIcon2D({ className = "w-10 h-10", style = {} }) {
  return (
    <svg className={className} style={style} fill="none" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="24" cy="42" fill="#0f172a" opacity="0.2" rx="12" ry="3" />
      <path d="M 15 22 L 11 14" stroke="#f1a87d" strokeLinecap="round" strokeWidth="3" />
      <path d="M 33 22 L 37 30" stroke="#f1a87d" strokeLinecap="round" strokeWidth="3" />
      <ellipse cx="24" cy="23" fill="#1d4ed8" rx="12" ry="7" />
      <line stroke="#10b981" strokeLinecap="round" strokeWidth="1.5" x1="16" x2="32" y1="23" y2="23" />
      <ellipse cx="24" cy="21" fill="#f1a87d" rx="6" ry="6.5" />
      <ellipse cx="24" cy="19" fill="#1e293b" rx="6" ry="4" />
      <path d="M 20 16 Q 24 13 28 16 Z" fill="#0f172a" />
    </svg>
  )
}

export function WalkingIcon3D({ className = "w-20 h-28", style = {} }) {
  return (
    <svg className={className} style={style} fill="none" viewBox="0 0 80 110" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="40" cy="106" fill="#0f172a" opacity="0.3" rx="18" ry="4" />
      <ellipse cx="40" cy="18" fill="#f1a87d" rx="10" ry="10" />
      <path d="M 30 30 C 28 50 30 65 32 80 C 33 84 47 84 48 80 C 50 65 52 50 50 30 Z" fill="#1d4ed8" />
      <rect fill="#1e293b" height="5" rx="2" width="22" x="29" y="42" />
      <path d="M 28 30 L 22 46" stroke="#f1a87d" strokeLinecap="round" strokeWidth="4" />
      <path d="M 52 30 L 58 46" stroke="#f1a87d" strokeLinecap="round" strokeWidth="4" />
      <path d="M 32 80 L 28 100 L 36 100 Z" fill="#0f172a" />
      <path d="M 48 80 L 52 100 L 44 100 Z" fill="#0f172a" />
      <path d="M 34 46 Q 40 50 46 46" fill="none" stroke="#10B981" strokeLinecap="round" strokeWidth="2" />
    </svg>
  )
}

export function CabIcon2D({ className = "w-12 h-20", style = {} }) {
  return (
    <svg className={className} style={style} fill="none" viewBox="0 0 64 100" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="32" cy="50" fill="#0f172a" opacity="0.3" rx="26" ry="42" />
      <rect fill="#0f172a" height="16" rx="3.5" width="7" x="6" y="16" />
      <rect fill="#0f172a" height="16" rx="3.5" width="7" x="51" y="16" />
      <rect fill="#0f172a" height="16" rx="3.5" width="7" x="6" y="68" />
      <rect fill="#0f172a" height="16" rx="3.5" width="7" x="51" y="68" />
      <path d="M 13 22 C 13 14 20 8 32 8 C 44 8 51 14 51 22 L 52 78 C 52 86 45 92 32 92 C 19 92 12 86 12 78 Z" fill="#f8fafc" stroke="#334155" strokeWidth="1.5" />
      <path d="M 16 26 Q 32 28 48 26" stroke="#cbd5e1" strokeWidth="1.2" fill="none" />
      <path d="M 17 32 C 22 28 42 28 47 32 L 45 44 C 38 43 26 43 19 44 Z" fill="#38bdf8" opacity="0.85" stroke="#0284c7" strokeWidth="0.8" />
      <rect fill="#f1f5f9" height="24" rx="4" width="28" x="18" y="44" stroke="#cbd5e1" strokeWidth="1" />
      <rect fill="#1B4332" height="5" rx="1.5" width="16" x="24" y="52" />
      <circle cx="32" cy="54.5" fill="#10B981" r="1.5" />
      <path d="M 19 68 C 24 69 40 69 45 68 L 47 75 C 42 77 22 77 17 75 Z" fill="#38bdf8" opacity="0.85" stroke="#0284c7" strokeWidth="0.8" />
      <path d="M 15 10 L 22 10 L 20 14 L 15 13 Z" fill="#fef08a" stroke="#ca8a04" strokeWidth="0.5" />
      <path d="M 49 10 L 42 10 L 44 14 L 49 13 Z" fill="#fef08a" stroke="#ca8a04" strokeWidth="0.5" />
      <rect fill="#ef4444" height="3" rx="1" width="7" x="15" y="89" />
      <rect fill="#ef4444" height="3" rx="1" width="7" x="42" y="89" />
    </svg>
  )
}

export function CabIcon3D({ className = "w-28 h-28", style = {} }) {
  return (
    <svg className={className} style={style} fill="none" viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="48" cy="92" fill="#0f172a" opacity="0.4" rx="32" ry="5" />
      <rect fill="#1e293b" height="10" rx="4" width="72" x="12" y="76" />
      <rect fill="#ef4444" height="8" rx="2" width="14" x="13" y="70" />
      <rect fill="#ef4444" height="8" rx="2" width="14" x="69" y="70" />
      <path d="M 14 72 C 12 55 12 35 20 25 C 26 18 70 18 76 25 C 84 35 84 55 82 72 Z" fill="#1B4332" stroke="#0f172a" strokeWidth="1.5" />
      <path d="M 26 44 C 26 34 70 34 70 44 L 68 56 C 68 60 28 60 28 56 Z" fill="#38bdf8" opacity="0.7" stroke="#0284c7" strokeWidth="1" />
      <path d="M 16 68 L 80 68" stroke="#10B981" strokeLinecap="round" strokeWidth="3" />
      <rect fill="#0f172a" height="18" rx="4" stroke="#334155" strokeWidth="1" width="12" x="10" y="60" />
      <rect fill="#0f172a" height="18" rx="4" stroke="#334155" strokeWidth="1" width="12" x="74" y="60" />
      <rect fill="#f8fafc" height="8" rx="2" width="20" x="38" y="20" stroke="#cbd5e1" strokeWidth="0.8" />
      <circle cx="48" cy="24" fill="#10B981" r="2" />
    </svg>
  )
}

export function VehicleAvatar({ mode, is3D, className = "", style = {} }) {
  const m = (mode || '').toString().toLowerCase().trim()
  const isBike = m === 'motorbike' || m === 'motorcycle' || m === 'bike' || m === 'two_wheeler'
  const isCycle = m === 'cycling' || m === 'bicycle' || m === 'cycle' || m === 'directions_bike'
  const isWalk = m === 'walking' || m === 'pedestrian' || m === 'walk' || m === 'directions_walk'

  if (is3D) {
    if (isBike) return <MotorbikeIcon3D className={className || "w-14 h-18"} style={style} />
    if (isCycle) return <CyclingIcon3D className={className || "w-14 h-18"} style={style} />
    if (isWalk) return <WalkingIcon3D className={className || "w-12 h-16"} style={style} />
    return <CabIcon3D className={className || "w-16 h-16"} style={style} />
  } else {
    if (isBike) return <MotorbikeIcon2D className={className || "w-10 h-14"} style={style} />
    if (isCycle) return <CyclingIcon2D className={className || "w-10 h-12"} style={style} />
    if (isWalk) return <WalkingIcon2D className={className || "w-9 h-9"} style={style} />
    return <CabIcon2D className={className || "w-10 h-16"} style={style} />
  }
}