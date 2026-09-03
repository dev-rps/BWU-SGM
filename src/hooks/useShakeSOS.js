/**
 * useShakeSOS.js
 *
 * Custom hook that listens for device shake events via DeviceMotionEvent.
 * When the user shakes their phone hard 3+ times within 2 seconds,
 * the provided onShake callback fires.
 *
 * Usage:
 *   import { useShakeSOS } from '../../hooks/useShakeSOS'
 *   useShakeSOS(() => triggerSOS())
 *
 * Configuration:
 *   SHAKE_THRESHOLD  — minimum acceleration magnitude to count as a shake (m/s²)
 *   SHAKE_COUNT      — number of shakes required to trigger
 *   SHAKE_WINDOW_MS  — time window in which shakes must happen
 *   COOLDOWN_MS      — minimum time between SOS triggers to prevent spam
 */

import { useEffect, useRef } from 'react'

const SHAKE_THRESHOLD = 22    // m/s² — needs a firm shake, avoids false positives
const SHAKE_COUNT     = 3     // three shakes
const SHAKE_WINDOW_MS = 2000  // within 2 seconds
const COOLDOWN_MS     = 8000  // 8s cooldown between triggers

export function useShakeSOS(onShake, enabled = true) {
  const shakeTimes  = useRef([])
  const lastTrigger = useRef(0)

  useEffect(() => {
    if (!enabled) return
    if (typeof window.DeviceMotionEvent === 'undefined') return

    // iOS 13+ requires explicit permission
    const requestPermission = async () => {
      if (typeof DeviceMotionEvent.requestPermission === 'function') {
        try {
          const perm = await DeviceMotionEvent.requestPermission()
          if (perm !== 'granted') return
        } catch {
          return
        }
      }
      window.addEventListener('devicemotion', handleMotion)
    }

    const handleMotion = (e) => {
      const acc = e.accelerationIncludingGravity
      if (!acc) return

      const magnitude = Math.sqrt(
        (acc.x || 0) ** 2 +
        (acc.y || 0) ** 2 +
        (acc.z || 0) ** 2
      )

      if (magnitude > SHAKE_THRESHOLD) {
        const now = Date.now()
        shakeTimes.current.push(now)

        // Keep only shakes within the last SHAKE_WINDOW_MS
        shakeTimes.current = shakeTimes.current.filter(t => now - t < SHAKE_WINDOW_MS)

        if (shakeTimes.current.length >= SHAKE_COUNT) {
          // Enough shakes detected — check cooldown
          if (now - lastTrigger.current > COOLDOWN_MS) {
            lastTrigger.current = now
            shakeTimes.current  = []
            onShake?.()
          }
        }
      }
    }

    requestPermission()
    return () => { window.removeEventListener('devicemotion', handleMotion) }
  }, [enabled, onShake])
}
