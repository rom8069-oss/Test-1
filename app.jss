// ============================
// CENTRAL STATE
// ============================

const state = {
  map: null,
  clusterGroup: null,
  accounts: [],
  markersById: {},
  selectedIds: new Set(),
  repColors: {},
  colorMode: "rep"
};

const colorPalette = [
  "#e41a1c","#377eb8","#4daf4a","#984ea3",
  "#ff7f00","#a65628","#f781bf","#999999"
];

// ============================
// INIT MAP
// ============================

function initMap() {
  state.map = L.map('map').setView([41.88, -87.63], 8);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png')
    .addTo(state.map);

  state.clusterGroup = L.markerClusterGroup();
  state.map.addLayer(state.clusterGroup);

  enableBoxSelect();
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
        .map(normalizeRow)
        .filter(Boolean);

      buildRepLists();
      plotAccounts();
      updateRouteSummary();
      document.getElementById("export-btn").disabled = false;
    }
  });
}

function normalizeRow(row, idx) {
  const lat = parseFloat(row["Latitude"]);
  const lng = parseFloat(row["Longitude"]);
  if (!lat || !lng) return null;

  return {
    id: row["Customer ID - DO NOT Remove"] || String(idx),
    company: row["Company"] || "",
    currentRep: row["Current Rep"] || "",
    newRep: row["New Rep"] || "",
    segment: row["Segment"] || "",
    premise: row["Premise"] || "",
    revenue: parseFloat(
      String(row["$ Vol Sept - Feb"] || "0").replace(/[^0-9.-]/g, "")
    ) || 0,
    lat,
    lng
  };
}

// ============================
// MARKER RENDERING
// ============================

function plotAccounts() {
  state.clusterGroup.clearLayers();
  state.markersById = {};

  const bounds = [];

  state.accounts.forEach(acc => {
    const marker = L.circleMarker([acc.lat, acc.lng], {
      radius: 6,
      fillOpacity: 0.9
    });

    marker.on("click", e => handleMarkerClick(e, acc));

    state.clusterGroup.addLayer(marker);
    state.markersById[acc.id] = marker;
    bounds.push([acc.lat, acc.lng]);

    updateMarkerStyle(acc);
  });

  if (bounds.length) {
    state.map.fitBounds(bounds, { padding: [20,20] });
  }
}

function updateMarkerStyle(acc) {
  const marker = state.markersById[acc.id];
  if (!marker) return;

  const rep = acc.newRep || acc.currentRep;
  const color = getColor(rep);

  marker.setStyle({
    color: state.selectedIds.has(acc.id) ? "black" : color,
    fillColor: color
  });
}

function getColor(rep) {
  if (!rep) return "#888";

  if (!state.repColors[rep]) {
    const idx = Object.keys(state.repColors).length % colorPalette.length;
    state.repColors[rep] = colorPalette[idx];
  }
  return state.repColors[rep];
}

// ============================
// SELECTION (MULTI + SHIFT)
// ============================

function handleMarkerClick(e, acc) {
  if (!e.originalEvent.shiftKey) {
    state.selectedIds.clear();
  }

  if (state.selectedIds.has(acc.id)) {
    state.selectedIds.delete(acc.id);
  } else {
    state.selectedIds.add(acc.id);
  }

  updateAllMarkerStyles();
  updateSelectionSummary();
  showDetails(acc);
}

function updateAllMarkerStyles() {
  state.accounts.forEach(updateMarkerStyle);
}

// ============================
// BOX SELECT
// ============================

function enableBoxSelect() {
  let start;

  state.map.on("mousedown", e => {
    if (!e.originalEvent.shiftKey) return;
    start = e.latlng;
  });

  state.map.on("mouseup", e => {
    if (!start) return;

    const bounds = L.latLngBounds(start, e.latlng);

    state.accounts.forEach(acc => {
      if (bounds.contains([acc.lat, acc.lng])) {
        state.selectedIds.add(acc.id);
      }
    });

    updateAllMarkerStyles();
    updateSelectionSummary();
    start = null;
  });
}

// ============================
// ROUTE SUMMARY
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
    const tr = document.createElement("tr");
    const avg = stats.revenue / stats.stops;

    tr.innerHTML = `
      <td>${rep}</td>
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

  updateRouteSummary();
  updateAllMarkerStyles();
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
// EVENTS
// ============================

document.getElementById("file-input")
  .addEventListener("change", e => loadCsv(e.target.files[0]));

document.getElementById("assign-btn")
  .addEventListener("click", assignSelected);

document.getElementById("export-btn")
  .addEventListener("click", exportCsv);

window.addEventListener("DOMContentLoaded", initMap);
