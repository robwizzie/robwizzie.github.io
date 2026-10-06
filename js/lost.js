/* The 404 page: one of the Fetch dogs trots in with the missing page in its mouth. "Drop it!" makes the
   dog give it up; "Fetch the homepage" sends the dog running and you home. Same models as js/dog.js. */
(function () {
  'use strict';
  var $ = function (s) { return document.querySelector(s); };
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.getElementById('year').textContent = new Date().getFullYear();

  /* ---------- What were they looking for? ---------- */
  var path = decodeURIComponent(location.pathname + location.search).slice(0, 80) || '/';
  $('#lost-path').textContent = path;
  var GUESSES = [
    [/resume|cv|pdf/i, '/Robert%20Wiscount%20Resume.pdf', 'my resume (PDF)'],
    [/fetch|game|play|godot/i, '/#fetch', 'Fetch, my game'],
    [/lebron|music|spotify/i, '/#lebronify', 'LeBronify'],
    [/mile|run|streak|mad/i, '/#mile-a-day', 'Mile A Day'],
    [/work|project|portfolio/i, '/#work', 'my projects'],
    [/contact|hire|email|mail/i, '/#contact', 'how to reach me'],
    [/about|bio|me\b/i, '/#about', 'about me'],
    [/how|colophon|stack|built/i, '/how-it-works.html', 'how this site works'],
    [/experience|job|foley/i, '/#experience', 'my experience'],
    [/llms|ai|agent/i, '/llms.txt', 'the profile for AI agents']
  ];
  var g = GUESSES.filter(function (x) { return x[0].test(path); })[0];
  if (g) { $('#lost-guess-link').href = g[1]; $('#lost-guess-link').textContent = g[2]; $('#lost-guess').hidden = false; }

  /* ---------- The pack (sizes and mouth grips from the game's data, as in js/dog.js) ---------- */
  var DOGS = {
    shadow: { name: 'Shadow', scale: 1.1, grip: [0.74, 0.6], he: true },
    goose: { name: 'Goose', scale: 1.122, grip: [0.69, 0.56], he: true },
    luna: { name: 'Luna', scale: 1.045, grip: [0.64, 0.74] },
    barkley: { name: 'Barkley', scale: 1.045, grip: [0.75, 0.56], he: true },
    posey: { name: 'Posey', scale: 1.188, grip: [0.93, 0.785] }
  };
  var ids = Object.keys(DOGS), id = ids[Math.floor(Math.random() * ids.length)], D = DOGS[id];
  $('#lost-name').textContent = D.name;
  $('#lost-drop span').textContent = 'Drop it, ' + D.name + '!';
  $('#lost-stage').setAttribute('aria-label', D.name + ', a dog from Fetch, trotting in with the missing page in ' + (D.he ? 'his' : 'her') + ' mouth');

  var stage = $('#lost-stage'), say = $('#lost-say'), sayT = 0;
  function speak(text) {
    say.textContent = text; say.classList.add('show');
    clearTimeout(sayT); sayT = setTimeout(function () { say.classList.remove('show'); }, 1400);
  }

  var T = window.RWThree, ok = !!T;
  try { if (ok) { var probe = document.createElement('canvas'); ok = !!(probe.getContext('webgl2') || probe.getContext('webgl')); } } catch (e) { ok = false; }
  if (!ok) { stage.classList.add('flat'); return wire(null); }

  /* ---------- Scene ---------- */
  var canvas = document.createElement('canvas');
  stage.insertBefore(canvas, say);
  var renderer = new T.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true });
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  var scene = new T.Scene();
  scene.add(new T.HemisphereLight(0xe4ecff, 0x1a2133, 2.3));
  var key = new T.DirectionalLight(0xffffff, 2.4); key.position.set(-2, 4, 5); scene.add(key);
  var rim = new T.DirectionalLight(0x8db2ff, 1.5); rim.position.set(3, 2, -4); scene.add(rim);
  var cam = new T.PerspectiveCamera(26, 2, 0.1, 100);

  // A soft contact shadow, and the page itself: a sheet of paper with the missing path on it.
  function tex(w, h, draw) { var c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); var t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t; }
  var shadow = new T.Mesh(new T.PlaneGeometry(1.6, 0.7), new T.MeshBasicMaterial({ transparent: true, depthWrite: false, map: tex(128, 64, function (x, w, h) {
    var gr = x.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(0,0,0,.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = gr; x.fillRect(0, 0, w, h);
  }) }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.002; scene.add(shadow);

  function drawPage(x, w, h) {
    x.fillStyle = '#f7f8fb'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#dfe5f2'; x.beginPath(); x.moveTo(w - 60, 0); x.lineTo(w, 60); x.lineTo(w - 60, 60); x.closePath(); x.fill(); // folded corner
    x.fillStyle = '#5b8ff9'; x.font = '700 120px "Saira Extra Condensed", Arial Narrow, sans-serif'; x.textAlign = 'center'; x.fillText('404', w / 2, 170);
    x.fillStyle = '#1b2233'; x.font = '600 22px "JetBrains Mono", monospace';
    var p = path.length > 22 ? path.slice(0, 21) + '…' : path; x.fillText(p, w / 2, 220);
    x.fillStyle = '#d5dcea'; for (var i = 0; i < 6; i++) x.fillRect(46, 262 + i * 26, i === 5 ? 140 : w - 92, 9);
    x.strokeStyle = 'rgba(0,0,0,.08)'; x.lineWidth = 2; x.strokeRect(1, 1, w - 2, h - 2);
  }
  var pageTex = tex(340, 440, drawPage);
  var sheet = new T.Mesh(new T.PlaneGeometry(0.34, 0.44), new T.MeshStandardMaterial({ side: T.DoubleSide, roughness: 0.9, map: pageTex }));
  scene.add(sheet);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { // redraw once Saira and JetBrains Mono are in
    drawPage(pageTex.image.getContext('2d'), 340, 440); pageTex.needsUpdate = true; if (model) start();
  });

  var model = null, mixer = null, run = null, sock = null, tail = [], head = null, v = new T.Vector3();
  var dog = { x: reduce ? 0 : -3.4, vx: 0, target: 0, state: reduce ? 'idle' : 'enter', yaw: Math.PI / 2 - 0.5, h: 0, vy: 0 };
  var paper = { held: true, x: 0, y: 0, z: 0, vy: 0, rx: 0, rz: 0 };
  var leaving = false, raf = 0, last = 0, onScreen = true;

  function size() {
    var w = stage.clientWidth, h = stage.clientHeight;
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setSize(w, h, false);
    cam.aspect = w / h;
    // Frame the action: pull back on narrow screens so the whole run fits.
    var dist = w < 560 ? 5.2 : 4.1;
    cam.position.set(0, 1.15, dist); cam.lookAt(0, 0.55, 0); cam.updateProjectionMatrix();
  }
  window.addEventListener('resize', size);

  new T.GLTFLoader().loadAsync('/assets/dogs/' + id + '.glb').then(function (g) {
    var m = g.scene, box = new T.Box3().setFromObject(m), k = 1.2 / (box.max.y - box.min.y) * D.scale * 0.85;
    m.scale.setScalar(k);
    box.setFromObject(m);
    m.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
    model = new T.Group(); model.add(m); scene.add(model);
    model.updateMatrixWorld(true);
    head = m.getObjectByName('head');
    tail = [m.getObjectByName('tailstart'), m.getObjectByName('tail1')].filter(Boolean);
    sock = new T.Object3D(); sock.position.set(0, D.grip[0] * D.scale * 0.85, D.grip[1] * D.scale * 0.85);
    model.add(sock); model.updateMatrixWorld(true);
    if (head) head.attach(sock);
    mixer = new T.AnimationMixer(m); run = mixer.clipAction(g.animations[0]); run.play(); run.setEffectiveWeight(0);
    size(); start();
    if (!reduce) setTimeout(function () { if (dog.state === 'enter' || dog.state === 'idle') speak(paper.held ? 'mmf! 📄' : 'woof!'); }, 1500);
  }).catch(function () { stage.classList.add('flat'); canvas.remove(); });

  function step(dt, now) {
    // Walk to the mark, then stand and wag. "home" runs off to the right.
    var want = dog.state === 'home' ? 6 : dog.target;
    var dx = want - dog.x, speed = dog.state === 'home' ? 4.2 : 1.6;
    var goal = Math.abs(dx) < 0.02 ? 0 : Math.sign(dx) * Math.min(speed, Math.abs(dx) * 3 + 0.2);
    dog.vx += (goal - dog.vx) * Math.min(1, dt * 5);
    dog.x += dog.vx * dt;
    if (dog.state === 'enter' && Math.abs(dx) < 0.03 && Math.abs(dog.vx) < 0.05) dog.state = 'idle';
    if (dog.h > 0 || dog.vy > 0) { dog.vy -= 9.8 * dt; dog.h = Math.max(0, dog.h + dog.vy * dt); if (dog.h === 0) dog.vy = 0; }

    // Face where he's going while moving; turn toward the camera to show off once he's stopped.
    var face = Math.abs(dog.vx) > 0.15 ? (dog.vx > 0 ? Math.PI / 2 - 0.25 : -Math.PI / 2 + 0.25) : 0.55;
    dog.yaw += (face - dog.yaw) * Math.min(1, dt * 4);
    model.position.set(dog.x, dog.h, 0);
    model.rotation.y = dog.yaw;
    shadow.position.x = dog.x; shadow.scale.setScalar(1 - Math.min(0.5, dog.h));

    var spd = Math.abs(dog.vx), w = Math.min(1, spd / 0.6);
    run.setEffectiveWeight(dog.h > 0 ? 0.5 : w);
    run.timeScale = Math.max(0.7, spd * 1.25);
    mixer.update(dt);
    var happy = paper.held ? 0.5 : 1;
    var wag = Math.sin(now / (paper.held ? 140 : 85)) * 0.6 * happy * (1 - w * 0.6);
    tail.forEach(function (b, i) { b.rotateZ(wag * (i ? 0.7 : 1)); });
    if (head && !paper.held) head.rotateX(-0.12 - Math.sin(now / 600) * 0.06); // looking up at you

    // The page: in the mouth, or falling to the ground and settling.
    model.updateMatrixWorld(true);
    if (paper.held) {
      sock.getWorldPosition(v);
      paper.x = v.x; paper.y = v.y - 0.16; paper.z = v.z + 0.05;
      paper.rz = Math.sin(now / 160) * 0.08 * (0.4 + w);
      sheet.rotation.set(0, dog.yaw * 0.25, paper.rz);
    } else if (paper.y > 0.012) {
      paper.vy -= 9.8 * dt; paper.y = Math.max(0.012, paper.y + paper.vy * dt);
      paper.rx += (-Math.PI / 2 + 0.08 - paper.rx) * Math.min(1, dt * 7);
      sheet.rotation.set(paper.rx, 0.3, paper.rz * 0.5);
    }
    sheet.position.set(paper.x, paper.y, paper.z);
  }

  function frame(now) {
    raf = 0;
    var dt = Math.min(1 / 30, Math.max(0, (now - last) / 1000)); last = now;
    step(dt, now);
    renderer.render(scene, cam);
    // The tail never stops wagging, so this runs while the stage is on screen and the tab is visible.
    // With reduced motion it draws only when something changes (a button press).
    if (!reduce && onScreen && !document.hidden) raf = requestAnimationFrame(frame);
  }
  function start() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } }
  // Reduced motion: a button press snaps everything to where it ends up, then draws once.
  function settle() { if (!reduce) return; dog.vy = 0; dog.h = 0; if (!paper.held) { paper.y = 0.012; paper.rx = -Math.PI / 2 + 0.08; } step(0, 0); renderer.render(scene, cam); }
  if ('IntersectionObserver' in window) new IntersectionObserver(function (en) { onScreen = en[0].isIntersecting; if (onScreen && model) start(); }).observe(stage);
  document.addEventListener('visibilitychange', function () { if (!document.hidden && model) start(); });

  wire({
    drop: function () {
      if (!paper.held) { dog.vy = reduce ? 0 : 3.2; speak('woof! 🐾'); start(); return; }
      paper.held = false; paper.vy = 0.6; paper.rx = 0;
      if (!reduce) dog.vy = 2.6; // a happy hop
      speak('ok ok, here 📄'); start(); settle();
    },
    home: function (href) {
      if (reduce || leaving) return false;
      leaving = true;
      if (!paper.held) { paper.held = true; }
      dog.state = 'home'; speak('🏃 this way!'); start();
      setTimeout(function () { location.href = href; }, 1100);
      return true;
    }
  });

  function wire(api) {
    $('#lost-drop').addEventListener('click', function () {
      if (api) api.drop();
      else speak('woof! 🐾');
    });
    $('#lost-home').addEventListener('click', function (e) {
      if (api && api.home(this.getAttribute('href'))) e.preventDefault();
    });
  }
})();
