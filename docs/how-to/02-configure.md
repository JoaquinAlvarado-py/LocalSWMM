# How to Configure Local SWMM (Configuration & API Keys)

Set up `public/config.js` with the API keys the app needs for maps, terrain, and street view.

`public/config.js` is **git-ignored** and must exist for the map to work. It defines the global `CONFIG` object with three optional keys:

| Key | Required? | Used for | Where |
|---|---|---|---|
| `MAPBOX_ACCESS_TOKEN` | Yes (map) | Mapbox GL basemaps, terrain DEM, buildings | `app.js:10-14` (`mapboxgl.accessToken`) |
| `GOOGLE_MAPS_API_KEY` | No | Google Street View overlay | `index.html:758-763` (lazy loader) |
| `OPENTOPOGRAPHY_API_KEY` | No | OpenTopography DEM endpoints (COP30, USGS10m, …) | `app.js:446` |

## 1. Create the minimal config

```js
var CONFIG = {
    MAPBOX_ACCESS_TOKEN: 'pk.…',
    GOOGLE_MAPS_API_KEY: '',
    OPENTOPOGRAPHY_API_KEY: ''
};
```

## 2. Get a Mapbox token

- Mapbox tokens are free at https://account.mapbox.com/. Use a *public* (`pk.…`) token.

## 3. Notes

- **CI note:** GitHub Pages deployment regenerates `public/config.js` from repository secrets (`MAPBOX_ACCESS_TOKEN`, `GOOGLE_MAPS_API_KEY`, `OPENTOPOGRAPHY_API_KEY`) — see `.github/workflows/static.yml:28-34`. CI emits `const CONFIG`, while local use favors `var CONFIG` (a top-level `const` is *not* visible as `window.CONFIG`; `app.js:446` reads `window.CONFIG` defensively).
- The **OpenTopography API key** can also be typed into the map-settings card at runtime (`#opentopo-api-key`), which takes precedence over `CONFIG`.
