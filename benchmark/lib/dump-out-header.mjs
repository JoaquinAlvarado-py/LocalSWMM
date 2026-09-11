// dump-out-header.mjs — read a SWMM binary .out prolog/epilog to ground-truth
// the size formula. Usage: node benchmark/lib/dump-out-header.mjs <file.out>
import { readFileSync } from 'node:fs';

const buf = readFileSync(process.argv[2]);
const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
const i32 = (o) => dv.getInt32(o, true);
const f32 = (o) => dv.getFloat32(o, true);
const f64 = (o) => dv.getFloat64(o, true);

console.log('magic:', i32(0), 'version:', i32(4), 'flowUnits:', i32(8));
const ns = i32(12), nn = i32(16), nl = i32(20), np = i32(24);
console.log('Nsubcatch:', ns, 'Nnodes:', nn, 'Nlinks:', nl, 'Npollut:', np);

// walk ID names
let p = 28;
const readName = () => { const len = i32(p); p += 4; const s = buf.toString('latin1', p, p + len); p += len; return s; };
for (let i = 0; i < ns; i++) readName();
for (let i = 0; i < nn; i++) readName();
for (let i = 0; i < nl; i++) readName();
for (let i = 0; i < np; i++) readName();
console.log('IDs end at byte:', p);
const pollutUnits = [];
for (let i = 0; i < np; i++) pollutUnits.push(i32(p)), p += 4;
console.log('pollutant units:', pollutUnits.join(','));

// properties: subcatch 1 f32; node i32 + 2 f32; link i32 + 3 f32
p += ns * 4 + nn * 12 + nl * 16;
console.log('props end at byte:', p);
const nSubVars = i32(p); p += 4;
const nNodeVars = i32(p); p += 4;
const nLinkVars = i32(p); p += 4;
console.log('NumSubcatchVars:', nSubVars, 'NumNodeVars:', nNodeVars, 'NumLinkVars:', nLinkVars);
console.log('results start at byte:', p);

// epilog: last 20 bytes = idsPos, propsPos, resultsPos, nPeriods, errCode
const e = buf.length - 20;
console.log('epilog: idsPos', i32(e), 'propsPos', i32(e + 4), 'resultsPos', i32(e + 8),
    'nPeriods', i32(e + 12), 'errCode', i32(e + 16));
const nPeriods = i32(e + 12);
const resultsPos = i32(e + 8);
if (nPeriods > 0 && resultsPos > 0) {
    const recBytes = (resultsPos - p) / nPeriods; // first period only shows date+vals
    console.log('first record bytes:', resultsPos - p,
        '= 8 + 4 *', (resultsPos - p - 8) / 4, 'values');
    console.log('file size:', buf.length,
        '= resultsPos + nPeriods * (8 + 4*vars) + 20 ->',
        'implied total per-record:', (buf.length - 20 - resultsPos) / nPeriods);
}
