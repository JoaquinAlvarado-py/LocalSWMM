# Construye tu Primera Red de Drenaje y Ejecuta una Corrida

En este tutorial construirás una pequeña red de aguas lluvias desde cero — nodos, enlaces y una subcuenca — configurarás sus parámetros, ejecutarás una corrida e inspeccionarás los resultados, todo a través de la interfaz de usuario de la aplicación.

## Lo que construirás

Una red de drenaje pequeña: algunos nodos conectados por conductos y que terminan en un outfall, más una subcuenca que drena hacia la red. Usarás las herramientas de dibujo de la **Paleta de Herramientas Izquierda**, configurarás las propiedades de los elementos en el panel derecho y terminarás ejecutando la corrida y leyendo sus resultados.

## Antes de empezar

Abre la aplicación: usa el sitio de producción en https://swmm6.is-local.org, o sigue [Cómo Ejecutar la Aplicación Localmente](../how-to/01-ejecutar-localmente.md). Si es tu primera vez, trabaja primero con [Primeros Pasos con Local SWMM](01-inicio-rapido.md).

## Paso 1 — Elige tus unidades

1. Haz clic en el **Ícono de Engranaje** del mapa para abrir el menú **Map Settings**.
2. Bajo **Units**, selecciona **SI** (metros, milímetros, LPS) o **US** (pies, pulgadas, CFS).

Nota para más adelante: si agregas una malla 2D a tu modelo, **2D es solo SI** — una corrida con una malla 2D presente mientras las unidades son US se rechaza con una advertencia.

## Paso 2 — Agrega nodos

1. En la **Paleta de Herramientas Izquierda**, elige una **herramienta de Nodo** — **Junction**, **Outfall**, **Storage** o **Divider**.
2. **Haz clic en el mapa** para colocar un nodo de ese tipo.

Dos cosas a tener en cuenta:

- Cuando colocas un nodo, la aplicación **extrae automáticamente la elevación del terreno desde el DEM de Mapbox**. Puedes hacer clic en **Sample DEM Elevation** en el panel **Properties** para actualizar la elevación de un nodo seleccionado.
- Cada elemento recibe un ID generado automáticamente: los nodos usan los prefijos `J` (junction), `O` (outfall), `ST` (storage), `D` (divider), `RG` (rain gage); los enlaces usan `C`, `P`, `W`, `OR`, `OL`; las subcuencas usan `S`.

Debes colocar al menos **un outfall**: la aplicación se niega a ejecutar un modelo sin nodos o sin `OUTFALL`.

## Paso 3 — Conecta los nodos con enlaces

1. En la **Paleta de Herramientas Izquierda**, elige la herramienta **Conduit** (o **Pump**, **Weir** u **Orifice** para otros tipos de enlace).
2. **Haz clic en un nodo de inicio y en un nodo de fin** para dibujar el enlace.

La longitud del conducto se calcula automáticamente. Los conductos nuevos vienen con valores predeterminados sensatos: `roughness:0.013`, `autoLength:true`, `xShape:'CIRCULAR'`, `geom1:1.0`, `barrels:1`.

## Paso 4 — Agrega una subcuenca y un pluviómetro

1. Elige la herramienta **Subcatchment** y luego **haz clic en varios puntos del mapa** para dibujar el polígono de la subcuenca. **Haz doble clic** para cerrar el polígono.
2. Elige la herramienta **Rain Gage** y **haz clic en el mapa** para agregar un objeto de pluviómetro.

Cuando cierras una subcuenca, su área se calcula automáticamente (en ha/ac) y **el nodo hidráulico más cercano se elige como su punto de salida**.

Consejo: con la **Select Tool** (`Esc`) puedes hacer clic en los elementos para seleccionarlos y **arrastrar nodos para mover su posición**. Deshaz con `Ctrl+Z`, rehaz con `Ctrl+Shift+Z`; `Del`/`Backspace` elimina el elemento seleccionado.

## Paso 5 — Configura los parámetros

1. Haz clic en un elemento con la **Select Tool** para mostrar sus propiedades en la pestaña **Properties** del panel derecho.
2. Edita los valores que necesites.
3. Para opciones de todo el solver, haz clic en **Options** en la **Barra de Herramientas Superior**:
   - **Node Continuity**: selecciona la formulación **Legacy (Default)** o **SEMI_IMPLICIT (Enhanced)**.
   - **Anderson Acceleration**: selecciona **Yes** para acelerar la convergencia de la iteración de Picard en transiciones de sobrenivel rígidas.
   - **Physics-Based RDII Abstraction Recovery**: ingresa los parámetros de recuperación (`k0`, `kT`, `Tref`) para la recuperación de la infiltración de precipitación.

## Paso 6 — Guarda tu trabajo

- **Save**: haz clic en **Save** para exportar tu modelo a un archivo `.json` (un archivo de proyecto `*.oswmm.json` con impresión bonita) o guardarlo en el almacenamiento del navegador.
- La aplicación también guarda automáticamente por ti: cada cambio se almacena en el almacenamiento del navegador después de un breve debounce (clave de localStorage `openswmm3d.project`, con respaldo IndexedDB) y se restaura en la siguiente carga.
- **Load / Import** (desde el menú desplegable **Open Model ▾**) te permite reabrir archivos de proyecto, restaurar desde el almacenamiento del navegador o importar archivos `.inp`, shapefile (`.zip`) y `.dxf`.

## Paso 7 — Ejecuta la corrida

1. Asegúrate de que tu red contenga **al menos un nodo outfall y conductos conectados**.
2. Haz clic en **Run** en la **Barra de Herramientas Superior**.
3. Supervisa el progreso en la ventana **Run Status** (porcentaje de progreso y tiempo simulado en `Days` y `Hrs:Min`). Puedes **Stop** la corrida o **Minimize** a una insignia flotante en cualquier momento.

Si la corrida aborta de inmediato con una advertencia, las causas son: sin nodos, sin `OUTFALL`, o **unidades US con una malla 2D** (2D es solo SI).

## Paso 8 — Inspecciona los resultados

- **Panel de Control Deslizante de Tiempo**: usa la barra de animación inferior para reproducir, pausar, cambiar la velocidad o arrastrar hasta un paso de tiempo específico. Los colores del mapa se actualizan por paso.
- **Pestaña Properties**: haz clic en cualquier nodo o enlace para ver sus propiedades geométricas y **los caudales calculados**.
- **Pestaña Results**: selecciona categorías de resultados para ver tablas resumen — Node Depths, Node Inflows, Link Flows y Subcatchment Runoff.
- **Perfil de Elevación de Agua**: selecciona nodos conectados y pulsa **Profile** para ver un gráfico de perfil hidráulico interactivo.

## Lo que deberías ver al final

- Una red con nodos (incluido un outfall), enlaces y una subcuenca, cada uno con un ID y propiedades editables.
- Una corrida completada con las pestañas **Results** y **Report** pobladas en el panel derecho.
- Una reproducción animada de la simulación en el mapa mediante el control deslizante de tiempo.

## Siguientes pasos

- **Agrega una malla 2D** para el tránsito superficial sobre el terreno: usa el botón **Mesh2D** o el menú **Data** (**2D Mesh**) para abrir el diálogo de malla, un modal de 3 pestañas (**Sources / Quality / Hydraulics**) que genera la malla de superficie. Recuerda que 2D requiere unidades SI.
- Aprende más sobre el modelo detrás de la UI en las secciones de referencia de esta documentación.
