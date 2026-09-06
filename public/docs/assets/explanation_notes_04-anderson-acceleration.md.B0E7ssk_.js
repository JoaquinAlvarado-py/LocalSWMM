import{_ as s,o as a,c as p,a0 as e}from"./chunks/framework.BGyYNsHo.js";const h=JSON.parse('{"title":"Anderson acceleration: mixing two iterates","description":"","frontmatter":{},"headers":[],"relativePath":"explanation/notes/04-anderson-acceleration.md","filePath":"explanation/notes/04-anderson-acceleration.md"}'),l={name:"explanation/notes/04-anderson-acceleration.md"};function i(t,n,c,o,r,d){return a(),p("div",null,[...n[0]||(n[0]=[e(`<h1 id="anderson-acceleration-mixing-two-iterates" tabindex="-1">Anderson acceleration: mixing two iterates <a class="header-anchor" href="#anderson-acceleration-mixing-two-iterates" aria-label="Permalink to &quot;Anderson acceleration: mixing two iterates&quot;">​</a></h1><p>Process of Anderson acceleration inside the Picard iteration: per-node residual, safety gates, mixing coefficient, blend, state commit, and the dual convergence test, with the retry loop back to the solver.</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>  STEP 1..7  SOLVE · RESIDUAL · GATES · COEFF · BLEND · CONVERGE? · NEXT</span></span>
<span class="line"><span></span></span>
<span class="line"><span>      LANES:  PICARD │ ANDERSON</span></span>
<span class="line"><span></span></span>
<span class="line"><span>  ┌──────────────────────────────────┐</span></span>
<span class="line"><span>  │ [1] SOLVE · [PIC]                │</span></span>
<span class="line"><span>  │ Picard solve                     │</span></span>
<span class="line"><span>  │ $y_{last} \\to g_k$               │</span></span>
<span class="line"><span>  │ momentum + continuity            │</span></span>
<span class="line"><span>  └───────────────┬──────────────────┘</span></span>
<span class="line"><span>                  │</span></span>
<span class="line"><span>  ┌───────────────▼──────────────────┐</span></span>
<span class="line"><span>  │ [2] RESIDUAL · [AND]             │</span></span>
<span class="line"><span>  │ Residual                         │</span></span>
<span class="line"><span>  │ $r_k = g_k - y_{last}$           │</span></span>
<span class="line"><span>  │ recall $r_{k-1}$ · $g_{prev}$    │</span></span>
<span class="line"><span>  └───────────────┬──────────────────┘</span></span>
<span class="line"><span>                  │</span></span>
<span class="line"><span>  ┌───────────────▼──────────────────┐</span></span>
<span class="line"><span>  │ [3] GATES · [AND]                │</span></span>
<span class="line"><span>  │ $|r_k| \\le 20 \\cdot tol$         │</span></span>
<span class="line"><span>  │ step ≥ 1 · no skip flag          │</span></span>
<span class="line"><span>  └───────────────┬──────────────────┘</span></span>
<span class="line"><span>                  │</span></span>
<span class="line"><span>  ┌───────────────▼──────────────────┐</span></span>
<span class="line"><span>  │ [4] COEFF · [AND]                │</span></span>
<span class="line"><span>  │ $\\alpha = r_k \\cdot dr / dr^2$   │</span></span>
<span class="line"><span>  │ clamped to [0, 1]                │</span></span>
<span class="line"><span>  └───────────────┬──────────────────┘</span></span>
<span class="line"><span>                  │</span></span>
<span class="line"><span>  ┌───────────────▼──────────────────┐</span></span>
<span class="line"><span>  │ [5] BLEND · [AND]                │</span></span>
<span class="line"><span>  │ $y = (1-\\alpha) g_k + \\alpha \\cdot g_{prev}$  │</span></span>
<span class="line"><span>  │ y ≥ 0 · recompute dV             │</span></span>
<span class="line"><span>  └───────────────┬──────────────────┘</span></span>
<span class="line"><span>                  │ ★</span></span>
<span class="line"><span>  ┌───────────────▼──────────────────┐</span></span>
<span class="line"><span>  │ [6] CONVERGE? · [PIC]  ★         │</span></span>
<span class="line"><span>  │ $|g_k - y_{last}| \\le tol$       │</span></span>
<span class="line"><span>  │ and $|y - y_{last}| \\le tol$     │</span></span>
<span class="line"><span>  └───────┬──────────────┬───────────┘</span></span>
<span class="line"><span>     no / RETRY ≤8       │ yes</span></span>
<span class="line"><span>     │                   │</span></span>
<span class="line"><span>     ▼                   │</span></span>
<span class="line"><span>  (back to [1]           ▼</span></span>
<span class="line"><span>  Picard solve)  ┌──────────────────────────────┐</span></span>
<span class="line"><span>                 │ [7] NEXT · [PIC]             │</span></span>
<span class="line"><span>                 │ Next timestep                │</span></span>
<span class="line"><span>                 │ exit Picard loop             │</span></span>
<span class="line"><span>                 │ report · snapshot            │</span></span>
<span class="line"><span>                 └──────────────────────────────┘</span></span></code></pre></div><blockquote><p>AA is skipped at every branch kink: surcharge, pond, slot, weir, orifice, pump</p></blockquote><p>Flow legend:</p><ul><li>★ Critical handoff (blend → convergence test, and convergence test → next timestep)</li><li>Sequential handoff (plain arrows between consecutive steps)</li><li>Retry loop (dashed arrow from step 6 back to step 1, labeled RETRY ≤8)</li></ul><p>Original: <a href="./../../sources/1d-anderson-accel.html">1d-anderson-accel.html</a></p>`,7)])])}const m=s(l,[["render",i]]);export{h as __pageData,m as default};
