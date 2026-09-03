# 💳 Technical Debt Register

1. **Bundle Chunk Optimization**: Production bundle contains some chunks $>500\text{ kB}$ due to Leaflet and icons. Dynamic `import()` code-splitting should be applied to route pages.
2. **Backend AI Proxy**: Build a secure Firebase Cloud Function endpoint for Gemini conversational requests.
