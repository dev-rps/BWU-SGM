# 🔑 API Key Protection & Secret Management

All API credentials in Safety Guardian follow strict client/server separation principles.

---

## 🚫 The Anti-Pattern: Hardcoded Fallbacks
```javascript
// ❌ VULNERABLE: Bundles private API key into client JavaScript
const KEY = import.meta.env.VITE_KEY || 'AIzaSyC_secret_key_string'

// ✅ SECURE: Fails gracefully with warning, no leaked credentials
const KEY = import.meta.env.VITE_KEY
if (!KEY) {
  console.warn('[Safety Guardian] API Key missing. Falling back to free tier.')
}
```
