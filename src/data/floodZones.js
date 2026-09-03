/**
 * floodZones.js — Historical + live flood risk data for ALL OF INDIA
 *
 * STATIC DATA SOURCES:
 *   - ISRO/NRSC Flood Hazard Zonation Atlas of India (bhuvan.nrsc.gov.in)
 *   - NDMA Flood Vulnerability Assessment Reports (ndma.gov.in)
 *   - CWC (Central Water Commission) flood history + gauge data (cwc.gov.in)
 *   - State Irrigation / Waterways departments
 *   - Academic: ResearchGate flood susceptibility papers per state
 *
 * LIVE DATA: Open-Meteo Flood API (GloFAS river discharge, free, no API key)
 *   https://flood-api.open-meteo.com/v1/flood
 *
 * Zones represent historically flood-inundated areas from satellite records 2000-2023.
 * All radius values are in metres.
 */

// ─── River discharge monitoring points for live flood data ────────────────────
// Open-Meteo snaps to the nearest river in their 5km resolution grid.
const RIVER_MONITORING_POINTS = [

  // WEST BENGAL / EAST INDIA (original, preserved)
  { id: 'hooghly_kolkata', name: 'Hooghly River at Kolkata', lat: 22.5726, lng: 88.3083, river: 'Hooghly', thresholdModerate: 4500, thresholdHigh: 8000, affectedRadius: 2500 },
  { id: 'damodar_howrah',  name: 'Damodar River near Howrah', lat: 22.5958, lng: 88.1800, river: 'Damodar', thresholdModerate: 3000, thresholdHigh: 6000, affectedRadius: 3000 },
  { id: 'hooghly_upper',   name: 'Hooghly at Hooghly District', lat: 22.9014, lng: 88.3948, river: 'Hooghly', thresholdModerate: 5000, thresholdHigh: 9000, affectedRadius: 2000 },
  { id: 'rupnarayan',      name: 'Rupnarayan River', lat: 22.5400, lng: 87.9000, river: 'Rupnarayan', thresholdModerate: 2000, thresholdHigh: 4000, affectedRadius: 2000 },
  { id: 'brahmaputra_guwahati', name: 'Brahmaputra at Guwahati', lat: 26.1800, lng: 91.7300, river: 'Brahmaputra', thresholdModerate: 25000, thresholdHigh: 45000, affectedRadius: 5000 },
  { id: 'brahmaputra_dibrugarh', name: 'Brahmaputra at Dibrugarh', lat: 27.4800, lng: 94.9100, river: 'Brahmaputra', thresholdModerate: 20000, thresholdHigh: 38000, affectedRadius: 4000 },

  // NORTH INDIA
  { id: 'ganga_varanasi',  name: 'Ganga at Varanasi', lat: 25.3176, lng: 82.9739, river: 'Ganga', thresholdModerate: 12000, thresholdHigh: 22000, affectedRadius: 3000 },
  { id: 'ganga_patna',     name: 'Ganga at Patna', lat: 25.6000, lng: 85.1500, river: 'Ganga', thresholdModerate: 15000, thresholdHigh: 28000, affectedRadius: 4000 },
  { id: 'yamuna_delhi',    name: 'Yamuna at Delhi', lat: 28.6692, lng: 77.2190, river: 'Yamuna', thresholdModerate: 6000, thresholdHigh: 12000, affectedRadius: 3000 },
  { id: 'yamuna_agra',     name: 'Yamuna at Agra', lat: 27.1767, lng: 78.0081, river: 'Yamuna', thresholdModerate: 5000, thresholdHigh: 10000, affectedRadius: 2500 },
  { id: 'kosi_bihar',      name: 'Kosi River, Bihar', lat: 26.0000, lng: 87.0000, river: 'Kosi', thresholdModerate: 8000, thresholdHigh: 16000, affectedRadius: 5000 },
  { id: 'gandak_bihar',    name: 'Gandak River near Muzaffarpur', lat: 26.1209, lng: 85.3647, river: 'Gandak', thresholdModerate: 5000, thresholdHigh: 10000, affectedRadius: 4000 },

  // CENTRAL / DECCAN
  { id: 'narmada_bharuch', name: 'Narmada at Bharuch', lat: 21.7200, lng: 72.9800, river: 'Narmada', thresholdModerate: 15000, thresholdHigh: 28000, affectedRadius: 4000 },
  { id: 'tapti_surat',     name: 'Tapti River at Surat', lat: 21.1800, lng: 72.7900, river: 'Tapti', thresholdModerate: 8000, thresholdHigh: 16000, affectedRadius: 3500 },
  { id: 'godavari_rajahmundry', name: 'Godavari at Rajahmundry', lat: 17.0005, lng: 81.7799, river: 'Godavari', thresholdModerate: 20000, thresholdHigh: 40000, affectedRadius: 5000 },
  { id: 'krishna_vijayawada', name: 'Krishna at Vijayawada', lat: 16.5062, lng: 80.6480, river: 'Krishna', thresholdModerate: 15000, thresholdHigh: 30000, affectedRadius: 4000 },
  { id: 'mahanadi_cuttack', name: 'Mahanadi at Cuttack', lat: 20.4625, lng: 85.8830, river: 'Mahanadi', thresholdModerate: 10000, thresholdHigh: 20000, affectedRadius: 4000 },
]

