# 🚗 Accident Blackspots Database (`accidentBlackspots.js`)

`src/data/accidentBlackspots.js` maps high-fatality collision zones identified by the Ministry of Road Transport and Highways (MoRTH) and state traffic police departments.

---

## ⚠️ Collision Penalty Weights
- **Sharp Blind Curves**: $-10\text{ pts}$ base deduction.
- **Unregulated Highway Intersections**: $-15\text{ pts}$ base deduction.
- **Expressway Merge Points**: $-12\text{ pts}$ base deduction.

When a navigation route enters an accident blackspot, the turn-by-turn navigation HUD displays a cautionary sound alert and yellow warning banner.
