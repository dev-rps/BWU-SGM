import { create } from 'zustand'
import { DEFAULT_CENTER } from '../constants'

const loadSession = (key, fallback) => {
  try {
    if (typeof window === 'undefined') return fallback
    const item = sessionStorage.getItem(key)
    return item ? JSON.parse(item) : fallback
  } catch {
    return fallback
  }
}

const saveSession = (key, val) => {
  try {
    if (typeof window === 'undefined') return
    if (val === null || val === undefined) sessionStorage.removeItem(key)
    else sessionStorage.setItem(key, JSON.stringify(val))
  } catch {}
}

export const useAppStore = create((set, get) => ({
  // Auth / flow
  hasOnboarded: false,
  isLoggedIn: false,
  hasPermissions: false,
  user: {
    name: '',
    email: '',
    avatar: null,
    phone: '',
    memberSince: '',
  },

  prefs: { avoidUnlit: true, autoShareWalk: false, safeZoneAlerts: true, liveFriendTracking: false },
  setPrefs: (patch) => set((state) => ({ prefs: { ...state.prefs, ...patch } })),

  // Location
  userLocation: {
    lat: DEFAULT_CENTER[0],
    lng: DEFAULT_CENTER[1],
    simulated: true,
  },
  setUserLocation: (loc) => set({ userLocation: loc }),

  startLocation: loadSession('sg_start_location', null),
  setStartLocation: (loc) => {
    saveSession('sg_start_location', loc)
    set({ startLocation: loc })
  },

  // Map
  mapCenter: DEFAULT_CENTER,
  mapZoom: 13,
  setMapCenter: (center) => set({ mapCenter: center }),

  // Search / Route
  destination: loadSession('sg_destination', null),
  setDestination: (dest) => {
    saveSession('sg_destination', dest)
    set({ destination: dest })
  },

  routes: loadSession('sg_routes', []),
  setRoutes: (routes) => {
    saveSession('sg_routes', routes)
    set({ routes })
  },

  selectedRouteIdx: loadSession('sg_selected_route_idx', 0),
  setSelectedRouteIdx: (idx) => {
    saveSession('sg_selected_route_idx', idx)
    set({ selectedRouteIdx: idx })
  },

  // Nearby places
  nearbyPlaces: [],
  setNearbyPlaces: (places) => set({ nearbyPlaces: places }),

  // Safety score
  safetyScore: 82,
  setSafetyScore: (score) => set({ safetyScore: score }),

  // 
  // FIRESTORE REPORTS
  // 
  reports: [],
  setReports: (reports) => set({ reports }),
  addReport: (report) =>
    set((state) => ({ reports: [report, ...state.reports] })),
  deleteReport: (id) =>
    set((state) => ({ reports: state.reports.filter((r) => r.id !== id) })),

  // SOS
  sosActive: false,
  setSosActive: (v) => set({ sosActive: v }),

  // Navigation
  isNavigating: false,
  setIsNavigating: (v) => set({ isNavigating: v }),

  // Live high-accuracy GPS during active navigation
  liveUserLocation: null,
  setLiveUserLocation: (loc) => set({ liveUserLocation: loc }),

  journeyComplete: false,
  setJourneyComplete: (v) => set({ journeyComplete: v }),

  // Emergency Contacts — starts EMPTY (loaded from Firestore on login)
  emergencyContacts: [],
  setEmergencyContacts: (contacts) => set({ emergencyContacts: contacts }),

  // Misc
  setHasOnboarded: (v) => set({ hasOnboarded: v }),
  setIsLoggedIn: (v) => set({ isLoggedIn: v }),
  setHasPermissions: (v) => set({ hasPermissions: v }),
  // Accepts either a full user object OR a partial patch — always merges
  setUser: (patch) => set((state) => ({ user: { ...state.user, ...(typeof patch === 'function' ? patch(state.user) : patch) } })),
}))