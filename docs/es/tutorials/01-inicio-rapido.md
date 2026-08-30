# Primeros Pasos con Local SWMM

En este tutorial aprenderás qué es Local SWMM, qué necesitas para ejecutarlo y cómo abrir la aplicación y completar tu primera corrida con un modelo de muestra integrado.

## Lo que harás

Al final de esta lección habrás:

- abierto la aplicación web Local SWMM,
- explorado sus cinco áreas principales de interfaz,
- cargado una red de drenaje de muestra, y
- ejecutado una corrida hidráulica e inspeccionado sus resultados.

## Qué es Local SWMM

Local SWMM es una **aplicación web solo de cliente** para modelado hidráulico 2D y simulación de redes de aguas lluvias y aguas servidas. Todo — el editor, el generador de mallas y el motor hidráulico SWMM — corre en el navegador. El motor de simulación es el motor HydroCouple **OpenSWMM** compilado a **WebAssembly** con Emscripten.

Propiedades clave:

- **Sin backend.** El único servidor es un servidor trivial de archivos estáticos + endpoint de salud (`server.py`). Sin base de datos, sin paso de build para la UI, sin bundler.
- **Sin framework de UI.** El frontend son ~15 000 líneas de JavaScript sin dependencias (scripts clásicos + IIFEs) que usan Mapbox GL JS como única librería runtime pesada.
- **Hidráulica embebida en WASM.** El motor OpenSWMM 6.0.0 está compilado de forma cruzada para `wasm32-emscripten` con dependencias C++ gestionadas por vcpkg (Eigen, HDF5, nlohmann-json, SUNDIALS).
- **Dos backends de simulación.** Una ruta de motor WASM (1D + 1D/2D acoplado) y un backend **experimental WebGPU** que reimplementa el solver 2D explícito de inercia local como kernels de cómputo WGSL y lo ejecuta en paralelo al motor WASM.
- **Dos generadores de malla.** Un generador heredado basado en `poly2tri` y el pipeline de producción **Shewchuk Triangle WASM** (npm `triangle-wasm`).

La aplicación ofrece una interfaz de mapa interactiva para construir, editar y simular sistemas de drenaje urbano. Usa Mapbox GL JS para la visualización 3D de terreno y edificios, y el [motor HydroCouple OpenSWMM](https://github.com/HydroCouple/openswmm.engine) para ejecutar corridas de simulación hidráulica directamente en tu navegador gracias a WebAssembly. Puedes probarlo tú mismo en https://swmm6.is-local.org — hay un video de demostración disponible en https://github.com/user-attachments/assets/6ea0af51-125d-4b7d-a6ba-e0452cfae368 (también se incluye un `demo.mp4` en el repositorio bajo `assets/`).

## Requisitos previos

- Un navegador web moderno con soporte WebAssembly. [Revisa aquí si puedes usarlo correctamente en tu navegador](https://caniuse.com/wasm).
- Python 3 instalado en tu computador — solo si quieres ejecutar la aplicación desde tu propia máquina. (Node solo se necesita para `npm install` y los scripts de tooling.)

No necesitas instalar nada para usar el sitio de producción, y no necesitas compilar nada desde el código fuente para esta lección.

## Paso 1 — Abre la aplicación

La forma más rápida de empezar es el sitio de producción: **https://swmm6.is-local.org**.

Si prefieres ejecutar la aplicación en tu propio computador, sigue primero la guía [Cómo Ejecutar la Aplicación Localmente](../how-to/01-ejecutar-localmente.md) y luego vuelve.

## Paso 2 — Conoce la interfaz

La interfaz de usuario contiene cinco áreas principales:

- **Barra de Herramientas Superior**: realiza operaciones de archivo, cambia las opciones de simulación y ejecuta corridas.
- **Paleta de Herramientas Izquierda**: selecciona objetos del mapa o dibuja elementos de red.
- **Vista de Mapa**: ve y edita tu red de drenaje sobre mapas 2D o 3D interactivos.
- **Panel Lateral Derecho**: inspecciona las propiedades de los elementos o ve las tablas de resultados de corrida.
- **Barra de Estado Inferior**: ve la herramienta seleccionada actual, los conteos de elementos y las coordenadas del cursor.

## Paso 3 — Carga un modelo de muestra

El proyecto incluye modelos de muestra preconfigurados:

1. En la **Barra de Herramientas Superior**, abre el menú desplegable **Open Model ▾**.
2. Elige **Load Sample Models**.
3. Carga **Bellinge Web** (las alternativas son **Bellinge Self-Contained** y **Bellinge No Pervious**).

Ahora deberías ver la red de referencia en el mapa. **Bellinge Web** es la red de referencia usada en toda la suite de pruebas.

## Paso 4 — Ejecuta la corrida

1. Pulsa **Run** en la **Barra de Herramientas Superior**.
2. Supervisa el progreso en la ventana **Run Status**. Muestra:
   - **Seguimiento de Progreso**: porcentaje de cálculo en tiempo real y tiempo simulado (`Days` y `Hrs:Min`).
   - **Detener Corrida**: pulsa **Stop** para detener la corrida de inmediato.
   - **Minimizar Ventana**: pulsa **Minimize** para reducir la ventana de estado a una insignia flotante. Pulsa **Expand** en la insignia flotante para restaurar la ventana.

## Paso 5 — Observa los resultados

- **Panel de Control Deslizante de Tiempo**: usa la barra de animación inferior para reproducir, pausar, cambiar la velocidad o arrastrar hasta un paso de tiempo específico.
- **Pestaña Properties**: haz clic en cualquier nodo o enlace para ver sus propiedades geométricas y los caudales calculados.
- **Pestaña Results**: selecciona categorías de resultados para ver tablas resumen (Node Depths, Node Inflows, Link Flows y Subcatchment Runoff).
- **Perfil de Elevación de Agua**: selecciona nodos conectados y pulsa **Profile** para ver un gráfico de perfil hidráulico interactivo.

## Lo que deberías ver al final

- Una corrida terminada: la ventana **Run Status** llega al 100 % y las pestañas **Results** y **Report** del panel derecho están pobladas.
- Una línea de tiempo animada: el **Time Slider** reproduce el período simulado y los colores de los resultados se actualizan en el mapa.
- Ya estás listo para construir tu propia red — continúa con [Construye tu Primera Red de Drenaje](02-tu-primera-red.md).
