/**
 * src/services/ttsService.js
 *
 * Production Text-to-Speech (TTS) Engine for Safety Guardian (Momo AI)
 *
 * Voice Priority:
 *   1. Piper TTS (Ryan High ONNX Voice Model — en_US-ryan-high)
 *   2. Web Speech Synthesis (Existing Browser Voice — Fallback)
 *
 * Requirements Met:
 *   - Ryan High is the primary default voice for Momo AI.
 *   - Reusable `speak(text)` that synthesizes, caches, and plays audio.
 *   - In-memory Blob/Audio caching for near-instant repeat playback.
 *   - Automatic seamless fallback to previous Web Speech Synthesis if Piper is offline or fails.
 *   - Clean interruption handling via `stopSpeaking()`.
 *   - Works on both Windows and Linux.
 *   - Modular endpoint routing (Vite proxy, direct localhost, or production ML URL).
 */

const ENV_ML_URL = (import.meta.env?.VITE_ML_API_URL || '').replace(/\/+$/, '')
// Prioritize fast local endpoints first (0ms overhead); remote cloud URL is strictly last
const CANDIDATE_TTS_BASES = [
  '/api/ml/tts',
  'http://127.0.0.1:8000/tts',
  '/api/tts',
  ENV_ML_URL ? `${ENV_ML_URL}/tts` : null,
].filter(Boolean)

let verifiedActiveBase = null

// Dynamic cache of synthesized audio blobs (Key: MD5/clean text, Value: { blob, objectUrl })
const audioBlobCache = new Map()
const MAX_CLIENT_CACHE = 200

// Active audio element tracking for clean stopping
let currentPlayingAudio = null
let isPiperActive = false
let onSpeechEndCallback = null

// Fallback voice state
let isFallbackSpeaking = false

/**
 * Clean markdown symbols, asterisks, and emojis from text for speech synthesis
 */
export function sanitizeTextForSpeech(text) {
  if (!text) return ''
  return text
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/#{1,6}\s+/g, '')
    .replace(/`{1,3}[^`]*`{1,3}/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // [Label](url) -> Label
    .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Check health of Piper TTS backend
 */
export async function checkPiperHealth() {
  if (verifiedActiveBase) {
    try {
      const res = await fetch(`${verifiedActiveBase}/health`, { method: 'GET', signal: AbortSignal.timeout(1000) })
      if (res.ok) {
        const data = await res.json()
        if (data.status === 'ready') return { available: true, url: verifiedActiveBase, info: data }
      }
    } catch {
      verifiedActiveBase = null
    }
  }

  for (const base of CANDIDATE_TTS_BASES) {
    try {
      const res = await fetch(`${base}/health`, { method: 'GET', signal: AbortSignal.timeout(1000) })
      if (res.ok) {
        const data = await res.json()
        if (data.status === 'ready') {
          verifiedActiveBase = base
          return { available: true, url: base, info: data }
        }
      }
    } catch {
      // try next candidate
    }
  }
  return { available: false, url: null, info: null }
}

/**
 * Synthesize text using Piper Ryan High voice model from backend
 * Returns audio Blob, or null if failed.
 */
export async function synthesizePiperAudio(text) {
  const clean = sanitizeTextForSpeech(text)
  if (!clean) return null

  // Check client-side memory cache
  if (audioBlobCache.has(clean)) {
    return audioBlobCache.get(clean)
  }

  const basesToTry = verifiedActiveBase ? [verifiedActiveBase, ...CANDIDATE_TTS_BASES.filter(b => b !== verifiedActiveBase)] : CANDIDATE_TTS_BASES

  for (const base of basesToTry) {
    try {
      const res = await fetch(`${base}/synthesize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'audio/wav',
        },
        body: JSON.stringify({ text: clean, speaker_id: 0 }),
        signal: AbortSignal.timeout(1500),
      })

      if (res.ok) {
        const blob = await res.blob()
        if (blob && blob.size > 100) {
          verifiedActiveBase = base
          const objectUrl = URL.createObjectURL(blob)
          const entry = { blob, objectUrl }

          if (audioBlobCache.size >= MAX_CLIENT_CACHE) {
            const firstKey = audioBlobCache.keys().next().value
            const old = audioBlobCache.get(firstKey)
            if (old?.objectUrl) URL.revokeObjectURL(old.objectUrl)
            audioBlobCache.delete(firstKey)
          }

          audioBlobCache.set(clean, entry)
          return entry
        }
      }
    } catch {
      // Continue to next candidate or fallback
    }
  }

  return null
}

/**
 * Previous Web Speech Synthesis implementation (Preserved as Fallback)
 */
