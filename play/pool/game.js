/* 8-ball vs the CPU: drawing, controls and turn flow. Physics lives in physics.js, rules and the CPU in brain.js.
   Opened from the site's game modal (js/site.js); tells the parent page about wins so it can hand out the
   achievement. */
(function () {
  'use strict';
  var P = window.Pool8Physics, B = window.Pool8Brain;
  var W = P.W, H = P.H, R = P.R, D = P.D, RAIL = 4.6;
  var $ = function (s) { return document.querySelector(s); };
  var cv = $('#table'), g = cv.getContext('2d');
  var parentRW = null;
  try { parentRW = window.parent !== window && window.parent.RW; } catch (e) {}

  function store(k, v) {
    try {
      if (v === undefined) return JSON.parse(localStorage.getItem(k));
      localStorage.setItem(k, JSON.stringify(v));
    } catch (e) {}
    return null;
  }
  function tell(msg) { try { if (window.parent !== window) window.parent.postMessage(Object.assign({ rw: true }, msg), location.origin); } catch (e) {} }

  /* ---------- State ---------- */
  var level = store('rw-pool-level') || 'medium';
  var records = store('rw-pool-record') || {};
  var game = null, mode = 'menu'; // menu | aim | roll | cpu | over
  var aim = 0, power = 0, spin = { x: 0, y: 0 }, called = null, calledByHand = false;
  var ev = null, pre = null, shotCalled = null, acc = 0, last = 0, breaker = 0;
  var cpu = null; // { it, shot, t, from, place, start }
  var falling = []; // balls dropping into pockets, for the animation
  var dragging = null; // 'cue' | 'aim' | 'power' | 'pad'
  var view = { k: 10, e: 0, f: 0, port: false, dpr: 1, cw: 0, ch: 0 };
  var sprites = {}, bg = null, dirtyAll = true, warp = 1; // warp: tests fast-forward the table

  /* ---------- Layout: the table fits the stage, landscape or (on tall screens) portrait ---------- */
  function layout() {
    var dpr = Math.min(2, window.devicePixelRatio || 1), cw = cv.clientWidth, ch = cv.clientHeight;
    var port = ch > cw * 1.05;
    document.body.classList.toggle('port', port); document.body.classList.toggle('land', !port);
    var oW = W + 2 * RAIL, oH = H + 2 * RAIL, pad = 8, gl = port ? 0 : 66, gb = port ? 70 : 0;
    var aw = cw - gl - pad * 2, ah = ch - gb - pad * 2;
    var k = port ? Math.min(aw / oH, ah / oW) : Math.min(aw / oW, ah / oH);
    var tw = (port ? oH : oW) * k, th = (port ? oW : oH) * k;
    var ox = gl + pad + (aw - tw) / 2, oy = pad + (ah - th) / 2;
    view = { k: k, port: port, dpr: dpr, cw: cw, ch: ch, e: ox + k * RAIL, f: port ? oy + k * (W + RAIL) : oy + k * RAIL };
    cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
    bg = paintTable(); sprites = {}; dirtyAll = true;
  }
  function toScreen(x, y) { return view.port ? { x: view.e + view.k * y, y: view.f - view.k * x } : { x: view.e + view.k * x, y: view.f + view.k * y }; }
  function toTable(sx, sy) { return view.port ? { x: (view.f - sy) / view.k, y: (sx - view.e) / view.k } : { x: (sx - view.e) / view.k, y: (sy - view.f) / view.k }; }
  function tableXform(c) { // canvas transform that draws in table inches
    var k = view.k * view.dpr, e = view.e * view.dpr, f = view.f * view.dpr;
    if (view.port) c.setTransform(0, -k, k, 0, e, f); else c.setTransform(k, 0, 0, k, e, f);
  }
  function screenDir(dx, dy) { return view.port ? { x: dy, y: -dx } : { x: dx, y: dy }; }

  /* ---------- The table: rails, felt and pockets, painted once per resize ---------- */
  function feltRGB() {
    var c = parentRW && parentRW.tc && parentRW.tc.blue;
    return c || [91, 143, 249];
  }
  function rgb(c, k, a) { return 'rgba(' + c.map(function (v) { return Math.round(Math.min(255, v * k)); }).join(',') + ',' + (a == null ? 1 : a) + ')'; }
  function paintTable() {
    var c = document.createElement('canvas'); c.width = cv.width; c.height = cv.height;
    var x = c.getContext('2d'), f = feltRGB();
    tableXform(x);
    // rails: dark wood with a satin highlight
    var wood = x.createLinearGradient(0, -RAIL, 0, H + RAIL);
    wood.addColorStop(0, '#3a2416'); wood.addColorStop(0.5, '#24160d'); wood.addColorStop(1, '#3a2416');
    rr(x, -RAIL, -RAIL, W + 2 * RAIL, H + 2 * RAIL, 3.2); x.fillStyle = wood; x.fill();
    rr(x, -RAIL + 0.35, -RAIL + 0.35, W + 2 * RAIL - 0.7, H + 2 * RAIL - 0.7, 2.9); x.strokeStyle = 'rgba(255,220,180,.12)'; x.lineWidth = 0.3; x.stroke();
    // cushions (slightly darker felt) then the bed
    x.fillStyle = rgb(f, 0.36);
    x.fillRect(-1.6, -1.6, W + 3.2, H + 3.2);
    var bed = x.createRadialGradient(W / 2, H / 2, 4, W / 2, H / 2, W * 0.62);
    bed.addColorStop(0, rgb(f, 0.6)); bed.addColorStop(1, rgb(f, 0.4));
    x.fillStyle = bed; x.fillRect(0, 0, W, H);
    // cushion noses and jaws as a lighter edge
    x.strokeStyle = rgb(f, 0.75, 0.55); x.lineWidth = 0.18; x.lineCap = 'round';
    P.SEGS.forEach(function (s) { x.beginPath(); x.moveTo(s.x1, s.y1); x.lineTo(s.x2, s.y2); x.stroke(); });
    // pockets
    P.POCKETS.forEach(function (p) {
      var h = hole(p), cx = h.x, cy = h.y;
      var gr = x.createRadialGradient(cx, cy, 0.2, cx, cy, 2.35);
      gr.addColorStop(0, '#000'); gr.addColorStop(0.75, '#050505'); gr.addColorStop(1, '#1b1b1b');
      x.beginPath(); x.arc(cx, cy, 2.35, 0, Math.PI * 2); x.fillStyle = gr; x.fill();
    });
    // diamonds
    x.fillStyle = 'rgba(240,230,210,.75)';
    for (var i = 1; i < 8; i++) if (i !== 4) { dia(x, W * i / 8, -RAIL / 2); dia(x, W * i / 8, H + RAIL / 2); }
    for (var j = 1; j < 4; j++) { dia(x, -RAIL / 2, H * j / 4); dia(x, W + RAIL / 2, H * j / 4); }
    // head string and foot spot
    x.strokeStyle = 'rgba(255,255,255,.07)'; x.lineWidth = 0.12; x.setLineDash([0.6, 0.6]);
    x.beginPath(); x.moveTo(P.HEAD_X, 0); x.lineTo(P.HEAD_X, H); x.stroke(); x.setLineDash([]);
    x.fillStyle = 'rgba(255,255,255,.18)'; x.beginPath(); x.arc(P.FOOT_X, H / 2, 0.25, 0, Math.PI * 2); x.fill();
    return c;
  }
  function hole(p) { return { x: p.side ? p.x : (p.x < W / 2 ? -0.55 : W + 0.55), y: p.side ? (p.y < H / 2 ? -0.95 : H + 0.95) : (p.y < H / 2 ? -0.55 : H + 0.55) }; }
  function rr(x, a, b, w, h, r) { x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r); x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath(); }
  function dia(x, cx, cy) { x.beginPath(); x.moveTo(cx, cy - 0.45); x.lineTo(cx + 0.3, cy); x.lineTo(cx, cy + 0.45); x.lineTo(cx - 0.3, cy); x.closePath(); x.fill(); }

  /* ---------- Balls: per-pixel shaded sprites with real numbers that roll with them ---------- */
  var COLORS = { 1: '#f5c518', 2: '#1f4fd8', 3: '#d8262e', 4: '#5b2a86', 5: '#f07b1c', 6: '#11804a', 7: '#7a1a24', 8: '#111111' };
  var LIGHT = n3(-0.42, -0.58, 0.7), HALF = n3(-0.42, -0.58, 1.7), DIG = 28, digits = {};
  function n3(x, y, z) { var l = Math.sqrt(x * x + y * y + z * z); return [x / l, y / l, z / l]; }
  function hexRgb(h) { var n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  function digitMask(n) {
    if (digits[n]) return digits[n];
    var c = document.createElement('canvas'); c.width = c.height = DIG;
    var x = c.getContext('2d'); x.fillStyle = '#000'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = '700 ' + (n > 9 ? 15 : 18) + 'px Inter, system-ui, sans-serif';
    x.fillText(String(n), DIG / 2, DIG / 2 + 1);
    var d = x.getImageData(0, 0, DIG, DIG).data, m = new Uint8Array(DIG * DIG);
    for (var i = 0; i < m.length; i++) m[i] = d[i * 4 + 3];
    return (digits[n] = m);
  }
  function spriteFor(b) {
    var s = sprites[b.n];
    if (!s) {
      var size = Math.ceil(R * 2 * view.k * view.dpr) + 2, c = document.createElement('canvas');
      c.width = c.height = size;
      s = sprites[b.n] = { cv: c, cx: c.getContext('2d'), size: size, m: (b.m = b.m || [1, 0, 0, 0, 1, 0, 0, 0, 1]), dirty: true,
        rgb: b.n === 0 ? [244, 240, 228] : hexRgb(COLORS[b.n > 8 ? b.n - 8 : b.n]), stripe: b.n > 8, mask: b.n ? digitMask(b.n) : null };
    }
    return s;
  }
  function roll(b, dx, dy) { // rotate the ball's frame by a screen-space roll of (dx, dy) inches
    var d = Math.sqrt(dx * dx + dy * dy);
    if (d < 1e-4) return;
    var s0 = spriteFor(b), m = s0.m;
    var ang = d / R, ax = -dy / d, ay = dx / d, c = Math.cos(ang), s = Math.sin(ang), t = 1 - c;
    var r00 = c + ax * ax * t, r01 = ax * ay * t, r02 = ay * s, r10 = ax * ay * t, r11 = c + ay * ay * t, r12 = -ax * s, r20 = -ay * s, r21 = ax * s, r22 = c;
    for (var k = 0; k < 9; k += 3) {
      var x = m[k], y = m[k + 1], z = m[k + 2];
      m[k] = r00 * x + r01 * y + r02 * z; m[k + 1] = r10 * x + r11 * y + r12 * z; m[k + 2] = r20 * x + r21 * y + r22 * z;
    }
    var l = Math.sqrt(m[6] * m[6] + m[7] * m[7] + m[8] * m[8]); m[6] /= l; m[7] /= l; m[8] /= l;
    var dp = m[0] * m[6] + m[1] * m[7] + m[2] * m[8];
    m[0] -= dp * m[6]; m[1] -= dp * m[7]; m[2] -= dp * m[8];
    l = Math.sqrt(m[0] * m[0] + m[1] * m[1] + m[2] * m[2]); m[0] /= l; m[1] /= l; m[2] /= l;
    m[3] = m[7] * m[2] - m[8] * m[1]; m[4] = m[8] * m[0] - m[6] * m[2]; m[5] = m[6] * m[1] - m[7] * m[0];
    s0.dirty = true;
  }
  function paint(b) {
    var sp = spriteFor(b);
    if (!sp.dirty && !dirtyAll) return sp;
    var S = sp.size, Rp = R * view.k * view.dpr, half = S / 2, img = sp.cx.createImageData(S, S), d = img.data, m = sp.m;
    var white = [246, 243, 234], base = sp.rgb, ink = [20, 20, 24], p = 0, mask = sp.mask, SPOT = 0.8, rad = Math.sqrt(1 - SPOT * SPOT);
    for (var j = 0; j < S; j++) {
      var y = (j + 0.5 - half) / Rp;
      for (var i = 0; i < S; i++, p += 4) {
        var x = (i + 0.5 - half) / Rp, d2 = x * x + y * y;
        if (d2 >= 1.04) { d[p + 3] = 0; continue; }
        var z = Math.sqrt(Math.max(0, 1 - d2));
        var lx = m[0] * x + m[1] * y + m[2] * z, ly = m[3] * x + m[4] * y + m[5] * z, lz = m[6] * x + m[7] * y + m[8] * z;
        var col = base;
        if (b.n === 0) col = (lz > 0.96 || lz < -0.96 || lx > 0.96 || lx < -0.96) ? [196, 40, 40] : base; // measle-style dots
        else if (lz > SPOT || lz < -SPOT) {
          col = white;
          var u = (lz > 0 ? lx : -lx) / rad, v = ly / rad;
          var mi = Math.floor((u * 0.5 + 0.5) * DIG), mj = Math.floor((v * 0.5 + 0.5) * DIG);
          if (mi >= 0 && mi < DIG && mj >= 0 && mj < DIG && mask[mj * DIG + mi] > 110) col = ink;
        } else if (sp.stripe && Math.abs(ly) > 0.5) col = white;
        var dif = Math.max(0, x * LIGHT[0] + y * LIGHT[1] + z * LIGHT[2]);
        var spec = Math.pow(Math.max(0, x * HALF[0] + y * HALF[1] + z * HALF[2]), 60);
        var sh = (0.32 + 0.76 * dif) * (0.78 + 0.22 * z);
        d[p] = Math.min(255, col[0] * sh + 255 * spec * 0.9);
        d[p + 1] = Math.min(255, col[1] * sh + 255 * spec * 0.9);
        d[p + 2] = Math.min(255, col[2] * sh + 255 * spec * 0.9);
        d[p + 3] = d2 > 1 ? Math.round(255 * (1.04 - d2) / 0.04) : 255;
      }
    }
    sp.cx.putImageData(img, 0, 0);
    sp.dirty = false;
    return sp;
  }

  /* ---------- Sound: synthesized clacks, thuds and drops ---------- */
  var AC = null, muted = !!store('rw-pool-mute'), lastFx = {};
  function audio() {
    if (AC || muted) return;
    try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { AC = null; }
  }
  function fx(type, v) {
    if (!AC || muted) return;
    var now = AC.currentTime;
    if (lastFx[type] && now - lastFx[type] < 0.03) return;
    lastFx[type] = now;
    var vol = Math.min(1, (v || 100) / 260);
    if (vol < 0.04) return;
    var o = AC.createOscillator(), gn = AC.createGain(), fl = AC.createBiquadFilter();
    var len = type === 'ball' ? 0.05 : type === 'cue' ? 0.06 : type === 'pocket' ? 0.22 : 0.09;
    o.type = type === 'pocket' || type === 'rail' || type === 'jaw' ? 'sine' : 'triangle';
    o.frequency.setValueAtTime(type === 'ball' ? 2600 : type === 'cue' ? 1400 : type === 'pocket' ? 140 : 220, now);
    if (type === 'pocket') o.frequency.exponentialRampToValueAtTime(60, now + len);
    fl.type = 'lowpass'; fl.frequency.value = type === 'ball' ? 6000 : 1200;
    gn.gain.setValueAtTime(0.0001, now);
    gn.gain.exponentialRampToValueAtTime((type === 'pocket' ? 0.5 : 0.32) * vol + 0.0002, now + 0.004);
    gn.gain.exponentialRampToValueAtTime(0.0001, now + len);
    o.connect(fl); fl.connect(gn); gn.connect(AC.destination);
    o.start(now); o.stop(now + len + 0.02);
  }

  /* ---------- HUD ---------- */
  var msgEl = $('#msg'), msgTimer = 0;
  function say(text, tone, sticky) {
    msgEl.textContent = text; msgEl.className = tone || '';
    clearTimeout(msgTimer);
    if (!sticky) msgTimer = setTimeout(function () { prompt(); }, 2600);
  }
  function prompt() { // the standing instruction for whoever's up
    if (!game || game.over) return;
    var you = game.turn === 0;
    if (!you) { say(mode === 'cpu' ? 'CPU is lining one up…' : 'CPU\'s shot', '', true); return; }
    var t = B.targets(game, 0);
    if (game.breakShot) say(game.inHand ? 'Your break. Drag the cue ball anywhere behind the line, then pull to shoot.' : 'Your break', '', true);
    else if (game.inHand) say('Ball in hand: drag the cue ball anywhere', '', true);
    else if (t.length === 1 && t[0] === 8) say(called == null ? 'On the 8: tap a pocket to call it' : 'Calling the ' + B.POCKET_NAMES[called] + '. Pull to shoot.', '', true);
    else if (game.open) say('Table\'s open: sink anything but the 8', '', true);
    else say('Your shot: ' + game.groups[0], '', true);
  }
  function hud() {
    if (!game) return;
    ['you', 'cpu'].forEach(function (who, p) {
      var grp = game.groups[p], el = $('#rack-' + who), list = grp === 'solids' ? B.SOLIDS : grp === 'stripes' ? B.STRIPES : null;
      $('#chip-' + who).classList.toggle('on', mode !== 'menu' && !game.over && game.turn === p);
      $('#' + who + '-group').textContent = grp ? grp.toUpperCase() : '';
      if (mode === 'menu') { el.innerHTML = ''; return; }
      if (!list) { el.innerHTML = '<em>' + (game.breakShot ? (p === game.turn ? 'breaking' : '') : 'open table') + '</em>'; return; }
      var left = B.left(game, p);
      el.innerHTML = list.concat([8]).map(function (n) {
        var c = COLORS[n > 8 ? n - 8 : n], gone = n === 8 ? false : left.indexOf(n) < 0, st = n > 8 ? 'background:linear-gradient(#f6f3ea 26%,' + c + ' 26% 74%,#f6f3ea 74%)' : 'background:' + c;
        return '<i data-n="' + n + '" class="' + (gone ? 'gone' : '') + '" style="' + st + '"></i>';
      }).join('');
    });
    $('#cpu-level').textContent = level.toUpperCase();
    var canShoot = mode === 'aim' && game.turn === 0;
    $('#power').classList.toggle('off', !canShoot);
  }

  /* ---------- Aim guide: where the cue ball goes and what it hits first ---------- */
  function cast(cx, cy, dx, dy) {
    var w = game.world, best = Infinity, hit = null, i;
    for (i = 0; i < w.balls.length; i++) {
      var b = w.balls[i];
      if (!b.on || b.n === 0) continue;
      var ox = b.x - cx, oy = b.y - cy, proj = ox * dx + oy * dy;
      if (proj <= 0) continue;
      var perp2 = ox * ox + oy * oy - proj * proj;
      if (perp2 >= D * D) continue;
      var t = proj - Math.sqrt(D * D - perp2);
      if (t < best) { best = t; hit = b; }
    }
    var wall = Infinity, nx = 0, ny = 0;
    if (dx > 0) { var t1 = (W - R - cx) / dx; if (t1 < wall) { wall = t1; nx = -1; ny = 0; } }
    if (dx < 0) { var t2 = (R - cx) / dx; if (t2 < wall) { wall = t2; nx = 1; ny = 0; } }
    if (dy > 0) { var t3 = (H - R - cy) / dy; if (t3 < wall) { wall = t3; nx = 0; ny = -1; } }
    if (dy < 0) { var t4 = (R - cy) / dy; if (t4 < wall) { wall = t4; nx = 0; ny = 1; } }
    if (hit && best <= wall) return { ball: hit, t: best, x: cx + dx * best, y: cy + dy * best };
    return { ball: null, t: wall, x: cx + dx * wall, y: cy + dy * wall, nx: nx, ny: ny };
  }
  function predictPocket(b, dx, dy) { // the pocket the object ball is headed for, if any
    var best = null, bd = 2.6;
    P.POCKETS.forEach(function (p) {
      var ox = p.ax - b.x, oy = p.ay - b.y, proj = ox * dx + oy * dy;
      if (proj <= 0) return;
      var perp = Math.abs(ox * dy - oy * dx);
      if (perp < bd) { bd = perp; best = p.i; }
    });
    return best;
  }

  /* ---------- Drawing ---------- */
  function draw() {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, cv.width, cv.height);
    if (bg) g.drawImage(bg, 0, 0);
    if (!game) return;
    var w = game.world, k = view.k, dpr = view.dpr, c = P.cue(w);
    // pocket highlight for the called 8
    if (game.turn === 0 && mode === 'aim' && onEight(0)) {
      tableXform(g);
      P.POCKETS.forEach(function (p) {
        var h = hole(p);
        g.beginPath(); g.arc(h.x, h.y, 2.6, 0, Math.PI * 2);
        g.lineWidth = called === p.i ? 0.35 : 0.2; g.strokeStyle = called === p.i ? '#f2c14e' : 'rgba(255,255,255,.22)'; g.stroke();
      });
    }
    // guide (yours only)
    if (game.turn === 0 && mode === 'aim' && c.on) guide(c);
    // shadows, then balls (drawn in screen space so the light stays put when the table is rotated)
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    w.balls.forEach(function (b) {
      if (!b.on) return;
      var s = toScreen(b.x, b.y);
      g.fillStyle = 'rgba(0,0,0,.32)';
      g.beginPath(); g.ellipse(s.x + R * k * 0.28, s.y + R * k * 0.34, R * k * 1.02, R * k * 0.9, 0, 0, Math.PI * 2); g.fill();
    });
    falling.forEach(function (f) { drawBall(f.b, f.x, f.y, 1 - f.t * 0.7, 1 - f.t); });
    w.balls.forEach(function (b) { if (b.on) { var s = toScreen(b.x, b.y); drawBall(b, s.x, s.y, 1, 1); } });
    dirtyAll = false;
    // ball in hand ring
    if (game.turn === 0 && mode === 'aim' && game.inHand && c.on) {
      var cs = toScreen(c.x, c.y), pulse = 0.5 + 0.5 * Math.sin(performance.now() / 260);
      g.beginPath(); g.arc(cs.x, cs.y, R * k * (1.45 + pulse * 0.25), 0, Math.PI * 2);
      g.strokeStyle = 'rgba(255,255,255,' + (0.35 + pulse * 0.3) + ')'; g.lineWidth = 2; g.stroke();
    }
    // cue stick: yours while aiming, the CPU's while it lines up
    if (mode === 'aim' && game.turn === 0 && c.on) stick(c, aim, power);
    if (mode === 'cpu' && cpu && cpu.shot && cpu.t > 0) stick(c, cpu.angle, cpu.pull);
  }
  function drawBall(b, sx, sy, scale, alpha) {
    var sp = paint(b), size = sp.size / view.dpr * scale;
    g.globalAlpha = alpha;
    g.drawImage(sp.cv, sx - size / 2, sy - size / 2, size, size);
    g.globalAlpha = 1;
  }
  function onEight(p) { var t = B.targets(game, p); return !game.breakShot && t.length === 1 && t[0] === 8; }
  function guide(c) {
    var dx = Math.cos(aim), dy = Math.sin(aim), h = cast(c.x, c.y, dx, dy), legal = B.targets(game, 0);
    tableXform(g);
    g.lineCap = 'round';
    g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = 0.14;
    g.beginPath(); g.moveTo(c.x + dx * R, c.y + dy * R); g.lineTo(h.x, h.y); g.stroke();
    if (h.ball) {
      var bad = !game.breakShot && legal.indexOf(h.ball.n) < 0;
      g.beginPath(); g.arc(h.x, h.y, R, 0, Math.PI * 2);
      g.strokeStyle = bad ? 'rgba(255,107,107,.95)' : 'rgba(255,255,255,.85)'; g.lineWidth = 0.13; g.stroke();
      if (bad) { // an X: you'd foul
        g.beginPath(); g.moveTo(h.x - 0.6, h.y - 0.6); g.lineTo(h.x + 0.6, h.y + 0.6); g.moveTo(h.x + 0.6, h.y - 0.6); g.lineTo(h.x - 0.6, h.y + 0.6); g.stroke();
        return;
      }
      var nx = (h.ball.x - h.x) / D, ny = (h.ball.y - h.y) / D, full = dx * nx + dy * ny;
      g.strokeStyle = 'rgba(255,255,255,.6)'; g.lineWidth = 0.12;
      g.beginPath(); g.moveTo(h.ball.x + nx * R, h.ball.y + ny * R); g.lineTo(h.ball.x + nx * (R + 3 + 11 * full), h.ball.y + ny * (R + 3 + 11 * full)); g.stroke();
      var tx = dx - full * nx, ty = dy - full * ny, tl = Math.sqrt(tx * tx + ty * ty);
      if (tl > 0.05) {
        g.strokeStyle = 'rgba(255,255,255,.3)';
        g.beginPath(); g.moveTo(h.x, h.y); g.lineTo(h.x + tx / tl * (2 + 6 * tl), h.y + ty / tl * (2 + 6 * tl)); g.stroke();
      }
      if (h.ball.n === 8 && onEight(0) && !calledByHand) called = predictPocket(h.ball, nx, ny);
    } else {
      var rx = dx, ry = dy;
      if (h.nx) rx = -dx; if (h.ny) ry = -dy;
      g.strokeStyle = 'rgba(255,255,255,.3)'; g.lineWidth = 0.12;
      g.beginPath(); g.moveTo(h.x, h.y); g.lineTo(h.x + rx * 7, h.y + ry * 7); g.stroke();
      g.beginPath(); g.arc(h.x, h.y, R, 0, Math.PI * 2); g.strokeStyle = 'rgba(255,255,255,.4)'; g.stroke();
    }
  }
  function stick(c, ang, pull) {
    var dx = Math.cos(ang), dy = Math.sin(ang), gap = R + 0.5 + pull * 9;
    var tipX = c.x - dx * gap, tipY = c.y - dy * gap, len = 58;
    var s0 = toScreen(tipX, tipY), s1 = toScreen(tipX - dx * len, tipY - dy * len), k = view.k;
    g.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    var ux = s1.x - s0.x, uy = s1.y - s0.y, ul = Math.sqrt(ux * ux + uy * uy); ux /= ul; uy /= ul;
    var px = -uy, py = ux;
    function seg(a, b, w0, w1, fill) {
      var ax = s0.x + ux * a * k, ay = s0.y + uy * a * k, bx = s0.x + ux * b * k, by = s0.y + uy * b * k;
      g.beginPath();
      g.moveTo(ax + px * w0 * k, ay + py * w0 * k); g.lineTo(bx + px * w1 * k, by + py * w1 * k);
      g.lineTo(bx - px * w1 * k, by - py * w1 * k); g.lineTo(ax - px * w0 * k, ay - py * w0 * k); g.closePath();
      g.fillStyle = fill; g.fill();
    }
    g.fillStyle = 'rgba(0,0,0,.28)'; // shadow
    g.save(); g.translate(R * k * 0.3, R * k * 0.4); seg(0, len, 0.27, 0.6, 'rgba(0,0,0,.25)'); g.restore();
    seg(0, 0.35, 0.25, 0.26, '#5b8ff9');   // chalked tip
    seg(0.35, 1.2, 0.26, 0.27, '#f2efe6'); // ferrule
    seg(1.2, 36, 0.27, 0.42, '#e3c793');   // maple shaft
    seg(36, 40, 0.42, 0.45, '#e9e4d8');    // joint
    seg(40, len, 0.45, 0.6, '#3a1d12');    // butt
    seg(54, len, 0.58, 0.6, '#111');       // bumper
  }

  /* ---------- Turn flow ---------- */
  function newGame() {
    game = B.newGame();
    game.turn = breaker; breaker = 1 - breaker;
    aim = 0; power = 0; called = null; calledByHand = false; falling = []; spin = { x: 0, y: 0 }; spinUI();
    sprites = {}; dirtyAll = true;
    game.world.balls.forEach(function (b) { delete b.m; });
    // randomise each ball's starting orientation so the rack doesn't look stamped
    game.world.balls.forEach(function (b) { roll(b, Math.random() * 6 - 3, Math.random() * 6 - 3); });
    $('#menu').hidden = true; $('#over').hidden = true;
    beginTurn();
  }
  function beginTurn() {
    hud();
    if (game.over) return gameOver();
    var c = P.cue(game.world);
    if (game.inHand && !P.free(game.world, c.x, c.y, c)) settle(c);
    called = null; calledByHand = false; power = 0; setPower(0);
    if (game.turn === 0) {
      mode = 'aim';
      if (game.breakShot) aim = 0; else aimAtNearest();
      prompt();
    } else {
      mode = 'cpu';
      cpu = { it: B.plan(game, level), shot: null, t: 0 };
      prompt();
    }
    hud();
  }
  function settle(c) { // find a free spot for the cue ball near where it is
    for (var r = 0; r < 30; r += 0.5) for (var a = 0; a < 12; a++) {
      var x = c.x + Math.cos(a / 12 * Math.PI * 2) * r, y = c.y + Math.sin(a / 12 * Math.PI * 2) * r;
      if ((!game.kitchen || x <= P.HEAD_X) && P.free(game.world, x, y, c)) { c.x = x; c.y = y; return; }
    }
  }
  function aimAtNearest() {
    var c = P.cue(game.world), best = null, bd = 1e9;
    B.targets(game, game.turn).forEach(function (n) { var b = P.find(game.world, n); var d = Math.hypot(b.x - c.x, b.y - c.y); if (d < bd) { bd = d; best = b; } });
    if (best) aim = Math.atan2(best.y - c.y, best.x - c.x);
  }

  function shoot(angle, pw, sx, sy, call) {
    var c = P.cue(game.world);
    if (!c.on) return;
    pre = B.targets(game, game.turn); shotCalled = call;
    var speed = game.breakShot ? 30 + Math.pow(pw, 1.15) * 360 : 6 + Math.pow(pw, 1.25) * 300;
    if (cpu && cpu.shot) speed = cpu.shot.speed;
    P.strike(game.world, angle, speed, sx, sy);
    ev = P.newEvents(); ev.fx = fx;
    fx('cue', speed);
    mode = 'roll'; acc = 0;
    game.inHand = false; game.kitchen = game.breakShot;
    hud();
    say(game.turn === 0 ? '' : 'CPU shoots', '', true);
  }

  function afterShot() {
    var who = game.turn, res = B.judge(game, ev, pre, shotCalled), name = who === 0 ? 'You' : 'CPU';
    ev = null;
    if (game.over) { hud(); return setTimeout(gameOver, 700); }
    var parts = [];
    if (res.assigned) parts.push(who === 0 ? 'You\'re ' + res.assigned + '.' : 'CPU takes ' + res.assigned + ' — you\'re ' + game.groups[0] + '.');
    if (res.foul) parts.push('Foul: ' + res.foul.toLowerCase() + '. ' + (who === 0 ? 'CPU has ball in hand.' : 'Ball in hand for you.'));
    else if (res.keep) parts.push(who === 0 ? pick(['Nice.', 'Good shot.', 'Clean.', 'Keep going.']) : 'CPU makes one.');
    else if (!res.foul) parts.push(who === 0 ? 'Missed. CPU\'s turn.' : 'CPU misses. Your shot.');
    say(parts.join(' '), res.foul ? (who === 0 ? 'bad' : 'good') : (res.keep ? (who === 0 ? 'good' : '') : ''));
    setTimeout(beginTurn, game.turn === who && !res.foul ? 250 : 650);
    hud();
  }
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }

  function gameOver() {
    mode = 'over';
    var won = game.winner === 0, rec = records[level] || { w: 0, l: 0 };
    if (won) rec.w++; else rec.l++;
    records[level] = rec; store('rw-pool-record', records); recUI();
    var why = (game.lastWhy || '');
    $('#over-title').innerHTML = won ? 'YOU <span style="color:var(--blue)">WIN</span>' : 'CPU <span style="color:var(--bad)">WINS</span>';
    $('#over-why').textContent = (why ? why + '. ' : '') + (won ? (level === 'hard' ? 'On Hard, too. Rob\'s impressed.' : 'Try it on ' + (level === 'easy' ? 'Medium' : 'Hard') + '?') : 'Rack \'em again?') + ' (' + level + ': ' + rec.w + '–' + rec.l + ')';
    $('#over').hidden = false;
    hud();
    if (won) tell({ type: 'egg', id: 'eightball' });
    $('#again').focus();
  }

  /* ---------- The loop ---------- */
  function frame(now) {
    var dt = Math.min(0.05, (now - (last || now)) / 1000); last = now;
    if (mode === 'roll' && game) {
      acc += dt * warp;
      var w = game.world, before = w.balls.map(function (b) { return { x: b.x, y: b.y, on: b.on }; });
      while (acc >= P.DT) { P.step(w, ev); acc -= P.DT; }
      w.balls.forEach(function (b, i) {
        var o = before[i];
        if (o.on && !b.on) {
          var p = P.POCKETS[b.pocket], s = toScreen(o.x, o.y), t = toScreen(p.x, p.y);
          falling.push({ b: b, x: s.x, y: s.y, tx: t.x, ty: t.y, t: 0 });
          if (b.n !== 0) hud();
        }
        if (b.on && (b.x !== o.x || b.y !== o.y)) { var sd = screenDir(b.x - o.x, b.y - o.y); roll(b, sd.x, sd.y); }
      });
      if (!P.moving(w) && !falling.length) { mode = 'judge'; afterShot(); }
    }
    falling = falling.filter(function (f) {
      f.t += dt * warp / 0.3; f.x += (f.tx - f.x) * Math.min(1, dt * 14); f.y += (f.ty - f.y) * Math.min(1, dt * 14);
      return f.t < 1;
    });
    if (mode === 'cpu' && game && !game.over) cpuTick(dt);
    draw();
    requestAnimationFrame(frame);
  }

  // The CPU thinks across frames, then visibly lines up: cue ball (if it has it in hand), aim, pull back, stroke.
  function cpuTick(dt) {
    if (!cpu.shot) {
      var t0 = performance.now(), r;
      while (performance.now() - t0 < 7) { r = cpu.it.next(); if (r.done) break; }
      if (!r || !r.done) return;
      cpu.shot = r.value; cpu.t = 0; cpu.angle = aimFrom(); cpu.from = cpu.angle; cpu.pull = 0;
      var c = P.cue(game.world);
      cpu.cfrom = { x: c.x, y: c.y };
      return;
    }
    cpu.t += dt * warp;
    var s = cpu.shot, c2 = P.cue(game.world), T1 = s.place ? 0.7 : 0, T2 = T1 + 0.8, T3 = T2 + 0.55;
    if (s.place) {
      var k = ease(cpu.t / T1);
      c2.x = cpu.cfrom.x + (s.place.x - cpu.cfrom.x) * k; c2.y = cpu.cfrom.y + (s.place.y - cpu.cfrom.y) * k;
      if (cpu.t < T1) return;
    }
    var a = ease((cpu.t - T1) / (T2 - T1));
    cpu.angle = cpu.from + angDiff(cpu.from, s.angle) * a;
    var pl = s.speed / 300;
    cpu.pull = cpu.t < T2 ? 0 : Math.min(1, pl) * ease((cpu.t - T2) / (T3 - T2 - 0.12));
    if (cpu.t >= T3) {
      if (s.place) { c2.x = s.place.x; c2.y = s.place.y; }
      shoot(s.angle, 0, s.ex, s.ey, s.called);
      cpu = null;
    }
  }
  function aimFrom() { var c = P.cue(game.world); var best = null, bd = 1e9; game.world.balls.forEach(function (b) { if (b.on && b.n) { var d = Math.hypot(b.x - c.x, b.y - c.y); if (d < bd) { bd = d; best = b; } } }); return best ? Math.atan2(best.y - c.y, best.x - c.x) : 0; }
  function angDiff(a, b) { var d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; }
  function ease(t) { t = Math.max(0, Math.min(1, t)); return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

  /* ---------- Input ---------- */
  function local(e) { var r = cv.getBoundingClientRect(); return toTable(e.clientX - r.left, e.clientY - r.top); }
  function canPlay() { return game && mode === 'aim' && game.turn === 0; }
  cv.addEventListener('pointerdown', function (e) {
    audio();
    closePop();
    if (!canPlay()) return;
    var p = local(e), c = P.cue(game.world);
    if (onEight(0)) { // tapping a pocket calls it
      for (var i = 0; i < 6; i++) {
        var pk = P.POCKETS[i];
        if (Math.hypot(p.x - pk.ax, p.y - pk.ay) < 4.2) { called = i; calledByHand = true; prompt(); return; }
      }
    }
    if (game.inHand && Math.hypot(p.x - c.x, p.y - c.y) < R * 2.6) dragging = 'cue';
    else { dragging = 'aim'; aimAt(p); }
    cv.setPointerCapture(e.pointerId);
  });
  cv.addEventListener('pointermove', function (e) {
    if (!dragging || !canPlay()) return;
    var p = local(e);
    if (dragging === 'cue') moveCue(p); else if (dragging === 'aim') aimAt(p);
  });
  cv.addEventListener('pointerup', function () { dragging = null; });
  cv.addEventListener('pointercancel', function () { dragging = null; });
  function aimAt(p) { var c = P.cue(game.world); if (Math.hypot(p.x - c.x, p.y - c.y) > R * 0.5) aim = Math.atan2(p.y - c.y, p.x - c.x); }
  function moveCue(p) {
    var c = P.cue(game.world), x = Math.max(R, Math.min(W - R, p.x)), y = Math.max(R, Math.min(H - R, p.y));
    if (game.kitchen) x = Math.min(x, P.HEAD_X);
    if (P.free(game.world, x, y, c)) { c.x = x; c.y = y; }
  }

  // Power: drag along the bar to pull the cue back; let go to shoot.
  var pw = $('#power'), fill = pw.querySelector('.fill'), pStart = null;
  function setPower(v) {
    power = Math.max(0, Math.min(1, v));
    var land = !view.port;
    fill.style.height = land ? 'calc(' + (power * 100) + '% - ' + (power * 6) + 'px)' : '';
    fill.style.width = land ? '' : 'calc(' + (power * 100) + '% - ' + (power * 6) + 'px)';
    pw.setAttribute('aria-valuenow', Math.round(power * 100));
  }
  pw.addEventListener('pointerdown', function (e) {
    audio(); closePop();
    if (!canPlay()) return;
    var r = pw.getBoundingClientRect();
    pStart = { x: e.clientX, y: e.clientY, len: view.port ? r.width : r.height };
    dragging = 'power'; pw.setPointerCapture(e.pointerId);
  });
  pw.addEventListener('pointermove', function (e) {
    if (dragging !== 'power') return;
    var d = view.port ? e.clientX - pStart.x : e.clientY - pStart.y;
    setPower(d / (pStart.len * 0.9));
  });
  function release() {
    if (dragging !== 'power') return;
    dragging = null;
    if (power < 0.02) { setPower(0); return; }
    fire();
  }
  pw.addEventListener('pointerup', release);
  pw.addEventListener('pointercancel', function () { dragging = null; setPower(0); });
  function fire() {
    if (!canPlay()) return;
    if (onEight(0) && called == null) { say('Call your pocket first: tap where the 8 is going', 'bad'); setPower(0); return; }
    var p = power; setPower(0);
    shoot(aim, p, spin.x, spin.y, onEight(0) ? called : null);
  }

  // Spin pad
  var pop = $('#pop'), pad = $('#pad'), dot = pad.querySelector('i'), sdot = $('#spin i');
  function spinUI() {
    dot.style.left = (50 + spin.x * 40) + '%'; dot.style.top = (50 - spin.y * 40) + '%';
    sdot.style.left = (50 + spin.x * 40) + '%'; sdot.style.top = (50 - spin.y * 40) + '%';
  }
  function closePop() { pop.hidden = true; }
  $('#spin').addEventListener('click', function (e) { e.stopPropagation(); audio(); pop.hidden = !pop.hidden; });
  $('#spin-reset').addEventListener('click', function () { spin = { x: 0, y: 0 }; spinUI(); });
  function padAt(e) {
    var r = pad.getBoundingClientRect(), x = ((e.clientX - r.left) / r.width - 0.5) / 0.4, y = -((e.clientY - r.top) / r.height - 0.5) / 0.4, l = Math.sqrt(x * x + y * y);
    if (l > 1) { x /= l; y /= l; }
    spin = { x: x, y: y }; spinUI();
  }
  pad.addEventListener('pointerdown', function (e) { dragging = 'pad'; pad.setPointerCapture(e.pointerId); padAt(e); });
  pad.addEventListener('pointermove', function (e) { if (dragging === 'pad') padAt(e); });
  pad.addEventListener('pointerup', function () { dragging = null; });

  // Keyboard
  var keyPower = false;
  document.addEventListener('keydown', function (e) {
    audio();
    if (e.key === 'Escape') {
      if (!pop.hidden) { closePop(); return; }
      if (mode === 'menu' || mode === 'over') { tell({ type: 'close' }); return; }
      if (mode === 'aim' || mode === 'cpu') openMenu();
      return;
    }
    if (!canPlay()) return;
    var step = (e.shiftKey ? 2 : 0.25) * Math.PI / 180;
    if (e.key === 'ArrowLeft') { aim -= step; e.preventDefault(); }
    else if (e.key === 'ArrowRight') { aim += step; e.preventDefault(); }
    else if (e.key === 'ArrowUp') { setPower(power + 0.05); keyPower = true; e.preventDefault(); }
    else if (e.key === 'ArrowDown') { setPower(power - 0.05); keyPower = true; e.preventDefault(); }
    else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); if (power < 0.02) setPower(0.5); fire(); }
    else if (e.key === 's' || e.key === 'S') pop.hidden = !pop.hidden;
  });

  /* ---------- Menus ---------- */
  function recUI() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-rec]'), function (el) {
      var r = records[el.getAttribute('data-rec')] || { w: 0, l: 0 }; el.textContent = r.w + '–' + r.l;
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-level]'), function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-level') === level)); });
  }
  document.querySelectorAll('[data-level]').forEach(function (b) {
    b.addEventListener('click', function () { level = b.getAttribute('data-level'); store('rw-pool-level', level); recUI(); });
  });
  // Esc mid-game pauses into the menu; Resume picks up where it left off (the CPU re-thinks its shot).
  var paused = null;
  function openMenu() {
    var live = game && !game.over && (mode === 'aim' || mode === 'cpu');
    paused = live ? mode : null;
    mode = 'menu'; cpu = null; $('#over').hidden = true; $('#menu').hidden = false;
    $('#resume').hidden = !live; $('#start').textContent = live ? 'New game' : 'Rack \'em';
    recUI(); hud(); (live ? $('#resume') : $('#start')).focus();
  }
  $('#resume').addEventListener('click', function () {
    if (!paused) return;
    $('#menu').hidden = true; paused = null; beginTurn();
  });
  var muteBtn = $('#mute');
  function muteUI() { muteBtn.textContent = muted ? '🔇' : '🔊'; muteBtn.setAttribute('aria-pressed', String(!muted)); }
  muteBtn.addEventListener('click', function () { muted = !muted; store('rw-pool-mute', muted); if (!muted) audio(); muteUI(); });
  muteUI();
  $('#start').addEventListener('click', function () { audio(); newGame(); });
  $('#again').addEventListener('click', function () { newGame(); });
  $('#change').addEventListener('click', openMenu);

  // Keep the end-of-game reason around for the result card.
  var judge0 = B.judge;
  B.judge = function (gm, e, pr, cl) { var r = judge0(gm, e, pr, cl); if (r.why) gm.lastWhy = r.why; return r; };

  window.addEventListener('resize', layout);
  layout(); recUI(); spinUI();
  game = B.newGame(); hud(); // a racked table behind the menu
  requestAnimationFrame(frame);

  // For tests: a peek at the state, and a way to take a shot without fiddling with the pointer.
  window.pool8 = {
    state: function () { return { mode: mode, turn: game && game.turn, over: game && game.over, winner: game && game.winner, inHand: game && game.inHand, groups: game && game.groups, on: game ? game.world.balls.filter(function (b) { return b.on; }).length : 0 }; },
    shoot: function (angle, p, sx, sy) { if (!canPlay()) return false; aim = angle == null ? aim : angle; spin = { x: sx || 0, y: sy || 0 }; setPower(p == null ? 0.8 : p); fire(); return true; },
    start: function (lv) { if (lv) level = lv; newGame(); },
    place: function (x, y) { if (!canPlay() || !game.inHand) return false; moveCue({ x: x, y: y }); return true; },
    game: function () { return game; },
    screen: function (x, y) { var r = cv.getBoundingClientRect(), s = toScreen(x, y); return { x: r.left + s.x, y: r.top + s.y }; },
    warp: function (k) { warp = k; },
    callPocket: function (i) { called = i; calledByHand = true; }
  };
})();
