/****************************************************
 * GLOBAL STATE
 ****************************************************/
const state = {
  map: null,
  markerLayer: null,
  accounts: [],
  markersById: {},
  selectedIds: new Set(),
  repColors: {},
  segmentColors: {},
  premiseColors: {},
  colorMode: "rep",
  lasso: null,
  lassoLayer: null,
  activeReps: new Set()
};

const colorPalette = [
  "#e41a1c", "#377eb8", "#4daf4a", "#984ea3", "#ff7f00",
  "#a65628", "#f781bf", "#999999", "#66c2a5", "#fc8d62",
  "#8da0cb", "#e78ac3", "#a6d854", "#ffd92f", "#e5c494",
  "#b3b3b3", "#1b9e77", "#d95f02", "#7570b3", "#e7298a"
];

/****************************************************
 * MAP INITIALIZATION
 ****************************************************/
function initMap() {
  state.map = L.map("map").setView([40.0, -89.0], 7);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png")
    .addTo(state.map);

  state.markerLayer = L.layerGroup().addTo(state.map);

  setupLasso();
}

/****************************************************
 * CSV LOADING
 ****************************************************/
function loadCsv(file) {
  Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
    complete: results => {
      state.accounts = results.data
        .map((row, idx) => normalizeRow(row, idx))
        .filter(Boolean);

      if (!state.accounts.length) {
        alert("No valid accounts loaded.");
        return;
      }

      buildRepLists();
      buildRepFilterDropdown();
      plotAccounts();
      updateRouteSummary();
      updateSelectionSummary();

      document.getElementById("export-btn").disabled = false;
      document.getElementById("assign-btn").disabled = false;
    }
  });
}

function getField(row, keys) {
  for (const key of keys) {
    if (row[key] !== undefined && String(row[key]).trim() !== "") {
      return row[key];
    }
// Simple Leaflet Lasso for browser (no require, no modules)
(function (factory) {
  if (typeof L !== "undefined") {
    factory(L);
  } else {
    console.error("Leaflet not found. Lasso cannot initialize.");
  }
  return "";
}

function getNumber(row, keys) {
  const raw = getField(row, keys);
  if (!raw) return 0;
  const num = parseFloat(String(raw).replace(/[^0-9.-]/g, ""));
  return isNaN(num) ? 0 : num;
}

function normalizeRow(row, idx) {
  const lat = getNumber(row, ["Latitude", "Lat"]);
  const lng = getNumber(row, ["Longitude", "Lng", "Long"]);
  if (!lat || !lng) return null;

  return {
    id: String(getField(row, ["Customer ID - DO NOT Remove"])) || String(idx),
    company: getField(row, ["Company"]),
    address: getField(row, ["Address"]),
    city: getField(row, ["City"]),
    zip: getField(row, ["Zip Code"]),
    county: getField(row, ["County"]),
    currentRep: getField(row, ["Current Rep"]),
    newRep: getField(row, ["New Rep"]),
    segment: getField(row, ["Segment"]),
    premise: getField(row, ["Premise"]),
    revenue: getNumber(row, ["$ Vol Sept - Feb", "$ Vol Sept – Feb"]),
    lat,
    lng
  };
}

/****************************************************
 * REP LISTS
 ****************************************************/
function buildRepLists() {
  const repSelect = document.getElementById("rep-select");
  repSelect.innerHTML = '<option value="">Assign to rep…</option>';

  const reps = new Set();
  state.accounts.forEach(a => {
    if (a.currentRep) reps.add(a.currentRep.trim());
    if (a.newRep) reps.add(a.newRep.trim());
  });

  const sorted = [...reps].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true })
  );

  sorted.forEach(rep => {
    repSelect.insertAdjacentHTML("beforeend", `<option value="${rep}">${rep}</option>`);
  });
}

/****************************************************
 * MULTI-REP FILTER DROPDOWN
 ****************************************************/
function buildRepFilterDropdown() {
  const container = document.getElementById("rep-filter-dropdown");
  container.innerHTML = "";

  const reps = new Set();
  state.accounts.forEach(a => {
    if (a.currentRep) reps.add(a.currentRep.trim());
    if (a.newRep) reps.add(a.newRep.trim());
  });

  const sorted = [...reps].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true })
  );

  sorted.forEach(rep => {
    const div = document.createElement("div");
    div.className = "rep-checkbox";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = rep;
    checkbox.addEventListener("change", handleRepFilterChange);

    const label = document.createElement("label");
    label.textContent = rep;

    div.appendChild(checkbox);
    div.appendChild(label);
    container.appendChild(div);
  });
}

