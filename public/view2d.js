// view2d.js — the view semantics for the 2D results fields: the thresholds
// that turn raw solver fields (depth / head / velocity) into renderable views.
// Single source of truth for the agreed defaults (see CONTEXT.md):
//   - Water Depth: absolute scale, cells < 5 mm masked transparent
//   - Hydraulic Head: dry cells masked (show the water-surface gradient where
//     water is present)
//   - Flow Velocity: depth-gated (> 5 cm) and magnitude-clamped (5 m/s)
// Shared by the main thread (results.js, mesh2dRender.js, meshGlLayer.js,
// layerTree.js) and the two simulation workers (couplingSplit.js and
// openSwmm2dWorker.js), so a threshold is defined once and used everywhere.
(function (global) {
    'use strict';

    // A cell shallower than this renders nothing in the depth and head views.
    // Sits above the uniform-rain film scale (see CONTEXT.md "Uniform rain
    // film") so the map reads as flood depth, not wetness.
    var DEPTH_MASK_M = 0.005;

    // Velocity only exists where the water column is physically meaningful;
    // below this the q/depth division is q/h inflation (CONTEXT.md) and is
    // clamped away rather than rendered.
    var VELOCITY_GATE_M = 0.05;
    var VELOCITY_CLAMP_MPS = 5.0;

    // Finalize a velocity vector from specific discharge (m²/s) and cell depth
    // (m): gate the depth, divide, clamp the magnitude. Returns components and
    // magnitude; shallow cells yield zeros (the gate, not noise).
    function velocityFromDischarge(qx, qy, depth) {
        if (!(depth > VELOCITY_GATE_M)) return { vx: 0, vy: 0, mag: 0 };
        var vx = qx / depth, vy = qy / depth;
        var mag = Math.hypot(vx, vy);
        if (mag > VELOCITY_CLAMP_MPS) {
            var k = VELOCITY_CLAMP_MPS / mag;
            return { vx: vx * k, vy: vy * k, mag: VELOCITY_CLAMP_MPS };
        }
        return { vx: vx, vy: vy, mag: mag };
    }

    // Clamp an already-reconstructed velocity vector (m/s) by depth gate and
    // magnitude cap. Used where the caller rebuilt velocity from edge fluxes
    // rather than dividing a cell discharge by depth.
    function clampVelocity(vx, vy, depth) {
        if (!(depth > VELOCITY_GATE_M)) return { vx: 0, vy: 0, mag: 0 };
        var mag = Math.hypot(vx, vy);
        if (mag > VELOCITY_CLAMP_MPS) {
            var k = VELOCITY_CLAMP_MPS / mag;
            return { vx: vx * k, vy: vy * k, mag: VELOCITY_CLAMP_MPS };
        }
        return { vx: vx, vy: vy, mag: mag };
    }

    // Global-across-frames robust max for a field: p99 of every finite value
    // over every frame, capped at 1.5×p99 (mirrors the old per-frame
    // robustFrameMax cap). Depth/velocity use this so the scale is stable
    // across the whole animation instead of re-normalizing each frame.
    // Head keeps a true global min/max (its gradient is the signal).
    // frames: [{ depth, head, velocity }]; varKey: 'depth' | 'head' | 'velocity'.
    function fieldScale(frames, varKey) {
        var min = Infinity, max = -Infinity;
        var any = false;
        for (var f = 0; f < frames.length; f++) {
            var arr = frames[f] && frames[f][varKey];
            if (!arr) continue;
            for (var i = 0; i < arr.length; i++) {
                var v = Number(arr[i]);
                if (!Number.isFinite(v)) continue;
                any = true;
                if (v < min) min = v;
                if (v > max) max = v;
            }
        }
        if (!any) return { min: 0, max: 0.001, hasFinite: false };
        if (varKey === 'head') return { min: min, max: Math.max(max, min + 0.001), hasFinite: true };
        if (max <= 0) return { min: 0, max: 0.001, hasFinite: true };
        // Robust cap for depth/velocity: p99 over all frames × 1.5.
        var BINS = 1024;
        var hist = new Float64Array(BINS);
        var n = 0;
        for (var g = 0; g < frames.length; g++) {
            var a = frames[g] && frames[g][varKey];
            if (!a) continue;
            for (var k = 0; k < a.length; k++) {
                var val = Number(a[k]);
                if (!Number.isFinite(val) || val <= 0) continue;
                var b = Math.min(BINS - 1, Math.floor(val / max * BINS));
                hist[b]++; n++;
            }
        }
        if (!n) return { min: 0, max: 0.001, hasFinite: true };
        var target = n * 0.99, cum = 0, p99 = 0;
        for (var b = 0; b < BINS; b++) {
            cum += hist[b];
            if (cum >= target) { p99 = max * (b + 0.5) / BINS; break; }
        }
        var cap = (p99 > 0 && max > 1.5 * p99) ? p99 * 1.5 : max;
        return { min: 0, max: Math.max(cap, min + 0.001), hasFinite: true };
    }

    // Should a cell render in a given view? Encodes the per-variable masking
    // rules (CONTEXT.md): depth hides the uniform-rain film below DEPTH_MASK_M;
    // head shows only cells with water present (dry cells render nothing, so
    // the view reads as the water-surface gradient, not terrain); velocity is
    // already depth-gated at the source, so a non-zero magnitude is the gate.
    // val = the cell's value in the selected field; depth = cell water depth.
    function shouldShow(varKey, val, depth) {
        if (!Number.isFinite(val) || !(val > 0)) return false;
        if (varKey === 'depth') return val >= DEPTH_MASK_M;
        if (varKey === 'head') return Number.isFinite(depth) && depth > DEPTH_MASK_M;
        // velocity: gate on depth too, not just the (producer-clamped) magnitude —
        // the view must not render q/h noise even if a producer forgets to gate.
        return Number.isFinite(depth) && depth > VELOCITY_GATE_M;
    }

    global.View2D = {
        DEPTH_MASK_M: DEPTH_MASK_M,
        VELOCITY_GATE_M: VELOCITY_GATE_M,
        VELOCITY_CLAMP_MPS: VELOCITY_CLAMP_MPS,
        velocityFromDischarge: velocityFromDischarge,
        clampVelocity: clampVelocity,
        fieldScale: fieldScale,
        shouldShow: shouldShow
    };
})(typeof globalThis !== 'undefined' ? globalThis : this);
