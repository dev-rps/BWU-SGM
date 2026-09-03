# ✨ Google Gemini AI Integration (`gemini.js`)

`src/services/gemini.js` interfaces with Google's **Gemini Flash API** using the modern `@google/genai` SDK for open-ended conversational inquiries beyond the local rule base.

---

## 🔒 Security Architecture Note
Per [[Security-Architecture]], direct client-side Gemini calls expose API quotas to the browser bundle. In high-assurance production deployments, requests are proxied through a Firebase Cloud Function.