function speakFallbackWebSpeech(cleanText, options = {}) {
  if (typeof window === 'undefined' || !window.speechSynthesis) return null

  try {
    window.speechSynthesis.cancel()

    const utt = new SpeechSynthesisUtterance(cleanText)
    utt.rate   = options.rate   ?? 1.02
    utt.pitch  = options.pitch  ?? 0.95
    utt.volume = options.volume ?? 1.0
    utt.lang   = options.lang   ?? 'en-US'

    const voices = window.speechSynthesis.getVoices()
    const isFemale = (name) => /female|woman|girl|zira|siri|samantha|heera|veena|lekha|karen|moira|victoria|susan|hazel|catherine|jenny|aria|lind/i.test(name)

    // Strict male voice selector -- never select a female voice
    const match =
      voices.find(v => /\b(david|mark|ryan|george|ravi|prabhat|james|daniel|richard|aaron|guy|alex|oliver)\b/i.test(v.name) && !isFemale(v.name)) ||
      voices.find(v => /\bmale\b/i.test(v.name) && !isFemale(v.name)) ||
      voices.find(v => v.lang.startsWith('en') && !isFemale(v.name)) ||
      voices.find(v => !isFemale(v.name)) ||
      voices[0]

    if (match) utt.voice = match

    utt.onstart = () => {
      isFallbackSpeaking = true
      options.onStart?.()
    }
    utt.onend = () => {
      isFallbackSpeaking = false
      options.onEnd?.()
    }
    utt.onerror = () => {
      isFallbackSpeaking = false
      options.onEnd?.()
    }

    // Chrome bug workaround
    setTimeout(() => {
      window.speechSynthesis.speak(utt)
    }, 50)

    return { type: 'fallback', cancel: () => window.speechSynthesis.cancel() }
  } catch (err) {
    console.warn('[TTS Fallback Error]:', err)
    options.onEnd?.()
    return null
  }
}

/**
 * Primary Speak function
 * Attempts Piper TTS (Ryan High) first; automatically uses Fallback TTS if Piper fails.
 *
 * @param {string} text - Text to speak aloud
 * @param {object} options - Configuration options { onStart, onEnd, rate, pitch, volume, lang }
 * @returns {Promise<object>} Playable audio reference or fallback details
 */
export async function speak(text, options = {}) {
  stopSpeaking()

  const clean = sanitizeTextForSpeech(text)
  if (!clean) {
    options.onEnd?.()
    return null
  }

  // ── 1. Priority 1: Piper TTS (Ryan High) ──────────────────────────────────
  try {
    const cachedEntry = await synthesizePiperAudio(clean)
    if (cachedEntry?.objectUrl) {
      const audio = new Audio(cachedEntry.objectUrl)
      currentPlayingAudio = audio
      isPiperActive = true

      audio.onplay = () => {
        options.onStart?.()
      }

      audio.onended = () => {
        isPiperActive = false
        if (currentPlayingAudio === audio) currentPlayingAudio = null
        options.onEnd?.()
      }

      audio.onerror = (e) => {
        console.warn('[Piper TTS] Audio playback error, falling back to Web Speech:', e)
        isPiperActive = false
        if (currentPlayingAudio === audio) currentPlayingAudio = null
        speakFallbackWebSpeech(clean, options)
      }

      const playPromise = audio.play()
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          console.warn('[Piper TTS] Play prevented or failed, using fallback:', err)
          isPiperActive = false
          speakFallbackWebSpeech(clean, options)
        })
      }

      return {
        type: 'piper',
        audio,
        stop: () => {
          audio.pause()
          audio.currentTime = 0
        },
      }
    }
  } catch (piperErr) {
    console.warn('[Piper TTS] Synthesis error, switching to fallback voice:', piperErr)
  }

  // ── 2. Priority 2: Web Speech Synthesis Fallback ──────────────────────────
  console.info('[TTS] Using fallback browser speech synthesis.')
  return speakFallbackWebSpeech(clean, options)
}

/**
 * Stops all currently active speech (both Piper audio and browser fallback)
 */
export function stopSpeaking() {
  if (currentPlayingAudio) {
    try {
      currentPlayingAudio.pause()
      currentPlayingAudio.currentTime = 0
    } catch {}
    currentPlayingAudio = null
  }
  isPiperActive = false

  if (typeof window !== 'undefined' && window.speechSynthesis) {
    try {
      window.speechSynthesis.cancel()
    } catch {}
  }
  isFallbackSpeaking = false
}

/**
 * Returns true if speech is currently playing via Piper or Fallback
 */
export function isCurrentlySpeaking() {
  return isPiperActive || isFallbackSpeaking
}

/**
 * SpeechQueue — enables instant sentence-by-sentence streaming speech for Momo AI.
 * As sentences stream in from the LLM, they are queued and spoken sequentially with zero wait time.
 */
export class SpeechQueue {
  constructor(options = {}) {
    this.options = options
    this.queue = []
    this.isPlaying = false
    this.stopped = false
  }

  enqueue(text) {
    if (this.stopped || !text) return
    const clean = sanitizeTextForSpeech(text)
    if (!clean) return
    this.queue.push(clean)
    if (!this.isPlaying) {
      this._playNext()
    }
  }

  async _playNext() {
    if (this.stopped || this.queue.length === 0) {
      this.isPlaying = false
      if (!this.stopped && this.queue.length === 0) {
        this.options.onEnd?.()
      }
      return
    }

    this.isPlaying = true
    const nextSentence = this.queue.shift()
    try {
      await speak(nextSentence, {
        ...this.options,
        onStart: () => {
          this.options.onStart?.()
        },
        onEnd: () => {
          if (!this.stopped) {
            this._playNext()
          }
        },
      })
    } catch {
      if (!this.stopped) {
        this._playNext()
      }
    }
  }

  stop() {
    this.stopped = true
    this.queue = []
    this.isPlaying = false
    stopSpeaking()
    this.options.onEnd?.()
  }
}

export function createSpeechQueue(options = {}) {
  return new SpeechQueue(options)
}

