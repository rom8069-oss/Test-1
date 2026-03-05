
let map;
let markers = [];
let accounts = [];
let selectedIds = new Set();

const fileInput = document.getElementById('file-input');
const colorModeSelect = document.getElementById('color-mode');
const repFilterSelect = document.getElementById('rep-filter');
const repSelect = document.getElementById('rep-select');
const assignBtn = document.getElementById('assign-btn');
const exportBtn = document.getElementById('export-btn');
const selectedCountEl = document.getElementById('selected-count');
const selectedRevenueEl = document.getElementById('selected-revenue');
const selectedListEl = document.getElementById('selected-list');
const routeTableBody = document.querySelector('#route-table tbody');
const detailPanel = document.getElementById('detail-panel');
const searchInput = document.getElementById('search-input');
const searchBtn = document.getElementById('search-btn');

function initMap() {
  map = L.map('map').setView([41.88, -87.63], 8);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19
  }).addTo(map);
}

function safeField(row, keys) {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== "") {
      return row[k];
    }
  }
  return "";
}

function safeNumber(row, keys) {
  const raw = safeField(row, keys);
  if (raw === "") return 0;
  const num = parseFloat(String(raw).replace(/[^0-9.-]/g, ""));
  return isNaN(num) ? 0 : num;
}

function loadCsv(file) {
  console.log("loadCsv called with:", file.name);

  Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
    complete: results => {
      console.log("RAW PARSED RESULTS:", results.data);

      accounts = results.data.map((row, idx) => {
        const lat = safeNumber(row, ["Latitude"]);
        const lng = safeNumber(row, ["Longitude"]);
        if (!lat || !lng) return null;

        return {
          customerId: String(safeField(row, ["Customer ID - DO NOT Remove"])) || String(idx),
          stopId: String(safeField(row, ["Stop ID - DO NOT REMOVE"])),
          currentDM: safeField(row, ["Current DM"]),
          currentRep: safeField(row, ["Current Rep"]),
          newRep: safeField(row, ["New Rep"]),
          premise: safeField(row, ["Premise"]),
          segment: safeField(row, ["Segment"]),
          chain: safeField(row, ["Chain"]),
          company: safeField(row, ["Company"]),
          address: safeField(row, ["Address"]),
          city: safeField(row, ["City"]),
          zip: safeField(row, ["Zip Code"]),
          county: safeField(row, ["County"]),
          lat,
          lng,
          revenue: safeNumber(row, ["$ Vol Sept - Feb", "$ Vol Sept – Feb"])
        };
      }).filter(a => a && a.lat && a.lng);

      console.log("ACCOUNTS CREATED:", accounts.length);

      if (!accounts.length) {
        alert("No valid rows found. Check Latitude/Longitude and headers.");
        return;
      }

      buildRepLists();
      plotAccounts();
      updateRouteSummary();
      exportBtn.disabled = false;
    },
    error: err => {
      console.error("Papa.parse error:", err);
      alert("Error reading CSV file.");
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

  const sorted = Array.from(reps).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  repSelect.innerHTML = '<option value="">Assign to rep…</option>';
  repFilterSelect.innerHTML = '<option value="">All reps</option>';

  sorted.forEach(rep => {
    const o1 = document.createElement('option');
    o1.value = rep;
    o1.textContent = rep;
    repSelect.appendChild(o1);

    const o2 = document.createElement('option');
    o2.value = rep;
    o2.textContent = rep;
    repFilterSelect.appendChild(o2);
  });
}

function getDisplayRep(a) {
  return (a.newRep && a.newRep.trim()) || (a.currentRep && a.currentRep.trim()) || "";
}

function plotAccounts() {
  markers.forEach(m => map.removeLayer(m));
  markers = [];

  const bounds = [];
  const colorPalette = ['red', 'blue', 'green', 'orange', 'purple', 'brown', 'teal', 'magenta', 'gold', 'navy'];
  const repColors = {};
  const segmentColors = {};
  const premiseColors = {};

  function colorForRep(rep) {
    if (!rep) return 'gray';
    if (!repColors[rep]) {
      const idx = Object.keys(repColors).length % colorPalette.length;
      repColors[rep] = colorPalette[idx];
    }
    return repColors[rep];
  }

  function colorForSegment(seg) {
    if (!seg) return 'gray';
    if (!segmentColors[seg]) {
      const idx = Object.keys(segmentColors).length % colorPalette.length;
      segmentColors[seg] = colorPalette[idx];
    }
    return segmentColors[seg];
  }

  function colorForPremise(p) {
    if (!p) return 'gray';
    if (!premiseColors[p]) {
      const idx = Object.keys(premiseColors).length % colorPalette.length;
      premiseColors[p] = colorPalette[idx];
    }
    return premiseColors[p];
  }

  const mode = colorModeSelect.value;
  const repFilter = repFilterSelect.value;

  accounts.forEach(acc => {
    const rep = getDisplayRep(acc);
    if (repFilter && rep !== repFilter) return;

    let color;
    if (mode === "rep") color = colorForRep(rep);
    else if (mode === "segment") color = colorForSegment(acc.segment);
    else color = colorForPremise(acc.premise);

    const marker = L.circleMarker([acc.lat, acc.lng], {
      radius: 5,
      color,
      fillColor: color,
      fillOpacity: 0.85
    });

    marker.accountId = acc.customerId;

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

function updateSelectionSummary() {
  const selected = accounts.filter(a => selectedIds.has(a.customerId));
  const count = selected.length;
  const revenue = selected.reduce((sum, a) => sum + (a.revenue || 0), 0);

  selectedCountEl.textContent = count;
  selectedRevenueEl.textContent = revenue.toFixed(2);

  selectedListEl.innerHTML = "";
  selected.forEach(a => {
    const li = document.createElement('li');
    li.textContent = `${a.company || a.customerId} | $${a.revenue.toLocaleString()} | Rep: ${getDisplayRep(a) || "Unassigned"}`;
    selectedListEl.appendChild(li);
  });

  assignBtn.disabled = !(count > 0 && repSelect.value);
}

function showAccountDetails(acc) {
  detailPanel.innerHTML = `
    <p><strong>$ Vol Sept–Feb:</strong> $${acc.revenue.toLocaleString()}</p>
    <p><strong>Company:</strong> ${acc.company}</p>
    <p><strong>Customer ID:</strong> ${acc.customerId}</p>
    <p><strong>Stop ID:</strong> ${acc.stopId}</p>
    <p><strong>Address:</strong> ${acc.address}, ${acc.city}, ${acc.zip}</p>
    <p><strong>County:</strong> ${acc.county}</p>
    <p><strong>Segment:</strong> ${acc.segment}</p>
    <p><strong>Premise:</strong> ${acc.premise}</p>
    <p><strong>Chain:</strong> ${acc.chain}</p>
    <p><strong>Current DM:</strong> ${acc.currentDM}</p>
    <p><strong>Current Rep:</strong> ${acc.currentRep}</p>
    <p><strong>New Rep:</strong> ${acc.newRep || "Unassigned"}</p>
    <p><strong>Lat / Lng:</strong> ${acc.lat}, ${acc.lng}</p>
  `;
}

function updateRouteSummary() {
  const byRep = {};
  accounts.forEach(a => {
    const rep = getDisplayRep(a) || "Unassigned";
    if (!byRep[rep]) byRep[rep] = { stops: 0, revenue: 0 };
    byRep[rep].stops += 1;
    byRep[rep].revenue += a.revenue || 0;
  });

  routeTableBody.innerHTML = "";
  Object.entries(byRep)
    .sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))
    .forEach(([rep, stats]) => {
      const tr = document.createElement('tr');
      const avg = stats.stops ? stats.revenue / stats.stops : 0;
      tr.innerHTML = `
        <td>${rep}</td>
        <td>${stats.stops}</td>
        <td>$${stats.revenue.toFixed(2)}</td>
        <td>$${avg.toFixed(2)}</td>
      `;
      routeTableBody.appendChild(tr);
    });
}

function assignSelectedToRep() {
  const rep = repSelect.value;
  if (!rep || !selectedIds.size) return;

  accounts.forEach(a => {
    if (selectedIds.has(a.customerId)) {
      a.newRep = rep;
    }
  });

  plotAccounts();
  updateSelectionSummary();
  updateRouteSummary();
}

function exportCsv() {
  if (!accounts.length) return;

  const data = accounts.map(a => ({
    "Customer ID - DO NOT Remove": a.customerId,
    "Stop ID - DO NOT REMOVE": a.stopId,
    "Current DM": a.currentDM,
    "Current Rep": a.currentRep,
    "New Rep": a.newRep,
    "Premise": a.premise,
    "Segment": a.segment,
    "Chain": a.chain,
    "Company": a.company,
    "Address": a.address,
    "City": a.city,
    "Zip Code": a.zip,
    "County": a.county,
    "Latitude": a.lat,
    "Longitude": a.lng,
    "$ Vol Sept - Feb": a.revenue
  }));

  const csv = Papa.unparse(data);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'routes_with_new_rep.csv';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function searchAccounts() {
  const q = searchInput.value.trim().toLowerCase();
  if (!q) return;

  const match = accounts.find(a =>
    a.customerId.toLowerCase().includes(q) ||
    (a.company && a.company.toLowerCase().includes(q))
  );

  if (!match) {
    alert("No matching account found.");
    return;
  }

  map.setView([match.lat, match.lng], 14);
  selectedIds.clear();
  selectedIds.add(match.customerId);
  updateSelectionSummary();
  showAccountDetails(match);
}

// Events
fileInput.addEventListener('change', e => {
  const file = e.target.files[0];
  if (file) loadCsv(file);
});

colorModeSelect.addEventListener('change', () => {
  plotAccounts();
});

repFilterSelect.addEventListener('change', () => {
  plotAccounts();
});

repSelect.addEventListener('change', () => {
  updateSelectionSummary();
});

assignBtn.addEventListener('click', () => {
  assignSelectedToRep();
});

exportBtn.addEventListener('click', () => {
  exportCsv();
});

searchBtn.addEventListener('click', () => {
  searchAccounts();
});

searchInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') searchAccounts();
});

// Init
window.addEventListener('DOMContentLoaded', () => {
  initMap();
});
