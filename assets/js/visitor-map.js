/*
 * visitor-map.js — self-hosted visitor analytics map (no external map API).
 *
 * Markup: <section id="site-analytics" data-api="https://<worker>.workers.dev"> ... </section>
 * Needs:  window.WORLD_MAP (assets/js/world-map-data.js), loaded before this file.
 *
 * Coordinates: x = (lon + 180) / 360 * W,  y = (90 - lat) / 180 * H
 */
(function () {
  "use strict";

  var root = document.getElementById("site-analytics");
  if (!root || !window.WORLD_MAP) return;

  var API = (root.getAttribute("data-api") || "").replace(/\/$/, "");
  var MAP = window.WORLD_MAP;
  var W = MAP.w, H = MAP.h;
  var NS = "http://www.w3.org/2000/svg";

  var CONTINENTS = {
    NA: { name: "North America", lon: -102, lat: 50 },
    SA: { name: "South America", lon: -60, lat: -16 },
    EU: { name: "Europe", lon: 16, lat: 53 },
    AF: { name: "Africa", lon: 18, lat: 4 },
    AS: { name: "Asia", lon: 92, lat: 47 },
    OC: { name: "Oceania", lon: 134, lat: -25 },
    AN: { name: "Antarctica", lon: 20, lat: -78 }
  };
  var NAME_OVERRIDE = { TW: "Taiwan", HK: "Hong Kong", MO: "Macau", KR: "South Korea", XX: "Unknown" };

  var regionNames = null;
  try { regionNames = new Intl.DisplayNames(["en"], { type: "region" }); } catch (e) {}
  var mapNames = {};
  MAP.countries.forEach(function (c) { if (c.id) mapNames[c.id] = c.n; });

  function countryName(code) {
    if (!code) return "Unknown";
    if (NAME_OVERRIDE[code]) return NAME_OVERRIDE[code];
    try { var n = regionNames && regionNames.of(code); if (n && n !== code) return n; } catch (e) {}
    return mapNames[code] || code;
  }
  function project(lon, lat) {
    return [(lon + 180) / 360 * W, (90 - lat) / 180 * H];
  }
  function el(tag, attrs) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  /* ------------------------------------------------------------ build SVG */
  var svg = root.querySelector(".vm-svg");
  svg.setAttribute("viewBox", "0 0 " + W + " " + H);
  var viewport = el("g", {});
  var countryLayer = el("g", { "class": "vm-countries" });
  var labelLayer = el("g", { "class": "vm-labels" });
  var dotLayer = el("g", { "class": "vm-dots" });
  svg.appendChild(el("rect", { "class": "vm-ocean", x: 0, y: 0, width: W, height: H }));
  viewport.appendChild(countryLayer);
  viewport.appendChild(labelLayer);
  viewport.appendChild(dotLayer);
  svg.appendChild(viewport);

  MAP.countries.forEach(function (c) {
    var p = el("path", { d: c.d, "class": "vm-country vm-ct-" + (c.ct || "XX") });
    var title = el("title", {}); title.textContent = c.id ? countryName(c.id) : c.n;
    p.appendChild(title);
    countryLayer.appendChild(p);
  });
  Object.keys(CONTINENTS).forEach(function (k) {
    var c = CONTINENTS[k], xy = project(c.lon, c.lat);
    var t = el("text", { x: xy[0].toFixed(1), y: xy[1].toFixed(1), "class": "vm-continent", "text-anchor": "middle" });
    t.textContent = c.name;
    labelLayer.appendChild(t);
  });

  /* ------------------------------------------------------------ zoom & pan */
  var scale = 1, tx = 0, ty = 0, MIN_SCALE = 1, MAX_SCALE = 10;

  function clamp() {
    tx = Math.min(0, Math.max(W - W * scale, tx));
    ty = Math.min(0, Math.max(H - H * scale, ty));
  }
  function render() {
    clamp();
    viewport.setAttribute("transform", "translate(" + tx.toFixed(2) + "," + ty.toFixed(2) + ") scale(" + scale.toFixed(4) + ")");
    var k = 1 / scale;
    dotLayer.querySelectorAll("circle").forEach(function (c) {
      c.setAttribute("r", (Number(c.dataset.r) * Math.pow(k, 0.6)).toFixed(2));
      c.setAttribute("stroke-width", (2.5 * k).toFixed(3));
    });
    labelLayer.style.fontSize = (30 * Math.pow(k, 0.7)).toFixed(2) + "px";
    labelLayer.style.opacity = scale > 3.5 ? "0" : "1";
    positionPopup();
  }
  function toSvg(clientX, clientY) {
    var r = svg.getBoundingClientRect();
    return { x: (clientX - r.left) / r.width * W, y: (clientY - r.top) / r.height * H };
  }
  function zoomAt(target, cx, cy) {
    target = Math.max(MIN_SCALE, Math.min(MAX_SCALE, target));
    tx = cx - (cx - tx) * (target / scale);
    ty = cy - (cy - ty) * (target / scale);
    scale = target;
    render();
  }

  root.querySelector(".vm-zoom-in").addEventListener("click", function () { zoomAt(scale * 1.5, W / 2, H / 2); });
  root.querySelector(".vm-zoom-out").addEventListener("click", function () { zoomAt(scale / 1.5, W / 2, H / 2); });
  root.querySelector(".vm-reset").addEventListener("click", function () { scale = 1; tx = 0; ty = 0; hidePopup(); render(); });

  svg.addEventListener("wheel", function (e) {
    e.preventDefault();
    var p = toSvg(e.clientX, e.clientY);
    zoomAt(scale * (e.deltaY < 0 ? 1.2 : 1 / 1.2), p.x, p.y);
  }, { passive: false });

  var pointers = {}, drag = null, pinch = null, moved = false;
  svg.addEventListener("pointerdown", function (e) {
    pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
    var ids = Object.keys(pointers);
    if (ids.length === 2) {
      var a = pointers[ids[0]], b = pointers[ids[1]];
      pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), scale: scale };
      drag = null;
    } else {
      drag = { x: e.clientX, y: e.clientY, tx: tx, ty: ty };
      moved = false;
    }
  });
  window.addEventListener("pointermove", function (e) {
    if (!pointers[e.pointerId]) return;
    pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
    if (pinch) {
      var ids = Object.keys(pointers);
      if (ids.length < 2) return;
      var a = pointers[ids[0]], b = pointers[ids[1]];
      var mid = toSvg((a.x + b.x) / 2, (a.y + b.y) / 2);
      zoomAt(pinch.scale * Math.hypot(a.x - b.x, a.y - b.y) / pinch.dist, mid.x, mid.y);
      return;
    }
    if (!drag) return;
    var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!moved && Math.abs(dx) + Math.abs(dy) < 4) return;
    moved = true;
    svg.classList.add("vm-dragging");
    hideTip();
    var k = W / svg.getBoundingClientRect().width;
    tx = drag.tx + dx * k;
    ty = drag.ty + dy * k;
    render();
  });
  function endPointer(e) {
    delete pointers[e.pointerId];
    if (Object.keys(pointers).length < 2) pinch = null;
    if (!Object.keys(pointers).length) { drag = null; svg.classList.remove("vm-dragging"); }
  }
  window.addEventListener("pointerup", endPointer);
  window.addEventListener("pointercancel", endPointer);

  /* ------------------------------------------------------------ hover & click */
  var wrap = root.querySelector(".vm-map");
  var tip = root.querySelector(".vm-tip");
  var popup = root.querySelector(".vm-popup");
  var activeDot = null;

  function placeLabel(loc) {
    return [loc.city, loc.region, countryName(loc.country_code)].filter(Boolean).join(", ");
  }
  function showTip(text, clientX, clientY) {
    var box = wrap.getBoundingClientRect();
    tip.textContent = text;
    tip.hidden = false;
    var x = clientX - box.left + 12, y = clientY - box.top + 14;
    tip.style.left = Math.min(x, box.width - tip.offsetWidth - 6) + "px";
    tip.style.top = Math.min(y, box.height - tip.offsetHeight - 6) + "px";
  }
  function hideTip() { tip.hidden = true; }

  function positionPopup() {
    if (!activeDot) return;
    var d = activeDot.getBoundingClientRect(), box = wrap.getBoundingClientRect();
    var x = d.left + d.width / 2 - box.left, y = d.top - box.top;
    popup.style.left = Math.max(6, Math.min(x - popup.offsetWidth / 2, box.width - popup.offsetWidth - 6)) + "px";
    popup.style.top = Math.max(6, y - popup.offsetHeight - 10) + "px";
  }
  function showPopup(dot) {
    var loc = dot.__loc;
    activeDot = dot;
    popup.innerHTML = "";
    var place = document.createElement("div");
    place.className = "vm-popup-place";
    place.textContent = placeLabel(loc);
    var count = document.createElement("div");
    count.className = "vm-popup-count";
    count.textContent = loc.visits.toLocaleString() + (loc.visits === 1 ? " pageview" : " pageviews");
    popup.appendChild(place);
    popup.appendChild(count);
    popup.hidden = false;
    positionPopup();
  }
  function hidePopup() { activeDot = null; popup.hidden = true; }

  dotLayer.addEventListener("mousemove", function (e) {
    if (drag && moved) return;
    if (e.target.__loc) showTip(placeLabel(e.target.__loc), e.clientX, e.clientY);
  });
  dotLayer.addEventListener("mouseleave", hideTip);
  svg.addEventListener("click", function (e) {
    if (moved) { moved = false; return; }
    if (e.target.__loc) { hideTip(); showPopup(e.target); } else hidePopup();
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") hidePopup(); });

  /* ------------------------------------------------------------ data */
  function setText(sel, value) { var n = root.querySelector(sel); if (n) n.textContent = value; }

  function renderStats(data) {
    var pv = data.pageviews || {};
    setText(".vm-all-time", (pv.all_time || 0).toLocaleString());
    setText(".vm-last-30", (pv.last_30_days || 0).toLocaleString());

    var locations = Array.isArray(data.locations) ? data.locations : [];
    var max = locations.reduce(function (m, l) { return Math.max(m, l.visits || 0); }, 1);

    dotLayer.innerHTML = "";
    locations.slice().sort(function (a, b) { return a.visits - b.visits; }).forEach(function (loc) {
      if (typeof loc.latitude !== "number" || typeof loc.longitude !== "number") return;
      var xy = project(loc.longitude, loc.latitude);
      var dot = el("circle", { cx: xy[0].toFixed(2), cy: xy[1].toFixed(2), "class": "vm-dot" });
      dot.dataset.r = (9 + 7 * Math.sqrt((loc.visits || 1) / max)).toFixed(2);
      dot.__loc = loc;
      dotLayer.appendChild(dot);
    });

    var byCountry = {};
    locations.forEach(function (loc) {
      var code = loc.country_code || "XX";
      byCountry[code] = (byCountry[code] || 0) + (loc.visits || 0);
    });
    var rows = Object.keys(byCountry).map(function (code) { return { name: countryName(code), visits: byCountry[code] }; })
      .sort(function (a, b) { return b.visits - a.visits || a.name.localeCompare(b.name); });

    var list = root.querySelector(".vm-locations-list");
    list.innerHTML = "";
    if (!rows.length) {
      var empty = document.createElement("li");
      empty.className = "vm-empty";
      empty.textContent = "No visits yet";
      list.appendChild(empty);
    }
    rows.forEach(function (r) {
      var li = document.createElement("li");
      var name = document.createElement("span");
      name.textContent = r.name + ": ";
      var n = document.createElement("strong");
      n.textContent = r.visits.toLocaleString() + " times";
      li.appendChild(name);
      li.appendChild(n);
      list.appendChild(li);
    });
    render();
  }

  function showError() {
    var list = root.querySelector(".vm-locations-list");
    list.innerHTML = '<li class="vm-empty">Stats unavailable</li>';
    render();
  }

  render();
  if (!API) return;

  var tracked = fetch(API + "/track", {
    method: "POST",
    mode: "cors",
    keepalive: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: location.pathname, referrer: document.referrer || "" })
  }).catch(function () {});

  tracked.then(function () {
    return fetch(API + "/stats", { mode: "cors" });
  }).then(function (r) {
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  }).then(renderStats).catch(showError);
})();
