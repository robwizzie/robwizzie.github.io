/* robwiscount.org — interactions. No dependencies. */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ---------- Loader ---------- */
  function finishLoading() {
    var loader = $('.loader');
    if (loader) loader.classList.add('done');
    document.body.classList.add('loaded');
  }
  if (reduceMotion) finishLoading();
  else window.addEventListener('load', function () { setTimeout(finishLoading, 650); });
  setTimeout(finishLoading, 2500); // never hold the page hostage

  $('#year').textContent = new Date().getFullYear();

  /* ---------- Toast ---------- */
  var toastEl = $('.toast'), toastTimer;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 2600);
  }

  /* ---------- Nav: progress, hide on scroll down, active link, mobile menu ---------- */
  var nav = $('.nav'), progress = $('.progress'), lastY = 0;
  var navLinks = $$('.nav-links a');
  var sections = navLinks.map(function (a) { return $(a.getAttribute('href')); });

  function onScroll() {
    var y = window.scrollY, max = document.documentElement.scrollHeight - innerHeight;
    progress.style.transform = 'scaleX(' + (max > 0 ? y / max : 0) + ')';
    if (!document.body.classList.contains('menu-open')) nav.classList.toggle('hidden', y > lastY && y > 300);
    lastY = y;
    var current = -1;
    sections.forEach(function (s, i) { if (s && s.getBoundingClientRect().top < innerHeight * 0.4) current = i; });
    navLinks.forEach(function (a, i) { a.classList.toggle('active', i === current); });
    updateTimeline();
  }
  window.addEventListener('scroll', onScroll, { passive: true });

  var menuBtn = $('.menu-btn');
  menuBtn.addEventListener('click', function () {
    var open = document.body.classList.toggle('menu-open');
    menuBtn.setAttribute('aria-expanded', open);
    menuBtn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  });
  navLinks.forEach(function (a) {
    a.addEventListener('click', function () {
      document.body.classList.remove('menu-open');
      menuBtn.setAttribute('aria-expanded', 'false');
    });
  });

  /* ---------- Cursor spotlight ---------- */
  var spot = $('.spotlight');
  if (finePointer && !reduceMotion) {
    window.addEventListener('pointermove', function (e) {
      spot.style.left = e.clientX + 'px';
      spot.style.top = e.clientY + 'px';
    }, { passive: true });
  }

  /* ---------- Reveal + counters ---------- */
  function countUp(el) {
    var target = +el.getAttribute('data-count');
    if (reduceMotion) { el.textContent = target; return; }
    var start = performance.now(), dur = 1600;
    (function tick(now) {
      var t = Math.min(1, (now - start) / dur), eased = 1 - Math.pow(1 - t, 3);
      el.textContent = Math.round(target * eased);
      if (t < 1) requestAnimationFrame(tick);
    })(start);
  }
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        en.target.classList.add('in');
        $$('[data-count]', en.target).forEach(countUp);
        io.unobserve(en.target);
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
    $$('.reveal').forEach(function (el) { io.observe(el); });
  } else {
    $$('.reveal').forEach(function (el) { el.classList.add('in'); });
    $$('[data-count]').forEach(function (el) { el.textContent = el.getAttribute('data-count'); });
  }

  /* ---------- Typed roles ---------- */
  var typed = $('.typed');
  var roles = ['iOS apps', 'Apple Watch apps', 'web apps', 'AI-powered features', 'payment systems', 'things people use'];
  if (reduceMotion) {
    typed.textContent = 'things people use';
  } else {
    var ri = 0, ci = roles[0].length, deleting = true;
    (function step() {
      var word = roles[ri];
      typed.textContent = word.slice(0, ci);
      var delay = deleting ? 40 : 85;
      if (deleting) {
        ci--;
        if (ci < 0) { deleting = false; ri = (ri + 1) % roles.length; ci = 0; delay = 250; }
      } else {
        ci++;
        if (ci > roles[ri].length) { deleting = true; ci = roles[ri].length; delay = 1700; }
      }
      setTimeout(step, delay);
    })();
  }

  /* ---------- Hero canvas: a field of dots that leans toward the cursor ---------- */
  var canvas = $('#hero-canvas');
  if (canvas && canvas.getContext) {
    var ctx = canvas.getContext('2d'), dots = [], mouse = { x: -9999, y: -9999 }, dpr = Math.min(2, window.devicePixelRatio || 1);
    var running = true;
    function setup() {
      var r = canvas.getBoundingClientRect();
      canvas.width = r.width * dpr; canvas.height = r.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      dots = [];
      var gap = r.width < 600 ? 28 : 34;
      for (var y = gap / 2; y < r.height; y += gap)
        for (var x = gap / 2; x < r.width; x += gap) dots.push({ x: x, y: y });
    }
    function draw() {
      if (!running) return;
      var r = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, r.width, r.height);
      var t = performance.now() / 1000;
      for (var i = 0; i < dots.length; i++) {
        var d = dots[i], dx = mouse.x - d.x, dy = mouse.y - d.y, dist = Math.sqrt(dx * dx + dy * dy);
        var pull = Math.max(0, 1 - dist / 180);
        var wave = reduceMotion ? 0 : Math.sin(t * 1.2 + d.x * 0.012 + d.y * 0.01) * 0.5 + 0.5;
        var px = d.x + dx * pull * 0.22, py = d.y + dy * pull * 0.22;
        var a = 0.07 + wave * 0.08 + pull * 0.75;
        ctx.fillStyle = 'rgba(91,143,249,' + a.toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(px, py, 1.2 + pull * 2.2, 0, 6.283); ctx.fill();
      }
      if (!reduceMotion) requestAnimationFrame(draw);
    }
    setup(); draw();
    window.addEventListener('resize', function () { setup(); if (reduceMotion) draw(); });
    canvas.parentElement.addEventListener('pointermove', function (e) {
      var r = canvas.getBoundingClientRect(); mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top;
    });
    canvas.parentElement.addEventListener('pointerleave', function () { mouse.x = mouse.y = -9999; });
    if ('IntersectionObserver' in window && !reduceMotion) {
      new IntersectionObserver(function (en) {
        var was = running; running = en[0].isIntersecting;
        if (running && !was) draw();
      }).observe(canvas);
    }
  }

  /* ---------- 3D tilt ---------- */
  if (finePointer && !reduceMotion) {
    $$('[data-tilt]').forEach(function (el) {
      var max = el.classList.contains('portrait') ? 10 : 6;
      el.addEventListener('pointermove', function (e) {
        var r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
        el.style.transform = 'perspective(900px) rotateX(' + (-y * max) + 'deg) rotateY(' + (x * max) + 'deg)';
      });
      el.addEventListener('pointerleave', function () { el.style.transform = ''; });
    });

    /* Magnetic buttons */
    $$('.magnetic').forEach(function (el) {
      el.addEventListener('pointermove', function (e) {
        var r = el.getBoundingClientRect();
        el.style.transform = 'translate(' + (e.clientX - r.left - r.width / 2) * 0.18 + 'px,' + (e.clientY - r.top - r.height / 2) * 0.3 + 'px)';
      });
      el.addEventListener('pointerleave', function () { el.style.transform = ''; });
    });
  }

  /* ---------- Phones parallax ---------- */
  var phones = $$('.phone');
  if (phones.length && !reduceMotion) {
    var phoneWrap = $('.phones');
    window.addEventListener('scroll', function () {
      var r = phoneWrap.getBoundingClientRect();
      if (r.bottom < 0 || r.top > innerHeight) return;
      var p = (r.top + r.height / 2 - innerHeight / 2) / innerHeight; // -1..1
      phones.forEach(function (ph) {
        var d = +ph.getAttribute('data-depth');
        var rot = ph.classList.contains('phone-front') ? 4 : -8;
        ph.style.transform = 'translateY(' + (p * 80 * d) + 'px) rotate(' + (rot + p * 4 * d) + 'deg)';
      });
    }, { passive: true });
  }

  /* ---------- Streak toy ---------- */
  var toyCount = 0, toyBtn = $('#toy-btn'), flame = $('.flame');
  var toyLines = [
    'Day one. Every streak starts here.',
    'Two in a row. Habit loading…',
    'Three days! Friends get notified.',
    'You\'re on fire. Literally.',
    'Five days — a milestone celebration fires in the app.',
    'Okay, you get it. Download the real thing 👇'
  ];
  toyBtn.addEventListener('click', function () {
    toyCount++;
    $('#toy-count').textContent = toyCount;
    $('#toy-meta').textContent = toyLines[Math.min(toyCount, toyLines.length) - 1];
    var s = Math.min(1 + toyCount * 0.12, 1.8);
    flame.style.transform = 'scale(' + s + ') rotate(' + (toyCount % 2 ? -8 : 8) + 'deg)';
    var r = toyBtn.getBoundingClientRect();
    burst(r.left + r.width / 2, r.top, toyCount === 5 ? 140 : 40);
  });

  /* ---------- Timeline fill ---------- */
  var timeline = $('.timeline'), fill = $('.timeline-fill');
  function updateTimeline() {
    if (!timeline) return;
    var r = timeline.getBoundingClientRect();
    var p = Math.min(1, Math.max(0, (innerHeight * 0.6 - r.top) / r.height));
    fill.style.height = (p * (r.height - 20)) + 'px';
  }

  /* ---------- Job expand ---------- */
  $$('.job-toggle').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var job = btn.closest('.job'), open = job.classList.toggle('open');
      btn.setAttribute('aria-expanded', open);
      btn.firstChild.textContent = open ? 'Show less ' : 'Show more ';
    });
  });

  /* ---------- Project filter ---------- */
  var filters = $$('.filter'), projects = $$('.project');
  filters.forEach(function (f) {
    var kind = f.getAttribute('data-filter');
    var n = kind === 'all' ? projects.length : projects.filter(function (p) { return p.getAttribute('data-kind') === kind; }).length;
    f.insertAdjacentHTML('beforeend', '<span class="n">' + n + '</span>');
    f.addEventListener('click', function () {
      filters.forEach(function (x) { x.classList.remove('active'); x.setAttribute('aria-pressed', 'false'); });
      f.classList.add('active'); f.setAttribute('aria-pressed', 'true');
      projects.forEach(function (p) {
        var show = kind === 'all' || p.getAttribute('data-kind') === kind;
        p.classList.toggle('is-hidden', !show);
        if (show) p.classList.add('in');
      });
    });
  });

  /* ---------- Copy email / share ---------- */
  function copy(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    return new Promise(function (res, rej) {
      var ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy') ? res() : rej(); } catch (e) { rej(e); }
      ta.remove();
    });
  }
  var emailBtn = $('#email-btn');
  emailBtn.addEventListener('click', function () {
    copy(emailBtn.getAttribute('data-email')).then(function () {
      emailBtn.classList.add('done');
      var r = emailBtn.getBoundingClientRect(); burst(r.left + r.width / 2, r.top, 60);
      setTimeout(function () { emailBtn.classList.remove('done'); }, 2200);
    }, function () { location.href = 'mailto:' + emailBtn.getAttribute('data-email'); });
  });
  $('#share-btn').addEventListener('click', function () {
    var data = { title: 'Rob Wiscount — Developer & App Builder', text: 'Check out Rob Wiscount\'s portfolio', url: 'https://robwiscount.org' };
    if (navigator.share) navigator.share(data).catch(function () {});
    else copy(data.url).then(function () { toast('Link copied — thanks for sharing! 🙌'); });
  });

  /* ---------- Confetti (blue, white, black — the logo) ---------- */
  var cv = $('#confetti'), cx = cv.getContext('2d'), parts = [], animating = false;
  function sizeConfetti() { cv.width = innerWidth * dpr2(); cv.height = innerHeight * dpr2(); cx.setTransform(dpr2(), 0, 0, dpr2(), 0, 0); }
  function dpr2() { return Math.min(2, window.devicePixelRatio || 1); }
  sizeConfetti(); window.addEventListener('resize', sizeConfetti);
  var colors = ['#5b8ff9', '#8db2ff', '#ffffff', '#2f5fd0', '#0b0d12'];
  function burst(x, y, n, fromTop) {
    if (reduceMotion) return;
    for (var i = 0; i < n; i++) {
      var a = fromTop ? Math.PI / 2 + (Math.random() - 0.5) : -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
      var sp = fromTop ? 2 + Math.random() * 3 : 6 + Math.random() * 9;
      parts.push({
        x: fromTop ? Math.random() * innerWidth : x, y: fromTop ? -20 - Math.random() * innerHeight * 0.5 : y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, w: 6 + Math.random() * 6, h: 8 + Math.random() * 10,
        r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3, c: colors[i % colors.length], life: 0,
        hex: fromTop && Math.random() < 0.3
      });
    }
    if (!animating) { animating = true; requestAnimationFrame(tickConfetti); }
  }
  function hexPath(s) {
    cx.beginPath();
    for (var k = 0; k < 6; k++) { var an = Math.PI / 3 * k - Math.PI / 2; cx.lineTo(Math.cos(an) * s, Math.sin(an) * s); }
    cx.closePath();
  }
  function tickConfetti() {
    cx.clearRect(0, 0, innerWidth, innerHeight);
    parts = parts.filter(function (p) { return p.y < innerHeight + 40 && p.life < 600; });
    parts.forEach(function (p) {
      p.life++; p.vy += 0.22; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      cx.save(); cx.translate(p.x, p.y); cx.rotate(p.r); cx.fillStyle = p.c;
      if (p.hex) { hexPath(p.w); cx.fill(); cx.strokeStyle = '#fff'; cx.lineWidth = 1.5; cx.stroke(); }
      else cx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.life * 0.1)));
      cx.restore();
    });
    if (parts.length) requestAnimationFrame(tickConfetti);
    else { animating = false; cx.clearRect(0, 0, innerWidth, innerHeight); }
  }
  function party() { burst(0, 0, 220, true); }

  /* Contact logo spins + bursts */
  var cLogo = $('#contact-logo'), spins = 0;
  cLogo.addEventListener('click', function () {
    spins++;
    cLogo.style.transition = 'transform .8s cubic-bezier(.2,.8,.2,1)';
    cLogo.style.animation = 'none';
    cLogo.style.transform = 'rotate(' + spins * 360 + 'deg) scale(1.1)';
    var r = cLogo.getBoundingClientRect(); burst(r.left + r.width / 2, r.top + r.height / 2, 70);
    if (spins === 5) toast('You found the logo spinner. You\'re hired… I mean, I\'m hireable. 😄');
  });

  /* Konami code */
  var konami = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'], kpos = 0;
  document.addEventListener('keydown', function (e) {
    var k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    kpos = k === konami[kpos] ? kpos + 1 : (k === konami[0] ? 1 : 0);
    if (kpos === konami.length) { kpos = 0; party(); toast('🎮 Cheat code unlocked: +30 lives. Now go hire Rob.'); }
  });

  /* ---------- Terminal ---------- */
  var out = $('#term-out'), input = $('#term-input'), body = $('#term-body'), history = [], hpos = 0;
  function esc(s) { return s.replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }
  function print(html, cls) { var p = document.createElement('p'); if (cls) p.className = cls; p.innerHTML = html; out.appendChild(p); body.scrollTop = body.scrollHeight; }

  var commands = {
    help: function () {
      print('Available commands:', 'ok');
      print('  whoami      who is this guy\n  projects    things I\'ve shipped\n  experience  where I\'ve worked\n  stack       what I build with\n  mileaday    the app I\'m proudest of\n  hire rob    the best command\n  contact     how to reach me\n  resume      open my resume\n  clear       wipe the screen', 'dim');
    },
    whoami: function () {
      print('Rob Wiscount — full-stack developer from South Jersey.');
      print('Web developer @ Foley Prep. Co-creator of Mile A Day (live on the App Store).', 'dim');
      print('Builds websites, web apps and iOS apps people actually use.', 'dim');
    },
    projects: function () {
      [['Mile A Day', 'iOS + watchOS fitness app · live', 'https://apps.apple.com/us/app/mile-a-day/id6746970905'],
       ['Foley Prep', 'education platform · day job', 'https://foleyprep.com'],
       ['Sip on Pressed', 'brand website', 'https://siponpressed.com'],
       ['SportsPick5', 'football pick\'em', 'https://www.sportspick5.com'],
       ['Rack Up Billiards', 'pool stats tracker', 'https://rackupbilliards.com'],
       ['Unused CSS Detector', 'VS Code extension', 'https://marketplace.visualstudio.com/items?itemName=robwizzie.unused-css-detector'],
       ['FantasyFlicks', 'fantasy movies · iOS', ''], ['LeBronify', 'Spotify, but LeBron · iOS', '']
      ].forEach(function (p) {
        print('→ ' + (p[2] ? '<a href="' + p[2] + '" target="_blank" rel="noopener">' + p[0] + '</a>' : p[0]) + ' <span class="dim">— ' + p[1] + '</span>');
      });
    },
    experience: function () {
      print('2023 → now   Web Developer · Foley Prep', 'ok');
      print('2021 → 2022  Integrations Developer · XGen\n2020 → 2021  Programming Intern · USLI\n2019         Technology Instructor · Lavner Camps\n2018         Technology Aide · Kingsway Regional', 'dim');
    },
    stack: function () {
      print('web      JavaScript · TypeScript · React · Next.js · HTML/CSS · Tailwind');
      print('apple    Swift · SwiftUI · watchOS · HealthKit · WidgetKit · MapKit');
      print('backend  Node · Express · PostgreSQL · REST · Stripe');
      print('ai       Claude Code · ChatGPT/OpenAI API · Cursor · Copilot');
    },
    mileaday: function () {
      print('🔥 Mile A Day — run or walk one mile, every day.', 'ok');
      print('iPhone + Apple Watch + widgets + Live Activities, a TypeScript/Postgres backend,\nand a Next.js site. 270K+ lines of code. Live since June 2026.', 'dim');
      print('<a href="https://apps.apple.com/us/app/mile-a-day/id6746970905" target="_blank" rel="noopener">→ get it on the App Store</a>');
    },
    contact: function () {
      print('email     <a href="mailto:robertwiscount@gmail.com">robertwiscount@gmail.com</a>');
      print('linkedin  <a href="https://www.linkedin.com/in/rob-wiscount-275a2218a/" target="_blank" rel="noopener">rob-wiscount</a>');
      print('github    <a href="https://github.com/robwizzie" target="_blank" rel="noopener">robwizzie</a>');
    },
    resume: function () { print('Opening resume…', 'ok'); window.open('Robert Wiscount Resume.pdf', '_blank'); },
    'hire rob': function () {
      print('Checking candidate…', 'dim');
      setTimeout(function () { print('✔ ships real products', 'ok'); }, 250);
      setTimeout(function () { print('✔ full stack: web, iOS, backend', 'ok'); }, 500);
      setTimeout(function () { print('✔ fast, curious, AI-native', 'ok'); }, 750);
      setTimeout(function () {
        print('Match found. Opening a line of communication… <a href="#contact">↓ contact</a>');
        party();
      }, 1050);
    },
    'go birds': function () { print('🦅 E-A-G-L-E-S  EAGLES! 🦅', 'ok'); burst(innerWidth / 2, innerHeight / 2, 120); },
    'sudo hire rob': function () { commands['hire rob'](); },
    ls: function () { print('about.txt  projects/  mile-a-day/  resume.pdf  secrets.txt', 'dim'); },
    'cat secrets.txt': function () { print('There are no secrets. Just ship it. 🚀'); },
    'cat about.txt': function () { commands.whoami(); },
    sudo: function () { print('Nice try. But you can run: sudo hire rob', 'warn'); },
    clear: function () { out.innerHTML = ''; }
  };
  commands.about = commands.whoami;
  commands.skills = commands.stack;
  commands.hire = commands['hire rob'];

  function run(raw) {
    var cmd = raw.trim().toLowerCase().replace(/\s+/g, ' ');
    print('<span class="p">rob@wiscount:~$</span> ' + esc(raw));
    if (!cmd) return;
    history.push(raw); hpos = history.length;
    if (commands[cmd]) commands[cmd]();
    else print('command not found: ' + esc(cmd) + ' — try <span class="p">help</span>', 'warn');
  }
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { run(input.value); input.value = ''; }
    else if (e.key === 'ArrowUp' && history.length) { hpos = Math.max(0, hpos - 1); input.value = history[hpos]; e.preventDefault(); }
    else if (e.key === 'ArrowDown' && history.length) { hpos = Math.min(history.length, hpos + 1); input.value = history[hpos] || ''; e.preventDefault(); }
    else if (e.key === 'Tab') {
      e.preventDefault();
      var v = input.value.toLowerCase(), m = Object.keys(commands).filter(function (c) { return c.indexOf(v) === 0; });
      if (m.length === 1) input.value = m[0];
    }
    e.stopPropagation(); // keep typing from triggering the Konami listener
  });
  body.addEventListener('click', function () { if (!window.getSelection().toString()) input.focus({ preventScroll: true }); });
  $$('.term-hints button').forEach(function (b) {
    b.addEventListener('click', function () { run(b.getAttribute('data-cmd')); });
  });
  print('Welcome to robOS v2026. Type <span class="p">help</span> to see what I can do.', 'ok');

  onScroll();
})();
