# 🏗️ Architecture Overview

The **Safety Guardian** architecture is designed around a single core principle: **Safety-First Real-Time Navigation**. Unlike conventional mapping applications that optimize purely for travel duration or shortest Euclidean distance, Safety Guardian integrates real-time risk modeling, multi-tier redundant routing, offline AI assistance, and immediate emergency telemetry.

---

## 📐 Technology Stack Summary

| Layer | Technologies | Key Responsibilities |
| :--- | :--- | :--- |
| **Frontend Framework** | React 19, Vite 8 | Single Page Application (SPA) runtime, fast HMR, optimized production asset bundling. |
| **State Management** | Zustand 5 (`src/context/store.js`) | Centralized reactive store for user session, active coordinates, route alternatives, and live telemetry. |
| **Styling & Design System** | Tailwind CSS 4, Stitch UI tokens | Modern, clean UI inspired by Google Maps and Material 3 design systems. |
| **Mapping Engine** | Leaflet 1.9, React-Leaflet 5, Google Tile Server | High-performance interactive map canvas, custom polyline renderers, marker clusters, hazard circles. |
| **Routing Cluster** | Google Routes API v2, TomTom Routing API, OSRM Multi-node | 3-tier cascaded navigation engine guaranteeing 99.99% uptime and turn-by-turn maneuvers. |
| **Backend & Database** | Firebase Cloud Firestore, Firebase Auth (v12) | Real-time NoSQL database for community reports, user profiles, medical surveys, and SOS event streams. |
| **Serverless Functions** | Node.js Firebase Cloud Functions (`functions/index.js`) | Asynchronous event processing in region `asia-south1` (Mumbai), atomic transactions, Twilio telephony dispatcher. |
| **Telephony Gateway** | Twilio REST API + TwiML Voice Engine | Automated SMS broadcasting and voice call synthesis for emergency contacts. |
| **Edge AI & NLP** | Momo AI Engine (`src/services/momoAI.js`) + Google Gemini SDK | 100% offline local conversational assistant supporting 10 Indian scripts with fallback to cloud LLM. |

---

## 🔗 Deep Architecture Links
- [[Application-Lifecycle]] — Startup, authentication gates, and route transitions.
- [[Component-Tree]] — Complete hierarchy of UI components and pages.
- [[State-Management]] — Zustand store slices, actions, and reactivity.
- [[Data-Flow]] — Data pipelines for GPS navigation, safety scoring, and emergency telemetry.
- [[Dashboard]] — Back to Vault Dashboard.
