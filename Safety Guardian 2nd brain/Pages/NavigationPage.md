# 📱 NavigationPage (`NavigationPage.jsx`)

- **Route**: `/navigate`
- **Key Modules**:
  - Real-time turn-by-turn maneuvers with voice prompt simulation.
  - High-accuracy GPS location tracking (`navigator.geolocation.watchPosition`).
  - Live speed indicator (km/h) and remaining distance/ETA countdown.
  - Dynamic rerouting trigger when off-route $>50\text{ meters}$.
  - Auto-arrival detection triggering [[JourneyReviewPage]].
