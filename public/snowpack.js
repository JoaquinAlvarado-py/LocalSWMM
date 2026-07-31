/**
 * snowpack.js — Snowmelt Parameters Editor for SWMM 6
 */
(function () {
    "use strict";

    var snowpacks = [];
    var nextSpId = 1;

    function getNextId() {
        while (snowpacks.some(function(s) { return s.id === "S" + nextSpId; })) nextSpId++;
        return "S" + nextSpId;
    }

    function defaultSnowpack() {
        return {
            id: getNextId(), name: "Snowpack " + (snowpacks.length + 1),
            minMeltCoeff: 1.0, maxMeltCoeff: 3.0, baseTemp: 0, fracRiv: 0.5,
            snowDepth: 0, snowTemp: 0, snowDensity: 0.1, albedo: 0.6, sublimation: 0.0,
            atiSnow: 0, atiRain: 0, antecedentTempIndex: 0, coldContent: 0
        };
    }

    function addSnowpack() { var s = defaultSnowpack(); snowpacks.push(s); if (window.Net) { window.Net.snowpacks = snowpacks; window.Net._modified = true; } return s; }
    function removeSnowpack(id) { snowpacks = snowpacks.filter(function(s) { return s.id !== id; }); if (window.Net) { window.Net.snowpacks = snowpacks; window.Net._modified = true; } }
    function updateSnowpack(id, updates) { var s = snowpacks.find(function(s) { return s.id === id; }); if (!s) return; Object.assign(s, updates); if (window.Net) { window.Net.snowpacks = snowpacks; window.Net._modified = true; } }
    function getSnowpack(id) { return snowpacks.find(function(s) { return s.id === id; }); }
    function getAllSnowpacks() { return snowpacks; }
    function getSnowpackAssignment(subId) { if (!subId || !window.Net) return null; var sub = window.Net.getSubcatchment(subId); return sub && sub.snowpackId ? sub.snowpackId : null; }
    function setSnowpackAssignment(subId, spId) { var sub = window.Net && window.Net.getSubcatchment(subId); if (!sub) return; sub.snowpackId = spId; if (window.Net) window.Net._modified = true; }

    var modalEl = null;
    function initUI() {
        if (document.getElementById("snowpack-editor-modal")) return;
        modalEl = document.createElement("div");
        modalEl.id = "snowpack-editor-modal";
        modalEl.className = "ts-modal hidden";
        modalEl.innerHTML = [
            "<div class=\"ts-modal-header\"><span>Snowpack Editor</span>",
            "<button id=\"btn-snowpack-close\" class=\"ts-close-btn\">&times;</button></div>",
            "<div class=\"ts-modal-body\" style=\"display:flex;gap:12px;min-height:360px;\">",
            "<div style=\"flex:0 0 220px;border-right:1px solid var(--border);padding-right:10px;\">",
            "<div style=\"font-size:11px;font-weight:600;color:var(--text-mid);margin-bottom:6px;\">Snowpacks</div>",
            "<select id=\"snowpack-list\" multiple style=\"width:100%;min-height:200px;font-size:12px;border:1px solid var(--border);border-radius:4px;\"></select>",
            "<div style=\"margin-top:6px;display:flex;gap:4px;\"><button id=\"btn-snowpack-add\" class=\"tb-btn\" style=\"flex:1;\">+ Add</button><button id=\"btn-snowpack-del\" class=\"tb-btn tb-btn-danger\" style=\"flex:1;\">- Delete</button></div>",
            "</div>",
            "<div style=\"flex:1;overflow-y:auto;max-height:480px;\" id=\"snowpack-editor-panel\">",
            "<p style=\"color:var(--text-faint);font-size:12px;\">Select or add a snowpack to edit.</p></div></div></div>"
        ].join("\n");
        document.body.appendChild(modalEl);
        document.getElementById("btn-snowpack-close").onclick = function () { modalEl.classList.add("hidden"); };
        document.getElementById("btn-snowpack-add").onclick = function () { var s = addSnowpack(); renderList(); selectSnowpack(s.id); };
        document.getElementById("btn-snowpack-del").onclick = function () { var s = document.getElementById("snowpack-list").value; if (s) removeSnowpack(s); renderList(); document.getElementById("snowpack-editor-panel").innerHTML = "<p style=\"color:var(--text-faint);font-size:12px;\">Select or add a snowpack to edit.</p>"; };
        document.getElementById("snowpack-list").onchange = function () { var s = document.getElementById("snowpack-list").value; if (s) renderEditor(s); };
    }
    function renderList() {
        document.getElementById("snowpack-list").innerHTML = snowpacks.map(function(s) {
            return "<option value=\"" + s.id + "\">" + s.id + " (" + esc(s.name) + ")</option>";
        }).join("");
    }
    function selectSnowpack(id) {
        var opts = document.getElementById("snowpack-list").options;
        for (var i = 0; i < opts.length; i++) { if (opts[i].value === id) { opts[i].selected = true; break; } }
        renderEditor(id);
    }
    function esc(s) { if (typeof s !== "string") return String(s || ""); return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
    function numField(key, label, value, unit, step) {
        return "<div class=\"prop-row\"><label>" + label + (unit ? " <span class=\"unit-hint\">(" + unit + ")</span>" : "") + "</label><input type=\"number\" step=\"" + (step || "any") + "\" class=\"sp-num\" data-key=\"" + key + "\" value=\"" + value + "\"></div>";
    }
    function renderEditor(id) {
        var s = getSnowpack(id);
        var panel = document.getElementById("snowpack-editor-panel");
        if (!s) { panel.innerHTML = "<p style=\"color:var(--text-faint);font-size:12px;\">Not found.</p>"; return; }
        var html = "<div class=\"prop-section-title\">Snowpack: " + s.id + "</div>";
        html += "<div class=\"prop-row\"><label>Name</label><input type=\"text\" id=\"snowpack-name\" value=\"" + esc(s.name) + "\"></div>";
        html += "<div class=\"prop-section-title\" style=\"margin-top:10px;\">Melt Coefficients</div>";
        html += numField("minMeltCoeff", "Min Melt Coefficient", s.minMeltCoeff, "mm/hr-°C", 0.1);
        html += numField("maxMeltCoeff", "Max Melt Coefficient", s.maxMeltCoeff, "mm/hr-°C", 0.1);
        html += numField("baseTemp", "Base Temperature", s.baseTemp, "°C", 0.5);
        html += "<div class=\"prop-section-title\" style=\"margin-top:10px;\">Initial Conditions</div>";
        html += numField("snowDepth", "Initial Snow Depth", s.snowDepth, "mm", 1);
        html += numField("snowTemp", "Initial Snow Temperature", s.snowTemp, "°C", 0.5);
        html += numField("snowDensity", "Initial Snow Density", s.snowDensity, "g/cm³", 0.01);
        html += numField("albedo", "Albedo", s.albedo, "0-1", 0.05);
        html += numField("sublimation", "Sublimation Factor", s.sublimation, "", 0.01);
        html += numField("fracRiv", "Fraction of Riveted Area", s.fracRiv, "fraction", 0.1);
        html += "<div class=\"prop-section-title\" style=\"margin-top:10px;\">ATI</div>";
        html += numField("atiSnow", "ATI (Snow)", s.atiSnow, "", 0.1);
        html += numField("atiRain", "ATI (Rain)", s.atiRain, "", 0.1);
        html += numField("antecedentTempIndex", "ATI", s.antecedentTempIndex, "", 0.1);
        html += numField("coldContent", "Cold Content", s.coldContent, "", 0.1);
        panel.innerHTML = html;
        document.getElementById("snowpack-name").onchange = function(e) { updateSnowpack(s.id, {name:e.target.value}); renderList(); };
        panel.querySelectorAll(".sp-num").forEach(function(input) {
            input.onchange = function() { var obj = {}; obj[input.dataset.key] = parseFloat(input.value) || 0; updateSnowpack(s.id, obj); };
        });
    }
    function openEditor() { if (!modalEl) initUI(); renderList(); modalEl.classList.remove("hidden"); }

    window.SnowpackEditor = {
        openEditor: openEditor, addSnowpack: addSnowpack, removeSnowpack: removeSnowpack,
        updateSnowpack: updateSnowpack, getSnowpack: getSnowpack, getAllSnowpacks: getAllSnowpacks,
        getSnowpackAssignment: getSnowpackAssignment, setSnowpackAssignment: setSnowpackAssignment,
        loadSnowpacks: function(data) { snowpacks = data || []; if (window.Net) window.Net.snowpacks = snowpacks; }
    };
    if (document.readyState === "loading") { document.addEventListener("DOMContentLoaded", initUI); } else { initUI(); }
})();
