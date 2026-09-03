# 📂 Project Structure Reference

```text
safetyguardian/
├── Safety Guardian 2nd brain/  # Obsidian Engineering Vault
├── functions/                  # Firebase Cloud Functions (Node.js)
│   ├── index.js                # Emergency telephony dispatcher
│   └── package.json
├── public/                     # Static public assets
├── src/
│   ├── assets/                 # App icons and graphics
│   ├── components/             # Reusable React components
│   │   ├── buttons/            # SOS and action buttons
│   │   ├── navigation/         # MainLayout tab navigation
│   │   └── reports/            # Incident reporting form components
│   ├── constants/              # India bounds, hazard types, severity multipliers
│   ├── context/                # Zustand global store (store.js)
│   ├── data/                   # Static geospatial databases (crime, flood, accidents)
│   ├── firebase/               # Firebase client initialization
│   ├── hooks/                  # Custom React hooks (useShakeSOS.js)
│   ├── pages/                  # 17 application screens
│   ├── services/               # 23 business logic & API services
│   ├── App.jsx                 # Top-level route switchboard
│   ├── main.jsx                # React DOM entry point
│   └── index.css               # Tailwind CSS & design tokens
├── firestore.rules             # Production Firestore security rules
├── package.json                # Frontend dependencies and scripts
└── vite.config.js              # Vite configuration and build headers
```
