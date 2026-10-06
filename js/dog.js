/* The Fetch dog gets loose: type "dog", run `dog` in the terminal, or find the bone in the footer.
   He steals the nav logo, and every click throws it. A small canvas sprite loop that only runs while he's out. */
(function () {
  'use strict';
  var RW = window.RW;
  if (!RW) return;

  /* ---------- Sprite: 24×18 pixel art, facing right ---------- */
  var PAL = { k: '#2b160a', o: '#f2a33a', d: '#c4721f', t: '#ffdcaa', e: '#140904', n: '#140904', p: '#ff7a93', b: '#5b8ff9' };
  var SW = 24, SH = 18, MOUTH = [21, 6.5]; // mouth, in sprite pixels
  var HEAD = [
    '...............kkkk.....',
    '..............koooook...',
    '.............kooooooook.',
    '............kddoooeoook.',
    '............kdddooootttn',
    '............kdddoottttk.',
    '.............kddootkkkk.'
  ];
  var BODY = [
    '....kkkkkkkkkkddotpppk..',
    '...koooooooooookbbook...',
    '..koooooooooooobbook....',
    '..kooooooooooooooook....',
    '..kdoooooooooootttk.....',
    '...kdooootttttttk.......'
  ];
  var LEGS = {
    stand: ['...kokdk......kokdk.....', '...kokdk......kokdk.....', '...kokdk......kokdk.....', '..kkkkk......kkkkk......'],
    r0: ['..kook........kook......', '.kook..........kook.....', 'kok..............kok....', 'kk................kk....'],
    r1: ['...kook......kook.......', '...kok.......kok........', '....kok.....kok.........', '....kkk.....kkk.........'],
    r2: ['....kook...kook.........', '.....kok..kok...........', '......kk.kk.............'],
    r3: ['...kok........kook......', '..kok.........kok.......', '..kok..........kok......', '.kkk...........kkk......']
  };
  var SIT = [
    '........kkkkkkddotpppk..',
    '.......koooooookbbok....',
    '......kooooooooobbtk....',
    '......kooooooooottttk...',
    '.....kdooooooookttk.....',
    '.....kdoooooooktok......',
    '.....kdoooooooktok......',
    '.....kdoooooooktok......',
    '.....kdddooooodkok......',
    '....kkkkkkkkkkkkkkk.....'
  ];
  var TAILS = { // [x, y, color] overlays
    up: [[2, 2, 'k'], [1, 3, 'k'], [2, 3, 'o'], [3, 3, 'k'], [0, 4, 'k'], [1, 4, 'o'], [2, 4, 'o'], [3, 4, 'k'], [0, 5, 'k'], [1, 5, 'o'], [2, 5, 'k'], [1, 6, 'k'], [2, 6, 'o'], [3, 6, 'k'], [2, 7, 'k'], [3, 7, 'o'], [4, 7, 'o']],
    mid: [[0, 5, 'k'], [1, 5, 'k'], [0, 6, 'k'], [1, 6, 'o'], [2, 6, 'k'], [3, 6, 'k'], [0, 7, 'k'], [1, 7, 'o'], [2, 7, 'o'], [3, 7, 'o'], [4, 7, 'o'], [1, 8, 'k'], [2, 8, 'k']],
    sitA: [[0, 12, 'k'], [1, 12, 'k'], [0, 13, 'k'], [1, 13, 'o'], [2, 13, 'k'], [1, 14, 'k'], [2, 14, 'o'], [3, 14, 'k'], [2, 15, 'k'], [3, 15, 'o'], [4, 15, 'o']],
    sitB: [[0, 14, 'k'], [1, 14, 'k'], [2, 14, 'k'], [3, 14, 'k'], [0, 15, 'k'], [1, 15, 'o'], [2, 15, 'o'], [3, 15, 'o'], [4, 15, 'o'], [0, 16, 'k'], [1, 16, 'k'], [2, 16, 'k'], [3, 16, 'k']]
  };

  // Each frame is pre-rendered once at 1× (and mirrored), then scaled up crisp.
  function makeFrame(legs, tail) {
    var rows = HEAD.concat(legs === 'sit' ? SIT : BODY.concat(LEGS[legs]));
    var grid = rows.map(function (r) { return r.split(''); });
    TAILS[tail].forEach(function (p) { if (grid[p[1]]) grid[p[1]][p[0]] = p[2]; });
    var out = [];
    [1, -1].forEach(function (dir) {
      var c = document.createElement('canvas'); c.width = SW; c.height = SH;
      var g = c.getContext('2d');
      grid.forEach(function (row, y) {
        row.forEach(function (ch, x) {
          if (!PAL[ch]) return;
          g.fillStyle = PAL[ch];
          g.fillRect(dir > 0 ? x : SW - 1 - x, y, 1, 1);
        });
      });
      out.push(c);
    });
    return { r: out[0], l: out[1] };
  }
  var F = null;
  function frames() {
    if (F) return F;
    F = {
      run: [makeFrame('r0', 'mid'), makeFrame('r1', 'up'), makeFrame('r2', 'up'), makeFrame('r3', 'mid')],
      stand: [makeFrame('stand', 'up'), makeFrame('stand', 'mid')],
      sit: [makeFrame('sit', 'sitA'), makeFrame('sit', 'sitB')],
      jump: makeFrame('r0', 'up')
    };
    return F;
  }

  /* ---------- State ---------- */
  var calm = RW.reduceMotion;
  var G = 2200, SPEED = calm ? 300 : 520, TROT = calm ? 140 : 190;
  var cv, ctx, W = 0, H = 0, dpr = 1, PX = 3, ground = 0, R = 13;
  var raf = 0, last = 0, active = false, leaving = false, found = false;
  var dog, ball, dust = [], woof = null, fetches = 0;
  var pointerX = null, movedAt = 0, idleSince = 0;
  var navImg = RW.$('.nav-brand img'), pill, bone;
  var logo = new Image(); logo.src = 'assets/rw-logo.png';

  function setup() {
    if (cv) return;
    cv = document.createElement('canvas');
    cv.className = 'dog-canvas'; cv.setAttribute('aria-hidden', 'true');
    document.body.appendChild(cv);
    ctx = cv.getContext('2d');
    pill = document.createElement('button');
    pill.type = 'button'; pill.className = 'dog-home'; pill.hidden = true;
    pill.innerHTML = '<span aria-hidden="true">✕</span> <i>send the dog </i>home';
    pill.addEventListener('click', function () { dismiss(); });
    document.body.appendChild(pill);
  }

  function size() {
    if (!cv) return;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = innerWidth; H = innerHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    PX = Math.round((W < 900 ? 3 : 3.5) * dpr) / dpr; // whole device pixels per sprite pixel
    R = W < 560 ? 11 : W < 900 ? 13 : 15;
    ground = H - 6;
    if (dog) dog.x = Math.max(-80, Math.min(W + 80, dog.x));
    if (ball && ball.x > W - R) ball.x = W - R;
  }
  window.addEventListener('resize', function () { if (active) size(); });

  function mouth() {
    var fx = dog.dir > 0 ? MOUTH[0] - SW / 2 : SW / 2 - MOUTH[0];
    return { x: dog.x + fx * PX, y: ground - (SH - 1) * PX - dog.h - dog.bob + MOUTH[1] * PX };
  }

  /* ---------- Summon / dismiss ---------- */
  function summon() {
    setup(); size();
    var fromLeft = pointerX === null ? true : pointerX > W / 2;
    if (!active || !dog) dog = { x: fromLeft ? -50 : W + 50, h: 0, vy: 0, vx: 0, dir: fromLeft ? 1 : -1, phase: 0, bob: 0, state: 'enter', t: 0 };
    else { dog.state = 'enter'; dog.t = 0; }
    dog.target = Math.max(80, Math.min(W - 80, W * (fromLeft ? 0.38 : 0.62)));
    if (!ball || ball.state === 'home') finishHome();
    if (!ball || ball.state === 'nav') ball = { state: 'nav', x: 0, y: 0, vx: 0, vy: 0, rot: 0, size: R * 2 };
    active = true; leaving = false;
    pill.hidden = false;
    if (bone) bone.setAttribute('aria-pressed', 'true');
    if (!found) { found = true; RW.egg('dog'); }
    RW.toast(RW.finePointer ? '🐕 He got out! Click anywhere to throw.' : '🐕 He got out! Tap anywhere to throw.');
    start();
  }

  function dismiss() {
    if (!active || leaving) return;
    leaving = true;
    pill.hidden = true;
    if (bone) bone.setAttribute('aria-pressed', 'false');
    var nav = RW.$('.nav'); if (nav) nav.classList.remove('hidden'); // so the logo has a slot to land in
    if (ball.state === 'nav') { goHome(); return; }
    var p = ball.state === 'held' ? mouth() : ball;
    ball.from = { x: p.x, y: p.y, size: ball.size };
    ball.state = 'home'; ball.t = 0;
    dog.state = 'watch'; dog.t = 0;
  }

  function finishHome() {
    if (navImg) navImg.style.visibility = '';
    if (ball) ball.state = 'nav';
  }

  function goHome() {
    dog.state = 'leave';
    dog.dir = dog.x < W / 2 ? -1 : 1;
  }

  function toggle() { if (active && !leaving) dismiss(); else summon(); }

  function popLogo() {
    var r = navImg && navImg.getBoundingClientRect();
    if (navImg) navImg.style.visibility = 'hidden';
    ball.x = r && r.width ? r.left + r.width / 2 : W / 2;
    ball.y = r && r.width ? r.top + r.height / 2 : -20;
    ball.size = r && r.width ? r.width : R * 2;
    ball.vx = (dog.x - ball.x) * 0.6 + (Math.random() - 0.5) * 200;
    ball.vy = -500; ball.vr = 8; ball.state = 'free';
    dog.state = 'look'; dog.t = 0;
  }

  /* ---------- Throwing ---------- */
  var SKIP = 'a, button, input, textarea, select, label, summary, iframe, [role="button"], [contenteditable], [tabindex], .terminal, .game-modal, .hire-panel, .ach-panel, .mini-player, .credits, .ad-break';
  document.addEventListener('click', function (e) {
    if (!active || leaving || e.button !== 0 || !ball || ball.state !== 'held') return;
    if (e.target.closest && e.target.closest(SKIP)) return;
    if (document.body.classList.contains('modal-open')) return;
    var sel = window.getSelection && window.getSelection().toString(); if (sel) return;
    pointerX = e.clientX;
    throwTo(e.clientX, e.clientY);
  });

  function throwTo(tx, ty) {
    var m = mouth();
    // Aim so the top of the arc passes through the click.
    var rise = Math.max(60, Math.min(H * 1.1, m.y - ty));
    var vy = -Math.sqrt(2 * G * rise), t = -vy / G;
    var vx = Math.max(-2400, Math.min(2400, (tx - m.x) / t));
    ball.state = 'free'; ball.x = m.x; ball.y = m.y; ball.vx = vx; ball.vy = vy; ball.vr = vx / 60;
    ball.thrown = true;
    dog.state = 'wait'; dog.t = 0; dog.dir = vx >= 0 ? 1 : -1;
  }

  /* ---------- Particles ---------- */
  function puff(x, n, dir) {
    if (calm) n = Math.ceil(n / 3);
    for (var i = 0; i < n; i++) {
      dust.push({ x: x + (Math.random() - 0.5) * 16, y: ground - 2 - Math.random() * 4, vx: (-dir * (40 + Math.random() * 90)) + (Math.random() - 0.5) * 40, vy: -20 - Math.random() * 50, life: 0, max: 0.35 + Math.random() * 0.3, s: 1 + Math.round(Math.random()) });
    }
  }
  function say(text) { woof = { text: text, t: 0 }; }

  /* ---------- Simulation ---------- */
  function runToward(x, speed, dt) {
    var dx = x - dog.x, want = Math.abs(dx) < 4 ? 0 : (dx > 0 ? 1 : -1) * Math.min(speed, Math.abs(dx) * 4 + 40);
    var turning = want !== 0 && dog.vx !== 0 && (want > 0) !== (dog.vx > 0);
    if (turning && Math.abs(dog.vx) > 220 && dog.h === 0 && !dog.skid) { dog.skid = true; puff(dog.x - dog.dir * 10, 8, -dog.dir); }
    var acc = turning ? 5 : 7;
    dog.vx += (want - dog.vx) * Math.min(1, dt * acc);
    if (!turning) dog.skid = false;
    if (Math.abs(dog.vx) > 25) dog.dir = dog.vx > 0 ? 1 : -1;
    else if (want) dog.dir = want > 0 ? 1 : -1;
    return Math.abs(dx);
  }

  function step(dt) {
    var t0 = dog.state;
    dog.t += dt;
    var homeX = Math.max(60, Math.min(W - 24 - (pill.offsetWidth || 0) - SW / 2 * PX, pointerX === null ? dog.target : pointerX));
    var reach = PX * 9; // centre to mouth

    switch (dog.state) {
      case 'enter':
        if (runToward(dog.target, SPEED, dt) < 12 && Math.abs(dog.vx) < 120) popLogo();
        break;
      case 'look': case 'wait': case 'watch':
        runToward(dog.x, SPEED, dt);
        if (dog.state === 'watch') { if (ball.state === 'nav') goHome(); break; }
        if (ball.state === 'free') dog.dir = ball.x > dog.x ? 1 : -1;
        if (dog.t > (dog.state === 'look' ? 0.35 : 0.12)) dog.state = 'chase';
        break;
      case 'chase':
        var lead = ball.x + ball.vx * 0.12, side = lead > dog.x ? 1 : -1;
        runToward(lead - side * reach, SPEED, dt);
        var m = mouth(), air = ground - ball.y;
        // Jump for it when it's coming down within reach.
        if (!calm && dog.h === 0 && ball.vy > 0 && air > 70 && air < 220 && Math.abs(m.x + dog.vx * 0.1 - ball.x) < 80) {
          dog.vy = 720; dog.h = 0.01; puff(dog.x, 5, dog.dir);
        }
        if (Math.hypot(m.x - ball.x, m.y - ball.y) < R + 15) grab(dog.h > 8);
        break;
      case 'return':
        if (runToward(homeX, ball.thrown ? SPEED * 0.75 : SPEED * 0.6, dt) < 14 && Math.abs(dog.vx) < 60) {
          dog.state = 'idle'; idleSince = performance.now();
          if (ball.thrown) delivered();
        }
        break;
      case 'idle': case 'sit':
        runToward(dog.x, SPEED, dt);
        dog.vx *= 0.8;
        if (pointerX !== null) dog.dir = pointerX > dog.x ? 1 : -1;
        if (RW.finePointer && pointerX !== null && performance.now() - movedAt < 1200 && Math.abs(pointerX - dog.x) > 90) dog.state = 'follow';
        else if (dog.state === 'idle' && performance.now() - idleSince > 2600) dog.state = 'sit';
        break;
      case 'follow':
        if (runToward(homeX, TROT, dt) < 30) { dog.state = 'idle'; idleSince = performance.now(); }
        break;
      case 'leave':
        dog.vx += (dog.dir * SPEED - dog.vx) * Math.min(1, dt * 6);
        if (dog.x < -80 || dog.x > W + 80) { stop(); return; }
        break;
    }
    if (t0 !== dog.state && dog.state === 'chase' && Math.abs(dog.vx) < 50) puff(dog.x - dog.dir * 12, 4, dog.dir);

    // Body
    dog.x += dog.vx * dt;
    if (dog.h > 0) {
      dog.vy -= G * dt; dog.h += dog.vy * dt;
      if (dog.h <= 0) { dog.h = 0; dog.vy = 0; puff(dog.x, 6, dog.dir); }
    }
    var spd = Math.abs(dog.vx);
    dog.phase += spd * dt / 15; // a frame every ~15px of ground covered
    dog.bob = dog.h === 0 && spd > 40 ? Math.abs(Math.sin(dog.phase * Math.PI / 2)) * Math.min(1, spd / 300) * PX * 1.3 : 0;

    stepBall(dt);

    for (var i = dust.length - 1; i >= 0; i--) {
      var p = dust[i]; p.life += dt;
      if (p.life > p.max) { dust.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.92; p.vy *= 0.92;
    }
    if (woof) { woof.t += dt; if (woof.t > 0.9) woof = null; }
  }

  function grab(inAir) {
    ball.state = 'held'; ball.vx = ball.vy = 0;
    dog.state = 'return'; dog.t = 0;
    if (ball.thrown) {
      fetches++;
      say(inAir ? 'nice!' : 'woof!');
      if (inAir) RW.burst(mouth().x, mouth().y, 14);
    }
  }

  function delivered() {
    ball.thrown = false;
    if (fetches && fetches % 5 === 0) {
      RW.burst(dog.x, ground - SH * PX, 60);
      RW.toast('Good boy! ' + fetches + ' fetches 🐶');
    }
  }

  function stepBall(dt) {
    if (ball.state === 'held') {
      var m = mouth(); ball.x = m.x + dog.dir * 3; ball.y = m.y + 3;
      ball.size += (R * 1.7 - ball.size) * Math.min(1, dt * 10);
      ball.rot += ((dog.dir > 0 ? 0.25 : -0.25) - ball.rot) * Math.min(1, dt * 10);
      return;
    }
    if (ball.state === 'home') {
      ball.t = Math.min(1, ball.t + dt / 0.75);
      var r = navImg && navImg.getBoundingClientRect(), k = ball.t, e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      var tx = r && r.width ? r.left + r.width / 2 : W / 2, ty = r && r.width ? r.top + r.height / 2 : -40;
      var cx = (ball.from.x + tx) / 2, cy = Math.min(ball.from.y, ty) - 160;
      ball.x = (1 - e) * (1 - e) * ball.from.x + 2 * (1 - e) * e * cx + e * e * tx;
      ball.y = (1 - e) * (1 - e) * ball.from.y + 2 * (1 - e) * e * cy + e * e * ty;
      ball.size = ball.from.size + ((r && r.width ? r.width : 32) - ball.from.size) * e;
      ball.rot = (1 - e) * Math.PI * 4;
      if (ball.t >= 1) { finishHome(); goHome(); }
      return;
    }
    if (ball.state !== 'free') return;
    ball.size += (R * 2 - ball.size) * Math.min(1, dt * 4);
    ball.vy += G * dt;
    ball.x += ball.vx * dt; ball.y += ball.vy * dt; ball.rot += ball.vr * dt;
    var rad = ball.size / 2;
    if (ball.x < rad) { ball.x = rad; ball.vx = -ball.vx * 0.7; }
    if (ball.x > W - rad) { ball.x = W - rad; ball.vx = -ball.vx * 0.7; }
    if (ball.y > ground - rad) {
      ball.y = ground - rad;
      if (ball.vy > 160) { if (ball.vy > 500) puff(ball.x, 3, 0); ball.vy = -ball.vy * 0.55; ball.vx *= 0.85; }
      else ball.vy = 0;
    }
    if (ball.vy === 0) { // rolling
      ball.vx *= Math.exp(-2.4 * dt);
      ball.vr = ball.vx / rad;
      if (Math.abs(ball.vx) < 4) ball.vx = 0;
    }
  }

  /* ---------- Drawing ---------- */
  function snap(v) { return Math.round(v * dpr) / dpr; }

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    var f = frames(), spd = Math.abs(dog.vx), now = performance.now(), img;
    if (dog.h > 0) img = f.jump;
    else if (spd > 30) img = f.run[Math.floor(dog.phase) % 4];
    else if (dog.state === 'sit') img = f.sit[Math.floor(now / 160) % 2];
    else img = f.stand[Math.floor(now / (dog.state === 'idle' ? 140 : 220)) % 2];

    // Shadows
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    var sw = Math.max(0.4, 1 - dog.h / 200);
    ctx.beginPath(); ctx.ellipse(dog.x, ground - 1, 26 * sw, 4 * sw, 0, 0, Math.PI * 2); ctx.fill();
    if (ball.state === 'free') {
      var bs = Math.max(0.2, 1 - (ground - ball.y) / 300);
      ctx.beginPath(); ctx.ellipse(ball.x, ground - 1, ball.size / 2 * bs, 3 * bs, 0, 0, Math.PI * 2); ctx.fill();
    }

    // Dust
    dust.forEach(function (p) {
      ctx.fillStyle = 'rgba(226,206,172,' + (0.4 * (1 - p.life / p.max)).toFixed(3) + ')';
      var s = p.s * PX * (0.8 + p.life / p.max * 0.7);
      ctx.fillRect(snap(p.x - s / 2), snap(p.y - s / 2), s, s);
    });

    // Dog
    ctx.imageSmoothingEnabled = false;
    var left = snap(dog.x - SW / 2 * PX), top = snap(ground - (SH - 1) * PX - dog.h - dog.bob);
    ctx.drawImage(dog.dir > 0 ? img.r : img.l, left, top, SW * PX, SH * PX);

    // Logo
    if (ball.state !== 'nav' && logo.complete && logo.naturalWidth) {
      ctx.imageSmoothingEnabled = true;
      ctx.save(); ctx.translate(ball.x, ball.y); ctx.rotate(ball.rot);
      ctx.drawImage(logo, -ball.size / 2, -ball.size / 2, ball.size, ball.size);
      ctx.restore();
    }

    if (woof) {
      var a = Math.min(1, (0.9 - woof.t) * 4);
      ctx.globalAlpha = a; ctx.fillStyle = '#fff';
      ctx.font = '700 12px "JetBrains Mono", ui-monospace, monospace'; ctx.textAlign = 'center';
      ctx.fillText(woof.text, dog.x + dog.dir * 10, top - 6 - woof.t * 14);
      ctx.globalAlpha = 1;
    }
  }

  /* ---------- Loop: only runs while the dog is out ---------- */
  function tick(now) {
    raf = 0;
    var dt = Math.max(0, Math.min(1 / 30, (now - last) / 1000)); last = now;
    cv.style.visibility = document.body.classList.contains('modal-open') ? 'hidden' : '';
    step(dt);
    if (!active) return;
    draw();
    raf = requestAnimationFrame(tick);
  }
  function start() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(tick); } }
  function stop() {
    active = false; leaving = false;
    if (raf) cancelAnimationFrame(raf); raf = 0;
    if (ctx) ctx.clearRect(0, 0, cv.width, cv.height);
    dust = []; woof = null; dog = null;
    finishHome();
  }

  /* ---------- Triggers ---------- */
  var buf = '';
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      var hp = document.getElementById('hire-panel');
      if (active && !leaving && !document.body.classList.contains('modal-open') && (!hp || hp.hidden)) dismiss();
      return;
    }
    var el = e.target;
    if (e.ctrlKey || e.metaKey || e.altKey || !e.key || e.key.length !== 1) return;
    if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
    buf = (buf + e.key.toLowerCase()).slice(-3);
    if (buf === 'dog') { buf = ''; toggle(); }
  });

  window.addEventListener('pointermove', function (e) {
    if (!active || e.pointerType !== 'mouse') return;
    pointerX = e.clientX; movedAt = performance.now();
  }, { passive: true });

  RW.commands.dog = function () {
    if (active && !leaving) { RW.print('🐕 Okay buddy, give it back. He\'s returning the logo.', 'dim'); dismiss(); }
    else { RW.print('🐕 *whistle* — he\'s loose. Click anywhere to throw. Esc or <span class="p">dog</span> again sends him home.', 'ok'); summon(); }
  };

  var slot = RW.$('.footer .wrap span:first-child');
  if (slot) {
    bone = document.createElement('button');
    bone.type = 'button'; bone.className = 'dog-bone';
    bone.setAttribute('aria-label', 'Whistle for the dog'); bone.setAttribute('aria-pressed', 'false');
    bone.title = 'Whistle for the dog';
    bone.textContent = '🦴';
    bone.addEventListener('click', toggle);
    slot.appendChild(bone);
  }
})();
