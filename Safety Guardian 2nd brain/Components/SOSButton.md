# 🧩 SOSButton (`SOSButton.jsx`)

- **Path**: `src/components/buttons/SOSButton.jsx`
- **Role**: High-visibility emergency trigger button.
- **Interactions**:
  - Tap or Long-press triggers pulse animation (`animate-pulse-ring`).
  - Dispatches immediate state update to Zustand (`setSosActive(true)`) and redirects to [[EmergencyPage]].
