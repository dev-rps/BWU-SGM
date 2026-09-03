/**
 * disasterZones.js — Multi-Hazard Natural Disaster Intelligence for West Bengal & India
 *
 * DATA SOURCES:
 *   - NDMA (National Disaster Management Authority) Hazard Vulnerability Atlas
 *   - BMTPC (Building Materials & Technology Promotion Council) Vulnerability Atlas of India
 *   - Geological Survey of India (GSI) Landslide Susceptibility Mapping
 *   - IMD (India Meteorological Department) Cyclone & Storm Surge Frequency Records
 *   - KMC & Howrah Municipal Corporation Waterlogging & Drainage Master Plan
 *   - West Bengal State Disaster Management Authority (WBSDMA) District Hazard Profiles
 *
 * Categories:
 *   - cyclone_surge: Coastal cyclone & storm surge inundation zones
 *   - seismic: High earthquake vulnerability (Seismic Zone IV & V)
 *   - landslide: Monsoonal hill slope landslide susceptibility
 *   - river_erosion: Severe riverbank erosion & embankment breach corridors
 *   - waterlogging: Chronic urban waterlogging choke points
 *   - lightning_storm: High frequency lightning/Kalbaishakhi storm corridors
 */

export const DISASTER_ZONES = [
  // ═══════════════════════════════════════════════════════════════════════════
  // 1. CYCLONE & STORM SURGE (COASTAL & SUNDARBANS)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'dis_cyc_01',
    lat: 21.6266, lng: 87.5074,
    area: 'Digha - Shankarpur Coastal Belt, Purba Medinipur',
    type: 'cyclone_surge',
    severity: 'high',
    radius: 3500,
    title: 'High Cyclone & Storm Surge Zone',
    description: 'Open Bay of Bengal coast. Severe storm surge vulnerability during pre-monsoon & post-monsoon cyclone seasons.',
    source: 'NDMA Cyclone Vulnerability Atlas + IMD',
    penalty: 8,
  },
  {
    id: 'dis_cyc_02',
    lat: 21.7780, lng: 87.7510,
    area: 'Contai (Kanthi) - Mandarmani Coast, Purba Medinipur',
    type: 'cyclone_surge',
    severity: 'high',
    radius: 4000,
    title: 'Coastal Inundation & Wind Hazard',
    description: 'Low-lying coastal strip vulnerable to tidal surge overflow and cyclone winds exceeding 120 km/h.',
    source: 'WBSDMA Coastal Hazard Profile',
    penalty: 7,
  },
  {
    id: 'dis_cyc_03',
    lat: 21.6500, lng: 88.0800,
    area: 'Sagar Island & Muriganga Confluence, South 24 Pgs',
    type: 'cyclone_surge',
    severity: 'critical',
    radius: 6000,
    title: 'Severe Cyclone & Sea Ingress Zone',
    description: 'Estuarine island facing direct cyclonic tidal surges (Amphan, Yaas, Bulbul). High vulnerability.',
    source: 'WBSDMA + NDMA Super Cyclone Records',
    penalty: 10,
  },
  {
    id: 'dis_cyc_04',
    lat: 21.5600, lng: 88.2500,
    area: 'Bakkhali & Fraserganj Coast, South 24 Pgs',
    type: 'cyclone_surge',
    severity: 'high',
    radius: 3500,
    title: 'Tidal Surge & Embankment Vulnerability',
    description: 'Exposed outer coastal barrier. Regular tidal overtopping during cyclonic spring tides.',
    source: 'Sundarban Biosphere Reserve Authority',
    penalty: 8,
  },
  {
    id: 'dis_cyc_05',
    lat: 22.1600, lng: 88.8000,
    area: 'Gosaba & Sandeshkhali Delta Island, Sundarbans',
    type: 'cyclone_surge',
    severity: 'critical',
    radius: 5000,
    title: 'Estuarine Cyclone Inundation Zone',
    description: 'Earthen embankment network vulnerable to breaches during severe cyclonic surges and river swell.',
    source: 'ISRO Post-Disaster Atlas + WBSDMA',
    penalty: 9,
  },
  {
    id: 'dis_cyc_06',
    lat: 22.3100, lng: 88.6600,
    area: 'Canning - Basanti Matla Estuary, South 24 Pgs',
    type: 'cyclone_surge',
    severity: 'high',
    radius: 4000,
    title: 'Tidal River Surge Funnel',
    description: 'Matla river funneling storm surge water upstream during Bay of Bengal depressions.',
    source: 'Irrigation & Waterways Dept WB',
    penalty: 7,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. LANDSLIDE SUSCEPTIBILITY (NORTH BENGAL HILLS)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'dis_lnd_01',
    lat: 26.8850, lng: 88.4720,
    area: 'NH-10 Sevoke - Teesta Bazaar Corridor, Kalimpong',
    type: 'landslide',
    severity: 'critical',
    radius: 4500,
    title: 'Severe Landslide & Rockfall Corridor',
    description: 'Critical Sikkim-Bengal arterial highway. Highly unstable phyllite/schist rock face prone to monsoonal collapses and road closures.',
    source: 'Geological Survey of India (GSI) + NHAI',
    penalty: 10,
  },
  {
    id: 'dis_lnd_02',
    lat: 26.8500, lng: 88.3300,
    area: 'Rohini Road & Tindharia Slopes, Kurseong Hills',
    type: 'landslide',
    severity: 'high',
    radius: 3500,
    title: 'Active Landslide & Slope Instability',
    description: 'Frequent monsoonal debris flow and road sinking along Paglajhora & Rohini descent routes.',
    source: 'GSI Landslide Hazard Mapping',
    penalty: 8,
  },
  {
    id: 'dis_lnd_03',
    lat: 26.8900, lng: 88.1900,
    area: 'Mirik - Soureni Tea Valley Slopes, Darjeeling',
    type: 'landslide',
    severity: 'medium',
    radius: 3000,
    title: 'Monsoonal Slope Wash & Mudslide Zone',
    description: 'Steep agricultural slopes subject to soil slippage after heavy precipitation events (>100mm/day).',
    source: 'Darjeeling District Disaster Management Plan',
    penalty: 5,
  },
  {
    id: 'dis_lnd_04',
    lat: 27.0600, lng: 88.5200,
    area: 'Lava - Pedong - Rhenock Hill Road, Kalimpong',
    type: 'landslide',
    severity: 'medium',
    radius: 3500,
    title: 'Hill Road Blockade Risk',
    description: 'Narrow mountain road with documented mudslides and tree falls during monsoon squalls.',
    source: 'Kalimpong District Police Traffic Cell',
    penalty: 5,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. SEISMIC VULNERABILITY (SEISMIC ZONE V & IV)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'dis_eq_01',
    lat: 27.0360, lng: 88.2627,
    area: 'Darjeeling - Kalimpong Himalayan Ridge',
    type: 'seismic',
    severity: 'high',
    radius: 6000,
    title: 'Seismic Zone IV / V Boundary',
    description: 'Active Main Boundary Thrust (MBT) fault line. High vulnerability to moderate-to-severe tectonic tremors.',
    source: 'BMTPC Seismic Zone Map of India',
    penalty: 4,
  },
  {
    id: 'dis_eq_02',
    lat: 26.5400, lng: 89.4500,
    area: 'Cooch Behar - Alipurduar Sub-Himalayan Plains',
    type: 'seismic',
    severity: 'high',
    radius: 7000,
    title: 'Seismic Zone V (Highest Hazard)',
    description: 'Classified under Seismic Zone V (very high damage risk) along Assam-Bengal tectonic boundary.',
    source: 'Bureau of Indian Standards (IS 1893)',
    penalty: 5,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. RIVER BANK EROSION & EMBANKMENT BREACH
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'dis_ers_01',
    lat: 25.0400, lng: 87.8900,
    area: 'Manikchak & Bhutni Island, Malda',
    type: 'river_erosion',
    severity: 'critical',
    radius: 5000,
    title: 'Ganga Severe Bank Erosion Zone',
    description: 'Aggressive Ganga river meandering causing sudden bank slumping, agricultural loss, and road washing.',
    source: 'Central Water Commission (CWC) + Malda DDMA',
    penalty: 8,
  },
  {
    id: 'dis_ers_02',
    lat: 24.7700, lng: 87.9300,
    area: 'Farakka Barrage & Dhulian Embankment, Murshidabad',
    type: 'river_erosion',
    severity: 'high',
    radius: 4000,
    title: 'Ganga Left Bank Erosion Corridor',
    description: 'High velocity discharge during peak monsoon undermining protective spurs and approach roads.',
    source: 'Farakka Barrage Project (Ministry of Jal Shakti)',
    penalty: 7,
  },
  {
    id: 'dis_ers_03',
    lat: 26.4700, lng: 88.8500,
    area: 'Teesta River Basin (Domohani - Mekhliganj Belt)',
    type: 'river_erosion',
    severity: 'high',
    radius: 4500,
    title: 'Teesta Flash Swell & Channel Shifting',
    description: 'Glacial fed river prone to sudden multi-meter water level spikes and channel avulsion.',
    source: 'CWC Jalpaiguri Gauge Division',
    penalty: 7,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. CHRONIC URBAN WATERLOGGING HOTSPOTS
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'dis_wtl_01',
    lat: 22.5830, lng: 88.3680,
    area: 'Thanthania - Amherst Street - College Street, Kolkata',
    type: 'waterlogging',
    severity: 'high',
    radius: 600,
    title: 'Chronic Rain Waterlogging Choke Point',
    description: 'Historic low bowl topography. Knee-deep to waist-deep water accumulation after >30mm/hr cloudbursts.',
    source: 'KMC Drainage Master Plan + Kolkata Traffic Police',
    penalty: 6,
  },
  {
    id: 'dis_wtl_02',
    lat: 22.5020, lng: 88.3180,
    area: 'Behala Chowrasta - Taratala - James Long Sarani, Kolkata',
    type: 'waterlogging',
    severity: 'high',
    radius: 900,
    title: 'South Kolkata Severe Inundation Corridor',
    description: 'Inadequate outfall discharge to Tolly Nullah. Heavy waterlogging disrupts Diamond Harbour Road traffic.',
    source: 'KMC Drainage Dept',
    penalty: 6,
  },
  {
    id: 'dis_wtl_03',
    lat: 22.5400, lng: 88.3680,
    area: 'Park Circus 7-Point & Suhrawardy Ave, Kolkata',
    type: 'waterlogging',
    severity: 'medium',
    radius: 500,
    title: 'Roadway Water Inundation Spot',
    description: 'Underpass and roundabout flooding causing vehicular breakdowns during monsoons.',
    source: 'Kolkata Traffic Police advisories',
    penalty: 4,
  },
  {
    id: 'dis_wtl_04',
    lat: 22.5950, lng: 88.3200,
    area: 'Howrah Tikiapara & Dasnagar Low Belt, Howrah',
    type: 'waterlogging',
    severity: 'high',
    radius: 800,
    title: 'Railway Underpass & Road Submersion',
    description: 'Railway siding low catchment zone. Underpass roads impassable during continuous showers.',
    source: 'Howrah Municipal Corporation',
    penalty: 6,
  },
  {
    id: 'dis_wtl_05',
    lat: 22.5200, lng: 88.3980,
    area: 'Kasba - Ruby Roundabout - EM Bypass Connectors',
    type: 'waterlogging',
    severity: 'medium',
    radius: 700,
    title: 'Suburban Drainage Bottleneck',
    description: 'Service lanes and subway ramps submerge during high tides and cloudbursts.',
    source: 'KMDA Urban Drainage Report',
    penalty: 4,
  },
  {
    id: 'dis_wtl_06',
    lat: 22.6100, lng: 88.4350,
    area: 'VIP Road - Haldirams to Teghoria Choke Point',
    type: 'waterlogging',
    severity: 'high',
    radius: 650,
    title: 'Airport Arterial Water Accumulation',
    description: 'Severe road flooding after intense showers, causing multi-kilometer airport transit gridlocks.',
    source: 'Bidhannagar Police + KMC Drainage Master Plan',
    penalty: 6,
  },
  {
    id: 'dis_wtl_07',
    lat: 22.5020, lng: 88.3180,
    area: 'Behala Chowrasta & Diamond Harbour Road Basin',
    type: 'waterlogging',
    severity: 'high',
    radius: 750,
    title: 'Low Basin Chronic Waterlogging',
    description: 'Tolly Nullah backflow and flat terrain causes knee-deep inundation on major south arterial.',
    source: 'KMC Borough XIV Flood Records',
    penalty: 5,
  },
  {
    id: 'dis_wtl_08',
    lat: 22.6350, lng: 88.3850,
    area: 'Belgharia Expressway & Dunlop Junction Subway',
    type: 'waterlogging',
    severity: 'medium',
    radius: 500,
    title: 'Expressway Ramp Drainage Bottleneck',
    description: 'Underpass inundation during monsoon storms, diverting heavy commercial freight.',
    source: 'Barrackpore Police Traffic Division',
    penalty: 4,
  },
  {
    id: 'dis_wtl_09',
    lat: 22.5840, lng: 88.4200,
    area: 'Ultadanga Underpass & Kankurgachi Rail Bridge',
    type: 'waterlogging',
    severity: 'high',
    radius: 500,
    title: 'Rail Underpass Submersion Hazard',
    description: 'Critical urban connection submerges up to 3 feet during heavy cloudbursts.',
    source: 'Kolkata Traffic Police monsoon advisory',
    penalty: 6,
  },
  {
    id: 'dis_wtl_10',
    lat: 22.5350, lng: 88.3120,
    area: 'Taratala & Hyde Road Industrial Lowlands',
    type: 'waterlogging',
    severity: 'high',
    radius: 700,
    title: 'Industrial Freight Water Inundation',
    description: 'Inadequate stormwater outfall to Hooghly causes prolonged water stagnation.',
    source: 'KMC Drainage Department',
    penalty: 5,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. LIGHTNING & SEVERE CONVECTIVE STORM CORRIDOR
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'dis_ltg_01',
    lat: 22.4200, lng: 87.1500,
    area: 'Midnapore - Jhargram Red Laterite Plain Belt',
    type: 'lightning_storm',
    severity: 'medium',
    radius: 8000,
    title: 'High Lightning Flash Density Zone',
    description: 'Frequent severe lightning strikes during pre-monsoon Kalbaishakhi (Nor\'wester) squall lines.',
    source: 'IMD Thunderstorm Climatology of India + NDMA',
    penalty: 4,
  },
  {
    id: 'dis_ltg_02',
    lat: 23.2500, lng: 87.0500,
    area: 'Bankura - Purulia Open Rurban Corridor',
    type: 'lightning_storm',
    severity: 'medium',
    radius: 7500,
    title: 'Kalbaishakhi Squall & Lightning Corridor',
    description: 'High open ground lightning casualty incidence in March-June transition months.',
    source: 'WBSDMA Lightning Hazard Atlas',
    penalty: 4,
  },
  {
    id: 'dis_ltg_03',
    lat: 23.6800, lng: 86.9500,
    area: 'Asansol - Raniganj Mining Subsidence & Quake Zone',
    type: 'seismic',
    severity: 'high',
    radius: 5000,
    title: 'Abandoned Underground Coal Mine Subsidence Risk',
    description: 'Unstabilized underground voids prone to sudden road caving and tremors during heavy rain.',
    source: 'ECL & Directorate General of Mines Safety (DGMS)',
    penalty: 7,
  },
]

// ── Display config for disaster zones on map ──────────────────────────────────
export const DISASTER_SEVERITY_CONFIG = {
  critical: {
    color: '#DC2626',
    fillColor: '#EF4444',
    fillOpacity: 0.22,
    label: 'Critical Hazard Zone',
    icon: 'warning',
  },
  high: {
    color: '#EA580C',
    fillColor: '#F97316',
    fillOpacity: 0.18,
    label: 'High Disaster Risk',
    icon: 'landslide',
  },
  medium: {
    color: '#D97706',
    fillColor: '#FBBF24',
    fillOpacity: 0.12,
    label: 'Moderate Hazard Area',
    icon: 'thunderstorm',
  },
}

export const DISASTER_ROUTE_PROXIMITY_METERS = 250
