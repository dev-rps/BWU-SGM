/**

 * src/pages/MLPlayground/MLPlaygroundPage.jsx

 *

 * Production-Grade AI Diagnostic Dashboard

 * Hidden Route: /dev/model-test

 *

 * Layout:  [Left Sidebar: Controls] | [Center: MapLibre] | [Right Panel: Diagnostics]

 *

 * Features:

 *  - 3-pane split layout with glassmorphism aesthetic

 *  - Click-to-drop waypoints on MapLibre map

 *  - Segment-level color-coded risk polyline (GeoJSON FeatureCollection)

 *  - SVG circular safety-score gauge with animated stroke-dashoffset

 *  - Reasoning factors rendered as pills

 *  - Skeleton loaders during inference

 *  - Collapsible, syntax-highlighted Raw JSON Inspector

 *  - Graceful offline banner with retry

 */



import React, {

  useState,

  useEffect,

  useCallback,

  useMemo,

  useRef,

} from "react";

import Map, {

  Source,

  Layer,

  Marker,

  NavigationControl,

} from "react-map-gl/maplibre";

import { setWorkerUrl } from "maplibre-gl";

import "maplibre-gl/dist/maplibre-gl.css";

import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";



import { mapProvider } from "../../services/mapProvider";

import {

  evaluateRouteSafety,

  checkMLHealth,

  fetchModelMetadata,

} from "../../services/mlService";



if (typeof window !== "undefined") {

  setWorkerUrl(workerUrl);

}



// ── Constants ─────────────────────────────────────────────────────────────────



const PRESET_ROUTES = [

  {

    id: "em-bypass",

    name: "EM Bypass",

    icon: "🛣️",

    description: "Arterial corridor crossing Chingrighata collision blackspot",

    tag: "HIGH RISK",

    tagColor: "rose",

    waypoints: [

      [22.568, 88.405],

      [22.563, 88.402],

      [22.544, 88.395],

      [22.513, 88.398],

    ],

    initialView: { latitude: 22.545, longitude: 88.4, zoom: 12.8 },

  },

  {

    id: "burrabazar",

    name: "Burrabazar",

    icon: "🏙️",

    description: "High-density commercial market with active crime hotspot",

    tag: "MED RISK",

    tagColor: "amber",

    waypoints: [

      [22.5839, 88.3423],

      [22.5765, 88.3638],

      [22.5645, 88.3551],

    ],

    initialView: { latitude: 22.575, longitude: 88.353, zoom: 14.0 },

  },

  {

    id: "new-town",

    name: "New Town",

    icon: "🌆",

    description: "Well-planned suburban corridor with modern infrastructure",

    tag: "LOW RISK",

    tagColor: "emerald",

    waypoints: [

      [22.57, 88.425],

      [22.583, 88.472],

      [22.595, 88.485],

    ],

    initialView: { latitude: 22.583, longitude: 88.455, zoom: 13.0 },

  },

  {

    id: "digha",

    name: "Digha Coast",

    icon: "🌊",

    description: "Coastal highway exposed to storm surge and flood zones",

    tag: "FLOOD ZONE",

    tagColor: "blue",

    waypoints: [

      [21.6266, 87.5074],

      [21.65, 87.54],

      [21.778, 87.751],

    ],

    initialView: { latitude: 21.68, longitude: 87.6, zoom: 11.0 },

  },

];



const WEATHER_OPTIONS = [

  { id: "clear",  label: "Clear",  icon: "☀️",  severity: 0, temp: 28, visibility: 10000 },

  { id: "clouds", label: "Cloudy", icon: "⛅",         severity: 1, temp: 26, visibility: 8000  },

  { id: "fog",    label: "Foggy",  icon: "🌫️", severity: 2, temp: 16, visibility: 1200  },

  { id: "rain",   label: "Rain",   icon: "🌧️", severity: 3, temp: 22, visibility: 3500  },

  { id: "storm",  label: "Storm",  icon: "⛈️",  severity: 4, temp: 20, visibility: 1500  },

];



const LIGHTING_OPTIONS = [

  { id: "daylight",   label: "Daylight",   icon: "☀️"  },

  { id: "well_lit",   label: "Well-Lit",   icon: "💡"  },

  { id: "poorly_lit", label: "Poorly Lit", icon: "🕯️" },

  { id: "dark",       label: "Dark",       icon: "🌑"  },

];



const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];



// ── Helpers ───────────────────────────────────────────────────────────────────



function scoreToColor(score) {

  if (score == null) return "#3B82F6";

  if (score >= 78) return "#10B981";

  if (score >= 58) return "#F59E0B";

  if (score >= 38) return "#F97316";

  return "#EF4444";

}



