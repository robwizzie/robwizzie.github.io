/* 8-ball rules and the CPU. No DOM, so Node can play it against itself.
   Rules are APA/bar-table style: open table after the break, first legal pot claims a group, ball in hand
   anywhere after a foul, call the pocket on the 8. The 8 on the break wins (unless you scratch). */
(function (root) {
  'use strict';
  var P = root.Pool8Physics || (typeof require !== 'undefined' && require('./physics.js'));
  var W = P.W, H = P.H, R = P.R, D = P.D;

  var SOLIDS = [1, 2, 3, 4, 5, 6, 7], STRIPES = [9, 10, 11, 12, 13, 14, 15];

  function newGame(rnd) {
    return { world: P.newWorld(rnd), turn: 0, groups: [null, null], open: true, breakShot: true, inHand: true, kitchen: true, over: false, winner: null };
  }

  function groupOf(n) { return n >= 1 && n <= 7 ? 'solids' : n >= 9 ? 'stripes' : null; }
  function onTable(w, n) { var b = P.find(w, n); return b && b.on; }

  // Balls this player may hit first.
  function targets(g, p) {
    var w = g.world, list;
    if (g.open) list = SOLIDS.concat(STRIPES);
    else list = g.groups[p] === 'solids' ? SOLIDS : STRIPES;
    list = list.filter(function (n) { return onTable(w, n); });
    if (!g.open && !list.length) return [8];
    if (g.open && !list.length) return [8];
    return list;
  }

  function left(g, p) { // object balls a player still has to sink (null while the table is open)
    if (!g.groups[p]) return null;
    return (g.groups[p] === 'solids' ? SOLIDS : STRIPES).filter(function (n) { return onTable(g.world, n); });
  }

  /* Score a finished shot. pre is targets() from before the shot, called is the called pocket for the 8.
     Mutates g (turn, groups, ball in hand, winner) and returns what happened for the HUD. */
  function judge(g, ev, pre, called) {
    var p = g.turn, o = 1 - p, pots = ev.potted.map(function (x) { return x.n; });
    var scratch = pots.indexOf(0) > -1, eight = ev.potted.filter(function (x) { return x.n === 8; })[0];
    var objs = pots.filter(function (n) { return n !== 0 && n !== 8; });
    var res = { foul: null, keep: false, potted: objs, scratch: scratch, assigned: null, win: null };
    var wasBreak = g.breakShot;
    g.breakShot = false; g.kitchen = false;

    if (wasBreak) {
      if (eight) return end(g, res, scratch ? o : p, scratch ? 'Scratched on the 8 break' : '8 on the break');
      if (scratch) res.foul = 'Scratch on the break';
      else if (ev.first == null) res.foul = 'Missed the rack';
    } else {
      if (ev.first == null) res.foul = 'No ball hit';
      else if (pre.indexOf(ev.first) < 0) res.foul = ev.first === 8 ? 'Hit the 8 first' : 'Wrong ball first';
      else if (!pots.length && !ev.rail) res.foul = 'No rail after contact';
      if (scratch) res.foul = res.foul ? res.foul + ' and scratched' : 'Scratch';
      if (eight) {
        var onEight = pre.length === 1 && pre[0] === 8;
        if (!onEight) return end(g, res, o, 'Sank the 8 early');
        if (res.foul) return end(g, res, o, 'Fouled on the 8');
        if (called != null && eight.pocket !== called) return end(g, res, o, '8 in the wrong pocket');
        return end(g, res, p, '8 called in the ' + POCKET_NAMES[eight.pocket]);
      }
    }

    if (!res.foul && g.open && objs.length && !wasBreak) {
      var grp = groupOf(objs[0]);
      g.groups[p] = grp; g.groups[o] = grp === 'solids' ? 'stripes' : 'solids'; g.open = false;
      res.assigned = grp;
    }
    if (!res.foul) {
      if (wasBreak) res.keep = objs.length > 0;
      else res.keep = objs.some(function (n) { return g.open || groupOf(n) === g.groups[p]; });
    }
    if (scratch) { var c = P.cue(g.world); c.on = true; c.pocket = -1; c.x = P.HEAD_X; c.y = H / 2; }
    g.inHand = !!res.foul;
    if (!res.keep) g.turn = o;
    return res;
  }

  function end(g, res, winner, why) {
    g.over = true; g.winner = winner; res.win = winner; res.why = why;
    return res;
  }

  var POCKET_NAMES = ['top-left corner', 'top side', 'top-right corner', 'bottom-left corner', 'bottom side', 'bottom-right corner'];

  /* ---------- Geometry helpers ---------- */
  // Is the path from (x1,y1) to (x2,y2) clear of every ball (except those in skip) by clearance?
  function clear(w, x1, y1, x2, y2, skip, clearance) {
    var dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy, c2 = clearance * clearance;
    for (var i = 0; i < w.balls.length; i++) {
      var b = w.balls[i];
      if (!b.on || skip.indexOf(b.n) > -1) continue;
      var t = l2 ? ((b.x - x1) * dx + (b.y - y1) * dy) / l2 : 0;
      if (t < 0 || t > 1) { if (t < 0 && (b.x - x1) * (b.x - x1) + (b.y - y1) * (b.y - y1) < c2) return false; continue; }
      var px = x1 + dx * t - b.x, py = y1 + dy * t - b.y;
      if (px * px + py * py < c2) return false;
    }
    return true;
  }

  // Every direct pot available to the cue ball at (cx, cy): ghost-ball aim, cut angle and how easy it looks.
  function shots(w, list, cx, cy) {
    var out = [];
    list.forEach(function (n) {
      var t = P.find(w, n);
      if (!t || !t.on) return;
      P.POCKETS.forEach(function (pk) {
        var ax = pk.ax, ay = pk.ay, dx = ax - t.x, dy = ay - t.y, d2 = Math.sqrt(dx * dx + dy * dy);
        if (d2 < 0.01) return;
        dx /= d2; dy /= d2;
        // can it enter? side pockets want a steep approach, corners anything but straight down a rail
        var inx = pk.side ? 0 : (pk.x < W / 2 ? -1 : 1) * Math.SQRT1_2, iny = (pk.y < H / 2 ? -1 : 1) * (pk.side ? 1 : Math.SQRT1_2);
        var entry = dx * inx + dy * iny;
        if (entry < (pk.side ? 0.55 : 0.35)) return;
        var gx = t.x - dx * D, gy = t.y - dy * D;
        if (gx < R || gx > W - R || gy < R || gy > H - R) return;
        var ux = gx - cx, uy = gy - cy, d1 = Math.sqrt(ux * ux + uy * uy);
        if (d1 < 0.01) return;
        var cut = Math.acos(Math.max(-1, Math.min(1, (ux * dx + uy * dy) / d1)));
        if (cut > 1.4) return; // past ~80°
        if (!clear(w, cx, cy, gx, gy, [0, n], D * 0.98)) return;
        if (!clear(w, t.x, t.y, ax, ay, [0, n], D * 0.98)) return;
        var ease = Math.pow(Math.cos(cut), 1.6) * (0.6 + 0.4 * entry) / (1 + d1 / 70 + d2 / 55);
        out.push({ n: n, pocket: pk.i, angle: Math.atan2(uy, ux), cut: cut, d1: d1, d2: d2, ease: ease, gx: gx, gy: gy });
      });
    });
    out.sort(function (a, b) { return b.ease - a.ease; });
    return out;
  }

  // Cue speed that gets the object ball to the pocket with some pace to spare.
  function paceFor(s, extra) {
    var vObj = Math.sqrt(2 * 9 * (s.d2 + 6)) + 18, vCue = vObj / (Math.max(0.25, Math.cos(s.cut)) * 0.975);
    vCue += s.d1 * 0.55;
    return Math.max(25, Math.min(300, vCue * (extra || 1)));
  }

  function gauss(rnd) { var u = 0, v = 0; while (!u) u = rnd(); while (!v) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

  /* ---------- The CPU ---------- */
  var LEVELS = {
    easy: { noise: 1.6, pace: 0.2, cands: 0, safety: 0, pick: 4 },
    medium: { noise: 0.55, pace: 0.08, cands: 6, safety: 8, pick: 1 },
    hard: { noise: 0.14, pace: 0.03, cands: 9, safety: 18, pick: 1 }
  };

  // Try a shot in a copy of the world; returns the outcome as the rules would see it.
  function trial(g, shot, place) {
    var w = P.clone(g.world), c = P.cue(w);
    if (place) { c.x = place.x; c.y = place.y; }
    P.strike(w, shot.angle, shot.speed, shot.ex || 0, shot.ey || 0);
    var ev = P.simulate(w, 20);
    var gg = { world: w, turn: g.turn, groups: g.groups.slice(), open: g.open, breakShot: g.breakShot, over: false };
    var res = judge(gg, ev, targets(g, g.turn), shot.called);
    return { res: res, g: gg, ev: ev };
  }

  // How good is the table for whoever's turn it is in gg? (best ease of their next pot, 0..~1)
  function leave(gg, p) {
    if (gg.over) return gg.winner === p ? 3 : -3;
    var c = P.cue(gg.world);
    var list = targets(gg, p), s = shots(gg.world, list, c.x, c.y);
    return s.length ? s[0].ease + (s[1] ? s[1].ease * 0.25 : 0) : 0;
  }

  /* plan() is a generator: it yields between look-ahead sims so the game can spread the thinking over
     frames. The final value is { angle, speed, ex, ey, place, called }. */
  function* plan(g, level, rnd) {
    rnd = rnd || Math.random;
    var L = LEVELS[level] || LEVELS.medium, p = g.turn, w = g.world, c = P.cue(w), list = targets(g, p), place = null;

    if (g.breakShot) {
      place = { x: P.HEAD_X - 2 - rnd() * 4, y: H / 2 + (rnd() - 0.5) * 8 };
      var apex = null;
      w.balls.forEach(function (b) { if (b.on && b.n && (!apex || b.x < apex.x)) apex = b; });
      return finish({ angle: Math.atan2(apex.y - place.y, apex.x - place.x) + (rnd() - 0.5) * 0.01, speed: 340 + rnd() * 40, ex: 0, ey: -0.1 }, place);
    }

    // Ball in hand: set up straight-ish behind the easiest pots, then judge those like any other shot.
    var spots = [{ x: c.x, y: c.y }];
    if (g.inHand) {
      spots = [];
      shots(w, list, W / 2, H / 2).concat(shotsFromAnywhere(w, list)).slice(0, 14).forEach(function (s) {
        var t = P.find(w, s.n), dx = s.gx - t.x, dy = s.gy - t.y, l = Math.sqrt(dx * dx + dy * dy) || 1;
        for (var k = 0; k < 3; k++) {
          var back = 6 + k * 5 + rnd() * 3, ang = (rnd() - 0.5) * (level === 'hard' ? 0.5 : 0.25);
          var ca = Math.cos(ang), sa = Math.sin(ang), ux = dx / l, uy = dy / l, rx = ux * ca - uy * sa, ry = ux * sa + uy * ca;
          var x = s.gx + rx * back, y = s.gy + ry * back;
          if (P.free(w, x, y, c)) { spots.push({ x: x, y: y }); break; }
        }
      });
      if (!spots.length) spots.push(anyFree(w, c, rnd));
    }

    var cands = [];
    spots.forEach(function (sp) {
      shots(w, list, sp.x, sp.y).slice(0, 4).forEach(function (s) { s.place = g.inHand ? sp : null; cands.push(s); });
    });
    cands.sort(function (a, b) { return b.ease - a.ease; });

    if (L.cands === 0) { // Easy: eyeballs it, no look-ahead
      if (cands.length && rnd() < 0.85) {
        var s = cands[Math.floor(rnd() * Math.min(L.pick, cands.length))];
        return finish({ angle: s.angle, speed: paceFor(s, 1.05 + rnd() * 0.4), ex: 0, ey: rnd() < 0.3 ? 0.3 : 0, called: s.pocket, n: s.n }, s.place);
      }
      return finish(bump(g, list, rnd, 90 + rnd() * 60), place || (g.inHand ? spots[0] : null));
    }

    // Medium/Hard: simulate the best-looking pots with a few speeds and spins; keep what works and leaves position.
    var best = null, tried = 0;
    var paces = level === 'hard' ? [0.85, 1.1, 1.45] : [1, 1.3];
    var spins = level === 'hard' ? [[0, -0.7], [0, 0], [0, 0.6], [-0.6, 0], [0.6, 0]] : [[0, 0], [0, 0.4]];
    for (var i = 0; i < Math.min(L.cands, cands.length); i++) {
      var cd = cands[i];
      for (var a = 0; a < paces.length; a++) for (var b = 0; b < spins.length; b++) {
        var shot = { angle: cd.angle, speed: paceFor(cd, paces[a]), ex: spins[b][0], ey: spins[b][1], called: cd.pocket, n: cd.n };
        var out = trial(g, shot, cd.place);
        tried++;
        if (tried % 3 === 0) yield tried;
        if (!good(out, p, cd.n)) continue;
        var score = 1 + leave(out.g, p) * (level === 'hard' ? 1.6 : 0.8) + cd.ease * 0.5 - (shot.ex ? 0.05 : 0);
        if (out.res.win === p) score += 10;
        if (!best || score > best.score) best = { score: score, shot: shot, place: cd.place, cd: cd };
      }
    }
    // Hard double-checks its pick still drops with a little wobble; if it's fragile, try the runner-up idea.
    if (best && level === 'hard') {
      var ok = 0;
      for (var k = 0; k < 4; k++) {
        var wob = { angle: best.shot.angle + (k < 2 ? 1 : -1) * 0.0035 * (1 + (k % 2)), speed: best.shot.speed, ex: best.shot.ex, ey: best.shot.ey, called: best.shot.called };
        if (good(trial(g, wob, best.place), p, best.shot.n)) ok++;
        yield ++tried;
      }
      if (ok < 2) best.score -= 0.8;
    }
    if (best && best.score > (level === 'hard' ? 0.6 : 0.4)) return finish(best.shot, best.place);

    // Nothing makes: play safe. Hit our own ball legally and leave the other guy as little as possible.
    var safe = null;
    for (var j = 0; j < L.safety; j++) {
      var tgt = P.find(w, list[Math.floor(rnd() * list.length)]);
      var from = best && best.place || (g.inHand ? spots[0] : { x: c.x, y: c.y });
      var ang = Math.atan2(tgt.y - from.y, tgt.x - from.x) + (rnd() - 0.5) * 0.35;
      var sh = { angle: ang, speed: 45 + rnd() * 90, ex: 0, ey: rnd() < 0.5 ? -0.5 : 0, n: tgt.n };
      var o2 = trial(g, sh, g.inHand ? from : null);
      yield ++tried;
      if (o2.res.foul) continue;
      var sc = (o2.res.keep ? 1.2 : 0) - leave(o2.g, 1 - p) + (best ? 0 : 0);
      if (o2.g.over) sc = o2.g.winner === p ? 99 : -99;
      if (!safe || sc > safe.score) safe = { score: sc, shot: sh, place: g.inHand ? from : null };
    }
    if (best && (!safe || best.score > 0.25)) return finish(best.shot, best.place);
    if (safe) return finish(safe.shot, safe.place);
    return finish(bump(g, list, rnd, 110), g.inHand ? spots[0] : null);

    function finish(shot, pl) {
      if (shot.called == null) shot.called = callFor(g, shot, pl); // decided before the wobble, like a person would
      shot.angle += gauss(rnd) * L.noise * Math.PI / 180;
      shot.speed *= 1 + gauss(rnd) * L.pace;
      shot.speed = Math.max(20, Math.min(level === 'hard' && g.breakShot ? 390 : 380, shot.speed));
      shot.place = pl || null;
      return shot;
    }
  }

  function good(out, p, n) {
    if (out.res.win != null) return out.res.win === p;
    return !out.res.foul && out.res.keep && (n == null || out.res.potted.indexOf(n) > -1 || out.res.potted.length > 0);
  }

  // Straight-in setups for each pot: ghost ball positions independent of where the cue is now.
  function shotsFromAnywhere(w, list) {
    var out = [];
    list.forEach(function (n) {
      var t = P.find(w, n);
      P.POCKETS.forEach(function (pk) {
        var dx = pk.ax - t.x, dy = pk.ay - t.y, d = Math.sqrt(dx * dx + dy * dy);
        if (d < 0.01) return;
        var gx = t.x - dx / d * D, gy = t.y - dy / d * D;
        if (!clear(w, t.x, t.y, pk.ax, pk.ay, [0, n], D * 0.98)) return;
        out.push({ n: n, pocket: pk.i, gx: gx, gy: gy, ease: 1 / (1 + d / 50) });
      });
    });
    out.sort(function (a, b) { return b.ease - a.ease; });
    return out;
  }

  function anyFree(w, c, rnd) {
    for (var k = 0; k < 200; k++) {
      var x = R + rnd() * (W - 2 * R), y = R + rnd() * (H - 2 * R);
      if (P.free(w, x, y, c)) return { x: x, y: y };
    }
    return { x: P.HEAD_X, y: H / 2 };
  }

  // No plan: just hit the nearest legal ball full.
  function bump(g, list, rnd, speed) {
    var c = P.cue(g.world), best = null, bd = 1e9;
    list.forEach(function (n) { var b = P.find(g.world, n); var d = Math.hypot(b.x - c.x, b.y - c.y); if (d < bd) { bd = d; best = b; } });
    return { angle: Math.atan2(best.y - c.y, best.x - c.x) + (rnd() - 0.5) * 0.02, speed: speed, ex: 0, ey: 0 };
  }

  // On the 8 the pocket has to be called: pick the one the 8 is headed for.
  function callFor(g, shot, pl) {
    var list = targets(g, g.turn);
    if (list.length !== 1 || list[0] !== 8) return null;
    var w = P.clone(g.world), c = P.cue(w);
    if (pl) { c.x = pl.x; c.y = pl.y; }
    P.strike(w, shot.angle, shot.speed, shot.ex, shot.ey);
    var ev = P.simulate(w, 20), e = ev.potted.filter(function (x) { return x.n === 8; })[0];
    return e ? e.pocket : 0;
  }

  var api = { SOLIDS: SOLIDS, STRIPES: STRIPES, POCKET_NAMES: POCKET_NAMES, LEVELS: LEVELS, newGame: newGame, groupOf: groupOf, targets: targets,
    left: left, judge: judge, shots: shots, plan: plan, trial: trial, clear: clear };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Pool8Brain = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
