/* 8-ball physics for a 7-foot bar table, in inches and seconds. No DOM: the game and the CPU's look-ahead
   run the exact same code, so what the CPU predicts is what happens (minus the aim error it's given).

   Each ball carries its velocity v, a "roll velocity" q (the speed its spin would carry it at if it were
   rolling; q = v means pure rolling), and side spin s (surface speed of its english). The cloth drags the
   contact point until q = v (sliding to rolling: draw, follow and stun all fall out of this), then rolling
   resistance slows it. English bites the cushions. */
(function (root) {
  'use strict';

  var W = 78, H = 39, R = 1.125, D = R * 2;
  var G = 386, MU_SLIDE = 0.2, MU_ROLL = 0.011, MU_SPIN = 0.03, MU_RAIL = 0.2, E_BALL = 0.95;
  var DT = 1 / 600;
  var CC = 3.1, SM = 2.5, JX = 1.5, JY = 2.1, PC = 1.55, PR = 1.85, PS = 2.05, PSR = 1.75; // corner nose distance from the corner; half the side-pocket mouth

  // Cushions and pocket jaws as segments (the jaws angle into the throat, so near-misses rattle).
  var SEGS = [];
  function seg(x1, y1, x2, y2, jaw) { SEGS.push({ x1: x1, y1: y1, x2: x2, y2: y2, jaw: !!jaw }); }
  [[0, 1], [H, -1]].forEach(function (r) { // top and bottom rails, each split by the side pocket
    var y = r[0], o = r[1];
    seg(CC, y, W / 2 - SM, y); seg(W / 2 + SM, y, W - CC, y);
    seg(CC, y, CC - JX, y - JY * o, true); seg(W - CC, y, W - CC + JX, y - JY * o, true);
    seg(W / 2 - SM, y, W / 2 - SM - 0.35, y - 2 * o, true); seg(W / 2 + SM, y, W / 2 + SM + 0.35, y - 2 * o, true);
  });
  [[0, 1], [W, -1]].forEach(function (r) { // left and right rails
    var x = r[0], o = r[1];
    seg(x, CC, x, H - CC);
    seg(x, CC, x - JY * o, CC - JX, true); seg(x, H - CC, x - JY * o, H - CC + JX, true);
  });
  SEGS.forEach(function (s) {
    var dx = s.x2 - s.x1, dy = s.y2 - s.y1;
    s.dx = dx; s.dy = dy; s.l2 = dx * dx + dy * dy;
  });

  // Pockets: a ball whose centre gets inside r drops. aim is where the CPU sends object balls.
  var POCKETS = [
    { x: -PC, y: -PC, r: PR, ax: 0.9, ay: 0.9 }, { x: W / 2, y: -PS, r: PSR, ax: W / 2, ay: 0.2 }, { x: W + PC, y: -PC, r: PR, ax: W - 0.9, ay: 0.9 },
    { x: -PC, y: H + PC, r: PR, ax: 0.9, ay: H - 0.9 }, { x: W / 2, y: H + PS, r: PSR, ax: W / 2, ay: H - 0.2 }, { x: W + PC, y: H + PC, r: PR, ax: W - 0.9, ay: H - 0.9 }
  ];
  POCKETS.forEach(function (p, i) { p.i = i; p.side = i === 1 || i === 4; });

  var HEAD_X = W / 4, FOOT_X = W * 3 / 4; // head string (the kitchen is left of it) and foot spot

  function ball(n, x, y) { return { n: n, x: x, y: y, vx: 0, vy: 0, qx: 0, qy: 0, s: 0, on: true, pocket: -1 }; }

  // 8 in the middle, a solid and a stripe on the back corners, the rest shuffled.
  function rack(world, rnd) {
    rnd = rnd || Math.random;
    var solids = [1, 2, 3, 4, 5, 6, 7], stripes = [9, 10, 11, 12, 13, 14, 15];
    function take(a) { return a.splice(Math.floor(rnd() * a.length), 1)[0]; }
    var cornerA = take(solids), cornerB = take(stripes), rest = solids.concat(stripes), order = [];
    while (rest.length) order.push(take(rest));
    var slots = [], gap = D + 0.004, row = gap * Math.sqrt(3) / 2;
    for (var r = 0; r < 5; r++) for (var k = 0; k <= r; k++) slots.push({ r: r, x: FOOT_X + r * row, y: H / 2 + (k - r / 2) * gap });
    var flip = rnd() < 0.5, balls = [ball(0, HEAD_X, H / 2)];
    slots.forEach(function (sl, i) {
      var n = i === 4 ? 8 : i === 10 ? (flip ? cornerA : cornerB) : i === 14 ? (flip ? cornerB : cornerA) : order.pop();
      balls.push(ball(n, sl.x + (rnd() - 0.5) * 0.01, sl.y + (rnd() - 0.5) * 0.01));
    });
    world.balls = balls;
    return world;
  }

  function newWorld(rnd) { return rack({ balls: [] }, rnd); }

  function clone(w) {
    return { balls: w.balls.map(function (b) { return { n: b.n, x: b.x, y: b.y, vx: b.vx, vy: b.vy, qx: b.qx, qy: b.qy, s: b.s, on: b.on, pocket: b.pocket }; }) };
  }

  function cue(w) { for (var i = 0; i < w.balls.length; i++) if (w.balls[i].n === 0) return w.balls[i]; return null; }
  function find(w, n) { for (var i = 0; i < w.balls.length; i++) if (w.balls[i].n === n) return w.balls[i]; return null; }

  /* Strike the cue ball. angle in radians, speed in in/s, english (ex, ey) in [-1, 1]: +x right, +y top
     (follow), as fractions of the half-radius a tip can safely hit. */
  function strike(w, angle, speed, ex, ey) {
    var c = cue(w), dx = Math.cos(angle), dy = Math.sin(angle);
    var a = (ex || 0) * 0.5, b = (ey || 0) * 0.5;
    c.vx = dx * speed; c.vy = dy * speed;
    var roll = 2.5 * b; // b = 0.4 is natural roll
    c.qx = c.vx * roll; c.qy = c.vy * roll;
    c.s = -2.5 * speed * a;
  }

  function moving(w) {
    for (var i = 0; i < w.balls.length; i++) {
      var b = w.balls[i];
      if (b.on && (b.vx || b.vy || b.qx || b.qy)) return true;
    }
    return false;
  }

  /* One fixed step. ev collects what the rules need: first ball the cue touched, rails after contact,
     what dropped (in order), and optional fx(type, strength) for sounds. */
  function step(w, ev, dt) {
    dt = dt || DT;
    var balls = w.balls, n = balls.length, i, j, b, o;
    for (i = 0; i < n; i++) {
      b = balls[i];
      if (!b.on) continue;
      var vx = b.vx, vy = b.vy;
      if (vx || vy || b.qx || b.qy) {
        var ux = vx - b.qx, uy = vy - b.qy, us = Math.sqrt(ux * ux + uy * uy), f = MU_SLIDE * G * dt;
        if (us > 1e-6) {
          if (us <= 3.5 * f) { // stops sliding this step: v + 0.4q is conserved
            vx = (5 * vx + 2 * b.qx) / 7; vy = (5 * vy + 2 * b.qy) / 7; b.qx = vx; b.qy = vy;
          } else {
            ux /= us; uy /= us;
            vx -= f * ux; vy -= f * uy; b.qx += 2.5 * f * ux; b.qy += 2.5 * f * uy;
          }
        } else {
          var sp = Math.sqrt(vx * vx + vy * vy), d = MU_ROLL * G * dt + sp * 0.06 * dt;
          if (sp <= d || sp < 0.25) { vx = vy = 0; b.s = 0; } else { vx *= (sp - d) / sp; vy *= (sp - d) / sp; }
          b.qx = vx; b.qy = vy;
        }
        if (b.s) { var ds = 2.5 * MU_SPIN * G * dt; b.s = Math.abs(b.s) <= ds ? 0 : b.s - (b.s > 0 ? ds : -ds); }
        b.vx = vx; b.vy = vy;
        b.x += vx * dt; b.y += vy * dt;
      }
      if (!b.vx && !b.vy) continue;
      // pockets
      for (j = 0; j < 6; j++) {
        var p = POCKETS[j], px = b.x - p.x, py = b.y - p.y;
        if (px * px + py * py < p.r * p.r) { drop(b, j, ev); break; }
      }
      if (!b.on) continue;
      // cushions and jaws (only near the edges)
      if (b.x < 5 || b.x > W - 5 || b.y < 5 || b.y > H - 5) {
        for (j = 0; j < SEGS.length; j++) cushion(b, SEGS[j], ev);
        // well past a pocket's mouth line it can only be in the throat (or escaped): it's going down
        var lx = Math.min(b.x, W - b.x), ly = Math.min(b.y, H - b.y);
        if (lx < -0.6 || ly < -0.6 || (lx < CC && ly < CC && lx + ly < CC - 1.4) || (ly < 0.1 && Math.abs(b.x - W / 2) < SM)) drop(b, nearest(b), ev);
      }
    }
    // ball–ball, skipping pairs that are both at rest
    for (i = 0; i < n; i++) {
      b = balls[i];
      if (!b.on) continue;
      var bm = b.vx || b.vy;
      for (j = i + 1; j < n; j++) {
        o = balls[j];
        if (!o.on || (!bm && !o.vx && !o.vy)) continue;
        var nx = o.x - b.x, ny = o.y - b.y;
        if (nx > D || nx < -D || ny > D || ny < -D) continue;
        var d2 = nx * nx + ny * ny;
        if (d2 >= D * D || d2 === 0) continue;
        var dist = Math.sqrt(d2); nx /= dist; ny /= dist;
        var push = (D - dist) / 2;
        b.x -= nx * push; b.y -= ny * push; o.x += nx * push; o.y += ny * push;
        var vn = (b.vx - o.vx) * nx + (b.vy - o.vy) * ny;
        if (vn <= 0) continue;
        var jn = vn * (1 + E_BALL) / 2;
        b.vx -= jn * nx; b.vy -= jn * ny; o.vx += jn * nx; o.vy += jn * ny;
        if (ev) {
          if (ev.first == null && (b.n === 0 || o.n === 0)) ev.first = b.n === 0 ? o.n : b.n;
          if (ev.fx) ev.fx('ball', vn);
        }
      }
    }
  }

  function nearest(b) {
    var best = 0, bd = 1e9;
    POCKETS.forEach(function (p, i) { var d = (b.x - p.x) * (b.x - p.x) + (b.y - p.y) * (b.y - p.y); if (d < bd) { bd = d; best = i; } });
    return best;
  }

  function drop(b, j, ev) {
    b.on = false; b.pocket = j; b.vx = b.vy = b.qx = b.qy = b.s = 0;
    if (ev) { ev.potted.push({ n: b.n, pocket: j }); if (ev.fx) ev.fx('pocket', 1); }
  }

  function cushion(b, s, ev) {
    var t = ((b.x - s.x1) * s.dx + (b.y - s.y1) * s.dy) / s.l2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    var cx = s.x1 + s.dx * t, cy = s.y1 + s.dy * t, nx = b.x - cx, ny = b.y - cy, d2 = nx * nx + ny * ny;
    if (d2 >= R * R || d2 === 0) return;
    var dist = Math.sqrt(d2); nx /= dist; ny /= dist;
    b.x = cx + nx * R; b.y = cy + ny * R;
    var vn = b.vx * nx + b.vy * ny;
    if (vn >= 0) return;
    var tx = -ny, ty = nx, vt = b.vx * tx + b.vy * ty;
    var e = s.jaw ? 0.55 : Math.max(0.6, Math.min(0.85, 0.86 + 0.0007 * vn));
    var vn2 = -vn * e;
    // friction at the cushion: english and the ball's own slide along the rail (see header)
    var slip = vt - b.s, J = slip * 2 / 7, lim = MU_RAIL * (1 + e) * -vn;
    if (J > lim) J = lim; else if (J < -lim) J = -lim;
    vt -= J; b.s += 2.5 * J;
    b.vx = nx * vn2 + tx * vt; b.vy = ny * vn2 + ty * vt;
    // the nose sits above centre, so it kills most of the roll into the rail
    var qt = b.qx * tx + b.qy * ty;
    b.qx = nx * vn2 * 0.2 + tx * qt; b.qy = ny * vn2 * 0.2 + ty * qt;
    if (ev) {
      if (ev.first != null) ev.rail = true;
      if (b.n === 0) ev.cueRails = (ev.cueRails || 0) + 1;
      if (ev.fx) ev.fx(s.jaw ? 'jaw' : 'rail', -vn);
    }
  }

  function newEvents() { return { first: null, rail: false, potted: [], cueRails: 0 }; }

  // Run until everything stops (or maxT seconds). Returns the events.
  function simulate(w, maxT, ev) {
    ev = ev || newEvents();
    var steps = Math.ceil((maxT || 30) / DT);
    for (var k = 0; k < steps; k++) {
      step(w, ev);
      if (k % 30 === 0 && !moving(w)) break;
    }
    return ev;
  }

  // Can a ball sit here? Inside the cushions and clear of every other ball.
  function free(w, x, y, skip) {
    if (x < R || x > W - R || y < R || y > H - R) return false;
    for (var i = 0; i < w.balls.length; i++) {
      var b = w.balls[i];
      if (!b.on || b === skip) continue;
      if ((b.x - x) * (b.x - x) + (b.y - y) * (b.y - y) < D * D * 1.0001) return false;
    }
    return true;
  }

  var api = {
    W: W, H: H, R: R, D: D, DT: DT, HEAD_X: HEAD_X, FOOT_X: FOOT_X, POCKETS: POCKETS, SEGS: SEGS,
    newWorld: newWorld, rack: rack, clone: clone, cue: cue, find: find, strike: strike, step: step,
    moving: moving, simulate: simulate, newEvents: newEvents, free: free
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Pool8Physics = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
