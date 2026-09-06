import{_ as n,o as s,c as e,a0 as p}from"./chunks/framework.BGyYNsHo.js";const _=JSON.parse('{"title":"Aceleración de Anderson: mezclar dos iterados","description":"","frontmatter":{},"headers":[],"relativePath":"es/explanation/notas/04-aceleracion-de-anderson.md","filePath":"es/explanation/notas/04-aceleracion-de-anderson.md"}'),l={name:"es/explanation/notas/04-aceleracion-de-anderson.md"};function c(i,a,o,t,r,d){return s(),e("div",null,[...a[0]||(a[0]=[p(`<h1 id="aceleracion-de-anderson-mezclar-dos-iterados" tabindex="-1">Aceleración de Anderson: mezclar dos iterados <a class="header-anchor" href="#aceleracion-de-anderson-mezclar-dos-iterados" aria-label="Permalink to &quot;Aceleración de Anderson: mezclar dos iterados&quot;">​</a></h1><p>Proceso de la aceleración de Anderson dentro de la iteración de Picard: residual por nodo, compuertas de seguridad, coeficiente de mezcla, mezcla, confirmación de estado y el test dual de convergencia, con el bucle de reintento de vuelta al solver.</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>  PASO 1..7  RESOLVER · RESIDUAL · COMPUERTAS · COEF · MEZCLA · ¿CONVERGE? · SIGUIENTE</span></span>
<span class="line"><span></span></span>
<span class="line"><span>      VÍAS:   PICARD │ ANDERSON</span></span>
<span class="line"><span></span></span>
<span class="line"><span>  ┌──────────────────────────────────┐</span></span>
<span class="line"><span>  │ [1] RESOLVER · [PIC]             │</span></span>
<span class="line"><span>  │ Solución de Picard               │</span></span>
<span class="line"><span>  │ $y_{last} \\to g_k$               │</span></span>
<span class="line"><span>  │ momentum + continuidad           │</span></span>
<span class="line"><span>  └───────────────┬──────────────────┘</span></span>
<span class="line"><span>                  │</span></span>
<span class="line"><span>  ┌───────────────▼──────────────────┐</span></span>
<span class="line"><span>  │ [2] RESIDUAL · [AND]             │</span></span>
<span class="line"><span>  │ Residual                         │</span></span>
<span class="line"><span>  │ $r_k = g_k - y_{last}$           │</span></span>
<span class="line"><span>  │ retomar $r_{k-1}$ · $g_{prev}$   │</span></span>
<span class="line"><span>  └───────────────┬──────────────────┘</span></span>
<span class="line"><span>                  │</span></span>
<span class="line"><span>  ┌───────────────▼──────────────────┐</span></span>
<span class="line"><span>  │ [3] COMPUERTAS · [AND]           │</span></span>
<span class="line"><span>  │ $|r_k| \\le 20 \\cdot tol$         │</span></span>
<span class="line"><span>  │ step ≥ 1 · sin flag de salto     │</span></span>
<span class="line"><span>  └───────────────┬──────────────────┘</span></span>
<span class="line"><span>                  │</span></span>
<span class="line"><span>  ┌───────────────▼──────────────────┐</span></span>
<span class="line"><span>  │ [4] COEF · [AND]                 │</span></span>
<span class="line"><span>  │ $\\alpha = r_k \\cdot dr / dr^2$   │</span></span>
<span class="line"><span>  │ acotado a [0, 1]                 │</span></span>
<span class="line"><span>  └───────────────┬──────────────────┘</span></span>
<span class="line"><span>                  │</span></span>
<span class="line"><span>  ┌───────────────▼──────────────────┐</span></span>
<span class="line"><span>  │ [5] MEZCLA · [AND]               │</span></span>
<span class="line"><span>  │ $y = (1-\\alpha) g_k + \\alpha \\cdot g_{prev}$  │</span></span>
<span class="line"><span>  │ y ≥ 0 · recalcular dV            │</span></span>
<span class="line"><span>  └───────────────┬──────────────────┘</span></span>
<span class="line"><span>                  │ ★</span></span>
<span class="line"><span>  ┌───────────────▼──────────────────┐</span></span>
<span class="line"><span>  │ [6] CONVERGE? · [PIC]  ★         │</span></span>
<span class="line"><span>  │ $|g_k - y_{last}| \\le tol$       │</span></span>
<span class="line"><span>  │ y $|y - y_{last}| \\le tol$       │</span></span>
<span class="line"><span>  └───────┬──────────────┬───────────┘</span></span>
<span class="line"><span>     no / REINTENTO ≤8   │ yes</span></span>
<span class="line"><span>     │                   │</span></span>
<span class="line"><span>     ▼                   │</span></span>
<span class="line"><span>  (vuelta a [1]          ▼</span></span>
<span class="line"><span>  Iterar Picard) ┌──────────────────────────────┐</span></span>
<span class="line"><span>                 │ [7] SIGUIENTE · [PIC]        │</span></span>
<span class="line"><span>                 │ Siguiente paso               │</span></span>
<span class="line"><span>                 │ salir del bucle de Picard    │</span></span>
<span class="line"><span>                 │ reporte · instantánea        │</span></span>
<span class="line"><span>                 └──────────────────────────────┘</span></span></code></pre></div><blockquote><p>AA se omite en cada quiebre de rama: en carga, encharcamiento, ranura, vertedero, orificio, bomba</p></blockquote><p>Leyenda de flujo:</p><ul><li>★ Entrega crítica (mezcla → test de convergencia, y test de convergencia → siguiente paso)</li><li>Entrega secuencial (flechas simples entre pasos consecutivos)</li><li>Bucle de reintento (flecha discontinua del paso 6 de vuelta al paso 1, etiquetada REINTENTO ≤8)</li></ul><p>Original: <a href="./../../../sources/1d-anderson-accel.html">1d-anderson-accel.html</a></p>`,7)])])}const m=n(l,[["render",c]]);export{_ as __pageData,m as default};
