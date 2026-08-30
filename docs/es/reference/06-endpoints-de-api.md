# Endpoints de API — `server.py`

Un servidor estático de cero dependencias (stdlib de Python) — el único servidor del proyecto. `server.py` sirve el directorio `public/` y expone un endpoint JSON, `/api/status`.

## Datos del servidor

| Aspecto | Valor |
|---|---|
| Bind | solo `127.0.0.1` |
| Puerto | **8080** |
| Raíz de documentos | `<repo>/public` |
| Endpoints | `GET /api/status` → `{"status":"running","msg":"3D Map Prototype Server Online"}`; todo lo demás = GET estático |
| Headers | `Cache-Control: no-store` (wasm/JS fresco en cada recarga) |
| CORS | `Access-Control-Allow-Origin: *` en OPTIONS + `/api/status` |
| Concurrencia | `ThreadingTCPServer`, `daemon_threads=True` |

Los scripts lo levantan automáticamente cuando `http://127.0.0.1:8080/api/status` no es alcanzable.

## Endpoints

### `GET /api/status`

Endpoint de salud. Responde `200 OK` con `Content-Type: application/json` y `Access-Control-Allow-Origin: *`.

Cuerpo de la respuesta:

```json
{"status": "running", "msg": "3D Map Prototype Server Online"}
```

### `GET <path>` (servicio de archivos estáticos)

Todo lo demás se sirve estáticamente desde `<repo>/public` vía `http.server.SimpleHTTPRequestHandler`. No hay otras rutas de API.

### `OPTIONS`

Responde `200 OK` con los headers de preflight CORS:

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, OPTIONS
Access-Control-Allow-Headers: Content-Type
```

## Headers en cada respuesta

`end_headers()` agrega estos a todas las respuestas:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: credentialless
Cache-Control: no-store
```

El aislamiento cross-origin lo requiere el motor WASM con hilos (SharedArrayBuffer / pthreads). Estos reflejan los headers de producción de `public/_headers` para que el desarrollo local y el harness de Chrome ejerciten el mismo runtime que Cloudflare Pages.

## Código fuente

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
