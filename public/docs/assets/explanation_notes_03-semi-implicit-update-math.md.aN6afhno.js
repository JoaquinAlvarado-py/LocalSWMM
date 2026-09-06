import{_ as s,o as n,c as t,a0 as e}from"./chunks/framework.BGyYNsHo.js";const h=JSON.parse('{"title":"Why the semi-implicit update is one equation","description":"","frontmatter":{},"headers":[],"relativePath":"explanation/notes/03-semi-implicit-update-math.md","filePath":"explanation/notes/03-semi-implicit-update-math.md"}'),p={name:"explanation/notes/03-semi-implicit-update-math.md"};function i(l,a,o,c,m,d){return n(),t("div",null,[...a[0]||(a[0]=[e(`<h1 id="why-the-semi-implicit-update-is-one-equation" tabindex="-1">Why the semi-implicit update is one equation <a class="header-anchor" href="#why-the-semi-implicit-update-is-one-equation" aria-label="Permalink to &quot;Why the semi-implicit update is one equation&quot;">​</a></h1><p>Five-step derivation of the unified node depth update, from the continuity equation through trapezoidal integration and linearization of the outflow term to the closed-form solve.</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>  ┌───────────────────────────────┐</span></span>
<span class="line"><span>  │ 1 · Continuity                │</span></span>
<span class="line"><span>  │ $A \\cdot dH/dt = Q_{net}(H)$  │</span></span>
<span class="line"><span>  │ storage = net inflow          │</span></span>
<span class="line"><span>  └──────────────┬────────────────┘</span></span>
<span class="line"><span>                 │</span></span>
<span class="line"><span>  ┌──────────────▼────────────────┐</span></span>
<span class="line"><span>  │ 2 · Trapezoid rule            │</span></span>
<span class="line"><span>  │ $A \\cdot dH = 0.5 \\cdot (Q_{old} + Q_{new}) \\cdot dt$ │</span></span>
<span class="line"><span>  │ integrate over dt             │</span></span>
<span class="line"><span>  └──────────────┬────────────────┘</span></span>
<span class="line"><span>                 │</span></span>
<span class="line"><span>  ┌──────────────▼────────────────┐</span></span>
<span class="line"><span>  │ 3 · Linearize outflow         │</span></span>
<span class="line"><span>  │ $Q_{new} \\approx Q_{net} - \\Sigma dqdh \\cdot dH$  │</span></span>
<span class="line"><span>  │ $\\partial Q_{net}/\\partial H = -\\Sigma dqdh$     │</span></span>
<span class="line"><span>  └──────────────┬────────────────┘</span></span>
<span class="line"><span>                 │</span></span>
<span class="line"><span>  ┌──────────────▼────────────────┐</span></span>
<span class="line"><span>  │ 4 · Substitute                │</span></span>
<span class="line"><span>  │ $(A + 0.5 \\cdot \\Sigma dqdh \\cdot dt) \\cdot dH = dV$ │</span></span>
<span class="line"><span>  │ $dV = 0.5 \\cdot (Q_{old} + Q_{net}) \\cdot dt$       │</span></span>
<span class="line"><span>  └──────────────┬────────────────┘</span></span>
<span class="line"><span>                 │ ★ new method</span></span>
<span class="line"><span>  ┌──────────────▼────────────────┐</span></span>
<span class="line"><span>  │ 5 · Solve                     │</span></span>
<span class="line"><span>  │ $dH = \\frac{dV}{A + 0.5 \\cdot dt \\cdot \\Sigma dqdh}$ │</span></span>
<span class="line"><span>  │ one equation · every regime   │</span></span>
<span class="line"><span>  └───────────────────────────────┘</span></span></code></pre></div><blockquote><p><span class="katex"><span class="katex-mathml"><math><semantics><mrow><mi mathvariant="normal">Σ</mi><mi>d</mi><mi>q</mi><mi>d</mi><mi>h</mi></mrow><annotation encoding="application/x-tex">\\Sigma dqdh</annotation></semantics></math></span><span class="katex-html" aria-hidden="true"><span class="strut" style="height:0.69444em;"></span><span class="strut bottom" style="height:0.8888799999999999em;vertical-align:-0.19444em;"></span><span class="base textstyle uncramped"><span class="mord mathrm">Σ</span><span class="mord mathit">d</span><span class="mord mathit" style="margin-right:0.03588em;">q</span><span class="mord mathit">d</span><span class="mord mathit">h</span></span></span></span> is the equation&#39;s own damping — a rising head drains more, so the update shrinks.</p></blockquote><blockquote><p>the trapezoid reuses the previous step&#39;s net inflow — <span class="katex"><span class="katex-mathml"><math><semantics><mrow><mi>d</mi><mi>V</mi></mrow><annotation encoding="application/x-tex">dV</annotation></semantics></math></span><span class="katex-html" aria-hidden="true"><span class="strut" style="height:0.69444em;"></span><span class="strut bottom" style="height:0.69444em;vertical-align:0em;"></span><span class="base textstyle uncramped"><span class="mord mathit">d</span><span class="mord mathit" style="margin-right:0.22222em;">V</span></span></span></span> is Crank–Nicolson.</p></blockquote><p>Legend:</p><ul><li>Rectangle: derivation step</li><li>★ Accent arrow: new method (the solve step)</li><li>Dashed leader: editorial aside (the two callouts above)</li></ul><p>Original: <a href="./../../sources/1d-semi-implicit-math.html">1d-semi-implicit-math.html</a></p>`,8)])])}const u=s(p,[["render",i]]);export{h as __pageData,u as default};
