/* Break the rack: the About cards turn into a pool table. Type `break`, or triple-click the 🎱 card. */
(function () {
  'use strict';
  var RW = window.RW;
  if (!RW) return;

  var life = RW.$('#about .life');
  if (!life) return;
  var cards = RW.$$('.life-card', life);
  var eightCard = cards.filter(function (c) { return /🎱/.test(c.textContent); })[0];

  // Ball 1 rides the Mile A Day card, Eagles get the green 6, the 🎱 card gets the 8.
  var COLORS = { 1: '#f5c518', 2: '#1f4fd8', 3: '#d8262e', 4: '#5b2a86', 5: '#f07b1c', 6: '#11804a', 7: '#7a1a24', 8: '#111111' };
  var RACK = [1, 9, 2, 10, 8, 3, 11, 7, 14, 4, 5, 13, 15, 6, 12]; // apex → back row, 8 dead centre
  var CARD_BALLS = [1, 6, 4, 8, 3, 5];
  var LIGHT = norm3(-0.42, -0.58, 0.7), HALF = norm3(-0.42, -0.58, 1.7);

  var busy = false, raf = 0, st = null;

  function norm3(x, y, z) { var l = Math.sqrt(x * x + y * y + z * z); return [x / l, y / l, z / l]; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function ease(t) { t = clamp(t, 0, 1); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function easeOut(t) { t = clamp(t, 0, 1); return 1 - Math.pow(1 - t, 3); }
  function hexRgb(h) { var n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }

  /* ---------- Balls: per-pixel shaded sprites that actually roll ---------- */
  function makeBall(n, r, dpr) {
    var size = Math.ceil(r * 2 * dpr) + 2, c = document.createElement('canvas');
    c.width = c.height = size;
    return {
      n: n, r: r, x: 0, y: 0, vx: 0, vy: 0, px: null, py: null, alpha: 1, scale: 1,
      state: 'table', m: [1, 0, 0, 0, 1, 0, 0, 0, 1], dirty: true,
      cv: c, cx: c.getContext('2d'), size: size,
      rgb: n === 0 ? [244, 240, 228] : hexRgb(COLORS[n > 8 ? n - 8 : n]), stripe: n > 8
    };
  }

  function roll(b, dx, dy) {
    var d = Math.sqrt(dx * dx + dy * dy);
    if (d < 1e-3) return;
    var ang = d / b.r, ax = -dy / d, ay = dx / d, c = Math.cos(ang), s = Math.sin(ang), t = 1 - c, m = b.m;
    // Rodrigues rotation about (ax, ay, 0), applied to each local axis (columns of m)
    var r00 = c + ax * ax * t, r01 = ax * ay * t, r02 = ay * s;
    var r10 = ax * ay * t, r11 = c + ay * ay * t, r12 = -ax * s;
    var r20 = -ay * s, r21 = ax * s, r22 = c;
    for (var k = 0; k < 9; k += 3) {
      var x = m[k], y = m[k + 1], z = m[k + 2];
      m[k] = r00 * x + r01 * y + r02 * z; m[k + 1] = r10 * x + r11 * y + r12 * z; m[k + 2] = r20 * x + r21 * y + r22 * z;
    }
    // keep it orthonormal
    var l = Math.sqrt(m[6] * m[6] + m[7] * m[7] + m[8] * m[8]); m[6] /= l; m[7] /= l; m[8] /= l;
    var dp = m[0] * m[6] + m[1] * m[7] + m[2] * m[8];
    m[0] -= dp * m[6]; m[1] -= dp * m[7]; m[2] -= dp * m[8];
    l = Math.sqrt(m[0] * m[0] + m[1] * m[1] + m[2] * m[2]); m[0] /= l; m[1] /= l; m[2] /= l;
    m[3] = m[7] * m[2] - m[8] * m[1]; m[4] = m[8] * m[0] - m[6] * m[2]; m[5] = m[6] * m[1] - m[7] * m[0];
    b.dirty = true;
  }

  function paintBall(b, dpr) {
    var S = b.size, R = b.r * dpr, half = S / 2, img = b.cx.createImageData(S, S), d = img.data, m = b.m;
    var white = [246, 243, 234], base = b.rgb, i, j, p = 0;
    for (j = 0; j < S; j++) {
      var y = (j + 0.5 - half) / R;
      for (i = 0; i < S; i++, p += 4) {
        var x = (i + 0.5 - half) / R, d2 = x * x + y * y;
        if (d2 >= 1.04) { d[p + 3] = 0; continue; }
        var z = Math.sqrt(Math.max(0, 1 - d2));
        var ly = m[3] * x + m[4] * y + m[5] * z, lz = m[6] * x + m[7] * y + m[8] * z;
        var col = base;
        if (b.n === 0) col = lz > 0.97 || lz < -0.97 ? [91, 143, 249] : base; // RW-blue measle dots
        else if (lz > 0.87) col = white; // number spot
        else if (b.stripe && Math.abs(ly) > 0.5) col = white;
        var dif = Math.max(0, x * LIGHT[0] + y * LIGHT[1] + z * LIGHT[2]);
        var spec = Math.pow(Math.max(0, x * HALF[0] + y * HALF[1] + z * HALF[2]), 60);
        var sh = (0.3 + 0.78 * dif) * (0.78 + 0.22 * z);
        d[p] = Math.min(255, col[0] * sh + 255 * spec * 0.9);
        d[p + 1] = Math.min(255, col[1] * sh + 255 * spec * 0.9);
        d[p + 2] = Math.min(255, col[2] * sh + 255 * spec * 0.9);
        d[p + 3] = 255 * clamp((1 - Math.sqrt(d2)) * R + 0.5, 0, 1);
      }
    }
    var g = b.cx;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.putImageData(img, 0, 0);
    if (b.n && m[8] > 0.12) {
      // project the spot's tangent plane: the number tilts and squashes as the ball turns
      var k = R / 100;
      g.setTransform(m[0] * k, m[1] * k, m[3] * k, m[4] * k, half + m[6] * R, half + m[7] * R);
      g.globalAlpha = Math.min(1, m[8] * 2.2) * 0.92;
      g.fillStyle = '#121212';
      g.font = '800 ' + (b.n > 9 ? 40 : 46) + 'px Inter, system-ui, sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(String(b.n), 0, 3);
      g.globalAlpha = 1;
      g.setTransform(1, 0, 0, 1, 0, 0);
    }
    b.dirty = false;
  }

  /* ---------- Table ---------- */
  function layout(W, H) {
    var lr = life.getBoundingClientRect(), portrait = W < H * 0.9;
    var maxH = Math.max(320, innerHeight - 130);
    var th = Math.min(H, maxH), tw = W;
    if (portrait) th = Math.min(th, tw * 2.3);
    else tw = Math.min(tw, th * 2.4);
    // centre the table on the part of the grid you can actually see
    var visTop = clamp(76 - lr.top, 0, H), visBot = clamp(innerHeight - lr.top, 0, H);
    var cy = visBot > visTop ? (visTop + visBot) / 2 : H / 2;
    var ty = clamp(cy - th / 2, 0, H - th), tx = (W - tw) / 2;
    var rail = clamp(Math.min(tw, th) * 0.05, 14, 30);
    var fx = tx + rail, fy = ty + rail, fw = tw - rail * 2, fh = th - rail * 2;
    var short = Math.min(fw, fh), long = Math.max(fw, fh);
    var r = clamp(Math.min(short / 27, long / 50), 7, 17);
    return { tx: tx, ty: ty, tw: tw, th: th, rail: rail, fx: fx, fy: fy, fw: fw, fh: fh, r: r, portrait: portrait,
      ux: portrait ? 0 : 1, uy: portrait ? -1 : 0, L: long };
  }

  function pockets(t) {
    var r = t.r, o = r * 0.35, pc = r * 1.75, ps = r * 1.55, mx = t.fx + t.fw / 2, my = t.fy + t.fh / 2;
    var list = [
      { x: t.fx - o, y: t.fy - o, pr: pc }, { x: t.fx + t.fw + o, y: t.fy - o, pr: pc },
      { x: t.fx - o, y: t.fy + t.fh + o, pr: pc }, { x: t.fx + t.fw + o, y: t.fy + t.fh + o, pr: pc }
    ];
    if (t.portrait) list.push({ x: t.fx - r * 0.7, y: my, pr: ps, side: 1 }, { x: t.fx + t.fw + r * 0.7, y: my, pr: ps, side: 1 });
    else list.push({ x: mx, y: t.fy - r * 0.7, pr: ps, side: 1 }, { x: mx, y: t.fy + t.fh + r * 0.7, pr: ps, side: 1 });
    return list;
  }

  function rrect(g, x, y, w, h, rad) {
    g.beginPath();
    g.moveTo(x + rad, y); g.arcTo(x + w, y, x + w, y + h, rad); g.arcTo(x + w, y + h, x, y + h, rad);
    g.arcTo(x, y + h, x, y, rad); g.arcTo(x, y, x + w, y, rad); g.closePath();
  }

  function paintTable(t, W, H, dpr) {
    var c = document.createElement('canvas'), g = c.getContext('2d');
    c.width = Math.round(W * dpr); c.height = Math.round(H * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    // rail: dark navy with a hairline of brand blue
    rrect(g, t.tx, t.ty, t.tw, t.th, 18);
    var rg = g.createLinearGradient(0, t.ty, 0, t.ty + t.th);
    rg.addColorStop(0, '#16203a'); rg.addColorStop(1, '#0a0f1d');
    g.fillStyle = rg; g.fill();
    g.strokeStyle = 'rgba(141,178,255,.35)'; g.lineWidth = 1; g.stroke();
    // felt: deep RW blue, lit from above, vignette at the cushions
    var cx = t.fx + t.fw / 2, cy = t.fy + t.fh / 2;
    var fg = g.createRadialGradient(cx, cy, 0, cx, cy, Math.max(t.fw, t.fh) * 0.62);
    fg.addColorStop(0, '#1b4cb4'); fg.addColorStop(0.55, '#14398a'); fg.addColorStop(1, '#091d4a');
    g.fillStyle = fg; g.fillRect(t.fx, t.fy, t.fw, t.fh);
    // felt grain
    var nz = document.createElement('canvas'); nz.width = nz.height = 96;
    var nx = nz.getContext('2d'), id = nx.createImageData(96, 96);
    for (var i = 0; i < id.data.length; i += 4) { var v = Math.random() * 255; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 14; }
    nx.putImageData(id, 0, 0);
    g.save(); g.beginPath(); g.rect(t.fx, t.fy, t.fw, t.fh); g.clip();
    g.fillStyle = g.createPattern(nz, 'repeat'); g.fillRect(t.fx, t.fy, t.fw, t.fh);
    // cushion shadow
    g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = t.r * 1.2;
    g.lineWidth = t.r; g.strokeStyle = '#000';
    g.strokeRect(t.fx - t.r / 2, t.fy - t.r / 2, t.fw + t.r, t.fh + t.r);
    g.restore();
    // head string + foot spot
    var hx = cx - t.ux * t.L / 4, hy = cy - t.uy * t.L / 4, fsx = cx + t.ux * t.L / 4, fsy = cy + t.uy * t.L / 4;
    g.strokeStyle = 'rgba(255,255,255,.08)'; g.lineWidth = 1; g.beginPath();
    if (t.portrait) { g.moveTo(t.fx, hy); g.lineTo(t.fx + t.fw, hy); } else { g.moveTo(hx, t.fy); g.lineTo(hx, t.fy + t.fh); }
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,.22)'; g.beginPath(); g.arc(fsx, fsy, 2, 0, 7); g.fill();
    g.beginPath(); g.arc(hx, hy, 2, 0, 7); g.fill();
    // diamonds on the rails
    g.fillStyle = 'rgba(141,178,255,.55)';
    for (var k = 1; k < 8; k++) {
      if (k === 4) continue;
      var a = t.fx + t.fw * k / 8, b = t.fy + t.fh * k / 8;
      dia(g, a, t.ty + t.rail / 2); dia(g, a, t.ty + t.th - t.rail / 2);
      dia(g, t.tx + t.rail / 2, b); dia(g, t.tx + t.tw - t.rail / 2, b);
    }
    // pockets
    pockets(t).forEach(function (p) {
      var pg = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.pr);
      pg.addColorStop(0, '#000'); pg.addColorStop(0.75, '#020409'); pg.addColorStop(1, '#0c1222');
      g.fillStyle = pg; g.beginPath(); g.arc(p.x, p.y, p.pr, 0, 7); g.fill();
      g.strokeStyle = 'rgba(141,178,255,.25)'; g.lineWidth = 1; g.stroke();
    });
    return c;
  }
  function dia(g, x, y) { g.beginPath(); g.moveTo(x, y - 3); g.lineTo(x + 2, y); g.lineTo(x, y + 3); g.lineTo(x - 2, y); g.closePath(); g.fill(); }

  /* ---------- Physics ---------- */
  function step(dt) {
    var t = st.t, balls = st.balls, i, j, b, o;
    var fric = t.L * 0.16, cushion = 0.74, cm = t.r * 2.3, sm = t.r * 1.5;
    var mx = t.fx + t.fw / 2, my = t.fy + t.fh / 2;
    for (i = 0; i < balls.length; i++) {
      b = balls[i];
      if (b.state === 'sinking') {
        b.sink += dt / 0.28;
        b.x += (b.pocket.x - b.x) * Math.min(1, dt * 18); b.y += (b.pocket.y - b.y) * Math.min(1, dt * 18);
        b.scale = Math.max(0, 1 - b.sink * 0.75); b.alpha = 1 - b.sink * 0.6;
        if (b.sink >= 1) { b.state = 'sunk'; b.alpha = 0; }
        continue;
      }
      if (b.state !== 'table') continue;
      var sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
      if (sp > 0) {
        var ns = Math.max(0, sp - (fric + sp * 0.08) * dt * st.drag);
        b.vx *= ns / sp; b.vy *= ns / sp;
      }
      b.x += b.vx * dt; b.y += b.vy * dt;
      // cushions, except across the pocket mouths
      var r = b.r, L = t.fx + r, Rt = t.fx + t.fw - r, T = t.fy + r, B = t.fy + t.fh - r;
      var nearCornerX = b.x < t.fx + cm || b.x > t.fx + t.fw - cm, nearCornerY = b.y < t.fy + cm || b.y > t.fy + t.fh - cm;
      var sideX = !t.portrait && Math.abs(b.x - mx) < sm, sideY = t.portrait && Math.abs(b.y - my) < sm;
      if (b.x < L && !nearCornerY && !sideY) { b.x = L; b.vx = -b.vx * cushion; b.vy *= 0.97; }
      if (b.x > Rt && !nearCornerY && !sideY) { b.x = Rt; b.vx = -b.vx * cushion; b.vy *= 0.97; }
      if (b.y < T && !nearCornerX && !sideX) { b.y = T; b.vy = -b.vy * cushion; b.vx *= 0.97; }
      if (b.y > B && !nearCornerX && !sideX) { b.y = B; b.vy = -b.vy * cushion; b.vx *= 0.97; }
      // pockets
      var best = null, bd = 1e9;
      for (j = 0; j < st.pockets.length; j++) {
        var p = st.pockets[j], dx = b.x - p.x, dy = b.y - p.y, dd = Math.sqrt(dx * dx + dy * dy);
        if (dd < bd) { bd = dd; best = p; }
      }
      var out = b.x < t.fx - r * 0.3 || b.x > t.fx + t.fw + r * 0.3 || b.y < t.fy - r * 0.3 || b.y > t.fy + t.fh + r * 0.3;
      if (bd < best.pr * 0.92 || out) {
        b.state = 'sinking'; b.sink = 0; b.pocket = best; b.vx = b.vy = 0;
        st.sunk.push(b.n);
      }
    }
    // ball–ball: equal-mass elastic impulse + positional correction
    for (i = 0; i < balls.length; i++) {
      b = balls[i];
      if (b.state !== 'table') continue;
      for (j = i + 1; j < balls.length; j++) {
        o = balls[j];
        if (o.state !== 'table') continue;
        var nx = o.x - b.x, ny = o.y - b.y, d2 = nx * nx + ny * ny, min = b.r + o.r;
        if (d2 >= min * min || d2 === 0) continue;
        var dist = Math.sqrt(d2); nx /= dist; ny /= dist;
        var push = (min - dist) / 2;
        b.x -= nx * push; b.y -= ny * push; o.x += nx * push; o.y += ny * push;
        var vn = (b.vx - o.vx) * nx + (b.vy - o.vy) * ny;
        if (vn <= 0) continue;
        var jn = vn * (1 + 0.95) / 2;
        b.vx -= jn * nx; b.vy -= jn * ny; o.vx += jn * nx; o.vy += jn * ny;
      }
    }
  }

  function settled() {
    for (var i = 0; i < st.balls.length; i++) {
      var b = st.balls[i];
      if (b.state === 'sinking') return false;
      if (b.state === 'table' && b.vx * b.vx + b.vy * b.vy > 36) return false;
    }
    return true;
  }

  /* ---------- Drawing ---------- */
  function drawBall(g, b) {
    if (b.alpha <= 0.01 || b.scale <= 0.01) return;
    if (b.px !== null) roll(b, b.x - b.px, b.y - b.py);
    b.px = b.x; b.py = b.y;
    if (b.dirty) paintBall(b, st.dpr);
    var s = b.r * b.scale, sz = b.size / st.dpr * b.scale;
    g.globalAlpha = b.alpha * (b.state === 'sinking' ? 0.5 : 0.4);
    var sg = g.createRadialGradient(b.x + s * 0.25, b.y + s * 0.4, 0, b.x + s * 0.25, b.y + s * 0.4, s * 1.25);
    sg.addColorStop(0, 'rgba(0,0,0,.9)'); sg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = sg; g.beginPath(); g.arc(b.x + s * 0.25, b.y + s * 0.4, s * 1.25, 0, 7); g.fill();
    g.globalAlpha = b.alpha;
    g.drawImage(b.cv, b.x - sz / 2, b.y - sz / 2, sz, sz);
    g.globalAlpha = 1;
  }

  function drawCue(g, a) {
    var t = st.t, cb = st.cue, ux = t.ux, uy = t.uy, gap = a.gap, len = Math.min(t.L * 0.55, 420);
    var x0 = cb.x - ux * (cb.r + gap), y0 = cb.y - uy * (cb.r + gap), x1 = x0 - ux * len, y1 = y0 - uy * len;
    var px = -uy, py = ux, w0 = Math.max(3, t.r * 0.3), w1 = Math.max(6, t.r * 0.68);
    g.save();
    g.globalAlpha = a.alpha;
    g.shadowColor = 'rgba(0,0,0,.5)'; g.shadowBlur = 10; g.shadowOffsetX = 4; g.shadowOffsetY = 6;
    var lg = g.createLinearGradient(x0, y0, x1, y1);
    lg.addColorStop(0, '#e9edf7'); lg.addColorStop(0.03, '#e9edf7'); lg.addColorStop(0.031, '#d9c7a3');
    lg.addColorStop(0.62, '#c8a46b'); lg.addColorStop(0.63, '#0d111b'); lg.addColorStop(0.8, '#5b8ff9'); lg.addColorStop(0.81, '#0d111b'); lg.addColorStop(1, '#06080d');
    g.fillStyle = lg;
    g.beginPath();
    g.moveTo(x0 + px * w0 / 2, y0 + py * w0 / 2); g.lineTo(x1 + px * w1 / 2, y1 + py * w1 / 2);
    g.lineTo(x1 - px * w1 / 2, y1 - py * w1 / 2); g.lineTo(x0 - px * w0 / 2, y0 - py * w0 / 2); g.closePath();
    g.fill();
    g.restore();
  }

  function frame(now) {
    raf = 0;
    if (!st) return;
    var dt = Math.min(1 / 30, (now - (st.last || now)) / 1000);
    st.last = now;
    var el = now - st.t0, g = st.g, t = st.t, i, b;
    g.setTransform(st.dpr, 0, 0, st.dpr, 0, 0);
    g.clearRect(0, 0, st.W, st.H);

    var bgA = st.phase === 'return' ? 1 - clamp((now - st.retAt - 450) / 650, 0, 1) : clamp(el / 420, 0, 1);
    g.globalAlpha = bgA;
    g.drawImage(st.bg, 0, 0, st.W, st.H);
    g.globalAlpha = 1;

    if (st.phase === 'rack') {
      st.balls.forEach(function (b) {
        if (b.card) {
          var k = ease((el - 80 - b.order * 70) / 760), s = b.start;
          var arc = Math.sin(k * Math.PI) * 26;
          b.x = s.x + (b.home.x - s.x) * k + (-t.uy) * arc * (b.order % 2 ? 1 : -1);
          b.y = s.y + (b.home.y - s.y) * k + t.ux * arc * (b.order % 2 ? 1 : -1);
          b.scale = 1 + (1 - easeOut((el - b.order * 70) / 500)) * 1.6;
          b.alpha = clamp((el - b.order * 70) / 220, 0, 1);
          b.px = b.x; b.py = b.y; // flying, not rolling: numbers stay face up
        } else if (b.n) {
          b.x = b.home.x; b.y = b.home.y; b.px = b.x; b.py = b.y;
          var f = clamp((el - 650 - b.order * 35) / 300, 0, 1);
          b.alpha = f; b.scale = 0.6 + 0.4 * easeOut(f);
        }
      });
      if (el > 1450) { st.phase = 'cue'; st.cueAt = now; }
    }

    if (st.phase === 'cue' || st.phase === 'sim') {
      var ce = now - st.cueAt, cb = st.cue;
      if (st.phase === 'cue') {
        cb.alpha = clamp(ce / 220, 0, 1); cb.scale = 0.6 + 0.4 * easeOut(ce / 220);
        var gap, alpha = clamp(ce / 250, 0, 1);
        if (ce < 300) gap = t.r * (7 - 5 * easeOut(ce / 300));
        else if (ce < 820) gap = t.r * (2 + 3.5 * ease((ce - 300) / 520));
        else gap = t.r * 5.5 * (1 - clamp((ce - 820) / 80, 0, 1));
        st.stick = { gap: gap, alpha: alpha };
        if (ce >= 900) {
          cb.vx = t.ux * st.v0 + -t.uy * st.aim; cb.vy = t.uy * st.v0 + t.ux * st.aim;
          st.phase = 'sim'; st.simAt = now; st.stickOff = now;
        }
      }
      if (st.phase === 'sim') {
        var se = (now - st.simAt) / 1000;
        st.drag = se > 6 ? 1 + (se - 6) * 12 : 1;
        var n = 14;
        for (i = 0; i < n; i++) step(dt / n);
        var so = (now - st.stickOff) / 1000;
        if (so < 0.4) st.stick = { gap: -t.r * 0.3 + so * t.r * 6, alpha: 1 - so / 0.4 }; else st.stick = null;
        if ((se > 0.6 && settled()) || se > 7) {
          st.balls.forEach(function (b) { b.vx = b.vy = 0; });
          finish(now);
        }
      }
    }

    if (st.phase === 'return') {
      var re = now - st.retAt;
      st.balls.forEach(function (b) {
        if (!b.card) { b.alpha = Math.min(b.alpha, 1 - clamp(re / 380, 0, 1)); return; }
        if (b.state === 'sunk' || b.state === 'sinking') {
          b.state = 'back'; b.x = b.pocket.x; b.y = b.pocket.y; b.px = b.x; b.py = b.y; b.from = { x: b.x, y: b.y };
        }
        if (!b.from) b.from = { x: b.x, y: b.y };
        var start = 120 + b.order * 95, k = ease((re - start) / 680), e = b.card;
        b.x = b.from.x + (b.home2.x - b.from.x) * k; b.y = b.from.y + (b.home2.y - b.from.y) * k;
        if (k >= 1) {
          if (e.classList.contains('pool-hide')) { e.style.setProperty('--pd', '0s'); e.classList.remove('pool-hide'); }
          var pe = clamp((re - start - 680) / 260, 0, 1);
          b.scale = 1 + pe * 1.5; b.alpha = 1 - pe;
        } else if (b.state === 'back') {
          var f = clamp((re - start + 260) / 260, 0, 1); // pops back up out of the pocket
          b.scale = easeOut(f); b.alpha = f;
        }
      });
      if (re > 120 + 5 * 95 + 680 + 650) { cleanup(); return; }
    }

    // pocket-bound balls under the rest, stick on top
    for (i = 0; i < st.balls.length; i++) { b = st.balls[i]; if (b.state === 'sinking') drawBall(g, b); }
    for (i = 0; i < st.balls.length; i++) { b = st.balls[i]; if (b.state !== 'sinking') drawBall(g, b); }
    if (st.stick) drawCue(g, st.stick);
    raf = requestAnimationFrame(frame);
  }

  function finish(now) {
    var sunk = st.sunk.filter(function (n) { return n !== 0; }).length;
    var eight = st.sunk.indexOf(8) > -1, scratch = st.sunk.indexOf(0) > -1, msg;
    if (eight && scratch) msg = '8 on the break… and a scratch. That\'s a loss in APA. Brutal. 💀';
    else if (eight) { msg = '8 on the break — that\'s a win in APA 🏆'; RW.party(); }
    else if (scratch) msg = 'Scratch' + (sunk ? ' (after sinking ' + sunk + ')' : '') + '. Rob would never.';
    else if (!sunk) msg = 'Dry break. Even Top Dawgs have those nights.';
    else if (sunk === 1) msg = 'One down on the break. Solid start. 🎱';
    else msg = 'Sunk ' + sunk + ' on the break. Top Dawgs material 🎱';
    RW.toast(msg);
    RW.egg('pool');
    st.phase = 'hold';
    st.holdTimer = setTimeout(function () {
      if (!st) return;
      // card positions may have shifted (fonts, scroll bars) — re-read them
      var lr = life.getBoundingClientRect();
      st.balls.forEach(function (b) { if (b.card) b.home2 = center(b.card, lr); });
      st.phase = 'return'; st.retAt = performance.now();
    }, 1100);
  }

  function center(el, lr) {
    var r = el.getBoundingClientRect();
    return { x: r.left - lr.left + r.width / 2, y: r.top - lr.top + r.height / 2 };
  }

  /* ---------- Start / stop ---------- */
  function start() {
    if (busy) return false;
    if (RW.reduceMotion) {
      RW.toast('Racked \'em. (Skipping the break — reduced motion is on.) 🎱');
      RW.egg('pool');
      return true;
    }
    busy = true;
    var lr = life.getBoundingClientRect(), W = lr.width, H = lr.height, dpr = Math.min(2, window.devicePixelRatio || 1);
    var t = layout(W, H);
    var cv = document.createElement('canvas');
    cv.className = 'pool-canvas'; cv.setAttribute('aria-hidden', 'true');
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
    st = { W: W, H: H, dpr: dpr, t: t, cv: cv, g: cv.getContext('2d'), bg: paintTable(t, W, H, dpr), balls: [], sunk: [],
      pockets: pockets(t), phase: 'rack', t0: performance.now(), last: 0, drag: 1, iw: innerWidth,
      v0: t.L * (3.3 + Math.random() * 0.5), aim: (Math.random() - 0.5) * t.r * 0.5 };

    // rack: apex on the foot spot, rows stacked along the table's long axis
    var cx = t.fx + t.fw / 2, cy = t.fy + t.fh / 2, ax = cx + t.ux * t.L / 4, ay = cy + t.uy * t.L / 4;
    var gap = t.r * 2.004, row = gap * Math.sqrt(3) / 2, idx = 0, homes = {};
    for (var rI = 0; rI < 5; rI++) {
      for (var k = 0; k <= rI; k++) {
        var off = (k - rI / 2) * gap + (Math.random() - 0.5) * 0.3;
        homes[RACK[idx++]] = { x: ax + t.ux * rI * row - t.uy * off, y: ay + t.uy * rI * row + t.ux * off };
      }
    }
    var order = 0;
    for (var n = 1; n <= 15; n++) {
      var b = makeBall(n, t.r, dpr);
      b.home = homes[n]; b.x = b.home.x; b.y = b.home.y; b.alpha = 0;
      var ci = CARD_BALLS.indexOf(n);
      if (ci > -1 && cards[ci]) { b.card = cards[ci]; b.order = ci; b.start = center(cards[ci], lr); b.x = b.start.x; b.y = b.start.y; }
      else b.order = order++;
      st.balls.push(b);
    }
    var cue = makeBall(0, t.r, dpr);
    cue.x = cx - t.ux * t.L / 4; cue.y = cy - t.uy * t.L / 4; cue.alpha = 0; cue.order = 99;
    st.cue = cue; st.balls.push(cue);

    life.classList.add('pooling');
    life.appendChild(cv);
    void cv.offsetWidth;
    cv.classList.add('on');
    cards.forEach(function (c, i) { c.style.setProperty('--pd', (i * 0.05) + 's'); c.classList.add('pool-hide'); });
    raf = requestAnimationFrame(frame);
    return true;
  }

  function cleanup() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    if (st) {
      clearTimeout(st.holdTimer);
      if (st.cv.parentNode) st.cv.parentNode.removeChild(st.cv);
    }
    st = null;
    cards.forEach(function (c) { c.classList.remove('pool-hide'); });
    // let the pop-in transitions finish before handing the cards their own hover styles back
    setTimeout(function () {
      if (busy) return;
      life.classList.remove('pooling');
      cards.forEach(function (c) { c.style.removeProperty('--pd'); });
    }, 700);
    busy = false;
  }

  function abort() {
    if (!busy) return;
    cleanup();
    life.classList.remove('pooling');
    cards.forEach(function (c) { c.style.removeProperty('--pd'); });
  }

  window.addEventListener('keydown', function (e) { if (busy && e.key === 'Escape') abort(); }, true);
  window.addEventListener('resize', function () { if (busy && st && innerWidth !== st.iw) abort(); });

  /* ---------- Triggers ---------- */
  RW.commands['break'] = function () {
    if (busy) { RW.print('Already breaking. It\'s a game of inches — be patient.', 'warn'); return; }
    RW.print('Racking \'em up… 🎱', 'ok');
    RW.print('<span class="dim">(Esc to put the cue down)</span>', 'dim');
    life.scrollIntoView({ behavior: RW.reduceMotion ? 'auto' : 'smooth', block: 'center' });
    // wait for the smooth scroll to land, then break
    var t0 = performance.now(), lastTop = null, still = 0;
    (function wait(now) {
      var top = life.getBoundingClientRect().top;
      still = lastTop !== null && Math.abs(top - lastTop) < 0.5 ? still + 1 : 0;
      lastTop = top;
      if (still > 6 || now - t0 > 2000) { start(); return; }
      requestAnimationFrame(wait);
    })(t0);
  };
  RW.commands.rack = RW.commands.pool = RW.commands['break'];

  if (eightCard) {
    eightCard.classList.add('pool-card');
    eightCard.title = 'Rack \'em? (triple-click)';
    var taps = [];
    eightCard.addEventListener('mousedown', function (e) { if (e.detail > 1) e.preventDefault(); }); // no paragraph selection
    eightCard.addEventListener('click', function () {
      var now = Date.now();
      taps = taps.filter(function (t) { return now - t < 900; });
      taps.push(now);
      if (taps.length >= 3) {
        taps = [];
        if (window.getSelection) window.getSelection().removeAllRanges();
        start();
      }
    });
  }
})();
