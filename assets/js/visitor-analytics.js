/* Site analytics: records a pageview and renders an interactive world map. */
(function () {
  var root = document.getElementById("site-analytics");
  if (!root || !window.WORLD_MAP) return;

  var API = root.getAttribute("data-api");
  var TRACK_HOSTS = ["shengyunzhong.github.io"];
  var map = window.WORLD_MAP;
  var NS = "http://www.w3.org/2000/svg";

  var svg = root.querySelector(".sa-map");
  var viewport = document.createElementNS(NS, "g");
  var countryLayer = document.createElementNS(NS, "g");
  var dotLayer = document.createElementNS(NS, "g");
  var tip = root.querySelector(".sa-tip");
  svg.setAttribute("viewBox", "0 0 " + map.w + " " + map.h);
  viewport.appendChild(countryLayer);
  viewport.appendChild(dotLayer);
  svg.appendChild(viewport);

  var byCode = {};
  map.countries.forEach(function (c) {
    var p = document.createElementNS(NS, "path");
    p.setAttribute("d", c.d);
    p.setAttribute("class", "sa-country");
    p.dataset.name = c.n;
    if (c.id) { p.dataset.code = c.id; byCode[c.id] = { el: p, info: c }; }
    countryLayer.appendChild(p);
  });

  var names = (typeof Intl !== "undefined" && Intl.DisplayNames) ? new Intl.DisplayNames(["en"], { type: "region" }) : null;
  function countryName(code) {
    try { if (names) { var n = names.of(code); if (n && n !== code) return n; } } catch (e) {}
    return byCode[code] ? byCode[code].info.n : code;
  }

  /* ---------- zoom & pan ---------- */
  var scale = 1, tx = 0, ty = 0, MIN = 1, MAX = 8;
  function clamp() {
    var minX = map.w - map.w * scale, minY = map.h - map.h * scale;
    tx = Math.min(0, Math.max(minX, tx));
    ty = Math.min(0, Math.max(minY, ty));
  }
  function apply() {
    clamp();
    viewport.setAttribute("transform", "translate(" + tx + "," + ty + ") scale(" + scale + ")");
    var r = 1 / Math.sqrt(scale);
    dotLayer.querySelectorAll("circle").forEach(function (c) { c.setAttribute("r", c.dataset.r * r); c.setAttribute("stroke-width", 1.5 / scale); });
    countryLayer.style.strokeWidth = (0.5 / scale) + "px";
  }
  function svgPoint(evt) {
    var rect = svg.getBoundingClientRect();
    return { x: (evt.clientX - rect.left) / rect.width * map.w, y: (evt.clientY - rect.top) / rect.height * map.h };
  }
  function zoomAt(target, cx, cy) {
    target = Math.max(MIN, Math.min(MAX, target));
    tx = cx - (cx - tx) * (target / scale);
    ty = cy - (cy - ty) * (target / scale);
    scale = target;
    apply();
  }
  root.querySelector(".sa-zoom-in").addEventListener("click", function () { zoomAt(scale * 1.5, map.w / 2, map.h / 2); });
  root.querySelector(".sa-zoom-out").addEventListener("click", function () { zoomAt(scale / 1.5, map.w / 2, map.h / 2); });
  root.querySelector(".sa-reset").addEventListener("click", function () { scale = 1; tx = 0; ty = 0; apply(); });
  svg.addEventListener("wheel", function (e) {
    e.preventDefault();
    var p = svgPoint(e);
    zoomAt(scale * (e.deltaY < 0 ? 1.25 : 1 / 1.25), p.x, p.y);
  }, { passive: false });
  svg.addEventListener("dblclick", function (e) { var p = svgPoint(e); zoomAt(scale * 1.6, p.x, p.y); });

  var drag = null, pointers = {}, pinch = null;
  svg.addEventListener("pointerdown", function (e) {
    pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
    svg.setPointerCapture(e.pointerId);
    var ids = Object.keys(pointers);
    if (ids.length === 2) {
      var a = pointers[ids[0]], b = pointers[ids[1]];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), s: scale };
      drag = null;
    } else {
      drag = { x: e.clientX, y: e.clientY, tx: tx, ty: ty };
    }
    svg.classList.add("dragging");
  });
  svg.addEventListener("pointermove", function (e) {
    if (pointers[e.pointerId]) pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
    var rect = svg.getBoundingClientRect(), k = map.w / rect.width;
    if (pinch) {
      var ids = Object.keys(pointers);
      if (ids.length === 2) {
        var a = pointers[ids[0]], b = pointers[ids[1]];
        var mid = svgPoint({ clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 });
        zoomAt(pinch.s * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d, mid.x, mid.y);
      }
      return;
    }
    if (drag) {
      tx = drag.tx + (e.clientX - drag.x) * k;
      ty = drag.ty + (e.clientY - drag.y) * k;
      apply();
    }
  });
  function endPointer(e) {
    delete pointers[e.pointerId];
    if (Object.keys(pointers).length < 2) pinch = null;
    if (!Object.keys(pointers).length) { drag = null; svg.classList.remove("dragging"); }
  }
  svg.addEventListener("pointerup", endPointer);
  svg.addEventListener("pointercancel", endPointer);

  /* ---------- tooltip ---------- */
  var visits = {};
  function plural(n) { return n.toLocaleString() + (n === 1 ? " view" : " views"); }
  svg.addEventListener("mousemove", function (e) {
    var t = e.target, ds = t.dataset || {}, text = null;
    if (ds.place) {
      text = ds.place + " · " + plural(Number(ds.views));
    } else if (ds.code || ds.name) {
      var n = ds.code && visits[ds.code];
      text = (ds.code ? countryName(ds.code) : ds.name) + (n ? " · " + plural(n) : "");
    }
    if (!text || drag) { tip.hidden = true; return; }
    tip.textContent = text;
    var box = root.querySelector(".sa-map-wrap").getBoundingClientRect();
    tip.style.left = (e.clientX - box.left + 12) + "px";
    tip.style.top = (e.clientY - box.top + 12) + "px";
    tip.hidden = false;
  });
  svg.addEventListener("mouseleave", function () { tip.hidden = true; });

  /* ---------- data ---------- */
  function render(data) {
    root.querySelector(".sa-all").textContent = (data.all_time || 0).toLocaleString();
    root.querySelector(".sa-30").textContent = (data.last_30_days || 0).toLocaleString();
    var list = root.querySelector(".sa-list");
    list.innerHTML = "";
    dotLayer.innerHTML = "";
    var countries = data.countries || [];
    var max = countries.reduce(function (m, c) { return Math.max(m, c.views); }, 1);
    countries.forEach(function (c) {
      visits[c.code] = c.views;
      var entry = byCode[c.code];
      if (entry) {
        entry.el.classList.add("sa-visited");
        entry.el.style.fillOpacity = (0.35 + 0.65 * Math.sqrt(c.views / max)).toFixed(2);
      }
    });
    var places = (data.locations || []).slice().sort(function (a, b) { return a.views - b.views; });
    var pmax = places.reduce(function (m, p) { return Math.max(m, p.views); }, 1);
    var P = map.proj, RAD = Math.PI / 180;
    places.forEach(function (p) {
      var dot = document.createElementNS(NS, "circle");
      dot.setAttribute("cx", (P.k * p.lon * RAD + P.tx).toFixed(1));
      dot.setAttribute("cy", (P.ty - P.k * p.lat * RAD).toFixed(1));
      dot.dataset.r = (3 + 4 * Math.sqrt(p.views / pmax)).toFixed(2);
      dot.dataset.place = [p.city, p.region, countryName(p.country)].filter(Boolean).join(", ");
      dot.dataset.views = p.views;
      dot.setAttribute("class", "sa-dot");
      dotLayer.appendChild(dot);
    });
    countries.slice(0, 10).forEach(function (c) {
      var li = document.createElement("li");
      var name = document.createElement("span");
      name.textContent = countryName(c.code);
      var n = document.createElement("strong");
      n.textContent = c.views.toLocaleString();
      li.appendChild(name); li.appendChild(n);
      li.addEventListener("mouseenter", function () { if (byCode[c.code]) byCode[c.code].el.classList.add("sa-hl"); });
      li.addEventListener("mouseleave", function () { if (byCode[c.code]) byCode[c.code].el.classList.remove("sa-hl"); });
      list.appendChild(li);
    });
    if (!countries.length) list.innerHTML = '<li class="sa-empty">No visits yet</li>';
    apply();
  }

  function loadStats() {
    return fetch(API + "/stats", { mode: "cors" })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(render)
      .catch(function () { root.querySelector(".sa-list").innerHTML = '<li class="sa-empty">Stats unavailable</li>'; apply(); });
  }

  if (!API) { apply(); return; }
  var track = TRACK_HOSTS.indexOf(location.hostname) >= 0
    ? fetch(API + "/track", {
        method: "POST", mode: "cors", keepalive: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: location.pathname, ref: document.referrer || "" })
      }).catch(function () {})
    : Promise.resolve();
  track.then(loadStats);
})();
