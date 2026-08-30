# Orquestación de la simulación

<!-- Parte de la serie de explicación de Hidráulica 1D -->

## El ciclo de avance temporal global

El motor es una API de paso único. Cada llamada a `SWMMEngine::step()` ejecuta exactamente un paso de tránsito (o un paso solo de escorrentía cuando el tránsito está deshabilitado). La secuencia dentro de un paso es (`SWMMEngine.cpp:941`):

1. Calcular el paso de tránsito $dt_{\mathrm{next}}$. Si la opción de paso variable está habilitada, el paso limitado por Courant es

$$dt_{\mathrm{cfl}} = \texttt{router.getAdaptiveStep}(\texttt{routing\_step},\ \texttt{variable\_step}),$$

   luego $dt_{\mathrm{next}} = \min(\texttt{routing\_step},\ dt_{\mathrm{cfl}})$ acotado a la duración restante de la simulación.
2. Guardar el estado hidráulico anterior (`ctx.save_state()`).
3. Reiniciar los acumuladores de balance de masa del paso.
4. Ejecutar la cadena:
   1. `stepRunoff($dt$)` — hidrología (siempre);
   2. si el tránsito está habilitado: `stepRouting($dt$)` (hidráulica + calidad), `updateStatistics($dt$)`, `updateRoutingMassBalance($dt$)`;
   3. `computeFinalStorage()`.
5. Avanzar el reloj de la simulación y publicar las instantáneas de salida.

## Relojes de escorrentía y de tránsito

La hidrología y la hidráulica corren en relojes *independientes*:

- El **reloj de escorrentía** avanza al paso húmedo (300 s por defecto) o al paso seco (3600 s por defecto), acortado para alinear con los límites de los pluviómetros. `stepRunoff` ejecuta múltiples subpasos de escorrentía dentro de un paso de tránsito ($\text{mientras } t_{\mathrm{runoff}} < t_{\mathrm{routing}} + dt$).
- El **reloj de tránsito** avanza en $dt$ (el paso de tránsito) en cada llamada a `step()`.

Después de los subpasos de escorrentía, el aporte lateral de tiempo húmedo entregado a los nodos se obtiene por *interpolación lineal* entre las evaluaciones de escorrentía que lo enmarcan: con $f = (t_{\mathrm{elapsed}} - t_{\mathrm{runoff,old}}) / (t_{\mathrm{runoff,new}} - t_{\mathrm{runoff,old}})$,

$$Q_{\mathrm{runoff}} = (1-f)\,Q_{\mathrm{runoff}}^{\mathrm{old}} + f\,Q_{\mathrm{runoff}}^{\mathrm{new}},$$

más los aportes por escurrimiento superficial recibido (runon) y por napa freática. Estos se distribuyen en `nodes.runoff_inflow` / `nodes.gw_inflow`.

## Aportes laterales

En cada paso de tránsito, los aportes laterales se ensamblan a partir de los búferes de fuente descompuestos en el orden legado (`assembleLateralInflows`, `SWMMEngine.cpp:5691`):

$$Q_{\mathrm{lat}} = Q_{\mathrm{ext}} + Q_{\mathrm{dwf}} + Q_{\mathrm{wet}} + Q_{\mathrm{gw}} + Q_{\mathrm{rdii}} + Q_{\mathrm{iface}} + Q_{\mathrm{user}} + Q_{\mathrm{coupling}},$$

donde los términos son, respectivamente: series de tiempo externas/ingresos, caudal de tiempo seco (DWF), ingreso de tiempo húmedo (escorrentía), ingreso de napa freática, RDII (infiltración/entrada por lluvia), ingreso por archivo de interfaz, ingreso forzado por el usuario e ingreso por acoplamiento 1D–2D.

## El paso de tránsito

`Router::step(ctx, dt, evap_rate, non_conduit_fn)` (`Routing.cpp:308`) ejecuta, en orden:

1. **initNodeFlows** — inicializa el ingreso de cada nodo desde el aporte lateral y la salida desde las pérdidas (evaporación del estanque y exfiltración de Green–Ampt, acotadas conjuntamente por el volumen almacenado); fija el rebalse a partir del exceso de volumen almacenado.
2. **computeConduitLosses** — tasas de pérdida de los conductos por evaporación (secciones abiertas) y filtración. Para DYNWAVE esto se recalcula en su lugar en cada iteración de Picard dentro del solver.
3. **setAllOutfallDepths** — fija los niveles de agua de borde de los emisarios (Sección 13).
4. **Despacho del solver** — KINWAVE, DYNWAVE, FV o STEADY.
5. **computeDividerFlows** — aplica la lógica de divisores de flujo.
6. **updateLinkStates** — recalcula las cargas de los nodos $H = z_{\mathrm{inv}} + d$.

Dentro del solver de onda dinámica, la función de retorno de no-conducto calcula los caudales de bombas/orificios/vertederos/descargas dentro de la iteración de Picard, en orden de índice de enlace, con distribución inmediata en los acumuladores de ingreso/salida de los nodos.
