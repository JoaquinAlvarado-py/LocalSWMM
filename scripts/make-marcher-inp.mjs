// make-marcher-inp.mjs — synthetic 2D-only INP for marcher parity (M1).
//
// Closed basin (all WALL boundaries), uniform rain (RAINFALL_MODE SYSTEM),
// LTS_TIERS 1 (global dt), FLAT closure — the exact M1 scope.
//
// Grid: nx × ny quads, dx m each, split into 2 triangles per quad.
// Bed: z(x, y) = bedSlopeX * x + bedSlopeY * y + sinBed * sin(2π·x/wavelength).
//
// Usage: node scripts/make-marcher-inp.mjs <nx> <ny> <dx> <rainMmHr> <minutes> <out.inp>

import { writeFileSync } from 'node:fs';

const [, , nxS, nyS, dxS, rainS, minutesS, out] = process.argv;
const nx = Number(nxS) || 20, ny = Number(nyS) || 20, dx = Number(dxS) || 10;
const rainMmHr = Number(rainS) || 720, minutes = Number(minutesS) || 60;

const bed = (x, y) => 0.05 * x + 0.02 * y + 0.25 * Math.sin(2 * Math.PI * x / (nx * dx / 2));

const lines = [];
lines.push(';; UNITS: SI (m)');
lines.push('[TITLE]');
lines.push('WebGPU M1 marcher parity — closed basin, uniform rain');
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
lines.push(`END_TIME             ${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}:00`);
lines.push('SWEEP_START          06/16');
lines.push('SWEEP_END            06/17');
lines.push('DRY_DAYS             0');
lines.push('REPORT_STEP          00:15:00');
lines.push('WET_STEP             00:01:00');
lines.push('DRY_STEP             00:15:00');
lines.push('ROUTING_STEP         00:01:00');
lines.push('');
lines.push('[RAINGAGES]');
lines.push('RG1           INTENSITY  00:05  1.0  TIMESERIES TS_RAIN');
lines.push('');
lines.push('[TIMESERIES]');
// SWMM rain applies within [entry, entry + gageInterval) only — a constant
// rate needs one entry per gage interval (legacy step-function behavior).
const gageIntervalMin = 5;
for (let tMin = 0; tMin <= minutes; tMin += gageIntervalMin) {
    const hh = String(Math.floor(tMin / 60)).padStart(2, '0');
    const mm = String(tMin % 60).padStart(2, '0');
    lines.push(`TS_RAIN  06/29/2012 ${hh}:${mm}   ${rainMmHr.toFixed(3)}`);
}
lines.push('');
// Minimal 1D skeleton so the engine's routing loop (which drives the 2D
// co-advance) stays alive. No coupling points — the 2D is rain-driven only.
lines.push('[SUBCATCHMENTS]');
lines.push('S1          RG1          O1           0.001   0       1       0.01    0');
lines.push('');
lines.push('[SUBAREAS]');
lines.push('S1          100         100         0.05    0.2');
lines.push('');
lines.push('[INFILTRATION]');
lines.push(';; HORTON: S1 0.0 0.0 0 0 0  (none — dry impervious subcatchment)');
lines.push('S1          0.0         0.0         0       0       0');
lines.push('');
lines.push('[OUTFALLS]');
lines.push('O1          0.0         FREE        NO');
lines.push('');
lines.push('[COORDINATES]');
lines.push('O1          10.0        55.0');
lines.push('');
lines.push('[POLYGONS]');
lines.push('S1          9.9         54.9');
lines.push('S1          10.1        54.9');
lines.push('S1          10.1        55.1');
lines.push('S1          9.9         55.1');
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
lines.push('RAINFALL_MODE        SYSTEM');
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

writeFileSync(out, lines.join('\n'));
console.log(`wrote ${out}: ${nvx * nvy} vertices, ${t} triangles, rain ${rainMmHr} mm/hr, ${minutes} min`);

// Always emit in the exact shape the app's worker expects (SI header).
if (!out.endsWith('.inp')) process.exit(1);
