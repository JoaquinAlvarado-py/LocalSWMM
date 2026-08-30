# Cómo Desplegar Local SWMM

Despliega la aplicación en un host estático. El sitio de producción es https://swmm6.is-local.org (Cloudflare Pages); también existe un workflow de GitHub Pages.

El wasm del motor 2D está compilado con **pthreads/OpenMP** (`scripts/build-openswmm2d.sh` / `.ps1`), por lo que necesita **aislamiento de origen cruzado** — `SharedArrayBuffer` solo está disponible para páginas servidas con `Cross-Origin-Opener-Policy` + `Cross-Origin-Embedder-Policy`. GitHub Pages no permite headers personalizados y no puede servir el build con threads. **Usa Cloudflare Pages.**

## 1. Despliega vía Cloudflare Pages (recomendado)

Los despliegues ocurren desde `.github/workflows/cloudflare.yml` al hacer push a `main` / `experimental` (el workflow también lista `website`). Escribe `config.js` y `build-version.js` (sello de caché) a partir de secretos, y luego sube `public/` vía `cloudflare/pages-action`.

Configuración (una vez):

1. Crea un proyecto Pages (o ejecuta `npx wrangler pages deploy public` manualmente — se incluye `wrangler.toml`).
2. Agrega los secretos del repositorio:
   - `CLOUDFLARE_API_TOKEN` (un token con permiso `Pages:Edit`)
   - `CLOUDFLARE_ACCOUNT_ID`
   - `CLOUDFLARE_PROJECT_NAME`
   - los existentes `MAPBOX_ACCESS_TOKEN`, `GOOGLE_MAPS_API_KEY`, `OPENTOPOGRAPHY_API_KEY`
3. Apunta tu dominio personalizado (`swmm6.is-local.org`) al proyecto Pages. Los headers `Cross-Origin-Opener-Policy: same-origin` / `Cross-Origin-Embedder-Policy: credentialless` vienen de `public/_headers` (credentialless para que los recursos de Mapbox/Google/OpenTopography carguen sin headers CORP).
4. Elimina `.github/workflows/static.yml` (GitHub Pages) una vez que Cloudflare esté activo.

`wrangler.toml` (incluido en la raíz del repo) te permite hacer push manualmente:

```bash
npx wrangler pages deploy public
```

## 2. Despliega vía GitHub Pages (`.github/workflows/static.yml`)

**Solo despliegue de GitHub Pages — no hay build de WASM en CI.** El motor se compila localmente en `experimental` y los artefactos se commitean en `public/`.

El workflow hace:

1. Disparadores: push a `main` + `experimental`, o dispatch manual.
2. Checkout (v4, sin `submodules: recursive` — el wasm precompilado viaja en `public/`).
3. **Genera `public/config.js` a partir de secretos** (`MAPBOX_ACCESS_TOKEN`, `GOOGLE_MAPS_API_KEY`, `OPENTOPOGRAPHY_API_KEY`).
4. Sube `./public` como artefacto de Pages → despliega con `actions/deploy-pages@v4`.

> Nota (desde el archivo del workflow): GitHub Pages no puede configurar headers COOP/COEP, por lo que el wasm 2D con threads (pthreads/SharedArrayBuffer) **NO** correrá en este despliegue. Elimina este workflow una vez que Cloudflare esté activo.

## 3. Sirve localmente para desarrollo

`python server.py` envía los mismos headers COOP/COEP, por lo que el motor con threads funciona en `http://127.0.0.1:8080` de inmediato. El servidor solo se enlaza a `127.0.0.1`, sirve `<repo>/public` en el puerto **8080**, expone `GET /api/status` (→ `{"status":"running","msg":"3D Map Prototype Server Online"}`) y envía `Cache-Control: no-store` más `Access-Control-Allow-Origin: *` en OPTIONS + `/api/status`. Los scripts lo lanzan automáticamente cuando `http://127.0.0.1:8080/api/status` no es alcanzable.
