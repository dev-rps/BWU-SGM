# 📝 Coding Conventions & Guidelines

1. **State Modifications**: Never mutate Zustand state directly. Use action setters or functional state updates in `src/context/store.js`.
2. **Geospatial Coordinates**: Always maintain coordinates as `[latitude, longitude]` arrays for Leaflet compatibility, or explicit `{ lat, lng }` objects.
3. **No Hardcoded Secrets**: Never embed fallback API keys in source files. Always use `import.meta.env.VITE_*`.
4. **Linter**: Run `npm run lint` (`oxlint`) before submitting pull requests.
