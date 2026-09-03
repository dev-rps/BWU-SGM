import { create } from 'zustand'
import { DEFAULT_CENTER } from '../constants'

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

  startLocation: null,
  setStartLocation: (loc) => set({ startLocation: loc }),

  // Map
  mapCenter: DEFAULT_CENTER,
  mapZoom: 13,
  setMapCenter: (center) => set({ mapCenter: center }),

  // Search / Route
  destination: null,
  setDestination: (dest) => set({ destination: dest }),

  routes: [],
  setRoutes: (routes) => set({ routes }),

  selectedRouteIdx: 1,
  setSelectedRouteIdx: (idx) => set({ selectedRouteIdx: idx }),

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