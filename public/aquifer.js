/**
 * aquifer.js — Groundwater & Aquifer Editor for SWMM 6
 */
(function () {
    "use strict";

    var aquifers = [];
    var nextAqId = 1;

    function getNextId() {
        while (aquifers.some(function(a) { return a.id === "A" + nextAqId; })) nextAqId++;
        return "A" + nextAqId;
    }

    function defaultAquifer() {
        return {
            id: getNextId(), name: "Aquifer " + (aquifers.length + 1),
            porosity: 0.5, wiltingPoint: 0.15, fieldCapacity: 0.3, conductivity: 5.0,
            conductivitySlope: 10.0, tensionSlope: 10.0, upperEvapFrac: 0.2, lowerEvapDepth: 1.0,
            bottomElevation: -10, waterTableElevation: -2, unsaturatedZone: 0.5, evapSurfaceFrac: 0.0,
            etUpperDepth: 0.1, etLowerDepth: 0.5, etLowerFrac: 0.0
        };
    }

    function addAquifer() { var a = defaultAquifer(); aquifers.push(a); if (window.Net) { window.Net.aquifers = aquifers; window.Net._modified = true; } return a; }
    function removeAquifer(id) { aquifers = aquifers.filter(function(a) { return a.id !== id; }); if (window.Net) { window.Net.aquifers = aquifers; window.Net._modified = true; } }
    function updateAquifer(id, updates) { var a = aquifers.find(function(a) { return a.id === id; }); if (!a) return; Object.assign(a, updates); if (window.Net) { window.Net.aquifers = aquifers; window.Net._modified = true; } }
    function getAquifer(id) { return aquifers.find(function(a) { return a.id === id; }); }
    function getAllAquifers() { return aquifers; }

    function getGroundwaterParams(subId) { if (!subId || !window.Net) return null; var sub = window.Net.getSubcatchment(subId); return sub && sub.groundwater ? sub.groundwater : null; }
    function setGroundwaterParams(subId, params) { var sub = window.Net && window.Net.getSubcatchment(subId); if (!sub) return; sub.groundwater = Object.assign({}, sub.groundwater || {}, params); if (window.Net) window.Net._modified = true; }
    function removeGroundwaterParams(subId) { var sub = window.Net && window.Net.getSubcatchment(subId); if (!sub) return; delete sub.groundwater; if (window.Net) window.Net._modified = true; }

    var modalEl = null;
    function initUI() {
        if (document.getElementById("aquifer-editor-modal")) return;
        modalEl = document.createElement("div");
        modalEl.id = "aquifer-editor-modal";
        modalEl.className = "ts-modal hidden";
        modalEl.innerHTML = [
            "<div class=\"ts-modal-header\"><span>Groundwater &amp; Aquifer Editor</span>",
            "<button id=\"btn-aquifer-close\" class=\"ts-close-btn\">&times;</button></div>",
            "<div class=\"ts-modal-body\" style=\"display:flex;gap:12px;min-height:360px;\">",
            "<div style=\"flex:0 0 220px;border-right:1px solid var(--border);padding-right:10px;\">",
            "<div style=\"font-size:11px;font-weight:600;color:var(--text-mid);margin-bottom:6px;\">Aquifers</div>",
            "<select id=\"aquifer-list\" multiple style=\"width:100%;min-height:200px;font-size:12px;border:1px solid var(--border);border-radius:4px;\"></select>",
            "<div style=\"margin-top:6px;display:flex;gap:4px;\"><button id=\"btn-aquifer-add\" class=\"tb-btn\" style=\"flex:1;\">+ Add</button><button id=\"btn-aquifer-del\" class=\"tb-btn tb-btn-danger\" style=\"flex:1;\">- Delete</button></div>",
            "</div>",
            "<div style=\"flex:1;overflow-y:auto;max-height:480px;\" id=\"aquifer-editor-panel\">",
            "<p style=\"color:var(--text-faint);font-size:12px;\">Select or add an aquifer to edit.</p></div></div></div>"
        ].join("\n");
        document.body.appendChild(modalEl);
        if (window.initModalDrag) window.initModalDrag(modalEl, modalEl.querySelector('.ts-modal-header'));
        document.getElementById("btn-aquifer-close").onclick = function () { modalEl.classList.add("hidden"); };
        document.getElementById("btn-aquifer-add").onclick = function () { var a = addAquifer(); renderList(); selectAquifer(a.id); };
        document.getElementById("btn-aquifer-del").onclick = function () { var s = document.getElementById("aquifer-list").value; if (s) removeAquifer(s); renderList(); document.getElementById("aquifer-editor-panel").innerHTML = "<p style=\"color:var(--text-faint);font-size:12px;\">Select or add an aquifer to edit.</p>"; };
        document.getElementById("aquifer-list").onchange = function () { var s = document.getElementById("aquifer-list").value; if (s) renderEditor(s); };
    }

    function renderList() {
        document.getElementById("aquifer-list").innerHTML = aquifers.map(function(a) {
            return "<option value=\"" + a.id + "\">" + a.id + " (" + esc(a.name) + ")</option>";
        }).join("");
    }
    function selectAquifer(id) {
        var opts = document.getElementById("aquifer-list").options;
        for (var i = 0; i < opts.length; i++) { if (opts[i].value === id) { opts[i].selected = true; break; } }
        renderEditor(id);
    }
    function esc(s) { if (typeof s !== "string") return String(s || ""); return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
    function numField(key, label, value, unit, step) {
        return "<div class=\"prop-row\"><label>" + label + (unit ? " <span class=\"unit-hint\">(" + unit + ")</span>" : "") + "</label><input type=\"number\" step=\"" + (step || "any") + "\" class=\"aq-num\" data-key=\"" + key + "\" value=\"" + value + "\"></div>";
    }
    function renderEditor(id) {
        var a = getAquifer(id);
        var panel = document.getElementById("aquifer-editor-panel");
        if (!a) { panel.innerHTML = "<p style=\"color:var(--text-faint);font-size:12px;\">Not found.</p>"; return; }
        var html = "<div class=\"prop-section-title\">Aquifer: " + a.id + "</div>";
        html += "<div class=\"prop-row\"><label>Name</label><input type=\"text\" id=\"aquifer-name\" value=\"" + esc(a.name) + "\"></div>";
        html += "<div class=\"prop-section-title\" style=\"margin-top:10px;\">Soil Properties</div>";
        html += numField("porosity", "Porosity", a.porosity, "fraction", 0.01);
        html += numField("wiltingPoint", "Wilting Point", a.wiltingPoint, "fraction", 0.01);
        html += numField("fieldCapacity", "Field Capacity", a.fieldCapacity, "fraction", 0.01);
        html += numField("conductivity", "Conductivity", a.conductivity, "mm/hr", 0.1);
        html += numField("conductivitySlope", "Conductivity Slope", a.conductivitySlope, "", 1);
        html += numField("tensionSlope", "Tension Slope", a.tensionSlope, "", 1);
        html += "<div class=\"prop-section-title\" style=\"margin-top:10px;\">Evaporation</div>";
        html += numField("upperEvapFrac", "Upper Evap Fraction", a.upperEvapFrac, "fraction", 0.01);
        html += numField("lowerEvapDepth", "Lower Evap Depth", a.lowerEvapDepth, "m", 0.1);
        html += numField("evapSurfaceFrac", "Fixed Evap Surface Fraction", a.evapSurfaceFrac, "fraction", 0.01);
        html += numField("etUpperDepth", "ET Upper Depth", a.etUpperDepth, "m", 0.1);
        html += numField("etLowerDepth", "ET Lower Depth", a.etLowerDepth, "m", 0.1);
        html += numField("etLowerFrac", "ET Lower Fraction", a.etLowerFrac, "fraction", 0.01);
        html += "<div class=\"prop-section-title\" style=\"margin-top:10px;\">Water Table</div>";
        html += numField("bottomElevation", "Bottom Elevation", a.bottomElevation, "m", 0.1);
        html += numField("waterTableElevation", "Water Table Elevation", a.waterTableElevation, "m", 0.1);
        html += numField("unsaturatedZone", "Unsaturated Zone", a.unsaturatedZone, "m", 0.1);
        panel.innerHTML = html;
        document.getElementById("aquifer-name").onchange = function(e) { updateAquifer(a.id, {name:e.target.value}); renderList(); };
        panel.querySelectorAll(".aq-num").forEach(function(input) {
            input.onchange = function() { updateAquifer(a.id, {}); var obj = {}; obj[input.dataset.key] = parseFloat(input.value) || 0; updateAquifer(a.id, obj); };
        });
    }
    function openEditor() { if (!modalEl) initUI(); renderList(); modalEl.classList.remove("hidden"); }

    window.AquiferEditor = {
        openEditor: openEditor, addAquifer: addAquifer, removeAquifer: removeAquifer,
        updateAquifer: updateAquifer, getAquifer: getAquifer, getAllAquifers: getAllAquifers,
        getGroundwaterParams: getGroundwaterParams, setGroundwaterParams: setGroundwaterParams,
        removeGroundwaterParams: removeGroundwaterParams,
        loadAquifers: function(data) { aquifers = data || []; if (window.Net) window.Net.aquifers = aquifers; }
    };
    if (document.readyState === "loading") { document.addEventListener("DOMContentLoaded", initUI); } else { initUI(); }
})();
