/**
 * HazardCategoryPicker.jsx
 *
 * Scrollable grid of 36 hazard category cards.
 * A filter chip row at the top narrows categories by group.
 *
 * Props:
 *   selectedId  — currently selected category id (string|null)
 *   onSelect(category) — called with full HAZARD_TYPES entry
 */

import { useState } from 'react'
import { HAZARD_TYPES } from '../../constants'

const GROUP_FILTERS = [
  { id: 'all',            label: 'All' },
  { id: 'traffic',        label: 'Traffic' },
  { id: 'crime',          label: 'Crime' },
  { id: 'natural',        label: 'Natural' },
  { id: 'fire',           label: 'Fire & Gas' },
  { id: 'infrastructure', label: 'Infra' },
  { id: 'public',         label: 'Public' },
]

export default function HazardCategoryPicker({ selectedId, onSelect }) {
  const [filter, setFilter] = useState('all')

  const visible = filter === 'all'
    ? HAZARD_TYPES
    : HAZARD_TYPES.filter(h => h.category === filter)

  return (
    <div className="flex flex-col gap-3">

      {/* ── Group filter chips ──────────────────────────────────────────── */}
      <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar">
        {GROUP_FILTERS.map(f => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-all active:scale-95 ${
              filter === f.id
                ? 'bg-[#004ac6] text-white shadow-sm'
                : 'bg-[#f2f4f6] text-[#737686]'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* ── Category grid ────────────────────────────────────────────────── */}
      <div
        className="grid grid-cols-2 gap-2 overflow-y-auto custom-scrollbar pr-0.5"
        style={{ maxHeight: '320px' }}
      >
        {visible.map(h => {
          const isSelected = selectedId === h.id
          return (
            <button
              key={h.id}
              onClick={() => onSelect(h)}
              className={`flex items-center gap-2.5 p-3 rounded-xl border-2 text-left transition-all active:scale-95 ${
                isSelected
                  ? 'shadow-sm'
                  : 'border-[#eceef0] bg-white hover:border-[#004ac6]/30'
              }`}
              style={isSelected ? { borderColor: h.color, background: h.color + '0D' } : {}}
            >
              {/* Icon blob */}
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: h.color + '18' }}
              >
                <span
                  className="material-symbols-outlined icon-filled"
                  style={{ color: h.color, fontSize: '18px' }}
                >
                  {h.icon}
                </span>
              </div>

              {/* Text */}
              <div className="min-w-0">
                <p className="text-xs font-bold text-[#191c1e] leading-tight">{h.label}</p>
                {h.description && (
                  <p className="text-[9px] text-[#737686] mt-0.5 truncate">{h.description}</p>
                )}
              </div>
            </button>
          )
        })}
      </div>

    </div>
  )
}
