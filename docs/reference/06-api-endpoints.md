# API Endpoints — `server.py`

A zero-dependency static server (Python stdlib) — the only server in the project. `server.py` serves the `public/` directory and exposes one JSON endpoint, `/api/status`.

## Server facts

| Aspect | Value |
|---|---|
| Bind | `127.0.0.1` only |
| Port | **8080** |
| Document root | `<repo>/public` |
| Endpoints | `GET /api/status` → `{"status":"running","msg":"3D Map Prototype Server Online"}`; everything else = static GET |
| Headers | `Cache-Control: no-store` (fresh wasm/JS every reload) |
| CORS | `Access-Control-Allow-Origin: *` on OPTIONS + `/api/status` |
| Concurrency | `ThreadingTCPServer`, `daemon_threads=True` |

Scripts auto-spawn it when `http://127.0.0.1:8080/api/status` is unreachable.

## Endpoints

### `GET /api/status`

Health endpoint. Responds `200 OK` with `Content-Type: application/json` and `Access-Control-Allow-Origin: *`.

Response body:

```json
{"status": "running", "msg": "3D Map Prototype Server Online"}
```

### `GET <path>` (static file serving)

Everything else is served statically from `<repo>/public` via `http.server.SimpleHTTPRequestHandler`. There are no other API routes.

### `OPTIONS`

Responds `200 OK` with the CORS preflight headers:

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, OPTIONS
Access-Control-Allow-Headers: Content-Type
```

## Headers on every response

`end_headers()` adds these to all responses:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: credentialless
Cache-Control: no-store
```

Cross-origin isolation is required by the threaded WASM engine (SharedArrayBuffer / pthreads). These mirror the production headers from `public/_headers` so local dev and the Chrome harness exercise the same runtime as Cloudflare Pages.

## Source

`server.py` (verbatim):

```python
PORT = 8080
PUBLIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'public')

class CustomHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        print(f"{self.client_address[0]} - {format % args}", flush=True)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=PUBLIC_DIR, **kwargs)

    def end_headers(self):
        # Cross-origin isolation is required by the threaded WASM engine
        # (SharedArrayBuffer / pthreads). Mirror the production headers from
        # public/_headers so local dev and the Chrome harness exercise the
        # same runtime as Cloudflare Pages.
        self.send_header('Cross-Origin-Opener-Policy', 'same-origin')
        self.send_header('Cross-Origin-Embedder-Policy', 'credentialless')
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_GET(self):
        if self.path == '/api/status':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({"status": "running", "msg": "3D Map Prototype Server Online"}).encode())
        else:
            super().do_GET()

if __name__ == '__main__':
    # Ensure public folder exists
    os.makedirs(PUBLIC_DIR, exist_ok=True)

    print(f"Starting server on http://127.0.0.1:{PORT}")
    print(f"Serving files from: {PUBLIC_DIR}")

    socketserver.ThreadingTCPServer.allow_reuse_address = True
    socketserver.ThreadingTCPServer.daemon_threads = True
    with socketserver.ThreadingTCPServer(("127.0.0.1", PORT), CustomHandler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down server.")
            httpd.server_close()
```
