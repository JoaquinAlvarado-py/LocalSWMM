import{_ as s,o as a,c as p,a0 as e}from"./chunks/framework.BL79I5mR.js";const m=JSON.parse('{"title":"Node continuity — two depth-update formulations","description":"","frontmatter":{},"headers":[],"relativePath":"explanation/notes/02-node-continuity-formulations.md","filePath":"explanation/notes/02-node-continuity-formulations.md"}'),i={name:"explanation/notes/02-node-continuity-formulations.md"};function l(t,n,o,c,d,r){return a(),p("div",null,[...n[0]||(n[0]=[e(`<h1 id="node-continuity-—-two-depth-update-formulations" tabindex="-1">Node continuity — two depth-update formulations <a class="header-anchor" href="#node-continuity-—-two-depth-update-formulations" aria-label="Permalink to &quot;Node continuity — two depth-update formulations&quot;">​</a></h1><p>Flowchart of the dynamic-wave node depth update: both formulations share the trapezoidal volume change, then semi-implicit uses one unified equation while the explicit path branches into free-surface and surcharged updates, before under-relaxation and state commit.</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>         ╭─────────────────────────────────────╮</span></span>
<span class="line"><span>         │        Node continuity               │   start (oval)</span></span>
<span class="line"><span>         ╰──────────────────┬──────────────────╯</span></span>
<span class="line"><span>                            │</span></span>
<span class="line"><span>         ┌──────────────────▼──────────────────┐</span></span>
<span class="line"><span>         │ Mass balance                        │</span></span>
<span class="line"><span>         │ $dQ = Q_{in} - Q_{out}$             │</span></span>
<span class="line"><span>         │ $dV = 0.5 \\cdot (Q_{old} + dQ) \\cdot dt$   │</span></span>
<span class="line"><span>         └──────────────────┬──────────────────┘</span></span>
<span class="line"><span>                            │</span></span>
<span class="line"><span>              ┌─────────────▼─────────────┐</span></span>
<span class="line"><span>              │     SEMI-IMPLICIT?        │   decision (diamond)</span></span>
<span class="line"><span>              └──────┬─────────────┬──────┘</span></span>
<span class="line"><span>             yes ★   │             │ no</span></span>
<span class="line"><span>                     │             │</span></span>
<span class="line"><span>                     │             ▼</span></span>
<span class="line"><span>   ┌─────────────────▼────────┐  ┌─────────────────────────┐</span></span>
<span class="line"><span>   │ Semi-implicit            │  │ EXTRAN SURCHARGED?      │  decision (diamond)</span></span>
<span class="line"><span>   │ ★ new method             │  └──────┬───────────┬──────┘</span></span>
<span class="line"><span>   │ $dy = dV / (A + 0.5 \\cdot dt \\cdot \\Sigma dqdh)$ │  yes │        │ no</span></span>
<span class="line"><span>   │                          │         │           │</span></span>
<span class="line"><span>   └──────────┬──────────────┘         │           │</span></span>
<span class="line"><span>              │                        │           │</span></span>
<span class="line"><span>              │                        ▼           ▼</span></span>
<span class="line"><span>              │         ┌────────────────────┐  ┌─────────────┐</span></span>
<span class="line"><span>              │         │ EXTRAN dQ/dH       │  │ Free surface│</span></span>
<span class="line"><span>              │         │ $dy = corr \\cdot dQ / denom$  │  │ $dy = dV / A$│</span></span>
<span class="line"><span>              │         │ crown blend        │  └──────┬──────┘</span></span>
<span class="line"><span>              │         │ exp(−15·f)         │         │</span></span>
<span class="line"><span>              │         └─────────┬──────────┘         │</span></span>
<span class="line"><span>              │                   │                    │</span></span>
<span class="line"><span>              ▼                   ▼                    ▼</span></span>
<span class="line"><span>   ┌──────────────────────────────────────────────────────┐</span></span>
<span class="line"><span>   │ Under-relax · pond floor                             │</span></span>
<span class="line"><span>   │ $y = (1-\\omega) \\cdot y_{last} + \\omega \\cdot y_{new}$      │</span></span>
<span class="line"><span>   │ ω = 0.5 · FUDGE = 0.0001                            │</span></span>
<span class="line"><span>   └──────────────────────────┬───────────────────────────┘</span></span>
<span class="line"><span>                              │</span></span>
<span class="line"><span>   ┌──────────────────────────▼───────────────────────────┐</span></span>
<span class="line"><span>   │ Commit state                                         │</span></span>
<span class="line"><span>   │ $overflow = dV/dt \\cdot y_{max}$ cap                 │</span></span>
<span class="line"><span>   │ $head = invert + y \\cdot dYdT$                       │</span></span>
<span class="line"><span>   └──────────────────────────────────────────────────────┘</span></span></code></pre></div><p>Legend — shape carries type:</p><ul><li>Oval: start / end</li><li>Rectangle: step</li><li>Diamond: decision</li><li>★ Accent: new method (semi-implicit)</li><li>Plain arrow: branch</li></ul><p>Original: <a href="./../../sources/1d-node-continuity.html">1d-node-continuity.html</a></p>`,6)])])}const h=s(i,[["render",l]]);export{m as __pageData,h as default};
