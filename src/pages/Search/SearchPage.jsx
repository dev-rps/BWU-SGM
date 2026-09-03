import { useState, useRef, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAppStore } from '../../context/store'
import { searchPlaces } from '../../services/nominatim'

const POPULAR = [
  'Mumbai', 'Delhi', 'Bengaluru', 'Kolkata', 'Chennai',
  'Hyderabad', 'Pune', 'Ahmedabad', 'Jaipur', 'Lucknow',
  'Surat', 'Kochi', 'Guwahati', 'Bhopal', 'Patna',
]

export default function SearchPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { setDestination, setStartLocation, userLocation, startLocation, destination } = useAppStore()

  const isStartSearch = new URLSearchParams(location.search).get('type') === 'start'

  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [isListening, setIsListening] = useState(false)
  const [speechError, setSpeechError] = useState('')

  const debounceRef = useRef(null)
  const inputRef = useRef(null)
  const recognitionRef = useRef(null)

  // ── Initialize Web Speech API on mount ────────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) return

    const recognition = new SpeechRecognition()
    recognition.continuous = false
    recognition.interimResults = true
    recognition.lang = 'en-IN'

    recognition.onstart = () => {
      setIsListening(true)
      setSpeechError('')
    }

    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map(r => r[0].transcript)
        .join('')
      setQuery(transcript)
      handleSearch(transcript)
    }

    recognition.onerror = (event) => {
      if (event.error === 'not-allowed') {
        setSpeechError('Microphone permission denied. Please allow access in your browser settings.')
      } else {
        setSpeechError('Could not hear you. Please try again.')
      }
      setIsListening(false)
    }

    recognition.onend = () => setIsListening(false)

    recognitionRef.current = recognition

    return () => {
      try { recognition.abort() } catch (_) { /* ignore */ }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const toggleListening = () => {
    if (!recognitionRef.current) {
      setSpeechError('Voice search is not supported in this browser.')
      return
    }
    if (isListening) {
      recognitionRef.current.stop()
    } else {
      setSpeechError('')
      try {
        recognitionRef.current.start()
      } catch (err) {
        console.error('Speech start error:', err)
      }
    }
  }

  // ── Debounced text search ─────────────────────────────────────────────────
  const handleSearch = (val) => {
    setQuery(val)
    clearTimeout(debounceRef.current)
    if (!val.trim()) { setResults([]); return }
    setLoading(true)
    setError('')
    debounceRef.current = setTimeout(async () => {
      try {
        const r = await searchPlaces(val)
        setResults(r)
      } catch {
        setError('Search unavailable. Try again.')
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 400)
  }

  const handleSelect = (place) => {
    if (isStartSearch) {
      setStartLocation(place)
      if (!destination) navigate('/')
      else navigate('/routes')
    } else {
      setDestination(place)
      navigate('/routes')
    }
  }

  const handlePopular = (name) => {
    setQuery(name)
    handleSearch(name)
  }

  return (
    <div className="relative w-full h-full bg-[#f7f9fb] flex flex-col animate-fade-in overflow-hidden">

      {/* ── Header (glass panel with back button + search input) ── */}
      <div className="glass-panel border-b border-white/30 px-4 pt-10 pb-4 z-10 shadow-sm">

        {/* Back button + title row */}
        <div className="flex items-center gap-3 mb-3">
          <button
            onClick={() => navigate(-1)}
            className="w-10 h-10 rounded-xl bg-[#eceef0] flex items-center justify-center active:scale-90 transition-transform"
          >
            <span className="material-symbols-outlined text-[#434655]">arrow_back</span>
          </button>
          <h1 className="text-lg font-bold text-[#191c1e]">
            {isStartSearch ? 'Search Start Location' : 'Search Destination'}
          </h1>
        </div>

        {/* Search input row */}
        <div
          className={`flex items-center gap-2 bg-white rounded-2xl px-3 py-2.5 border shadow-sm transition-all ${
            isListening
              ? 'border-[#EF4444] shadow-[0_0_12px_rgba(239,68,68,0.25)]'
              : 'border-[#c3c6d7] focus-within:border-[#004ac6]'
          }`}
        >
          {/* Microphone toggle button */}
          <button
            onClick={toggleListening}
            title={isListening ? 'Stop listening' : 'Search by voice'}
            className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${
              isListening
                ? 'bg-[#EF4444]/10 animate-pulse'
                : 'hover:bg-[#eceef0] active:scale-90'
            }`}
          >
            <span
              className={`material-symbols-outlined text-[20px] transition-colors ${
                isListening ? 'text-[#EF4444] icon-filled' : 'text-[#004ac6]'
              }`}
            >
              {isListening ? 'mic' : 'mic_none'}
            </span>
          </button>

          {/* Text input */}
          <input
            ref={inputRef}
            autoFocus
            type="text"
            value={query}
            onChange={e => handleSearch(e.target.value)}
            placeholder={
              isListening
                ? 'Listening…'
                : isStartSearch
                  ? 'Where are you starting from?'
                  : 'Search anywhere in India…'
            }
            className="flex-1 bg-transparent outline-none text-sm text-[#191c1e] placeholder:text-[#737686]"
          />

          {/* Loading spinner */}
          {loading && (
            <span className="material-symbols-outlined text-[#737686] text-[18px] animate-spin flex-shrink-0">
              refresh
            </span>
          )}

          {/* Clear button */}
          {query && !loading && (
            <button
              onClick={() => { setQuery(''); setResults([]) }}
              className="flex-shrink-0 active:scale-90 transition-transform"
            >
              <span className="material-symbols-outlined text-[#737686] text-[20px]">close</span>
            </button>
          )}
        </div>

        {/* Speech error message */}
        {speechError && (
          <p className="text-xs text-[#EF4444] mt-2 ml-1">{speechError}</p>
        )}
      </div>

      {/* ── Scrollable content ── */}
      <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-4">

        {/* Current location / From row */}
        {isStartSearch ? (
          <button
            onClick={() => {
              setStartLocation(null)
              if (!destination) navigate('/')
              else navigate('/routes')
            }}
            className="w-full flex items-center gap-3 p-3 bg-[#004ac6]/5 rounded-xl border border-[#004ac6]/20 mb-4 hover:bg-[#004ac6]/10 transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-[#004ac6]/10 flex items-center justify-center">
              <span className="material-symbols-outlined text-[#004ac6] text-[16px] icon-filled">my_location</span>
            </div>
            <div className="text-left">
              <p className="text-xs font-bold text-[#004ac6] uppercase tracking-wider">Use Current Location</p>
              <p className="text-sm font-semibold text-[#191c1e]">
                {userLocation.simulated
                  ? 'Brainware University, Barasat'
                  : `${userLocation.lat.toFixed(4)}, ${userLocation.lng.toFixed(4)}`}
              </p>
            </div>
          </button>
        ) : (
          <div className="flex items-center gap-3 p-3 bg-white rounded-xl border border-[#eceef0] mb-4">
            <div className="w-8 h-8 rounded-full bg-[#004ac6]/10 flex items-center justify-center">
              <span className="material-symbols-outlined text-[#004ac6] text-[16px] icon-filled">my_location</span>
            </div>
            <div>
              <p className="text-xs font-bold text-[#737686] uppercase tracking-wider">From</p>
              <p className="text-sm font-semibold text-[#191c1e]">
                {startLocation
                  ? startLocation.name
                  : userLocation.simulated
                    ? 'Brainware University, Barasat'
                    : `${userLocation.lat.toFixed(4)}, ${userLocation.lng.toFixed(4)}`}
              </p>
            </div>
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-[#EF4444] text-[18px]">error</span>
            <p className="text-xs text-[#EF4444]">{error}</p>
          </div>
        )}

        {/* Search results */}
        {results.length > 0 && (
          <div className="mb-6">
            <p className="text-xs font-bold text-[#737686] uppercase tracking-wider mb-3">Results</p>
            <div className="space-y-2">
              {results.map(r => (
                <button
                  key={r.id}
                  onClick={() => handleSelect(r)}
                  className="w-full flex items-center gap-3 p-3.5 bg-white rounded-xl border border-[#eceef0] hover:border-[#004ac6]/30 hover:bg-[#004ac6]/5 transition-all active:scale-[0.99] text-left shadow-sm"
                >
                  <div className="w-9 h-9 rounded-xl bg-[#004ac6]/10 flex items-center justify-center flex-shrink-0">
                    <span className="material-symbols-outlined text-[#004ac6] text-[18px]">place</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[#191c1e] truncate">{r.name}</p>
                    <p className="text-xs text-[#737686] truncate mt-0.5">{r.displayName}</p>
                  </div>
                  <span className="material-symbols-outlined text-[#737686] text-[18px] flex-shrink-0">arrow_forward_ios</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Popular places (shown when no results) */}
        {results.length === 0 && (
          <div>
            <p className="text-xs font-bold text-[#737686] uppercase tracking-wider mb-3">Popular Cities in India</p>
            <div className="flex flex-wrap gap-2 mb-6">
              {POPULAR.map(city => (
                <button
                  key={city}
                  onClick={() => handlePopular(city)}
                  className="px-4 py-2 bg-white rounded-full border border-[#c3c6d7] text-sm font-medium text-[#434655] hover:border-[#004ac6] hover:text-[#004ac6] transition-all active:scale-95"
                >
                  {city}
                </button>
              ))}
            </div>

            <p className="text-xs font-bold text-[#737686] uppercase tracking-wider mb-3">Emergency Numbers</p>
            <div className="space-y-2">
              {[
                { label: 'Police (All India)',  number: '100',  icon: 'local_police',   color: '#004ac6' },
                { label: 'Ambulance',          number: '108', icon: 'local_hospital', color: '#EF4444' },
                { label: 'Women Helpline',     number: '1091', icon: 'support_agent', color: '#10B981' },
              ].map(e => (
                <div key={e.number} className="flex items-center gap-3 p-3 bg-white rounded-xl border border-[#eceef0]">
                  <span className="material-symbols-outlined icon-filled text-[20px]" style={{ color: e.color }}>{e.icon}</span>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-[#191c1e]">{e.label}</p>
                  </div>
                  <span className="text-base font-black" style={{ color: e.color }}>{e.number}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
