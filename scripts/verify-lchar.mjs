// Verify the L_char port in webgpuMarscher.js buildEdges matches the engine's
// operator-derived formula (InertialEdges.cpp:99-132 / Ref Manual Vol II Eq 9-4):
//   L_char = sqrt(2A / sum_f xi_f * inv_dx_normal_f)
// against an independent reference implementation computed from the same mesh.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

globalThis.self = globalThis;
globalThis.window = globalThis;
require('../public/webgpu/webgpuMarscher.js');
const { buildMarcherEdges } = globalThis;

// ---- synthetic mesh: a 2x2 grid of right triangles (union-jack pairs) ----
// vertices form a square [0,1]^2 at z=0; 8 triangles.
function gridMesh(nx, ny) {
  const vertices = [];
  for (let j = 0; j <= ny; j++)
    for (let i = 0; i <= nx; i++)
      vertices.push({ x: i, y: j, z: 0 });
  const V = (i, j) => j * (nx + 1) + i;
  const triangles = [];
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const a = V(i, j), b = V(i + 1, j), c = V(i, j + 1), d = V(i + 1, j + 1);
      triangles.push({ v: [a, b, c], n: 0.03 });
      triangles.push({ v: [b, d, c], n: 0.03 });
    }
  }
  return { vertices, triangles };
}

const mesh = gridMesh(2, 2);
const edges = buildMarcherEdges(mesh);
const nt = mesh.triangles.length;

// ---- independent reference: recompute per-cell L_char from the manual formula
// using the same edge arrays the build exposed.
const { cell_lchar: jsLchar, tri_cx, tri_cy, tri_cz, tri_area, inv_dx_normal, xi, cL, cR } = edges;
if (!jsLchar || !inv_dx_normal) throw new Error('buildEdges did not expose cell_lchar/inv_dx_normal');

// Reference: S[t] = sum_f xi_f * inv_dx_normal_f over interior edges
const S = new Float64Array(nt);
for (let e = 0; e < cL.length; e++) {
  const s = xi[e] * inv_dx_normal[e];
  S[cL[e]] += s;
  S[cR[e]] += s;
}
const refLchar = new Float64Array(nt);
for (let t = 0; t < nt; t++) {
  if (S[t] > 1e-30) refLchar[t] = Math.sqrt(2 * tri_area[t] / S[t]);
  else refLchar[t] = 0; // fallback branch not exercised here (all interior)
}

let maxRel = 0, mismatches = 0;
for (let t = 0; t < nt; t++) {
  const rel = refLchar[t] > 1e-30 ? Math.abs(jsLchar[t] - refLchar[t]) / refLchar[t] : Math.abs(jsLchar[t]);
  if (rel > maxRel) maxRel = rel;
  if (rel > 1e-9) { mismatches++; console.log(`cell ${t}: js=${jsLchar[t]} ref=${refLchar[t]} rel=${rel}`); }
}

// sanity: the operator length must be SMALLER than the old 2A/edge proxy
// (the proxy overstated by sqrt(3) on the union-jack pair)
let proxyOk = true;
for (let t = 0; t < nt; t++) {
  let xiMax = 0;
  for (let e = 0; e < 3; e++) {
    // recompute longest edge per cell from mesh vertices
    const tri = mesh.triangles[t];
    for (let k = 0; k < 3; k++) {
      const a = tri.v[k], b = tri.v[(k + 1) % 3];
      const l = Math.hypot(mesh.vertices[b].x - mesh.vertices[a].x, mesh.vertices[b].y - mesh.vertices[a].y);
      if (l > xiMax) xiMax = l;
    }
  }
  const proxy = xiMax > 0 ? 2 * tri_area[t] / xiMax : 0;
  if (jsLchar[t] > proxy * 0.999) { proxyOk = false; console.log(`cell ${t}: L_char ${jsLchar[t]} NOT < proxy ${proxy}`); }
}

console.log(`max relative error vs reference: ${maxRel.toExponential(3)}`);
console.log(`mismatches: ${mismatches}`);
console.log(`operator L_char < 2A/edge proxy everywhere: ${proxyOk}`);
console.log(`sample L_char values: [${Array.from(jsLchar.slice(0, 4)).map(v => v.toFixed(5)).join(', ')}]`);

if (maxRel > 1e-9 || mismatches > 0) { console.error('FAIL'); process.exit(1); }
if (!proxyOk) { console.error('FAIL (proxy sanity)'); process.exit(1); }
console.log('PASS');