// ─── Static historical flood-prone zones from ISRO/NDMA Atlas ─────────────────
export const FLOOD_ZONES_STATIC = [

  // 
  // WEST BENGAL (original data preserved)
  // 

  { id: 'fl_001', lat: 22.5260, lng: 88.2900, area: 'Metiabruz / Garden Reach, Kolkata', radius: 1800, severity: 'high', description: 'Low-lying riverside area. Regularly inundated during monsoon per KMC flood maps.', source: 'KMC Flood Map 2022 + ISRO Bhuvan', monsoonRisk: true },
  { id: 'fl_002', lat: 22.5200, lng: 88.3850, area: 'Tiljala / Tangra Wetlands, Kolkata', radius: 1500, severity: 'high', description: 'Former wetland area. Chronic flooding due to drainage issues documented by KMC.', source: 'KMC Drainage Report 2021', monsoonRisk: true },
  { id: 'fl_003', lat: 22.5460, lng: 88.3940, area: 'Kasba / Mukundapur, Kolkata', radius: 1200, severity: 'medium', description: 'Low drainage coefficient. Flooding documented after 50mm+ rainfall events.', source: 'KMC Annual Report 2022', monsoonRisk: true },
  { id: 'fl_004', lat: 22.6200, lng: 88.4000, area: 'North Dum Dum, WB', radius: 1400, severity: 'medium', description: 'Suburban drainage issues. Flood inundation documented in 2021, 2022 monsoon.', source: 'NDMA West Bengal Report', monsoonRisk: true },
  { id: 'fl_005', lat: 22.5058, lng: 88.3100, area: 'Thakurpukur / Maheshtala, WB', radius: 1600, severity: 'medium', description: 'South Kolkata low-lying area with recurring flood issues near Tolly Nullah.', source: 'ISRO Flood Hazard Atlas WB', monsoonRisk: true },
  { id: 'fl_006', lat: 22.7231, lng: 88.4792, area: 'Barasat / Deganga, WB', radius: 3000, severity: 'high', description: 'Recorded as high flood hazard zone in NDMA Atlas. Ichamati River overflow.', source: 'NDMA Flood Hazard Zonation Atlas WB 2020', monsoonRisk: true },
  { id: 'fl_007', lat: 22.8000, lng: 88.5500, area: 'Basirhat / Sandeshkhali, WB', radius: 4000, severity: 'high', description: 'Extremely high flood risk. Cyclone Amphan + Yaas caused severe inundation 2020-2021.', source: 'NRSC ISRO Post-Cyclone Assessment', monsoonRisk: true },
  { id: 'fl_008', lat: 22.9500, lng: 88.4900, area: 'Hasnabad Area, WB', radius: 3500, severity: 'high', description: 'Coastal zone. Recurring flood from Ichhamati and storm surge. NDMA High Risk Zone.', source: 'NDMA Atlas 2020', monsoonRisk: true },
  { id: 'fl_009', lat: 22.2000, lng: 88.4000, area: 'Diamond Harbour / Mathurapur, WB', radius: 5000, severity: 'high', description: 'Tidal flooding zone. Rupnarayan and Hooghly confluence. Very high risk per ISRO.', source: 'ISRO Bhuvan Flood Hazard Atlas', monsoonRisk: true },
  { id: 'fl_010', lat: 22.3500, lng: 88.5500, area: 'Kakdwip / Namkhana, WB', radius: 6000, severity: 'high', description: 'Coastal Sundarbans buffer zone. Among highest flood risk in WB.', source: 'NDMA + ISRO Joint Assessment', monsoonRisk: true },
  { id: 'fl_011', lat: 22.5200, lng: 88.0800, area: 'Amta / Udaynarayanpur, WB', radius: 4000, severity: 'high', description: 'Damodar flood plain. Recorded catastrophic flooding 2000, 2009, 2021.', source: 'CWC + NRSC Flood History', monsoonRisk: true },
  { id: 'fl_012', lat: 22.6800, lng: 88.1500, area: 'Uluberia, WB', radius: 3000, severity: 'high', description: 'Damodar-Rupnarayan convergence zone. NDMA categorised as Very High Hazard.', source: 'NDMA Hazard Atlas WB', monsoonRisk: true },
  { id: 'fl_013', lat: 22.9014, lng: 88.3948, area: 'Hooghly / Chinsurah, WB', radius: 2500, severity: 'medium', description: 'Hooghly River banks. Moderate flood risk from river overflow during high discharge.', source: 'CWC Flood Monitoring + ISRO', monsoonRisk: true },
  { id: 'fl_014', lat: 23.0000, lng: 88.1400, area: 'Arambagh, WB', radius: 3500, severity: 'high', description: 'Damodar plains. Severe flood documented multiple times. CWC red alert zone.', source: 'CWC Historical Flood Data', monsoonRisk: true },
  { id: 'fl_015', lat: 23.4700, lng: 88.5500, area: 'Krishnanagar / Chapra, WB', radius: 4000, severity: 'high', description: 'Jalangi River flood zone. High hazard per NDMA Flood Atlas.', source: 'NDMA Hazard Zonation WB', monsoonRisk: true },

  // 
  // ASSAM & NORTHEAST (Brahmaputra Basin)
  // 

  { id: 'as_001', lat: 26.1445, lng: 91.7362, area: 'Guwahati Low Areas (Bharalumukh)', radius: 3000, severity: 'high', description: 'Brahmaputra floodplain. Annual flooding documented. NDMA Very High Hazard zone.', source: 'NDMA Assam Flood Report 2023 + NRSC', monsoonRisk: true },
  { id: 'as_002', lat: 26.6900, lng: 93.9600, area: 'Jorhat / Majuli Island, Assam', radius: 8000, severity: 'high', description: 'Majuli is world\'s largest river island, frequently flooded by Brahmaputra. Annual inundation.', source: 'ISRO + CWC Northeast Division', monsoonRisk: true },
  { id: 'as_003', lat: 26.5000, lng: 90.2000, area: 'Bongaigaon / Chirang, Assam', radius: 5000, severity: 'high', description: 'Manas and Aie river system. Repeated catastrophic flooding per ASDMA reports.', source: 'ASDMA + NDMA 2022', monsoonRisk: true },
  { id: 'as_004', lat: 27.4800, lng: 94.9100, area: 'Dibrugarh / Tinsukia, Assam', radius: 6000, severity: 'high', description: 'Upper Brahmaputra corridor. High flood risk, embankment breaches documented yearly.', source: 'ASDMA Flood Report 2023 + CWC', monsoonRisk: true },
  { id: 'as_005', lat: 26.3500, lng: 92.5000, area: 'Nagaon / Morigaon, Assam', radius: 7000, severity: 'high', description: 'Central Assam floodplain. Among worst-affected areas in annual Assam floods.', source: 'NDMA + ISRO Bhuvan Flood Atlas', monsoonRisk: true },

  // 
  // BIHAR (Kosi, Gandak, Bagmati, Ganga)
  // 

  { id: 'bh_001', lat: 26.1200, lng: 87.0000, area: 'Supaul / Araria, Bihar (Kosi Floodplain)', radius: 15000, severity: 'high', description: 'Kosi river is called "Sorrow of Bihar". Catastrophic 2008 breach displaced millions. CWC Very High Hazard.', source: 'CWC Kosi Project + NDMA Bihar 2023', monsoonRisk: true },
  { id: 'bh_002', lat: 26.3700, lng: 85.8700, area: 'Darbhanga / Madhubani, Bihar', radius: 10000, severity: 'high', description: 'Bagmati and Kamla river flood zone. Annual inundation documented. NDMA High Hazard.', source: 'NDMA Bihar + Bihar Flood Management', monsoonRisk: true },
  { id: 'bh_003', lat: 26.1209, lng: 85.3647, area: 'Muzaffarpur / Sitamarhi, Bihar', radius: 8000, severity: 'high', description: 'Gandak and Burhi Gandak rivers. Recurring catastrophic flooding per CWC records.', source: 'CWC + Bihar SDMA 2022', monsoonRisk: true },
  { id: 'bh_004', lat: 25.6000, lng: 85.1400, area: 'Patna Low-Lying Areas', radius: 4000, severity: 'medium', description: 'Ganga flooding causes inundation in low-lying Patna areas. 2019 Patna flood documented.', source: 'Bihar SDMA + ISRO Emergency Flood Report', monsoonRisk: true },
  { id: 'bh_005', lat: 25.5500, lng: 84.9000, area: 'Saran / Siwan, Bihar', radius: 8000, severity: 'high', description: 'Ghaghra and Ganga confluence zone. Severe annual flooding documented.', source: 'CWC + NDMA Bihar', monsoonRisk: true },

  // 
  // UTTAR PRADESH (Ganga, Yamuna, Ghaghra)
  // 

  { id: 'up_001', lat: 25.3176, lng: 82.9739, area: 'Varanasi Low-Lying Areas', radius: 3000, severity: 'high', description: 'Ganga flooding of low ghats and riverside areas. Annual CWC alert zone.', source: 'CWC + ISRO Post-Flood Mapping 2023', monsoonRisk: true },
  { id: 'up_002', lat: 26.4499, lng: 80.3319, area: 'Kanpur Riverside (Sisamau, Rawatpur)', radius: 4000, severity: 'medium', description: 'Ganga floodplain. Inundation documented 2019, 2020, 2021, 2022.', source: 'CWC Kanpur Gauge + UP SDMA', monsoonRisk: true },
  { id: 'up_003', lat: 26.7606, lng: 83.3732, area: 'Gorakhpur (Rapti River zone)', radius: 5000, severity: 'high', description: 'Rapti and Rohini rivers. Severe flooding documented multiple times. NDMA High Risk zone.', source: 'NDMA + CWC Eastern UP', monsoonRisk: true },
  { id: 'up_004', lat: 25.9316, lng: 81.6837, area: 'Allahabad / Prayagraj Sangam area', radius: 4000, severity: 'high', description: 'Ganga-Yamuna confluence. Extreme flooding during high discharge years (2019, 2021).', source: 'CWC Allahabad Gauge + NDMA', monsoonRisk: true },
  { id: 'up_005', lat: 27.5706, lng: 80.0982, area: 'Lakhimpur Kheri / Dudhwa', radius: 8000, severity: 'high', description: 'Ghaghra/Sharda river flood zone. Among highest flood hazard districts in UP per NDMA.', source: 'NDMA Flood Atlas UP 2021', monsoonRisk: true },

  // 
  // DELHI NCR (Yamuna)
  // 

  { id: 'dl_001', lat: 28.6692, lng: 77.2190, area: 'Delhi Yamuna Flood Plain (Yamuna Pushta)', radius: 4000, severity: 'high', description: 'Yamuna floodplain. 2023 Delhi flood was most severe in decades. CWC Red Alert zone.', source: 'CWC + Delhi Govt Flood Report 2023', monsoonRisk: true },
  { id: 'dl_002', lat: 28.6500, lng: 77.2800, area: 'East Delhi Yamuna Khadar', radius: 3000, severity: 'high', description: 'East Delhi low-lying areas adjacent to Yamuna. Inundated in 2023 floods.', source: 'ISRO Emergency Flood Mapping Delhi 2023', monsoonRisk: true },

  // 
  // GUJARAT (Narmada, Tapti, Sabarmati)
  // 

  { id: 'gj_001', lat: 21.1702, lng: 72.8311, area: 'Surat (Tapti River Low Areas)', radius: 5000, severity: 'high', description: 'Tapti river flooding caused catastrophic 2006 Surat flood. CWC Very High Hazard zone.', source: 'CWC + NDMA Gujarat + ISRO Bhuvan', monsoonRisk: true },
  { id: 'gj_002', lat: 21.7200, lng: 72.9800, area: 'Bharuch (Narmada Floodplain)', radius: 6000, severity: 'high', description: 'Narmada river. Sardar Sarovar dam releases cause downstream flooding. NDMA High Risk.', source: 'CWC Narmada Division + NDMA 2023', monsoonRisk: true },
  { id: 'gj_003', lat: 23.0225, lng: 72.5714, area: 'Ahmedabad Low Areas (Sabarmati)', radius: 3000, severity: 'medium', description: 'Sabarmati river flooding of low-lying areas. 2024 flood inundated parts of city.', source: 'Ahmedabad Municipal Corporation + CWC', monsoonRisk: true },
  { id: 'gj_004', lat: 22.3039, lng: 70.8022, area: 'Rajkot / Morbi, Gujarat', radius: 5000, severity: 'high', description: '2022 Morbi bridge collapse + flood disaster. Machchhu river flood zone. CWC High Hazard.', source: 'NDMA + CWC Gujarat Post-Disaster 2022', monsoonRisk: true },

  // 
  // ODISHA (Mahanadi, Brahmani, Baitarani)
  // 

  { id: 'od_001', lat: 20.4625, lng: 85.8830, area: 'Cuttack (Mahanadi Floodplain)', radius: 5000, severity: 'high', description: 'Mahanadi river. Cuttack is historically one of most flood-prone cities in India.', source: 'NDMA + Odisha SDMA + CWC 2023', monsoonRisk: true },
  { id: 'od_002', lat: 20.9517, lng: 85.0985, area: 'Sambalpur / Hirakud Downstream', radius: 6000, severity: 'high', description: 'Hirakud dam releases cause downstream flooding. NDMA categorises as Very High Risk.', source: 'CWC Hirakud Data + NDMA Odisha', monsoonRisk: true },
  { id: 'od_003', lat: 20.2700, lng: 86.1300, area: 'Jagatsinghpur / Ersama, Odisha', radius: 7000, severity: 'high', description: 'Coastal Odisha. Cyclone-induced flooding + tidal inundation. 1999 super cyclone zone.', source: 'ISRO + NDMA Coastal Odisha Assessment', monsoonRisk: true },
  { id: 'od_004', lat: 19.3150, lng: 84.7941, area: 'Berhampur / Ganjam Coastal Area', radius: 5000, severity: 'high', description: 'Coastal Odisha. Repeated cyclone storm surge inundation documented.', source: 'NDMA + ISRO Post-Cyclone Mapping', monsoonRisk: true },

  // 
  // ANDHRA PRADESH & TELANGANA
  // 

  { id: 'ap_001', lat: 17.0005, lng: 81.7799, area: 'Rajahmundry / Godavari Delta', radius: 8000, severity: 'high', description: 'Godavari delta. One of most flood-prone river systems. CWC Very High Hazard.', source: 'CWC Godavari + NDMA AP', monsoonRisk: true },
  { id: 'ap_002', lat: 16.5062, lng: 80.6480, area: 'Vijayawada (Krishna River)', radius: 5000, severity: 'high', description: 'Krishna river flooding. 2020 floods inundated much of Vijayawada. CWC High Hazard.', source: 'CWC Krishna + NDMA AP 2020', monsoonRisk: true },
  { id: 'ap_003', lat: 16.3067, lng: 80.4365, area: 'Eluru / Krishna-Godavari Delta', radius: 7000, severity: 'high', description: 'Delta interfluve area. Extremely high flood hazard per ISRO Atlas.', source: 'ISRO Bhuvan + NDMA AP', monsoonRisk: true },
  { id: 'tel_001', lat: 17.3850, lng: 78.4867, area: 'Hyderabad Low-Lying Areas (Musi River)', radius: 4000, severity: 'medium', description: 'Musi river flooding. 2020 Hyderabad floods caused severe urban inundation.', source: 'GHMC + Telangana SDMA 2020', monsoonRisk: true },

  // 
  // MUMBAI & MAHARASHTRA (Mithi, Ulhas rivers)
  // 

  { id: 'mh_001', lat: 19.0760, lng: 72.8777, area: 'Mumbai Suburban Low Areas (Mithi River)', radius: 3000, severity: 'high', description: 'Mithi river flooding. 2005 Mumbai floods caused over 1000 deaths. NDMA Very High Hazard.', source: 'NDMA + BMC Flood Atlas Mumbai 2023', monsoonRisk: true },
  { id: 'mh_002', lat: 19.2183, lng: 72.9781, area: 'Thane Creek Low Areas / Mumbra', radius: 3500, severity: 'medium', description: 'Tidal flooding and Ulhas river overflow. Documented inundation during extreme rainfall.', source: 'TMC + NDMA Maharashtra', monsoonRisk: true },
  { id: 'mh_003', lat: 16.7050, lng: 74.2433, area: 'Kolhapur / Sangli (Panchganga River)', radius: 6000, severity: 'high', description: '2019, 2021 catastrophic floods. Panchganga and Krishna rivers. NDMA High Risk.', source: 'NDMA + Maharashtra SDMA + CWC 2021', monsoonRisk: true },

  // 
  // KERALA (Western Ghats + Coastal)
  // 

  { id: 'kl_001', lat: 9.5000, lng: 76.3300, area: 'Kuttanad / Alappuzha (Below Sea Level)', radius: 10000, severity: 'high', description: 'Kuttanad is below sea level — among most flood-vulnerable areas in Asia. Annual inundation.', source: 'Kerala Irrigation + ISRO + NDMA Kerala', monsoonRisk: true },
  { id: 'kl_002', lat: 10.0700, lng: 76.3800, area: 'Ernakulam / Periyar River Low Areas', radius: 4000, severity: 'medium', description: 'Periyar river flooding. 2018 Kerala floods severely impacted this zone.', source: 'KSDMA + NDMA 2018 + ISRO', monsoonRisk: true },
  { id: 'kl_003', lat: 11.1271, lng: 75.9100, area: 'Kozhikode Coastal Low Areas', radius: 3500, severity: 'medium', description: 'Coastal flooding + Chaliyar river overflow. 2018 flood impacts documented.', source: 'Kerala Revenue Dept + NDMA 2018', monsoonRisk: true },
  { id: 'kl_004', lat: 9.2648, lng: 76.7870, area: 'Pathanamthitta / Pampa River', radius: 5000, severity: 'high', description: 'Pampa river. Most severely affected district in 2018 Kerala floods.', source: 'KSDMA 2018 + ISRO Emergency Flood Mapping', monsoonRisk: true },

  // 
  // RAJASTHAN (Flash Floods)
  // 

  { id: 'rj_001', lat: 25.1500, lng: 74.6300, area: 'Kota / Baran (Chambal River)', radius: 6000, severity: 'high', description: 'Chambal river dam releases cause downstream flooding. CWC High Hazard zone.', source: 'CWC Chambal Division + NDMA Rajasthan', monsoonRisk: true },
  { id: 'rj_002', lat: 24.8800, lng: 74.6200, area: 'Jhalawar / Baran Flash Flood Zone', radius: 5000, severity: 'medium', description: 'Flash flood prone in Hadoti region. Documented incidents 2019, 2022, 2023.', source: 'Rajasthan SDMA + NDMA', monsoonRisk: true },

  // 
  // HIMACHAL PRADESH & UTTARAKHAND (Mountain Flash Floods)
  // 

  { id: 'hp_001', lat: 31.1048, lng: 77.1734, area: 'Shimla / Solan Flash Flood Zone', radius: 3000, severity: 'high', description: 'Cloudbursts cause flash floods and landslides. 2023 Himachal floods severely impacted this area.', source: 'NDMA + Himachal SDMA 2023 + ISRO', monsoonRisk: true },
  { id: 'hp_002', lat: 32.0809, lng: 76.5887, area: 'Mandi / Kullu, Himachal Pradesh', radius: 4000, severity: 'high', description: 'Beas river flooding + flash floods. 2023 Mandi floods among worst in decades.', source: 'CWC Beas + NDMA HP 2023', monsoonRisk: true },
  { id: 'uk_001', lat: 30.3165, lng: 78.0322, area: 'Dehradun / Rishikesh (Ganga, Song River)', radius: 3000, severity: 'high', description: 'Flash floods and Ganga surges. 2013 Kedarnath disaster zone upstream.', source: 'CWC + NDMA Uttarakhand', monsoonRisk: true },

  // 
  // JAMMU & KASHMIR
  // 

  { id: 'jk_001', lat: 34.0837, lng: 74.7973, area: 'Srinagar (Jhelum River)', radius: 4000, severity: 'high', description: 'Jhelum river. 2014 Kashmir floods were worst in 60 years — catastrophic inundation.', source: 'CWC Jhelum + NDMA JK 2014 + ISRO', monsoonRisk: true },
]

