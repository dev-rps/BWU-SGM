/**
 * ReportFilters.jsx
 *
 * Horizontally scrollable filter chip bar.
 *
 * Props:
 *   active    — current filter id
 *   onChange  — (id) => void
 */

import { REPORT_FILTERS } from '../../constants'

export default function ReportFilters({ active, onChange }) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar px-4">
      {REPORT_FILTERS.map(f => {
        const isActive = active === f.id
        return (
          <button
            key={f.id}
            onClick={() => onChange(f.id)}
            className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all active:scale-95 ${
              isActive
                ? 'bg-[#004ac6] text-white shadow-sm'
                : 'bg-white text-[#737686] border border-[#eceef0]'
            }`}
          >
            <span
              className="material-symbols-outlined icon-filled"
              style={{ fontSize: '12px' }}
            >
              {f.icon}
            </span>
            {f.label}
          </button>
        )
      })}
    </div>
  )
}
