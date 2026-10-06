/* robwiscount.org — easter eggs: achievements, the console, tab-away, terminal tricks,
   end credits, Mile A Day mode and Philly gameday. Needs window.RW from js/site.js. */
(function () {
  'use strict';
  var RW = window.RW;
  if (!RW) return;
  var $ = RW.$, $$ = RW.$$, reduceMotion = RW.reduceMotion;

  function store(key, val) {
    try {
      if (val === undefined) return JSON.parse(localStorage.getItem(key));
      localStorage.setItem(key, JSON.stringify(val));
    } catch (e) {}
    return null;
  }
  function ymd(d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }

  /* ==========================================================================
     Achievements — every egg on the page reports here through RW.egg(id)
     ========================================================================== */
  var liveOn = !!(document.querySelector('meta[name="rw-live"]') || {}).content;
  var ACH = [
    { id: 'konami', icon: '🎮', title: 'Cheat Code', desc: 'Entered the Konami code.', hint: '↑ ↑ ↓ ↓ … you know the rest.' },
    { id: 'logo', icon: '🌀', title: 'Spin Doctor', desc: 'Spun the RW logo five times.', hint: 'Some logos like to spin.' },
    { id: 'fetch', icon: '🐶', title: 'Good Game', desc: 'Booted up Fetch.', hint: 'There\'s a whole video game on this page.' },
    { id: 'lebron', icon: '👑', title: 'LeBronified', desc: 'Played a LeBronify banger.', hint: 'Press play on a parody.' },
    { id: 'ripple', icon: '🌊', title: 'Making Waves', desc: 'Rippled the GitHub squares.', hint: 'Poke the blue squares.' },
    { id: 'console', icon: '🔧', title: 'Under the Hood', desc: 'Called rob.hire() from the console.', hint: 'Developers: open DevTools.' },
    { id: 'tabaway', icon: '👋', title: 'You Came Back', desc: 'Left the tab and came back.', hint: 'Leave. Then come back.' },
    { id: 'mile', icon: '🏃', title: 'Ran the Mile', desc: 'Scrolled the whole page, top to bottom.', hint: 'Go the distance.' },
    { id: 'credits', icon: '🎬', title: 'Stayed for the Credits', desc: 'Watched the end credits all the way through.', hint: 'Movie people stay until the very end.' },
    { id: 'vim', icon: '⌨️', title: 'Escaped Vim', desc: 'Got out of vim. Put it on your resume.', hint: 'Open vim in the terminal. Good luck.' },
    { id: 'rmrf', icon: '💥', title: 'Nuked It', desc: 'Ran rm -rf / and lived.', hint: 'Try the most dangerous command there is.' },
    { id: 'theme', icon: '🎨', title: 'Repainted', desc: 'Re-themed the whole site.', hint: 'The terminal can change the colors.' },
    { id: 'dog', icon: '🦴', title: 'Who Let the Dog Out', desc: 'Whistled for the dog.', hint: 'Type a three-letter word for a good boy.' },
    { id: 'pool', icon: '🎱', title: 'Break Shot', desc: 'Broke the rack on the About cards.', hint: 'Rob plays pool. Ask the terminal to break.' }
  ];
  ACH.push({ id: 'colophon', icon: '📖', title: 'Read the Manual', desc: 'Found out how this site works.', hint: 'Every good site has a colophon.' });
  if (liveOn) ACH.push({ id: 'live', icon: '🛰️', title: 'Not Alone', desc: 'Saw another visitor\'s cursor.', hint: 'Visit with a friend.' });
  if (liveOn) ACH.push({ id: 'guestbook', icon: '✍️', title: 'Signed the Guestbook', desc: 'Left a note on the visitor map.', hint: 'Leave your mark on the map.' });
  var KEY = 'rw-eggs', got = store(KEY) || {};
  function count() { return ACH.filter(function (a) { return got[a.id]; }).length; }

  // "Achievement unlocked" popups, one at a time
  var pop = document.createElement('div');
  pop.className = 'ach-pop'; pop.setAttribute('role', 'status'); pop.setAttribute('aria-live', 'polite');
  document.body.appendChild(pop);
  var queue = [], showing = false;
  function nextPop() {
    if (showing || !queue.length) return;
    var a = queue.shift(); showing = true;
    pop.innerHTML = '<span class="ach-ico">' + a.icon + '</span><span class="ach-txt"><small>Achievement unlocked · ' + count() + '/' + ACH.length + '</small><b>' + a.title + '</b></span>';
    pop.classList.add('show');
    setTimeout(function () {
      pop.classList.remove('show');
      setTimeout(function () { showing = false; nextPop(); }, 450);
    }, 3800);
  }

  function unlock(id) {
    var a = ACH.filter(function (x) { return x.id === id; })[0];
    if (!a || got[id]) return;
    got[id] = Date.now(); store(KEY, got);
    queue.push(a); nextPop(); paintCount();
    if (count() === ACH.length) setTimeout(function () {
      RW.party();
      queue.push({ icon: '🏆', title: 'Completionist — your trophy\'s in the case' }); nextPop();
    }, 1200);
  }
  document.addEventListener('rw:egg', function (e) { unlock(e.detail); });

  // Trophy case: a footer button + a panel listing everything
  var footBtn = document.createElement('button');
  footBtn.type = 'button'; footBtn.className = 'ach-foot';
  var foot = $('.footer .wrap');
  if (foot) foot.insertBefore(footBtn, foot.lastElementChild);
  function paintCount() {
    var n = count();
    footBtn.innerHTML = '🏆 <b>' + n + '/' + ACH.length + '</b> secrets found';
    footBtn.setAttribute('aria-label', 'Trophy case: ' + n + ' of ' + ACH.length + ' secrets found');
    if (panel && !panel.hidden) renderPanel();
  }

  var panel = document.createElement('div');
  panel.className = 'ach-panel'; panel.hidden = true;
  panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-label', 'Trophy case');
  document.body.appendChild(panel);
  function renderPanel() {
    var n = count(), done = n === ACH.length;
    panel.innerHTML = '<div class="ach-box">' +
      '<button class="round-btn ach-close" type="button" aria-label="Close trophy case"><i class="fas fa-times"></i></button>' +
      '<span class="eyebrow">Trophy case</span>' +
      '<h2 class="h-display ach-h">' + (done ? 'Every. Single. <span class="blue">One.</span>' : n + ' of ' + ACH.length + ' <span class="blue">secrets found.</span>') + '</h2>' +
      '<div class="ach-bar"><i style="width:' + Math.round(n / ACH.length * 100) + '%"></i></div>' +
      '<ul class="ach-grid">' + ACH.map(function (a) {
        var on = !!got[a.id];
        return '<li class="' + (on ? 'on' : '') + '"><span class="ach-ico">' + (on ? a.icon : '🔒') + '</span><span><b>' + (on ? a.title : '???') + '</b><small>' + (on ? a.desc : a.hint) + '</small></span></li>';
      }).join('') + '</ul>' +
      (done ? '<button class="btn btn-primary ach-wall" type="button"><i class="fas fa-download"></i> Download your trophy wallpaper</button>'
            : '<p class="ach-note">Progress saves in this browser. Hints are on the locked ones.</p>') +
      '</div>';
    $('.ach-close', panel).addEventListener('click', closePanel);
    var wall = $('.ach-wall', panel); if (wall) wall.addEventListener('click', wallpaper);
  }
  var lastFocus = null;
  function openPanel() {
    lastFocus = document.activeElement;
    renderPanel(); panel.hidden = false; document.body.classList.add('modal-open');
    requestAnimationFrame(function () { panel.classList.add('open'); $('.ach-close', panel).focus(); });
  }
  function closePanel() {
    panel.classList.remove('open'); document.body.classList.remove('modal-open');
    setTimeout(function () { panel.hidden = true; }, 250);
    if (lastFocus) lastFocus.focus();
  }
  footBtn.addEventListener('click', openPanel);
  panel.addEventListener('click', function (e) { if (e.target === panel) closePanel(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !panel.hidden) closePanel(); });
  paintCount();

  // The completionist prize: a phone wallpaper drawn on a canvas, in the logo's colors
  function wallpaper() {
    var W = 1170, H = 2532, c = document.createElement('canvas'), x = c.getContext('2d');
    c.width = W; c.height = H;
    var g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#0a1430'); g.addColorStop(1, '#05070c');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    function hex(cx, cy, r) { x.beginPath(); for (var k = 0; k < 6; k++) { var an = Math.PI / 3 * k - Math.PI / 2; x.lineTo(cx + Math.cos(an) * r, cy + Math.sin(an) * r); } x.closePath(); }
    var r = 46, dx = r * Math.sqrt(3), dy = r * 1.5;
    for (var row = 0, y = 0; y < H + r; row++, y += dy) {
      for (var xx = (row % 2) * dx / 2; xx < W + r; xx += dx) {
        var d = Math.hypot(xx - W / 2, y - H * 0.42) / H;
        hex(xx, y, r - 5);
        x.fillStyle = 'rgba(91,143,249,' + Math.max(0.03, 0.42 - d * 0.9).toFixed(3) + ')';
        if (Math.random() < 0.08) x.fillStyle = 'rgba(141,178,255,' + Math.max(0.1, 0.7 - d).toFixed(3) + ')';
        x.fill();
      }
    }
    var img = new Image();
    img.onload = function () {
      var s = 420; x.shadowColor = 'rgba(91,143,249,.8)'; x.shadowBlur = 80;
      x.drawImage(img, W / 2 - s / 2, H * 0.42 - s / 2, s, s); x.shadowBlur = 0;
      x.textAlign = 'center'; x.fillStyle = '#fff';
      x.font = '700 120px "Saira Extra Condensed", "Arial Narrow", sans-serif';
      x.fillText('ACHIEVEMENT HUNTER', W / 2, H * 0.62);
      x.fillStyle = '#8db2ff'; x.font = '500 44px "JetBrains Mono", monospace';
      x.fillText(ACH.length + '/' + ACH.length + ' SECRETS · ROBWISCOUNT.ORG', W / 2, H * 0.62 + 90);
      x.fillStyle = 'rgba(238,242,251,.55)'; x.font = '400 38px Inter, sans-serif';
      x.fillText('Completed ' + new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }), W / 2, H * 0.62 + 160);
      c.toBlob(function (b) {
        var a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'rob-wiscount-trophy-wallpaper.png';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
      });
    };
    img.src = 'assets/rw-logo.png';
  }

  RW.commands.achievements = function () {
    RW.print('🏆 ' + count() + '/' + ACH.length + ' secrets found', 'ok');
    ACH.forEach(function (a) { RW.print((got[a.id] ? '✔ ' + a.title : '🔒 ??? — ' + a.hint), got[a.id] ? '' : 'dim'); });
    RW.print('<a href="#" data-trophies>→ open the trophy case</a>');
    var l = $$('[data-trophies]').pop();
    if (l) l.addEventListener('click', function (e) { e.preventDefault(); openPanel(); });
  };
  RW.commands.trophies = RW.commands.achievements;
  RW.commands.colophon = function () {
    RW.print('robwiscount.org — plain HTML, CSS and JS. No framework, no build step.', 'ok');
    RW.print('  page      GitHub Pages · one stylesheet on design tokens · one script per feature\n  live      Cloudflare Worker + Durable Object (SQLite): cursors, visits, guestbook\n  dogs      the real Fetch models → gltf-transform → three.js, ortho camera in CSS px\n  pool      elastic collisions, 14 substeps a frame, cushions, pockets\n  tests     Playwright + Lighthouse on every pull request', 'dim');
    RW.print('<a href="how-it-works.html">→ read the full write-up</a>');
    unlock('colophon');
  };
  RW.commands['how it works'] = RW.commands.colophon;
  RW.unlock = unlock;

  /* ==========================================================================
     Console: a note for whoever opens DevTools, and rob.hire()
     ========================================================================== */
  var hexArt = [
    '     ______',
    '    /      \\',
    '   /  R W   \\     Looking under the hood? I like you.',
    '   \\        /',
    '    \\______/      Try:  rob.hire()   rob.stack   rob.secrets()'
  ].join('\n');
  try {
    console.log('%c' + hexArt, 'color:#5b8ff9;font:600 12px/1.35 "JetBrains Mono",monospace');
    console.log('%cThis whole site is hand-written HTML, CSS and vanilla JS. No framework, no build step.', 'color:#98a3bd;font:12px Inter,sans-serif');
  } catch (e) {}
  window.rob = {
    hire: function () {
      unlock('console'); RW.party(); RW.openHire();
      return '📬 Great choice. The contact panel is open — or email robertwiscount@gmail.com';
    },
    stack: ['JavaScript', 'TypeScript', 'React', 'Next.js', 'Swift', 'SwiftUI', 'Node', 'PostgreSQL', 'Godot'],
    secrets: function () { return count() + '/' + ACH.length + ' secrets found. Type achievements in the terminal for hints.'; },
    toString: function () { return 'Rob Wiscount — try rob.hire()'; }
  };

  /* ==========================================================================
     Tab-away: the title and favicon miss you
     ========================================================================== */
  (function () {
    var title = document.title, icons = $$('link[rel="icon"]'), hrefs = icons.map(function (l) { return l.href; });
    var LINES = ['🏃 Rob\'s still running…', '👑 LeBron misses you', '🦅 Come back, GO BIRDS', '🐶 The dog is waiting…', '💾 Unsaved changes: you'];
    var timer = null, leftAt = 0, frame = 0;
    var fc = document.createElement('canvas'); fc.width = fc.height = 32;
    var fx = fc.getContext('2d');
    function drawIcon(t) {
      fx.clearRect(0, 0, 32, 32); fx.save(); fx.translate(16, 16); fx.rotate(t * Math.PI / 6);
      fx.beginPath(); for (var k = 0; k < 6; k++) { var an = Math.PI / 3 * k - Math.PI / 2; fx.lineTo(Math.cos(an) * 14, Math.sin(an) * 14); }
      fx.closePath(); fx.fillStyle = '#5b8ff9'; fx.fill(); fx.lineWidth = 2.5; fx.strokeStyle = '#fff'; fx.stroke(); fx.restore();
      fx.fillStyle = '#fff'; fx.font = 'bold 13px sans-serif'; fx.textAlign = 'center'; fx.textBaseline = 'middle'; fx.fillText('👋', 16, 17);
      var url = fc.toDataURL('image/png');
      icons.forEach(function (l) { l.href = url; });
    }
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        leftAt = Date.now();
        document.title = LINES[Math.floor(Math.random() * LINES.length)];
        clearInterval(timer);
        timer = setInterval(function () { drawIcon(frame++); }, 1000);
        drawIcon(frame++);
      } else {
        clearInterval(timer);
        icons.forEach(function (l, i) { l.href = hrefs[i]; });
        if (Date.now() - leftAt > 3000) { document.title = 'Welcome back 👋'; unlock('tabaway'); setTimeout(function () { document.title = title; }, 2200); }
        else document.title = title;
      }
    });
  })();

  /* ==========================================================================
     Terminal tricks
     ========================================================================== */
  var print = RW.print, esc = RW.esc, C = RW.commands;

  // vim: opens in INSERT mode, so :q just types into the file. Esc, then :wq.
  C.vim = function () {
    var normal = false, tries = 0;
    print('~\n~              VIM - Vi IMproved\n~     you are now trapped. this is your life now.\n~\n"rob.txt" 1L, 42B                          -- INSERT --', 'ok');
    RW.setTermMode(function (line) {
      if (line === null || /^esc(ape)?$/i.test(line)) { normal = true; print('-- NORMAL --', 'dim'); return; }
      var l = line.trim();
      if (!normal) {
        tries++;
        print('-- INSERT -- (you just typed "' + esc(l) + '" into rob.txt)', 'warn');
        if (tries >= 2) print('hint: press Esc first' + (RW.finePointer ? '' : ' (on a phone, type esc)'), 'dim');
        return;
      }
      if (l === ':wq' || l === ':x' || l === 'ZZ' || l === ':wq!') {
        RW.setTermMode(null);
        print('"rob.txt" written. You escaped vim. Put it on your resume. ✔', 'ok');
        unlock('vim');
      } else if (l === ':q') print('E37: No write since last change (add ! to override)', 'warn');
      else if (l === ':q!') print('lol no. (try saving on the way out)', 'warn');
      else if (l.charAt(0) === ':') print('E492: Not an editor command: ' + esc(l.slice(1)), 'warn');
      else { normal = false; print('-- INSERT --', 'dim'); }
    });
  };
  C.vi = C.nvim = C.vim;
  C.emacs = function () { print('emacs: a great operating system, lacking only a decent editor. try vim.', 'dim'); };
  C.nano = function () { print('nano? on MY website? try vim.', 'dim'); };

  // rm -rf /: what's on screen falls down, then git puts it back
  var nuking = false;
  function nuke() {
    print('rm: descending into / …', 'warn');
    if (reduceMotion || nuking) { print('…just kidding. Everything\'s fine. ✔', 'ok'); unlock('rmrf'); return; }
    nuking = true;
    var els = $$('main .reveal, main .btn, main .chip, main .term-hints button, .footer .wrap > *').filter(function (el) {
      var r = el.getBoundingClientRect();
      return r.bottom > 0 && r.top < innerHeight && r.width > 0 && r.width < innerWidth * 0.95;
    }).slice(0, 80);
    var anims = els.map(function (el, i) {
      var r = el.getBoundingClientRect(), fall = innerHeight - r.top + 200 + Math.random() * 300;
      return el.animate([
        { transform: 'translate(0,0) rotate(0)' },
        { transform: 'translate(' + ((Math.random() - 0.5) * 240) + 'px,' + fall + 'px) rotate(' + ((Math.random() - 0.5) * 120) + 'deg)' }
      ], { duration: 900 + Math.random() * 600, delay: 200 + Math.random() * 500 + i * 6, easing: 'cubic-bezier(.55,0,.9,.55)', fill: 'forwards' });
    });
    setTimeout(function () { RW.toast('💥 Kernel panic. Restoring from git…'); }, 1700);
    setTimeout(function () {
      anims.forEach(function (a) { a.updatePlaybackRate(1.6); a.reverse(); });
      setTimeout(function () {
        anims.forEach(function (a) { a.cancel(); });
        nuking = false;
        print('$ git checkout -- .\nRestored from backup. Commit early, commit often. ✔', 'ok');
        unlock('rmrf');
      }, 1600);
    }, 3000);
  }
  C['rm -rf /'] = C['sudo rm -rf /'] = C['rm -rf *'] = C['sudo rm -rf /*'] = C['rm -rf /*'] = nuke;
  C.rm = function () { print('rm: missing operand. (brave souls try: rm -rf /)', 'dim'); };

  C['make me a sandwich'] = function () { print('What? Make it yourself.', 'warn'); };
  C['sudo make me a sandwich'] = function () { print('Okay. 🥪', 'ok'); };

  C.npm = function (arg) {
    if (!/^(i|install|add)\s+rob/i.test(arg || '')) { print('usage: npm install rob', 'dim'); return; }
    var lines = [['⠋ resolving rob@latest…', 'dim'], ['⠙ fetching 5 years of production code…', 'dim'], ['⠹ linking front-end, full-stack, iOS…', 'dim'],
      ['added 1 developer and 400K lines of side projects in 2.4s', 'ok'], ['found 0 vulnerabilities (1 LeBron dependency, intentional)', 'ok'], ['run `hire rob` to finish setup', '']];
    lines.forEach(function (l, i) { setTimeout(function () { print(l[0], l[1]); if (i === 3) { var t = $('#term-body').getBoundingClientRect(); RW.burst(t.left + t.width / 2, t.top + 40, 50); } }, 300 * (i + 1)); });
  };

  C.cowsay = function (arg) {
    var text = (arg || 'hire rob').slice(0, 60), bar = new Array(text.length + 3).join('_'), dash = new Array(text.length + 3).join('-');
    print(esc(' ' + bar + '\n< ' + text + ' >\n ' + dash + '\n        \\   ^__^\n         \\  (oo)\\_______\n            (__)\\       )\\/\\\n                ||----w |\n                ||     ||'));
  };

  // Themes are just new values for the same CSS tokens the whole site is built on.
  var THEMES = {
    matrix: ['#22e36b', '#8dffb4', 'Wake up, Neo…'], eagles: ['#1fb5a8', '#7fe0d6', 'Fly, Eagles, fly 🦅'],
    phillies: ['#ff3347', '#ff8a96', 'Ring the bell 🔔'], flyers: ['#ff6a2b', '#ffab85', 'Let\'s go Flyers 🏒'],
    sixers: ['#3d7bff', '#9fbcff', 'Trust the process 🏀'], lebron: ['#f5b323', '#ffd877', 'LeBron mode 👑'], default: null
  };
  function setTheme(name) {
    var root = document.documentElement, t = THEMES[name];
    ['--blue', '--blue-hi', '--blue-soft', '--blue-glow'].forEach(function (v) { root.style.removeProperty(v); });
    root.removeAttribute('data-theme');
    if (!t) return;
    var rgb = t[0].match(/\w\w/g).map(function (h) { return parseInt(h, 16); }).join(',');
    root.style.setProperty('--blue', t[0]); root.style.setProperty('--blue-hi', t[1]);
    root.style.setProperty('--blue-soft', 'rgba(' + rgb + ',.12)'); root.style.setProperty('--blue-glow', 'rgba(' + rgb + ',.35)');
    root.setAttribute('data-theme', name);
    if (name === 'matrix' && !reduceMotion) rain();
  }
  C.theme = function (arg) {
    var name = (arg || '').toLowerCase();
    if (!(name in THEMES) && name !== 'blue') { print('usage: theme ' + Object.keys(THEMES).join(' | '), 'dim'); return; }
    if (name === 'blue') name = 'default';
    setTheme(name);
    print(name === 'default' ? 'Back to RW blue. ✔' : THEMES[name][2], 'ok');
    if (name !== 'default') unlock('theme');
  };
  function rain() {
    var cv = document.createElement('canvas'), cx = cv.getContext('2d'), cols, drops, t0 = performance.now();
    cv.className = 'matrix-rain'; document.body.appendChild(cv);
    cv.width = innerWidth; cv.height = innerHeight;
    cols = Math.ceil(innerWidth / 16); drops = []; for (var i = 0; i < cols; i++) drops.push(Math.random() * -40);
    (function tick(now) {
      cx.fillStyle = 'rgba(6,8,13,.12)'; cx.fillRect(0, 0, cv.width, cv.height);
      cx.fillStyle = '#22e36b'; cx.font = '15px "JetBrains Mono", monospace';
      drops.forEach(function (y, i) { cx.fillText('ROBWISCOUNT01'.charAt(Math.floor(Math.random() * 13)), i * 16, y * 16); drops[i] = y > cv.height / 16 && Math.random() > 0.96 ? 0 : y + 1; });
      var t = now - t0;
      cv.style.opacity = t < 2200 ? 1 : Math.max(0, 1 - (t - 2200) / 800);
      if (t < 3000) requestAnimationFrame(tick); else cv.remove();
    })(t0);
  }

  /* ==========================================================================
     End credits — `credits`, or keep scrolling past the footer
     ========================================================================== */
  var CREDITS = [
    ['', 'A Rob Wiscount Production'], ['', 'ROBWISCOUNT.ORG'],
    ['Directed by', 'Rob Wiscount'], ['Written by', 'Rob Wiscount'], ['Designed by', 'Rob Wiscount'], ['Front end, back end & everything in between', 'Rob Wiscount'],
    ['Graphics & video', 'Rob Wiscount (Final Cut, CapCut, Canva)'], ['Running coach', 'Mile A Day'], ['Co-founder & original bet', 'David'],
    ['Stunt dog', 'Fetch'], ['Music', 'LeBronify — all LeBron, all the time'], ['Craft coffee', 'Trouble Brewing'],
    ['Pool consultant', 'The Top Dawgs'], ['Box office analysis', 'FantasyFlicks'], ['Moral support', 'The Philadelphia Eagles'],
    ['Filmed on location in', 'South Jersey'], ['Special thanks', 'You, for scrolling this far'],
    ['', 'No LeBrons were harmed in the making of this website.']
  ];
  var crawlOpen = false;
  function rollCredits() {
    if (crawlOpen) return;
    crawlOpen = true;
    var ov = document.createElement('div');
    ov.className = 'credits'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-label', 'End credits');
    ov.innerHTML = '<div class="credits-stage"><div class="credits-roll">' +
      CREDITS.map(function (c) { return '<p>' + (c[0] ? '<small>' + c[0] + '</small>' : '') + '<b>' + c[1] + '</b></p>'; }).join('') +
      '</div></div><div class="credits-end" hidden><span class="stars">★★★★½</span><p>“Hired him before the credits ended.”</p><small>— a Letterboxd review, probably</small>' +
      '<button class="btn btn-primary" type="button" data-close>Back to the site</button></div>' +
      '<button class="credits-skip" type="button" data-close>Skip ✕</button>';
    document.body.appendChild(ov); document.body.classList.add('modal-open');
    var roll = $('.credits-roll', ov);
    function end() { $('.credits-stage', ov).hidden = true; $('.credits-end', ov).hidden = false; $('.credits-skip', ov).hidden = true; unlock('credits'); $('.credits-end .btn', ov).focus(); }
    if (reduceMotion) end(); else roll.addEventListener('animationend', end);
    function close() { ov.remove(); document.body.classList.remove('modal-open'); crawlOpen = false; document.removeEventListener('keydown', onKey); }
    function onKey(e) { if (e.key === 'Escape') close(); }
    $$('[data-close]', ov).forEach(function (b) { b.addEventListener('click', close); });
    document.addEventListener('keydown', onKey);
    requestAnimationFrame(function () { ov.classList.add('open'); $('.credits-skip', ov).focus(); });
  }
  C.credits = function () { print('Roll credits… 🎬 (Esc skips)', 'ok'); rollCredits(); };
  (function () {
    var pushed = 0, rolled = false, touchY = null;
    function atBottom() { return innerHeight + scrollY >= document.documentElement.scrollHeight - 2; }
    function push(d) {
      if (rolled || crawlOpen) return;
      if (!atBottom()) { pushed = 0; return; }
      pushed += d;
      if (pushed > 1400) { rolled = true; rollCredits(); }
    }
    window.addEventListener('wheel', function (e) { if (e.deltaY > 0) push(e.deltaY); else pushed = 0; }, { passive: true });
    window.addEventListener('touchstart', function (e) { touchY = e.touches[0].clientY; }, { passive: true });
    window.addEventListener('touchmove', function (e) { if (touchY !== null) { push((touchY - e.touches[0].clientY) * 2); touchY = e.touches[0].clientY; } }, { passive: true });
  })();

  /* ==========================================================================
     Mile A Day mode: scrolling the page is running it
     ========================================================================== */
  (function () {
    var runner = document.createElement('div');
    runner.className = 'mile-runner'; runner.setAttribute('aria-hidden', 'true');
    runner.innerHTML = '<span>🏃</span>';
    document.body.appendChild(runner);
    var started = 0, finished = false, idle;
    function onScroll() {
      var max = document.documentElement.scrollHeight - innerHeight, p = max > 0 ? Math.min(1, scrollY / max) : 0;
      runner.style.transform = 'translateX(' + (p * (innerWidth - 30)) + 'px)';
      runner.classList.toggle('show', scrollY > 240);
      if (!started && scrollY > 0) started = performance.now();
      if (!reduceMotion) { runner.classList.add('running'); clearTimeout(idle); idle = setTimeout(function () { runner.classList.remove('running'); }, 180); }
      if (!finished && started && p > 0.995) finish();
    }
    function finish() {
      finished = true;
      var secs = Math.max(1, Math.round((performance.now() - started) / 1000)), pace = Math.floor(secs / 60) + ':' + ('0' + secs % 60).slice(-2);
      var quip = secs < 45 ? 'Speedrun. Did you read any of it?' : secs < 223 ? 'Faster than the world record mile (3:43). Suspicious.' : 'Solid pace. Same time tomorrow?';
      var today = ymd(new Date()), y = new Date(); y.setDate(y.getDate() - 1);
      var s = store('rw-mile') || {};
      var streak = s.last === today ? s.streak || 1 : s.last === ymd(y) ? (s.streak || 1) + 1 : 1;
      store('rw-mile', { last: today, streak: streak });
      RW.toast('🏃 You ran 1 mile of robwiscount.org in ' + pace + '. ' + quip + (streak > 1 ? ' Day ' + streak + ' of your streak 🔥' : ''));
      runner.classList.add('done');
      unlock('mile');
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
  })();

  /* ==========================================================================
     Gameday: if a Philly team is playing, the hero knows the score
     ========================================================================== */
  (function () {
    var TEAMS = [
      { league: 'football/nfl', name: 'Eagles', emoji: '🦅', color: '#1fb5a8', cheer: 'GO BIRDS' },
      { league: 'basketball/nba', name: 'Sixers', emoji: '🏀', color: '#3d7bff', cheer: 'Trust the process' },
      { league: 'baseball/mlb', name: 'Phillies', emoji: '⚾', color: '#ff3347', cheer: 'Ring the bell' },
      { league: 'hockey/nhl', name: 'Flyers', emoji: '🏒', color: '#ff6a2b', cheer: 'Let\'s go Flyers' }
    ];
    var anchor = $('.status-pill'), pill = null, games = [], timer = null;
    if (!anchor || !window.fetch) return;

    function load(team) {
      var key = 'rw-gd-' + team.league;
      try { var c = JSON.parse(sessionStorage.getItem(key)); if (c && Date.now() - c.t < 90000) return Promise.resolve(c.g); } catch (e) {}
      return fetch('https://site.api.espn.com/apis/site/v2/sports/' + team.league + '/scoreboard')
        .then(function (r) { if (!r.ok) throw 0; return r.json(); })
        .then(function (data) {
          var g = null;
          (data.events || []).forEach(function (ev) {
            var comp = ev.competitions && ev.competitions[0];
            if (!comp) return;
            var us = comp.competitors.filter(function (c) { return c.team && c.team.abbreviation === 'PHI'; })[0];
            if (!us) return;
            var them = comp.competitors.filter(function (c) { return c !== us; })[0] || { team: {} };
            var st = (ev.status || comp.status || {}).type || {};
            g = { id: ev.id, state: st.state, detail: st.shortDetail || '', date: ev.date, us: +us.score || 0, them: +them.score || 0,
                  opp: them.team.shortDisplayName || them.team.name || 'them', won: !!us.winner };
          });
          try { sessionStorage.setItem(key, JSON.stringify({ t: Date.now(), g: g })); } catch (e) {}
          return g;
        })
        .catch(function () { return null; });
    }

    function line(t, g) {
      if (g.state === 'in') return t.name + ' ' + g.us + ', ' + g.opp + ' ' + g.them + ' · ' + g.detail;
      if (g.state === 'post') return (g.won ? t.name + ' beat the ' + g.opp + ' ' + g.us + '–' + g.them + ' · ' + t.cheer : t.name + ' fell to the ' + g.opp + ' ' + g.them + '–' + g.us + ' · we go again');
      return t.name + ' vs ' + g.opp + ' · ' + new Date(g.date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    }
    function fresh(g) { return g && (g.state === 'in' || Math.abs(Date.now() - new Date(g.date)) < 20 * 3600e3); }

    function render() {
      var pick = null;
      ['in', 'post', 'pre'].some(function (s) {
        games.some(function (x) { if (x.g && x.g.state === s && fresh(x.g)) { pick = x; return true; } return false; });
        return !!pick;
      });
      document.documentElement.classList.toggle('gameday', !!(pick && pick.g.state === 'in'));
      if (!pick) { if (pill) { pill.remove(); pill = null; } return; }
      if (!pill) { pill = document.createElement('a'); pill.className = 'gd-pill'; pill.href = '#terminal'; anchor.parentNode.insertBefore(pill, anchor.nextSibling); }
      pill.style.setProperty('--team', pick.t.color);
      document.documentElement.style.setProperty('--team', pick.t.color);
      pill.className = 'gd-pill ' + pick.g.state;
      pill.innerHTML = '<span class="gd-dot"></span>' + pick.t.emoji + ' ' + esc(line(pick.t, pick.g));
      pill.title = 'Type scores in the terminal';
      pill.onclick = function (e) { e.preventDefault(); RW.run('scores'); $('#terminal').scrollIntoView({ behavior: 'smooth' }); };
      // The first visit after a Philly win opens with confetti, once per game.
      if (pick.g.state === 'post' && pick.g.won) {
        var seen = store('rw-gd-won') || [];
        if (seen.indexOf(pick.g.id) < 0) {
          store('rw-gd-won', seen.concat(pick.g.id).slice(-20));
          setTimeout(function () { RW.party(); RW.toast(pick.t.emoji + ' ' + pick.t.cheer + '! ' + pick.t.name + ' won ' + pick.g.us + '–' + pick.g.them); }, 1600);
        }
      }
    }

    function refresh() {
      Promise.all(TEAMS.map(load)).then(function (res) {
        games = TEAMS.map(function (t, i) { return { t: t, g: res[i] }; });
        render();
        clearTimeout(timer);
        if (games.some(function (x) { return x.g && x.g.state === 'in'; })) timer = setTimeout(function () { if (!document.hidden) refresh(); else timer = setTimeout(refresh, 60000); }, 60000);
      });
    }
    setTimeout(refresh, 1200);

    C.scores = function () {
      if (!games.length) { print('Checking the scoreboard… try again in a sec.', 'dim'); refresh(); return; }
      games.forEach(function (x) {
        if (!x.g) print(x.t.emoji + ' ' + x.t.name + ': no game today', 'dim');
        else print(x.t.emoji + ' ' + esc(line(x.t, x.g)), x.g.state === 'in' ? 'ok' : '');
      });
    };
    C.score = C.scores;
  })();
})();
