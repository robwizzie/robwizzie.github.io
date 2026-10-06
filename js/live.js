/* robwiscount.org — live mode: other visitors' cursors + a dot-matrix visitor map.
   Talks to the Cloudflare Worker in workers/live. Off unless <meta name="rw-live" content="https://…"> is set.
   Coarse city-level location only (from Cloudflare); no IPs, no cookies. */
(function () {
  'use strict';

  var RW = window.RW || {};
  var meta = document.querySelector('meta[name="rw-live"]');
  var BASE = meta ? (meta.getAttribute('content') || '').replace(/\s+/g, '').replace(/\/+$/, '') : '';
  var section = document.getElementById('visitors');

  if (!BASE || !/^https?:\/\//.test(BASE) || !window.fetch || !window.JSON) {
    if (RW.commands) RW.commands.who = RW.commands.w = function () { RW.print('Live mode isn\'t configured on this copy of the site.', 'dim'); };
    return;
  }

  var WS_URL = BASE.replace(/^http/, 'ws') + '/live';
  var WORLD = 'https://cdn.jsdelivr.net/npm/world-atlas@2/land-110m.json';
  var reduceMotion = RW.reduceMotion != null ? RW.reduceMotion : window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var finePointer = RW.finePointer != null ? RW.finePointer : window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var $ = function (s, r) { return (r || document).querySelector(s); };

  var me = { id: null, place: null };
  var peers = {}, here = 0, stats = null;
  var wsOpen = false;

  /* ---------- Helpers ---------- */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function label(p) {
    if (!p || !p.city) return p && p.country ? p.country : 'somewhere';
    return p.city + ', ' + (p.country === 'US' && p.region ? p.region : p.country || '?');
  }
  function today() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function rid() {
    var a = '', c = 'abcdefghijklmnopqrstuvwxyz0123456789';
    var buf = window.crypto && crypto.getRandomValues ? crypto.getRandomValues(new Uint8Array(20)) : null;
    for (var i = 0; i < 20; i++) a += c.charAt((buf ? buf[i] : Math.random() * 256) % 36 | 0);
    return a;
  }
  function load(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function getJSON(url, opts) { return fetch(url, opts).then(function (r) { if (!r.ok) throw r.status; return r.json(); }); }
  function ago(t) {
    var s = Math.max(0, (Date.now() - t) / 1000);
    if (s < 90) return 'Just now';
    if (s < 3600) return Math.round(s / 60) + 'm ago';
    if (s < 86400) return Math.round(s / 3600) + 'h ago';
    return Math.round(s / 86400) + 'd ago';
  }
  function hasGeo(p) { return p && typeof p.lat === 'number' && typeof p.lon === 'number'; }

  /* ---------- Section copy + stats ---------- */
  var shown = {};
  function countTo(el, to) {
    if (!el) return;
    var from = shown[el.id] || 0;
    shown[el.id] = to;
    if (reduceMotion || from === to) { el.textContent = to.toLocaleString(); return; }
    var t0 = performance.now();
    (function tick(now) {
      var t = Math.min((now - t0) / 1200, 1), e = 1 - Math.pow(1 - t, 3);
      el.textContent = Math.round(from + (to - from) * e).toLocaleString();
      if (t < 1) requestAnimationFrame(tick);
    })(t0);
  }

  function setYou(p) {
    if (!p) return;
    if (!me.place || !me.place.city || p.city) me.place = p;
    var h = $('#lv-title');
    if (h && me.place.city) h.innerHTML = 'Hey, <span class="blue">I see you, ' + esc(me.place.city) + '.</span>';
    map.paint();
  }

  function hereCount() { return wsOpen ? Math.max(1, here) : (stats && stats.now ? stats.now : 0) + 1; }

  function paintStats() {
    if (!stats || !section) return;
    countTo($('#lv-total'), stats.total || 0);
    countTo($('#lv-countries'), stats.countries || 0);
    countTo($('#lv-cities'), stats.cityCount || (stats.cities || []).length);
    var top = (stats.cities || [])[0];
    var topEl = $('#lv-top');
    if (topEl) topEl.textContent = top ? top.city : '—';
    var topLbl = $('#lv-top-label');
    if (topLbl && top) topLbl.textContent = 'Top city · ' + top.n.toLocaleString() + ' visit' + (top.n === 1 ? '' : 's');
    var rec = (stats.recent || []).slice(0, 5).map(function (v) {
      return '<span><b>' + ago(v.t) + ':</b> ' + esc(label(v)) + '</span>';
    });
    var recEl = $('#lv-recent');
    if (recEl) recEl.innerHTML = rec.length ? rec.join('<i aria-hidden="true">·</i>') : 'You\'re the first one here today.';
    var c = $('#lv-canvas');
    if (c) c.setAttribute('aria-label', 'Visitor map: ' + (stats.total || 0).toLocaleString() + ' visits from ' + (stats.cityCount || 0) + ' cities in ' + (stats.countries || 0) + ' countries.');
    paintNow();
  }

  function paintNow() {
    var n = hereCount();
    countTo($('#lv-now'), n);
    var head = $('#lv-live-n');
    if (head) head.textContent = n === 1 ? 'Just you here now' : n + ' people here now';
    pill(n);
  }

  function setStats(s) {
    if (!s || typeof s.total !== 'number') return;
    stats = s;
    paintStats();
    map.paint();
  }

  /* ---------- Visits: once per browser per day ---------- */
  function visit() {
    var v = load('rw-live') || {}, d = today();
    if (v.d === d && v.id) { if (v.you) setYou(v.you); return; }
    var id = rid();
    // text/plain keeps it a "simple" request (no CORS preflight)
    getJSON(BASE + '/visit', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ id: id }) })
      .then(function (s) {
        save('rw-live', { d: d, id: id, you: s.you || null });
        setYou(s.you);
        setStats(s);
      })
      .catch(function () {});
  }

  function loadStats() { getJSON(BASE + '/stats').then(setStats).catch(function () {}); }

  /* ---------- Presence pill ---------- */
  var pillEl = null;
  function pill(n) {
    if (!pillEl) {
      if (n < 2) return;
      pillEl = document.createElement('button');
      pillEl.className = 'lv-pill';
      pillEl.type = 'button';
      pillEl.innerHTML = '<i aria-hidden="true"></i><span></span>';
      pillEl.addEventListener('click', function () {
        if (section) section.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
      });
      document.body.appendChild(pillEl);
      if (map.visible && map.visible()) pillEl.classList.add('away');
      void pillEl.offsetWidth;
    }
    pillEl.lastChild.textContent = n + ' people here now';
    pillEl.setAttribute('aria-label', n + ' people are on this page right now. Show the visitor map.');
    pillEl.classList.toggle('show', n > 1);
  }

  /* ---------- Other people's cursors ---------- */
  var HEX = '<svg viewBox="0 0 24 26" aria-hidden="true"><polygon points="12,1.5 22,7 22,19 12,24.5 2,19 2,7" fill="#5b8ff9" stroke="#fff" stroke-width="2" stroke-linejoin="round"/></svg>';
  var layer = null, curs = {}, nCurs = 0, MAX_CURS = 20, rafC = 0, seenOther = false;

  function cursorFor(id) {
    if (curs[id]) return curs[id];
    if (nCurs >= MAX_CURS) return null;
    if (!layer) { layer = document.createElement('div'); layer.className = 'lv-layer'; layer.setAttribute('aria-hidden', 'true'); document.body.appendChild(layer); }
    var el = document.createElement('div');
    el.className = 'lv-cur';
    el.innerHTML = HEX + '<span></span>';
    layer.appendChild(el);
    nCurs++;
    return (curs[id] = { el: el, x: -1, y: -1, tx: 0, ty: 0, t1: 0, t2: 0 });
  }

  function dropCursor(id) {
    var c = curs[id];
    if (!c) return;
    clearTimeout(c.t1); clearTimeout(c.t2);
    if (c.el.parentNode) c.el.parentNode.removeChild(c.el);
    delete curs[id];
    nCurs--;
  }

  function onCursor(m) {
    var c = cursorFor(m.id);
    if (!c) return;
    c.tx = m.x; c.ty = m.y;
    if (c.x < 0 || reduceMotion || !c.el.classList.contains('on')) { c.x = m.x; c.y = m.y; }
    c.el.lastChild.textContent = label(peers[m.id]);
    c.el.classList.add('on', 'talk');
    c.el.classList.remove('idle');
    clearTimeout(c.t1); clearTimeout(c.t2);
    c.t1 = setTimeout(function () { c.el.classList.remove('talk'); }, 3500);
    c.t2 = setTimeout(function () { c.el.classList.add('idle'); }, 15000);
    if (!seenOther) { seenOther = true; if (RW.egg) RW.egg('live'); }
    kick();
  }

  function hideCursor(id) { var c = curs[id]; if (c) c.el.classList.remove('on', 'talk'); }

  function kick() { if (!rafC && nCurs) rafC = requestAnimationFrame(frame); }
  function frame() {
    rafC = 0;
    var de = document.documentElement, W = de.clientWidth, H = de.scrollHeight, sy = window.pageYOffset, moving = false;
    for (var id in curs) {
      var c = curs[id];
      if (reduceMotion) { c.x = c.tx; c.y = c.ty; }
      else {
        c.x += (c.tx - c.x) * 0.22; c.y += (c.ty - c.y) * 0.22;
        if (Math.abs(c.tx - c.x) * W > 0.3 || Math.abs(c.ty - c.y) * H > 0.3) moving = true;
        else { c.x = c.tx; c.y = c.ty; }
      }
      c.el.style.transform = 'translate3d(' + (c.x * W).toFixed(1) + 'px,' + (c.y * H - sy).toFixed(1) + 'px,0)';
    }
    if (moving) rafC = requestAnimationFrame(frame);
  }
  window.addEventListener('scroll', kick, { passive: true });
  window.addEventListener('resize', kick);

  // My cursor: fine pointers only, ~15/s, and only when someone else is here to see it.
  var ptr = null, lastSend = 0, sendTimer = 0;
  function sendCursor() {
    if (!ptr || !wsOpen || here < 2) return;
    var de = document.documentElement;
    send({ t: 'c', x: +(ptr.x / de.clientWidth).toFixed(4), y: +((ptr.y + window.pageYOffset) / de.scrollHeight).toFixed(4) });
  }
  function queue() {
    var now = Date.now();
    if (now - lastSend >= 66) { lastSend = now; sendCursor(); }
    else if (!sendTimer) sendTimer = setTimeout(function () { sendTimer = 0; lastSend = Date.now(); sendCursor(); }, 66 - (now - lastSend));
  }
  if (finePointer) {
    document.addEventListener('mousemove', function (e) { ptr = { x: e.clientX, y: e.clientY }; queue(); }, { passive: true });
    window.addEventListener('scroll', function () { if (ptr) queue(); }, { passive: true });
    document.documentElement.addEventListener('mouseleave', function () { if (ptr && here > 1) send({ t: 'h' }); ptr = null; });
  }

  /* ---------- WebSocket ---------- */
  var ws = null, retry = 0, retryTimer = 0, hideTimer = 0, pingTimer = 0;

  function send(m) { if (wsOpen) try { ws.send(JSON.stringify(m)); } catch (e) {} }

  function setPeers(list, n) {
    peers = {};
    (list || []).forEach(function (p) { if (p && p.id && p.id !== me.id) peers[p.id] = p; });
    here = Math.max(1, n || 0);
    for (var id in curs) if (!peers[id]) dropCursor(id);
    paintNow();
    map.paint();
    if (here > 1) sendCursor();
  }

  function handle(m) {
    if (!m || typeof m !== 'object') return;
    if (m.t === 'hi') { me.id = m.id; setYou(m.you); setPeers(m.peers, m.n); }
    else if (m.t === 'p') setPeers(m.peers, m.n);
    else if (m.t === 'c' && m.id !== me.id && typeof m.x === 'number' && typeof m.y === 'number') onCursor(m);
    else if (m.t === 'h') hideCursor(m.id);
  }

  function cleanup() {
    wsOpen = false; ws = null; here = 0; peers = {};
    clearInterval(pingTimer);
    for (var id in curs) dropCursor(id);
    paintNow();
    map.paint();
  }

  function connect() {
    if (ws || document.hidden || !('WebSocket' in window)) return;
    clearTimeout(retryTimer); retryTimer = 0;
    try { ws = new WebSocket(WS_URL); } catch (e) { ws = null; return reconnect(); }
    ws.onopen = function () {
      wsOpen = true; retry = 0;
      pingTimer = setInterval(function () { try { ws.send('ping'); } catch (e) {} }, 30000);
    };
    ws.onmessage = function (e) {
      if (e.data === 'pong') return;
      var m;
      try { m = JSON.parse(e.data); } catch (er) { return; }
      handle(m);
    };
    ws.onclose = function () { cleanup(); reconnect(); };
    ws.onerror = function () {};
  }

  function reconnect() {
    if (retryTimer || document.hidden) return;
    var wait = Math.min(60000, 2000 * Math.pow(2, retry++)) * (0.75 + Math.random() * 0.5);
    retryTimer = setTimeout(function () { retryTimer = 0; connect(); }, wait);
  }

  function disconnect() {
    clearTimeout(retryTimer); retryTimer = 0;
    if (!ws) return;
    var w = ws;
    w.onclose = null;
    try { w.close(1000); } catch (e) {}
    cleanup();
  }

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { clearTimeout(hideTimer); hideTimer = setTimeout(disconnect, 30000); }
    else { clearTimeout(hideTimer); retry = 0; connect(); }
  });

  /* ---------- Visitor map ----------
     land-110m (TopoJSON) → rings → offscreen raster → a grid of rounded squares,
     the same squares as the GitHub card. If the geometry can't load, it's a plain dot grid. */
  var map = (function () {
    var box = $('#lv-map'), canvas = $('#lv-canvas'), tip = $('#lv-tip'), card = $('#lv');
    if (!box || !canvas || !canvas.getContext) return { paint: function () {}, init: function () {} };
    var ctx = canvas.getContext('2d'), base = document.createElement('canvas'), bctx = base.getContext('2d');
    var LAT_N = 80, LAT_S = -58;
    var rings = null, mask = null, cols = 0, rows = 0, pitch = 0, W = 0, H = 0, dpr = 1;
    var cells = {}, pulses = [], raf = 0, onScreen = false, started = false, colors = null;

    function decode(topo) {
      var t = topo.transform, sx = t.scale[0], sy = t.scale[1], tx = t.translate[0], ty = t.translate[1];
      var arcs = topo.arcs.map(function (arc) {
        var x = 0, y = 0;
        return arc.map(function (p) { x += p[0]; y += p[1]; return [x * sx + tx, y * sy + ty]; });
      });
      var out = [];
      function ring(ids) {
        var r = [];
        ids.forEach(function (i) {
          var a = i < 0 ? arcs[~i].slice().reverse() : arcs[i];
          a.forEach(function (p, k) { if (k || !r.length) r.push(p); });
        });
        return r;
      }
      (function geom(g) {
        if (g.type === 'GeometryCollection') g.geometries.forEach(geom);
        else if (g.type === 'Polygon') g.arcs.forEach(function (r) { out.push(ring(r)); });
        else if (g.type === 'MultiPolygon') g.arcs.forEach(function (poly) { poly.forEach(function (r) { out.push(ring(r)); }); });
      })(topo.objects.land);
      return out;
    }

    function px(lon) { return (lon + 180) / 360; }
    function py(lat) { return (LAT_N - lat) / (LAT_N - LAT_S); }
    function cellOf(p) {
      var c = Math.floor(px(p.lon) * cols), r = Math.floor(py(p.lat) * rows);
      return { c: Math.max(0, Math.min(cols - 1, c)), r: Math.max(0, Math.min(rows - 1, r)) };
    }

    function readColors() {
      var cs = getComputedStyle(card || box);
      function v(n, f) { return (cs.getPropertyValue(n) || '').trim() || f; }
      colors = { l0: v('--lv-land', 'rgba(160,185,255,.12)'), l1: v('--gh-1', '#1c3263'), l2: v('--gh-2', '#2c56b8'), l3: '#5b8ff9', l4: '#8db2ff' };
    }

    function layout() {
      var w = box.clientWidth;
      if (!w) return false;
      var target = w >= 900 ? 8 : w >= 600 ? 7 : 5.2;
      cols = Math.round(w / target);
      pitch = w / cols;
      rows = Math.round(cols * (LAT_N - LAT_S) / 360);
      W = w; H = Math.round(rows * pitch);
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = base.width = Math.round(W * dpr);
      canvas.height = base.height = Math.round(H * dpr);
      canvas.style.height = H + 'px';
      box.style.aspectRatio = 'auto';
      raster();
      return true;
    }

    // Land coverage per cell, from a 3x supersampled raster.
    function raster() {
      mask = new Uint8Array(cols * rows);
      if (!rings) return;
      var S = 3, oc = document.createElement('canvas'), o = oc.getContext('2d');
      oc.width = cols * S; oc.height = rows * S;
      o.fillStyle = '#fff';
      o.beginPath();
      rings.forEach(function (r) {
        r.forEach(function (p, i) {
          var x = px(p[0]) * oc.width, y = py(p[1]) * oc.height;
          if (i) o.lineTo(x, y); else o.moveTo(x, y);
        });
        o.closePath();
      });
      o.fill('evenodd');
      var d = o.getImageData(0, 0, oc.width, oc.height).data;
      for (var r = 0; r < rows; r++) for (var c = 0; c < cols; c++) {
        var n = 0;
        for (var j = 0; j < S; j++) for (var i = 0; i < S; i++) if (d[((r * S + j) * oc.width + c * S + i) * 4 + 3] > 127) n++;
        mask[r * cols + c] = n >= 3 ? 1 : 0;
      }
    }

    function sq(g, x, y, s, fill) {
      g.fillStyle = fill;
      g.beginPath();
      if (g.roundRect) g.roundRect(x - s / 2, y - s / 2, s, s, s * 0.24); else g.rect(x - s / 2, y - s / 2, s, s);
      g.fill();
    }

    // Visitor cities (from /stats) + live peers + me, bucketed into grid cells.
    function bucket() {
      cells = {};
      function at(p) {
        var k = cellOf(p), key = k.r * cols + k.c;
        return cells[key] || (cells[key] = { c: k.c, r: k.r, n: 0, names: [], live: 0, mine: false });
      }
      var max = 1;
      ((stats && stats.cities) || []).forEach(function (p) {
        if (!hasGeo(p)) return;
        var cell = at(p);
        cell.n += p.n || 0;
        cell.names.push({ name: label(p), n: p.n || 0 });
        max = Math.max(max, cell.n);
      });
      for (var id in peers) if (hasGeo(peers[id])) {
        var cl = at(peers[id]);
        cl.live++;
        if (!cl.names.length) cl.names.push({ name: label(peers[id]), n: 0 });
      }
      if (hasGeo(me.place)) {
        var mc = at(me.place);
        mc.mine = true;
        if (!mc.names.length) mc.names.push({ name: label(me.place), n: 0 });
      }
      for (var key in cells) {
        var f = Math.log(1 + cells[key].n) / Math.log(1 + max);
        cells[key].lvl = cells[key].n ? (f > 0.62 ? 4 : f > 0.3 ? 3 : 2) : 2;
      }
    }

    function drawBase() {
      var g = bctx, s = pitch * 0.72;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, W, H);
      for (var r = 0; r < rows; r++) for (var c = 0; c < cols; c++) {
        if (rings ? mask[r * cols + c] : (r + c) % 2 === 0) sq(g, (c + 0.5) * pitch, (r + 0.5) * pitch, s, rings ? colors.l0 : 'rgba(160,185,255,.045)');
      }
      for (var k in cells) {
        var cl = cells[k], x = (cl.c + 0.5) * pitch, y = (cl.r + 0.5) * pitch;
        if (cl.lvl > 2) { g.shadowColor = 'rgba(91,143,249,' + (cl.lvl === 4 ? .9 : .5) + ')'; g.shadowBlur = pitch * (cl.lvl === 4 ? 2.2 : 1.2); }
        sq(g, x, y, s * (cl.lvl === 4 ? 1.55 : cl.lvl === 3 ? 1.3 : 1.1), colors['l' + cl.lvl]);
        g.shadowBlur = 0;
        if (cl.live || cl.mine) sq(g, x, y, s * 1.3, cl.live ? '#fff' : colors.l4);
      }
      pulses = [];
      for (var k2 in cells) if (cells[k2].live || cells[k2].mine) pulses.push(cells[k2]);
    }

    function draw(now) {
      raf = 0;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(base, 0, 0);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      pulses.forEach(function (cl, i) {
        var x = (cl.c + 0.5) * pitch, y = (cl.r + 0.5) * pitch, period = cl.live ? 1600 : 2400;
        var t = reduceMotion ? 0.35 : ((now || 0) + i * 400) % period / period;
        var rad = pitch * (0.8 + t * (cl.live ? 3.2 : 2.4));
        ctx.strokeStyle = cl.live ? 'rgba(255,255,255,' + (0.85 * (1 - t)) + ')' : 'rgba(141,178,255,' + (0.8 * (1 - t)) + ')';
        ctx.lineWidth = cl.live ? 1.6 : 1.2;
        ctx.beginPath();
        ctx.arc(x, y, rad, 0, Math.PI * 2);
        ctx.stroke();
      });
      if (pulses.length && onScreen && !reduceMotion && !document.hidden) raf = requestAnimationFrame(draw);
    }

    function paint() {
      if (!started || !cols) return;
      bucket();
      drawBase();
      if (!raf) draw(performance.now());
      box.classList.add('ready');
    }

    function init() {
      if (started) return;
      started = true;
      readColors();
      getJSON(WORLD)
        .then(function (topo) { rings = decode(topo); })
        .catch(function () { rings = null; box.classList.add('lv-flat'); })
        .then(function () { if (layout()) paint(); });
    }

    // Tooltip
    function showTip(e) {
      if (!cols) return;
      var br = canvas.getBoundingClientRect();
      var c = Math.floor((e.clientX - br.left) / pitch), r = Math.floor((e.clientY - br.top) / pitch), best = null, bd = 9;
      for (var dr = -1; dr <= 1; dr++) for (var dc = -1; dc <= 1; dc++) {
        var cl = cells[(r + dr) * cols + (c + dc)];
        if (cl && c + dc >= 0 && c + dc < cols && dr * dr + dc * dc < bd) { bd = dr * dr + dc * dc; best = cl; }
      }
      if (!best) { hideTip(); return; }
      var names = best.names.slice().sort(function (a, b) { return b.n - a.n; });
      var txt = names[0].name + (names.length > 1 ? ' + ' + (names.length - 1) + ' nearby' : '');
      if (best.n) txt += ' · ' + best.n.toLocaleString() + ' visit' + (best.n === 1 ? '' : 's');
      if (best.live) txt += ' · ' + best.live + ' here now';
      else if (best.mine) txt += ' · you';
      tip.textContent = txt;
      var cr = card.getBoundingClientRect();
      var x = br.left - cr.left + (best.c + 0.5) * pitch, half = tip.offsetWidth / 2 + 8;
      tip.style.left = Math.max(half, Math.min(cr.width - half, x)) + 'px';
      tip.style.top = (br.top - cr.top + best.r * pitch) + 'px';
      tip.classList.add('show');
      canvas.style.cursor = 'pointer';
    }
    function hideTip() { tip.classList.remove('show'); canvas.style.cursor = ''; }
    canvas.addEventListener('mousemove', showTip);
    canvas.addEventListener('click', showTip);
    canvas.addEventListener('mouseleave', hideTip);

    var lastW = 0, rt = 0;
    window.addEventListener('resize', function () {
      clearTimeout(rt);
      rt = setTimeout(function () { if (started && box.clientWidth !== lastW) { lastW = box.clientWidth; hideTip(); if (layout()) paint(); } }, 150);
    });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (en) {
        onScreen = en[0].isIntersecting;
        if (pillEl) pillEl.classList.toggle('away', onScreen);
        if (onScreen && !raf && cols) draw(performance.now());
      }).observe(box);
    } else onScreen = true;

    return { paint: paint, init: init, visible: function () { return onScreen; } };
  })();

  /* ---------- Terminal: who ---------- */
  if (RW.commands) {
    RW.commands.who = RW.commands.w = function () {
      if (!wsOpen) {
        RW.print('Not connected to the live server right now' + (me.place && me.place.city ? ' — but hi, ' + esc(label(me.place)) + '.' : '.'), 'dim');
        RW.print('<a href="#visitors">→ see the visitor map</a>');
        return;
      }
      var names = [];
      for (var id in peers) names.push(esc(label(peers[id])));
      if (!names.length) {
        RW.print('Just you right now' + (me.place && me.place.city ? ' (' + esc(label(me.place)) + ')' : '') + '. Open a second tab and wave.', 'ok');
      } else {
        if (names.length < here - 1) names.push((here - 1 - names.length) + ' more');
        names.push('you');
        RW.print(here + ' people here now: ' + names.join(' · '), 'ok');
      }
      RW.print('<a href="#visitors">→ see the visitor map</a>');
    };
  }

  /* ---------- Boot ---------- */
  if (section) section.hidden = false;

  function start() {
    visit();
    connect();
    if (!section) return;
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (en, obs) {
        if (!en[0].isIntersecting) return;
        obs.disconnect();
        map.init();
        loadStats();
      }, { rootMargin: '600px 0px' }).observe(section);
    } else { map.init(); loadStats(); }
    setInterval(function () { if (!document.hidden && map.visible && map.visible()) loadStats(); }, 60000);
  }
  if (document.readyState === 'complete') setTimeout(start, 800);
  else window.addEventListener('load', function () { setTimeout(start, 800); });
})();
