// ─── India-wide geographic constants ───────────────────────────────────────
export const INDIA_BOUNDS = {
  south: 6.5,
  north: 37.1,
  west: 68.1,
  east: 97.4,
}

// Keep WB_BOUNDS for backward compat (used nowhere else but safe to keep)
export const WB_BOUNDS = {
  south: 21.5, north: 27.3, west: 85.8, east: 89.9,
}

export const DEFAULT_CENTER = [20.5937, 78.9629] // Geographic centre of India
export const DEFAULT_ZOOM = 5

export const WB_NOMINATIM_PARAMS = {
  countrycodes: 'in',
  viewbox: `${INDIA_BOUNDS.west},${INDIA_BOUNDS.south},${INDIA_BOUNDS.east},${INDIA_BOUNDS.north}`,
  bounded: 1,
}

// ─── Hazard Categories ────────────────────────────────────────────────────────
// basePenalty: how many points are deducted from a route's safety score per incident
// (before severity multiplier is applied)
//
// NOTE: Old IDs (accident, harassment, flood, road_damage, construction,
//       broken_light, other) are preserved for backward compat with
//       existing Firestore reports.
export const HAZARD_TYPES = [
  // ── TRAFFIC ───────────────────────────────────────────────────────────────
  { id: 'accident',          label: 'Road Accident',         icon: 'car_crash',             color: '#EF4444', category: 'traffic',        basePenalty: 10, description: 'Vehicle collision' },
  { id: 'breakdown',         label: 'Vehicle Breakdown',     icon: 'car_repair',            color: '#F97316', category: 'traffic',        basePenalty:  3, description: 'Stalled vehicle' },
  { id: 'traffic_jam',       label: 'Traffic Jam',           icon: 'traffic',               color: '#F59E0B', category: 'traffic',        basePenalty:  2, description: 'Heavy congestion' },
  { id: 'road_block',        label: 'Road Block',            icon: 'block',                 color: '#F59E0B', category: 'traffic',        basePenalty:  8, description: 'Road is blocked' },
  { id: 'construction',      label: 'Road Construction',     icon: 'construction',          color: '#D97706', category: 'traffic',        basePenalty:  4, description: 'Work in progress' },
  { id: 'pothole',           label: 'Pothole',               icon: 'warning',               color: '#B45309', category: 'traffic',        basePenalty:  3, description: 'Road surface damaged' },
  { id: 'road_damage',       label: 'Broken Road',           icon: 'report_problem',        color: '#92400E', category: 'traffic',        basePenalty:  5, description: 'Road in poor condition' },

  // ── NATURAL ───────────────────────────────────────────────────────────────
  { id: 'flood',             label: 'Flooding',              icon: 'water_drop',            color: '#3B82F6', category: 'natural',        basePenalty: 15, description: 'Area submerged' },
  { id: 'waterlogging',      label: 'Waterlogging',          icon: 'water',                 color: '#60A5FA', category: 'natural',        basePenalty:  8, description: 'Water accumulation' },
  { id: 'heavy_rain',        label: 'Heavy Rain',            icon: 'rainy',                 color: '#2563EB', category: 'natural',        basePenalty:  5, description: 'Intense rainfall' },
  { id: 'fallen_tree',       label: 'Fallen Tree',           icon: 'park',                  color: '#16A34A', category: 'natural',        basePenalty: 10, description: 'Tree blocking path' },
  { id: 'landslide',         label: 'Landslide',             icon: 'landscape',             color: '#92400E', category: 'natural',        basePenalty: 18, description: 'Earth/mud collapse' },
  { id: 'earthquake',        label: 'Earthquake Damage',     icon: 'vibration',             color: '#78350F', category: 'natural',        basePenalty: 20, description: 'Seismic damage' },
  { id: 'storm',             label: 'Storm Damage',          icon: 'air',                   color: '#7C3AED', category: 'natural',        basePenalty:  8, description: 'Wind/storm impact' },

  // ── FIRE & GAS ────────────────────────────────────────────────────────────
  { id: 'fire',              label: 'Fire',                  icon: 'local_fire_department', color: '#EF4444', category: 'fire',           basePenalty: 20, description: 'Active fire' },
  { id: 'smoke',             label: 'Smoke',                 icon: 'cloud',                 color: '#9CA3AF', category: 'fire',           basePenalty:  8, description: 'Smoke detected' },
  { id: 'gas_leak',          label: 'Gas Leak',              icon: 'gas_meter',             color: '#D97706', category: 'fire',           basePenalty: 15, description: 'Gas leaking' },

  // ── INFRASTRUCTURE ────────────────────────────────────────────────────────
  { id: 'electric',          label: 'Electric Hazard',       icon: 'bolt',                  color: '#EAB308', category: 'infrastructure', basePenalty: 15, description: 'Live wire/hazard' },
  { id: 'collapse',          label: 'Building Collapse',     icon: 'apartment',             color: '#64748B', category: 'infrastructure', basePenalty: 20, description: 'Structure collapsed' },
  { id: 'unsafe_area',       label: 'Unsafe Area',           icon: 'dangerous',             color: '#DC2626', category: 'infrastructure', basePenalty: 12, description: 'Area is unsafe' },
  { id: 'broken_light',      label: 'Poor Street Lighting',  icon: 'light_mode',            color: '#F59E0B', category: 'infrastructure', basePenalty:  4, description: 'Dark road' },
  { id: 'broken_signal',     label: 'Broken Traffic Signal', icon: 'traffic',               color: '#EF4444', category: 'infrastructure', basePenalty:  4, description: 'Signal not working' },

  // ── CRIME & SAFETY ────────────────────────────────────────────────────────
  { id: 'harassment',        label: 'Harassment',            icon: 'report_problem',        color: '#DC2626', category: 'crime',          basePenalty: 18, description: 'Verbal/physical' },
  { id: 'stalking',          label: 'Stalking',              icon: 'person_search',         color: '#EF4444', category: 'crime',          basePenalty: 15, description: 'Being followed' },
  { id: 'robbery',           label: 'Robbery',               icon: 'gavel',                 color: '#B91C1C', category: 'crime',          basePenalty: 20, description: 'Armed theft' },
  { id: 'theft',             label: 'Theft',                 icon: 'shopping_bag',          color: '#EF4444', category: 'crime',          basePenalty: 12, description: 'Item stolen' },
  { id: 'snatching',         label: 'Snatching',             icon: 'front_hand',            color: '#DC2626', category: 'crime',          basePenalty: 15, description: 'Chain/bag snatched' },
  { id: 'assault',           label: 'Assault',               icon: 'warning',               color: '#7F1D1D', category: 'crime',          basePenalty: 25, description: 'Physical attack' },
  { id: 'suspicious_person', label: 'Suspicious Person',     icon: 'person',                color: '#F97316', category: 'crime',          basePenalty:  8, description: 'Suspicious individual' },
  { id: 'suspicious_vehicle',label: 'Suspicious Vehicle',    icon: 'directions_car',        color: '#F97316', category: 'crime',          basePenalty:  8, description: 'Suspicious vehicle' },

  // ── PUBLIC ────────────────────────────────────────────────────────────────
  { id: 'crowd',             label: 'Crowd Gathering',       icon: 'groups',                color: '#8B5CF6', category: 'public',         basePenalty:  4, description: 'Large crowd' },
  { id: 'protest',           label: 'Protest',               icon: 'campaign',              color: '#7C3AED', category: 'public',         basePenalty:  8, description: 'Demonstration' },
  { id: 'medical',           label: 'Medical Emergency',     icon: 'emergency',             color: '#EF4444', category: 'public',         basePenalty:  5, description: 'Needs medical help' },
  { id: 'animal',            label: 'Animal on Road',        icon: 'pets',                  color: '#16A34A', category: 'public',         basePenalty:  4, description: 'Animal blocking path' },
  { id: 'police',            label: 'Police Activity',       icon: 'local_police',          color: '#004ac6', category: 'public',         basePenalty:  3, description: 'Police present' },

  // ── OTHER ─────────────────────────────────────────────────────────────────
  { id: 'other',             label: 'Other',                 icon: 'more_horiz',            color: '#737686', category: 'other',          basePenalty:  5, description: 'Other hazard' },
]

