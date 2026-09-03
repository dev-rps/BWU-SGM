# 🛡️ Content Security Policy (CSP)

Configured via meta tag in `index.html` to restrict untrusted script execution:

```html
<meta http-equiv="Content-Security-Policy" content="
  default-src 'self' https://*.firebaseio.com https://*.firebaseapp.com https://*.googleapis.com;
  script-src 'self' 'unsafe-inline' 'unsafe-eval' https://apis.google.com https://*.firebaseio.com;
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com;
  font-src 'self' https://fonts.gstatic.com;
  img-src 'self' data: blob: https://*.google.com https://*.googleapis.com https://mt0.google.com https://mt1.google.com https://mt2.google.com https://mt3.google.com https://*.tile.openstreetmap.org https://*.openstreetmap.org https://*.basemaps.cartocdn.com https://api.tomtom.com https://*.tomtom.com https://unpkg.com https://*.openweathermap.org;
  connect-src 'self' wss://*.firebaseio.com https://*.googleapis.com https://*.firebaseio.com https://*.firebaseapp.com https://api.tomtom.com https://*.tomtom.com https://api.openweathermap.org https://*.openweathermap.org https://router.project-osrm.org https://*.project-osrm.org https://routing.openstreetmap.de https://*.openstreetmap.de https://nominatim.openstreetmap.org https://*.openstreetmap.org https://overpass-api.de https://*.overpass-api.de https://flood-api.open-meteo.com https://*.open-meteo.com https://open-meteo.com https://generativelanguage.googleapis.com;
  frame-src 'self' https://*.firebaseapp.com https://*.google.com;
">
```