// ─── Flood risk display config ─────────────────────────────────────────────────
export const FLOOD_SEVERITY_CONFIG = {
  high: {
    color: '#1D4ED8',
    fillColor: '#3B82F6',
    fillOpacity: 0.20,
    label: 'High Flood Risk',
    icon: 'flood',
    penalty: 20,
  },
  medium: {
    color: '#0369A1',
    fillColor: '#38BDF8',
    fillOpacity: 0.14,
    label: 'Moderate Flood Risk',
    icon: 'water',
    penalty: 10,
  },
  low: {
    color: '#0EA5E9',
    fillColor: '#BAE6FD',
    fillOpacity: 0.10,
    label: 'Low Flood Risk',
    icon: 'water_drop',
    penalty: 4,
  },
}

// Distance within which a flood zone affects a route's safety score
export const FLOOD_ROUTE_PROXIMITY_METERS = 200

// ─── Live flood data fetcher from Open-Meteo (GloFAS) ─────────────────────────
/**
 * Fetches current river discharge for India-wide monitoring points.
 * Open-Meteo Flood API: https://flood-api.open-meteo.com/v1/flood
 * Free, no API key required, uses GloFAS reanalysis + forecast data.
 *
 * Returns array of monitoring points with:
 *   { ...point, currentDischarge, floodRisk: 'low'|'moderate'|'high', trend }
 */
