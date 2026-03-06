// ============================
// CENTRAL STATE
// ============================

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
  polylineLayers: {},
  lasso: null,
  lassoActive: false,
  lassoLayer: null
};

const colorPalette = [
  "#e41a1c", "#377eb8", "#4daf4a", "#984ea3", "#ff7f00",
  "#a65628", "#f781bf", "#999999", "#66c2a5", "#fc8d62",
  "#8da0cb", "#e78ac3", "#a6d854", "#ffd92f", "#e5c494",
  "#b3b3b3", "#1b9e77", "#d95f02", "#7570b3", "#e7298a"
];

const MAX_ROUTE_HOP_MILES = 15; // Outlier threshold


// ============================
// INIT MAP
// ============================

function initMap() {
  state.map = L.map('map').setView([41.88, -87.63], 8);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png')
    .addTo(state.map);

  state.markerLayer = L.layerGroup().addTo(state.map);

  enableLasso();
  addResetLassoControl();
}


// ============================
// CSV LOADING
// ============================

function loadCsv(file) {
  Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
    complete: results => {
      state.accounts = results.data
        .map((row, idx) => normalizeRow(row, idx))
        .filter(Boolean);

      if (!state.accounts.length) {
        alert("No valid accounts loaded. Check Latitude/Longitude headers.");
        return;
      }

      buildRepLists();
      plotAccounts();
      drawRepRoutes();
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


// ============================
// REP LISTS
// ============================

function buildRepLists() {
  const repSelect = document.getElementById("rep-select");
  const repFilter = document.getElementById("rep-filter");

  const reps = new Set();

  state.accounts.forEach(a => {
    if (a.currentRep) reps.add(a.currentRep.trim());
    if (a.newRep) reps.add(a.newRep.trim());
  });

  reps.add("Rep 15");
  reps.add("Rep 16");

  const sorted = [...reps].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));

  repSelect.innerHTML = '<option value="">Assign to rep…</option>';
  repFilter.innerHTML = '<option value="">All Reps</option>';

  sorted.forEach(rep => {
    repSelect.insertAdjacentHTML("beforeend", `<option value="${rep}">${rep}</option>`);
    repFilter.insertAdjacentHTML("beforeend", `<option value="${rep}">${rep}</option>`);
  });
}


// ============================
// MARKERS
// ============================

function plotAccounts() {
  state.markerLayer.clearLayers();
  state.markersById = {};

  const repFilter = document.getElementById("rep-filter").value || "";
  const bounds = [];

  state.accounts.forEach(acc => {
    const displayRep = acc.newRep || acc.currentRep || "";
    if (repFilter && displayRep !== repFilter) return;

    const marker = L.circleMarker([acc.lat, acc.lng], {
      radius: 6,
      fillOpacity: 0.9
    });

    marker.accountId = acc.id;
    marker.on("click", e => handleMarkerClick(e, acc));

    state.markerLayer.addLayer(marker);
    state.markersById[acc.id] = marker;

    updateMarkerStyle(acc);
    bounds.push([acc.lat, acc.lng]);
  });

  if (bounds.length) {
    state.map.fitBounds(bounds, { padding: [20,20] });
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
    color: state.selectedIds.has(acc.id) ? "black" : color,
    fillColor: color,
    fillOpacity: 0.9
  });
}

function getColor(key, type) {
  if (!key) return "#888";

  let map =
    type === "rep" ? state.repColors :
    type === "segment" ? state.segmentColors :
    state.premiseColors;

  if (!map[key]) {
    const idx = Object.keys(map).length % colorPalette.length;
    map[key] = colorPalette[idx];
  }
  return map[key];
}


// ============================
// SELECTION
// ============================

function handleMarkerClick(e, acc) {
  if (!e.originalEvent.shiftKey) state.selectedIds.clear();

  if (state.selectedIds.has(acc.id)) state.selectedIds.delete(acc.id);
  else state.selectedIds.add(acc.id);

  updateAllMarkerStyles();
  updateSelectionSummary();
  showDetails(acc);
}

