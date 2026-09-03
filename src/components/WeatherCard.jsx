/**
 * WeatherCard.jsx
 * A compact, glassmorphism weather widget designed to float
 * over the Safety Guardian map at the top-right corner.
 *
 * Props:
 *   weather  — the raw API response from getWeather() → { current }
 *   loading  — boolean
 *   error    — string | null
 */

const WEATHER_ICONS = {
  // Clear
  '01d': { icon: 'sunny',          color: '#F59E0B', label: 'Sunny' },
  '01n': { icon: 'bedtime',        color: '#6366F1', label: 'Clear Night' },
  // Few clouds
  '02d': { icon: 'partly_cloudy_day',   color: '#60A5FA', label: 'Partly Cloudy' },
  '02n': { icon: 'partly_cloudy_night', color: '#6366F1', label: 'Partly Cloudy' },
  // Scattered clouds
  '03d': { icon: 'cloud',          color: '#94A3B8', label: 'Cloudy' },
  '03n': { icon: 'cloud',          color: '#94A3B8', label: 'Cloudy' },
  // Broken clouds
  '04d': { icon: 'cloud',          color: '#64748B', label: 'Overcast' },
  '04n': { icon: 'cloud',          color: '#64748B', label: 'Overcast' },
  // Shower rain
  '09d': { icon: 'water_drop',     color: '#3B82F6', label: 'Showers' },
  '09n': { icon: 'water_drop',     color: '#3B82F6', label: 'Showers' },
  // Rain
  '10d': { icon: 'rainy',          color: '#2563EB', label: 'Rainy' },
  '10n': { icon: 'rainy',          color: '#2563EB', label: 'Rainy' },
  // Thunderstorm
  '11d': { icon: 'thunderstorm',   color: '#7C3AED', label: 'Thunderstorm' },
  '11n': { icon: 'thunderstorm',   color: '#7C3AED', label: 'Thunderstorm' },
  // Snow
  '13d': { icon: 'ac_unit',        color: '#93C5FD', label: 'Snow' },
  '13n': { icon: 'ac_unit',        color: '#93C5FD', label: 'Snow' },
  // Mist / Fog
  '50d': { icon: 'foggy',          color: '#9CA3AF', label: 'Foggy' },
  '50n': { icon: 'foggy',          color: '#9CA3AF', label: 'Foggy' },
}

const DEFAULT_ICON = { icon: 'device_thermostat', color: '#004ac6', label: 'Weather' }

function getWindLabel(speed) {
  if (speed < 1)  return 'Calm'
  if (speed < 5)  return 'Light'
  if (speed < 10) return 'Moderate'
  if (speed < 20) return 'Strong'
  return 'Storm'
}

function getVisibilityLabel(visibility) {
  // visibility is in metres from OWM API
  if (!visibility) return null
  if (visibility >= 10000) return { label: 'Safe Visibility', color: '#10B981' }
  if (visibility >= 5000)  return { label: 'Moderate Visibility', color: '#F59E0B' }
  return { label: 'Poor Visibility', color: '#EF4444' }
}

function formatTime(dt) {
  if (!dt) return ''
  return new Date(dt * 1000).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
}

// ─── Loading Skeleton ────────────────────────────────────────────────────────
function WeatherSkeleton() {
  return (
    <div className="glass-panel rounded-2xl shadow-lg border border-white/40 px-3 py-2.5 flex items-center gap-2.5 animate-pulse"
      style={{ minWidth: 0 }}>
      <div className="w-8 h-8 rounded-full bg-white/50" />
      <div className="flex flex-col gap-1">
        <div className="w-16 h-3 rounded bg-white/50" />
        <div className="w-10 h-2 rounded bg-white/40" />
      </div>
    </div>
  )
}

