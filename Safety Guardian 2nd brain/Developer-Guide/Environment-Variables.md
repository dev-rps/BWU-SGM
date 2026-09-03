# 🔐 Environment Variables Guide

All frontend environment variables must be prefixed with `VITE_` to be exposed by Vite.

| Variable Name | Required? | Purpose | Provider |
| :--- | :--- | :--- | :--- |
| `VITE_GOOGLE_MAPS_API_KEY` | Optional | Primary high-precision traffic-aware routing | [Google Cloud Console](https://console.cloud.google.com/) |
| `VITE_TOMTOM_API_KEY` | Recommended | Secondary routing, traffic incidents & places search | [TomTom Developer Portal](https://developer.tomtom.com/) |
| `VITE_OPENWEATHER_API_KEY` | Recommended | Real-time weather, forecasts, and AQI | [OpenWeatherMap](https://openweathermap.org/) |
| `VITE_GEMINI_API_KEY` | Optional | Fallback cloud LLM chat assistant | [Google AI Studio](https://aistudio.google.com/) |