function updateAllMarkerStyles() {
  state.accounts.forEach(updateMarkerStyle);
}


// ============================
// LASSO
// ============================

function enableLasso() {
  if (!L.lasso) return;

  state.lasso = L.lasso(state.map, { intersect: true });

  const LassoControl = L.Control.extend({
    onAdd: function () {
      const container = L.DomUtil.create("div", "leaflet-bar");
      const button = L.DomUtil.create("a", "lasso-button", container);
      button.href = "#";
      button.title = "Freehand Lasso Select";
      button.innerHTML = "⭘";

      L.DomEvent.on(button, "click", (e) => {
        L.DomEvent.stopPropagation(e);
        L.DomEvent.preventDefault(e);

        if (state.lassoActive) {
          state.lasso.disable();
          state.lassoActive = false;
          button.classList.remove("active");
        } else {
          state.lasso.enable();
          state.lassoActive = true;
          button.classList.add("active");
        }
      });

      return container;
    }
  });

  state.map.addControl(new LassoControl({ position: "topleft" }));

  state.map.on("lasso.finished", (event) => {
    state.lasso.disable();
    state.lassoActive = false;

    const btn = document.querySelector(".lasso-button");
    if (btn) btn.classList.remove("active");

    const latLngs = event.latLngs || [];
    if (!latLngs.length) return;

    const coords = latLngs.map(ll => [ll.lng, ll.lat]);
    if (coords.length < 3) return;

    if (coords[0][0] !== coords[coords.length - 1][0] ||
        coords[0][1] !== coords[coords.length - 1][1]) {
      coords.push(coords[0]);
    }

    const polygon = turf.polygon([coords]);

    // KEEP previous selection, add new
    state.accounts.forEach(acc => {
      const pt = turf.point([acc.lng, acc.lat]);
      if (turf.booleanPointInPolygon(pt, polygon)) {
        state.selectedIds.add(acc.id);
      }
    });

    updateAllMarkerStyles();
    updateSelectionSummary();

    // Replace previous lasso polygon
    if (state.lassoLayer) state.map.removeLayer(state.lassoLayer);

    state.lassoLayer = L.polygon(latLngs, {
      color: "#000",
      weight: 2,
      fillOpacity: 0.05
    }).addTo(state.map);
  });
}


// ============================
// RESET LASSO
// ============================

function addResetLassoControl() {
  const ResetControl = L.Control.extend({
    onAdd: function () {
      const container = L.DomUtil.create("div", "leaflet-bar");
      const button = L.DomUtil.create("a", "reset-lasso-button", container);
      button.href = "#";
      button.title = "Clear Lasso & Selection";
      button.innerHTML = "✖";

      L.DomEvent.on(button, "click", (e) => {
        L.DomEvent.stopPropagation(e);
        L.DomEvent.preventDefault(e);

        if (state.lassoLayer) {
          state.map.removeLayer(state.lassoLayer);
          state.lassoLayer = null;
        }

        state.selectedIds.clear();
        updateAllMarkerStyles();
        updateSelectionSummary();

        document.getElementById("detail-panel").innerHTML =
          "<p>No account selected.</p>";
      });

      return container;
    }
  });

  state.map.addControl(new ResetControl({ position: "topleft" }));
}


// ============================
// ROUTE POLYLINES (NEAREST NEIGHBOR)
// ============================

function drawRepRoutes() {
  // Remove old boundaries
  Object.values(state.polylineLayers).forEach(layer => state.map.removeLayer(layer));
  state.polylineLayers = {};

  const reps = {};

  state.accounts.forEach(acc => {
    const rep = acc.newRep || acc.currentRep || "Unassigned";
    if (!reps[rep]) reps[rep] = [];
    reps[rep].push([acc.lng, acc.lat]);
  });

  Object.entries(reps).forEach(([rep, coords]) => {
    if (coords.length < 3) return;

    const points = turf.points(coords);
    const hull = turf.convex(points);

    if (!hull) return;

    const color = getColor(rep, "rep");

    const layer = L.geoJSON(hull, {
      style: {
        color,
        weight: 2,
        fillOpacity: 0.1
      }
    }).addTo(state.map);

    state.polylineLayers[rep] = layer;
  });
}

