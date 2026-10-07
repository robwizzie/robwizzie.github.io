/* robwiscount.org — the "you found every achievement" moment: a trophy, the badges, fireworks.
   js/eggs.js calls RW.celebrate() when the last one unlocks; the `celebrate` command replays it. */
(function () {
  'use strict';
  var RW = window.RW;
  if (!RW || !RW.achievements) return;
  var $ = RW.$, $$ = RW.$$, reduceMotion = RW.reduceMotion;
  var KEY = 'rw-celebrated', SITE = 'https://robwiscount.org';
  var HEX = 'M50 2 L93 27 L93 77 L50 102 L7 77 L7 27 Z';

  function seen(val) {
    try {
      if (val === undefined) return JSON.parse(localStorage.getItem(KEY));
      localStorage.setItem(KEY, JSON.stringify(val));
    } catch (e) {}
    return null;
  }
  function tally() {
    var list = RW.achievements.list(), got = RW.achievements.got() || {}, first = Infinity;
    var found = list.filter(function (a) { return got[a.id]; });
    found.forEach(function (a) { if (+got[a.id] < first) first = +got[a.id]; });
    return { list: list, found: found.length, total: list.length, first: isFinite(first) ? first : 0 };
  }
  // "in 47 minutes", "in 3 days"
  function took(ms) {
    var m = Math.round(ms / 6e4), h = Math.round(ms / 36e5), d = Math.round(ms / 864e5);
    function n(x, w) { return x + ' ' + w + (x === 1 ? '' : 's'); }
    if (m < 1) return 'in under a minute';
    if (m < 60) return 'in ' + n(m, 'minute');
    if (h < 24) return 'in ' + n(h, 'hour');
    if (d < 14) return 'in ' + n(d, 'day');
    if (d < 60) return 'in ' + n(Math.round(d / 7), 'week');
    return 'in ' + n(Math.round(d / 30), 'month');
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function color(v, fb) { return (getComputedStyle(document.documentElement).getPropertyValue(v) || '').trim() || fb; }

  /* ---------- Fireworks: rockets burst into spheres, rings and hexagons, then the sky just twinkles ---------- */
  function fireworks(cv) {
    var cx = cv.getContext('2d'), W = 0, H = 0, dpr = Math.min(2, window.devicePixelRatio || 1);
    var cols = [color('--blue', '#5b8ff9'), color('--blue-hi', '#8db2ff'), '#ffffff'];
    var rockets = [], sparks = [], stars = [], flashes = [], raf = 0, t0 = performance.now(), last = t0, nextLaunch = 0, SHOW = 6500;
    function size() { W = innerWidth; H = innerHeight; cv.width = W * dpr; cv.height = H * dpr; cx.setTransform(dpr, 0, 0, dpr, 0, 0); }
    size();
    function launch() {
      var x = W * (0.12 + Math.random() * 0.76);
      rockets.push({ x: x, y: H + 10, vx: (W / 2 - x) * 0.0016 + (Math.random() - 0.5) * 0.6, vy: -(H * 0.011 + 6 + Math.random() * 3),
        ty: H * (0.12 + Math.random() * 0.32), c: cols[Math.random() * cols.length | 0] });
    }
    function explode(r) {
      var shape = Math.random(), n = W < 600 ? 60 : 90, sp = W < 600 ? 4.2 : 5.6, c2 = cols[(cols.indexOf(r.c) + 1) % cols.length];
      for (var i = 0; i < n; i++) {
        var a = i / n * Math.PI * 2, v;
        if (shape < 0.3) { // hexagon, like the logo
          var k = Math.floor(a / (Math.PI / 3)), f = a / (Math.PI / 3) - k, a0 = k * Math.PI / 3 - Math.PI / 2, a1 = a0 + Math.PI / 3;
          var px = Math.cos(a0) * (1 - f) + Math.cos(a1) * f, py = Math.sin(a0) * (1 - f) + Math.sin(a1) * f;
          sparks.push(spark(r.x, r.y, px * sp, py * sp, i % 3 ? r.c : '#fff'));
          continue;
        }
        v = shape < 0.55 ? sp : sp * (0.25 + Math.random() * 0.85); // ring or sphere
        a += Math.random() * 0.08;
        sparks.push(spark(r.x, r.y, Math.cos(a) * v, Math.sin(a) * v, i % 4 ? r.c : c2));
      }
      flashes.push({ x: r.x, y: r.y, c: r.c, life: 1 });
      for (var j = 0; j < 14; j++) sparks.push(spark(r.x, r.y, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, '#fff', 0.5));
    }
    function spark(x, y, vx, vy, c, life) { return { x: x, y: y, px: x, py: y, vx: vx, vy: vy, c: c, life: life || 1, decay: 0.009 + Math.random() * 0.008 }; }
    function star() { return { x: Math.random() * W, y: Math.random() * H, r: 0.6 + Math.random() * 1.6, ph: Math.random() * 6.3, sp: 0.6 + Math.random() * 1.6, c: cols[Math.random() * cols.length | 0], vy: -0.05 - Math.random() * 0.12 }; }
    function frame(now) {
      var dt = Math.min(3, (now - last) / 16.67), age = now - t0; last = now;
      if (age < SHOW && now > nextLaunch) { launch(); if (Math.random() < 0.35) launch(); nextLaunch = now + 260 + Math.random() * 380; }
      if (age > SHOW * 0.7 && stars.length < (W < 600 ? 40 : 70) && Math.random() < 0.3) stars.push(star());
      cx.globalCompositeOperation = 'source-over';
      cx.clearRect(0, 0, W, H);
      cx.globalCompositeOperation = 'lighter';
      cx.lineCap = 'round';
      flashes = flashes.filter(function (f) {
        var g = cx.createRadialGradient(f.x, f.y, 0, f.x, f.y, 90);
        g.addColorStop(0, f.c); g.addColorStop(1, 'rgba(0,0,0,0)');
        cx.globalAlpha = f.life * 0.35; cx.fillStyle = g; cx.fillRect(f.x - 90, f.y - 90, 180, 180);
        f.life -= 0.06 * dt; return f.life > 0;
      });
      rockets = rockets.filter(function (r) {
        var ox = r.x, oy = r.y;
        r.vy += 0.09 * dt; r.x += r.vx * dt; r.y += r.vy * dt;
        cx.strokeStyle = r.c; cx.globalAlpha = 0.9; cx.lineWidth = 2.2;
        cx.beginPath(); cx.moveTo(ox - r.vx * 3, oy - r.vy * 3); cx.lineTo(r.x, r.y); cx.stroke();
        if (r.y <= r.ty || r.vy >= -1) { explode(r); return false; }
        return true;
      });
      sparks = sparks.filter(function (p) {
        p.px = p.x; p.py = p.y;
        p.vx *= Math.pow(0.975, dt); p.vy = p.vy * Math.pow(0.975, dt) + 0.045 * dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.life -= p.decay * dt;
        if (p.life <= 0) return false;
        cx.globalAlpha = Math.min(1, p.life * 1.4) * (p.life < 0.3 && Math.random() < 0.3 ? 0.3 : 1); // crackle as they die
        cx.strokeStyle = p.c; cx.lineWidth = 1.2 + p.life * 1.6;
        cx.beginPath(); cx.moveTo(p.px - p.vx * 1.5, p.py - p.vy * 1.5); cx.lineTo(p.x, p.y); cx.stroke();
        return true;
      });
      stars.forEach(function (s) {
        s.ph += 0.03 * s.sp * dt; s.y += s.vy * dt; if (s.y < -5) { s.y = H + 5; s.x = Math.random() * W; }
        var a = Math.max(0, Math.sin(s.ph)), r = s.r * (0.6 + a);
        cx.globalAlpha = a * 0.85; cx.fillStyle = s.c;
        cx.beginPath(); cx.moveTo(s.x, s.y - r * 3); cx.lineTo(s.x + r * 0.5, s.y); cx.lineTo(s.x, s.y + r * 3); cx.lineTo(s.x - r * 0.5, s.y); cx.closePath(); cx.fill();
        cx.beginPath(); cx.moveTo(s.x - r * 3, s.y); cx.lineTo(s.x, s.y + r * 0.5); cx.lineTo(s.x + r * 3, s.y); cx.lineTo(s.x, s.y - r * 0.5); cx.closePath(); cx.fill();
      });
      cx.globalAlpha = 1;
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    window.addEventListener('resize', size);
    return function stop() { cancelAnimationFrame(raf); window.removeEventListener('resize', size); rockets = sparks = stars = flashes = []; };
  }

  /* ---------- The overlay ---------- */
  var open = null; // the close function while it's showing

  RW.celebrate = function () {
    if (open) return;
    var t = tally(), lastFocus = document.activeElement, timers = [], stopFx = null;
    var all = t.found === t.total, line = 'I found all ' + t.total + ' secrets on robwiscount.org 🏆';
    seen({ t: Date.now(), n: t.total });

    var ov = document.createElement('div');
    ov.className = 'cele' + (reduceMotion ? ' calm' : '');
    ov.style.setProperty('--n', t.total);
    ov.style.setProperty('--cols', Math.ceil(t.total / 2)); // balanced rows of badges
    ov.style.setProperty('--cols-sm', Math.ceil(t.total / 3));
    ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true');
    ov.setAttribute('aria-labelledby', 'cele-h'); ov.setAttribute('aria-describedby', 'cele-sub');
    ov.innerHTML =
      (reduceMotion ? '' : '<canvas class="cele-fx" aria-hidden="true"></canvas>') +
      '<button class="round-btn cele-x" type="button" aria-label="Close"><i class="fas fa-times"></i></button>' +
      '<div class="cele-stage"><div class="cele-inner">' +
        '<div class="cele-trophy" aria-hidden="true">' +
          '<i class="cele-rays"></i><i class="cele-flash"></i>' +
          '<svg class="cele-frame" viewBox="0 0 100 104"><path d="' + HEX + '"/></svg>' +
          '<svg class="cele-frame cele-frame-2" viewBox="0 0 100 104"><path d="' + HEX + '"/></svg>' +
          '<span class="cele-logo"><img src="assets/rw-logo.png" alt=""><i class="cele-shine"></i></span>' +
        '</div>' +
        '<span class="cele-kicker">' + (all ? '100% complete' : Math.round(t.found / t.total * 100) + '% complete') + '</span>' +
        '<h2 class="cele-h" id="cele-h">' + (all
          ? '<span>Every.</span> <span>Single.</span> <span class="blue">One.</span>'
          : '<span>' + t.found + '</span> <span>of</span> <span class="blue">' + t.total + '.</span>') + '</h2>' +
        '<p class="cele-sub" id="cele-sub"><b><span class="cele-n">' + t.found + '</span> of ' + t.total + '</b> secrets found' +
          (t.first ? ' <span class="cele-dot">·</span> <span class="cele-took">' + took(Date.now() - t.first) + '</span>' : '') + '</p>' +
        '<div class="cele-bar" aria-hidden="true"><i style="width:' + Math.round(t.found / t.total * 100) + '%"></i></div>' +
        '<ul class="cele-badges" aria-label="Your achievements">' + t.list.map(function (a, i) {
          var on = !!(RW.achievements.got() || {})[a.id];
          return '<li class="' + (on ? 'on' : 'off') + '" style="--i:' + i + '" tabindex="0" data-t="' + esc(a.title) + '" aria-label="' + esc(a.title + (on ? '' : ' (locked)')) + '">' +
            '<span>' + (on ? a.icon : '🔒') + '</span></li>';
        }).join('') + '</ul>' +
        '<div class="cele-actions">' +
          (all ? '<button class="btn btn-primary cele-wall" type="button"><i class="fas fa-download"></i> Download your trophy wallpaper</button>' : '') +
          '<button class="btn btn-ghost cele-share" type="button"><i class="fas fa-share-nodes"></i> Share</button>' +
          '<button class="btn btn-ghost cele-back" type="button">Back to the site</button>' +
        '</div>' +
      '</div></div>';
    document.body.appendChild(ov);
    document.body.classList.add('modal-open', 'celebrating');

    // Badges fly out of the trophy to their spot in the grid
    var trophy = $('.cele-trophy', ov), badges = $$('.cele-badges li', ov);
    function aim() {
      var tr = trophy.getBoundingClientRect(), tx = tr.left + tr.width / 2, ty = tr.top + tr.height / 2;
      badges.forEach(function (b) {
        var r = b.getBoundingClientRect();
        b.style.setProperty('--fx', Math.round(tx - r.left - r.width / 2) + 'px');
        b.style.setProperty('--fy', Math.round(ty - r.top - r.height / 2) + 'px');
      });
    }
    if (!reduceMotion) aim();

    // The count ticks up as the bar fills
    var nEl = $('.cele-n', ov);
    function countUp() {
      if (reduceMotion || !nEl) return;
      var start = performance.now(), dur = 1100;
      (function tick(now) {
        if (!open) return;
        var k = Math.min(1, (now - start) / dur);
        nEl.textContent = Math.round(t.found * (1 - Math.pow(1 - k, 3)));
        if (k < 1) requestAnimationFrame(tick);
      })(start);
    }
    if (!reduceMotion) { nEl.textContent = '0'; timers.push(setTimeout(countUp, 1500)); }

    requestAnimationFrame(function () { ov.classList.add('open'); });
    if (!reduceMotion) {
      stopFx = fireworks($('.cele-fx', ov));
      timers.push(setTimeout(function () { RW.party(); }, 950));
      timers.push(setTimeout(function () { ov.classList.add('landed'); }, 1250));
    }

    // Wiring
    var wall = $('.cele-wall', ov);
    if (wall) wall.addEventListener('click', function () { RW.achievements.wallpaper(); RW.toast('🏆 Wallpaper on its way to your downloads'); });
    $('.cele-share', ov).addEventListener('click', function () {
      if (navigator.share) { navigator.share({ title: 'robwiscount.org', text: line, url: SITE }).catch(function () {}); return; }
      RW.copy(line + ' ' + SITE).then(function () { RW.toast('📋 Copied — paste it anywhere'); }, function () { RW.toast(line + ' ' + SITE); });
    });
    $('.cele-back', ov).addEventListener('click', close);
    $('.cele-x', ov).addEventListener('click', close);
    ov.addEventListener('click', function (e) { if (e.target === ov || e.target.classList.contains('cele-stage')) close(); });
    // Tap a badge on a phone to see its name
    $('.cele-badges', ov).addEventListener('click', function (e) {
      var li = e.target.closest('li'); if (!li) return;
      badges.forEach(function (b) { if (b !== li) b.classList.remove('tip'); });
      li.classList.toggle('tip');
    });
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
      if (e.key !== 'Tab') return;
      var f = $$('.cele-stage button, .cele-stage [tabindex="0"], .cele-x', ov), i = f.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && (i === f.length - 1 || i < 0)) { e.preventDefault(); f[0].focus(); }
    }
    function onResize() { if (!reduceMotion) aim(); }
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', onResize);

    function close() {
      if (!open) return;
      open = null;
      timers.forEach(clearTimeout);
      if (stopFx) stopFx();
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', onResize);
      ov.remove();
      document.body.classList.remove('modal-open', 'celebrating');
      if (lastFocus && lastFocus.focus && document.contains(lastFocus)) lastFocus.focus();
    }
    open = close;
    ov.tabIndex = -1;
    ov.focus({ preventScroll: true }); // Tab from here lands on the first button
  };
  RW.celebrate.close = function () { if (open) open(); };

  /* ---------- Replay it from the terminal ---------- */
  RW.commands.celebrate = function () {
    var t = tally(), left = t.total - t.found;
    if (left > 0) {
      RW.print('Not yet — ' + left + ' secret' + (left === 1 ? '' : 's') + ' left to find (' + t.found + '/' + t.total + ').', 'warn');
      RW.print('Stuck? Type <span class="p">hint</span> for step-by-step help.', 'dim');
      return;
    }
    RW.print('🏆 Roll it back. ' + t.total + '/' + t.total + ', every single one.', 'ok');
    setTimeout(RW.celebrate, 250);
  };

  // Finished before this existed (or on another visit)? Show it once, after the page settles.
  window.addEventListener('load', function () {
    setTimeout(function () {
      var t = tally(), s = seen();
      if (t.total && t.found === t.total && !(s && s.n >= t.total) && !document.body.classList.contains('modal-open')) RW.celebrate();
    }, 3500);
  });
})();