export async function fetchLiveFloodData() {
  const results = await Promise.allSettled(
    RIVER_MONITORING_POINTS.map(async (point) => {
      const url =
        `https://flood-api.open-meteo.com/v1/flood` +
        `?latitude=${point.lat}&longitude=${point.lng}` +
        `&daily=river_discharge,river_discharge_mean,river_discharge_median` +
        `&past_days=14&forecast_days=3`

      const res  = await fetch(url)
      if (!res.ok) throw new Error(`Open-Meteo error ${res.status}`)
      const data = await res.json()

      const dischargeArr = data.daily?.river_discharge || []
      const medianArr    = data.daily?.river_discharge_median || []

      const currentDischarge = [...dischargeArr].reverse().find(v => v !== null) || 0
      const medianDischarge  = medianArr.length ? medianArr[Math.floor(medianArr.length / 2)] : 0

      let floodRisk = 'low'
      if (currentDischarge > point.thresholdHigh)          floodRisk = 'high'
      else if (currentDischarge > point.thresholdModerate) floodRisk = 'moderate'

      const recent = dischargeArr.slice(-4).filter(v => v !== null)
      const trend  = recent.length >= 2
        ? (recent[recent.length - 1] > recent[0] ? 'rising' : 'falling')
        : 'stable'

      return {
        ...point,
        currentDischarge: Math.round(currentDischarge),
        medianDischarge:  Math.round(medianDischarge),
        floodRisk,
        trend,
        lastUpdated: new Date().toISOString(),
      }
    })
  )

  return results
    .filter(r => r.status === 'fulfilled')
    .map(r => r.value)
}

// ─── Check if current date is monsoon season ──────────────────────────────────
export function isMonsoonSeason() {
  const month = new Date().getMonth() + 1  // 1-12
  return month >= 6 && month <= 10          // June – October
}
