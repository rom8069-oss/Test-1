window.addEventListener("DOMContentLoaded", () => {

let map;
let drawnItems;
let markers = [];
let accounts = [];
let selectedIds = new Set();
let lastAssignment = null;

const LEGACY_IDS = []; // e.g. ["12345","67890"]

const fileInput = document.getElementById('file-input');
const colorModeSelect = document.getElementById('color-mode');
const repFilterSelect = document.getElementById('rep-filter');
const repSelect = document.getElementById('rep-select');
const assignBtn = document.getElementById('assign-btn');
const undoBtn = document.getElementById('undo-btn');
const exportBtn = document.getElementById('export-btn');
const selectedCountEl = document.getElementById('selected-count');
const selectedRevenueEl = document.getElementById('selected-revenue');
const selectedListEl = document.getElementById('selected-list');
const routeTableBody = document.querySelector('#route-table tbody');
const detailPanel = document.getElementById('detail-panel');
const revThresholdInput = document.getElementById('rev-threshold');
const searchInput = document.getElementById('search-input');
const searchBtn = document.getElementById('search-btn');

function initMap() {
  map = L.map('map').setView([41.88, -87.63], 8);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19
  }).addTo(map);

  drawnItems = new L.FeatureGroup();
  map.addLayer(drawnItems);

  const drawControl = new L.Control.Draw({
    draw: {
      polygon: true,
      rectangle: true,
      circle: false,
      marker: false,
      polyline: false,
      circlemarker: false
    },
    edit: {
      featureGroup: drawnItems,
      edit: false,
      remove: true
    }
  });

  map.addControl(drawControl);

  map.on(L.Draw.Event.CREATED, e => {
    drawnItems.clearLayers();
    drawnItems.addLayer(e.layer);
    handleSelection(e.layer);
  });

  map.on(L.Draw.Event.DELETED, () => {
    selectedIds.clear();
    updateSelectionSummary();
    clearDetailPanel();
  });
}

function loadCsv(file) {
  Papa.parse(file, {
    header: true,
    dynamicTyping: true,
    skipEmptyLines: true,
    complete: results => {

      console.log("RAW PARSED RESULTS:", results.data);

      accounts = results.data
        .map((row, idx) => {
          const latRaw = row["Latitude"];
          const lngRaw = row["Longitude"];

          const lat = parseFloat(String(latRaw).replace(/[^0-9.-]/g, ""));
          const lng = parseFloat(String(lngRaw).replace(/[^0-9.-]/g, ""));

          if (!lat || !lng) return null;

          return {
            customerId: String(row["Customer ID - DO NOT Remove"] ?? idx),
            stopId: String(row["Stop ID - DO NOT REMOVE"] ?? ""),
            currentDM: row["Current DM"] ?? "",
            currentRep: row["Current Rep"] ?? "",
            newRep: row["New Rep"] ?? "",
            premise: row["Premise"] ?? "",
            segment: row["Segment"] ?? "",
            chain: row["Chain"] ?? "",
            company: row["Company"] ?? "",
            address: row["Address"] ?? "",
            city: row["City"] ?? "",
            zip: row["Zip Code"] ?? "",
            county: row["County"] ?? "",
            lat,
            lng,
            revenue: parseFloat(row["$ Vol Sept - Feb"]) || 0
          };
        })
        .filter(Boolean);

      console.log("ACCOUNTS CREATED:", accounts);

      buildRepLists();
      plotAccounts();
      updateRouteSummary();
      exportBtn.disabled = false;
    }
  });
}

function buildRepLists() {
  const reps = new Set();
  accounts.forEach(a => {
    if (a.currentRep && a.currentRep.trim()) reps.add(a.currentRep.trim());
    if (a.newRep && a.newRep.trim()) reps.add(a.newRep.trim());
  });

  reps.add("Rep 15");
  reps.add("Rep 16");

  const sortedReps = Array.from(reps).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  repSelect.innerHTML = '<option value="">Assign to rep…</option>';
  repFilterSelect.innerHTML = '<option value="">All reps</option>';

  sortedReps.forEach(rep => {
    const opt1 = document.createElement('option');
    opt1.value = rep;
    opt1.textContent = rep;
    repSelect.appendChild(opt1);

    const opt2 = document.createElement('option');
    opt2.value = rep;
    opt2.textContent = rep;
    repFilterSelect.appendChild(opt2);
  });
}

function getDisplayRep(a) {
  return a.newRep && a.newRep.trim() ? a.newRep.trim() : (a.currentRep || "").trim();
}

function plotAccounts() {
  markers.forEach(m => map.removeLayer(m));
  markers = [];

  if (!accounts.length) return;

  const bounds = [];
  const colorPalette = ['red', 'blue', 'green', 'orange', 'purple', 'brown', 'teal', 'magenta', 'gold', 'navy'];
  const repColors = {};
  const segmentColors = {};
  const premiseColors = {};

  function getColorForRep(rep) {
    if (!rep) return 'gray';
    if (!repColors[rep]) {
      const idx = Object.keys(repColors).length % colorPalette.length;
      repColors[rep] = colorPalette[idx];
    }
    return repColors[rep];
  }

  function getColorForSegment(seg) {
    if (!seg) return 'gray';
    if (!segmentColors[seg]) {
      const idx = Object.keys(segmentColors).length % colorPalette.length;
      segmentColors[seg] = colorPalette[idx];
    }
    return segmentColors[seg];
  }

  function getColorForPremise(p) {
    if (!p) return 'gray';
    if (!premiseColors[p]) {
      const idx = Object.keys(premiseColors).length % colorPalette.length;
      premiseColors[p] = colorPalette[idx];
    }
    return premiseColors[p];
  }

  const colorMode = colorModeSelect.value;
  const repFilter = repFilterSelect.value;

  accounts.forEach(acc => {
    const rep = getDisplayRep(acc);
    if (repFilter && rep !== repFilter) return;

    let color;
    if (colorMode === 'rep') color = getColorForRep(rep);
    else if (colorMode === 'segment') color = getColorForSegment(acc.segment);
    else color = getColorForPremise(acc.premise);

    const marker = L.circleMarker([acc.lat, acc.lng], {
      radius: 5,
      color,
      fillColor: color,
      fillOpacity: 0.85
    });

    marker.accountId = acc.customerId;

    marker.bindTooltip(
      `${acc.company || acc.customerId}<br>` +
      `Rev (Sept–Feb): $${acc.revenue.toLocaleString()}<br>` +
      `Rep: ${rep || 'Unassigned'}`
    );

    marker.on('click', () => {
      selectedIds.clear();
      selectedIds.add(acc.customerId);
      updateSelectionSummary();
      showAccountDetails(acc);
    });

    marker.addTo(map);
    markers.push(marker);
    bounds.push([acc.lat, acc.lng]);
  });

  if (bounds.length) {
    map.fitBounds(bounds, { padding: [20, 20] });
  }
}

function handleSelection(layer) {
  selectedIds.clear();

  markers.forEach(marker => {
    const latlng = marker.getLatLng();
    if (layer.getBounds && layer.getBounds().contains(latlng)) {
      selectedIds.add(marker.accountId);
    } else if (layer instanceof L.Polygon || layer instanceof L.Rectangle) {
      if (pointInPolygon(latlng, layer)) {
        selectedIds.add(marker.accountId);
      }
    }
}
