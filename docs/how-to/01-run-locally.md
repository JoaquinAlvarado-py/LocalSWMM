# How to Run the App Locally

Run the Local SWMM web app on your own computer with the bundled Python static server, instead of the production site.

## Requirements

- Python 3 and a modern browser. (Node is only needed for `npm install` and the tooling scripts.)

## 1. Clone the repository

```bash
git clone --branch experimental https://github.com/JoaquinAlvarado-py/LocalSWMM.git
cd LocalSWMM
```

## 2. Start the local web server

```bash
python3 server.py          # serves ./public on http://127.0.0.1:8080
```

## 3. Open the app

Open **http://127.0.0.1:8080** in your web browser. If the basemap doesn't load, you need to add your Mapbox token to `public/config.js` — see [How to Configure Local SWMM](02-configure.md).

## 4. (Optional) Install the JS tooling

```bash
npm install                # installs triangle-wasm (dev dependency, vendored copy)
```

## 5. Verify with a sample model

Load **Bellinge Web** from the **Open Model ▾** dropdown, then press **Run**. This is the reference network used throughout the test suite.

## What the server does

`server.py` is a zero-dependency static server (Python stdlib):

| Aspect | Value |
|---|---|
| Bind | `127.0.0.1` only |
| Port | **8080** |
| Document root | `<repo>/public` |
| Endpoints | `GET /api/status` → `{"status":"running","msg":"3D Map Prototype Server Online"}`; everything else = static GET |
| Headers | `Cache-Control: no-store` (fresh wasm/JS every reload) |
| CORS | `Access-Control-Allow-Origin: *` on OPTIONS + `/api/status` |
| Concurrency | `ThreadingTCPServer`, `daemon_threads=True` |

The server sends the same `Cross-Origin-Opener-Policy: same-origin` / `Cross-Origin-Embedder-Policy: credentialless` headers as production, so the threaded engine (pthreads/`SharedArrayBuffer`) works on `http://127.0.0.1:8080` out of the box.

## Known discrepancy

> The README says the project directory is `SWMM_3D_Web_UI` and the URL is `http://localhost:8000`. The actual directory is `LocalSWMM` and the server listens on port **8080** (`server.py:6`). Use the commands above.
