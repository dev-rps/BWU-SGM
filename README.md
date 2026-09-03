# 🗺️ Safety Map — West Bengal MVP

A premium safety navigation app for West Bengal built with React + Vite + TailwindCSS + Leaflet.

## 🚀 Quick Start

```bash
npm install
npm run dev
```

Open: **http://localhost:5173**

## 🌐 Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite |
| Styling | TailwindCSS v4 |
| Maps | Leaflet + react-leaflet |
| Navigation | React Router v6 |
| State | Zustand |
| Search | Nominatim (OpenStreetMap) |
| Routing | OSRM (free, no key) |
| Nearby Places | Overpass API (free) |
| Tiles | OpenStreetMap (free) |

## 📱 App Flow

```
Splash → Onboarding → Login → Permissions → Home Dashboard
                                              ↓
                                          Search → Route Selection → Live Navigation
                                              ↓
                                     Safety Tab | Reports Tab | Profile Tab
                                              ↓
                                        SOS Button → Emergency Screen
```

## 🗺️ Map Coverage

**West Bengal only** — all search, routing, and nearby places are restricted to West Bengal bounds.

Default center: **Brainware University, Barasat** (lat: 22.6186, lng: 88.4746)

## ✅ Features

- 🗺️ Live Leaflet map with OpenStreetMap tiles
- 🔍 Nominatim search autocomplete (West Bengal restricted)
- 🛣️ OSRM routing with Fastest/Balanced/Safest options
- 📊 Safety score algorithm (hospitals + police + reports)
- 📍 Overpass API for nearby hospitals, police, fire stations
- 🚨 SOS emergency screen with pulse animations
- ⚠️ Hazard reporting with local storage persistence
- 🧭 Live navigation with turn-by-turn steps
- 📱 Bottom navigation with 5 tabs

## 🚀 Deploy to Vercel

```bash
npm run build
vercel deploy --prod
```

Or push to GitHub → connect to Vercel → auto-deploy.

## 📁 Project Structure

```
src/
├── components/
│   ├── navigation/   # MainLayout, BottomNav
│   └── buttons/      # SOSButton
├── pages/
│   ├── Splash/       # Auto-redirect after 2.5s
│   ├── Onboarding/   # 3-slide carousel
│   ├── Login/        # Dummy auth
│   ├── Permissions/  # Location/notification/camera
│   ├── Home/         # Map + search + cards
│   ├── Search/       # Nominatim autocomplete
│   ├── RouteSelection/ # OSRM routes + safety scores
│   ├── Navigation/   # Turn-by-turn
│   ├── Safety/       # Analysis + nearby places
│   ├── Reports/      # Hazard reporting
│   ├── Emergency/    # SOS screen
│   └── Profile/      # Settings + contacts
├── services/
│   ├── nominatim.js  # Search API
│   ├── osrm.js       # Routing API
│   ├── overpass.js   # Nearby places API
│   ├── location.js   # Geolocation + fallback
│   └── safetyScore.js # Score algorithm
├── context/
│   └── store.js      # Zustand global state
└── constants/
    └── index.js      # WB bounds, colors, categories
```

## 🔑 No API Keys Required

All APIs used are completely free and open:
- OpenStreetMap (tiles)
- Nominatim (geocoding)
- OSRM (routing)
- Overpass (POI data)

Built for Brainware University presentation — Safety Map MVP 2025
