// ===============================
// MAP INITIALIZATION
// ===============================
let map = L.map("map", {
  preferCanvas: true
}).setView([41.88, -87.63], 10);

// Base map
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19
}).addTo(map);

// ===============================
// GLOBAL STATE
// ===============================
let accountMarkers = [];
let reps = {};
let selectedRep = null;

// ===============================
// LOAD CSV
// ===============================
function loadCSV() {
  Papa.parse("accounts.csv", {
    download: true,
    header: true,
    complete: function (results) {
      const data = results.data;
      renderMarkers(data);
      buildRepList(data);
    }
  });
}

// ===============================
// RENDER MARKERS
// ===============================
function renderMarkers(data) {
  accountMarkers.forEach(m => map.removeLayer(m));
  accountMarkers = [];

  data.forEach(row => {
    if (!row.Lat || !row.Lng) return;

    const marker = L.circleMarker([row.Lat, row.Lng], {
      radius: 6,
      color: reps[row.Rep]?.color || "#000",
      weight: 2,
      fillColor: reps[row.Rep]?.color || "#000",
      fillOpacity: 0.8
    });

    marker.accountData = row;
    marker.addTo(map);
    accountMarkers.push(marker);
  });
}

// ===============================
// BUILD REP LIST (SIDEBAR)
// ===============================
function buildRepList(data) {
  reps = {};

  data.forEach(row => {
    if (!reps[row.Rep]) {
      reps[row.Rep] = {
        name: row.Rep,
        color: getRandomColor()
      };
    }
  });

  const repList = document.getElementById("rep-list");
  repList.innerHTML = "";

  Object.values(reps).forEach(rep => {
    const div = document.createElement("div");
    div.className = "rep-item";
    div.dataset.rep = rep.name;

    div.innerHTML = `
      <span class="rep-color" style="background:${rep.color}"></span>
      ${rep.name}
    `;

    div.onclick = () => {
      selectedRep = rep.name;
      highlightRep(rep.name);
    };

    repList.appendChild(div);
  });
}

// ===============================
// HIGHLIGHT SELECTED REP
// ===============================
function highlightRep(repName) {
  accountMarkers.forEach(marker => {
    const isMatch = marker.accountData.Rep === repName;
    marker.setStyle({
      fillOpacity: isMatch ? 1 : 0.2,
      opacity: isMatch ? 1 : 0.2
    });
  });
}

// ===============================
// RANDOM COLOR GENERATOR
// ===============================
function getRandomColor() {
  return "#" + Math.floor(Math.random() * 16777215).toString(16);
}

// ===============================
// LASSO SETUP
// ===============================
let lasso = L.lasso(map);

document.getElementById("lasso-btn").onclick = () => {
  lasso.enable();
};

// Fired when user finishes drawing
map.on("lasso.finished", function (e) {
  const poly = e.latLngs;

  const inside = accountMarkers.filter(marker => {
    return leafletPip.pointInLayer(marker.getLatLng(), L.polygon(poly)).length > 0;
  });

  console.log("Selected accounts:", inside.length);
});

// ===============================
// START APP
// ===============================
loadCSV();
