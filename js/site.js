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

  /* Easter eggs announce themselves; js/eggs.js turns them into achievements. */
  function egg(id) { document.dispatchEvent(new CustomEvent('rw:egg', { detail: id })); }

  /* ---------- Nav: progress, hide on scroll down, active link, mobile menu ---------- */
  var nav = $('.nav'), progress = $('.progress'), lastY = 0;
  var navLinks = $$('.nav-links a');
  var sections = navLinks.map(function (a) { return $(a.getAttribute('href')); });

  function onScroll() {
    var y = window.scrollY, max = document.documentElement.scrollHeight - innerHeight;
    progress.style.transform = 'scaleX(' + (max > 0 ? y / max : 0) + ')';
    var hp = document.getElementById('hire-panel'); if (!document.body.classList.contains('menu-open') && (!hp || hp.hidden)) nav.classList.toggle('hidden', y > lastY && y > 300);
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
  var roles = ['web apps', 'iOS apps', 'Apple Watch apps', 'video games', 'my own graphics', 'things people use'];
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

  /* ---------- Portrait tilt ---------- */
  if (finePointer && !reduceMotion) {
    $$('[data-tilt]').forEach(function (el) {
      el.addEventListener('pointermove', function (e) {
        var r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
        el.style.transform = 'perspective(900px) rotateX(' + (-y * 9) + 'deg) rotateY(' + (x * 9) + 'deg)';
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

  /* ---------- Live Mile A Day streak ----------
     Same rule mileaday.run uses: counted from the day the streak began, in the
     visitor's own calendar. Day 1 was May 13, 2025 (it read 423 on Jul 9, 2026). */
  (function () {
    var START = new Date(2025, 4, 13);
    var MILESTONES = [7, 14, 30, 50, 100, 150, 200, 250, 300, 365, 400, 500, 600, 700, 730, 800, 900, 1000, 1095, 1250, 1500, 2000];
    var daysEl = $('#ls-days');
    if (!daysEl) return;
    function midnight(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
    function render() {
      var now = new Date(), today = midnight(now);
      var streak = Math.round((today - START) / 864e5) + 1;
      daysEl.textContent = streak.toLocaleString();
      var next = MILESTONES.filter(function (m) { return m > streak; })[0] || Math.ceil((streak + 1) / 500) * 500;
      var prev = MILESTONES.filter(function (m) { return m <= streak; }).pop() || 0;
      $('#ls-next').textContent = next.toLocaleString() + ' days';
      $('#ls-togo').textContent = (next - streak) + ' to go';
      $('#ls-bar').style.width = Math.round((streak - prev) / (next - prev) * 100) + '%';
      var labels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'], dow = today.getDay();
      $('#ls-week').innerHTML = labels.map(function (l, i) {
        var cls = i < dow ? 'done' : (i === dow ? 'today' : '');
        var mark = i < dow ? '✓' : (i === dow ? '•' : '');
        return '<span class="ls-day ' + cls + '"><span class="ls-dot">' + mark + '</span>' + l + '</span>';
      }).join('');
      var end = new Date(today.getTime() + 864e5), mins = Math.max(0, Math.round((end - now) / 6e4));
      $('#ls-today').textContent = 'Today is day ' + streak.toLocaleString() + ' — ' + Math.floor(mins / 60) + 'h ' + (mins % 60) + 'm left to get it in.';
    }
    render();
    setInterval(render, 60000);
  })();

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

  /* ---------- Project filter (a card can sit in several groups) ---------- */
  var filters = $$('.filter'), cards = $$('.card');
  function inGroup(card, kind) { return kind === 'all' || (' ' + card.getAttribute('data-kind') + ' ').indexOf(' ' + kind + ' ') > -1; }
  filters.forEach(function (f) {
    var kind = f.getAttribute('data-filter');
    f.insertAdjacentHTML('beforeend', '<span class="n">' + cards.filter(function (c) { return inGroup(c, kind); }).length + '</span>');
    f.addEventListener('click', function () {
      filters.forEach(function (x) { x.classList.remove('active'); x.setAttribute('aria-pressed', 'false'); });
      f.classList.add('active'); f.setAttribute('aria-pressed', 'true');
      cards.forEach(function (c) {
        var show = inGroup(c, kind);
        c.classList.toggle('is-hidden', !show);
        if (show) c.classList.add('in');
      });
      layoutCards();
    });
  });

  /* Fill every row of the 6-column grid: rows of three (span 2), with rows of two
     (span 3) taking up the remainder. Two-card rows go first when the set leads
     with a feature card, so it stays wide. A lone card sits centered. */
  function layoutCards() {
    var vis = cards.filter(function (c) { return !c.classList.contains('is-hidden'); });
    var n = vis.length, pairs = n % 3 === 0 ? 0 : n % 3 === 2 ? 1 : 2;
    cards.forEach(function (c) { c.removeAttribute('data-tablet'); });
    if (n % 2 === 1) vis[n - 1].setAttribute('data-tablet', 'full');
    if (n === 1) { vis[0].setAttribute('data-span', 'lone'); return; }
    if (n === 2) pairs = 1;
    if (n === 4) pairs = 2;
    var leadBig = vis[0] && vis[0].classList.contains('big');
    vis.forEach(function (c, i) {
      var inPairs = leadBig ? i < pairs * 2 : i >= n - pairs * 2;
      c.setAttribute('data-span', inPairs ? '3' : '2');
    });
  }
  layoutCards();

  /* Whole card is the link: its first link becomes the card's target. */
  cards.forEach(function (c) {
    var a = c.querySelector('.links a');
    if (!a) return;
    c.classList.add('linked');
    a.classList.add('card-link');
    var label = c.querySelector('h3');
    if (label && !a.getAttribute('aria-label')) a.setAttribute('aria-label', a.textContent.trim() + ': ' + label.textContent.trim());
  });

  /* ---------- Fetch player ---------- */
  var modal = $('#game-modal'), frame = $('#game-frame'), lastFocus = null;
  function openFetch() {
    lastFocus = document.activeElement;
    var music = document.getElementById('lbf-audio'); if (music && !music.paused) music.pause();
    modal.classList.add('open'); document.body.classList.add('modal-open');
    if (!frame.getAttribute('src')) frame.setAttribute('src', 'play/fetch/index.html');
    egg('fetch');
    setTimeout(function () { frame.focus(); }, 50);
  }
  function closeFetch() {
    if (document.fullscreenElement) document.exitFullscreen().catch(function () {});
    modal.classList.remove('open'); document.body.classList.remove('modal-open');
    frame.removeAttribute('src'); // stops the game and its audio
    if (lastFocus) lastFocus.focus();
  }
  $$('[data-play-fetch]').forEach(function (el) {
    el.addEventListener('click', openFetch);
    el.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openFetch(); } });
  });
  $('#game-close').addEventListener('click', closeFetch);
  $('#game-full').addEventListener('click', function () {
    var el = frame.requestFullscreen ? frame : modal;
    if (el.requestFullscreen) el.requestFullscreen().catch(function () {});
    frame.focus();
  });
  // Esc belongs to the game while it has focus; this only fires when focus is on the page around it.
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (modal.classList.contains('open')) closeFetch();
    var adEl = document.getElementById('ad-break'); if (adEl && !adEl.hidden) adEl.querySelector('[data-ad]').click();
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
  /* ---------- Hire me panel ---------- */
  (function () {
    var btn = $('#hire-btn'), panel = $('#hire-panel');
    if (!btn || !panel) return;
    function setOpen(open) {
      panel.hidden = !open; btn.setAttribute('aria-expanded', String(open));
      if (open) { document.body.classList.remove('menu-open'); var first = panel.querySelector('.hire-opt'); if (first) first.focus(); }
    }
    btn.addEventListener('click', function (e) { e.stopPropagation(); setOpen(panel.hidden); });
    document.addEventListener('click', function (e) { if (!panel.hidden && !panel.contains(e.target)) setOpen(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !panel.hidden) { setOpen(false); btn.focus(); } });
    $$('a.hire-opt', panel).forEach(function (a) { a.addEventListener('click', function () { setOpen(false); }); });
    $('#hire-copy').addEventListener('click', function () {
      var note = panel.querySelector('.hire-copy-note');
      copy('robertwiscount@gmail.com').then(function () { note.textContent = 'Copied!'; setTimeout(function () { note.textContent = 'Paste it anywhere'; }, 2000); },
        function () { location.href = 'mailto:robertwiscount@gmail.com'; });
    });
  })();

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
    if (spins === 5) { toast('You found the logo spinner. You\'re hired… I mean, I\'m hireable. 😄'); egg('logo'); }
  });

  /* Konami code */
  var konami = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'], kpos = 0;
  document.addEventListener('keydown', function (e) {
    var k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    kpos = k === konami[kpos] ? kpos + 1 : (k === konami[0] ? 1 : 0);
    if (kpos === konami.length) { kpos = 0; party(); toast('🎮 Cheat code unlocked: +30 lives. Now go hire Rob.'); egg('konami'); }
  });

  /* ---------- LeBronify player ---------- */
  var TRACKS = [
    { id: 'lehips', title: "LeHips Don't Lie", artist: '@ant.jr06' },
    { id: 'lebronifornia', title: 'LeBronifornia Girls', artist: '@izzydrip' },
    { id: 'lenade', title: 'Catch a LeNade For You', artist: '@ilyaugust' },
    { id: 'glazed', title: 'I Glazed LeBron (And I Liked It)', artist: '@timringling' },
    { id: 'brongedies', title: 'Brons Not Brongedies', artist: '@ilyaugust' },
    { id: 'dance', title: 'Shut Up and Dance With Bron', artist: '@ilyaugust' },
    { id: 'bronicide', title: 'Romantic Bronicide', artist: '@ilyaugust' },
    { id: 'taco', title: 'Taco Tuesday', artist: 'LeBron fan anthem' }
  ];
  var DURATIONS = { lehips: 40, lebronifornia: 59, lenade: 60, glazed: 60, brongedies: 71, dance: 37, bronicide: 68, taco: 36 };
  var audio = $('#lbf-audio'), lbf = $('#lbf'), cur = 0, plays = 0, shuffle = false;
  var playBtn = $('#lbf-play'), list = $('#lbf-list'), mini = $('#mini-player');
  function fmt(t) { t = Math.max(0, Math.round(t || 0)); return Math.floor(t / 60) + ':' + ('0' + (t % 60)).slice(-2); }
  list.innerHTML = TRACKS.map(function (t, i) {
    return '<li><button type="button" data-i="' + i + '"><span class="n">' + (i + 1) + '</span><img src="assets/lebronify/' + t.id + '.jpg" alt="" width="40" height="40" loading="lazy">' +
      '<span class="t"><strong>' + t.title + '</strong><small>' + t.artist + '</small></span><span class="d">' + fmt(DURATIONS[t.id]) + '</span></button></li>';
  }).join('');
  var rows = $$('#lbf-list button');
  function paint() {
    var t = TRACKS[cur], playing = !audio.paused;
    $('#lbf-art').src = $('#mini-art').src = 'assets/lebronify/' + t.id + '.jpg';
    $('#lbf-title').textContent = $('#mini-title').textContent = t.title;
    $('#lbf-artist').textContent = t.artist;
    $('#lbf-kicker').textContent = playing ? 'Now playing' : (plays ? 'Paused' : "LeBron's pick of the day");
    $('#lbf-dur').textContent = fmt(audio.duration || DURATIONS[t.id]);
    playBtn.innerHTML = '<i class="fas fa-' + (playing ? 'pause' : 'play') + '"></i>';
    playBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    $('#mini-toggle').innerHTML = '<i class="fas fa-' + (playing ? 'pause' : 'play') + '"></i>';
    lbf.classList.toggle('is-playing', playing);
    rows.forEach(function (r, i) { r.classList.toggle('on', i === cur); r.setAttribute('aria-current', i === cur ? 'true' : 'false'); });
    updateMini();
  }
  function lbfLoad(i, autoplay) {
    cur = (i + TRACKS.length) % TRACKS.length;
    audio.src = 'assets/lebronify/' + TRACKS[cur].id + '.mp3';
    $('#lbf-bar').style.width = '0%'; $('#lbf-cur').textContent = '0:00';
    if (autoplay) play(); else paint();
  }
  function play() {
    if (!audio.getAttribute('src')) audio.src = 'assets/lebronify/' + TRACKS[cur].id + '.mp3';
    var pr = audio.play(); if (pr && pr.catch) pr.catch(function () {});
    plays++; egg('lebron');
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({ title: TRACKS[cur].title, artist: TRACKS[cur].artist, album: 'LeBronify', artwork: [{ src: 'assets/lebronify/' + TRACKS[cur].id + '.jpg', sizes: '300x300', type: 'image/jpeg' }] });
    }
  }
  function nextIndex() { return shuffle ? (cur + 1 + Math.floor(Math.random() * (TRACKS.length - 1))) % TRACKS.length : cur + 1; }
  playBtn.addEventListener('click', function () { audio.paused ? play() : audio.pause(); });
  $('#lbf-next').addEventListener('click', function () { lbfLoad(nextIndex(), true); });
  $('#lbf-prev').addEventListener('click', function () { audio.currentTime > 3 ? (audio.currentTime = 0) : lbfLoad(cur - 1, true); });
  $('#lbf-shuffle').addEventListener('click', function () {
    shuffle = !shuffle; this.classList.toggle('on', shuffle);
    toast(shuffle ? '👑 The King will decide what plays next.' : 'Shuffle off. You\'re in charge again.');
  });
  rows.forEach(function (r) { r.addEventListener('click', function () { var i = +r.getAttribute('data-i'); i === cur && !audio.paused ? audio.pause() : (i === cur ? play() : lbfLoad(i, true)); }); });
  ['play', 'pause'].forEach(function (ev) { audio.addEventListener(ev, paint); });
  audio.addEventListener('loadedmetadata', function () { $('#lbf-dur').textContent = fmt(audio.duration); });
  audio.addEventListener('timeupdate', function () {
    var p = audio.duration ? audio.currentTime / audio.duration : 0;
    $('#lbf-bar').style.width = (p * 100) + '%'; $('#lbf-cur').textContent = fmt(audio.currentTime);
    $('#lbf-progress').setAttribute('aria-valuenow', Math.round(p * 100));
  });
  var songsFinished = 0;
  audio.addEventListener('ended', function () {
    songsFinished++;
    if (songsFinished % 2 === 0) showAd(); else lbfLoad(nextIndex(), true);
  });
  function seek(e) {
    var r = $('#lbf-progress').getBoundingClientRect(), x = (e.touches ? e.touches[0].clientX : e.clientX) - r.left;
    if (audio.duration) audio.currentTime = Math.max(0, Math.min(1, x / r.width)) * audio.duration;
  }
  $('#lbf-progress').addEventListener('click', seek);
  $('#lbf-progress').addEventListener('keydown', function (e) {
    if (!audio.duration) return;
    if (e.key === 'ArrowRight') audio.currentTime = Math.min(audio.duration, audio.currentTime + 5);
    if (e.key === 'ArrowLeft') audio.currentTime = Math.max(0, audio.currentTime - 5);
  });

  /* AD Break — the real app interrupts every so often with Anthony Davis */
  var ad = $('#ad-break');
  function showAd() { audio.pause(); ad.hidden = false; setTimeout(function () { ad.classList.add('open'); $('.ad-actions button').focus(); }, 10); }
  $$('[data-ad]').forEach(function (b) {
    b.addEventListener('click', function () {
      ad.classList.remove('open'); setTimeout(function () { ad.hidden = true; }, 300);
      toast(b.getAttribute('data-ad')); lbfLoad(nextIndex(), true);
    });
  });

  /* Taco Tuesday */
  $('#lbf-taco').addEventListener('click', function () {
    var tuesday = new Date().getDay() === 2;
    toast(tuesday ? '🌮 TACO TUESDAYYYYY' : "🌮 It's not even Tuesday. LeBron doesn't care.");
    lbfLoad(TRACKS.length - 1, true);
    if (reduceMotion) return;
    for (var i = 0; i < 28; i++) {
      var t = document.createElement('img');
      t.src = 'assets/lebronify/taco.png'; t.alt = ''; t.className = 'taco-drop';
      t.style.left = (Math.random() * 100) + 'vw'; t.style.animationDelay = (Math.random() * 1.6) + 's';
      t.style.width = (28 + Math.random() * 36) + 'px'; t.style.setProperty('--spin', (Math.random() * 720 - 360) + 'deg');
      document.body.appendChild(t);
      setTimeout(function (el) { el.remove(); }, 5200, t);
    }
  });

  /* Mini player shows up when music plays and the section is off screen */
  var lbfVisible = true, sessionOn = false;
  function updateMini() { if (!audio.paused) sessionOn = true; mini.hidden = !(sessionOn && !lbfVisible); }
  if ('IntersectionObserver' in window) new IntersectionObserver(function (en) { lbfVisible = en[0].isIntersecting; updateMini(); }, { threshold: 0.15 }).observe(lbf);
  $('#mini-toggle').addEventListener('click', function () { audio.paused ? play() : audio.pause(); });
  $('#mini-close').addEventListener('click', function () { sessionOn = false; audio.pause(); audio.currentTime = 0; mini.hidden = true; });
  if ('mediaSession' in navigator) {
    navigator.mediaSession.setActionHandler('nexttrack', function () { lbfLoad(nextIndex(), true); });
    navigator.mediaSession.setActionHandler('previoustrack', function () { lbfLoad(cur - 1, true); });
  }
  paint();

  /* ---------- Terminal ---------- */
  var out = $('#term-out'), input = $('#term-input'), body = $('#term-body'), history = [], hpos = 0;
  function esc(s) { return s.replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }
  function print(html, cls) { var p = document.createElement('p'); if (cls) p.className = cls; p.innerHTML = html; out.appendChild(p); body.scrollTop = body.scrollHeight; }

  var commands = {
    help: function () {
      print('Available commands:', 'ok');
      print('  whoami      who is this guy\n  projects    things I\'ve shipped\n  play fetch  launch my video game\n  lebron      play a random LeBronify banger\n  go birds    you know what this does\n  experience  where I\'ve worked\n  stack       what I build with\n  mileaday    the app I\'m proudest of\n  git log     my GitHub squares\n  hire rob    the best command\n  contact     how to reach me\n  achievements  secrets you\'ve found\n  clear       wipe the screen', 'dim');
      print('…and a few commands that aren\'t on this list. 👀', 'dim');
    },
    whoami: function () {
      print('Rob Wiscount — front-end developer at heart, full stack by now. South Jersey.');
      print('Builds apps, games and sites — then makes his friends play them.', 'dim');
      print('Designs his own graphics in Canva and edits video in Final Cut and CapCut.', 'dim');
      print('Software developer @ Foley Prep. Co-founder of Mile A Day (live on the App Store).', 'dim');
      print('Builds websites, web apps and iOS apps people actually use.', 'dim');
    },
    projects: function () {
      [['Mile A Day', 'iOS + watchOS streak app · live', 'https://apps.apple.com/us/app/mile-a-day/id6746970905'],
       ['Fetch', '3D dog party game · playable on this page', '#fetch'],
       ['Trouble Brewing', 'coffee house site + visual CMS', ''],
       ['Dawg House Duel', 'picture-duel game show', 'https://dawghouseduel.com'],
       ['LeBronify', 'Spotify, but all LeBron parodies · play it above', '#lebronify'],
       ['FantasyFlicks', 'fantasy football for movies · iOS, not live yet', ''],
       ['Top Dawgs', 'pool team stats + live scoring', 'https://poolmaxxing.com'],
       ['Giddey', 'daily NBA draft puzzle', 'https://playgiddey.com'],
       ['Pressed by J&H', 'juice shop with Stripe checkout', 'https://siponpressed.com'],
       ['Traveling Tastebuds', 'food creator site + food map', 'https://travelingtastebuds.org'],
       ['Pick 5', 'odds-weighted NFL pick\'em', 'https://sportspick5.com'],
       ['Beer Party', 'Mario Party, in real life · not live yet', 'https://github.com/robwizzie/beer-party'],
       ['Unused CSS Detector', 'VS Code extension', 'https://marketplace.visualstudio.com/items?itemName=robwizzie.unused-css-detector']
      ].forEach(function (p) {
        var link = p[2] ? '<a href="' + p[2] + '"' + (p[2].charAt(0) === '#' ? '' : ' target="_blank" rel="noopener"') + '>' + p[0] + '</a>' : p[0];
        print('→ ' + link + ' <span class="dim">— ' + p[1] + '</span>');
      });
    },
    experience: function () {
      print('2023 → now   Software Developer · Foley Prep', 'ok');
      print('2021 → 2022  Integrations Developer · XGen\n2020 → 2021  Programming Intern · USLI', 'dim');
      print('education    A.S. Computer Science · Rowan College of South Jersey', 'dim');
    },
    stack: function () {
      print('web      JavaScript · TypeScript · React · Next.js · HTML/CSS · Tailwind');
      print('apple    Swift · SwiftUI · watchOS · HealthKit · WidgetKit · MapKit');
      print('backend  Node · Express · PostgreSQL · REST · Stripe');
      print('ai       Claude Code · ChatGPT/OpenAI API · Cursor · Copilot');
      print('design   Final Cut Pro · CapCut · Canva · Figma');
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
      setTimeout(function () { print('✔ front end first, full stack when it counts', 'ok'); }, 500);
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
    'play fetch': function () { print('Booting Fetch… 🐶 (Esc inside the game goes back a menu)', 'ok'); setTimeout(openFetch, 400); },
    lebron: function () {
      var i = Math.floor(Math.random() * TRACKS.length);
      print('▶ Now playing: ' + TRACKS[i].title + ' <span class="dim">— ' + TRACKS[i].artist + '</span>', 'ok');
      print('<a href="#lebronify">→ controls are up in the LeBronify section</a>');
      lbfLoad(i, true);
    },
    clear: function () { out.innerHTML = ''; }
  };
  commands['git log'] = function () {
    var t = $('#gh-total'), s = $('#gh-streak'), l = $('#gh-longest');
    if (t && /\d/.test(t.textContent)) {
      print(t.textContent + ' contributions in the last year', 'ok');
      print('current streak ' + s.textContent + ' days · longest ' + l.textContent + ' days', 'dim');
    } else print('Fetching squares from GitHub…', 'dim');
    print('<a href="#commits">→ see the graph</a> · <a href="https://github.com/robwizzie" target="_blank" rel="noopener">github.com/robwizzie</a>');
  };
  commands.github = commands.git = commands.commits = commands['git log'];
  commands.about = commands.whoami;
  commands.skills = commands.stack;
  commands.hire = commands['hire rob'];
  commands.fetch = commands.play = commands['play fetch'];

  var termMode = null; // an egg can take over the prompt (vim does)
  function run(raw) {
    var line = raw.trim().replace(/\s+/g, ' '), cmd = line.toLowerCase(), sp = cmd.indexOf(' ');
    if (termMode) { print(esc(raw), 'dim'); termMode(line); return; }
    print('<span class="p">rob@wiscount:~$</span> ' + esc(raw));
    if (!cmd) return;
    history.push(raw); hpos = history.length;
    if (commands[cmd]) commands[cmd]('');
    else if (sp > 0 && commands[cmd.slice(0, sp)]) commands[cmd.slice(0, sp)](line.slice(sp + 1)); // e.g. cowsay <text>
    else print('command not found: ' + esc(cmd) + ' — try <span class="p">help</span>', 'warn');
  }
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { run(input.value); input.value = ''; }
    else if (e.key === 'Escape' && termMode) { e.preventDefault(); termMode(null); }
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

  /* ---------- Mile A Day live community stats ----------
     Same read-only public endpoint mileaday.run uses (cached 60 s server-side).
     The HTML holds a recent snapshot, so the panel is never empty; it counts up when
     it scrolls into view and then follows the live numbers every minute. */
  (function () {
    var box = document.getElementById('mad-live');
    if (!box) return;
    var els = $$('[data-stat]', box), latest = {}, shown = {}, seen = false;
    els.forEach(function (el) { latest[el.getAttribute('data-stat')] = parseFloat(el.textContent.replace(/,/g, '')) || 0; });
    function fmt(n, d) { return Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }); }
    function paint() {
      els.forEach(function (el) {
        var key = el.getAttribute('data-stat'), to = latest[key], from = shown[key] || 0;
        var d = +(el.getAttribute('data-decimals') || 0), suffix = el.getAttribute('data-suffix') || '';
        shown[key] = to;
        if (reduceMotion || from === to) { el.textContent = fmt(to, d) + suffix; return; }
        var t0 = performance.now();
        (function tick(now) {
          var t = Math.min((now - t0) / 1600, 1), e = 1 - Math.pow(1 - t, 3);
          el.textContent = fmt(from + (to - from) * e, d) + suffix;
          if (t < 1) requestAnimationFrame(tick);
        })(t0);
      });
    }
    if ('IntersectionObserver' in window && !reduceMotion) {
      new IntersectionObserver(function (entries, obs) {
        if (!entries[0].isIntersecting) return;
        obs.disconnect(); seen = true; paint();
      }, { threshold: 0.4 }).observe(box);
    } else { seen = true; }
    function load() {
      if (!window.fetch) return;
      fetch('https://mad.mindgoblin.tech/public/stats', { cache: 'no-store' })
        .then(function (r) { if (!r.ok) throw 0; return r.json(); })
        .then(function (data) {
          if (!data || !data.total_users) return;
          Object.keys(latest).forEach(function (k) { if (typeof data[k] === 'number') latest[k] = data[k]; });
          if (seen) paint();
        })
        .catch(function () {});
    }
    load();
    setInterval(function () { if (!document.hidden) load(); }, 60000);
  })();

  /* ---------- GitHub contributions ----------
     GitHub has no CORS-friendly endpoint for the contribution calendar, so this reads
     the public github-contributions-api (it mirrors the graph on github.com/robwizzie).
     Cached for the session; if it can't be reached the section points to GitHub instead. */
  (function () {
    var card = document.getElementById('gh');
    if (!card) return;
    var grid = $('#gh-grid'), months = $('#gh-months'), tip = $('#gh-tip'), scroller = $('#gh-scroll'), note = $('#gh-note');
    var API = 'https://github-contributions-api.jogruber.de/v4/robwizzie?y=last', KEY = 'gh-contrib-v1';
    var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    var DAYS = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];
    var cells = [];

    function parse(s) { var p = s.split('-'); return new Date(+p[0], p[1] - 1, +p[2]); }
    function nice(d) { return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }); }
    function plural(n, w) { return n.toLocaleString() + ' ' + w + (n === 1 ? '' : 's'); }

    function countTo(el, to) {
      if (reduceMotion) { el.textContent = to.toLocaleString(); return; }
      var t0 = performance.now();
      (function tick(now) {
        var t = Math.min((now - t0) / 1400, 1), e = 1 - Math.pow(1 - t, 3);
        el.textContent = Math.round(to * e).toLocaleString();
        if (t < 1) requestAnimationFrame(tick);
      })(t0);
    }

    function render(days) {
      days = days.filter(function (d) { return d && d.date; }).sort(function (a, b) { return a.date < b.date ? -1 : 1; });
      var todayStr = (function (n) { return n.getFullYear() + '-' + ('0' + (n.getMonth() + 1)).slice(-2) + '-' + ('0' + n.getDate()).slice(-2); })(new Date());
      days = days.filter(function (d) { return d.date <= todayStr; }).slice(-371);
      if (!days.length) throw new Error('empty');

      // Pad the first week so every column starts on Sunday, like GitHub.
      var lead = parse(days[0].date).getDay(), weeks = Math.ceil((lead + days.length) / 7);
      card.style.setProperty('--weeks', weeks);
      $('.gh-graph', card).style.setProperty('--weeks', weeks);
      var html = '', mhtml = '', lastMonth = -1;
      for (var i = 0; i < lead; i++) html += '<i class="gh-c pad"></i>';
      days.forEach(function (d, i) {
        var idx = i + lead, col = Math.floor(idx / 7), row = idx % 7, dt = parse(d.date);
        var lvl = Math.max(0, Math.min(4, d.level || 0));
        html += '<i class="gh-c l' + lvl + (d.date === todayStr ? ' today' : '') + '" data-i="' + i + '" style="--d:' + (col * 9 + row * 14) + 'ms"></i>';
        if (row === 0 || i === 0) {
          var m = dt.getMonth();
          if (m !== lastMonth && (dt.getDate() <= 7 || i === 0) && col < weeks - 2) {
            mhtml += '<span style="grid-column:' + (col + 1) + ' / span 3">' + MONTHS[m] + '</span>';
            lastMonth = m;
          }
        }
      });
      grid.innerHTML = html;
      months.innerHTML = mhtml;
      cells = days;

      // Stats
      var total = 0, active = 0, longest = 0, run = 0, best = days[0], perDow = [0, 0, 0, 0, 0, 0, 0];
      days.forEach(function (d) {
        var c = d.count || 0;
        total += c; perDow[parse(d.date).getDay()] += c;
        if (c > 0) { active++; run++; longest = Math.max(longest, run); } else run = 0;
        if (c > (best.count || 0)) best = d;
      });
      // Today isn't over yet, so a quiet today doesn't break the current streak.
      var streak = 0, j = days.length - 1;
      if (days[j].date === todayStr && !days[j].count) j--;
      for (; j >= 0 && days[j].count > 0; j--) streak++;
      var fav = perDow.indexOf(Math.max.apply(null, perDow));

      var stats = { total: total, streak: streak, longest: longest, active: active, best: best.count || 0 };
      function paint() {
        countTo($('#gh-total'), stats.total);
        countTo($('#gh-streak'), stats.streak);
        countTo($('#gh-longest'), stats.longest);
        countTo($('#gh-active'), stats.active);
        countTo($('#gh-best'), stats.best);
      }
      $('#gh-best-label').textContent = 'Busiest day · ' + parse(best.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      $('#gh-dow').textContent = DAYS[fav];
      note.innerHTML = 'Contributions to public and private repos · <a href="https://github.com/robwizzie" target="_blank" rel="noopener">see it on GitHub</a>';
      grid.setAttribute('aria-label', 'GitHub contribution graph: ' + plural(total, 'contribution') + ' in the last year, a ' + plural(longest, 'day') + ' longest streak.');

      requestAnimationFrame(function () {
        scroller.scrollLeft = scroller.scrollWidth; // narrow screens: start on the most recent weeks
        grid.classList.add('lit');
      });
      if (card.classList.contains('in') || !('IntersectionObserver' in window)) paint();
      else new IntersectionObserver(function (en, obs) { if (en[0].isIntersecting) { obs.disconnect(); paint(); } }, { threshold: 0.3 }).observe(card);
    }

    function fail() {
      var html = '';
      for (var i = 0; i < 371; i++) html += '<i class="gh-c l0" style="--d:' + (Math.floor(i / 7) * 9) + 'ms"></i>';
      grid.innerHTML = html; grid.classList.add('lit'); card.classList.add('gh-off');
      note.innerHTML = 'GitHub didn\'t answer just now — <a href="https://github.com/robwizzie" target="_blank" rel="noopener">see the real squares on GitHub</a>';
    }

    var cached = null;
    try { cached = JSON.parse(sessionStorage.getItem(KEY)); } catch (e) {}
    function load() {
      if (cached && cached.contributions) { try { render(cached.contributions); return; } catch (e) {} }
      if (!window.fetch) return fail();
      fetch(API)
        .then(function (r) { if (!r.ok) throw 0; return r.json(); })
        .then(function (data) {
          render(data.contributions || []);
          try { sessionStorage.setItem(KEY, JSON.stringify({ contributions: data.contributions })); } catch (e) {}
        })
        .catch(fail);
    }
    // Don't spend a request until someone scrolls near the section.
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (en, obs) { if (en[0].isIntersecting) { obs.disconnect(); load(); } }, { rootMargin: '600px 0px' }).observe(card);
    } else load();

    // Tooltip (hover on desktop, tap on touch)
    function showTip(el) {
      var d = cells[el.getAttribute('data-i')];
      if (!d) return;
      var c = d.count || 0;
      tip.textContent = (c ? plural(c, 'contribution') : 'No contributions') + ' on ' + nice(parse(d.date));
      var cr = card.getBoundingClientRect(), er = el.getBoundingClientRect();
      var x = er.left - cr.left + er.width / 2, half = tip.offsetWidth / 2 + 8;
      tip.style.left = Math.max(half, Math.min(cr.width - half, x)) + 'px';
      tip.style.top = (er.top - cr.top) + 'px';
      tip.classList.add('show');
    }
    function hideTip() { tip.classList.remove('show'); }
    grid.addEventListener('mouseover', function (e) { if (e.target.hasAttribute('data-i')) showTip(e.target); });
    grid.addEventListener('mouseleave', hideTip);
    scroller.addEventListener('scroll', hideTip, { passive: true });

    // Click a square: a ripple rolls out across the year. Big days get confetti.
    var rippling = false;
    grid.addEventListener('click', function (e) {
      var el = e.target;
      if (!el.hasAttribute('data-i')) return;
      showTip(el);
      egg('ripple');
      if (reduceMotion || rippling) return;
      var all = $$('.gh-c', grid), at = all.indexOf(el), c0 = Math.floor(at / 7), r0 = at % 7;
      rippling = true;
      all.forEach(function (c, i) {
        var dist = Math.sqrt(Math.pow(Math.floor(i / 7) - c0, 2) + Math.pow(i % 7 - r0, 2));
        c.style.setProperty('--pd', Math.round(dist * 22) + 'ms');
        c.classList.remove('ping'); void c.offsetWidth; c.classList.add('ping');
      });
      setTimeout(function () { all.forEach(function (c) { c.classList.remove('ping'); }); rippling = false; }, 1900);
      var d = cells[el.getAttribute('data-i')];
      if (d && d.level >= 4) { var r = el.getBoundingClientRect(); burst(r.left + r.width / 2, r.top, 40); }
    });
  })();

  /* ---------- Hooks for the easter-egg scripts (js/eggs.js, js/dog.js, js/pool.js, js/live.js) ---------- */
  window.RW = {
    $: $, $$: $$, reduceMotion: reduceMotion, finePointer: finePointer,
    toast: toast, burst: burst, party: party, egg: egg, copy: copy,
    commands: commands, print: print, esc: esc, run: run,
    setTermMode: function (fn) { termMode = fn || null; },
    openFetch: openFetch, playTrack: function (i) { lbfLoad(i, true); }, tracks: TRACKS,
    openHire: function () { var b = $('#hire-btn'), p = $('#hire-panel'); if (b && p && p.hidden) b.click(); }
  };

  onScroll();
})();
