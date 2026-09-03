# 🐛 Known Issues & Limitations

1. **Client-Side LLM Key**: Direct client-side calls to Gemini expose the `VITE_GEMINI_API_KEY` in outgoing browser network requests. (Migrating to a Cloud Function proxy is planned).
2. **iOS Accelerometer Permission**: iOS requires explicit user interaction before enabling motion sensors for Shake-to-SOS.