function buildSegmentGeoJson(mlResult, waypoints) {

  if (!mlResult || !waypoints || waypoints.length < 2) return null;

  const segmentCount = waypoints.length - 1;

  const perSegmentScores = mlResult.segment_scores ?? [];

  const features = [];

  for (let i = 0; i < segmentCount; i++) {

    const [lat1, lng1] = waypoints[i];

    const [lat2, lng2] = waypoints[i + 1];

    const segScore = perSegmentScores[i] ?? mlResult.safety_score;

    features.push({

      type: "Feature",

      properties: { color: scoreToColor(segScore), score: segScore },

      geometry: {

        type: "LineString",

        coordinates: [[lng1, lat1], [lng2, lat2]],

      },

    });

  }

  return { type: "FeatureCollection", features };

}



// ── SVG Circular Gauge ────────────────────────────────────────────────────────



function CircularGauge({ score, riskLevel }) {

  const radius = 52;

  const stroke = 10;

  const circ = 2 * Math.PI * radius;

  const pct = score != null ? score / 100 : 0;

  const offset = circ * (1 - pct);

  const color = scoreToColor(score);



  return (

    <div className="flex flex-col items-center justify-center">

      <svg width="136" height="136" className="drop-shadow-xl" aria-label={`Safety score: ${score}`}>

        <circle cx="68" cy="68" r={radius} fill="none" stroke="#1E293B" strokeWidth={stroke} />

        <circle cx="68" cy="68" r={radius} fill="none" stroke={color} strokeWidth={stroke + 6} strokeOpacity="0.08" />

        <circle

          cx="68" cy="68" r={radius}

          fill="none"

          stroke={color}

          strokeWidth={stroke}

          strokeLinecap="round"

          strokeDasharray={circ}

          strokeDashoffset={offset}

          transform="rotate(-90 68 68)"

          style={{ transition: "stroke-dashoffset 0.7s cubic-bezier(0.4,0,0.2,1), stroke 0.4s ease" }}

        />

        <text x="68" y="62" textAnchor="middle" fill="white" fontSize="26" fontWeight="900" fontFamily="monospace">

          {score ?? "—"}

        </text>

        <text x="68" y="80" textAnchor="middle" fill="#94A3B8" fontSize="10" fontFamily="monospace">

          / 100

        </text>

      </svg>

      <span

        className="mt-1 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest border"

        style={{ color, borderColor: color + "55", background: color + "18" }}

      >

        {riskLevel ?? "—"} Risk

      </span>

    </div>

  );

}



// ── Skeleton Loaders ──────────────────────────────────────────────────────────



function Skeleton({ className = "" }) {

  return <div className={`bg-slate-700/50 rounded-lg animate-pulse ${className}`} />;

}



function DiagnosticsSkeleton() {

  return (

    <div className="space-y-4 p-1">

      <div className="flex justify-center"><Skeleton className="w-36 h-36 rounded-full" /></div>

      <Skeleton className="h-4 w-3/4 mx-auto" />

      <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-6 w-full" />)}</div>

      <div className="space-y-1.5">{[1,2,3,4].map(i => <Skeleton key={i} className="h-8 w-full" />)}</div>

    </div>

  );

}



// ── Reason Pills ──────────────────────────────────────────────────────────────



