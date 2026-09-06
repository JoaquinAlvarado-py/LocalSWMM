import{_ as s,o as n,c as i,a0 as e}from"./chunks/framework.BGyYNsHo.js";const u=JSON.parse('{"title":"Por qué la actualización semi-implícita es una sola ecuación","description":"","frontmatter":{},"headers":[],"relativePath":"es/explanation/notas/03-matematica-de-la-actualizacion-semi-implicita.md","filePath":"es/explanation/notas/03-matematica-de-la-actualizacion-semi-implicita.md"}'),p={name:"es/explanation/notas/03-matematica-de-la-actualizacion-semi-implicita.md"};function t(l,a,c,o,d,m){return n(),i("div",null,[...a[0]||(a[0]=[e(`<h1 id="por-que-la-actualizacion-semi-implicita-es-una-sola-ecuacion" tabindex="-1">Por qué la actualización semi-implícita es una sola ecuación <a class="header-anchor" href="#por-que-la-actualizacion-semi-implicita-es-una-sola-ecuacion" aria-label="Permalink to &quot;Por qué la actualización semi-implícita es una sola ecuación&quot;">​</a></h1><p>Derivación en cinco pasos de la actualización unificada de tirantes de nodo, desde la ecuación de continuidad pasando por la integración trapezoidal y la linealización del término de salida hasta la resolución en forma cerrada.</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>  ┌───────────────────────────────┐</span></span>
<span class="line"><span>  │ 1 · Continuidad               │</span></span>
<span class="line"><span>  │ $A \\cdot dH/dt = Q_{net}(H)$  │</span></span>
<span class="line"><span>  │ almacenamiento = ingreso neto │</span></span>
<span class="line"><span>  └──────────────┬────────────────┘</span></span>
<span class="line"><span>                 │</span></span>
<span class="line"><span>  ┌──────────────▼────────────────┐</span></span>
<span class="line"><span>  │ 2 · Regla del trapecio        │</span></span>
<span class="line"><span>  │ $A \\cdot dH = 0.5 \\cdot (Q_{old} + Q_{new}) \\cdot dt$ │</span></span>
<span class="line"><span>  │ integrar sobre dt             │</span></span>
<span class="line"><span>  └──────────────┬────────────────┘</span></span>
<span class="line"><span>                 │</span></span>
<span class="line"><span>  ┌──────────────▼────────────────┐</span></span>
<span class="line"><span>  │ 3 · Linealizar salida         │</span></span>
<span class="line"><span>  │ $Q_{new} \\approx Q_{net} - \\Sigma dqdh \\cdot dH$  │</span></span>
<span class="line"><span>  │ $\\partial Q_{net}/\\partial H = -\\Sigma dqdh$     │</span></span>
<span class="line"><span>  └──────────────┬────────────────┘</span></span>
<span class="line"><span>                 │</span></span>
<span class="line"><span>  ┌──────────────▼────────────────┐</span></span>
<span class="line"><span>  │ 4 · Sustituir                 │</span></span>
<span class="line"><span>  │ $(A + 0.5 \\cdot \\Sigma dqdh \\cdot dt) \\cdot dH = dV$ │</span></span>
<span class="line"><span>  │ $dV = 0.5 \\cdot (Q_{old} + Q_{net}) \\cdot dt$       │</span></span>
<span class="line"><span>  └──────────────┬────────────────┘</span></span>
<span class="line"><span>                 │ ★ método nuevo</span></span>
<span class="line"><span>  ┌──────────────▼────────────────┐</span></span>
<span class="line"><span>  │ 5 · Resolver                  │</span></span>
<span class="line"><span>  │ $dH = \\frac{dV}{A + 0.5 \\cdot dt \\cdot \\Sigma dqdh}$ │</span></span>
<span class="line"><span>  │ una ecuación · todo régimen   │</span></span>
<span class="line"><span>  └───────────────────────────────┘</span></span></code></pre></div><blockquote><p><span class="katex"><span class="katex-mathml"><math><semantics><mrow><mi mathvariant="normal">Σ</mi><mi>d</mi><mi>q</mi><mi>d</mi><mi>h</mi></mrow><annotation encoding="application/x-tex">\\Sigma dqdh</annotation></semantics></math></span><span class="katex-html" aria-hidden="true"><span class="strut" style="height:0.69444em;"></span><span class="strut bottom" style="height:0.8888799999999999em;vertical-align:-0.19444em;"></span><span class="base textstyle uncramped"><span class="mord mathrm">Σ</span><span class="mord mathit">d</span><span class="mord mathit" style="margin-right:0.03588em;">q</span><span class="mord mathit">d</span><span class="mord mathit">h</span></span></span></span> es el amortiguamiento propio de la ecuación — una carga en ascenso drena más, por lo que la actualización se encoge.</p></blockquote><blockquote><p>el trapecio reutiliza el ingreso neto del paso anterior — <span class="katex"><span class="katex-mathml"><math><semantics><mrow><mi>d</mi><mi>V</mi></mrow><annotation encoding="application/x-tex">dV</annotation></semantics></math></span><span class="katex-html" aria-hidden="true"><span class="strut" style="height:0.69444em;"></span><span class="strut bottom" style="height:0.69444em;vertical-align:0em;"></span><span class="base textstyle uncramped"><span class="mord mathit">d</span><span class="mord mathit" style="margin-right:0.22222em;">V</span></span></span></span> es Crank–Nicolson.</p></blockquote><p>Leyenda:</p><ul><li>Rectángulo: paso de la derivación</li><li>★ Flecha de énfasis: método nuevo (el paso de resolución)</li><li>Líder discontinuo: acotación editorial (las dos notas de arriba)</li></ul><p>Original: <a href="./../../../sources/1d-semi-implicit-math.html">1d-semi-implicit-math.html</a></p>`,8)])])}const h=s(p,[["render",t]]);export{u as __pageData,h as default};
