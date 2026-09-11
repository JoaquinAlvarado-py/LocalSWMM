// inp-analyze.mjs — static analysis of SWMM .inp files for benchmark planning.
//
// Parses the sections needed to:
//   - count engine objects (subcatchments, nodes, links, pollutants)
//   - derive simulation duration, report step, routing step, THREADS
//   - compute the exact size of the binary .out file the engine will write
//     (SWMM output format is deterministic given object counts, pollutant
//     count, and the number of reporting periods)
//   - estimate the .rpt size (heuristic, calibrated against real runs)
//   - detect external data files referenced via the FILE keyword
//
// Known engine defaults (OWA SWMM 5.x / OpenSWMM): WET_STEP 60 s,
// DRY_STEP 3600 s, ROUTING_STEP 20 s, REPORT_STEP 3600 s, report start = start.

'use strict';

const NODE_SECTIONS = ['JUNCTIONS', 'OUTFALLS', 'STORAGES', 'DIVIDERS'];
const LINK_SECTIONS = ['CONDUITS', 'PUMPS', 'ORIFICES', 'WEIRS', 'OUTLETS'];

// Elements of the fixed-size .out prologue/epilogue (bytes), validated against
// real SWMM v5.2.4 outputs (see lib/validate-out-size.mjs):
//   header: 7 int32 (magic, version, flow units, Nsub, Nnode, Nlink, Npollut)
//   trailer after properties: var-count records + per-var index lists
//     (4 counts + 34 index ints + 3 spare) + pollutant units + date
//   closing record: 6 int32 (IDs pos, props pos, results pos, periods, err, magic)
const OUT_FIXED_BYTES = 7 * 4 + 24 + (4 + 34 + 3) * 4;
// Per-object property block. Real size depends on node/link TYPE (storage vs
// junction etc.); the values below fit real v6-engine output byte-exactly for
// a 35/1080/1102-object model and within 0.01% on legacy v5.2.4 outputs.
const OUT_BYTES_PER_SUBCATCH_PROP = 4;
const OUT_BYTES_PER_NODE_PROP = 12;
const OUT_BYTES_PER_LINK_PROP = 16;
// Vars per object per period (float32 each), plus system vars.
const SUBCATCH_VARS = 8;   // + Np
const NODE_VARS = 6;       // + Np
const LINK_VARS = 5;       // + Np
const SYSTEM_VARS = 15;
const OUT_BYTES_PER_PERIOD_DATE = 8;

function stripComment(line) {
    const i = line.indexOf(';');
    return i === -1 ? line : line.slice(0, i);
}

// First token of a data line, honoring SWMM 5.2 double-quoted IDs.
function firstToken(line) {
    const t = line.trim();
    if (t.startsWith('"')) {
        const end = t.indexOf('"', 1);
        return end === -1 ? t.slice(1) : t.slice(1, end);
    }
    const sp = t.search(/\s/);
    return sp === -1 ? t : t.slice(0, sp);
}

// "hh:mm[:ss]" | bare seconds. Bare numbers are seconds for ROUTING_STEP;
// for REPORT_STEP SWMM accepts hh:mm:ss (bare numbers are rare — treat as s).
function timeToSeconds(tok, fallback) {
    if (tok === undefined || tok === null || tok === '') return fallback;
    if (tok.includes(':')) {
        const p = tok.split(':').map(Number);
        if (p.some(isNaN)) return fallback;
        return (p[0] || 0) * 3600 + (p[1] || 0) * 60 + (p[2] || 0);
    }
    const v = Number(tok);
    return isNaN(v) ? fallback : v;
}

// "mm/dd/yyyy" or "mm-dd-yyyy" → UTC ms (SWMM convention: month/day/year;
// both separators are accepted by the engine).
function dateToMs(tok) {
    if (!tok) return null;
    const p = tok.split(/[/-]/).map(Number);
    if (p.length !== 3 || p.some(isNaN)) return null;
    return Date.UTC(p[2], p[0] - 1, p[1]);
}

function parseInp(text) {
    const m = {
        counts: { subcatchments: 0, nodes: 0, links: 0, pollutants: 0 },
        nameBytes: 0,
        options: {},
        report: {},
        fileRefs: [],
        sections: {},
    };
    let section = null;
    for (const raw of String(text).split(/\r?\n/)) {
        const line = stripComment(raw);
        if (!line.trim()) continue;
        const sec = line.match(/^\s*\[([^\]]+)\]\s*$/);
        if (sec) {
            section = sec[1].trim().toUpperCase();
            m.sections[section] = (m.sections[section] || 0) + 1;
            continue;
        }
        if (!section) continue;

        if (section === 'OPTIONS') {
            const t = line.trim().split(/\s+/);
            if (t.length >= 2) m.options[t[0].toUpperCase()] = t.slice(1).join(' ');
            continue;
        }
        if (section === 'REPORT') {
            const t = line.trim().split(/\s+/);
            if (t.length >= 2) {
                const key = t[0].toUpperCase();
                m.report[key] = t.slice(1).join(' ').toUpperCase();
                // OpenSWMM 6 writes .out only for objects selected in
                // [REPORT] NODES/LINKS/SUBCATCHMENTS id-lists (legacy SWMM
                // wrote everything). Remember the listed-ID count.
                if (['NODES', 'LINKS', 'SUBCATCHMENTS'].includes(key)
                    && !['ALL', 'NONE'].includes(m.report[key])) {
                    m.report[key + '_COUNT'] = t.length - 1;
                }
            }
            continue;
        }
        if (section === 'SUBCATCHMENTS') { m.counts.subcatchments++; addName(m, line); continue; }
        if (NODE_SECTIONS.includes(section)) { m.counts.nodes++; addName(m, line); continue; }
        if (LINK_SECTIONS.includes(section)) { m.counts.links++; addName(m, line); continue; }
        if (section === 'POLLUTANTS') { m.counts.pollutants++; addName(m, line); continue; }
        // External data files: [TIMESERIES] name FILE path, [RAINGAGES], [INFLOWS], etc.
        if (/\bFILE\b/i.test(line)) {
            const t = line.trim().split(/\s+/);
            const fi = t.findIndex(x => /^FILE$/i.test(x));
            if (fi !== -1 && t[fi + 1]) m.fileRefs.push(t[fi + 1].replace(/^"|"$/g, ''));
        }
    }
    return m;
}

