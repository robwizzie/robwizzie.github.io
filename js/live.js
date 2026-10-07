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
  var peers = {}, here = 0, stats = null, notes = [];

  /* Where this visit came from: the referrer (the Worker keeps only its host), a ?r=<tag> Rob puts on
     links he sends out (e.g. ?r=acme on an application), and any utm_ tags. Read once, then tidied
     out of the address bar so the tag doesn't travel with a shared link. */
  var origin = (function () {
    var q = {}, keys = ['r', 'ref', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
    try { new URLSearchParams(location.search).forEach(function (v, k) { q[k] = v; }); } catch (e) {}
    if (keys.some(function (k) { return q[k]; }) && window.history && history.replaceState) {
      try {
        var u = new URL(location.href);
        keys.forEach(function (k) { u.searchParams.delete(k); });
        history.replaceState(history.state, '', u.pathname + u.search + u.hash);
      } catch (e) {}
    }
    return { ref: document.referrer || '', r: q.r || q.ref || '', utm_source: q.utm_source || '', utm_medium: q.utm_medium || '', utm_campaign: q.utm_campaign || '', path: location.pathname };
  })();
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

  // Tell eggs.js the live server is really up, so the live achievements only count when they can be earned.
  var announced = false;
  function liveUp() { if (!announced) { announced = true; document.dispatchEvent(new CustomEvent('rw:live')); } }

  function setStats(s) {
    if (!s || typeof s.total !== 'number') return;
    liveUp();
    stats = s;
    paintStats();
    map.paint();
  }

  /* ---------- Visits: once per browser per day ---------- */
  function visit() {
    var v = load('rw-live') || {}, d = today();
    if (load('rw-me')) { if (v.you) setYou(v.you); return; } // Rob's own browser (set by admin.html) doesn't count
    if (v.d === d && v.id) { if (v.you) setYou(v.you); return; }
    var id = rid();
    // text/plain keeps it a "simple" request (no CORS preflight)
    var body = { id: id };
    for (var k in origin) body[k] = origin[k];
    getJSON(BASE + '/visit', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(body) })
      .then(function (s) {
        save('rw-live', { d: d, id: id, you: s.you || null });
        setYou(s.you);
        setStats(s);
      })
      .catch(function () {});
  }

  function loadStats() { getJSON(BASE + '/stats').then(setStats).catch(function () {}); }

  /* ---------- Who's here: device hints + prefs ---------- */
  var DEV = { phone: '📱 on a phone', tablet: '📱 on a tablet', desktop: '💻 on a computer' };
  var myDevice = (function () {
    if (finePointer) return 'desktop';
    var s = Math.min(screen.width || 0, screen.height || 0);
    return window.matchMedia('(pointer: coarse)').matches ? (s && s < 600 ? 'phone' : 'tablet') : 'desktop';
  })();
  var showCursors = load('rw-live-cursors') !== false;
  var MAX_SHOW = 6, CALM_AT = 7, IDLE_MS = 7000, NOTE_GAP = 20000;
  function others() { return Math.max(0, here - 1); }
  function calm() { return here >= CALM_AT; }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many || one + 's'); }
  var HEXS = '<svg viewBox="0 0 24 26" aria-hidden="true"><polygon points="12,1.5 22,7 22,19 12,24.5 2,19 2,7" style="fill:var(--blue)" stroke="#fff" stroke-width="2" stroke-linejoin="round"/></svg>';

  /* ---------- Presence pill + the "Here now" panel ---------- */
  var pillEl = null, secBtn = null, panel = null, panelFrom = null;
  function pill(n) {
    if (!pillEl) {
      if (n < 2) return;
      pillEl = document.createElement('button');
      pillEl.className = 'lv-pill';
      pillEl.type = 'button';
      pillEl.setAttribute('aria-haspopup', 'dialog');
      pillEl.setAttribute('aria-expanded', 'false');
      pillEl.setAttribute('aria-controls', 'lv-here');
      pillEl.innerHTML = '<i aria-hidden="true"></i><span></span><svg class="lv-chev" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 7.5 6 4.5 9 7.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      pillEl.addEventListener('click', function () { togglePanel(pillEl); });
      document.body.appendChild(pillEl);
      if (map.visible && map.visible()) pillEl.classList.add('away');
      void pillEl.offsetWidth;
    }
    pillEl.children[1].textContent = n + ' people here now';
    pillEl.title = 'Live: everyone on this site right now. Tap to see who.';
    pillEl.setAttribute('aria-label', n + ' people are on this site right now. Show who\'s here.');
    pillEl.classList.toggle('show', n > 1);
  }

  // The "N people here now" chip on the map card opens the same panel.
  function sectionButton() {
    var old = section && $('.lv-live', section);
    if (!old || old.tagName === 'BUTTON') return;
    secBtn = document.createElement('button');
    secBtn.type = 'button';
    secBtn.className = old.className + ' lv-live-btn';
    secBtn.setAttribute('aria-haspopup', 'dialog');
    secBtn.setAttribute('aria-expanded', 'false');
    secBtn.setAttribute('aria-controls', 'lv-here');
    while (old.firstChild) secBtn.appendChild(old.firstChild);
    secBtn.insertAdjacentHTML('beforeend', '<svg class="lv-chev" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>');
    old.parentNode.replaceChild(secBtn, old);
    secBtn.addEventListener('click', function () { togglePanel(secBtn); });
  }

  function buildPanel() {
    panel = document.createElement('div');
    panel.className = 'lv-here';
    panel.id = 'lv-here';
    panel.hidden = true;
    panel.tabIndex = -1;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-labelledby', 'lv-here-t');
    panel.innerHTML =
      '<div class="lv-here-hd"><i aria-hidden="true"></i><b id="lv-here-t">Here now</b><span class="lv-here-n"></span>' +
      '<button type="button" class="lv-here-x" aria-label="Close">&times;</button></div>' +
      '<p class="lv-here-what"><b>Live:</b> everyone on robwiscount.org right now. Cursors are other visitors\' mice.</p>' +
      '<ul class="lv-here-list"></ul>' +
      '<div class="lv-here-sw"><span><b id="lv-here-sw-l">Live cursors</b><small class="lv-here-sw-h"></small></span>' +
      '<button type="button" role="switch" class="lv-sw" aria-labelledby="lv-here-sw-l"><i aria-hidden="true"></i></button></div>' +
      '<a class="lv-here-gb" href="#lv-gb">Say hi in the guestbook <span aria-hidden="true">→</span></a>';
    document.body.appendChild(panel);
    $('.lv-here-x', panel).addEventListener('click', function () { closePanel(true); });
    $('.lv-sw', panel).addEventListener('click', function () { setCursors(!showCursors); });
    $('.lv-here-gb', panel).addEventListener('click', function (e) {
      var gbEl = $('#lv-gb');
      if (!gbEl) return;
      e.preventDefault();
      closePanel(false);
      gbEl.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
      setTimeout(function () { var f = $('#lv-gb-note'); if (f) f.focus({ preventScroll: true }); }, reduceMotion ? 0 : 600);
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && panel && !panel.hidden) { e.stopPropagation(); closePanel(true); } }, true);
    document.addEventListener('pointerdown', function (e) {
      if (panel.hidden || panel.contains(e.target) || (panelFrom && panelFrom.contains(e.target))) return;
      closePanel(false);
    });
    window.addEventListener('resize', placePanel);
    window.addEventListener('scroll', function () { if (!panel.hidden && panelFrom !== pillEl) placePanel(); }, { passive: true });
  }

  // Groups people by place + device so a busy minute reads "Austin, TX ×3", not 30 rows.
  function paintPanel() {
    if (!panel || panel.hidden) return;
    var n = hereCount(), groups = {}, order = [], shownN = 0, rows = '', ROWS = 5;
    $('.lv-here-n', panel).textContent = !wsOpen ? 'offline' : n === 1 ? 'just you' : n + ' people';
    rows += '<li class="me">' + HEXS + '<span><b>You</b><small>' + esc(me.place ? label(me.place) : 'here') + ' · ' + DEV[myDevice] + '</small></span></li>';
    for (var id in peers) {
      var p = peers[id], k = label(p) + '|' + (p.d || '');
      if (!groups[k]) { groups[k] = { p: p, n: 0 }; order.push(k); }
      groups[k].n++;
    }
    order.sort(function (a, b) { return groups[b].n - groups[a].n; });
    order.slice(0, ROWS).forEach(function (k) {
      var g = groups[k];
      shownN += g.n;
      rows += '<li>' + HEXS + '<span><b>' + esc(label(g.p)) + '</b><small>' + (DEV[g.p.d] || 'browsing') + '</small></span>' +
        (g.n > 1 ? '<em>&times;' + g.n + '</em>' : '') + '</li>';
    });
    var more = Math.max(0, others() - shownN);
    if (more) rows += '<li class="more">+' + more + ' more here</li>';
    if (!wsOpen) rows += '<li class="solo">Not connected to the live server right now.</li>';
    else if (n < 2) rows += '<li class="solo">Just you for now. Open this page on your phone too and watch yourself show up.</li>';
    $('.lv-here-list', panel).innerHTML = rows;
    var sw = $('.lv-sw', panel);
    sw.setAttribute('aria-checked', showCursors ? 'true' : 'false');
    var moving = 0;
    for (var cid in curs) if (Date.now() - curs[cid].last < IDLE_MS) moving++;
    $('.lv-here-sw-h', panel).textContent = !showCursors ? 'Off: you won\'t see anyone\'s cursor, and yours is hidden too.' :
      moving > MAX_SHOW ? 'Showing the ' + MAX_SHOW + ' most active · +' + (moving - MAX_SHOW) + ' more moving' :
      calm() ? 'Busy in here, so cursors go small and quiet.' :
      !finePointer ? 'People on a computer show up as little hexagons.' : 'Your mouse shows up for them as a hexagon.';
  }

  function placePanel() {
    if (!panel || panel.hidden || !panelFrom) return;
    var r = panelFrom.getBoundingClientRect(), vw = document.documentElement.clientWidth, vh = window.innerHeight;
    var w = panel.offsetWidth, s = panel.style, left = Math.max(16, Math.min(vw - w - 16, r.left));
    s.left = left + 'px';
    if (r.top > vh / 2) { s.top = 'auto'; s.bottom = Math.max(16, vh - r.top + 10) + 'px'; }
    else { s.bottom = 'auto'; s.top = Math.max(16, r.bottom + 10) + 'px'; }
  }

  function openPanel(from) {
    if (!panel) buildPanel();
    panelFrom = from;
    panel.hidden = false;
    hideHello();
    paintPanel();
    placePanel();
    [pillEl, secBtn].forEach(function (b) { if (b) b.setAttribute('aria-expanded', b === from ? 'true' : 'false'); });
    void panel.offsetWidth;
    panel.classList.add('open');
    panel.focus({ preventScroll: true });
  }
  function closePanel(refocus) {
    if (!panel || panel.hidden) return;
    var from = panelFrom;
    panel.classList.remove('open');
    panel.hidden = true;
    panelFrom = null;
    [pillEl, secBtn].forEach(function (b) { if (b) b.setAttribute('aria-expanded', 'false'); });
    if (refocus && from && from.offsetParent !== null) from.focus({ preventScroll: true });
  }
  function togglePanel(from) { if (panel && !panel.hidden && panelFrom === from) closePanel(true); else openPanel(from); }

  /* ---------- "Someone just joined you" ---------- */
  var hello = null, helloT = 0, lastHello = 0, joinQ = [], joinT = 0, greeted = false, known = null;
  function sayHello(html) {
    if (!hello) {
      hello = document.createElement('div');
      hello.className = 'lv-hello';
      hello.setAttribute('role', 'status');
      hello.innerHTML = '<span class="lv-hello-ico" aria-hidden="true">👋</span><p></p>' +
        '<button type="button" class="lv-hello-go">Who\'s here?</button><button type="button" class="lv-hello-x" aria-label="Dismiss">&times;</button>';
      document.body.appendChild(hello);
      $('.lv-hello-go', hello).addEventListener('click', function () { openPanel(pillEl && pillEl.classList.contains('show') && !pillEl.classList.contains('away') ? pillEl : hello); });
      $('.lv-hello-x', hello).addEventListener('click', hideHello);
      hello.addEventListener('mouseenter', function () { clearTimeout(helloT); });
      hello.addEventListener('mouseleave', function () { helloT = setTimeout(hideHello, 3000); });
      void hello.offsetWidth;
    }
    lastHello = Date.now();
    hello.querySelector('p').innerHTML = html;
    hello.classList.add('show');
    clearTimeout(helloT);
    helloT = setTimeout(hideHello, 7000);
  }
  function hideHello() { clearTimeout(helloT); if (hello) hello.classList.remove('show'); }

  function placeOf(p) { return p && p.city ? label(p) : p && p.country ? p.country : ''; }

  // When you arrive and others are already here.
  function greet() {
    var n = others();
    if (!n || document.hidden || (panel && !panel.hidden)) return;
    var first = null;
    for (var id in peers) { first = peers[id]; break; }
    var where = n === 1 && placeOf(first) ? ' from ' + esc(placeOf(first)) : '';
    sayHello('<b>' + (n === 1 ? 'Someone' + where + ' is here right now too' : n + ' other people are here right now') + '</b> — you\'re not alone. Say hi in the guestbook.');
  }

  // Joins wait a beat (so a burst becomes one note and devices are known), then at most one note per 20s.
  function queueJoins(ids) {
    joinQ = joinQ.concat(ids);
    if (joinT) return;
    joinT = setTimeout(flushJoins, Math.max(1500, lastHello + NOTE_GAP - Date.now()));
  }
  function flushJoins() {
    joinT = 0;
    var still = joinQ.filter(function (id, i) { return peers[id] && joinQ.indexOf(id) === i; });
    joinQ = [];
    if (!still.length || document.hidden || (panel && !panel.hidden)) return;
    var p = peers[still[0]], where = placeOf(p), dev = p.d === 'phone' || p.d === 'tablet' ? ' on their ' + p.d : '';
    if (still.length === 1) {
      sayHello('<b>Someone' + (where ? ' in ' + esc(where) : '') + ' just joined you' + dev + '</b> — you\'re not alone!');
      return;
    }
    var places = [];
    still.forEach(function (id) { var w = placeOf(peers[id]); if (w && places.indexOf(w) < 0) places.push(w); });
    var from = places.length ? ' from ' + places.slice(0, 2).map(esc).join(' and ') + (places.length > 2 ? ' and more' : '') : '';
    sayHello('<b>' + still.length + ' people just joined you</b>' + from + ' — you\'re not alone!');
  }

  /* ---------- Other people's cursors ----------
     Everyone's last position is tracked, but only the MAX_SHOW most recently moved get drawn,
     and a cursor fades out after IDLE_MS without moving. 7+ people: calm mode (small, quiet, no labels). */
  var HEX = '<svg viewBox="0 0 24 26" aria-hidden="true"><polygon points="12,1.5 22,7 22,19 12,24.5 2,19 2,7" style="fill:var(--blue)" stroke="#fff" stroke-width="2" stroke-linejoin="round"/></svg>';
  var layer = null, curs = {}, nShown = 0, rafC = 0, seenOther = false;

  function getLayer() {
    if (!layer) { layer = document.createElement('div'); layer.className = 'lv-layer'; layer.setAttribute('aria-hidden', 'true'); document.body.appendChild(layer); }
    layer.classList.toggle('calm', calm());
    return layer;
  }

  function show(c, id) {
    if (nShown >= MAX_SHOW) { // full: bump whoever has been still the longest, but never someone mid-move
      var old = null;
      for (var k in curs) if (curs[k].el && (!old || curs[k].last < old.last)) old = curs[k];
      if (!old || Date.now() - old.last < 1500) return;
      release(old);
    }
    var el = document.createElement('div');
    el.className = 'lv-cur';
    el.innerHTML = HEX + '<span></span>';
    el.lastChild.textContent = label(peers[id]);
    getLayer().appendChild(el);
    c.el = el; c.x = c.tx; c.y = c.ty;
    nShown++;
    void el.offsetWidth;
    el.classList.add('on', 'talk'); // label on first appearance only
    clearTimeout(c.t1);
    c.t1 = setTimeout(function () { el.classList.remove('talk'); }, 2500);
  }

  function release(c) {
    if (!c.el) return;
    var el = c.el;
    c.el = null; nShown--;
    clearTimeout(c.t1);
    el.classList.remove('on', 'talk', 'hover');
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, reduceMotion ? 0 : 400);
  }

  function dropCursor(id) {
    var c = curs[id];
    if (!c) return;
    clearTimeout(c.t2);
    release(c);
    delete curs[id];
  }

  function onCursor(m) {
    if (!peers[m.id] && Object.keys(curs).length >= 100) return;
    var c = curs[m.id] || (curs[m.id] = { el: null, x: m.x, y: m.y, tx: m.x, ty: m.y, last: 0, t1: 0, t2: 0 });
    c.tx = m.x; c.ty = m.y; c.last = Date.now();
    clearTimeout(c.t2);
    c.t2 = setTimeout(function () { release(c); }, IDLE_MS);
    if (!seenOther) { seenOther = true; if (RW.egg) RW.egg('live'); }
    if (!showCursors) return;
    if (!c.el) show(c, m.id);
    else if (reduceMotion) { c.x = c.tx; c.y = c.ty; }
    kick();
  }

  function hideCursor(id) { var c = curs[id]; if (c) { clearTimeout(c.t2); c.last = 0; release(c); } }

  function setCursors(on) {
    showCursors = on;
    save('rw-live-cursors', on);
    if (!on) { for (var id in curs) release(curs[id]); if (ptr && here > 1) send({ t: 'h' }); }
    else sendCursor();
    paintPanel();
  }

  function kick() { if (!rafC && nShown) rafC = requestAnimationFrame(frame); }
  function frame() {
    rafC = 0;
    var de = document.documentElement, W = de.clientWidth, H = de.scrollHeight, sy = window.pageYOffset, moving = false;
    for (var id in curs) {
      var c = curs[id];
      if (!c.el) continue;
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

  // Labels come back when you hover near someone's cursor (the layer itself never takes the mouse).
  function hoverCursors() {
    if (!nShown || !ptr) return;
    var de = document.documentElement, W = de.clientWidth, H = de.scrollHeight, sy = window.pageYOffset;
    for (var id in curs) {
      var c = curs[id];
      if (c.el) c.el.classList.toggle('hover', Math.abs(c.x * W - ptr.x) < 26 && Math.abs(c.y * H - sy - ptr.y) < 26);
    }
  }

  // My cursor: fine pointers only, ~15/s, and only when someone else is here to see it.
  var ptr = null, lastSend = 0, sendTimer = 0;
  function sendCursor() {
    if (!ptr || !wsOpen || here < 2 || !showCursors) return;
    var de = document.documentElement;
    send({ t: 'c', x: +(ptr.x / de.clientWidth).toFixed(4), y: +((ptr.y + window.pageYOffset) / de.scrollHeight).toFixed(4) });
  }
  function queue() {
    var now = Date.now();
    if (now - lastSend >= 66) { lastSend = now; sendCursor(); }
    else if (!sendTimer) sendTimer = setTimeout(function () { sendTimer = 0; lastSend = Date.now(); sendCursor(); }, 66 - (now - lastSend));
  }
  if (finePointer) {
    document.addEventListener('mousemove', function (e) { ptr = { x: e.clientX, y: e.clientY }; queue(); hoverCursors(); }, { passive: true });
    window.addEventListener('scroll', function () { if (ptr) queue(); }, { passive: true });
    document.documentElement.addEventListener('mouseleave', function () { if (ptr && here > 1 && showCursors) send({ t: 'h' }); ptr = null; });
  }

  /* ---------- WebSocket ---------- */
  var ws = null, retry = 0, retryTimer = 0, hideTimer = 0, pingTimer = 0;

  function send(m) { if (wsOpen) try { ws.send(JSON.stringify(m)); } catch (e) {} }

  function setPeers(list, n, hi) {
    peers = {};
    (list || []).forEach(function (p) { if (p && p.id && p.id !== me.id) peers[p.id] = p; });
    var ids = Object.keys(peers);
    here = Math.max(1, n || 0, ids.length + 1);
    // "Not Alone": anyone else on the site counts, so phones (which don't send a cursor) can earn it too.
    if (here > 1 && !seenOther) { seenOther = true; if (RW.egg) RW.egg('live'); }
    if (hi || !known) {
      if (!greeted) { greeted = true; setTimeout(greet, 1200); }
    } else {
      var fresh = ids.filter(function (id) { return !known[id]; });
      if (fresh.length) queueJoins(fresh);
    }
    known = {};
    ids.forEach(function (id) { known[id] = 1; });
    for (var id in curs) if (!peers[id]) dropCursor(id);
    if (layer) layer.classList.toggle('calm', calm());
    paintNow();
    paintPanel();
    map.paint();
    if (here > 1) sendCursor();
  }

  function handle(m) {
    if (!m || typeof m !== 'object') return;
    if (m.t === 'hi') { me.id = m.id; setYou(m.you); setPeers(m.peers, m.n, true); }
    else if (m.t === 'p') setPeers(m.peers, m.n);
    else if (m.t === 'c' && m.id !== me.id && typeof m.x === 'number' && typeof m.y === 'number') onCursor(m);
    else if (m.t === 'h') hideCursor(m.id);
  }

  function cleanup() {
    wsOpen = false; ws = null; here = 0; peers = {}; known = null;
    clearInterval(pingTimer);
    for (var id in curs) dropCursor(id);
    paintNow();
    paintPanel();
    map.paint();
  }

  function connect() {
    if (ws || document.hidden || !('WebSocket' in window)) return;
    clearTimeout(retryTimer); retryTimer = 0;
    try { ws = new WebSocket(WS_URL); } catch (e) { ws = null; return reconnect(); }
    ws.onopen = function () {
      wsOpen = true; retry = 0; liveUp();
      send({ t: 'd', d: myDevice }); // so the "Here now" list can say "on a phone"; older servers ignore it
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

    // Every color comes from the theme tokens (the `theme` command rewrites --blue / --blue-hi on <html>).
    // A probe element resolves var()/color-mix() to plain rgb; darker steps are --blue mixed into the surface.
    var probe = null;
    function rgbOf(expr, host) {
      if (!probe) { probe = document.createElement('i'); probe.style.display = 'none'; }
      (host || document.body).appendChild(probe);
      probe.style.color = '';
      probe.style.color = expr;
      var s = getComputedStyle(probe).color || '', n = (s.match(/[\d.]+/g) || []).map(Number);
      probe.parentNode.removeChild(probe);
      if (n.length < 3) return null;
      if (/^color\(/.test(s)) n = n.slice(0, 3).map(function (x) { return x * 255; });
      return [Math.round(n[0]), Math.round(n[1]), Math.round(n[2])];
    }
    function mix(a, b, t) { return [0, 1, 2].map(function (i) { return Math.round(b[i] + (a[i] - b[i]) * t); }); }
    function css(c, a) { return a == null ? 'rgb(' + c.join(',') + ')' : 'rgba(' + c.join(',') + ',' + a + ')'; }
    function readColors() {
      var blue = rgbOf('var(--blue)') || [91, 143, 249], hi = rgbOf('var(--blue-hi)') || [141, 178, 255];
      var surf = rgbOf('var(--surface)') || [13, 17, 27];
      // Use the card's --gh-2 only if the stylesheet derives it from the theme; otherwise mix our own.
      var raw = card ? getComputedStyle(card).getPropertyValue('--gh-2') : '';
      var l2 = /mix|var\(/.test(raw) && rgbOf('var(--gh-2)', card) || mix(blue, surf, 0.6);
      colors = { l0: css(hi, 0.13), flat: css(hi, 0.045), l1: css(mix(blue, surf, 0.28)), l2: css(l2), l3: css(blue), l4: css(hi), blue: blue, hi: hi };
    }
    function retheme() {
      var was = colors && colors.l3 + colors.l4;
      readColors();
      if (started && cols && colors.l3 + colors.l4 !== was) paint();
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
        return cells[key] || (cells[key] = { c: k.c, r: k.r, n: 0, names: [], live: 0, mine: false, notes: [] });
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
      notes.forEach(function (n) {
        if (!hasGeo(n)) return;
        var nc = at(n);
        nc.notes.push(n);
        if (!nc.names.length) nc.names.push({ name: label(n), n: 0 });
      });
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
        if (rings ? mask[r * cols + c] : (r + c) % 2 === 0) sq(g, (c + 0.5) * pitch, (r + 0.5) * pitch, s, rings ? colors.l0 : colors.flat);
      }
      for (var k in cells) {
        var cl = cells[k], x = (cl.c + 0.5) * pitch, y = (cl.r + 0.5) * pitch;
        if (cl.lvl > 2) { g.shadowColor = css(colors.blue, cl.lvl === 4 ? .9 : .5); g.shadowBlur = pitch * (cl.lvl === 4 ? 2.2 : 1.2); }
        sq(g, x, y, s * (cl.lvl === 4 ? 1.55 : cl.lvl === 3 ? 1.3 : 1.1), colors['l' + cl.lvl]);
        g.shadowBlur = 0;
        if (cl.live || cl.mine) sq(g, x, y, s * 1.3, cl.live ? '#fff' : colors.l4);
        if (cl.notes.length) { // a guestbook note was left from here: a little speech dot on the corner
          g.fillStyle = '#ffd36b'; g.beginPath(); g.arc(x + s * 0.62, y - s * 0.62, Math.max(1.6, s * 0.36), 0, Math.PI * 2); g.fill();
        }
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
        ctx.strokeStyle = cl.live ? 'rgba(255,255,255,' + (0.85 * (1 - t)) + ')' : css(colors.hi, 0.8 * (1 - t));
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

    function notesChanged() { if (started && cols) paint(); }

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
      if (best.notes.length) txt += ' · 💬 “' + best.notes[0].note.slice(0, 70) + (best.notes[0].note.length > 70 ? '…' : '') + '”';
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

    // Theme changes: eggs.js fires rw:theme; the observer catches anything else that restyles <html>.
    document.addEventListener('rw:theme', function () { retheme(); });
    if ('MutationObserver' in window) {
      var mt = 0;
      new MutationObserver(function () { cancelAnimationFrame(mt); mt = requestAnimationFrame(function () { if (started) retheme(); }); })
        .observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'data-theme', 'class'] });
    }

    return { paint: paint, init: init, notesChanged: notesChanged, visible: function () { return onScreen; } };
  })();

  /* ---------- Guestbook: notes wait for Rob's OK before anyone else sees them ---------- */
  var gb = $('#lv-gb');
  function stamp(n) { return (n.name ? esc(n.name) + ' · ' : '') + esc(label(n)) + ' · ' + ago(n.t).toLowerCase(); }
  function paintNotes() {
    var list = $('#lv-gb-list');
    if (!list) return;
    var mine = load('rw-note'), html = '';
    if (mine && mine.note && !notes.some(function (n) { return n.id === mine.id; })) {
      html += '<li class="mine"><p>' + esc(mine.note) + '</p><small>' + stamp(mine) + ' · <b>waiting for Rob to approve</b></small></li>';
    }
    html += notes.map(function (n) { return '<li><p>' + esc(n.note) + '</p><small>' + stamp(n) + '</small></li>'; }).join('');
    list.innerHTML = html || '<li class="empty"><p>No notes yet. Be the first.</p></li>';
  }
  function loadNotes() {
    getJSON(BASE + '/guestbook').then(function (d) { notes = (d && d.notes) || []; paintNotes(); map.notesChanged(); }).catch(paintNotes);
  }
  if (gb) {
    var form = $('#lv-gb-form'), msg = $('#lv-gb-msg'), btn = form && form.querySelector('button');
    if (load('rw-note') && load('rw-note').d === today()) form.classList.add('done');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var note = $('#lv-gb-note').value.trim(), name = $('#lv-gb-name').value.trim();
      if (note.length < 2) { msg.textContent = 'Say a little more than that.'; return; }
      var v = load('rw-live') || {};
      btn.disabled = true; msg.textContent = 'Signing…';
      fetch(BASE + '/guestbook', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ id: v.id || rid(), name: name, note: note }) })
        .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw d; return d; }); })
        .then(function (d) {
          var n = d.note; n.d = today();
          save('rw-note', n);
          form.reset(); form.classList.add('done');
          msg.textContent = d.status === 'ok' ? 'Signed — thanks! 👋' : 'Thanks! Your note shows up here once Rob approves it. 👋';
          if (d.status === 'ok') notes.unshift(n);
          paintNotes(); map.notesChanged();
          if (RW.egg) RW.egg('guestbook');
        })
        .catch(function (err) { msg.textContent = (err && err.error) || 'Couldn\'t reach the guestbook — try again in a minute.'; })
        .then(function () { btn.disabled = false; });
    });
  }

  /* ---------- Letterboxd: the last film Rob logged, on the movie card ---------- */
  var films = null;
  function stars(r) { return r ? new Array(Math.floor(r) + 1).join('★') + (r % 1 ? '½' : '') : ''; }
  function watched(d) {
    if (!d) return '';
    var p = d.split('-'), then = new Date(+p[0], p[1] - 1, +p[2]), now = new Date();
    var days = Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - then) / 864e5);
    return days <= 0 ? 'today' : days === 1 ? 'yesterday' : days < 7 ? days + ' days ago' : then.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  function loadFilms() {
    var card = Array.prototype.filter.call(document.querySelectorAll('.life-card'), function (c) { return /movie/i.test(c.textContent); })[0];
    getJSON(BASE + '/letterboxd').then(function (d) {
      films = (d && d.films) || [];
      var f = films[0];
      if (!card || !f) return;
      var a = document.createElement('a');
      a.className = 'lb-last'; a.href = f.url; a.target = '_blank'; a.rel = 'noopener';
      a.innerHTML = (f.poster ? '<img src="' + esc(f.poster) + '" alt="" width="34" height="51" loading="lazy" referrerpolicy="no-referrer">' : '') +
        '<span><small>Last watched' + (f.watched ? ' · ' + watched(f.watched) : '') + '</small><b>' + esc(f.title) + (f.year ? ' <i>(' + f.year + ')</i>' : '') + '</b>' +
        (f.rating ? '<em aria-label="' + f.rating + ' out of 5 stars">' + stars(f.rating) + (f.liked ? ' <span aria-label="liked">♥</span>' : '') + '</em>' : '') + '</span>';
      card.appendChild(a);
    }).catch(function () {});
  }
  if (RW.commands) {
    RW.commands.movies = RW.commands.letterboxd = function () {
      if (!films) { RW.print('Checking Letterboxd…', 'dim'); return; }
      if (!films.length) { RW.print('Letterboxd is quiet right now. <a href="https://letterboxd.com/robwizzie/" target="_blank" rel="noopener">→ letterboxd.com/robwizzie</a>'); return; }
      RW.print('🎬 Recently on Letterboxd:', 'ok');
      films.slice(0, 5).forEach(function (f) {
        RW.print('  ' + esc(f.title) + (f.year ? ' (' + f.year + ')' : '') + '  ' + stars(f.rating) + (f.rewatch ? ' ↻' : '') + (f.watched ? ' <span class="dim">— ' + watched(f.watched) + '</span>' : ''));
      });
      RW.print('<a href="https://letterboxd.com/robwizzie/" target="_blank" rel="noopener">→ letterboxd.com/robwizzie</a>');
    };
  }

  /* ---------- Terminal: who ---------- */
  if (RW.commands) {
    RW.commands.who = RW.commands.w = function () {
      if (!wsOpen) {
        RW.print('Not connected to the live server right now' + (me.place && me.place.city ? ' — but hi, ' + esc(label(me.place)) + '.' : '.'), 'dim');
        RW.print('<a href="#visitors">→ see the visitor map</a>');
        return;
      }
      var names = [];
      for (var id in peers) names.push(esc(label(peers[id])) + (peers[id].d === 'phone' ? ' 📱' : ''));
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
  if (section) { section.hidden = false; sectionButton(); }

  function start() {
    visit();
    connect();
    loadFilms();
    if (!section) return;
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (en, obs) {
        if (!en[0].isIntersecting) return;
        obs.disconnect();
        map.init();
        loadStats();
        loadNotes();
      }, { rootMargin: '600px 0px' }).observe(section);
    } else { map.init(); loadStats(); loadNotes(); }
    setInterval(function () { if (!document.hidden && map.visible && map.visible()) loadStats(); }, 60000);
  }
  if (document.readyState === 'complete') setTimeout(start, 800);
  else window.addEventListener('load', function () { setTimeout(start, 800); });
})();
