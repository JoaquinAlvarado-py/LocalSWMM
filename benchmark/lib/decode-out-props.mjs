// decode-out-props.mjs — inspect the properties region of a .out file.
// Usage: node benchmark/lib/decode-out-props.mjs <file.out> [start] [end]
import { readFileSync } from 'node:fs';

const buf = readFileSync(process.argv[2]);
const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
const i32 = (o) => dv.getInt32(o, true);
const f32 = (o) => dv.getFloat32(o, true);

const e = buf.length - 24;
const idsPos = i32(e), propsPos = i32(e + 4), resultsPos = i32(e + 8), nPeriods = i32(e + 12);
console.log(`idsPos=${idsPos} propsPos=${propsPos} resultsPos=${resultsPos} nPeriods=${nPeriods}`);
const ns = i32(12), nn = i32(16), nl = i32(20), np = i32(24);
console.log(`Ns=${ns} Nn=${nn} Nl=${nl} Np=${np}`);

const start = Number(process.argv[3] ?? propsPos);
const end = Math.min(Number(process.argv[4] ?? start + 320), resultsPos);
for (let o = start; o < end; o += 4) {
    const v = i32(o), f = f32(o);
    const fs = Number.isFinite(f) ? f.toFixed(3) : 'NaN';
    console.log(`${String(o).padStart(8)}  i32=${String(v).padStart(12)}  f32=${fs}`);
}
