// nodeSchematic.js — Section View & Schematics for SWMM Nodes and Conduits
// CAD-style schematic rendering with collision-free callouts and plan compass
(function () {
    'use strict';

    function getConnectedLinks(nodeId) {
        if (typeof Net === 'undefined' || !Net.links) return [];
        return Net.links.filter(l => l.from === nodeId || l.to === nodeId);
    }

    function formatShortId(id, maxLen = 14) {
        if (!id) return '';
        if (id.length <= maxLen) return id;
        return id.slice(0, maxLen - 2) + '…';
    }

    // ---------- 1. DRAW NODE PROFILE SCHEMATIC ----------
    function drawNodeOnCanvas(canvasEl, nodeId, step) {
        if (!canvasEl) return;
        const ctx = canvasEl.getContext('2d');
        if (!ctx) return;

        const node = Net.getNode(nodeId);
        if (!node) return;

        const dpr = window.devicePixelRatio || 1;
        const W = canvasEl.width / dpr;
        const H = canvasEl.height / dpr;

        ctx.save();
        ctx.scale(dpr, dpr);
        ctx.clearRect(0, 0, W, H);

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, W, H);

        const isUS = (typeof Net !== 'undefined') && Net.units === 'US';
        const unitStr = isUS ? 'ft' : 'm';

        const invEl = Number(node.props.invertEl) || 0;
        const maxD = Number(node.props.maxDepth) || 2.0;
        const rimEl = Number(node.props.rimEl) || (invEl + maxD);

        const connLinks = getConnectedLinks(nodeId);

        let minEl = invEl - 0.3;
        let maxEl = rimEl + 0.5;

        const leftLinks = [];
        const rightLinks = [];

        connLinks.forEach(l => {
            const isIncoming = (l.to === nodeId);
            const otherId = isIncoming ? l.from : l.to;
            const otherNode = Net.getNode(otherId);

            const p = l.props || {};
            const offset = isIncoming ? Number(p.outOffset || 0) : Number(p.inOffset || 0);
            const pInv = invEl + offset;
            const diam = Number(p.geom1 || 0.8);
            const pCrown = pInv + diam;

            minEl = Math.min(minEl, pInv - 0.2);
            maxEl = Math.max(maxEl, pCrown + 0.3);

            let angleDeg = 0;
            if (otherNode && node.lngLat && otherNode.lngLat) {
                const dx = (otherNode.lngLat[0] - node.lngLat[0]);
                const dy = (otherNode.lngLat[1] - node.lngLat[1]);
                angleDeg = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
            }

            const item = { link: l, otherId, isIncoming, pInv, pCrown, diam, angleDeg };
            if (isIncoming) leftLinks.push(item);
            else rightLinks.push(item);
        });

        const elevSpan = Math.max(0.5, maxEl - minEl);

        const padTop = 60;
        const padBottom = 50;
        const plotH = Math.max(100, H - padTop - padBottom);
        const nodeWidth = Math.min(130, W * 0.22);
        const nodeCenterX = W / 2;
        const nodeLeftX = nodeCenterX - nodeWidth / 2;
        const nodeRightX = nodeCenterX + nodeWidth / 2;

        const cy = (el) => padTop + plotH - ((el - minEl) / elevSpan) * plotH;

        const rimY = cy(rimEl);
        const invY = cy(invEl);
        const wallThick = 8;

        // Ground hatching
        const groundY = rimY;
        const groundW = W * 0.70;
        const gLeft = (W - groundW) / 2;
        const gRight = gLeft + groundW;

        ctx.strokeStyle = '#475569';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(gLeft, groundY);
        ctx.lineTo(gRight, groundY);
        ctx.stroke();

        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 1.0;
        ctx.beginPath();
        for (let x = gLeft; x < gRight; x += 10) {
            ctx.moveTo(x, groundY);
            ctx.lineTo(x + 6, groundY - 6);
        }
        ctx.stroke();

        // Walls
        ctx.fillStyle = '#e2e8f0';
        ctx.fillRect(nodeLeftX - wallThick, rimY, wallThick, invY - rimY + wallThick);
        ctx.fillRect(nodeRightX, rimY, wallThick, invY - rimY + wallThick);
        ctx.fillRect(nodeLeftX - wallThick, invY, nodeWidth + wallThick * 2, wallThick);

        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 2;
        ctx.strokeRect(nodeLeftX - wallThick, rimY, nodeWidth + wallThick * 2, invY - rimY + wallThick);
        ctx.strokeRect(nodeLeftX, rimY, nodeWidth, invY - rimY);

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(nodeLeftX, rimY, nodeWidth, invY - rimY);

        ctx.fillStyle = '#475569';
        ctx.fillRect(nodeCenterX - 18, rimY - 4, 36, 4);

        // Water fill
        const ts = window.ResultStyling && window.ResultStyling.timeSeries;
        let nodeDepth = 0;
        if (ts && ts.nodes && ts.nodes[nodeId]) {
            const nd = ts.nodes[nodeId];
            if (nd.depth && nd.depth[step] !== undefined) nodeDepth = nd.depth[step];
        }

        const waterEl = Math.min(rimEl, Math.max(invEl, invEl + nodeDepth));
        const waterY = cy(waterEl);

        if (nodeDepth > 0.001) {
            ctx.fillStyle = 'rgba(2, 132, 199, 0.45)';
            ctx.fillRect(nodeLeftX, waterY, nodeWidth, invY - waterY);

            ctx.strokeStyle = '#0284c7';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(nodeLeftX, waterY);
            ctx.lineTo(nodeRightX, waterY);
            ctx.stroke();
        }

        const pipeBoxW = Math.min(85, W * 0.15);

        function drawPipeConnectionsCollisionFree(links, isLeft) {
            links.sort((a, b) => b.pInv - a.pInv);
            let lastLabelY = -999;

            links.forEach(item => {
                const pInvY = cy(item.pInv);
                const pCrownY = cy(item.pCrown);
                const pH = Math.max(4, pInvY - pCrownY);

                const px = isLeft ? nodeLeftX - wallThick - pipeBoxW : nodeRightX + wallThick;

                ctx.fillStyle = 'rgba(219, 234, 254, 0.7)';
                ctx.fillRect(px, pCrownY, pipeBoxW, pH);

                if (waterEl > item.pInv) {
                    const pWaterEl = Math.min(item.pCrown, waterEl);
                    const pWaterY = cy(pWaterEl);
                    const pWaterH = Math.max(0, pInvY - pWaterY);
                    ctx.fillStyle = 'rgba(2, 132, 199, 0.45)';
                    ctx.fillRect(px, pWaterY, pipeBoxW, pWaterH);
                }

                ctx.strokeStyle = '#0284c7';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.moveTo(px, pCrownY);
                ctx.lineTo(px + pipeBoxW, pCrownY);
                ctx.moveTo(px, pInvY);
                ctx.lineTo(px + pipeBoxW, pInvY);
                ctx.stroke();

                ctx.fillStyle = 'rgba(219, 234, 254, 0.9)';
                const wallPx = isLeft ? nodeLeftX - wallThick : nodeRightX;
                ctx.fillRect(wallPx, pCrownY, wallThick, pH);

                ctx.font = '10px Inter, system-ui, sans-serif';
                ctx.fillStyle = '#0284c7';
                ctx.textAlign = isLeft ? 'right' : 'left';

                const shortName = formatShortId(item.link.id, 10);
                const crX = isLeft ? px : px + pipeBoxW;

                ctx.beginPath();
                ctx.strokeStyle = '#0284c7';
                ctx.lineWidth = 1;
                ctx.moveTo(crX, pCrownY);
                ctx.lineTo(isLeft ? px - 10 : px + pipeBoxW + 10, pCrownY);
                ctx.stroke();

                ctx.beginPath();
                ctx.moveTo(crX, pInvY);
                ctx.lineTo(isLeft ? px - 10 : px + pipeBoxW + 10, pInvY);
                ctx.stroke();

                const labelX = isLeft ? px - 14 : px + pipeBoxW + 14;

                let textY = (pCrownY + pInvY) / 2;
                if (textY - lastLabelY < 24) textY = lastLabelY + 24;
                lastLabelY = textY;

                ctx.font = 'bold 9px Inter, system-ui, sans-serif';
                ctx.fillText(shortName, labelX, pCrownY - 2);

                ctx.font = '9px Inter, system-ui, sans-serif';
                ctx.fillText(`Crown ${item.pCrown.toFixed(2)}`, labelX, pCrownY + 9);
                ctx.fillText(`Inv ${item.pInv.toFixed(2)}`, labelX, pInvY + 2);
            });
        }

        drawPipeConnectionsCollisionFree(leftLinks, true);
        drawPipeConnectionsCollisionFree(rightLinks, false);

        const rimLabelX = Math.max(16, nodeLeftX - wallThick - pipeBoxW - 60);
        ctx.beginPath();
        ctx.strokeStyle = '#0284c7';
        ctx.lineWidth = 1;
        ctx.moveTo(nodeLeftX - wallThick, rimY);
        ctx.lineTo(rimLabelX, rimY);
        ctx.stroke();

        ctx.font = 'bold 11px Inter, system-ui, sans-serif';
        ctx.fillStyle = '#0284c7';
        ctx.textAlign = 'right';
        ctx.fillText(`Rim El. ${rimEl.toFixed(2)} ${unitStr}`, rimLabelX - 4, rimY + 4);

        const invLabelX = Math.min(W - 16, nodeRightX + wallThick + pipeBoxW + 60);
        ctx.beginPath();
        ctx.strokeStyle = '#0284c7';
        ctx.lineWidth = 1;
        ctx.moveTo(nodeRightX + wallThick, invY);
        ctx.lineTo(invLabelX, invY);
        ctx.stroke();

        ctx.textAlign = 'left';
        ctx.fillText(`Invert El. ${invEl.toFixed(2)} ${unitStr}`, invLabelX + 4, invY + 4);

        const dimX = nodeRightX + wallThick + 20;
        ctx.strokeStyle = '#0284c7';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(dimX, rimY);
        ctx.lineTo(dimX, invY);
        ctx.stroke();

        function drawArrowHead(x, y, isUp) {
            ctx.fillStyle = '#0284c7';
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x - 3, isUp ? y + 6 : y - 6);
            ctx.lineTo(x + 3, isUp ? y + 6 : y - 6);
            ctx.closePath();
            ctx.fill();
        }
        drawArrowHead(dimX, rimY, true);
        drawArrowHead(dimX, invY, false);

        ctx.save();
        ctx.translate(dimX + 14, (rimY + invY) / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = 'center';
        ctx.font = '10px Inter, system-ui, sans-serif';
        ctx.fillStyle = '#0284c7';
        ctx.fillText(`Max depth ${maxD.toFixed(3)} ${unitStr}`, 0, 0);
        ctx.restore();

        // Top-Right Compass
        const compassR = 28;
        const compassCX = W - compassR - 24;
        const compassCY = padTop + compassR - 10;

        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(compassCX, compassCY, compassR, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = '#334155';
        ctx.beginPath();
        ctx.arc(compassCX, compassCY, 3, 0, Math.PI * 2);
        ctx.fill();

        connLinks.forEach(l => {
            const isIncoming = (l.to === node.id);
            const otherId = isIncoming ? l.from : l.to;
            const otherNode = Net.getNode(otherId);

            if (otherNode && node.lngLat && otherNode.lngLat) {
                const dx = (otherNode.lngLat[0] - node.lngLat[0]);
                const dy = (otherNode.lngLat[1] - node.lngLat[1]);
                const rad = Math.atan2(-dy, dx);

                const px = compassCX + Math.cos(rad) * (compassR - 4);
                const py = compassCY + Math.sin(rad) * (compassR - 4);

                ctx.strokeStyle = isIncoming ? '#0284c7' : '#059669';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.moveTo(compassCX, compassCY);
                ctx.lineTo(px, py);
                ctx.stroke();

                const arrX = compassCX + Math.cos(rad) * (isIncoming ? 10 : compassR - 6);
                const arrY = compassCY + Math.sin(rad) * (isIncoming ? 10 : compassR - 6);
                ctx.fillStyle = isIncoming ? '#0284c7' : '#059669';
                ctx.beginPath();
                ctx.arc(arrX, arrY, 2.5, 0, Math.PI * 2);
                ctx.fill();

                const lx = compassCX + Math.cos(rad) * (compassR + 10);
                const ly = compassCY + Math.sin(rad) * (compassR + 10);
                ctx.font = '9px Inter, system-ui, sans-serif';
                ctx.fillStyle = '#475569';
                ctx.textAlign = 'center';
                ctx.fillText(formatShortId(l.id, 6), lx, ly + 3);
            }
        });

        ctx.font = '10px Inter, system-ui, sans-serif';
        ctx.fillStyle = '#64748b';
        ctx.textAlign = 'center';
        ctx.fillText('plan', compassCX, compassCY + compassR + 13);

        ctx.font = '11px Inter, system-ui, sans-serif';
        ctx.fillStyle = '#475569';
        ctx.textAlign = 'left';
        ctx.fillText(`Invert ${invEl.toFixed(2)} ${unitStr}    Rim ${rimEl.toFixed(2)} ${unitStr}    Max depth ${maxD.toFixed(2)} ${unitStr}`, 16, H - 14);

        ctx.restore();
    }

    // ---------- 2. DRAW CONDUIT SIDE PROFILE (WITH NODE CHAMBERS) ----------
    function drawConduitOnCanvas(canvasEl, conduitId, step) {
        if (!canvasEl) return;
        const ctx = canvasEl.getContext('2d');
        if (!ctx) return;

        const link = Net.getLink(conduitId);
        if (!link) return;

        const fromNode = Net.getNode(link.from);
        const toNode = Net.getNode(link.to);

        const dpr = window.devicePixelRatio || 1;
        const W = canvasEl.width / dpr;
        const H = canvasEl.height / dpr;

        ctx.save();
        ctx.scale(dpr, dpr);
        ctx.clearRect(0, 0, W, H);

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, W, H);

        const isUS = (typeof Net !== 'undefined') && Net.units === 'US';
        const unitStr = isUS ? 'ft' : 'm';
        const flowUnit = isUS ? 'CFS' : 'LPS';

        const p = link.props || {};
        const geom1 = Number(p.geom1 || 1.0);
        const shape = (p.xShape || 'CIRCULAR').toUpperCase();
        const len = Number(p.length || 0);

        const fromInv = (fromNode ? Number(fromNode.props.invertEl || 0) : 0) + Number(p.inOffset || 0);
        const toInv = (toNode ? Number(toNode.props.invertEl || 0) : 0) + Number(p.outOffset || 0);

        const fromRim = fromNode ? (Number(fromNode.props.rimEl) || (fromInv + (fromNode.props.maxDepth || 2))) : (fromInv + 2);
        const toRim = toNode ? (Number(toNode.props.rimEl) || (toInv + (toNode.props.maxDepth || 2))) : (toInv + 2);

        const fromCrown = fromInv + geom1;
        const toCrown = toInv + geom1;

        let minEl = Math.min(fromInv, toInv) - 0.3;
        let maxEl = Math.max(fromRim, toRim) + 0.5;
        const elevSpan = Math.max(0.5, maxEl - minEl);

        const padTop = 60;
        const padBottom = 50;
        const padLeft = 80;
        const padRight = 80;
        const plotH = Math.max(100, H - padTop - padBottom);
        const plotW = Math.max(100, W - padLeft - padRight);

        const cy = (el) => padTop + plotH - ((el - minEl) / elevSpan) * plotH;

        const x1 = padLeft;
        const x2 = padLeft + plotW;

        const yFromInv = cy(fromInv);
        const yToInv = cy(toInv);
        const yFromCrown = cy(fromCrown);
        const yToCrown = cy(toCrown);
        const yFromRim = cy(fromRim);
        const yToRim = cy(toRim);

        // Ground line between node rims
        ctx.strokeStyle = '#16a34a';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.moveTo(x1, yFromRim);
        ctx.lineTo(x2, yToRim);
        ctx.stroke();
        ctx.setLineDash([]);

        // Left Node Chamber (fromNode)
        ctx.fillStyle = '#e2e8f0';
        ctx.fillRect(x1 - 20, yFromRim, 20, yFromInv - yFromRim + 6);
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x1 - 20, yFromRim, 20, yFromInv - yFromRim + 6);

        // Right Node Chamber (toNode)
        ctx.fillStyle = '#e2e8f0';
        ctx.fillRect(x2, yToRim, 20, yToInv - yToRim + 6);
        ctx.strokeRect(x2, yToRim, 20, yToInv - yToRim + 6);

        // Dry Pipe cross-section polygon
        ctx.beginPath();
        ctx.moveTo(x1, yFromCrown);
        ctx.lineTo(x2, yToCrown);
        ctx.lineTo(x2, yToInv);
        ctx.lineTo(x1, yFromInv);
        ctx.closePath();
        ctx.fillStyle = 'rgba(148,163,184,0.25)';
        ctx.fill();

        // Water Fill
        const ts = window.ResultStyling && window.ResultStyling.timeSeries;
        let flow = 0, vel = 0, depth = 0, cap = 0;
        if (ts && ts.links && ts.links[link.id]) {
            const ld = ts.links[link.id];
            if (ld.flow && ld.flow[step] !== undefined) flow = ld.flow[step];
            if (ld.velocity && ld.velocity[step] !== undefined) vel = ld.velocity[step];
            if (ld.depth && ld.depth[step] !== undefined) depth = ld.depth[step];
            if (ld.capacity && ld.capacity[step] !== undefined) cap = ld.capacity[step];
        }

        if (depth > 0.001) {
            const wFromHead = fromInv + Math.min(geom1, depth);
            const wToHead = toInv + Math.min(geom1, depth);
            const yWFrom = cy(wFromHead);
            const yWTo = cy(wToHead);

            ctx.beginPath();
            ctx.moveTo(x1, yWFrom);
            ctx.lineTo(x2, yWTo);
            ctx.lineTo(x2, yToInv);
            ctx.lineTo(x1, yFromInv);
            ctx.closePath();
            ctx.fillStyle = cap >= 1.0 ? 'rgba(220,38,38,0.65)' : (cap >= 0.85 ? 'rgba(245,158,11,0.7)' : 'rgba(2, 132, 199, 0.5)');
            ctx.fill();

            // Water surface line
            ctx.strokeStyle = '#0284c7';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x1, yWFrom);
            ctx.lineTo(x2, yWTo);
            ctx.stroke();
        }

        // Pipe outlines
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 2;
        // Crown line
        ctx.beginPath();
        ctx.moveTo(x1, yFromCrown);
        ctx.lineTo(x2, yToCrown);
        ctx.stroke();
        // Invert line
        ctx.beginPath();
        ctx.moveTo(x1, yFromInv);
        ctx.lineTo(x2, yToInv);
        ctx.stroke();

        // Node ID Labels
        ctx.font = 'bold 11px Inter, system-ui, sans-serif';
        ctx.fillStyle = '#0f172a';
        ctx.textAlign = 'center';
        ctx.fillText(link.from, x1 - 10, yFromRim - 10);
        ctx.fillText(link.to, x2 + 10, yToRim - 10);

        // Callout labels
        ctx.font = '10px Inter, system-ui, sans-serif';
        ctx.fillStyle = '#0284c7';
        ctx.textAlign = 'right';
        ctx.fillText(`Up Inv ${fromInv.toFixed(2)}`, x1 - 24, yFromInv + 3);
        ctx.textAlign = 'left';
        ctx.fillText(`Dn Inv ${toInv.toFixed(2)}`, x2 + 24, yToInv + 3);

        // Pipe stats center callout
        ctx.font = '11px Inter, system-ui, sans-serif';
        ctx.fillStyle = '#0284c7';
        ctx.textAlign = 'center';
        ctx.fillText(`Geom1/Height: ${geom1.toFixed(2)} ${unitStr}   Length: ${len.toFixed(1)} ${unitStr}`, W / 2, padTop - 20);

        // Bottom Summary Bar
        ctx.font = '11px Inter, system-ui, sans-serif';
        ctx.fillStyle = '#475569';
        ctx.textAlign = 'left';
        ctx.fillText(`Depth: ${depth.toFixed(3)} ${unitStr}    Flow: ${flow.toFixed(3)} ${flowUnit}    Vel: ${vel.toFixed(3)} ${isUS ? 'fps' : 'm/s'}    Cap: ${(cap * 100).toFixed(1)}%`, 16, H - 14);

        ctx.restore();
    }

    // Unified Open API
    function open(id, type = 'NODE') {
        if (window.ProfilePlot && window.ProfilePlot.openForElement) {
            window.ProfilePlot.openForElement(id, type);
        }
    }

    window.NodeSchematic = {
        drawNodeOnCanvas,
        drawConduitOnCanvas,
        open
    };
})();