function ReasonPill({ text }) {

  const isPositive = /good|safe|low|clear|well.lit|modern|plan/i.test(text);

  const isWarning  = /moderate|medium|some|light/i.test(text);

  const colorClass = isPositive

    ? "bg-emerald-950/60 text-emerald-300 border-emerald-700/50"

    : isWarning

    ? "bg-amber-950/60 text-amber-300 border-amber-700/50"

    : "bg-rose-950/60 text-rose-300 border-rose-700/50";

  const icon = isPositive ? "✅" : isWarning ? "⚠️" : "🔴";

  return (

    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border ${colorClass}`}>

      <span className="text-[10px]">{icon}</span>

      {text}

    </span>

  );

}



// ── Syntax Highlight JSON ─────────────────────────────────────────────────────



function SyntaxJson({ json }) {

  const highlighted = JSON.stringify(json, null, 2)

    .replace(/&/g, "&amp;")

    .replace(/</g, "&lt;")

    .replace(/>/g, "&gt;")

    .replace(

      /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,

      (match) => {

        let cls = "text-blue-300";

        if (/^"/.test(match)) {

          cls = /:$/.test(match) ? "text-violet-300" : "text-emerald-300";

        } else if (/true|false/.test(match)) {

          cls = "text-amber-300";

        } else if (/null/.test(match)) {

          cls = "text-slate-400";

        }

        return `<span class="${cls}">${match}</span>`;

      }

    );

  return (

    <pre

      className="text-[10px] font-mono leading-relaxed overflow-auto max-h-72"

      dangerouslySetInnerHTML={{ __html: highlighted }}

    />

  );

}



// ── Feature Importance Bar ────────────────────────────────────────────────────



function ImportanceBar({ label, value }) {

  const pct = (value * 100).toFixed(1);

  return (

    <div className="space-y-0.5">

      <div className="flex justify-between text-[11px]">

        <span className="text-slate-400 font-mono truncate max-w-[160px]">{label}</span>

        <span className="text-blue-400 font-bold font-mono">{pct}%</span>

      </div>

      <div className="h-1.5 bg-slate-700/60 rounded-full overflow-hidden">

        <div

          className="h-full bg-gradient-to-r from-blue-600 to-indigo-500 rounded-full transition-all duration-700"

          style={{ width: `${Math.min(Number(pct) * 5, 100)}%` }}

        />

      </div>

    </div>

  );

}



// ── Main Component ────────────────────────────────────────────────────────────



export default function MLPlaygroundPage() {

  const mapRef = useRef(null);



  const [waypoints, setWaypoints] = useState(PRESET_ROUTES[0].waypoints);

  const [viewState, setViewState] = useState(PRESET_ROUTES[0].initialView);

  const [activePresetId, setActivePresetId] = useState(PRESET_ROUTES[0].id);



  const [hour, setHour] = useState(14);

  const [dayOfWeek, setDayOfWeek] = useState(2);

  const [selectedWeather, setSelectedWeather] = useState(WEATHER_OPTIONS[0]);

  const [selectedLighting, setSelectedLighting] = useState(LIGHTING_OPTIONS[0]);

  const [temperature, setTemperature] = useState(28);

  const [visibility, setVisibility] = useState(10000);



  const [mlResult, setMlResult] = useState(null);

  const [loading, setLoading] = useState(false);

  const [error, setError] = useState(null);

  const [isServerOnline, setIsServerOnline] = useState(null);

  const [modelMeta, setModelMeta] = useState(null);

  const [copiedJson, setCopiedJson] = useState(false);

  const [showJsonInspector, setShowJsonInspector] = useState(false);



  const checkHealth = useCallback(async () => {

    const health = await checkMLHealth();

    setIsServerOnline(health.online);

    if (health.online && !modelMeta) {

      const meta = await fetchModelMetadata();

      if (meta) setModelMeta(meta);

    }

  }, [modelMeta]);



  useEffect(() => {

    checkHealth();

    const timer = setInterval(checkHealth, 10000);

    return () => clearInterval(timer);

  }, [checkHealth]);



  const handleHourChange = (h) => {

    setHour(h);

    const isNight = h < 6 || h >= 20;

    if (isNight && selectedLighting.id === "daylight") setSelectedLighting(LIGHTING_OPTIONS[1]);

    else if (!isNight && (selectedLighting.id === "dark" || selectedLighting.id === "poorly_lit")) setSelectedLighting(LIGHTING_OPTIONS[0]);

  };



  const runEvaluation = useCallback(async () => {

    if (!waypoints || waypoints.length < 1) return;

    setLoading(true);

    setError(null);

    try {

      const res = await evaluateRouteSafety({

        waypoints, hour, dayOfWeek,

        weather: { condition: selectedWeather.id, temperature, visibility },

        lighting: selectedLighting.id,

      });

      setMlResult(res);

      setIsServerOnline(true);

    } catch (err) {

      setError(err.message || "Failed to connect to Python FastAPI ML backend.");

      setIsServerOnline(false);

    } finally {

      setLoading(false);

    }

  }, [waypoints, hour, dayOfWeek, selectedWeather, selectedLighting, temperature, visibility]);



  useEffect(() => {

    const t = setTimeout(runEvaluation, 280);

    return () => clearTimeout(t);

  }, [runEvaluation]);



  const handleMapClick = useCallback((e) => {

    const { lng, lat } = e.lngLat;

    setWaypoints((prev) => [...prev, [lat, lng]]);

    setActivePresetId(null);

  }, []);



  const applyPreset = (preset) => {

    setWaypoints(preset.waypoints);

    setViewState(preset.initialView);

    setActivePresetId(preset.id);

    setMlResult(null);

    if (mapRef.current) {

      mapRef.current.flyTo({

        center: [preset.initialView.longitude, preset.initialView.latitude],

        zoom: preset.initialView.zoom,

        duration: 1200,

      });

    }

  };



  const clearWaypoints = () => {

    setWaypoints([]);

    setMlResult(null);

    setActivePresetId(null);

  };



  const segmentGeoJson = useMemo(

    () => buildSegmentGeoJson(mlResult, waypoints),

    [mlResult, waypoints]

  );



  const plainPolyGeoJson = useMemo(() => {

    if (!waypoints || waypoints.length < 2 || segmentGeoJson) return null;

    return {

      type: "Feature",

      geometry: { type: "LineString", coordinates: waypoints.map(([lat, lng]) => [lng, lat]) },

    };

  }, [waypoints, segmentGeoJson]);



  const handleCopyJson = () => {

    if (!mlResult) return;

    navigator.clipboard.writeText(JSON.stringify(mlResult, null, 2));

    setCopiedJson(true);

    setTimeout(() => setCopiedJson(false), 2000);

  };



  const timeIcon   = hour >= 6 && hour < 19 ? "☀️" : "🌙";

  const timeLabel  = `${String(hour).padStart(2, "0")}:00`;

  const timePeriod = hour < 6 ? "Night" : hour < 12 ? "Morning" : hour < 18 ? "Afternoon" : hour < 20 ? "Evening" : "Night";



  const TAG_COLORS = {

    rose:    "text-rose-400 border-rose-500/40 bg-rose-500/10",

    amber:   "text-amber-400 border-amber-500/40 bg-amber-500/10",

    emerald: "text-emerald-400 border-emerald-500/40 bg-emerald-500/10",

    blue:    "text-blue-400 border-blue-500/40 bg-blue-500/10",

  };



  return (

    <div className="flex flex-col h-screen w-screen bg-slate-950 text-slate-100 overflow-hidden" style={{ fontFamily: "'Inter', 'Segoe UI', sans-serif" }}>



      {/* Nav Bar */}

      <header className="h-14 bg-slate-900/90 backdrop-blur-md border-b border-slate-800/80 px-5 flex items-center justify-between z-40 shrink-0 shadow-lg">

        <div className="flex items-center gap-3">

          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-emerald-500 flex items-center justify-center font-black text-white text-sm shadow-lg shadow-blue-500/30">

            ML

          </div>

          <div>

            <div className="flex items-center gap-2">

              <span className="font-bold text-sm tracking-wide text-white">Geospatial AI Playground</span>

              <span className="px-2 py-0.5 text-[10px] font-mono rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/25">v2.0 · BallTree</span>

            </div>

            <p className="text-[11px] text-slate-400 leading-none mt-0.5">Spatial-temporal route safety · RandomForest + GBR</p>

          </div>

        </div>

        <div className="flex items-center gap-3">

          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-all duration-300 ${

            isServerOnline === null ? "bg-slate-800 border-slate-700 text-slate-400"

            : isServerOnline ? "bg-emerald-950/70 border-emerald-600/40 text-emerald-400"

            : "bg-rose-950/70 border-rose-600/40 text-rose-400"

          }`}>

            <span className={`w-2 h-2 rounded-full ${

              isServerOnline === null ? "bg-slate-500 animate-pulse"

              : isServerOnline ? "bg-emerald-400 animate-pulse"

              : "bg-rose-500"

            }`} />

            {isServerOnline === null ? "Connecting…" : isServerOnline ? "FastAPI :8000 Online" : "FastAPI Offline"}

          </div>

          <a href="/" className="text-xs text-slate-400 hover:text-white px-3 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 border border-slate-700/60 transition">← Exit to App</a>

        </div>

      </header>



      {/* Offline Banner */}

      {isServerOnline === false && (

        <div className="bg-rose-950/90 border-b border-rose-800/80 px-4 py-2.5 flex items-center justify-between text-xs text-rose-200 z-40 shrink-0 backdrop-blur">

          <div className="flex items-center gap-2.5">

            <span className="text-base flex-shrink-0">⚠️</span>

            <span>

              <strong className="text-rose-100">Python ML Service Unreachable.</strong>{" "}

              Run{" "}

              <code className="bg-rose-900/60 px-1.5 py-0.5 rounded font-mono text-rose-100 text-[11px]">

                python -m uvicorn ml_model.main:app --port 8000

              </code>{" "}

              to start the FastAPI inference server.

            </span>

          </div>

          <button onClick={checkHealth} className="ml-4 px-3 py-1.5 bg-rose-700 hover:bg-rose-600 text-white rounded-lg font-medium transition flex-shrink-0 cursor-pointer">

            Retry

          </button>

        </div>

      )}



      {/* 3-Pane Layout */}

      <div className="flex flex-1 overflow-hidden min-h-0">



        {/* LEFT SIDEBAR */}

        <aside className="w-72 bg-slate-900/95 backdrop-blur border-r border-slate-800/70 flex flex-col overflow-y-auto shrink-0 z-20">



          {/* Route Presets */}

          <div className="p-4 border-b border-slate-800/60">

            <div className="flex items-center justify-between mb-3">

              <h2 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Route Presets</h2>

              <button onClick={clearWaypoints} className="text-[10px] px-2 py-1 rounded bg-rose-900/40 hover:bg-rose-700/60 text-rose-400 hover:text-rose-200 border border-rose-800/50 transition cursor-pointer font-medium">

                Clear Route

              </button>

            </div>

            <div className="space-y-2">

              {PRESET_ROUTES.map((p) => (

                <button

                  key={p.id}

                  onClick={() => applyPreset(p)}

                  className={`w-full text-left p-3 rounded-xl border transition-all duration-200 cursor-pointer ${

                    activePresetId === p.id

                      ? "bg-blue-600/15 border-blue-500/50 shadow-md shadow-blue-500/10"

                      : "bg-slate-800/50 border-slate-700/60 hover:bg-slate-800 hover:border-slate-600"

                  }`}

                >

                  <div className="flex items-center justify-between mb-1">

                    <span className="flex items-center gap-1.5 text-sm font-semibold text-white">

                      <span>{p.icon}</span>{p.name}

                    </span>

                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wider ${TAG_COLORS[p.tagColor]}`}>

                      {p.tag}

                    </span>

                  </div>

                  <p className="text-[11px] text-slate-400 leading-snug">{p.description}</p>

                </button>

              ))}

            </div>

            <p className="text-[10px] text-slate-500 mt-2.5 text-center">

              💡 Click map to add custom waypoints · {waypoints.length} pts loaded

            </p>

          </div>



          {/* Time + Day */}

          <div className="p-4 border-b border-slate-800/60">

            <div className="flex items-center justify-between mb-3">

              <h2 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">

                <span>{timeIcon}</span> Time of Day

              </h2>

              <span className="text-xs font-mono font-bold text-blue-400 bg-blue-950/60 px-2 py-0.5 rounded-lg border border-blue-500/20">

                {timeLabel} <span className="text-blue-300/60 font-normal">({timePeriod})</span>

              </span>

            </div>

            <input

              type="range" min="0" max="23" value={hour}

              onChange={(e) => handleHourChange(parseInt(e.target.value))}

              className="w-full h-2 rounded-full appearance-none cursor-pointer accent-blue-500 bg-slate-700"

            />

            <div className="grid grid-cols-5 text-[9px] text-slate-500 mt-1.5 font-mono">

              {["00","06","12","18","23"].map(t => <span key={t} className="text-center">{t}h</span>)}

            </div>

            <div className="mt-4">

              <div className="flex items-center justify-between mb-1.5">

                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Day of Week</span>

                <span className="text-[10px] text-slate-500 font-mono">{dayOfWeek >= 5 ? "Weekend" : "Weekday"}</span>

              </div>

              <div className="grid grid-cols-7 gap-0.5">

                {DAYS.map((d, i) => (

                  <button key={d} onClick={() => setDayOfWeek(i)}

                    className={`text-[11px] py-1.5 rounded text-center transition font-medium cursor-pointer border ${

                      dayOfWeek === i

                        ? "bg-indigo-600 text-white border-indigo-400"

                        : "bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700 hover:text-slate-200"

                    }`}

                  >

                    {d.substring(0, 1)}

                  </button>

                ))}

              </div>

              <div className="text-center text-[10px] text-slate-500 mt-0.5">{DAYS[dayOfWeek]}</div>

            </div>

          </div>



          {/* Weather */}

          <div className="p-4 border-b border-slate-800/60">

            <h2 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-3">Weather Condition</h2>

            <div className="grid grid-cols-5 gap-1">

              {WEATHER_OPTIONS.map((w) => (

                <button key={w.id}

                  onClick={() => { setSelectedWeather(w); setTemperature(w.temp); setVisibility(w.visibility); }}

                  title={w.label}

                  className={`flex flex-col items-center py-2 px-1 rounded-lg text-center transition cursor-pointer border ${

                    selectedWeather.id === w.id

                      ? "bg-blue-600/20 border-blue-500/60 text-white"

                      : "bg-slate-800/60 border-slate-700/50 text-slate-400 hover:bg-slate-700/60 hover:text-slate-200"

                  }`}

                >

                  <span className="text-lg leading-none">{w.icon}</span>

                  <span className="text-[9px] mt-1 font-medium">{w.label}</span>

                </button>

              ))}

            </div>

            <div className="grid grid-cols-2 gap-2 mt-3">

              <div className="bg-slate-800/50 rounded-lg p-2 border border-slate-700/40 text-center">

                <div className="text-[9px] text-slate-400 uppercase tracking-wider mb-0.5">Temp</div>

                <div className="text-sm font-bold font-mono text-orange-300">{temperature}\u00b0C</div>

              </div>

              <div className="bg-slate-800/50 rounded-lg p-2 border border-slate-700/40 text-center">

                <div className="text-[9px] text-slate-400 uppercase tracking-wider mb-0.5">Visibility</div>

                <div className="text-sm font-bold font-mono text-sky-300">

                  {visibility >= 1000 ? `${(visibility / 1000).toFixed(1)}km` : `${visibility}m`}

                </div>

              </div>

            </div>

          </div>



          {/* Lighting */}

          <div className="p-4">

            <h2 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-3">Lighting Condition</h2>

            <div className="grid grid-cols-2 gap-1.5">

              {LIGHTING_OPTIONS.map((l) => (

                <button key={l.id} onClick={() => setSelectedLighting(l)}

                  className={`flex items-center gap-2 px-2.5 py-2 rounded-lg text-left text-xs transition cursor-pointer border font-medium ${

                    selectedLighting.id === l.id

                      ? "bg-emerald-600/20 border-emerald-500/60 text-emerald-300"

                      : "bg-slate-800/50 border-slate-700/50 text-slate-400 hover:bg-slate-700/60 hover:text-slate-200"

                  }`}

                >

                  <span className="text-base leading-none">{l.icon}</span>

                  <span>{l.label}</span>

                </button>

              ))}

            </div>

          </div>

        </aside>



        {/* CENTER MAP */}

        <main className="flex-1 relative min-w-0">

          <Map

            ref={mapRef}

            {...viewState}

            onMove={(evt) => setViewState(evt.viewState)}

            mapStyle={mapProvider.getMapLibreStyle()}

            onClick={handleMapClick}

            attributionControl={false}

            cursor="crosshair"

          >

            <NavigationControl position="bottom-right" showCompass />



            {segmentGeoJson && (

              <Source id="route-segments" type="geojson" data={segmentGeoJson}>

                <Layer id="segments-casing" type="line" paint={{ "line-color": ["get","color"], "line-width": 12, "line-opacity": 0.18, "line-blur": 4 }} />

                <Layer id="segments-line" type="line" paint={{ "line-color": ["get","color"], "line-width": 5, "line-cap": "round", "line-join": "round" }} />

              </Source>

            )}



            {plainPolyGeoJson && (

              <Source id="route-plain" type="geojson" data={plainPolyGeoJson}>

                <Layer id="route-plain-line" type="line" paint={{ "line-color": "#3B82F6", "line-width": 4, "line-opacity": 0.6, "line-dasharray": [2, 2] }} />

              </Source>

            )}



            {waypoints.map(([lat, lng], idx) => (

              <Marker key={`wp-${idx}-${lat}-${lng}`} latitude={lat} longitude={lng} anchor="center">

                <div

                  className={`flex items-center justify-center rounded-full font-black text-white shadow-xl border-2 transition-transform hover:scale-110 ${

                    idx === 0

                      ? "w-7 h-7 text-xs bg-emerald-500 border-white shadow-emerald-500/40"

                      : idx === waypoints.length - 1

                      ? "w-7 h-7 text-xs bg-rose-500 border-white shadow-rose-500/40"

                      : "w-5 h-5 text-[9px] bg-blue-500 border-slate-800 shadow-blue-500/30"

                  }`}

                  title={idx === 0 ? "Start" : idx === waypoints.length - 1 ? "End" : `Waypoint ${idx}`}

                >

                  {idx === 0 ? "S" : idx === waypoints.length - 1 ? "E" : idx}

                </div>

              </Marker>

            ))}



            {mlResult?.bottleneck && (

              <Marker latitude={mlResult.bottleneck.lat} longitude={mlResult.bottleneck.lng} anchor="bottom">

                <div className="flex flex-col items-center animate-bounce">

                  <div className="px-2 py-1 rounded-lg bg-rose-600/90 backdrop-blur border border-rose-400/50 text-[10px] font-bold text-white shadow-lg shadow-rose-500/30 whitespace-nowrap">

                    ⚠️ Risk Bottleneck · {mlResult.bottleneck.safety_score}

                  </div>

                  <div className="w-2 h-2 bg-rose-600 rotate-45 -mt-1 shadow" />

                </div>

              </Marker>

            )}

          </Map>



          {loading && (

            <div className="absolute inset-0 pointer-events-none z-10 flex items-center justify-center">

              <div className="bg-slate-900/80 backdrop-blur-sm px-5 py-3 rounded-2xl border border-slate-700/60 flex items-center gap-3 shadow-2xl">

                <div className="w-4 h-4 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />

                <span className="text-sm font-semibold text-blue-300 font-mono">Running inference…</span>

              </div>

            </div>

          )}



          {!loading && waypoints.length === 0 && (

            <div className="absolute top-4 left-1/2 -translate-x-1/2 pointer-events-none z-10">

              <div className="bg-slate-900/85 backdrop-blur px-4 py-2 rounded-xl border border-slate-700/60 text-sm text-slate-300">

                👆 Click on the map to drop route waypoints

              </div>

            </div>

          )}



          {mlResult && (

            <div className="absolute bottom-16 left-4 z-10 bg-slate-900/90 backdrop-blur border border-slate-700/60 rounded-xl p-2.5 flex items-center gap-3 text-[10px] font-mono shadow-xl">

              {[

                { color: "#10B981", label: "Low \u226578" },

                { color: "#F59E0B", label: "Med \u226558" },

                { color: "#F97316", label: "High \u226538" },

                { color: "#EF4444", label: "Crit <38" },

              ].map(({ color, label }) => (

                <span key={label} className="flex items-center gap-1 text-slate-300">

                  <span className="w-3 h-1.5 rounded-full inline-block" style={{ background: color }} />

                  {label}

                </span>

              ))}

            </div>

          )}

        </main>



        {/* RIGHT DIAGNOSTICS PANEL */}

        <aside className="w-80 bg-slate-900/95 backdrop-blur border-l border-slate-800/70 flex flex-col overflow-y-auto shrink-0 z-20">

          <div className="px-4 py-3.5 border-b border-slate-800/60 flex items-center justify-between sticky top-0 bg-slate-900/95 backdrop-blur z-10">

            <h2 className="text-sm font-bold text-white flex items-center gap-2">

              🔬 <span>Inference Diagnostics</span>

            </h2>

            {loading && (

              <span className="flex items-center gap-1.5 text-[11px] text-blue-400 font-mono animate-pulse">

                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-ping" />

                Evaluating…

              </span>

            )}

          </div>



          <div className="flex-1 p-4 space-y-4">



            {error && !loading && (

              <div className="p-3 rounded-xl bg-rose-950/70 border border-rose-700/60 text-rose-300 text-xs leading-relaxed">

                <div className="font-bold text-rose-200 mb-1">⚠️ Evaluation Error</div>

                {error}

              </div>

            )}



            {loading ? (

              <DiagnosticsSkeleton />

            ) : mlResult ? (

              <>

                {/* Gauge Card */}

                <div

                  className="rounded-2xl p-4 border relative overflow-hidden"

                  style={{

                    background: "linear-gradient(135deg, rgba(30,41,59,0.9) 0%, rgba(15,23,42,0.95) 100%)",

                    borderColor: scoreToColor(mlResult.safety_score) + "33",

                    boxShadow: `0 0 40px ${scoreToColor(mlResult.safety_score)}18`,

                  }}

                >

                  <div className="absolute top-0 right-0 w-32 h-32 rounded-full opacity-5 pointer-events-none blur-2xl" style={{ background: scoreToColor(mlResult.safety_score) }} />

                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 text-center">

                    Composite Safety Index

                  </div>

                  <CircularGauge score={mlResult.safety_score} riskLevel={mlResult.risk_level} />

                  {mlResult.inference_time_ms != null && (

                    <div className="mt-3 text-center">

                      <span className="text-[10px] font-mono text-slate-500">

                        ⚡ {mlResult.inference_time_ms.toFixed(1)} ms · {mlResult.waypoints_evaluated ?? waypoints.length} pts evaluated

                      </span>

                    </div>

                  )}

                </div>



                {/* Probabilities */}

                {mlResult.probabilities && (

                  <div className="grid grid-cols-3 gap-2 text-center">

                    {[

                      { label: "Low",  key: "Low",    color: "text-emerald-400" },

                      { label: "Med",  key: "Medium", color: "text-amber-400"   },

                      { label: "High", key: "High",   color: "text-rose-400"    },

                    ].map(({ label, key, color }) => (

                      <div key={key} className="bg-slate-800/60 rounded-xl p-2.5 border border-slate-700/50">

                        <div className={`text-[10px] font-bold ${color} mb-0.5`}>{label}</div>

                        <div className="text-sm font-black font-mono text-white">

                          {Math.round((mlResult.probabilities[key] ?? 0) * 100)}%

                        </div>

                      </div>

                    ))}

                  </div>

                )}



                {/* Reasoning pills */}

                {mlResult.reasons?.length > 0 && (

                  <div className="bg-slate-800/40 rounded-xl p-3 border border-slate-700/50">

                    <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">

                      🧠 Model Reasoning

                    </h3>

                    <div className="flex flex-wrap gap-1.5">

                      {mlResult.reasons.map((r, i) => <ReasonPill key={i} text={r} />)}

                    </div>

                  </div>

                )}



                {/* Nearest hazards */}

                {mlResult.nearest_hazards && (

                  <div className="bg-slate-800/40 rounded-xl p-3 border border-slate-700/50">

                    <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">

                      📍 Nearest Hazard Geodesics

                    </h3>

                    <div className="space-y-1.5">

                      {[

                        { key: "accident", icon: "💥", label: "Accident Blackspot", colorClass: "text-amber-400" },

                        { key: "crime",    icon: "🚨", label: "Crime Hotspot",      colorClass: "text-rose-400"  },

                        { key: "flood",    icon: "🌊", label: "Flood Zone",         colorClass: "text-blue-400"  },

                      ].map(({ key, icon, label, colorClass }) => {

                        const h = mlResult.nearest_hazards[key];

                        return (

                          <div key={key} className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800/80 flex items-center justify-between">

                            <div>

                              <div className="text-xs font-semibold text-slate-200 flex items-center gap-1">

                                <span>{icon}</span> {label}

                              </div>

                              <div className="text-[10px] text-slate-500 truncate max-w-[150px] mt-0.5">{h?.name || "—"}</div>

                            </div>

                            <span className={`font-mono text-xs font-bold ${colorClass}`}>

                              {h?.distance_m != null

                                ? h.distance_m < 1000 ? `${Math.round(h.distance_m)}m` : `${(h.distance_m / 1000).toFixed(1)}km`

                                : "—"}

                            </span>

                          </div>

                        );

                      })}

                    </div>

                  </div>

                )}



                {/* Feature importances */}

                {modelMeta?.feature_importances && (

                  <div className="bg-slate-800/40 rounded-xl p-3 border border-slate-700/50">

                    <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">

                      📊 Top Feature Weights

                    </h3>

                    <div className="space-y-2.5">

                      {Object.entries(modelMeta.feature_importances)

                        .sort(([,a],[,b]) => b - a)

                        .slice(0, 6)

                        .map(([feat, imp]) => <ImportanceBar key={feat} label={feat} value={imp} />)}

                    </div>

                  </div>

                )}



                {/* JSON Inspector */}

                <div className="bg-slate-800/40 rounded-xl border border-slate-700/50 overflow-hidden">

                  <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-700/40">

                    <button

                      onClick={() => setShowJsonInspector(v => !v)}

                      className="text-xs font-semibold text-slate-300 hover:text-white flex items-center gap-1.5 transition cursor-pointer"

                    >

                      <span className={`text-[10px] transition-transform inline-block ${showJsonInspector ? "rotate-90" : ""}`}>▶</span>

                      Raw JSON Response

                    </button>

                    <button

                      onClick={handleCopyJson}

                      className="text-[10px] px-2.5 py-1 rounded-lg bg-slate-700/80 hover:bg-slate-600 text-slate-200 font-mono transition cursor-pointer border border-slate-600/50"

                    >

                      {copiedJson ? "✓ Copied!" : "Copy JSON"}

                    </button>

                  </div>

                  {showJsonInspector && (

                    <div className="bg-slate-950/80 p-3">

                      <SyntaxJson json={mlResult} />

                    </div>

                  )}

                </div>

              </>

            ) : (

              <div className="flex flex-col items-center justify-center py-12 text-center space-y-3">

                <div className="w-16 h-16 rounded-2xl bg-slate-800/60 border border-slate-700/50 flex items-center justify-center text-3xl">

                  🗺️

                </div>

                <div>

                  <p className="text-sm font-semibold text-slate-300">No Route Evaluated</p>

                  <p className="text-[11px] text-slate-500 mt-1">

                    Select a preset or click on the map to<br />drop waypoints and run inference.

                  </p>

                </div>

              </div>

            )}

          </div>



          {modelMeta && (

            <div className="p-3 border-t border-slate-800/60 bg-slate-900/80 shrink-0">

              <div className="grid grid-cols-2 gap-1.5 text-[10px] font-mono text-slate-500">

                <span>Model: <span className="text-slate-300">RF + GBR</span></span>

                <span>Features: <span className="text-slate-300">{modelMeta.n_features ?? "—"}</span></span>

                <span>Trained: <span className="text-slate-300">{modelMeta.trained_on ?? "—"}</span></span>

                <span>Version: <span className="text-slate-300">{modelMeta.version ?? "v2"}</span></span>

              </div>

            </div>

          )}

        </aside>



      </div>

    </div>

  );

}

