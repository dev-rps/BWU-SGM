# Safety Guardian (BWU-SGM) — Live Navigation, Incident Detection & Rerouting Audit

> **Target Platform**: Safety Guardian (`safetyguardian.xyz`)  
> **Audit Date**: October 31, 2026  
> **Status**: Completed (Phase 1 Audit — Read-Only Assessment)

---

## 1. Codebase Architecture & Systems Map

| Layer | Implementation & Technology | Evidence in Codebase |
| :--- | :--- | :--- |
| **Frontend Framework** | React 19 (`^19.2.7`) with Vite 8 SPA | [`package.json:19`](file:///c:/Users/iitia/OneDrive/Desktop/BWU-SGM/package.json#L19), [`src/main.jsx`](file:///c:/Users/iitia/OneDrive/Desktop/BWU-SGM/src/main.jsx) |
| **Routing & Navigation** | React Router v7 (`react-router-dom ^7.18.2`) | [`src/App.jsx:133-174`](file:///c:/Users/iitia/OneDrive/Desktop/BWU-SGM/src/App.jsx#L133-L174) |
| **Map Rendering Engine** | MapLibre GL (`^6.7.0`) via `react-map-gl/maplibre` (3D 62° WebGL camera, heading follow, raster Google/OSM tile layers) | [`src/pages/Navigation/NavigationPage.jsx:14-17`](file:///c:/Users/iitia/OneDrive/Desktop/BWU-SGM/src/pages/Navigation/NavigationPage.jsx#L14-L17), [`src/services/mapProvider.js`](file:///c:/Users/iitia/OneDrive/Desktop/BWU-SGM/src/services/mapProvider.js) |
| **Routing Providers** | Multi-tier fallback: Google Routes API (primary) → TomTom Routing API v1 (secondary) → Open Source Routing Machine (OSRM free fallback) | [`src/services/googleRouting.js`](file:///c:/Users/iitia/OneDrive/Desktop/BWU-SGM/src/services/googleRouting.js), [`src/services/tomtomRouting.js`](file:///c:/Users/iitia/OneDrive/Desktop/BWU-SGM/src/services/tomtomRouting.js), [`src/services/osrm.js`](file:///c:/Users/iitia/OneDrive/Desktop/BWU-SGM/src/services/osrm.js) |
| **Backend & Database** | Supabase Postgres with PostGIS extensions, Row Level Security (RLS), and Storage buckets | [`supabase/migrations/20260911000001_initial_schema.sql`](file:///c:/Users/iitia/OneDrive/Desktop/BWU-SGM/supabase/migrations/20260911000001_initial_schema.sql), [`src/supabase/supabase.js`](file:///c:/Users/iitia/OneDrive/Desktop/BWU-SGM/src/supabase/supabase.js) |
| **Realtime Layer** | Supabase Realtime WebSocket channels (`postgres_changes` on `hazard_reports`, `sos_events`, `live_locations`) | [`src/pages/Home/HomePage.jsx:297-306`](file:///c:/Users/iitia/OneDrive/Desktop/BWU-SGM/src/pages/Home/HomePage.jsx#L297-L306), [`src/services/sosService.js:80-97`](file:///c:/Users/iitia/OneDrive/Desktop/BWU-SGM/src/services/sosService.js#L80-L97) |
| **Auth System** | Supabase Auth (Email/Password + Google OAuth) synced to Zustand store (`isLoggedIn`, `user`, `permissions`) | [`src/services/authService.js`](file:///c:/Users/iitia/OneDrive/Desktop/BWU-SGM/src/services/authService.js), [`src/context/store.js:48-61`](file:///c:/Users/iitia/OneDrive/Desktop/BWU-SGM/src/context/store.js#L48-L61) |
| **Trips, Check-ins & Alerts** | - **Trips/Journeys**: Recorded in `journeys` table via `createJourney`  <br>- **Trusted Contacts**: Synced to `emergency_contacts` table via `contactsService.js` <br>- **Distress Alerts**: Triggered via `sosService.js` and `EmergencyPage.jsx` with WhatsApp/SMS links <br>- **Timed Check-ins**: **MISSING** (No automated check-in timer or escalation engine) | [`src/services/supabaseDataService.js:123-151`](file:///c:/Users/iitia/OneDrive/Desktop/BWU-SGM/src/services/supabaseDataService.js#L123-L151), [`src/services/contactsService.js`](file:///c:/Users/iitia/OneDrive/Desktop/BWU-SGM/src/services/contactsService.js), [`src/services/sosService.js`](file:///c:/Users/iitia/OneDrive/Desktop/BWU-SGM/src/services/sosService.js) |

---

## 2. Comprehensive Item-by-Item Audit Findings

| Audit Item | Status | Detailed Assessment & Citations |
| :--- | :---: | :--- |
| **a. Traffic-aware routing with alternative routes** | **IMPLEMENTED** (Pre-Trip) / **PARTIAL** (In-Trip) | **Pre-Trip**: Fully implemented. [`src/services/tomtomRouting.js:237-251`](file:///c:/Users/iitia/OneDrive/Desktop/BWU-SGM/src/services/tomtomRouting.js#L237-L251) requests `traffic=true&sectionType=traffic&avoid=ferries` for vehicular modes; [`src/services/tomtomRouting.js:800-880`](file:///c:/Users/iitia/OneDrive/Desktop/BWU-SGM/src/services/tomtomRouting.js#L800-L880) generates 3 distinct alternatives (Fastest, Shortest, Alternative) with bridge corridor logic; [`src/services/googleRouting.js:23-25`](file:///c:/Users/iitia/OneDrive/Desktop/BWU-SGM/src/services/googleRouting.js#L23-L25) sets `computeAlternativeRoutes: true`, `routingPreference: 'TRAFFIC_AWARE'`. <br>**Active Trip**: Alternatives are never refreshed or requested once navigation starts in [`NavigationPage.jsx`](file:///c:/Users/iitia/OneDrive/Desktop/BWU-SGM/src/pages/Navigation/NavigationPage.jsx). |
| **b. Continuous re-evaluation during active trip** | **MISSING** | In [`src/pages/Navigation/NavigationPage.jsx:318-320`](file:///c:/Users/iitia/OneDrive/Desktop/BWU-SGM/src/pages/Navigation/NavigationPage.jsx#L318-L320), the only running interval is a 20-second clock display increment (`setClockTick`). There is **zero continuous route re-evaluation**, no traffic re-polling, no stationary backoff algorithm, and no trip-progress route lifecycle. |
| **c. Reroute triggers (ETA-jump, incident, deviation)** | **MISSING** / **BROKEN** | In [`src/pages/Navigation/NavigationPage.jsx:1267-1275`](file:///c:/Users/iitia/OneDrive/Desktop/BWU-SGM/src/pages/Navigation/NavigationPage.jsx#L1267-L1275), `haversineMeters` calculates `minDist` strictly to locate the closest coordinate index along the static polyline. It never checks if `minDist > OFF_ROUTE_THRESHOLD`. There is no deviation trigger. A reroute function `getReroutedRoute` exists at [`src/services/tomtomRouting.js:1106-1120`](file:///c:/Users/iitia/OneDrive/Desktop/BWU-SGM/src/services/tomtomRouting.js#L1106-L1120), but it is completely unwired (dead code, never called). ETA jump triggers do not exist. |
| **d. Incident data sources & API key security** | **PARTIAL** / **BROKEN** | - **Data Sources**: Static datasets exist for accident blackspots ([`src/data/accidentBlackspots.js`](file:///c:/Users/iitia/OneDrive/Desktop/BWU-SGM/src/data/accidentBlackspots.js)), crime hotspots ([`src/data/crimeHotspots.js`](file:///c:/Users/iitia/OneDrive/Desktop/BWU-SGM/src/data/crimeHotspots.js)), and flood zones. Supabase stores `hazard_reports`. Provider API `getTrafficIncidents` exists in [`src/services/tomtomTraffic.js:27-48`](file:///c:/Users/iitia/OneDrive/Desktop/BWU-SGM/src/services/tomtomTraffic.js#L27-L48) but is **never invoked anywhere**. <br>- **Key Security (BROKEN)**: All API keys (`VITE_TOMTOM_API_KEY`, `VITE_GOOGLE_MAPS_API_KEY`, `VITE_GEMINI_API_KEY`) are client-side Vite environment variables compiled into the client bundle ([`src/services/apiKeys.js:1-26`](file:///c:/Users/iitia/OneDrive/Desktop/BWU-SGM/src/services/apiKeys.js#L1-L26)). Supabase anon JWT key is hardcoded as fallback in plaintext ([`src/supabase/supabase.js:9`](file:///c:/Users/iitia/OneDrive/Desktop/BWU-SGM/src/supabase/supabase.js#L9)). |
| **e. Corridor filtering (route buffer vs city-wide)** | **PARTIAL** | In [`src/services/safetyScore.js:89, 127-139`](file:///c:/Users/iitia/OneDrive/Desktop/BWU-SGM/src/services/safetyScore.js#L89), point-to-segment Haversine distance filters incidents to within 250m of the polyline. **However**, network fetching in [`src/pages/Home/HomePage.jsx:273-276`](file:///c:/Users/iitia/OneDrive/Desktop/BWU-SGM/src/pages/Home/HomePage.jsx#L273-L276) selects all records from `hazard_reports` unconditionally without a spatial bounding box or buffer query. The entire database is downloaded to the client. |
| **f. User report layer (schema, TTL, dedupe, confirmation, rate limiting)** | **PARTIAL** | - **Schema**: Defined in [`supabase/migrations/20260911000001_initial_schema.sql:119-148`](file:///c:/Users/iitia/OneDrive/Desktop/BWU-SGM/supabase/migrations/20260911000001_initial_schema.sql#L119-L148) (`hazard_type`, `severity`, `latitude`, `longitude`, `created_at`, `status`, `upvotes`, `downvotes`). <br>- **TTL**: Filtered client-side at 72 hours ([`safetyScore.js:90`](file:///c:/Users/iitia/OneDrive/Desktop/BWU-SGM/src/services/safetyScore.js#L90)), but no database TTL or cleanup trigger exists. <br>- **Deduplication**: **MISSING**. No spatial-temporal clustering; identical reports can be spammed at the same coordinate. <br>- **Multi-User Confirmation**: SQL RPC `vote_hazard_report` exists ([`initial_schema.sql:160-188`](file:///c:/Users/iitia/OneDrive/Desktop/BWU-SGM/supabase/migrations/20260911000001_initial_schema.sql#L160-L188)), but no threshold changes report status to `verified` or auto-dismisses downvoted pins. <br>- **Rate Limiting**: **MISSING**. Policy allows unauthenticated (`user_id is null`) inserts without rate limits or CAPTCHA. |
| **g. Route scoring (ETA + safety penalty) & one-tap confirmation** | **MISSING** | [`src/services/safetyScore.js:88-92`](file:///c:/Users/iitia/OneDrive/Desktop/BWU-SGM/src/services/safetyScore.js#L88-L92) computes a standalone 0–100 heuristic safety score (`score = BASE_SCORE - sum(penalties)`). There is **no combined objective scoring function** unifying duration/ETA in seconds with safety risk penalties. In [`NavigationPage.jsx`](file:///c:/Users/iitia/OneDrive/Desktop/BWU-SGM/src/pages/Navigation/NavigationPage.jsx), there is no reroute UI banner or one-tap user confirmation dialog. |
| **h. Realtime push to client vs polling** | **PARTIAL** | Realtime WebSockets are wired on [`src/pages/Home/HomePage.jsx:297-306`](file:///c:/Users/iitia/OneDrive/Desktop/BWU-SGM/src/pages/Home/HomePage.jsx#L297-L306) and [`src/services/sosService.js:80-97`](file:///c:/Users/iitia/OneDrive/Desktop/BWU-SGM/src/services/sosService.js#L80-L97). **However**, [`src/pages/Navigation/NavigationPage.jsx`](file:///c:/Users/iitia/OneDrive/Desktop/BWU-SGM/src/pages/Navigation/NavigationPage.jsx) has **zero realtime channels open**. It relies exclusively on the static snapshot of `onRouteReports` passed from route selection ([`line 126`](file:///c:/Users/iitia/OneDrive/Desktop/BWU-SGM/src/pages/Navigation/NavigationPage.jsx#L126)). |
| **i. Integration with check-ins & ETA sync** | **MISSING** | Timed check-ins, automated check-in deadlines, and contact escalation on overdue arrival do not exist in the codebase. Rerouting cannot update check-in timers because check-in timers are not implemented. |
| **j. Failure handling (provider down/slow, offline/GPS loss, quotas)** | **PARTIAL** | - **Routing**: TomTom falls back to OSRM ([`src/services/tomtomRouting.js:1085-1102`](file:///c:/Users/iitia/OneDrive/Desktop/BWU-SGM/src/services/tomtomRouting.js#L1085-L1102)), Google Routes falls back to TomTom/OSRM ([`src/services/googleRouting.js:14-16`](file:///c:/Users/iitia/OneDrive/Desktop/BWU-SGM/src/services/googleRouting.js#L14-L16)). <br>- **Active Navigation**: If GPS signal drops, [`NavigationPage.jsx:1209-1318`](file:///c:/Users/iitia/OneDrive/Desktop/BWU-SGM/src/pages/Navigation/NavigationPage.jsx#L1209-L1318) simply stops updating. There is no GPS timeout detector, no "GPS Lost" warning banner, and no offline route preservation alert. |
| **k. Performance, battery & cost** | **PARTIAL** | [`NavigationPage.jsx:1235-1238`](file:///c:/Users/iitia/OneDrive/Desktop/BWU-SGM/src/pages/Navigation/NavigationPage.jsx#L1235-L1238) debounces heading changes with a 4-meter movement check. However, the simulation runs an uncapped 60 FPS `requestAnimationFrame` loop ([`lines 337-350`](file:///c:/Users/iitia/OneDrive/Desktop/BWU-SGM/src/pages/Navigation/NavigationPage.jsx#L337-L350)). There is no in-memory cache for route calculations, and duplicate in-flight routing requests are not aborted. |
| **l. Security and privacy** | **PARTIAL** | Ephemeral sharing in `live_locations` is restricted to 5 minutes via RLS ([`initial_schema.sql:484`](file:///c:/Users/iitia/OneDrive/Desktop/BWU-SGM/supabase/migrations/20260911000001_initial_schema.sql#L484)). However, client-side API keys are exposed, Supabase anon JWT is plaintext in source, and `hazard_reports` permits anonymous spam. |
| **m. Tests** | **MISSING** | Zero unit or integration tests exist in `src/` (`*.test.js` or `*.spec.js`). `package.json` contains no test runner (`vitest` or `jest`). All navigation logic is tightly coupled inside the 1948-line [`NavigationPage.jsx`](file:///c:/Users/iitia/OneDrive/Desktop/BWU-SGM/src/pages/Navigation/NavigationPage.jsx), preventing automated headless testing. |

---

## 3. Top Risks Ranked by Severity

```
  ┌────────────────────────────────────────────────────────────────────────┐
  │                           Risk Severity Matrix                         │
  ├──────────┬─────────────────────────────────────────────────────────────┤
  │ CRITICAL │ • No active route deviation detection or in-trip rerouting   │
  │          │ • Navigation runs on a frozen static pre-trip snapshot      │
  ├──────────┼─────────────────────────────────────────────────────────────┤
  │ HIGH     │ • Client-side API keys exposed in frontend bundle           │
  │          │ • Zero automated test coverage (0 test files in src/)        │
  │          │ • Open anonymous hazard report ingestion without rate limits │
  ├──────────┼─────────────────────────────────────────────────────────────┤
  │ MEDIUM   │ • Unbuffered global table queries for hazard reports        │
  │          │ • Missing timed check-in and automated escalation system    │
  │          │ • Silent GPS loss handling with no UI warning to driver      │
  │          │ • Battery drain from continuous 60 FPS animation loop        │
  └──────────┴─────────────────────────────────────────────────────────────┘
```

### Risk 1: Navigation Blindness & Inability to Reroute (CRITICAL)
- **Impact**: While driving or walking, if the user takes a wrong turn, or if a severe accident/flooding occurs 500m ahead, [`NavigationPage.jsx`](file:///c:/Users/iitia/OneDrive/Desktop/BWU-SGM/src/pages/Navigation/NavigationPage.jsx) never detects the deviation or the hazard. The user is left following an obsolete path into danger.
- **Root Cause**: `NavigationPage.jsx` treats the selected route as immutable. It lacks an off-route threshold check and does not poll or subscribe to corridor changes.

### Risk 2: Client-Side Credential Exposure (HIGH)
- **Impact**: Third parties inspecting browser network traffic or bundle sources can extract `VITE_TOMTOM_API_KEY`, `VITE_GOOGLE_MAPS_API_KEY`, and `VITE_GEMINI_API_KEY`, incurring billing charges or quota exhaustion.
- **Root Cause**: Direct client-side SDK and REST calls instead of a serverless backend proxy (e.g. Supabase Edge Functions or Netlify/Vercel serverless functions).

### Risk 3: Fragile Architecture with Zero Automated Test Coverage (HIGH)
- **Impact**: Any change to geometry calculations, timezones, or turn instruction parsing risks breaking the 1948-line `NavigationPage.jsx` in production without detection.
- **Root Cause**: Navigation math, GPS listeners, text-to-speech, and WebGL rendering are completely coupled inside a single React component with no separate headless route-monitor module.

### Risk 4: Unbuffered City-Wide Data Fetching & No Spam Throttling (MEDIUM)
- **Impact**: As community reports scale, downloading all statewide reports into memory on client mount causes network bloat and battery drain. Anonymous inserts without CAPTCHA or rate-limiting invite spam.

---

## 4. Unverified Items & Limitations

1. **TomTom Production Traffic Quota**: Could not test live TomTom Traffic Incidents API in production because the configured key is a client environment token, and `getTrafficIncidents` has never been invoked by any frontend component.
2. **Supabase Realtime Connection Limits**: Under free-tier Supabase, concurrent WebSocket connections are capped at 200. Scalability during a mass disaster event could not be verified in this sandbox environment.
3. **Hardware Accelerometer Sensor Accuracy**: Shake-to-SOS listener (`DeviceMotionEvent`) requires a physical mobile device with gyroscope/accelerometer hardware; synthetic browser emulation was used.

---

*End of Phase 1 Audit Report. Proceed to Phase 2 (Improvement Plan).*

