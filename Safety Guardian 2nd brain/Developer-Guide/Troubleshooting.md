# 🔧 Troubleshooting Common Issues

### 1. Map Tiles appear blank
- **Cause**: Network restriction or missing internet connection.
- **Fix**: Check that `mt1.google.com` or CartoDB tiles are reachable and permitted by your network firewall.

### 2. Routes show default 12km demo distances
- **Cause**: All 3 routing tiers (Google, TomTom, OSRM) failed to reach external APIs.
- **Fix**: Verify `VITE_GOOGLE_MAPS_API_KEY` and `VITE_TOMTOM_API_KEY` in your `.env` file.

### 3. Shake-to-SOS does not trigger on mobile
- **Cause**: Motion permissions not granted on iOS Safari.
- **Fix**: Tap the permissions prompt on `/permissions` to trigger the iOS `DeviceMotionEvent.requestPermission()` dialog.
