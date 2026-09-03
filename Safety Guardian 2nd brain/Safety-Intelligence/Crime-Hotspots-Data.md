# 🚨 Crime Hotspots Database (`crimeHotspots.js`)

`src/data/crimeHotspots.js` contains a curated database of verified historical crime hotspots across major Indian metropolitan areas and transit corridors.

---

## 📊 Severity Weighting & Penalty Matrix

| Severity Level | Penalty Deducted | Multiplier | Visual Marker Color |
| :--- | :--- | :--- | :--- |
| **Low** | $-4\text{ pts}$ | $0.8\times$ | Amber (`#F59E0B`) |
| **Moderate** | $-8\text{ pts}$ | $1.0\times$ | Orange (`#F97316`) |
| **High** | $-14\text{ pts}$ | $1.3\times$ | Red (`#EF4444`) |
| **Severe** | $-20\text{ pts}$ | $1.6\times$ | Dark Red (`#DC2626`) |
| **Critical** | $-28\text{ pts}$ | $2.0\times$ | Purple (`#7C3AED`) |

---

## 📍 Data Schema Example
```javascript
{
  id: 'crime_kol_01',
  area: 'Sealdah Station South Section',
  city: 'Kolkata',
  state: 'West Bengal',
  lat: 22.5675,
  lng: 88.3712,
  radius: 350,
  severity: 'high',
  types: ['theft', 'snatching', 'harassment'],
  description: 'High frequency of phone snatching and pickpocketing during rush hours.',
  source: 'Kolkata Police Crime Records / News Archives',
  timeRisk: 'night_and_rush_hours'
}
```
