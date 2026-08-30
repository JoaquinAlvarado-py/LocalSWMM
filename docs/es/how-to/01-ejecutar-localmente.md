# Cómo Ejecutar la Aplicación Localmente

Ejecuta la aplicación web Local SWMM en tu propio computador con el servidor estático de Python incluido, en lugar del sitio de producción.

## Requisitos

- Python 3 y un navegador moderno. (Node solo se necesita para `npm install` y los scripts de tooling.)

## 1. Clona el repositorio

```bash
git clone --branch experimental https://github.com/JoaquinAlvarado-py/LocalSWMM.git
cd LocalSWMM
```

## 2. Inicia el servidor web local

```bash
python3 server.py          # serves ./public on http://127.0.0.1:8080
```

## 3. Abre la aplicación

Abre **http://127.0.0.1:8080** en tu navegador web. Si el mapa base no carga, necesitas agregar tu token de Mapbox a `public/config.js` — consulta [Cómo Configurar Local SWMM](02-configurar.md).

## 4. (Opcional) Instala el tooling de JS

```bash
npm install                # installs triangle-wasm (dev dependency, vendored copy)
```

## 5. Verifica con un modelo de muestra

Carga **Bellinge Web** desde el menú desplegable **Open Model ▾** y luego pulsa **Run**. Esta es la red de referencia usada en toda la suite de pruebas.

## Lo que hace el servidor

`server.py` es un servidor estático de cero dependencias (stdlib de Python):

| Aspecto | Valor |
|---|---|
| Bind | solo `127.0.0.1` |
| Puerto | **8080** |
| Raíz de documentos | `<repo>/public` |
| Endpoints | `GET /api/status` → `{"status":"running","msg":"3D Map Prototype Server Online"}`; todo lo demás = GET estático |
| Headers | `Cache-Control: no-store` (wasm/JS fresco en cada recarga) |
| CORS | `Access-Control-Allow-Origin: *` en OPTIONS + `/api/status` |
| Concurrencia | `ThreadingTCPServer`, `daemon_threads=True` |

El servidor envía los mismos headers `Cross-Origin-Opener-Policy: same-origin` / `Cross-Origin-Embedder-Policy: credentialless` que producción, por lo que el motor con threads (pthreads/`SharedArrayBuffer`) funciona en `http://127.0.0.1:8080` de inmediato.

## Discrepancia conocida

> El README dice que el directorio del proyecto es `SWMM_3D_Web_UI` y que la URL es `http://localhost:8000`. El directorio real es `LocalSWMM` y el servidor escucha en el puerto **8080** (`server.py:6`). Usa los comandos de arriba.
