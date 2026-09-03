# 📳 Shake Detection Hook (`useShakeSOS.js`)

`src/hooks/useShakeSOS.js` provides hands-free emergency SOS triggering by monitoring device accelerometer sensors via the Web `DeviceMotionEvent` API.

---

## ⚙️ Sensor Math & Calibration

```javascript
const SHAKE_THRESHOLD = 25    // Acceleration delta in m/s^2 (filters out normal walking)
const SHAKE_TIMEOUT   = 1000  // Maximum window for consecutive shakes (1 second)
const REQUIRED_SHAKES = 3     // 3 firm shakes required to prevent accidental triggers
```

$$|\Delta a| = |a_x - a_{x,\text{prev}}| + |a_y - a_{y,\text{prev}}| + |a_z - a_{z,\text{prev}}|$$
If $|\Delta a| > 25\text{ m/s}^2$, a shake counter increments. When 3 shakes occur within $1000\text{ ms}$, the global `handleShake` callback triggers immediate navigation to [[EmergencyPage]].