// ─── Error State ─────────────────────────────────────────────────────────────
function WeatherError() {
  return (
    <div className="glass-panel rounded-2xl shadow-lg border border-white/40 px-3 py-2 flex items-center gap-2">
      <span className="material-symbols-outlined text-[#EF4444] text-[18px]">cloud_off</span>
      <span className="text-[10px] font-bold text-[#EF4444]">Weather Unavailable</span>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function WeatherCard({ weather, loading, error }) {
  if (loading) return <WeatherSkeleton />
  if (error || !weather?.current) return <WeatherError />

  const c = weather.current
  const temp       = Math.round(c.main?.temp ?? 0)
  const feelsLike  = Math.round(c.main?.feels_like ?? 0)
  const humidity   = c.main?.humidity ?? 0
  const windSpeed  = c.wind?.speed ?? 0
  const condition  = c.weather?.[0]?.description ?? ''
  const iconCode   = c.weather?.[0]?.icon ?? ''
  const cityName   = c.name ?? ''
  const updatedAt  = formatTime(c.dt)
  const visibility = getVisibilityLabel(c.visibility)

  const { icon: iconName, color: iconColor, label: iconLabel } = WEATHER_ICONS[iconCode] ?? DEFAULT_ICON

  return (
    <div
      className="glass-panel rounded-2xl shadow-lg border border-white/40 overflow-hidden animate-fade-in"
      style={{ minWidth: 0 }}
    >
      {/* ── Main Row ───────────────────────────────── */}
      <div className="flex items-center gap-2.5 px-3 pt-2.5 pb-1.5">

        {/* Weather Icon */}
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: iconColor + '18' }}
        >
          <span
            className="material-symbols-outlined icon-filled"
            style={{ color: iconColor, fontSize: '20px' }}
          >
            {iconName}
          </span>
        </div>

        {/* Temp + Condition */}
        <div className="flex flex-col min-w-0">
          <div className="flex items-baseline gap-1.5 leading-none">
            <span className="text-[18px] font-black text-[#191c1e] leading-none">
              {temp}°C
            </span>
            <span
              className="text-[10px] font-bold capitalize leading-none"
              style={{ color: iconColor }}
            >
              {iconLabel || condition}
            </span>
          </div>

          {/* City */}
          {cityName && (
            <span className="text-[9px] font-semibold text-[#737686] truncate mt-0.5">
              {cityName}
            </span>
          )}
        </div>
      </div>

      {/* ── Divider ────────────────────────────────── */}
      <div className="mx-3 h-px bg-white/40" />

      {/* ── Detail Row ─────────────────────────────── */}
      <div className="flex items-center gap-3 px-3 pt-1.5 pb-2">

        {/* Feels Like */}
        <div className="flex items-center gap-1">
          <span className="material-symbols-outlined text-[#737686]" style={{ fontSize: '11px' }}>
            device_thermostat
          </span>
          <span className="text-[9px] font-semibold text-[#737686]">{feelsLike}°</span>
        </div>

        {/* Humidity */}
        <div className="flex items-center gap-1">
          <span className="material-symbols-outlined text-[#3B82F6]" style={{ fontSize: '11px' }}>
            water_drop
          </span>
          <span className="text-[9px] font-semibold text-[#737686]">{humidity}%</span>
        </div>

        {/* Wind */}
        <div className="flex items-center gap-1">
          <span className="material-symbols-outlined text-[#60A5FA]" style={{ fontSize: '11px' }}>
            air
          </span>
          <span className="text-[9px] font-semibold text-[#737686]">
            {windSpeed}m/s <span className="text-[#004ac6]">{getWindLabel(windSpeed)}</span>
          </span>
        </div>
      </div>

      {/* ── Visibility Badge (optional) ─────────────── */}
      {visibility && (
        <div
          className="mx-2 mb-2 px-2 py-0.5 rounded-full flex items-center gap-1"
          style={{ background: visibility.color + '18' }}
        >
          <span
            className="material-symbols-outlined icon-filled"
            style={{ color: visibility.color, fontSize: '10px' }}
          >
            visibility
          </span>
          <span
            className="text-[8px] font-black uppercase tracking-wider"
            style={{ color: visibility.color }}
          >
            {visibility.label}
          </span>
          {updatedAt && (
            <span className="text-[8px] text-[#737686] ml-auto">
              {updatedAt}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
