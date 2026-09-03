# 🌊 Flood & Waterlogging Risk Intelligence (`floodZones.js`)

`src/data/floodZones.js` tracks static flood-prone areas, urban low-lying waterlogging zones, and live hydrological river gauge trends across India.

---

## 🌧️ Seasonal Dynamic Multipliers (`isMonsoonSeason`)

During the Indian Southwest Monsoon (June 1 to October 31):
- All flood zone penalties receive an automatic **$+40\%$ multiplier** ($	imes 1.4$).
- Heavy rain alerts trigger visual water drops on intersecting route cards.

```javascript
export function isMonsoonSeason() {
  const month = new Date().getMonth() + 1 // 1-12
  return month >= 6 && month <= 10        // June through October
}
```

---

## 📊 Live River Gauge Integration
The dataset tracks live river discharge data (in $\text{m}^3/\text{s}$) with trend indicators (`rising` vs. `falling`), alerting drivers if an arterial underpass or bridge approach is at risk of submergence.
