# 🩺 Medical Emergency Profile (`medicalService.js`)

`src/services/medicalService.js` manages life-saving medical data stored both locally in `localStorage` (for instant offline paramedic access) and in Cloud Firestore at `users/{uid}/medical/profile`.

---

## 📋 Data Fields Collected
- **Blood Group**: A+, A-, B+, B-, AB+, AB-, O+, O-
- **Physical Metrics**: Age, Height, Weight
- **Chronic Conditions**: Asthma, Diabetes, Hypertension, Cardiac Disease, Epilepsy, Pregnancy
- **Critical Allergies**: Penicillin, Peanuts, Sulfa, Dust/Pollen, Latex
- **Emergency Medications**: Inhalers, Insulin, EpiPen, Nitro-glycerine
- **Attending Physician**: Name, Hospital affiliation, Direct phone
- **Health Insurance**: Provider name and policy number
