# 🌿 Environmental Risk & Medical Sensitivity (`environmentalService.js`)

Safety Guardian dynamically personalizes route safety based on **Air Quality Index (AQI)**, **UV Index**, and the user's **Personal Medical Profile** (`src/services/medicalService.js`).

---

## 🩺 Medical Sensitivity Penalty Matrix

```mermaid
flowchart TD
    AQI[Live AQI Reading: PM2.5 / PM10] --> CheckMed{Check User Medical Conditions}
    CheckMed -->|Asthma / COPD / Respiratory| HighPen[Apply 2.5x Respiratory Penalty]
    CheckMed -->|Heart Disease / Cardiac| CardPen[Apply 2.0x Cardiac Penalty]
    CheckMed -->|No Pre-existing Conditions| StdPen[Apply Standard AQI Penalty]

    HighPen --> Deduct[Deduct Points from Walking/Cycling Routes]
    CardPen --> Deduct
    StdPen --> Deduct
```

---

## 🚶 Mode Sensitivity
Environmental penalties are strictly applied to open-air transport modes (**walking** and **cycling**), leaving air-conditioned automobile routing unaffected while warning the driver.
