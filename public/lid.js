/**
 * lid.js — LID (Low Impact Development) Controls for SWMM 6
 */
(function () {
    "use strict";

    const LID_TYPES = ["BC","RG","GR","PP","IT","VS","RB","RD","CP"];
    const LID_TYPE_LABELS = {
        BC: "Bio-Retention Cell", RG: "Rain Garden", GR: "Green Roof",
        PP: "Permeable Pavement", IT: "Infiltration Trench", VS: "Vegetative Swale",
        RB: "Rain Barrel", RD: "Rooftop Disconnection", CP: "Custom"
    };

    let lidControls = [];
    let nextId = 1;

    function getNextId() {
        while (lidControls.some(c => c.id === "LC" + nextId)) nextId++;
        return "LC" + nextId;
    }

    function defaultLidControl(type) {
        return {
            id: getNextId(), type: type || "BC",
            surface: { bermHt: type === "GR" ? 0 : 150, vegVolFrac: type === "GR" ? 0 : 0.1,
                roughness: type === "VS" ? 0.24 : 0.1, surfaceSlope: 1.0, swaleSideSlope: type === "VS" ? 3 : 0 },
            soil: { thickness: ["PP","RB","RD"].includes(type) ? 0 : 300, porosity: 0.5,
                fieldCapacity: 0.2, wiltingPoint: 0.1,
                conductivity: ["IT","VS"].includes(type) ? 100 : 30, conductivitySlope: 10, suctionHead: 75 },
            storage: { thickness: ["BC","RG","GR","PP","IT"].includes(type) ? 300 : 0,
                voidRatio: 0.75, seepageRate: ["GR","RB","RD"].includes(type) ? 0 : 0.5, clogFactor: 0 },
            drain: { flowCoeff: ["RB","RD"].includes(type) ? 0.5 : 0, flowExpon: 0.5,
                offsetHeight: ["RB","RD"].includes(type) ? 75 : 0, delay: 0, headLevel: 0, closed: false },
            drainmat: { thickness: type === "GR" ? 25 : 0, voidFrac: 0.5, roughness: 0.1 },
            description: "", displayColor: "#4caf50"
        };
    }

    function addLidControl(type) {
        var ctrl = defaultLidControl(type);
        lidControls.push(ctrl);
        if (window.Net) { window.Net.lidControls = lidControls; window.Net._modified = true; }
        return ctrl;
    }
    function removeLidControl(id) {
        lidControls = lidControls.filter(c => c.id !== id);
        if (window.Net) { window.Net.lidControls = lidControls; window.Net._modified = true; }
    }
    function updateLidControl(id, updates) {
        var ctrl = lidControls.find(c => c.id === id);
        if (!ctrl) return;
        Object.assign(ctrl, updates);
        if (window.Net) { window.Net.lidControls = lidControls; window.Net._modified = true; }
    }
    function getLidControl(id) { return lidControls.find(c => c.id === id); }
    function getAllLidControls() { return lidControls; }
    function loadLidControls(data) { lidControls = data || []; if (window.Net) window.Net.lidControls = lidControls; }

    function getLidUsages(subId) {
        if (!subId || !window.Net) return [];
        var sub = window.Net.getSubcatchment(subId);
        return sub && sub.lidUsages ? sub.lidUsages : [];
    }
    function addLidUsage(subId, lidControlId, options) {
        var sub = window.Net && window.Net.getSubcatchment(subId);
        if (!sub) return null;
        if (!sub.lidUsages) sub.lidUsages = [];
        var usage = { lidControl: lidControlId, number: options.number || 1, area: options.area || 100,
            width: options.width || 10, initSat: options.initSat || 0, fromImp: options.fromImp || 100,
            toPerv: options.toPerv || 0, reportFile: options.reportFile || "", drainSubcatch: options.drainSubcatch || "" };
        sub.lidUsages.push(usage);
        if (window.Net) window.Net._modified = true;
        return usage;
    }
    function removeLidUsage(subId, index) {
        var sub = window.Net && window.Net.getSubcatchment(subId);
        if (!sub || !sub.lidUsages) return;
        sub.lidUsages.splice(index, 1);
        if (window.Net) window.Net._modified = true;
    }

    var modalEl = null, listEl = null, editorEl = null;
    function initUI() {
        if (document.getElementById("lid-editor-modal")) return;
        modalEl = document.createElement("div");
        modalEl.id = "lid-editor-modal";
        modalEl.className = "ts-modal hidden";
        modalEl.innerHTML = [
            "<div class=\"ts-modal-header\"><span>LID Control Editor</span>",
            "<button id=\"btn-lid-close\" class=\"ts-close-btn\">&times;</button></div>",
            "<div class=\"ts-modal-body\" style=\"display:flex;gap:12px;min-height:380px;\">",
            "<div style=\"flex:0 0 220px;border-right:1px solid var(--border);padding-right:10px;\">",
            "<div style=\"font-size:11px;font-weight:600;color:var(--text-mid);margin-bottom:6px;\">LID Controls</div>",
            "<select id=\"lid-list\" multiple style=\"width:100%;min-height:240px;font-size:12px;border:1px solid var(--border);border-radius:4px;\"></select>",
            "<div style=\"margin-top:6px;display:flex;gap:4px;\">",
            "<button id=\"btn-lid-add\" class=\"tb-btn\" style=\"flex:1;\">+ Add</button>",
            "<button id=\"btn-lid-del\" class=\"tb-btn tb-btn-danger\" style=\"flex:1;\">- Delete</button>",
            "</div></div>",
            "<div style=\"flex:1;overflow-y:auto;max-height:480px;\" id=\"lid-editor-panel\">",
            "<p style=\"color:var(--text-faint);font-size:12px;\">Select or add a LID control to edit.</p>",
            "</div></div></div>"
        ].join("\n");
        document.body.appendChild(modalEl);
        if (window.initModalDrag) window.initModalDrag(modalEl, modalEl.querySelector('.ts-modal-header'));
        listEl = document.getElementById("lid-list");
        editorEl = document.getElementById("lid-editor-panel");
        document.getElementById("btn-lid-close").onclick = function () { modalEl.classList.add("hidden"); };
        document.getElementById("btn-lid-add").onclick = function () { var c = addLidControl("BC"); renderList(); selectLid(c.id); };
        document.getElementById("btn-lid-del").onclick = function () {
            var sel = listEl.value; if (sel) removeLidControl(sel);
            renderList(); editorEl.innerHTML = "<p style=\"color:var(--text-faint);font-size:12px;\">Select or add a LID control to edit.</p>";
        };
        listEl.onchange = function () { if (listEl.value) renderEditor(listEl.value); };
    }

    function renderList() {
        listEl.innerHTML = lidControls.map(function (c) {
            return "<option value=\"" + c.id + "\">" + c.id + " (" + (LID_TYPE_LABELS[c.type] || c.type) + ")</option>";
        }).join("");
    }
    function selectLid(id) {
        for (var i = 0; i < listEl.options.length; i++) {
            if (listEl.options[i].value === id) { listEl.options[i].selected = true; break; }
        }
        renderEditor(id);
    }
    function esc(s) {
        if (typeof s !== "string") return String(s || "");
        return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
    }
    function numField(key, label, value, unit, step) {
        return "<div class=\"prop-row\"><label>" + label + (unit ? " <span class=\"unit-hint\">(" + unit + ")</span>" : "") + "</label><input type=\"number\" step=\"" + (step || "any") + "\" class=\"lid-num\" data-key=\"" + key + "\" value=\"" + value + "\"></div>";
    }
    function renderEditor(id) {
        var ctrl = getLidControl(id);
        if (!ctrl) { editorEl.innerHTML = "<p style=\"color:var(--text-faint);font-size:12px;\">Not found.</p>"; return; }
        var typeOpts = LID_TYPES.map(function (t) {
            return "<option value=\"" + t + "\" " + (ctrl.type === t ? "selected" : "") + ">" + (LID_TYPE_LABELS[t] || t) + "</option>";
        }).join("");
        var html = "<div class=\"prop-section-title\">LID: " + ctrl.id + "</div>";
        html += "<div class=\"prop-row\"><label>Type</label><select id=\"lid-editor-type\">" + typeOpts + "</select></div>";
        html += "<div class=\"prop-row\"><label>Description</label><input type=\"text\" id=\"lid-editor-desc\" value=\"" + esc(ctrl.description) + "\"></div>";
        html += "<div class=\"prop-row\"><label>Display Color</label><input type=\"color\" id=\"lid-editor-color\" value=\"" + (ctrl.displayColor || "#4caf50") + "\"></div>";
        html += "<div class=\"prop-section-title\" style=\"margin-top:12px;\">Surface Layer</div>";
        html += numField("surface.bermHt", "Berm Height", ctrl.surface.bermHt, "mm", 1);
        html += numField("surface.vegVolFrac", "Vegetation Volume", ctrl.surface.vegVolFrac, "fraction", 0.01);
        html += numField("surface.roughness", "Surface Roughness", ctrl.surface.roughness, "Manning's n", 0.001);
        html += numField("surface.surfaceSlope", "Surface Slope", ctrl.surface.surfaceSlope, "%", 0.1);
        html += numField("surface.swaleSideSlope", "Swale Side Slope", ctrl.surface.swaleSideSlope, "H:V", 0.1);
        html += "<div class=\"prop-section-title\" style=\"margin-top:12px;\">Soil Layer</div>";
        html += numField("soil.thickness", "Thickness", ctrl.soil.thickness, "mm", 1);
        html += numField("soil.porosity", "Porosity", ctrl.soil.porosity, "fraction", 0.01);
        html += numField("soil.fieldCapacity", "Field Capacity", ctrl.soil.fieldCapacity, "fraction", 0.01);
        html += numField("soil.wiltingPoint", "Wilting Point", ctrl.soil.wiltingPoint, "fraction", 0.01);
        html += numField("soil.conductivity", "Conductivity", ctrl.soil.conductivity, "mm/hr", 1);
        html += numField("soil.conductivitySlope", "Conductivity Slope", ctrl.soil.conductivitySlope, "", 1);
        html += numField("soil.suctionHead", "Suction Head", ctrl.soil.suctionHead, "mm", 1);
        html += "<div class=\"prop-section-title\" style=\"margin-top:12px;\">Storage Layer</div>";
        html += numField("storage.thickness", "Thickness", ctrl.storage.thickness, "mm", 1);
        html += numField("storage.voidRatio", "Void Ratio", ctrl.storage.voidRatio, "", 0.01);
        html += numField("storage.seepageRate", "Seepage Rate", ctrl.storage.seepageRate, "mm/hr", 0.1);
        html += numField("storage.clogFactor", "Clogging Factor", ctrl.storage.clogFactor, "", 0.1);
        html += "<div class=\"prop-section-title\" style=\"margin-top:12px;\">Drain Layer</div>";
        html += numField("drain.flowCoeff", "Flow Coefficient", ctrl.drain.flowCoeff, "", 0.01);
        html += numField("drain.flowExpon", "Flow Exponent", ctrl.drain.flowExpon, "", 0.01);
        html += numField("drain.offsetHeight", "Offset Height", ctrl.drain.offsetHeight, "mm", 1);
        html += numField("drain.delay", "Drain Delay", ctrl.drain.delay, "hrs", 1);
        html += numField("drain.headLevel", "Head Level", ctrl.drain.headLevel, "mm", 1);
        html += "<div class=\"prop-row\"><label>Closed Drain</label><select id=\"lid-drain-closed\"><option value=\"false\" " + (!ctrl.drain.closed ? "selected" : "") + ">NO</option><option value=\"true\" " + (ctrl.drain.closed ? "selected" : "") + ">YES</option></select></div>";
        html += "<div class=\"prop-section-title\" style=\"margin-top:12px;\">Drainage Mat Layer</div>";
        html += numField("drainmat.thickness", "Thickness", ctrl.drainmat.thickness, "mm", 1);
        html += numField("drainmat.voidFrac", "Void Fraction", ctrl.drainmat.voidFrac, "", 0.01);
        html += numField("drainmat.roughness", "Roughness", ctrl.drainmat.roughness, "Manning's n", 0.001);
        editorEl.innerHTML = html;
        document.getElementById("lid-editor-type").onchange = function (e) { updateLidControl(ctrl.id, {type:e.target.value}); renderList(); };
        document.getElementById("lid-editor-desc").onchange = function (e) { updateLidControl(ctrl.id, {description:e.target.value}); };
        document.getElementById("lid-editor-color").onchange = function (e) { updateLidControl(ctrl.id, {displayColor:e.target.value}); };
        document.getElementById("lid-drain-closed").onchange = function (e) {
            var m = JSON.parse(JSON.stringify(ctrl)); m.drain.closed = e.target.value === "true"; updateLidControl(ctrl.id, m);
        };
        editorEl.querySelectorAll(".lid-num").forEach(function (input) {
            input.onchange = function () {
                var key = input.dataset.key, val = parseFloat(input.value) || 0;
                var m = JSON.parse(JSON.stringify(ctrl));
                var parts = key.split("."), cur = m;
                for (var i = 0; i < parts.length - 1; i++) cur = cur[parts[i]];
                cur[parts[parts.length - 1]] = val;
                updateLidControl(ctrl.id, m);
            };
        });
    }
    function openEditor() { if (!modalEl) initUI(); renderList(); modalEl.classList.remove("hidden"); }

    window.LIDControls = {
        openEditor: openEditor, addLidControl: addLidControl, removeLidControl: removeLidControl,
        updateLidControl: updateLidControl, getLidControl: getLidControl, getAllLidControls: getAllLidControls,
        loadLidControls: loadLidControls, getLidUsages: getLidUsages, addLidUsage: addLidUsage,
        removeLidUsage: removeLidUsage, LID_TYPES: LID_TYPES, LID_TYPE_LABELS: LID_TYPE_LABELS
    };
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initUI);
    } else { initUI(); }
})();
