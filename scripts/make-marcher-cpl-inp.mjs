// make-marcher-cpl-inp.mjs — synthetic 1D↔2D coupling INP for M2.
//
// Scenario: a 1D junction J1 (restrictive conduit to an outfall) receives a
// constant inflow; J1 is coupled to 2D cell 0 via [2D_TRIANGLE_NODE_MAP].
// The junction head rises above the crown → spills 1D→2D → the 2D fills →
// drains back 2D→1D. No rain (pure exchange test).
//
// Usage: node scripts/make-marcher-cpl-inp.mjs <out.inp>

import { writeFileSync } from 'node:fs';

const [, , out] = process.argv;
if (!out) { console.error('usage: make-marcher-cpl-inp.mjs <out.inp>'); process.exit(1); }

const nx = 2, ny = 2, dx = 10;
const bed = (x, y) => 0.05 * x + 0.02 * y;

const lines = [];
lines.push(';; UNITS: SI (m)');
lines.push('[TITLE]');
lines.push('WebGPU M2 — 1D/2D junction coupling parity');
lines.push('');
lines.push('[OPTIONS]');
lines.push('FLOW_UNITS           CMS');
lines.push('INFILTRATION         HORTON');
lines.push('FLOW_ROUTING         DYNWAVE');
lines.push('LINK_OFFSETS         DEPTH');
lines.push('MIN_SLOPE            0');
lines.push('ALLOW_PONDING        NO');
lines.push('SKIP_STEADY_STATE    NO');
lines.push('');
lines.push('START_DATE           06/29/2012');
lines.push('START_TIME           00:00:00');
lines.push('REPORT_START_DATE    06/29/2012');
lines.push('REPORT_START_TIME    00:00:00');
lines.push('END_DATE             06/29/2012');
lines.push('END_TIME             01:00:00');
lines.push('SWEEP_START          06/16');
lines.push('SWEEP_END            06/17');
lines.push('DRY_DAYS             0');
lines.push('REPORT_STEP          00:15:00');
lines.push('WET_STEP             00:01:00');
lines.push('DRY_STEP             00:15:00');
lines.push('ROUTING_STEP         00:01:00');
lines.push('');
lines.push('[TIMESERIES]');
lines.push('TS_INFLOW  06/29/2012 00:00   0.500');
lines.push('TS_INFLOW  06/29/2012 23:59   0.500');
lines.push('');
// 1D skeleton: storage node (real storage — no flooding) + tiny conduit + outfall.
// The storage fills → the head rises above the crown → the coupling engages
// identically in the full engine and the 1D-only (no flood loss in either).
lines.push('[STORAGE]');
lines.push('S1          0.0        10.0       0        0        FUNC       100.0');
lines.push('');
lines.push('[OUTFALLS]');
lines.push('O1          0.0         FREE        NO');
lines.push('');
lines.push('[CONDUITS]');
lines.push('C1          S1          O1          100.0     0.01     0       0       0');
lines.push('');
lines.push('[XSECTIONS]');
lines.push('C1          CIRCULAR    0.1        0        0        0        0        0');
lines.push('');
lines.push('[COORDINATES]');
lines.push('S1          10.0        55.0');
lines.push('O1          10.05       55.0');
lines.push('');
lines.push('[INFLOWS]');
lines.push('S1          FLOW        TS_INFLOW');
lines.push('');
lines.push('[2D_OPTIONS]');
lines.push('MAX_TIMESTEP         10.0');
lines.push('DRY_DEPTH            0.001');
lines.push('COUPLING_SYNC        1.0');
lines.push('THETA                0.5');
lines.push('CFL_NUMBER           0.8');
lines.push('H_MOVE               0.003');
lines.push('FROUDE_MAX           1.0');
lines.push('LTS_TIERS            1');
lines.push('LIMITER_EPSILON      1e-6');
lines.push('FLUX_DH_EPS          1e-6');
lines.push('CELL_CLOSURE         FLAT');
lines.push('FACE_RECONSTRUCTION  MEAN');
lines.push('VFR_MIN_WET_FRAC     0.1');
lines.push('INTEGRATOR           EXPLICIT');
lines.push('COUPLING_CD          0.65');
lines.push('COUPLING_AREA        DEFAULT');
lines.push('RAINFALL_MODE        NONE');
lines.push('REPORT_2D            YES');
lines.push('');
lines.push('[2D_VERTICES]');
lines.push(';;X               Y               Z               TAG');
const nvx = nx + 1, nvy = ny + 1;
for (let j = 0; j < nvy; j++) {
    for (let i = 0; i < nvx; i++) {
        const x = i * dx, y = j * dx;
        lines.push(`${x.toFixed(4).padEnd(15)} ${y.toFixed(4).padEnd(15)} ${bed(x, y).toFixed(4).padEnd(15)} -`);
    }
}
lines.push('');
lines.push('[2D_TRIANGLES]');
lines.push(';;V1      V2       V3       MANNINGS_N   TAG');
let t = 0;
for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
        const v00 = j * nvx + i, v10 = j * nvx + i + 1;
        const v01 = (j + 1) * nvx + i, v11 = (j + 1) * nvx + i + 1;
        lines.push(`${String(v00).padEnd(8)} ${String(v10).padEnd(8)} ${String(v11).padEnd(8)} 0.03000     -`);
        lines.push(`${String(v00).padEnd(8)} ${String(v11).padEnd(8)} ${String(v01).padEnd(8)} 0.03000     -`);
        t += 2;
    }
}
lines.push('');
// Couple the lowest 2D cell (cell 0) to the storage node.
lines.push('[2D_TRIANGLE_NODE_MAP]');
lines.push(';;TRIANGLE     NODE         CD        AREA');
lines.push('0            S1           0.65      1.0');
lines.push('');

writeFileSync(out, lines.join('\n'));
console.log(`wrote ${out}: ${t} triangles, junction-coupled cell 0`);
