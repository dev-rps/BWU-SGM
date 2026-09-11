# Deployment & Linking Guide: Render (ML Engine) & Vercel (Frontend)

This guide walks you through deploying the Python FastAPI Geospatial ML engine to **Render** and connecting it with your **Vercel** frontend deployment.

---

## Architecture Overview

```
 ┌───────────────────────────┐                ┌───────────────────────────────┐
 │       Vercel (React)      │                │        Render (FastAPI)       │
 │   Safety Guardian Client  │                │      Geospatial ML Engine     │
 │                           │ ─────────────> │                               │
 │  • MapLibre & Leaflet     │  HTTPS POST    │  • BallTree Haversine Queries │
 │  • Turn-by-Turn Nav       │  /predict/routes│ • Random Forest & GBR         │
 │  • Environmental Weights  │                │  • Crime/Flood/Accident trees │
 └───────────────────────────┘                └───────────────────────────────┘
```

---

## Part 1: Deploying the ML Model to Render

Render offers free hosting for Python web services and automatically builds and deploys from GitHub.

### Method A: Blueprint Deployment (Automatic / 1-Click)
We have included a `render.yaml` Blueprint in the repository.
1. Log in to [Render Dashboard](https://dashboard.render.com).
2. Click **New +** → **Blueprint**.
3. Select your GitHub repository (`dev-rps/BWU-SGM` or your fork).
4. Render will automatically read `render.yaml` and configure:
   - **Name**: `safety-guardian-ml`
   - **Runtime**: Python 3.11
   - **Root Directory**: `ml_model`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`
   - **Health Check Path**: `/health`
5. Click **Apply**. Render will install all dependencies, build the BallTrees, load `model.pkl`, and start the service!

---

### Method B: Manual Web Service Deployment
If you prefer creating the Web Service manually:
1. Log in to [Render](https://dashboard.render.com).
2. Click **New +** → **Web Service**.
3. Connect your Git repository.
4. Fill in the configuration details:
   - **Name**: `safety-guardian-ml` (or any name you choose)
   - **Region**: Choose the closest region (e.g. `Singapore` or `Oregon`)
   - **Branch**: `main` (or your current branch)
   - **Root Directory**: `ml_model`
   - **Runtime**: `Python 3`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`
   - **Instance Type**: `Free`
5. Click **Advanced**:
   - Add Environment Variable:
     - **Key**: `PYTHON_VERSION`
     - **Value**: `3.11.9`
   - Health Check Path: `/health`
6. Click **Deploy Web Service**.
7. Once deployed, Render will provide a public URL, for example:
   ```
   https://safety-guardian-ml.onrender.com
   ```

---

## Part 2: Linking Render ML Service to Vercel

Once your Render service is live:

1. Log in to your [Vercel Dashboard](https://vercel.com).
2. Select your **Safety Guardian** project.
3. Go to **Settings** → **Environment Variables**.
4. Add a new variable:
   - **Key**: `VITE_ML_API_URL`
   - **Value**: Your Render URL (e.g. `https://safety-guardian-ml.onrender.com` — *no trailing slash*)
   - **Environments**: Select `Production`, `Preview`, and `Development`.
5. Click **Save**.
6. Trigger a redeployment:
   - Go to **Deployments** tab.
   - Click the three dots `...` on your latest deployment → **Redeploy**.
   *(Because Vite embeds environment variables at build time, redeploying ensures `VITE_ML_API_URL` is baked into the production bundle).*

---

## Part 3: Local Development Linking

When running locally:
1. In `.env`:
   ```env
   VITE_ML_API_URL=http://127.0.0.1:8000
   ```
2. Start the ML backend:
   ```powershell
   python -m uvicorn ml_model.main:app --port 8000 --reload
   ```
3. In another terminal, start the Vite frontend:
   ```powershell
   npm run dev
   ```

---

## Part 4: Verification & Health Check

1. **Verify Render Backend**:
   Visit `https://<your-render-app>.onrender.com/health` in your browser. You should see:
   ```json
   {
     "status": "ok",
     "service": "Safety Guardian Geospatial ML",
     "version": "2.0.0",
     "spatial_indexing": "BallTree-Haversine",
     "hazards_loaded": {
       "crime_hotspots": 52,
       "accident_blackspots": 45,
       "flood_zones": 38,
       "disaster_zones": 24
     }
   }
   ```
2. **Verify Frontend Route Scoring**:
   - Open the web app on Vercel or locally.
   - Search for any destination (e.g. *Airport*, *Howrah*, *Salt Lake*).
   - Candidate routes will show the **⚡ ML Evaluated** badge with actual continuous safety scores, bottleneck checkpoint alerts, and data-backed explainability reasons.
   - Select any route and tap **Start Journey** to carry the evaluated safety corridor into active navigation.

> [!NOTE]
> **Render Free Tier Spin-Down**:
> On Render's free tier, services spin down after 15 minutes of inactivity. When a request arrives, it may take 30–50 seconds to wake up (cold start).
> Our frontend is designed with **zero-freeze resiliency**: if Render is spinning up, the client immediately uses the built-in dataset-backed spatial fallback and then seamlessly upgrades to full ML scores as soon as the service responds.
