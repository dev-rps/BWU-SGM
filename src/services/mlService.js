/**
 * src/services/mlService.js
 *
 * Client API for communicating with the Python FastAPI Geospatial ML engine.
 * Automatically tries the Vite proxy (/api/ml) and falls back to direct localhost:8000.
 */

const ML_DIRECT_BASE = 'http://127.0.0.1:8000';
const ML_PROXY_BASE = '/api/ml';

/**
 * Checks whether the Python FastAPI service is active.
 * @returns {Promise<{ online: boolean, data?: object, error?: string }>}
 */
export async function checkMLHealth() {
  // Try proxy first
  try {
    const res = await fetch(`${ML_PROXY_BASE}/health`, { signal: AbortSignal.timeout(2000) });
    if (res.ok) {
      const data = await res.json();
      return { online: true, data, endpoint: ML_PROXY_BASE };
    }
  } catch {}

  // Fallback to direct URL
  try {
    const res = await fetch(`${ML_DIRECT_BASE}/health`, { signal: AbortSignal.timeout(2000) });
    if (res.ok) {
      const data = await res.json();
      return { online: true, data, endpoint: ML_DIRECT_BASE };
    }
  } catch (err) {
    return { online: false, error: err.message };
  }

  return { online: false, error: 'ML service offline' };
}

/**
 * Evaluates route safety by sending waypoints and environmental parameters to FastAPI.
 *
 * @param {object} params
 * @param {Array<[number, number]>|Array<{lat: number, lng: number}>} params.waypoints
 * @param {number} [params.hour]
 * @param {number} [params.dayOfWeek]
 * @param {object} [params.weather]
 * @param {string} [params.lighting]
 * @returns {Promise<object>}
 */
export async function evaluateRouteSafety({
  waypoints,
  hour,
  dayOfWeek,
  weather,
  lighting,
  timestamp,
}) {
  const payload = {
    waypoints,
    hour: hour !== undefined ? hour : new Date().getHours(),
    day_of_week: dayOfWeek !== undefined ? dayOfWeek : new Date().getDay(),
    weather: weather || { condition: 'clear', temperature: 26, visibility: 10000 },
    lighting: lighting || 'daylight',
    timestamp: timestamp || new Date().toISOString(),
  };

  const endpoints = [`${ML_PROXY_BASE}/predict/route`, `${ML_DIRECT_BASE}/predict/route`];
  let lastError = null;

  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(5000),
      });

      if (res.ok) {
        return await res.json();
      }
      const errBody = await res.json().catch(() => ({ detail: res.statusText }));
      lastError = new Error(errBody.detail || `ML Error ${res.status}`);
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error('Failed to reach ML service on all endpoints.');
}

/**
 * Fetches model metadata and feature importance.
 */
export async function fetchModelMetadata() {
  const endpoints = [`${ML_PROXY_BASE}/model/metadata`, `${ML_DIRECT_BASE}/model/metadata`];
  for (const url of endpoints) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (res.ok) return await res.json();
    } catch {}
  }
  return null;
}
