/* The Fetch dogs get loose: type "dog", run `dog [name]` in the terminal, or find the bone in the footer.
   One of the five real dogs from Fetch (the game's own rigged models, shrunk for the web) runs along the
   bottom of the screen, steals the nav logo, and every click throws it. three.js and the model only load
   on the first whistle, and nothing animates while the dog is home. */
(function () {
  'use strict';
  var RW = window.RW;
  if (!RW) return;

  /* ---------- The pack: sizes and mouth grips come from the game's data/dogs/*.tres ---------- */
  var DOGS = {
    shadow: { name: 'Shadow', scale: 1.1, grip: [0.74, 0.6], line: 'Balanced and reliable.' },
    goose: { name: 'Goose', scale: 1.122, grip: [0.69, 0.56], line: 'Stronger throws. A little slower.' },
    luna: { name: 'Luna', scale: 1.045, grip: [0.64, 0.74], line: 'Fast and agile. Small target.' },
    barkley: { name: 'Barkley', scale: 1.045, grip: [0.75, 0.56], line: 'Small paws. Big dodges.' },
    posey: { name: 'Posey', scale: 1.1, grip: [0.93, 0.785], line: 'Larger catch window. Beginner friendly.' }
  };
  var IDS = Object.keys(DOGS);

  /* ---------- State ---------- */
  var calm = RW.reduceMotion;
  var G = 2200, SPEED = calm ? 300 : 520, TROT = calm ? 140 : 190;
  var W = 0, H = 0, dpr = 1, DOGH = 80, ground = 0, R = 13, STRIP = 300;
  var under, uctx, over, octx, gl = null;
  var raf = 0, last = 0, active = false, leaving = false, found = false, loading = false;
  var dog, ball, dust = [], woof = null, fetches = 0, who = null;
  var pointerX = null, movedAt = 0, idleSince = 0;
  var navImg = RW.$('.nav-brand img'), pill, bone;
  var logo = new Image(); logo.src = 'assets/rw-logo.png';

  function canvas(cls) {
    var c = document.createElement('canvas');
    c.className = 'dog-canvas ' + cls; c.setAttribute('aria-hidden', 'true');
    document.body.appendChild(c);
    return c;
  }
  function setup() {
    if (under) return;
    under = canvas('under'); uctx = under.getContext('2d'); // shadows and dust, behind the dog
    over = canvas('over'); octx = over.getContext('2d');    // the logo and "woof!", in front
    pill = document.createElement('button');
    pill.type = 'button'; pill.className = 'dog-home'; pill.hidden = true;
    pill.innerHTML = '<span aria-hidden="true">✕</span> <i>send the dog </i>home';
    pill.addEventListener('click', function () { dismiss(); });
    document.body.appendChild(pill);
  }

  function size() {
    if (!under) return;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = innerWidth; H = innerHeight;
    [under, over].forEach(function (c) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); });
    DOGH = (W < 560 ? 52 : W < 900 ? 62 : 74) * (who ? DOGS[who].scale : 1.1);
    R = W < 560 ? 11 : W < 900 ? 13 : 15;
    STRIP = Math.round(DOGH * 3.2);
    ground = H - 6;
    if (gl) gl.resize();
    if (dog) dog.x = Math.max(-120, Math.min(W + 120, dog.x));
    if (ball && ball.x > W - R) ball.x = W - R;
  }
  window.addEventListener('resize', function () { if (active) size(); });

  /* ---------- 3D: a WebGL strip along the bottom, camera in CSS pixels ---------- */
  function loadScript(src) {
    return new Promise(function (res, rej) {
      if (window.RWThree) return res();
      var s = document.createElement('script'); s.src = src; s.async = true;
      s.onload = res; s.onerror = rej; document.head.appendChild(s);
    });
  }

  function makeGL() {
    var T = window.RWThree;
    var c = canvas('gl');
    var renderer;
    try { renderer = new T.WebGLRenderer({ canvas: c, alpha: true, antialias: true, powerPreference: 'low-power' }); }
    catch (e) { c.remove(); throw e; }
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
    var scene = new T.Scene();
    scene.add(new T.HemisphereLight(0xe4ecff, 0x1a2133, 2.3));
    var key = new T.DirectionalLight(0xffffff, 2.4); key.position.set(-200, 400, 500); scene.add(key);
    var rim = new T.DirectionalLight(0x8db2ff, 1.4); rim.position.set(300, 150, -400); scene.add(rim);
    var cam = new T.OrthographicCamera(0, 1, 0, -1, -2000, 2000); cam.position.z = 1000;
    // body (screen position) > tilt (lean for jumps) > yaw (which way he faces) > model
    var body = new T.Group(), tilt = new T.Group(), yaw = new T.Group();
    body.add(tilt); tilt.add(yaw); scene.add(body);
    tilt.rotation.x = 0.16; // look down on him a touch, so he reads as 3D
    var loader = new T.GLTFLoader(), cache = {}, cur = null, v = new T.Vector3(), ax = new T.Vector3();
    var hq = body.quaternion.clone(), bq = body.quaternion.clone();

    function resize() {
      renderer.setPixelRatio(dpr);
      renderer.setSize(W, STRIP, false);
      c.style.height = STRIP + 'px';
      cam.left = 0; cam.right = W; cam.top = -(H - STRIP); cam.bottom = -H;
      cam.updateProjectionMatrix();
    }

    // A one-key clip holding the bind pose, but with the run clip's hip scale: the exported runs shrink the
    // hips to 0.63–0.79×, so blending back to the raw bind pose made a resting dog balloon to full size.
    function standClip(m, clip) {
      var tracks = clip.tracks.map(function (t) {
        var dot = t.name.lastIndexOf('.'), node = m.getObjectByName(t.name.slice(0, dot)), prop = t.name.slice(dot + 1);
        var val = prop === 'scale' ? Array.prototype.slice.call(t.values, 0, 3) : node[prop].toArray();
        return new t.constructor(t.name, [0], val);
      });
      return new clip.constructor('stand', 1, tracks);
    }

    // Height, and where the feet and chest sit, in the current pose (holder space; the rigs face +Z).
    function measure(holder, skins) {
      holder.updateMatrixWorld(true);
      var b = new T.Box3();
      skins.forEach(function (s) { s.computeBoundingBox(); b.union(s.boundingBox.clone().applyMatrix4(s.matrixWorld)); });
      return { h: b.max.y - b.min.y, y: -b.min.y, z: -(b.min.z + b.max.z) / 2 };
    }

    function load(id) {
      if (cache[id]) return Promise.resolve(cache[id]);
      return loader.loadAsync('assets/dogs/' + id + '.glb').then(function (g) {
        var m = g.scene, clip = g.animations[0], skins = [];
        m.traverse(function (o) { if (o.isSkinnedMesh) skins.push(o); });
        var stand = standClip(m, clip); // before anything animates, while the bones still hold the bind pose
        // Normalise to 1.2 m tall, feet on the floor, centred — the game's own conventions, and where its grips are measured.
        var box = new T.Box3().setFromObject(m), k = 1.2 / (box.max.y - box.min.y);
        m.scale.setScalar(k);
        box.setFromObject(m);
        m.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
        var holder = new T.Group(); holder.add(m); holder.updateMatrixWorld(true);
        // A mouth socket riding the head bone, placed where the game grips toys.
        var head = m.getObjectByName('head'), sock = new T.Object3D();
        sock.position.set(0, DOGS[id].grip[0], DOGS[id].grip[1]);
        holder.add(sock); holder.updateMatrixWorld(true);
        if (head) head.attach(sock);
        var mixer = new T.AnimationMixer(m), run = mixer.clipAction(clip), still = mixer.clipAction(stand);
        run.play(); still.play();
        // Measure both poses so feet stay planted and the size holds steady as one blends into the other.
        run.setEffectiveWeight(1); still.setEffectiveWeight(0);
        var gait = { h: 0, y: 0, z: 0 }, n = 8;
        for (var i = 0; i < n; i++) {
          run.time = clip.duration * i / n; mixer.update(0);
          var g1 = measure(holder, skins); gait.h += g1.h / n; gait.y += g1.y / n; gait.z += g1.z / n;
        }
        run.time = 0; run.setEffectiveWeight(0); still.setEffectiveWeight(1); mixer.update(0);
        var rest = measure(holder, skins);
        var d = {
          holder: holder, mixer: mixer, run: run, still: still, socket: sock, head: head,
          unit: rest.h, stand: rest, gait: gait,
          tail: [m.getObjectByName('tailstart'), m.getObjectByName('tail1')].filter(Boolean)
        };
        // The bones we nudge on top of the clip, and the clip's own pose for them.
        d.extra = d.tail.concat(head ? [head] : []);
        d.extra.forEach(function (b) { b.userData.clipQ = b.quaternion.clone(); });
        cache[id] = d;
        return d;
      });
    }

    function use(id) {
      return load(id).then(function (d) {
        if (cur) yaw.remove(cur.holder);
        cur = d; yaw.add(d.holder);
      });
    }

    function render(dt, now) {
      if (!cur || !dog) return;
      var spd = Math.abs(dog.vx), s = DOGH / cur.unit;
      body.position.set(dog.x, -(ground - dog.h - dog.bob), 0);
      body.scale.setScalar(s);
      // Turn through facing the camera, like a real dog turning around.
      var want = dog.dir > 0 ? Math.PI / 2 - 0.42 : -Math.PI / 2 + 0.42;
      dog.yaw = dog.yaw == null ? want : dog.yaw + (want - dog.yaw) * Math.min(1, dt * 9);
      yaw.rotation.y = dog.yaw;
      // Nose up on the way up, down on the way down.
      var lean = dog.h > 0 ? Math.max(-0.35, Math.min(0.35, dog.vy / 1800)) * dog.dir : 0;
      tilt.rotation.z += (lean - tilt.rotation.z) * Math.min(1, dt * 10);

      // Walk cycle, blended in with speed and played as fast as he's really going.
      var w = dog.h > 0 ? 0.6 : Math.min(1, spd / 110);
      cur.run.setEffectiveWeight(w); cur.still.setEffectiveWeight(1 - w);
      cur.run.timeScale = Math.max(0.6, spd / (DOGH * 2.6));
      cur.holder.position.set(0, cur.stand.y + (cur.gait.y - cur.stand.y) * w, cur.stand.z + (cur.gait.z - cur.stand.z) * w);
      // The mixer only writes a bone when the clip's value changes, so put back last frame's clip pose before
      // adding the wag and the head turn again. Otherwise they pile up every frame and spin in circles.
      cur.extra.forEach(function (b) { b.quaternion.copy(b.userData.clipQ); });
      cur.mixer.update(calm ? dt * 0.7 : dt);
      cur.extra.forEach(function (b) { b.userData.clipQ.copy(b.quaternion); });
      cur.holder.getWorldQuaternion(hq);

      // On top of the clip: a happy tail, and a head that watches the ball.
      var happy = dog.state === 'idle' || dog.state === 'sit' || dog.state === 'return' ? 1 : 0.35;
      var wag = Math.sin(now / (dog.state === 'sit' ? 150 : 95)) * 0.55 * happy * (1 - w * 0.6);
      cur.tail.forEach(function (b, i) { turn(b, 0, 1, 0, wag * (i ? 0.7 : 1)); }); // side to side
      if (cur.head) {
        var look = ball && ball.state === 'free' ? Math.max(-0.35, Math.min(0.5, (ground - ball.y) / 900)) : (dog.state === 'sit' ? Math.sin(now / 900) * 0.12 : 0);
        dog.look = (dog.look || 0) + (look - (dog.look || 0)) * Math.min(1, dt * 6);
        turn(cur.head, 1, 0, 0, -dog.look); // nose up
      }
      renderer.render(scene, cam);
    }

    // Rotate a bone about an axis in the dog's own frame (x: his left, y: up, z: forward). Each rig rolls its
    // bones differently, so a bone-local rotateZ wags one tail and corkscrews the next.
    function turn(b, x, y, z, a) {
      b.getWorldQuaternion(bq);
      ax.set(x, y, z).applyQuaternion(hq).applyQuaternion(bq.invert());
      b.rotateOnAxis(ax, a);
    }

    // Where his mouth is on screen, in CSS pixels.
    function mouth() {
      if (!cur) return null;
      cur.socket.getWorldPosition(v);
      return { x: v.x, y: -v.y };
    }

    resize();
    return { use: use, render: render, mouth: mouth, resize: resize, clear: function () { renderer.clear(); }, canvas: c };
  }

  function prepare(id) {
    loading = true;
    var slow = setTimeout(function () { RW.toast('🐕 Whistling for ' + DOGS[id].name + '…'); }, 350);
    return loadScript('vendor/three/rw-three.min.js')
      .then(function () { if (!gl) { setup(); size(); gl = makeGL(); } return gl.use(id); })
      .then(function () { clearTimeout(slow); loading = false; })
      .catch(function (e) {
        clearTimeout(slow); loading = false;
        RW.toast('🐕 ' + DOGS[id].name + '’s napping — this browser couldn’t load the 3D dog.');
        throw e;
      });
  }

  function mouth() {
    var m = gl && gl.mouth();
    if (m) return m;
    return { x: dog.x + dog.dir * DOGH * 0.55, y: ground - dog.h - DOGH * 0.62 };
  }

  /* ---------- Summon / dismiss ---------- */
  function pick(name) {
    var id = name && IDS.filter(function (k) { return k === name.toLowerCase(); })[0];
    if (id) return id;
    var others = IDS.filter(function (k) { return k !== who; });
    return others[Math.floor(Math.random() * others.length)];
  }

  function summon(name) {
    if (loading) return;
    var id = pick(name);
    if (!found) { found = true; RW.egg('dog'); } // whistling counts, even if this browser can't show the 3D dog
    if (active && !leaving && id === who) return;
    if (active) stop(); // a different dog takes over
    prepare(id).then(function () { go(id); }, function () {});
  }

  function go(id) {
    who = id; size();
    var fromLeft = pointerX === null ? true : pointerX > W / 2;
    dog = { x: fromLeft ? -90 : W + 90, h: 0, vy: 0, vx: 0, dir: fromLeft ? 1 : -1, bob: 0, state: 'enter', t: 0, yaw: null };
    dog.target = Math.max(100, Math.min(W - 100, W * (fromLeft ? 0.38 : 0.62)));
    finishHome();
    ball = { state: 'nav', x: 0, y: 0, vx: 0, vy: 0, rot: 0, size: R * 2 };
    active = true; leaving = false;
    pill.hidden = false;
    if (bone) bone.setAttribute('aria-pressed', 'true');
    RW.toast('🐕 ' + DOGS[id].name + ' got out! ' + (RW.finePointer ? 'Click' : 'Tap') + ' anywhere to throw.');
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
      dust.push({ x: x + (Math.random() - 0.5) * 20, y: ground - 2 - Math.random() * 4, vx: (-dir * (40 + Math.random() * 90)) + (Math.random() - 0.5) * 40, vy: -20 - Math.random() * 50, life: 0, max: 0.35 + Math.random() * 0.3, s: 4 + Math.random() * 5 });
    }
  }
  function say(text) { woof = { text: text, t: 0 }; }

  /* ---------- Simulation ---------- */
  function runToward(x, speed, dt) {
    var dx = x - dog.x, want = Math.abs(dx) < 4 ? 0 : (dx > 0 ? 1 : -1) * Math.min(speed, Math.abs(dx) * 4 + 40);
    var turning = want !== 0 && dog.vx !== 0 && (want > 0) !== (dog.vx > 0);
    if (turning && Math.abs(dog.vx) > 220 && dog.h === 0 && !dog.skid) { dog.skid = true; puff(dog.x - dog.dir * 14, 8, -dog.dir); }
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
    var homeX = Math.max(DOGH, Math.min(W - 24 - (pill.offsetWidth || 0) - DOGH * 0.7, pointerX === null ? dog.target : pointerX));
    var reach = DOGH * 0.55; // centre to mouth

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
        if (!calm && dog.h === 0 && ball.vy > 0 && air > DOGH && air < DOGH + 160 && Math.abs(m.x + dog.vx * 0.1 - ball.x) < 80) {
          dog.vy = 760; dog.h = 0.01; puff(dog.x, 5, dog.dir);
        }
        if (Math.abs(ball.x - dog.x) < DOGH * 1.2 && Math.abs(dog.vx) < 120) dog.dir = ball.x > dog.x ? 1 : -1;
        // Off the floor he dips his head for it, so on the ground reach is horizontal: the mouth rides head-high
        // and could otherwise hover over a resting ball forever.
        var low = ball.y > ground - ball.size / 2 - DOGH * 0.25;
        if (Math.hypot(m.x - ball.x, m.y - ball.y) < R + DOGH * 0.2 || (low && dog.h === 0 && Math.abs(m.x - ball.x) < R + DOGH * 0.3)) grab(dog.h > 8);
        else if (dog.t > 6 && low && Math.abs(dog.x - ball.x) < DOGH * 1.5) grab(false); // never stand there stumped
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
        if (RW.finePointer && pointerX !== null && performance.now() - movedAt < 1200 && Math.abs(pointerX - dog.x) > DOGH * 1.2) dog.state = 'follow';
        else if (dog.state === 'idle' && performance.now() - idleSince > 2600) dog.state = 'sit';
        break;
      case 'follow':
        if (runToward(homeX, TROT, dt) < 30) { dog.state = 'idle'; idleSince = performance.now(); }
        break;
      case 'leave':
        dog.vx += (dog.dir * SPEED - dog.vx) * Math.min(1, dt * 6);
        if (dog.x < -DOGH * 1.6 || dog.x > W + DOGH * 1.6) { stop(); return; }
        break;
    }
    if (t0 !== dog.state && dog.state === 'chase' && Math.abs(dog.vx) < 50) puff(dog.x - dog.dir * 16, 4, dog.dir);

    // Body
    dog.x += dog.vx * dt;
    if (dog.h > 0) {
      dog.vy -= G * dt; dog.h += dog.vy * dt;
      if (dog.h <= 0) { dog.h = 0; dog.vy = 0; puff(dog.x, 6, dog.dir); }
    }
    dog.bob = 0;

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
      RW.burst(dog.x, ground - DOGH, 60);
      RW.toast('Good ' + (who === 'luna' || who === 'posey' ? 'girl' : 'boy') + ', ' + DOGS[who].name + '! ' + fetches + ' fetches 🐶');
    }
  }

  function stepBall(dt) {
    if (ball.state === 'held') {
      var m = mouth(); ball.x = m.x; ball.y = m.y;
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

  /* ---------- Drawing: shadows and dust under the dog, the logo and "woof!" over him ---------- */
  function draw(dt, now) {
    uctx.setTransform(dpr, 0, 0, dpr, 0, 0); uctx.clearRect(0, 0, W, H);
    octx.setTransform(dpr, 0, 0, dpr, 0, 0); octx.clearRect(0, 0, W, H);

    uctx.fillStyle = 'rgba(0,0,0,.4)';
    var sw = Math.max(0.4, 1 - dog.h / 220);
    uctx.beginPath(); uctx.ellipse(dog.x, ground - 1, DOGH * 0.55 * sw, DOGH * 0.07 * sw, 0, 0, Math.PI * 2); uctx.fill();
    if (ball.state === 'free') {
      var bs = Math.max(0.2, 1 - (ground - ball.y) / 300);
      uctx.beginPath(); uctx.ellipse(ball.x, ground - 1, ball.size / 2 * bs, 3 * bs, 0, 0, Math.PI * 2); uctx.fill();
    }
    dust.forEach(function (p) {
      uctx.fillStyle = 'rgba(226,206,172,' + (0.35 * (1 - p.life / p.max)).toFixed(3) + ')';
      uctx.beginPath(); uctx.arc(p.x, p.y, p.s * (0.6 + p.life / p.max * 0.8), 0, Math.PI * 2); uctx.fill();
    });

    gl.render(dt, now);
    if (ball.state === 'held') { var m = mouth(); ball.x = m.x; ball.y = m.y; }

    if (ball.state !== 'nav' && logo.complete && logo.naturalWidth) {
      octx.save(); octx.translate(ball.x, ball.y); octx.rotate(ball.rot);
      octx.drawImage(logo, -ball.size / 2, -ball.size / 2, ball.size, ball.size);
      octx.restore();
    }
    if (woof) {
      octx.globalAlpha = Math.min(1, (0.9 - woof.t) * 4); octx.fillStyle = '#fff';
      octx.font = '700 13px "JetBrains Mono", ui-monospace, monospace'; octx.textAlign = 'center';
      octx.fillText(woof.text, dog.x + dog.dir * DOGH * 0.3, ground - dog.h - DOGH * 1.2 - woof.t * 16);
      octx.globalAlpha = 1;
    }
  }

  /* ---------- Loop: only runs while a dog is out ---------- */
  function tick(now) {
    raf = 0;
    var dt = Math.max(0, Math.min(1 / 30, (now - last) / 1000)); last = now;
    var hide = document.body.classList.contains('modal-open') ? 'hidden' : '';
    under.style.visibility = over.style.visibility = gl.canvas.style.visibility = hide;
    step(dt);
    if (!active) return;
    draw(dt, now);
    raf = requestAnimationFrame(tick);
  }
  function start() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(tick); } }
  function stop() {
    active = false; leaving = false;
    if (raf) cancelAnimationFrame(raf); raf = 0;
    [uctx, octx].forEach(function (c) { if (c) { c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, W * dpr, H * dpr); } });
    if (gl) gl.clear();
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

  RW.commands.dog = function (arg) {
    var name = (arg || '').trim().toLowerCase();
    if (name && !DOGS[name]) { RW.print('Who? The pack is: ' + IDS.map(function (k) { return DOGS[k].name; }).join(', ') + '. Try <span class="p">dog luna</span>.', 'warn'); return; }
    if (active && !leaving && (!name || name === who)) { RW.print('🐕 Okay ' + DOGS[who].name + ', give it back. Returning the logo.', 'dim'); dismiss(); return; }
    var id = name || pick();
    RW.print('🐕 *whistle* — here comes ' + DOGS[id].name + ' from Fetch. ' + DOGS[id].line + ' Click anywhere to throw; Esc or <span class="p">dog</span> sends them home.', 'ok');
    summon(id);
  };
  RW.commands.dogs = function () {
    RW.print('The Fetch pack — whistle with <span class="p">dog &lt;name&gt;</span>:', 'ok');
    IDS.forEach(function (k) { RW.print('  ' + (DOGS[k].name + '        ').slice(0, 9) + DOGS[k].line, 'dim'); });
  };

  var slot = RW.$('.footer .wrap span:first-child');
  if (slot) {
    bone = document.createElement('button');
    bone.type = 'button'; bone.className = 'dog-bone';
    bone.setAttribute('aria-label', 'Whistle for a dog'); bone.setAttribute('aria-pressed', 'false');
    bone.title = 'Whistle for a dog';
    bone.textContent = '🦴';
    bone.addEventListener('click', toggle);
    slot.appendChild(bone);
  }
})();