function handleRepFilterChange() {
  const checkboxes = document.querySelectorAll("#rep-filter-dropdown input[type='checkbox']");
  state.activeReps.clear();

  checkboxes.forEach(cb => {
    if (cb.checked) state.activeReps.add(cb.value);
  });

  plotAccounts();
  updateSelectionSummary();
}

/****************************************************
 * MARKERS
 ****************************************************/
function plotAccounts() {
  state.markerLayer.clearLayers();
  state.markersById = {};

  const bounds = [];

  state.accounts.forEach(acc => {
    const rep = acc.newRep || acc.currentRep || "";

    if (state.activeReps.size > 0 && !state.activeReps.has(rep)) return;

    const marker = L.circleMarker([acc.lat, acc.lng], {
      radius: 3,
      fillOpacity: 0.9,
      className: "account-pin"
    });

    marker.accountId = acc.id;
    marker.on("click", e => handleMarkerClick(e, acc));

    state.markerLayer.addLayer(marker);
    state.markersById[acc.id] = marker;

    updateMarkerStyle(acc);
    bounds.push([acc.lat, acc.lng]);
  });

  if (bounds.length) {
    state.map.fitBounds(bounds, { padding: [20, 20] });
})(function (L) {
  function distance(a, b) {
    var dx = a.x - b.x;
    var dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }
}

function updateMarkerStyle(acc) {
  const marker = state.markersById[acc.id];
  if (!marker) return;

  const rep = acc.newRep || acc.currentRep || "";
  const seg = acc.segment || "";
  const prem = acc.premise || "";

  let color;
  if (state.colorMode === "rep") color = getColor(rep, "rep");
  else if (state.colorMode === "segment") color = getColor(seg, "segment");
  else color = getColor(prem, "premise");

  marker.setStyle({
    color: state.selectedIds.has(acc.id) ? "#000000" : color,
    fillColor: color,
    fillOpacity: 0.9
  });
}

function getColor(key, type) {
  if (!key) return "#888888";

  let map =
    type === "rep" ? state.repColors :
    type === "segment" ? state.segmentColors :
    state.premiseColors;

  if (!map[key]) {
    const idx = Object.keys(map).length % colorPalette.length;
    map[key] = colorPalette[idx];
  function samePoint(a, b) {
    return Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6;
  }
  return map[key];
}

/****************************************************
 * SELECTION
 ****************************************************/
function handleMarkerClick(e, acc) {
  if (!e.originalEvent.shiftKey) state.selectedIds.clear();
  function Lasso(map) {
    this._map = map;
    this._enabled = false;
    this._polygon = [];
    this._polyline = null;

  if (state.selectedIds.has(acc.id)) state.selectedIds.delete(acc.id);
  else state.selectedIds.add(acc.id);

  updateAllMarkerStyles();
  updateSelectionSummary();
  showDetails(acc);
}

function updateAllMarkerStyles() {
  state.accounts.forEach(updateMarkerStyle);
}

/****************************************************
 * LASSO
 ****************************************************/
function setupLasso() {
  if (!L.lasso) {
    console.error("Leaflet-Lasso failed to load");
    return;
    this._onMouseDown = this._onMouseDown.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onMouseUp = this._onMouseUp.bind(this);
  }

  state.lasso = L.lasso(state.map, {
    intersect: true,
    polygon: true
  });

  state.map.on("lasso.enabled", () => {
    state.map.dragging.disable();
    state.map._container.style.touchAction = "none";
  });

  state.map.on("lasso.disabled", () => {
    state.map.dragging.enable();
    state.map._container.style.touchAction = "auto";
  });

  state.map.on("lasso.finished", event => {
    state.lasso.disable();

    const latLngs = event.latLngs || [];
    if (!latLngs.length) return;

    const coords = latLngs.map(ll => [ll.lng, ll.lat]);
    coords.push(coords[0]);

    const polygon = turf.polygon([coords]);

    state.accounts.forEach(acc => {
      const rep = acc.newRep || acc.currentRep || "";
      if (state.activeReps.size > 0 && !state.activeReps.has(rep)) return;

      const pt = turf.point([acc.lng, acc.lat]);
      if (turf.booleanPointInPolygon(pt, polygon)) {
        state.selectedIds.add(acc.id);
      }
    });

    updateAllMarkerStyles();
    updateSelectionSummary();

    if (state.lassoLayer) {
      state.map.removeLayer(state.lassoLayer);
      state.lassoLayer = null;
    }

    state.map._container.style.touchAction = "auto";
  });

  L.Control.LassoControl = L.Control.extend({
    onAdd: function () {
      const btn = L.DomUtil.create("button", "leaflet-bar");
      btn.innerHTML = "L";
      btn.title = "Lasso Select";
      L.DomEvent.disableClickPropagation(btn);
      btn.onclick = () => {
        state.lasso.enable();
        state.map.dragging.disable();
        state.map._container.style.touchAction = "none";
      };
      return btn;
    }
  });
  Lasso.prototype.enable = function () {
    if (this._enabled) return;
    this._enabled = true;
    this._map.dragging.disable();
    this._map.on("mousedown", this._onMouseDown);
  };

  L.control.lassoControl = opts => new L.Control.LassoControl(opts);
  L.control.lassoControl({ position: "topleft" }).addTo(state.map);
  Lasso.prototype.disable = function () {
    if (!this._enabled) return;
    this._enabled = false;
    this._map.dragging.enable();
    this._map.off("mousedown", this._onMouseDown);
    this._map.off("mousemove", this._onMouseMove);
    this._map.off("mouseup", this._onMouseUp);
    this._clear();
  };

  L.Control.ClearLasso = L.Control.extend({
    onAdd: function () {
      const btn = L.DomUtil.create("button", "leaflet-bar");
      btn.innerHTML = "X";
      btn.title = "Clear Selection";
      L.DomEvent.disableClickPropagation(btn);
      btn.onclick = () => {
        if (state.lassoLayer) {
          state.map.removeLayer(state.lassoLayer);
          state.lassoLayer = null;
        }
        state.selectedIds.clear();
        updateAllMarkerStyles();
        updateSelectionSummary();
        document.getElementById("detail-panel").innerHTML =
          "<p>No account selected.</p>";
      };
      return btn;
  Lasso.prototype._clear = function () {
    this._polygon = [];
    if (this._polyline) {
      this._map.removeLayer(this._polyline);
      this._polyline = null;
    }
  });

  L.control.clearLasso = opts => new L.Control.ClearLasso(opts);
  L.control.clearLasso({ position: "topleft" }).addTo(state.map);
}

/****************************************************
 * SELECTION SUMMARY + DETAILS
 ****************************************************/
function updateSelectionSummary() {
  const selected = state.accounts.filter(a => state.selectedIds.has(a.id));
  const count = selected.length;
  const revenue = selected.reduce((sum, a) => sum + (a.revenue || 0), 0);

  document.getElementById("selected-count").textContent = count;
  document.getElementById("selected-revenue").textContent = revenue.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  const list = document.getElementById("selected-list");
  list.innerHTML = "";
  selected.forEach(a => {
    const li = document.createElement("li");
    li.textContent = `${a.company || a.id} | $${(a.revenue || 0).toLocaleString()} | Rep: ${a.newRep || a.currentRep || "Unassigned"}`;
    list.appendChild(li);
  });

  const rep = document.getElementById("rep-select").value;
  document.getElementById("assign-btn").disabled = !(count > 0 && rep);
}

function showDetails(acc) {
  const panel = document.getElementById("detail-panel");
  panel.innerHTML = `
    <p><strong>Company:</strong> ${acc.company || ""}</p>
    <p><strong>Customer ID:</strong> ${acc.id}</p>
    <p><strong>Address:</strong> ${acc.address || ""}, ${acc.city || ""} ${acc.zip || ""}</p>
    <p><strong>County:</strong> ${acc.county || ""}</p>
    <p><strong>Current Rep:</strong> ${acc.currentRep || ""}</p>
    <p><strong>New Rep:</strong> ${acc.newRep || "Unassigned"}</p>
    <p><strong>Segment:</strong> ${acc.segment || ""}</p>
    <p><strong>Premise:</strong> ${acc.premise || ""}</p>
    <p><strong>Revenue (Sept–Feb):</strong> $${(acc.revenue || 0).toLocaleString()}</p>
  `;
}

/****************************************************
 * ROUTE SUMMARY TABLE
 ****************************************************/
function updateRouteSummary() {
  const byRep = {};

  state.accounts.forEach(a => {
    const rep = a.newRep || a.currentRep || "Unassigned";
    if (state.activeReps.size > 0 && !state.activeReps.has(rep)) return;

    if (!byRep[rep]) byRep[rep] = { stops: 0, revenue: 0 };
    byRep[rep].stops++;
    byRep[rep].revenue += a.revenue;
  });

  const tbody = document.querySelector("#route-table tbody");
  tbody.innerHTML = "";
  };

  Object.entries(byRep).forEach(([rep, stats]) => {
    const color = getColor(rep, "rep");
    const avg = stats.stops ? stats.revenue / stats.stops : 0;
  Lasso.prototype._onMouseDown = function (e) {
    this._polygon = [e.latlng];
    this._polyline = L.polyline(this._polygon, {
      color: "#000",
      weight: 2
    }).addTo(this._map);

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>
        <span class="rep-swatch" style="background:${color};"></span>
        ${rep}
      </td>
      <td>${stats.stops}</td>
      <td>$${stats.revenue.toLocaleString()}</td>
      <td>$${avg.toLocaleString()}</td>
    `;
    tbody.appendChild(tr);
  });
}
    this._map.on("mousemove", this._onMouseMove);
    this._map.on("mouseup", this._onMouseUp);
  };

/****************************************************
 * ASSIGNMENT
 ****************************************************/
function assignSelected() {
  const rep = document.getElementById("rep-select").value;
  if (!rep) return;
  Lasso.prototype._onMouseMove = function (e) {
    var last = this._polygon[this._polygon.length - 1];
    var ptLast = this._map.latLngToLayerPoint(last);
    var ptNew = this._map.latLngToLayerPoint(e.latlng);

  state.accounts.forEach(acc => {
    if (state.selectedIds.has(acc.id)) {
      acc.newRep = rep;
    if (distance(ptLast, ptNew) > 2) {
      this._polygon.push(e.latlng);
      this._polyline.setLatLngs(this._polygon);
    }
  });

  plotAccounts();
  updateRouteSummary();
  updateAllMarkerStyles();
  updateSelectionSummary();

  if (state.selectedIds.size === 1) {
    const id = [...state.selectedIds][0];
    const acc = state.accounts.find(a => a.id === id);
    if (acc) showDetails(acc);
  }
}

/****************************************************
 * EXPORT
 ****************************************************/
function exportCsv() {
  const csv = Papa.unparse(state.accounts);
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "updated_routes.csv";
  a.click();

  URL.revokeObjectURL(url);
}

/****************************************************
 * SEARCH
 ****************************************************/
function searchAccounts() {
  const q = document.getElementById("search-input").value.trim().toLowerCase();
  if (!q) return;

  const match = state.accounts.find(a =>
    a.id.toLowerCase().includes(q) ||
    (a.company && a.company.toLowerCase().includes(q))
  );

  if (!match) {
    alert("No matching account found.");
    return;
  }

  state.selectedIds.clear();
  state.selectedIds.add(match.id);

  updateAllMarkerStyles();
  updateSelectionSummary();
  showDetails(match);

  state.map.setView([match.lat, match.lng], 15);

  const ring = L.circle([match.lat, match.lng], {
    radius: 120,
    color: "yellow",
    weight: 3,
    fillOpacity: 0
  }).addTo(state.map);

  setTimeout(() => state.map.removeLayer(ring), 2000);
}

/****************************************************
 * MULTI-REP DROPDOWN TOGGLE / OUTSIDE CLICK
 ****************************************************/
function setupRepFilterDropdownBehavior() {
  const btn = document.getElementById("rep-filter-btn");
  const dropdown = document.getElementById("rep-filter-dropdown");
  };

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    dropdown.classList.toggle("dropdown-hidden");
  });
  Lasso.prototype._onMouseUp = function () {
    this._map.off("mousemove", this._onMouseMove);
    this._map.off("mouseup", this._onMouseUp);

  document.addEventListener("click", (e) => {
    if (!dropdown.classList.contains("dropdown-hidden")) {
      const within = dropdown.contains(e.target) || btn.contains(e.target);
      if (!within) dropdown.classList.add("dropdown-hidden");
    var poly = this._polygon;
    if (poly.length > 2) {
      var first = this._map.latLngToLayerPoint(poly[0]);
      var last = this._map.latLngToLayerPoint(poly[poly.length - 1]);
      if (!samePoint(first, last) && distance(first, last) < 10) {
        poly.push(poly[0]);
      }
    }
  });
}

/****************************************************
 * EVENTS
 ****************************************************/
document.getElementById("file-input")
  .addEventListener("change", e => {
    const file = e.target.files[0];
    if (file) loadCsv(file);
  });

document.getElementById("assign-btn")
  .addEventListener("click", assignSelected);

document.getElementById("export-btn")
  .addEventListener("click", exportCsv);

document.getElementById("color-mode")
  .addEventListener("change", e => {
    state.colorMode = e.target.value;
    updateAllMarkerStyles();
  });

document.getElementById("rep-select")
  .addEventListener("change", updateSelectionSummary);

document.getElementById("search-btn")
  .addEventListener("click", searchAccounts);

document.getElementById("search-input")
  .addEventListener("keydown", e => {
    if (e.key === "Enter") searchAccounts();
  });
    this._map.fire("lasso.finished", { latLngs: poly });
    this._clear();
  };

window.addEventListener("DOMContentLoaded", () => {
  initMap();
  setupRepFilterDropdownBehavior();
  L.lasso = function (map, options) {
    return new Lasso(map, options || {});
  };
});
