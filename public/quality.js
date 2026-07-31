/**
 * quality.js — Water Quality Editor for SWMM 6
 */
(function () {
    "use strict";

    var pollutants = [];
    var nextPolId = 1;

    function getNextPollutantId() {
        while (pollutants.some(function(p) { return p.id === "P" + nextPolId; })) nextPolId++;
        return "P" + nextPolId;
    }
    function defaultPollutant() {
        return { id: getNextPollutantId(), name: "Pollutant " + (pollutants.length + 1), units: "MG/L",
            rainConcentration: 0, gwConcentration: 0, iiConcentration: 0, decayCoeff: 0,
            snowOnly: false, coPollutant: "", coFraction: 0, firstOrderDecay: false };
    }
    function addPollutant() { var p = defaultPollutant(); pollutants.push(p); if (window.Net) { window.Net.pollutants = pollutants; window.Net._modified = true; } return p; }
    function removePollutant(id) { pollutants = pollutants.filter(function(p) { return p.id !== id; }); if (window.Net) { window.Net.pollutants = pollutants; window.Net._modified = true; } }
    function updatePollutant(id, updates) { var p = pollutants.find(function(p) { return p.id === id; }); if (!p) return; Object.assign(p, updates); if (window.Net) { window.Net.pollutants = pollutants; window.Net._modified = true; } }
    function getPollutant(id) { return pollutants.find(function(p) { return p.id === id; }); }
    function getAllPollutants() { return pollutants; }

    var landUses = [];
    var nextLuId = 1;
    function getNextLandUseId() { while (landUses.some(function(l) { return l.id === "LU" + nextLuId; })) nextLuId++; return "LU" + nextLuId; }
    function defaultLandUse() { return { id: getNextLandUseId(), name: "LandUse " + (landUses.length + 1), description: "", buildup: [], washoff: [], lastSwept: "" }; }
    function addLandUse() { var lu = defaultLandUse(); landUses.push(lu); if (window.Net) { window.Net.landUses = landUses; window.Net._modified = true; } return lu; }
    function removeLandUse(id) { landUses = landUses.filter(function(l) { return l.id !== id; }); if (window.Net) { window.Net.landUses = landUses; window.Net._modified = true; } }
    function updateLandUse(id, updates) { var lu = landUses.find(function(l) { return l.id === id; }); if (!lu) return; Object.assign(lu, updates); if (window.Net) { window.Net.landUses = landUses; window.Net._modified = true; } }
    function getLandUse(id) { return landUses.find(function(l) { return l.id === id; }); }
    function getAllLandUses() { return landUses; }

    var treatments = [];
    function addTreatment(node, pollutant, func) { treatments = treatments.filter(function(t) { return !(t.node === node && t.pollutant === pollutant); }); treatments.push({ node: node, pollutant: pollutant, function: func || "" }); if (window.Net) { window.Net.treatments = treatments; window.Net._modified = true; } }

    var modalEl = null;
    function initUI() {
        if (document.getElementById("quality-editor-modal")) return;
        modalEl = document.createElement("div");
        modalEl.id = "quality-editor-modal";
        modalEl.className = "ts-modal hidden";
        modalEl.innerHTML = [
            "<div class=\"ts-modal-header\"><span>Water Quality Editor</span>",
            "<button id=\"btn-quality-close\" class=\"ts-close-btn\">&times;</button>",
            "<div style=\"display:flex;gap:6px;margin-left:auto;\">",
            "<button id=\"btn-quality-tab-pollutants\" class=\"tb-btn\" style=\"font-size:11px;\">Pollutants</button>",
            "<button id=\"btn-quality-tab-landuse\" class=\"tb-btn\" style=\"font-size:11px;\">Land Uses</button>",
            "<button id=\"btn-quality-tab-treatment\" class=\"tb-btn\" style=\"font-size:11px;\">Treatment</button>",
            "</div></div>",
            "<div class=\"ts-modal-body\" id=\"quality-body\" style=\"min-height:300px;max-height:70vh;overflow-y:auto;\">",
            "<p style=\"color:var(--text-faint);font-size:12px;\">Select a tab above.</p></div></div>"
        ].join("\n");
        document.body.appendChild(modalEl);
        document.getElementById("btn-quality-close").onclick = function () { modalEl.classList.add("hidden"); };
        document.getElementById("btn-quality-tab-pollutants").onclick = renderPollutants;
        document.getElementById("btn-quality-tab-landuse").onclick = renderLandUses;
        document.getElementById("btn-quality-tab-treatment").onclick = renderTreatment;
    }

    function esc(s) {
        if (typeof s !== "string") return String(s || "");
        return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
    }

    function renderPollutants() {
        var body = document.getElementById("quality-body");
        var html = "<div style=\"display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;\">";
        html += "<span style=\"font-size:13px;font-weight:600;\">Pollutants</span>";
        html += "<button id=\"btn-pol-add\" class=\"tb-btn\">+ Add Pollutant</button></div>";
        html += "<table class=\"ts-data-table\" style=\"width:100%;\"><thead><tr><th>Name</th><th>Units</th><th>Rain</th><th>GW</th><th>I&I</th><th>Decay</th><th></th></tr></thead><tbody>";
        pollutants.forEach(function(p) {
            html += "<tr><td><input type=\"text\" class=\"pol-name\" data-id=\"" + p.id + "\" value=\"" + esc(p.name) + "\" style=\"width:80px;\"></td>";
            html += "<td><select class=\"pol-units\" data-id=\"" + p.id + "\"><option value=\"MG/L\" " + (p.units==="MG/L"?"selected":"") + ">MG/L</option><option value=\"UG/L\" " + (p.units==="UG/L"?"selected":"") + ">UG/L</option><option value=\"count/L\" " + (p.units==="count/L"?"selected":"") + ">count/L</option><option value=\"mg\" " + (p.units==="mg"?"selected":"") + ">mg</option></select></td>";
            html += "<td><input type=\"number\" class=\"pol-rain\" data-id=\"" + p.id + "\" step=\"any\" value=\"" + p.rainConcentration + "\" style=\"width:60px;\"></td>";
            html += "<td><input type=\"number\" class=\"pol-gw\" data-id=\"" + p.id + "\" step=\"any\" value=\"" + p.gwConcentration + "\" style=\"width:60px;\"></td>";
            html += "<td><input type=\"number\" class=\"pol-ii\" data-id=\"" + p.id + "\" step=\"any\" value=\"" + p.iiConcentration + "\" style=\"width:60px;\"></td>";
            html += "<td><input type=\"number\" class=\"pol-decay\" data-id=\"" + p.id + "\" step=\"any\" value=\"" + p.decayCoeff + "\" style=\"width:60px;\"></td>";
            html += "<td><button class=\"ts-btn-icon-del pol-del\" data-id=\"" + p.id + "\">✕</button></td></tr>";
        });
        if (pollutants.length === 0) html += "<tr><td colspan=\"7\" style=\"text-align:center;color:var(--text-faint);\">No pollutants defined.</td></tr>";
        html += "</tbody></table>";
        body.innerHTML = html;
        document.getElementById("btn-pol-add").onclick = function () { addPollutant(); renderPollutants(); };
        body.querySelectorAll(".pol-name").forEach(function(el) { el.onchange = function() { updatePollutant(el.dataset.id, {name: el.value}); }; });
        body.querySelectorAll(".pol-units").forEach(function(el) { el.onchange = function() { updatePollutant(el.dataset.id, {units: el.value}); }; });
        body.querySelectorAll(".pol-rain").forEach(function(el) { el.onchange = function() { updatePollutant(el.dataset.id, {rainConcentration: parseFloat(el.value)||0}); }; });
        body.querySelectorAll(".pol-gw").forEach(function(el) { el.onchange = function() { updatePollutant(el.dataset.id, {gwConcentration: parseFloat(el.value)||0}); }; });
        body.querySelectorAll(".pol-ii").forEach(function(el) { el.onchange = function() { updatePollutant(el.dataset.id, {iiConcentration: parseFloat(el.value)||0}); }; });
        body.querySelectorAll(".pol-decay").forEach(function(el) { el.onchange = function() { updatePollutant(el.dataset.id, {decayCoeff: parseFloat(el.value)||0}); }; });
        body.querySelectorAll(".pol-del").forEach(function(el) { el.onclick = function() { removePollutant(el.dataset.id); renderPollutants(); }; });
    }

    function renderLandUses() {
        var body = document.getElementById("quality-body");
        var html = "<div style=\"display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;\"><span style=\"font-size:13px;font-weight:600;\">Land Uses</span><button id=\"btn-lu-add\" class=\"tb-btn\">+ Add Land Use</button></div>";
        landUses.forEach(function(lu, li) {
            html += "<div style=\"border:1px solid var(--border);border-radius:6px;padding:8px;margin-bottom:8px;\">";
            html += "<div style=\"display:flex;justify-content:space-between;margin-bottom:6px;\"><input type=\"text\" class=\"lu-name\" data-id=\"" + lu.id + "\" value=\"" + esc(lu.name) + "\" style=\"font-weight:600;font-size:12px;width:150px;border:1px solid var(--border);border-radius:4px;padding:3px 6px;\"><button class=\"ts-btn-icon-del lu-del\" data-id=\"" + lu.id + "\">✕</button></div>";
            html += "<div style=\"font-size:11px;font-weight:600;color:var(--text-mid);\">Buildup</div>";
            html += "<table class=\"ts-data-table\" style=\"width:100%;font-size:11px;\"><thead><tr><th>Pollutant</th><th>Type</th><th>C1</th><th>C2</th><th>C3</th><th></th></tr></thead><tbody id=\"bu-buildup-" + li + "\">";
            lu.buildup.forEach(function(b, bi) {
                html += "<tr><td><select class=\"bu-buildup-pol\" data-li=\""+li+"\" data-bi=\""+bi+"\">" + pollutants.map(function(p) { return "<option value=\""+p.id+"\" "+(b.pollutant===p.id?"selected":"")+">"+p.name+"</option>"; }).join("") + "</select></td>";
                html += "<td><select class=\"bu-buildup-type\" data-li=\""+li+"\" data-bi=\""+bi+"\"><option value=\"SATURATION\" "+(b.type==="SATURATION"?"selected":"")+">SATURATION</option><option value=\"EXPONENTIAL\" "+(b.type==="EXPONENTIAL"?"selected":"")+">EXPONENTIAL</option><option value=\"POWER\" "+(b.type==="POWER"?"selected":"")+">POWER</option><option value=\"EXTERNAL\" "+(b.type==="EXTERNAL"?"selected":"")+">EXTERNAL</option><option value=\"NONE\" "+(b.type==="NONE"?"selected":"")+">NONE</option></select></td>";
                html += "<td><input type=\"number\" class=\"bu-buildup-c1\" data-li=\""+li+"\" data-bi=\""+bi+"\" step=\"any\" value=\""+(b.coeff1||0)+"\" style=\"width:50px;\"></td>";
                html += "<td><input type=\"number\" class=\"bu-buildup-c2\" data-li=\""+li+"\" data-bi=\""+bi+"\" step=\"any\" value=\""+(b.coeff2||0)+"\" style=\"width:50px;\"></td>";
                html += "<td><input type=\"number\" class=\"bu-buildup-c3\" data-li=\""+li+"\" data-bi=\""+bi+"\" step=\"any\" value=\""+(b.coeff3||0)+"\" style=\"width:50px;\"></td>";
                html += "<td><button class=\"ts-btn-icon-del bu-buildup-del\" data-li=\""+li+"\" data-bi=\""+bi+"\">✕</button></td></tr>";
            });
            html += "</tbody></table><button class=\"tb-btn bu-buildup-add\" data-li=\""+li+"\" style=\"font-size:10px;margin-top:4px;\">+ Add Buildup</button>";
            html += "<div style=\"font-size:11px;font-weight:600;color:var(--text-mid);margin-top:8px;\">Washoff</div>";
            html += "<table class=\"ts-data-table\" style=\"width:100%;font-size:11px;\"><thead><tr><th>Pollutant</th><th>Type</th><th>C1</th><th>C2</th><th>C3</th><th></th></tr></thead><tbody id=\"bu-washoff-" + li + "\">";
            lu.washoff.forEach(function(w, wi) {
                html += "<tr><td><select class=\"bu-washoff-pol\" data-li=\""+li+"\" data-wi=\""+wi+"\">" + pollutants.map(function(p) { return "<option value=\""+p.id+"\" "+(w.pollutant===p.id?"selected":"")+">"+p.name+"</option>"; }).join("") + "</select></td>";
                html += "<td><select class=\"bu-washoff-type\" data-li=\""+li+"\" data-wi=\""+wi+"\"><option value=\"EXPONENTIAL\" "+(w.type==="EXPONENTIAL"?"selected":"")+">EXPONENTIAL</option><option value=\"RATING\" "+(w.type==="RATING"?"selected":"")+">RATING</option><option value=\"EMC\" "+(w.type==="EMC"?"selected":"")+">EMC</option><option value=\"NONE\" "+(w.type==="NONE"?"selected":"")+">NONE</option></select></td>";
                html += "<td><input type=\"number\" class=\"bu-washoff-c1\" data-li=\""+li+"\" data-wi=\""+wi+"\" step=\"any\" value=\""+(w.coeff1||0)+"\" style=\"width:50px;\"></td>";
                html += "<td><input type=\"number\" class=\"bu-washoff-c2\" data-li=\""+li+"\" data-wi=\""+wi+"\" step=\"any\" value=\""+(w.coeff2||0)+"\" style=\"width:50px;\"></td>";
                html += "<td><input type=\"number\" class=\"bu-washoff-c3\" data-li=\""+li+"\" data-wi=\""+wi+"\" step=\"any\" value=\""+(w.coeff3||0)+"\" style=\"width:50px;\"></td>";
                html += "<td><button class=\"ts-btn-icon-del bu-washoff-del\" data-li=\""+li+"\" data-wi=\""+wi+"\">✕</button></td></tr>";
            });
            html += "</tbody></table><button class=\"tb-btn bu-washoff-add\" data-li=\""+li+"\" style=\"font-size:10px;margin-top:4px;\">+ Add Washoff</button></div>";
        });
        if (landUses.length === 0) html += "<p style=\"color:var(--text-faint);font-size:12px;\">No land uses defined.</p>";
        body.innerHTML = html;
        document.getElementById("btn-lu-add").onclick = function () { addLandUse(); renderLandUses(); };
        body.querySelectorAll(".lu-name").forEach(function(el) { el.onchange = function() { updateLandUse(el.dataset.id, {name: el.value}); }; });
        body.querySelectorAll(".lu-del").forEach(function(el) { el.onclick = function() { removeLandUse(el.dataset.id); renderLandUses(); }; });
        body.querySelectorAll(".bu-buildup-add").forEach(function(btn) { btn.onclick = function() { var li = parseInt(btn.dataset.li); var lu = landUses[li]; if (lu) { lu.buildup.push({pollutant:pollutants.length>0?pollutants[0].id:"",type:"SATURATION",coeff1:0,coeff2:0,coeff3:0,perUnitArea:true}); updateLandUse(lu.id, {buildup:lu.buildup}); renderLandUses(); } }; });
        body.querySelectorAll(".bu-washoff-add").forEach(function(btn) { btn.onclick = function() { var li = parseInt(btn.dataset.li); var lu = landUses[li]; if (lu) { lu.washoff.push({pollutant:pollutants.length>0?pollutants[0].id:"",type:"EXPONENTIAL",coeff1:0,coeff2:0,coeff3:0,bmpRemoval:0}); updateLandUse(lu.id, {washoff:lu.washoff}); renderLandUses(); } }; });
    }

    function renderTreatment() {
        var body = document.getElementById("quality-body");
        var html = "<div style=\"font-size:13px;font-weight:600;margin-bottom:8px;\">Treatment Functions</div><p style=\"font-size:11px;color:var(--text-faint);margin-bottom:8px;\">Format: <code>pollutant = expression</code></p><table class=\"ts-data-table\" style=\"width:100%;\"><thead><tr><th>Node</th><th>Pollutant</th><th>Function</th><th></th></tr></thead><tbody>";
        treatments.forEach(function(t, i) {
            html += "<tr><td><input type=\"text\" class=\"tr-node\" data-idx=\""+i+"\" value=\""+esc(t.node)+"\" style=\"width:80px;\"></td>";
            html += "<td><input type=\"text\" class=\"tr-pol\" data-idx=\""+i+"\" value=\""+esc(t.pollutant)+"\" style=\"width:80px;\"></td>";
            html += "<td><input type=\"text\" class=\"tr-func\" data-idx=\""+i+"\" value=\""+esc(t.function)+"\" style=\"width:200px;font-family:monospace;\"></td>";
            html += "<td><button class=\"ts-btn-icon-del tr-del\" data-idx=\""+i+"\">✕</button></td></tr>";
        });
        html += "</tbody></table><button id=\"btn-treatment-add\" class=\"tb-btn\" style=\"margin-top:6px;\">+ Add Treatment</button>";
        body.innerHTML = html;
        document.getElementById("btn-treatment-add").onclick = function () { treatments.push({node:"",pollutant:"",function:""}); if (window.Net) { window.Net.treatments = treatments; window.Net._modified = true; } renderTreatment(); };
    }

    function openEditor() { if (!modalEl) initUI(); modalEl.classList.remove("hidden"); renderPollutants(); }

    window.QualityEditor = {
        openEditor: openEditor, addPollutant: addPollutant, removePollutant: removePollutant,
        updatePollutant: updatePollutant, getPollutant: getPollutant, getAllPollutants: getAllPollutants,
        addLandUse: addLandUse, removeLandUse: removeLandUse, updateLandUse: updateLandUse,
        getLandUse: getLandUse, getAllLandUses: getAllLandUses, addTreatment: addTreatment,
        treatments: treatments,
        loadPollutants: function(data) { pollutants = data || []; if (window.Net) window.Net.pollutants = pollutants; },
        loadLandUses: function(data) { landUses = data || []; if (window.Net) window.Net.landUses = landUses; },
        loadTreatments: function(data) { treatments = data || []; if (window.Net) window.Net.treatments = treatments; }
    };
    if (document.readyState === "loading") { document.addEventListener("DOMContentLoaded", initUI); } else { initUI(); }
})();

