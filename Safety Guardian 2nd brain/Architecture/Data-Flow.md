# 🌊 Data Flow & Telemetry Pipelines

This document details the exact data flow across Safety Guardian's primary operations: navigation computation, community hazard syncing, and emergency telemetry.

---

## 🗺️ 1. Route Generation & Safety Evaluation Pipeline

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant SearchPage as SearchPage.jsx
    participant RouteStore as Zustand Store
    participant Router as tomtomRouting.js
    participant GoogleAPI as Google Routes v2
    participant SafetyEngine as safetyScore.js
    participant RouteUI as RouteSelectionPage.jsx

    User->>SearchPage: Type destination query ("Howrah Station")
    SearchPage->>RouteStore: setDestination(place)
    SearchPage->>RouteUI: Navigate to /routes
    RouteUI->>Router: getRoute(startLat, startLng, destLat, destLng, mode)
    
    alt Tier 1: Google Routes API
        Router->>GoogleAPI: POST /computeRoutes (traffic-aware)
        GoogleAPI-->>Router: Encoded Polylines & Step Guidance
    else Tier 2 / 3: TomTom or OSRM Fallback
        Router->>Router: Execute TomTom API or 4-Node OSRM Cluster
    end

    Router-->>RouteUI: Raw Routes Array
    RouteUI->>SafetyEngine: calculateRouteSafetyScores(routes, nearby, reports, crimes, floods, blackspots)
    SafetyEngine->>SafetyEngine: Point-to-segment Haversine risk math
    SafetyEngine-->>RouteUI: Scored Routes (Safest, Balanced, Fastest)
    RouteUI->>RouteStore: setRoutes(scoredRoutes)
    RouteUI->>User: Render Color-Coded Paths & Safety Badges
```

---

## 🚨 2. Emergency SOS Execution Pipeline

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant Sensor as Device Motion / Button
    participant EmergencyUI as EmergencyPage.jsx
    participant SOSService as sosService.js
    participant Firestore as Cloud Firestore (sos_events)
    participant CloudFunc as Cloud Function (processSOSEvent)
    participant Twilio as Twilio REST & TwiML API
    actor Contact as Primary Emergency Contact

    User->>Sensor: Shake phone 3x or Tap SOS Button
    Sensor->>EmergencyUI: Trigger SOS State
    EmergencyUI->>SOSService: createSOSEvent({ user, location, contacts, type })
    SOSService->>Firestore: addDoc("sos_events", eventDoc)
    Firestore-->>SOSService: Event ID (sosId)
    SOSService-->>EmergencyUI: Subscribe to onSnapshot(sosId)

    Firestore->>CloudFunc: onCreate Trigger (asia-south1)
    CloudFunc->>Firestore: Atomic Transaction (status -> 'processing')
    CloudFunc->>Twilio: Dispatch SMS to ALL Emergency Contacts
    Twilio-->>Contact: SMS with Google Maps Pin & Emergency Type
    CloudFunc->>Twilio: Initiate Voice Call to Contact #1 (Priority 1)
    Twilio-->>Contact: Voice Call with Synthesized TwiML Speech
    CloudFunc->>Firestore: Update Status ('completed', logs, timestamps)
    Firestore-->>EmergencyUI: Real-time UI updates (SMS Delivered, Call Active)
```
