// test-view2d.mjs — unit checks for the 2D view semantics module (view2d.js):
// depth mask, velocity depth-gate + magnitude clamp, and the global robust
// field scale. Standalone Node assertions (no framework), mirrors the repo's
// script style. Usage: node scripts/test-view2d.mjs
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const src = readFileSync(new URL('../public/view2d.js', import.meta.url), 'utf8');
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(src, sandbox);
const View2D = sandbox.View2D;

let failures = 0;
const assert = (name, cond, detail) => {
    if (cond) { console.log(`  ok  ${name}`); }
    else { failures++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
};
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

console.log('View2D.velocityFromDischarge (depth gate + clamp)');
{
    const shallow = View2D.velocityFromDischarge(0.2, 0.1, 0.01);
    assert('depth < gate → zero', shallow.mag === 0 && shallow.vx === 0 && shallow.vy === 0, JSON.stringify(shallow));

    const film = View2D.velocityFromDischarge(0.2, 0.1, 0.005);
    assert('5mm film below gate → zero', film.mag === 0, `got ${film.mag}`);

    const normal = View2D.velocityFromDischarge(0.3, 0.4, 0.1);
    assert('q/h in gate → speed 5', near(normal.mag, 5.0), `got ${normal.mag}`); // 0.3/0.1=3, 0.4/0.1=4 → hypot 5

    const huge = View2D.velocityFromDischarge(0.7, 0.0, 0.06);
    assert('huge q/h in gate → clamped to 5', near(huge.mag, 5.0) && near(huge.vx, 5.0), `got ${huge.mag} vx=${huge.vx}`); // 0.7/0.06 ≈ 11.7 → clamp

    const deep = View2D.velocityFromDischarge(0.2, 0.0, 1.0);
    assert('deep slow flow → not clamped', near(deep.mag, 0.2), `got ${deep.mag}`);
}

console.log('View2D.clampVelocity');
{
    const v = View2D.clampVelocity(100, 0, 0.1);
    assert('clamp clamps magnitude to cap', near(v.mag, 5.0) && near(v.vx, 5.0), JSON.stringify(v));
    const shallow = View2D.clampVelocity(3, 4, 0.01);
    assert('clamp gates shallow depth', shallow.mag === 0 && shallow.vx === 0, JSON.stringify(shallow));
}

console.log('View2D.fieldScale (global robust max)');
{
    // depth: a few 2m outlier cells (channels) + a uniform ~20mm flood.
    const frame1 = { depth: Array.from({ length: 1000 }, () => 0.02) };
    frame1.depth[0] = 2.0;
    const frame2 = { depth: Array.from({ length: 1000 }, () => 0.02) };
    frame2.depth[999] = 2.1;
    const scale = View2D.fieldScale([frame1, frame2], 'depth');
    assert('depth scale caps outliers (robust)', scale.max < 1.0, `got max=${scale.max}`);
    assert('depth scale above the flood (readable)', scale.max >= 0.02, `got max=${scale.max}`);

    // head keeps the true global range.
    const hScale = View2D.fieldScale([{ head: Array.from({ length: 100 }, (_, i) => 20 + i * 0.1) }], 'head');
    assert('head scale keeps true global max', near(hScale.max, 29.9, 1e-6), `got ${hScale.max}`);

    // empty → safe defaults.
    const empty = View2D.fieldScale([], 'depth');
    assert('empty frames → safe scale', empty.max > 0 && empty.hasFinite === false, JSON.stringify(empty));

    // velocity scale respects the clamp ceiling.
    const vel = View2D.fieldScale([{ velocity: [0.1, 0.2, 0.3, 5.0, 5.0, 5.0] }], 'velocity');
    assert('velocity scale finite ≤ clamp ceiling', Number.isFinite(vel.max) && vel.max <= 5.0, `got ${vel.max}`);
}

console.log('View2D.shouldShow (per-variable masking)');
{
    assert('depth: film below mask → hidden', View2D.shouldShow('depth', 0.002, 0.002) === false);
    assert('depth: flood above mask → shown', View2D.shouldShow('depth', 0.05, 0.05) === true);
    assert('depth: zero → hidden', View2D.shouldShow('depth', 0, 0) === false);
    assert('head: dry cell (depth below mask) → hidden', View2D.shouldShow('head', 30.7, 0.001) === false);
    assert('head: wet cell → shown', View2D.shouldShow('head', 30.9, 0.1) === true);
    assert('velocity: magnitude + depth above gate → shown', View2D.shouldShow('velocity', 0.5, 0.1) === true);
    assert('velocity: magnitude but shallow depth → hidden (gate enforced)', View2D.shouldShow('velocity', 0.5, 0.01) === false);
    assert('velocity: zero → hidden', View2D.shouldShow('velocity', 0, 0.1) === false);
    assert('NaN value → hidden', View2D.shouldShow('depth', NaN, 0.1) === false);
}

console.log('View2D constants');
{
    assert('DEPTH_MASK_M = 5mm', near(View2D.DEPTH_MASK_M, 0.005));
    assert('VELOCITY_GATE_M = 5cm', near(View2D.VELOCITY_GATE_M, 0.05));
    assert('VELOCITY_CLAMP_MPS = 5', near(View2D.VELOCITY_CLAMP_MPS, 5.0));
}

console.log(failures === 0 ? '\nPASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
