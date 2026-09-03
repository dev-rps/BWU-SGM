# ⚡ AI & Developer Quick-Fix Index (Token-Saver)

> **Purpose**: This file is a deterministic **Problem-to-File lookup table**. When troubleshooting or adding features in the future, consult this table first to identify the exact files and functions to modify **without having to scan the entire codebase**, saving valuable context tokens.

---

## 🎯 Quick-Fix Routing Matrix

| Problem / User Request | Primary Code Files | Key Functions / Constants | Related Knowledge Notes |
| :--- | :--- | :--- | :--- |
| **"Routes showing fake/default distances (12km, etc.)"** | `src/services/tomtomRouting.js`<br>`src/services/googleRouting.js`<br>`src/pages/RouteSelection/RouteSelectionPage.jsx` | `getRoute()`<br>`getRouteFromGoogle()`<br>`getRouteFromOSRM()` | [[Routing-Overview]]<br>[[Google-Routes-Service]]<br>[[TomTom-Routing-Service]]<br>[[OSRM-Fallback-Cluster]] |
| **"Route alternatives list is not scrolling on mobile"** | `src/pages/RouteSelection/RouteSelectionPage.jsx` | Sheet wrapper (`h-[52vh] flex-col min-h-0`)<br>Scroll container (`flex: 1 1 0%, minHeight: 0`) | [[RouteSelectionPage]]<br>[[MainLayout]] |
| **"Safety score math is wrong / too low / too high"** | `src/services/safetyScore.js`<br>`src/constants/index.js` | `calculateRouteSafetyScores()`<br>`BASE_SCORE (96)`<br>`pointToSegmentMeters()` | [[Safety-Score-Engine]]<br>[[Environmental-Risk-Engine]]<br>[[Crime-Hotspots-Data]] |
| **"Missing shops, gullies, or places in search"** | `src/services/nominatim.js`<br>`src/pages/Search/SearchPage.jsx` | `searchPlaces()` (TomTom Search)<br>`countrySet: 'IN'` | [[nominatim-Service]]<br>[[SearchPage]]<br>[[TomTom-APIs]] |
| **"Map background is blank / tiles not loading"** | `src/pages/Home/HomePage.jsx`<br>`src/pages/RouteSelection/RouteSelectionPage.jsx`<br>`src/pages/Navigation/NavigationPage.jsx` | `<TileLayer url="https://mt1.google.com/..." />` | [[HomePage]]<br>[[RouteSelectionPage]]<br>[[Content-Security-Policy]] |
| **"SOS button not calling / SMS not sending"** | `src/services/sosService.js`<br>`functions/index.js` | `createSOSEvent()`<br>`processSOSEvent` (Cloud Function) | [[SOS-Architecture]]<br>[[Cloud-Functions-Gateway]]<br>[[Twilio-SMS-Voice-Pipeline]] |
| **"Shake phone does not trigger SOS on mobile"** | `src/hooks/useShakeSOS.js`<br>`src/App.jsx`<br>`src/pages/Permissions/PermissionsPage.jsx` | `DeviceMotionEvent` listener<br>`SHAKE_THRESHOLD = 25` | [[Shake-Detection-Hook]]<br>[[PermissionsPage]]<br>[[EmergencyPage]] |
| **"Momo chat not replying or says offline"** | `src/services/momoAI.js`<br>`src/pages/Chat/ChatPage.jsx` | `getBotReply()`<br>`detectLanguage()`<br>`detectEmergency()` | [[Momo-AI-Brain]]<br>[[Multilingual-NLP-Engine]]<br>[[ChatPage]] |
| **"Emergency contacts disappearing or not saving"** | `src/services/contactsService.js`<br>`firestore.rules` | `loadContacts(uid)`<br>`saveContact(uid, data)` | [[contactsService-Service]]<br>[[Firestore-Security-Rules]]<br>[[ProfilePage]] |
| **"Medical profile not saving / Paramedic view empty"** | `src/services/medicalService.js`<br>`src/services/medicalEmergency.js` | `saveMedicalProfile()`<br>`getParamedicEmergencySummary()` | [[Medical-Emergency-Profile]]<br>[[medicalService-Service]] |
| **"Weather or AQI not showing on Home screen"** | `src/services/weather.js`<br>`src/components/WeatherCard.jsx` | `getWeatherData()`<br>`getAirPollution()` | [[weather-Service]]<br>[[WeatherCard]]<br>[[OpenWeatherMap-API]] |
| **"Gamification badges / safety points not updating"** | `src/services/badgeService.js`<br>`src/pages/Profile/AchievementsPage.jsx` | `getUserBadgeProfile()`<br>`recordCompletedJourney()` | [[badgeService-Service]]<br>[[AchievementsPage]] |
| **"Firebase Auth / Login redirect loop"** | `src/App.jsx`<br>`src/context/store.js`<br>`src/pages/Login/LoginPage.jsx` | `PrivateRoute`<br>`onAuthStateChanged()` | [[Application-Lifecycle]]<br>[[State-Management]]<br>[[LoginPage]] |

---

## 🗺️ How to Use in Future AI Sessions

When asking an AI agent to fix a bug or add a feature, prefix your prompt with:
> *"Refer to `[[⚡-AI-and-Developer-Quick-Fix-Index]]` in the Obsidian Vault to locate the exact service, component, and data flow before implementing changes."*
