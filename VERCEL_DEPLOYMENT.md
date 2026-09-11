# 🚀 Vercel Deployment & Production Readiness Guide

This project (**Safety Guardian — West Bengal**) is **100% production-ready** for one-click deployment to [Vercel](https://vercel.com). All Firebase services have been retired and fully replaced by **Supabase PostgreSQL & Auth**.

---

## 1. Quick Deploy Steps

### Option A: Via Vercel Dashboard (Recommended)
1. Push this repository to **GitHub** / **GitLab** / **Bitbucket**.
2. Go to [vercel.com/new](https://vercel.com/new) and import your repository.
3. In **Build and Output Settings**:
   - **Framework Preset**: `Vite` (automatically detected)
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
   - **Install Command**: `npm install`
4. Under **Environment Variables**, paste the keys from your local `.env` (detailed in Section 2).
5. Click **Deploy**.

### Option B: Via Vercel CLI
```bash
# 1. Install Vercel CLI if not already installed
npm install -g vercel

# 2. Deploy directly from repository root
vercel
```

---

## 2. Required Environment Variables on Vercel

In your Vercel Project Settings under **Environment Variables**, add the following:

| Variable Name | Description | Source / Reference |
|---|---|---|
| `VITE_SUPABASE_URL` | Remote Supabase project URL | Copy from `.env` (`https://<project-ref>.supabase.co`) |
| `VITE_SUPABASE_ANON_KEY` | Supabase Anon Public Key (safe for client) | Copy from `.env` |
| `VITE_TOMTOM_API_KEY` | TomTom Traffic, Search & Route Calculation | Copy from `.env` |
| `VITE_OPENWEATHER_API_KEY` | Real-time Weather & Precipitation | Copy from `.env` |
| `VITE_GEMINI_API_KEY` | Google Gemini AI Safety Assistant | Copy from `.env` |
| `VITE_ML_API_URL` | Geospatial Python ML Model Endpoint | Render URL (or omit for frontend fallback) |
| `VITE_GOOGLE_MAPS_API_KEY` | Google Maps Tiles (Optional) | Optional (leave empty if not using Google Tiles) |

---

## 3. Pre-configured Vercel Features

- **SPA Direct Routing**: `vercel.json` contains regex rewrites so direct navigation to any subroute (`/route`, `/emergency`, `/reports`, `/profile`, `/chat`, etc.) renders `index.html` without 404 errors.
- **Serverless API Proxy**: `api/overpass.js` proxies OpenStreetMap Overpass queries server-side to prevent CORS issues on client devices.
- **Worker & Shared MIME Headers**: `vercel.json` serves `maplibre-gl-worker.mjs` with immutable caching and proper `application/javascript; charset=utf-8` MIME headers.
- **Content-Security-Policy**: `index.html` includes `https://*.supabase.co` and `wss://*.supabase.co` to ensure WebSockets, Auth, and Realtime queries work smoothly in production.

---

## 4. Verification Checklist

- [x] Firebase SDK uninstalled from `package.json` (`firebase: ^12.x` removed).
- [x] Zero references to `firebase` in `src/`.
- [x] All 12 Supabase tables created and validated on remote PostgreSQL.
- [x] 10 seed hazard spots loaded into `hazard_reports`.
- [x] Production build passes cleanly: `npm run build` completed with zero errors.
