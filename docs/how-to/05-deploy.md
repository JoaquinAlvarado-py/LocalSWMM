# How to Deploy Local SWMM

Deploy the app to a static host. The production site is https://swmm6.is-local.org (Cloudflare Pages); a GitHub Pages workflow also exists.

The 2D engine wasm is built with **pthreads/OpenMP** (`scripts/build-openswmm2d.sh` / `.ps1`), so it needs **cross-origin isolation** — `SharedArrayBuffer` is only available to pages served with `Cross-Origin-Opener-Policy` + `Cross-Origin-Embedder-Policy`. GitHub Pages does not allow custom headers and cannot serve the threaded build. **Use Cloudflare Pages.**

## 1. Deploy via Cloudflare Pages (recommended)

Deploys happen from `.github/workflows/cloudflare.yml` on push to `main` / `experimental` (the workflow also lists `website`). It writes `config.js` and `build-version.js` (cache stamp) from secrets, then uploads `public/` via `cloudflare/pages-action`.

Setup (once):

1. Create a Pages project (or run `npx wrangler pages deploy public` manually — `wrangler.toml` is provided).
2. Add repository secrets:
   - `CLOUDFLARE_API_TOKEN` (a token with `Pages:Edit` permission)
   - `CLOUDFLARE_ACCOUNT_ID`
   - `CLOUDFLARE_PROJECT_NAME`
   - the existing `MAPBOX_ACCESS_TOKEN`, `GOOGLE_MAPS_API_KEY`, `OPENTOPOGRAPHY_API_KEY`
3. Point your custom domain (`swmm6.is-local.org`) at the Pages project. The `Cross-Origin-Opener-Policy: same-origin` / `Cross-Origin-Embedder-Policy: credentialless` headers come from `public/_headers` (credentialless so Mapbox/Google/OpenTopography resources load without CORP headers).
4. Delete `.github/workflows/static.yml` (GitHub Pages) once Cloudflare is live.

`wrangler.toml` (provided in the repo root) lets you push manually:

```bash
npx wrangler pages deploy public
```

## 2. Deploy via GitHub Pages (`.github/workflows/static.yml`)

**GitHub Pages deploy only — there is no WASM build in CI.** The engine is built locally on `experimental` and the artifacts are committed to `public/`.

The workflow does:

1. Triggers: push to `main` + `experimental`, or manual dispatch.
2. Checkout (v4, no `submodules: recursive` — prebuilt wasm ships in `public/`).
3. **Generate `public/config.js` from secrets** (`MAPBOX_ACCESS_TOKEN`, `GOOGLE_MAPS_API_KEY`, `OPENTOPOGRAPHY_API_KEY`).
4. Upload `./public` as a Pages artifact → deploy with `actions/deploy-pages@v4`.

> Note (from the workflow file): GitHub Pages cannot set COOP/COEP headers, so the threaded 2D wasm (pthreads/SharedArrayBuffer) will **NOT** run on this deployment. Remove this workflow once Cloudflare is live.

## 3. Serve locally for development

`python server.py` sends the same COOP/COEP headers, so the threaded engine works on `http://127.0.0.1:8080` out of the box. The server binds `127.0.0.1` only, serves `<repo>/public` on port **8080**, exposes `GET /api/status` (→ `{"status":"running","msg":"3D Map Prototype Server Online"}`), and sends `Cache-Control: no-store` plus `Access-Control-Allow-Origin: *` on OPTIONS + `/api/status`. Scripts auto-spawn it when `http://127.0.0.1:8080/api/status` is unreachable.
