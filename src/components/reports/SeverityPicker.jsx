/**
 * SeverityPicker.jsx
 *
 * Four color-coded severity selection cards.
 *
 * Props:
 *   selected     — severity id string ('low'|'medium'|'high'|'critical')
 *   onSelect(id) — called on card press
 */

import { SEVERITY_LEVELS } from '../../constants'

// Emoji-style severity indicator icons
const SEV_ICONS = {
  low:      'sentiment_satisfied',
  medium:   'sentiment_neutral',
  high:     'sentiment_dissatisfied',
  critical: 'sentiment_very_dissatisfied',
}

export default function SeverityPicker({ selected, onSelect }) {
  return (
    <div className="flex flex-col gap-3">

      <p className="text-xs text-[#737686] text-center">
        How serious is this hazard right now?
      </p>

      <div className="grid grid-cols-2 gap-3">
        {SEVERITY_LEVELS.map(s => {
          const isSelected = selected === s.id
          return (
            <button
              key={s.id}
              onClick={() => onSelect(s.id)}
              className="flex flex-col items-center gap-2.5 p-4 rounded-2xl border-2 transition-all active:scale-95"
              style={
                isSelected
                  ? { borderColor: s.color, background: s.bg, boxShadow: `0 4px 16px ${s.color}25` }
                  : { borderColor: '#eceef0', background: '#fff' }
              }
            >
              {/* Icon */}
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center transition-all"
                style={{ background: s.color + (isSelected ? '25' : '15') }}
              >
                <span
                  className="material-symbols-outlined icon-filled"
                  style={{ color: s.color, fontSize: '28px' }}
                >
                  {SEV_ICONS[s.id]}
                </span>
              </div>

              {/* Label */}
              <div className="text-center">
                <p
                  className="text-sm font-black transition-all"
                  style={{ color: isSelected ? s.color : '#191c1e' }}
                >
                  {s.label}
                </p>
                <p className="text-[9px] text-[#737686] mt-0.5">{s.description}</p>
              </div>

              {/* Selected indicator */}
              {isSelected && (
                <div
                  className="w-5 h-5 rounded-full flex items-center justify-center"
                  style={{ background: s.color }}
                >
                  <span className="material-symbols-outlined text-white" style={{ fontSize: '12px' }}>check</span>
                </div>
              )}
            </button>
          )
        })}
      </div>

    </div>
  )
}
