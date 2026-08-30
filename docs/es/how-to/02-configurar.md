# Cómo Configurar Local SWMM (Configuración y Claves de API)

Configura `public/config.js` con las claves de API que la aplicación necesita para mapas, terreno y Street View.

`public/config.js` está **ignorado por git** y debe existir para que el mapa funcione. Define el objeto global `CONFIG` con tres claves opcionales:

| Clave | ¿Requerida? | Se usa para | Dónde |
|---|---|---|---|
| `MAPBOX_ACCESS_TOKEN` | Sí (mapa) | mapas base de Mapbox GL, DEM de terreno, edificios | `app.js:10-14` (`mapboxgl.accessToken`) |
| `GOOGLE_MAPS_API_KEY` | No | superposición de Google Street View | `index.html:758-763` (cargador perezoso) |
| `OPENTOPOGRAPHY_API_KEY` | No | endpoints de DEM de OpenTopography (COP30, USGS10m, …) | `app.js:446` |

## 1. Crea la configuración mínima

```js
var CONFIG = {
    MAPBOX_ACCESS_TOKEN: 'pk.…',
    GOOGLE_MAPS_API_KEY: '',
    OPENTOPOGRAPHY_API_KEY: ''
};
```

## 2. Obtén un token de Mapbox

- Los tokens de Mapbox son gratuitos en https://account.mapbox.com/. Usa un token *público* (`pk.…`).

## 3. Notas

- **Nota de CI:** el despliegue de GitHub Pages regenera `public/config.js` a partir de los secretos del repositorio (`MAPBOX_ACCESS_TOKEN`, `GOOGLE_MAPS_API_KEY`, `OPENTOPOGRAPHY_API_KEY`) — consulta `.github/workflows/static.yml:28-34`. CI emite `const CONFIG`, mientras que el uso local prefiere `var CONFIG` (un `const` de nivel superior *no* es visible como `window.CONFIG`; `app.js:446` lee `window.CONFIG` de forma defensiva).
- La **clave de API de OpenTopography** también se puede escribir en la tarjeta de ajustes del mapa en tiempo de ejecución (`#opentopo-api-key`), que tiene prioridad sobre `CONFIG`.
