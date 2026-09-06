import{_ as a,o as s,c as p,a0 as e}from"./chunks/framework.BL79I5mR.js";const m=JSON.parse('{"title":"Continuidad de nodo — dos formulaciones de actualización de tirantes","description":"","frontmatter":{},"headers":[],"relativePath":"es/explanation/notas/02-formulaciones-de-continuidad-de-nodo.md","filePath":"es/explanation/notas/02-formulaciones-de-continuidad-de-nodo.md"}'),i={name:"es/explanation/notas/02-formulaciones-de-continuidad-de-nodo.md"};function l(o,n,c,d,t,r){return s(),p("div",null,[...n[0]||(n[0]=[e(`<h1 id="continuidad-de-nodo-—-dos-formulaciones-de-actualizacion-de-tirantes" tabindex="-1">Continuidad de nodo — dos formulaciones de actualización de tirantes <a class="header-anchor" href="#continuidad-de-nodo-—-dos-formulaciones-de-actualizacion-de-tirantes" aria-label="Permalink to &quot;Continuidad de nodo — dos formulaciones de actualización de tirantes&quot;">​</a></h1><p>Flujograma de la actualización de tirantes de nodo de la onda dinámica: ambas formulaciones comparten el cambio de volumen trapezoidal, luego la semi-implícita usa una única ecuación unificada mientras que la vía explícita se bifurca en actualizaciones de superficie libre y en carga, antes de la subrelajación y la confirmación del estado.</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>         ╭─────────────────────────────────────╮</span></span>
<span class="line"><span>         │        Continuidad de nodo           │   inicio (óvalo)</span></span>
<span class="line"><span>         ╰──────────────────┬──────────────────╯</span></span>
<span class="line"><span>                            │</span></span>
<span class="line"><span>         ┌──────────────────▼──────────────────┐</span></span>
<span class="line"><span>         │ Balance de masa                     │</span></span>
<span class="line"><span>         │ $dQ = Q_{in} - Q_{out}$             │</span></span>
<span class="line"><span>         │ $dV = 0.5 \\cdot (Q_{old} + dQ) \\cdot dt$   │</span></span>
<span class="line"><span>         └──────────────────┬──────────────────┘</span></span>
<span class="line"><span>                            │</span></span>
<span class="line"><span>              ┌─────────────▼─────────────┐</span></span>
<span class="line"><span>              │     ¿SEMI-IMPLÍCITO?      │   decisión (rombo)  </span></span>
<span class="line"><span>              └──────┬─────────────┬──────┘</span></span>
<span class="line"><span>             sí  ★   │             │ no</span></span>
<span class="line"><span>                     │             │</span></span>
<span class="line"><span>                     │             ▼</span></span>
<span class="line"><span>   ┌─────────────────▼────────┐  ┌─────────────────────────┐</span></span>
<span class="line"><span>   │ Semi-implícito           │  │ ¿EXTRAN EN CARGA?       │  decisión (rombo)  </span></span>
<span class="line"><span>   │ ★ método nuevo           │  └──────┬───────────┬──────┘</span></span>
<span class="line"><span>   │ $dy = dV / (A + 0.5 \\cdot dt \\cdot \\Sigma dqdh)$ │  yes │        │ no</span></span>
<span class="line"><span>   │                          │         │           │</span></span>
<span class="line"><span>   └──────────┬──────────────┘         │           │</span></span>
<span class="line"><span>              │                        │           │</span></span>
<span class="line"><span>              │                        ▼           ▼</span></span>
<span class="line"><span>              │         ┌────────────────────┐  ┌─────────────┐</span></span>
<span class="line"><span>              │         │ EXTRAN dQ/dH       │  │ Free surface│</span></span>
<span class="line"><span>              │         │ $dy = corr \\cdot dQ / denom$  │  │ $dy = dV / A$│</span></span>
<span class="line"><span>              │         │ mezcla de clave    │  └──────┬──────┘</span></span>
<span class="line"><span>              │         │ exp(−15·f)         │         │</span></span>
<span class="line"><span>              │         └─────────┬──────────┘         │</span></span>
<span class="line"><span>              │                   │                    │</span></span>
<span class="line"><span>              ▼                   ▼                    ▼</span></span>
<span class="line"><span>   ┌──────────────────────────────────────────────────────┐</span></span>
<span class="line"><span>   │ Subrelajación · piso de encharcamiento               │</span></span>
<span class="line"><span>   │ $y = (1-\\omega) \\cdot y_{last} + \\omega \\cdot y_{new}$      │</span></span>
<span class="line"><span>   │ ω = 0.5 · FUDGE = 0.0001                            │</span></span>
<span class="line"><span>   └──────────────────────────┬───────────────────────────┘</span></span>
<span class="line"><span>                              │</span></span>
<span class="line"><span>   ┌──────────────────────────▼───────────────────────────┐</span></span>
<span class="line"><span>   │ Confirmar estado                                     │</span></span>
<span class="line"><span>   │ $overflow = dV/dt \\cdot y_{max}$ tope                │</span></span>
<span class="line"><span>   │ $head = invert + y \\cdot dYdT$                       │</span></span>
<span class="line"><span>   └──────────────────────────────────────────────────────┘</span></span></code></pre></div><p>Leyenda — la forma transmite el tipo:</p><ul><li>Óvalo: inicio / fin</li><li>Rectángulo: paso</li><li>Rombo: decisión</li><li>★ Énfasis: método nuevo (semi-implícito)</li><li>Flecha simple: rama</li></ul><p>Original: <a href="./../../../sources/1d-node-continuity.html">1d-node-continuity.html</a></p>`,6)])])}const f=a(i,[["render",l]]);export{m as __pageData,f as default};