// ─── Severity Levels ──────────────────────────────────────────────────────────
// multiplier: applied to basePenalty during scoring.
//   Low      = 0.5  → half penalty (minor inconvenience)
//   Medium   = 1.0  → full base penalty
//   High     = 1.5  → 50% worse
//   Critical = 2.0  → double penalty (emergency situation)
export const SEVERITY_LEVELS = [
  { id: 'low',      label: 'Low',      multiplier: 0.5, color: '#10B981', bg: '#10B98115', description: 'Minor inconvenience' },
  { id: 'medium',   label: 'Medium',   multiplier: 1.0, color: '#F59E0B', bg: '#F59E0B15', description: 'Moderate hazard' },
  { id: 'high',     label: 'High',     multiplier: 1.5, color: '#EF4444', bg: '#EF444415', description: 'Serious danger' },
  { id: 'critical', label: 'Critical', multiplier: 2.0, color: '#7C3AED', bg: '#7C3AED15', description: 'Emergency situation' },
]

// ─── Report Filters ───────────────────────────────────────────────────────────
export const REPORT_FILTERS = [
  { id: 'all',            label: 'All',         icon: 'public' },
  { id: 'traffic',        label: 'Traffic',     icon: 'traffic' },
  { id: 'crime',          label: 'Crime',       icon: 'shield' },
  { id: 'natural',        label: 'Natural',     icon: 'water_drop' },
  { id: 'fire',           label: 'Fire & Gas',  icon: 'local_fire_department' },
  { id: 'infrastructure', label: 'Infra',       icon: 'electrical_services' },
  { id: 'public',         label: 'Public',      icon: 'groups' },
  { id: 'critical',       label: 'Critical',    icon: 'emergency' },
  { id: 'today',          label: 'Today',       icon: 'today' },
]

// ─── Severity marker colors ───────────────────────────────────────────────────
export const SEVERITY_COLORS = {
  critical: '#7C3AED',
  high:     '#EF4444',
  medium:   '#F59E0B',
  low:      '#10B981',
  default:  '#737686',
}

// ─── App color palette ────────────────────────────────────────────────────────
export const COLORS = {
  primary:        '#004ac6',
  safetyEmerald:  '#10B981',
  cautionAmber:   '#F59E0B',
  dangerRose:     '#EF4444',
  secondary:      '#505f76',
  outline:        '#737686',
}

// ─── Nearby categories ────────────────────────────────────────────────────────
export const NEARBY_CATEGORIES = [
  { key: 'hospital',     label: 'Hospital',     icon: 'local_hospital',        color: '#EF4444', overpassTag: 'amenity=hospital' },
  { key: 'police',       label: 'Police',       icon: 'local_police',          color: '#004ac6', overpassTag: 'amenity=police' },
  { key: 'fire_station', label: 'Fire Station', icon: 'local_fire_department', color: '#F59E0B', overpassTag: 'amenity=fire_station' },
  { key: 'pharmacy',     label: 'Pharmacy',     icon: 'local_pharmacy',        color: '#10B981', overpassTag: 'amenity=pharmacy' },
  { key: 'fuel',         label: 'Petrol Pump',  icon: 'local_gas_station',     color: '#737686', overpassTag: 'amenity=fuel' },
]
