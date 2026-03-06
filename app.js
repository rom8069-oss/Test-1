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
  segmentColors: {},
  premiseColors: {},
  colorMode: "rep",
  hullLayers: []
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

  state.clusterGroup = createClusterGroup();
  state.map.addLayer(state.clusterGroup);

  enableBoxSelect();
}

// ============================
// CUSTOM CLUSTER GROUP
// ============================

function createClusterGroup() {
  return L.markerClusterGroup({
    iconCreateFunction: function (cluster) {
      const markers = cluster.getAllChildMarkers();

      const repCounts = {};
      markers.forEach(m => {
        const acc = state.accounts.find(a => a.id === m.accountId);
        const rep = acc?.newRep || acc?.currentRep || "Unassigned";
        repCounts[rep] = (repCounts[rep] || 0) + 1;
      });

      const dominantRep = Object.entries(repCounts)
        .sort((a, b) => b[1] - a[1])[0][0];

      const color = getColor(dominantRep, "rep");

      return L.divIcon({
        html: `<div style="
          background:${color};
          color:white;
          border-radius:50%;
          width:40px;
          height:40px;
          display:flex;
          align-items:center;
          justify-content:center;
          border:2px solid black;
        ">${cluster.getChildCount()}</div>`,
        className: "rep-cluster-icon",
        iconSize: [40, 40]
      });
    }
  });
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
      drawRepTerritories();
      updateRouteSummary();
      updateSelectionSummary();

      document.getElementById("export-btn").disabled = false;
      document.getElementById("assign-btn").disabled = false;
    }
  });
}

function getField(row, possibleKeys) {
  for (const key of possibleKeys) {
    if (row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== "") {
      return row[key];
    }
  }
  return "";
}

function getNumber(row, possibleKeys) {
  const raw = getField(row, possibleKeys);
  if (raw === "") return 0;
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
    if (a.currentRep && a.currentRep.trim()) reps.add(a.currentRep.trim());
    if (a.newRep && a.newRep.trim()) reps.add(a.newRep.trim());
  });

  reps.add("Rep 15");
  reps.add("Rep 16");

  const sorted = Array.from(reps).sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true })
  );

  repSelect.innerHTML = '<option value="">Assign to rep…</option>';
  repFilter.innerHTML = '<option value="">All Reps</option>';

  sorted.forEach(rep => {
    repSelect.insertAdjacentHTML("beforeend", `<option value="${rep}">${rep}</option>`);
    repFilter.insertAdjacentHTML("beforeend", `<option value="${rep}">${rep}</option>`);
  });
}

// ============================
// MARKER RENDERING
// ============================

function plotAccounts() {
  state.clusterGroup.clearLayers();
  state.markersById = {};

  const bounds = [];
  const repFilter = document.getElementById("rep-filter").value || "";

  state.accounts.forEach(acc => {
    const displayRep = acc.newRep || acc.currentRep || "";
    if (repFilter && displayRep !== repFilter) return;

    const marker = L.circleMarker([acc.lat, acc.lng], {
      radius: 6,
      fillOpacity: 0.9
    });

    marker.accountId = acc.id;
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

// ============================
// MARKER STYLE
// ============================

function updateMarkerStyle(acc) {
  const marker = state.markersById[acc.id];
  if (!marker) return;

  const rep = acc.newRep || acc.currentRep || "";
  const seg = acc.segment || "";
  const prem = acc.premise || "";

  let color;
  if (state.colorMode === "rep") {
    color = getColor(rep, "rep");
  } else if (state.colorMode === "segment") {
    color = getColor(seg, "segment");
  } else {
    color = getColor(prem, "premise");
  }

  marker.setStyle({
    color: state.selectedIds.has(acc.id) ? "black" : color,
    fillColor: color,
    fillOpacity: 0.9
  });
}

function getColor(key, type) {
  if (!key) return "#888";

  let map;
  if (type === "rep") map = state.repColors;
  else if (type === "segment") map = state.segmentColors;
  else map = state.premiseColors;

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
// ROUTE SUMMARY (WITH COLOR SWATCH)
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
  drawRepTerritories();
  updateRouteSummary();
  updateAllMarkerStyles();
  updateSelectionSummary();

  // NEW: refresh details panel
  if (state.selectedIds.size === 1) {
    const id = Array.from(state.selectedIds)[0];
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
// REP TERRITORIES (CONCAVE HULLS)
// ============================

function drawRepTerritories() {
  state.hullLayers.forEach(layer => state.map.removeLayer(layer));
  state.hullLayers = [];

  const reps = {};

  state.accounts.forEach(acc => {
    const rep = acc.newRep || acc.currentRep || "Unassigned";
    if (!reps[rep]) reps[rep] = [];
    reps[rep].push([acc.lng, acc.lat]);
  });

  Object.entries(reps).forEach(([rep, coords]) => {
    if (coords.length < 3) return;

    const points = turf.points(coords);
    const hull = turf.concave(points, { maxEdge: 1 });

    if (!hull) return;

    const color = getColor(rep, "rep");

    const layer = L.geoJSON(hull, {
      style: {
        color,
        weight: 2,
        fillOpacity: 0.1
      }
    }).addTo(state.map);

    state.hullLayers.push(layer);
  });
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
    drawRepTerritories();
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