function buildNearestNeighborRoute(accs) {
  const remaining = [...accs];
  const route = [];

  let current = remaining.shift();
  route.push(current);

  while (remaining.length) {
    let nearest = null;
    let nearestDist = Infinity;

    remaining.forEach(a => {
      const d = turf.distance(
        turf.point([current.lng, current.lat]),
        turf.point([a.lng, a.lat]),
        { units: "miles" }
      );

      if (d < nearestDist) {
        nearestDist = d;
        nearest = a;
      }
    });

    // Skip extreme outliers from the polyline
    if (nearestDist > MAX_ROUTE_HOP_MILES) {
      remaining.splice(remaining.indexOf(nearest), 1);
      continue;
    }

    route.push(nearest);
    remaining.splice(remaining.indexOf(nearest), 1);
    current = nearest;
  }

  return route;
}


// ============================
// SELECTION SUMMARY + DETAILS
// ============================

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


// ============================
// ROUTE SUMMARY TABLE
// ============================

function updateRouteSummary() {
  const byRep = {};

  state.accounts.forEach(a => {
    const rep = a.newRep || a.currentRep || "Unassigned";
    if (!byRep[rep]) byRep[rep] = { stops:0, revenue:0 };
    byRep[rep].stops++;
    byRep[rep].revenue += a.revenue;
  });

  const tbody = document.querySelector("#route-table tbody");
  tbody.innerHTML = "";

  Object.entries(byRep).forEach(([rep, stats]) => {
    const color = getColor(rep, "rep");
    const avg = stats.revenue / stats.stops;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><span style="display:inline-block;width:12px;height:12px;background:${color};border:1px solid #000;margin-right:6px;"></span>${rep}</td>
      <td>${stats.stops}</td>
      <td>$${stats.revenue.toLocaleString()}</td>
      <td>$${avg.toLocaleString()}</td>
    `;
    tbody.appendChild(tr);
  });
}


// ============================
// ASSIGNMENT
// ============================

function assignSelected() {
  const rep = document.getElementById("rep-select").value;
  if (!rep) return;

  state.accounts.forEach(acc => {
    if (state.selectedIds.has(acc.id)) {
      acc.newRep = rep;
    }
  });

  plotAccounts();
  drawRepRoutes();
  updateRouteSummary();
  updateAllMarkerStyles();
  updateSelectionSummary();

  if (state.selectedIds.size === 1) {
    const id = [...state.selectedIds][0];
    const acc = state.accounts.find(a => a.id === id);
    if (acc) showDetails(acc);
  }
}


// ============================
// EXPORT
// ============================

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


// ============================
// SEARCH
// ============================

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


// ============================
// EVENTS
// ============================

document.getElementById("file-input")
  .addEventListener("change", e => loadCsv(e.target.files[0]));

document.getElementById("assign-btn")
  .addEventListener("click", assignSelected);

document.getElementById("export-btn")
  .addEventListener("click", exportCsv);

document.getElementById("color-mode")
  .addEventListener("change", e => {
    state.colorMode = e.target.value;
    updateAllMarkerStyles();
  });

document.getElementById("rep-filter")
  .addEventListener("change", () => {
    plotAccounts();
    drawRepRoutes();
    updateSelectionSummary();
  });

document.getElementById("rep-select")
  .addEventListener("change", updateSelectionSummary);

document.getElementById("search-btn")
  .addEventListener("click", searchAccounts);

document.getElementById("search-input")
  .addEventListener("keydown", e => {
    if (e.key === "Enter") searchAccounts();
  });

window.addEventListener("DOMContentLoaded", initMap);
