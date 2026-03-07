// Simple Leaflet Lasso for browser (no require, no modules)
(function (factory) {
  if (typeof L !== "undefined") {
    factory(L);
  } else {
    console.error("Leaflet not found. Lasso cannot initialize.");
  }
})(function (L) {
  function distance(a, b) {
    var dx = a.x - b.x;
    var dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function samePoint(a, b) {
    return Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6;
  }

  function Lasso(map) {
    this._map = map;
    this._enabled = false;
    this._polygon = [];
    this._polyline = null;

    this._onMouseDown = this._onMouseDown.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onMouseUp = this._onMouseUp.bind(this);
  }

  Lasso.prototype.enable = function () {
    if (this._enabled) return;
    this._enabled = true;
    this._map.dragging.disable();
    this._map.on("mousedown", this._onMouseDown);
  };

  Lasso.prototype.disable = function () {
    if (!this._enabled) return;
    this._enabled = false;
    this._map.dragging.enable();
    this._map.off("mousedown", this._onMouseDown);
    this._map.off("mousemove", this._onMouseMove);
    this._map.off("mouseup", this._onMouseUp);
    this._clear();
  };

  Lasso.prototype._clear = function () {
    this._polygon = [];
    if (this._polyline) {
      this._map.removeLayer(this._polyline);
      this._polyline = null;
    }
  };

  Lasso.prototype._onMouseDown = function (e) {
    this._polygon = [e.latlng];
    this._polyline = L.polyline(this._polygon, {
      color: "#000",
      weight: 2
    }).addTo(this._map);

    this._map.on("mousemove", this._onMouseMove);
    this._map.on("mouseup", this._onMouseUp);
  };

  Lasso.prototype._onMouseMove = function (e) {
    var last = this._polygon[this._polygon.length - 1];
    var ptLast = this._map.latLngToLayerPoint(last);
    var ptNew = this._map.latLngToLayerPoint(e.latlng);

    if (distance(ptLast, ptNew) > 2) {
      this._polygon.push(e.latlng);
      this._polyline.setLatLngs(this._polygon);
    }
  };

  Lasso.prototype._onMouseUp = function () {
    this._map.off("mousemove", this._onMouseMove);
    this._map.off("mouseup", this._onMouseUp);

    var poly = this._polygon;
    if (poly.length > 2) {
      var first = this._map.latLngToLayerPoint(poly[0]);
      var last = this._map.latLngToLayerPoint(poly[poly.length - 1]);
      if (!samePoint(first, last) && distance(first, last) < 10) {
        poly.push(poly[0]);
      }
    }

    this._map.fire("lasso.finished", { latLngs: poly });
    this._clear();
  };

  // Factory
  L.lasso = function (map, options) {
    return new Lasso(map, options || {});
  };
});