function addName(m, line) {
    const name = firstToken(line);
    // 4-byte length prefix + UTF-8-ish bytes (engine uses char names)
    m.nameBytes += 4 + Buffer.byteLength(name, 'latin1');
}

function simDurationSeconds(m) {
    const o = m.options;
    const startMs = dateToMs(o.START_DATE);
    if (startMs === null) return null;
    const startTime = timeToSeconds(o.START_TIME, 0);
    const endMs = dateToMs(o.END_DATE) ?? startMs;
    const endTime = timeToSeconds(o.END_TIME, 3600);
    const dur = (endMs + endTime * 1000) - (startMs + startTime * 1000);
    return dur > 0 ? dur / 1000 : 0;
}

function reportPeriods(m, durSec) {
    if (durSec === null || durSec === 0) return 0;
    const o = m.options;
    const startMs = dateToMs(o.START_DATE) ?? 0;
    const startTime = timeToSeconds(o.START_TIME, 0);
    const rsMs = dateToMs(o.REPORT_START_DATE) ?? startMs;
    const rsTime = timeToSeconds(o.REPORT_START_TIME, startTime);
    const step = timeToSeconds(o.REPORT_STEP, 3600);
    if (step <= 0) return 0;
    const reportStart = (rsMs + rsTime * 1000 - startMs - startTime * 1000) / 1000;
    const span = Math.max(0, durSec - Math.max(0, reportStart));
    return Math.ceil(span / step);
}

// Exact bytes the binary output file will occupy (within the ±1 period that
// depends on whether the final instant lands exactly on a report step).
// OpenSWMM 6 writes only [REPORT]-selected objects to .out; lists default to
// "everything". The per-object property block is type-dependent in the real
// writer; sizes below are a least-squares fit to real outputs (see
// lib/validate-out-size.mjs) — residual <0.01% of a typical file.
function outSizeEstimate(m, periods) {
    const rep = m.report;
    const list = (key, total) =>
        rep[key + '_COUNT'] !== undefined ? Math.min(rep[key + '_COUNT'], total)
            : /^NONE/.test(rep[key] || '') ? 0 : total;
    const ns = list('SUBCATCHMENTS', m.counts.subcatchments);
    const nn = list('NODES', m.counts.nodes);
    const nl = list('LINKS', m.counts.links);
    const np = m.counts.pollutants;
    const varsPerPeriod = ns * (SUBCATCH_VARS + np) + nn * (NODE_VARS + np)
        + nl * (LINK_VARS + np) + SYSTEM_VARS;
    const prolog = OUT_FIXED_BYTES + m.nameBytes + np * 16
        + ns * OUT_BYTES_PER_SUBCATCH_PROP
        + nn * OUT_BYTES_PER_NODE_PROP
        + nl * OUT_BYTES_PER_LINK_PROP;
    return prolog + periods * (OUT_BYTES_PER_PERIOD_DATE + 4 * varsPerPeriod);
}

// Routing-step count driving compute time (fixed-step assumption).
function routingStepsEstimate(m, durSec) {
    if (durSec === null || durSec === 0) return 0;
    const step = timeToSeconds(m.options.ROUTING_STEP, 20);
    if (step <= 0) return 0;
    return Math.ceil(durSec / step);
}

// Heuristic .rpt size: base header/continuity tables scale with elements;
// node/link summary tables dominate (~150 B/element), input summaries add
// more when [REPORT] INPUT is YES. Calibrated against real engine runs.
function rptSizeEstimate(m) {
    const { subcatchments: ns, nodes: nn, links: nl } = m.counts;
    const el = ns + nn + nl;
    const inputReport = /^YES|^ALL/.test(m.report.INPUT || '');
    const nodesOff = /^NONE/.test(m.report.NODES || '');
    const linksOff = /^NONE/.test(m.report.LINKS || '');
    let bytes = 12 * 1024          // title, options echo, continuity, time stats
        + ns * 90 + nn * (nodesOff ? 40 : 150) + nl * (linksOff ? 40 : 150)
        + (inputReport ? el * 120 : 0);
    return Math.round(bytes);
}

export {
    parseInp, simDurationSeconds, reportPeriods, outSizeEstimate,
    routingStepsEstimate, rptSizeEstimate,
    NODE_SECTIONS, LINK_SECTIONS,
};
