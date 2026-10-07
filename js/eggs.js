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
  // Each locked achievement shows its title and a hint (what to do, and where); "Need a nudge?" gives
  // the exact steps. Phones get their own steps wherever the desktop way needs a keyboard or DevTools.
  var touch = !window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var ACH = [
    { id: 'konami', icon: '🎮', title: 'Cheat Code', desc: 'Entered the Konami code.',
      hint: 'Enter the classic video-game cheat code.',
      nudge: touch ? 'Swipe on the page: up, up, down, down, left, right, left, right — then tap twice.' : 'Press ↑ ↑ ↓ ↓ ← → ← → B A on your keyboard (anywhere outside the terminal).' },
    { id: 'logo', icon: '🌀', title: 'Spin Doctor', desc: 'Spun the RW logo five times.',
      hint: 'The big RW logo near the bottom of the page likes to spin.', nudge: 'Scroll to the Contact section and ' + (touch ? 'tap' : 'click') + ' the RW logo 5 times.' },
    { id: 'fetch', icon: '🐶', title: 'Good Game', desc: 'Booted up Fetch.',
      hint: 'There\'s a whole video game you can play on this page.', nudge: 'Go to the Fetch section and press Play — or type play fetch in the terminal.' },
    { id: 'lebron', icon: '👑', title: 'LeBronified', desc: 'Played a LeBronify banger.',
      hint: 'The LeBronify section is a music player. Play any song.', nudge: 'Scroll to LeBronify and press play — or type lebron in the terminal.' },
    { id: 'ripple', icon: '🌊', title: 'Making Waves', desc: 'Rippled the GitHub squares.',
      hint: 'The blue GitHub squares are clickable.', nudge: (touch ? 'Tap' : 'Click') + ' any square in the Commit log section.' },
    { id: 'console', icon: '🔧', title: 'Under the Hood', desc: 'Called rob.hire().',
      hint: touch ? 'There\'s a hidden rob.hire() command. The site\'s terminal can run it.' : 'Developers: there\'s a note for you in the browser console.',
      nudge: touch ? 'Type rob.hire() in the terminal (the Interactive section).' : 'Open DevTools (F12, or ⌥⌘I on a Mac), go to Console and type rob.hire() — or type it in the site\'s terminal.' },
    { id: 'tabaway', icon: '👋', title: 'You Came Back', desc: 'Left the tab and came back.',
      hint: 'Switch to another tab or app for a few seconds, then come back.', nudge: 'Peek at the tab\'s title while you\'re away — then return to this tab.' },
    { id: 'mile', icon: '🏃', title: 'Ran the Mile', desc: 'Scrolled the whole page, top to bottom.',
      hint: 'Scroll from the very top of the page all the way to the bottom.', nudge: 'Watch the little runner on the progress bar at the top — get them to the finish line.' },
    { id: 'credits', icon: '🎬', title: 'Stayed for the Credits', desc: 'Watched the end credits all the way through.',
      hint: 'Movie people stay until the very end. At the bottom of the page, keep scrolling until the film reel fills.', nudge: 'Or type credits in the terminal — and watch to the end without skipping.' },
    { id: 'vim', icon: '⌨️', title: 'Escaped Vim', desc: 'Got out of vim. Put it on your resume.',
      hint: 'Type vim in the terminal. Getting back out is the hard part.', nudge: 'Inside vim, press Esc' + (touch ? ' (on a phone, type esc)' : '') + ', then type :wq and press Enter.' },
    { id: 'rmrf', icon: '💥', title: 'Nuked It', desc: 'Ran rm -rf / and lived.',
      hint: 'In the terminal, try the command that deletes everything on a real computer. It\'s safe here!', nudge: 'Type rm -rf / in the terminal.' },
    { id: 'theme', icon: '🎨', title: 'Repainted', desc: 'Re-themed the whole site.',
      hint: 'Type theme in the terminal to see the color options.', nudge: 'Try theme eagles — or matrix, phillies, flyers, sixers or lebron.' },
    { id: 'dog', icon: '🦴', title: 'Who Let the Dog Out', desc: 'Whistled for the dog.',
      hint: touch ? 'There\'s a bone 🦴 hidden in the footer.' : 'Type the word dog anywhere on the page.', nudge: (touch ? 'Tap' : 'Click') + ' the 🦴 next to the copyright line at the very bottom — or type dog in the terminal.' },
    { id: 'pool', icon: '🎱', title: 'Break Shot', desc: 'Broke the rack on the About cards.',
      hint: 'Rob plays pool, and the About cards can turn into a rack.', nudge: 'Type break in the terminal — or ' + (touch ? 'tap' : 'click') + ' the 🎱 card in the About section three times fast.' },
    { id: 'colophon', icon: '📖', title: 'Read the Manual', desc: 'Found out how this site works.',
      hint: 'Find the page that explains how this site was built.', nudge: 'Open "How this site works" in the footer — or type colophon in the terminal.' }
  ];
  // The live ones only join the list once the live server has actually answered (js/live.js fires rw:live),
  // so nobody gets stuck at "15 of 17" on a day the server is down.
  var LIVE_ACH = [
    { id: 'live', icon: '🛰️', title: 'Not Alone', desc: 'Was on the site at the same time as someone else.',
      hint: 'Be on this site at the same moment as another visitor.', nudge: 'Open the site on two devices at once (say, your phone and a laptop), or send the link to a friend and visit together.' },
    { id: 'guestbook', icon: '✍️', title: 'Signed the Guestbook', desc: 'Left a note on the visitor map.',
      hint: 'Leave a note on the visitor map.', nudge: 'Scroll to the Visitors section and sign the guestbook.' }
  ];
  document.addEventListener('rw:live', function () {
    if (ACH.some(function (a) { return a.id === 'live'; })) return;
    ACH.push.apply(ACH, LIVE_ACH);
    paintCount();
  });
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
      // js/celebrate.js puts on the full show; fall back to confetti if it isn't loaded.
      if (RW.celebrate) RW.celebrate(); else { RW.party(); queue.push({ icon: '🏆', title: 'Completionist — your trophy\'s in the case' }); nextPop(); }
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
        return '<li class="' + (on ? 'on' : '') + '"><span class="ach-ico">' + (on ? a.icon : '🔒') + '</span><span><b>' + a.title + '</b><small>' + (on ? a.desc : a.hint) + '</small>' +
          (on ? '' : '<details class="ach-nudge"><summary>Need a nudge?</summary><small>' + a.nudge + '</small></details>') + '</span></li>';
      }).join('') + '</ul>' +
      (done ? '<div class="ach-done-actions"><button class="btn btn-primary ach-wall" type="button"><i class="fas fa-download"></i> Download your trophy wallpaper</button>' +
              (RW.celebrate ? '<button class="btn btn-ghost ach-replay" type="button"><i class="fas fa-trophy"></i> Replay the celebration</button>' : '') + '</div>'
            : '<p class="ach-note">Progress saves in this browser. Stuck? Open "Need a nudge?" on any locked one, or type <code>hint</code> in the terminal.</p>') +
      '</div>';
    $('.ach-close', panel).addEventListener('click', closePanel);
    var wall = $('.ach-wall', panel); if (wall) wall.addEventListener('click', wallpaper);
    var replay = $('.ach-replay', panel); if (replay) replay.addEventListener('click', function () { closePanel(); setTimeout(RW.celebrate, 300); });
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
    var g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, RW.rgba(RW.tc.blue.map(function (v) { return Math.round(v * 0.14); }))); g.addColorStop(1, '#05070c');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    function hex(cx, cy, r) { x.beginPath(); for (var k = 0; k < 6; k++) { var an = Math.PI / 3 * k - Math.PI / 2; x.lineTo(cx + Math.cos(an) * r, cy + Math.sin(an) * r); } x.closePath(); }
    var r = 46, dx = r * Math.sqrt(3), dy = r * 1.5;
    for (var row = 0, y = 0; y < H + r; row++, y += dy) {
      for (var xx = (row % 2) * dx / 2; xx < W + r; xx += dx) {
        var d = Math.hypot(xx - W / 2, y - H * 0.42) / H;
        hex(xx, y, r - 5);
        x.fillStyle = RW.rgba(RW.tc.blue, Math.max(0.03, 0.42 - d * 0.9).toFixed(3));
        if (Math.random() < 0.08) x.fillStyle = RW.rgba(RW.tc.hi, Math.max(0.1, 0.7 - d).toFixed(3));
        x.fill();
      }
    }
    var img = new Image();
    img.onload = function () {
      var s = 420; x.shadowColor = RW.rgba(RW.tc.blue, 0.8); x.shadowBlur = 80;
      x.filter = getComputedStyle(document.documentElement).getPropertyValue('--logo-filter').trim() || 'none'; // themed logo
      x.drawImage(img, W / 2 - s / 2, H * 0.42 - s / 2, s, s); x.shadowBlur = 0; x.filter = 'none';
      x.textAlign = 'center'; x.fillStyle = '#fff';
      x.font = '700 120px "Saira Extra Condensed", "Arial Narrow", sans-serif';
      x.fillText('ACHIEVEMENT HUNTER', W / 2, H * 0.62);
      x.fillStyle = RW.rgba(RW.tc.hi); x.font = '500 44px "JetBrains Mono", monospace';
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
    ACH.forEach(function (a) { RW.print((got[a.id] ? '✔ ' + a.title : '🔒 ' + a.title + ' — ' + a.hint), got[a.id] ? '' : 'dim'); });
    RW.print('Stuck? Type <span class="p">hint</span> for step-by-step help.', 'dim');
    RW.print('<a href="#" data-trophies>→ open the trophy case</a>');
    var l = $$('[data-trophies]').pop();
    if (l) l.addEventListener('click', function (e) { e.preventDefault(); openPanel(); });
  };
  RW.commands.trophies = RW.commands.achievements;
  // hint: the exact steps for the next locked one (run it again for the next).
  var hintAt = 0;
  RW.commands.hint = RW.commands.hints = function () {
    var left = ACH.filter(function (a) { return !got[a.id]; });
    if (!left.length) { RW.print('Nothing left to find — you got all ' + ACH.length + '. 🏆', 'ok'); return; }
    var a = left[hintAt++ % left.length];
    RW.print('💡 ' + a.title + ': ' + a.hint, 'ok');
    RW.print('   ' + a.nudge, 'dim');
    if (left.length > 1) RW.print('Type <span class="p">hint</span> again for another (' + left.length + ' left).', 'dim');
  };
  RW.commands['rob.hire()'] = RW.commands['rob.hire'] = function () { RW.print(window.rob.hire(), 'ok'); };
  RW.commands.colophon = function () {
    RW.print('robwiscount.org — plain HTML, CSS and JS. No framework, no build step.', 'ok');
    RW.print('  page      GitHub Pages · one stylesheet on design tokens · one script per feature\n  live      Cloudflare Worker + Durable Object (SQLite): cursors, visits, guestbook\n  dogs      the real Fetch models → gltf-transform → three.js, ortho camera in CSS px\n  pool      elastic collisions, 14 substeps a frame, cushions, pockets\n  tests     Playwright + Lighthouse on every pull request', 'dim');
    RW.print('<a href="how-it-works.html">→ read the full write-up</a>');
    unlock('colophon');
  };
  RW.commands['how it works'] = RW.commands.colophon;
  RW.unlock = unlock;
  // For js/celebrate.js: the achievement list, what's been found (id -> time), the wallpaper, the trophy case.
  RW.achievements = { list: function () { return ACH.slice(); }, got: function () { return got; }, wallpaper: wallpaper, open: openPanel };

  // The Konami code for phones: swipe up, up, down, down, left, right, left, right, then tap twice.
  (function () {
    var CODE = 'UUDDLRLRTT', seq = '', x0 = 0, y0 = 0, t0 = 0;
    window.addEventListener('touchstart', function (e) { var t = e.touches[0]; x0 = t.clientX; y0 = t.clientY; t0 = Date.now(); }, { passive: true });
    window.addEventListener('touchend', function (e) {
      var t = e.changedTouches[0], dx = t.clientX - x0, dy = t.clientY - y0, ax = Math.abs(dx), ay = Math.abs(dy), m;
      if (ax < 12 && ay < 12 && Date.now() - t0 < 350) m = 'T';
      else if (Math.max(ax, ay) > 40) m = ay > ax ? (dy < 0 ? 'U' : 'D') : (dx < 0 ? 'L' : 'R');
      else return;
      seq = (seq + m).slice(-CODE.length);
      if (seq === CODE) { seq = ''; RW.party(); RW.toast('🎮 Cheat code unlocked: +30 lives. Now go hire Rob.'); unlock('konami'); }
    }, { passive: true });
  })();

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
      fx.closePath(); fx.fillStyle = RW.rgba(RW.tc.blue); fx.fill(); fx.lineWidth = 2.5; fx.strokeStyle = '#fff'; fx.stroke(); fx.restore();
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

  /* ---------- Themes ----------
     A theme is new values for the four color tokens the whole site is built on, plus a little party:
     things floating behind the content, a chant ribbon, a fly-by. Team marks and mascots are trademarked,
     so the teams get their colors, emoji and chants instead of logos. */
  var THEMES = {
    lebron: { squares: 'gold.', blue: '#f5b323', hi: '#ffd877', line: 'LeBron mode 👑 — he\'s everywhere now.', ribbon: ['👑 LEBRON MODE', 'THE KING', 'TACO TUESDAY 🌮', 'YOU ARE MY SUNSHINE', 'GLAZED, NOT CONFUSED'], ribbonBg: '#552583', ribbonFg: '#fdb927',
      faces: ['bronicide', 'lehips', 'lenade', 'taco', 'lebronifornia'], count: 11, flyby: '👑', cameo: 'lebron-photo', emoji: '👑', label: 'LeBron',
      name: ['LeBron', 'James'],
      hero: {
        pill: 'Still the King', verb: 'I bring',
        roles: ['championships', 'chase-down blocks', 'Taco Tuesday', 'the I PROMISE School', 'my talents to South Beach'],
        proof: [['4×', 'NBA champion, with three different teams'], ['4×', 'NBA Finals MVP'], ['40K+', 'points, the most in NBA history']],
        copy: 'Forward at heart, point guard when needed. From <strong>Akron, Ohio</strong>, straight out of high school and the No. 1 pick in 2003. Rings in <strong>Miami, Cleveland and Los Angeles</strong>, the I PROMISE School back home, and somehow also the star of <strong>a parody Spotify Rob built</strong>. You are my sunshine. 🌞',
        badges: [['🏆', '4× NBA champion', 'Miami · Cleveland · L.A.'], ['👑', 'All-time leading scorer', '40,000+ points']]
      },
      portrait: ['assets/themes/lebron-portrait.png', 'assets/themes/lebron-head.webp'] },
    eagles: { squares: 'midnight green.', blue: '#1fb5a8', hi: '#7fe0d6', line: 'Fly, Eagles, fly 🦅', ribbon: ['🦅 E-A-G-L-E-S · EAGLES!', 'FLY EAGLES FLY', 'GO BIRDS', 'BIRD GANG'], ribbonBg: '#004c54', ribbonFg: '#d7dcdf',
      float: ['🦅', '🏈', '💚'], count: 10, flyby: '🦅', cameo: 'swoop', emoji: '🦅', label: 'Eagles' },
    phillies: { squares: 'Phillies red.', blue: '#ff3347', hi: '#ff8a96', line: 'Ring the bell 🔔', ribbon: ['🔔 RING THE BELL', 'RED OCTOBER', 'DANCING ON MY OWN', 'LET\'S GO PHILLIES'], ribbonBg: '#e81828', ribbonFg: '#ffffff',
      float: ['⚾', '🔔', '❤️'], count: 10, flyby: '⚾', stripes: true, cameo: 'phanatic', emoji: '⚾', label: 'Phillies' },
    flyers: { squares: 'orange and black.', blue: '#ff6a2b', hi: '#ffab85', line: 'Let\'s go Flyers 🏒', ribbon: ['🏒 LET\'S GO FLYERS', 'ORANGE AND BLACK', 'BROAD STREET', 'GRITTY WOULD APPROVE 🧡'], ribbonBg: '#000000', ribbonFg: '#f74902',
      float: ['🏒', '🥅', '🧡'], count: 10, flyby: '🏒', cameo: 'gritty', emoji: '🏒', label: 'Flyers' },
    sixers: { squares: 'Sixers blue.', blue: '#3d7bff', hi: '#9fbcff', line: 'Trust the process 🏀', ribbon: ['🏀 TRUST THE PROCESS', 'BROTHERLY LOVE', 'HERE THE SIXERS COME', 'PHILA UNITE'], ribbonBg: '#ed174c', ribbonFg: '#ffffff',
      float: ['🏀', '⭐', '🔔'], count: 10, flyby: '🏀', cameo: 'franklin', emoji: '🏀', label: 'Sixers' },
    matrix: { squares: 'green again. Whoa.', blue: '#22e36b', hi: '#8dffb4', line: 'Wake up, Neo… The Matrix has you.', ribbon: ['FOLLOW THE WHITE RABBIT 🐇', 'THERE IS NO SPOON 🥄', 'WHOA.', 'KNOCK, KNOCK, NEO'], ribbonBg: '#020a04', ribbonFg: '#22e36b',
      rain: true, cameo: 'keanu', emoji: '🕶️', label: 'Matrix' },
    default: null
  };
  var BASE_HUE = 221; // the RW logo's blue
  function hexHsl(hex) {
    var c = [0, 2, 4].map(function (i) { return parseInt(hex.substr(i + 1, 2), 16) / 255; });
    var mx = Math.max.apply(null, c), mn = Math.min.apply(null, c), l = (mx + mn) / 2, h = 0, sat = 0, d = mx - mn;
    if (d) {
      sat = d / (1 - Math.abs(2 * l - 1));
      h = mx === c[0] ? ((c[1] - c[2]) / d) % 6 : mx === c[1] ? (c[2] - c[0]) / d + 2 : (c[0] - c[1]) / d + 4;
      h = (h * 60 + 360) % 360;
    }
    return { h: h, s: sat, l: l };
  }

  var fx = null, rainRaf = 0, flybyTimer = 0;
  function clearFx() {
    if (fx) { fx.layer.remove(); if (fx.ribbon) fx.ribbon.remove(); if (fx.cameo) fx.cameo.remove(); fx = null; }
    cancelAnimationFrame(rainRaf); rainRaf = 0; clearInterval(flybyTimer); flybyTimer = 0;
    document.body.classList.remove('has-ribbon');
  }
  function rnd(a, b) { return a + Math.random() * (b - a); }

  function buildFx(name, t) {
    var layer = document.createElement('div');
    layer.className = 'theme-fx'; layer.setAttribute('aria-hidden', 'true');
    document.body.appendChild(layer);
    fx = { layer: layer };
    // Floaters: drift and bob behind the content, never in the way of a click.
    var n = innerWidth < 600 ? Math.ceil(t.count * 0.6) : t.count;
    for (var i = 0; i < (t.faces || t.float ? n : 0); i++) {
      var el;
      if (t.faces) { el = document.createElement('img'); el.src = 'assets/lebronify/faces/' + t.faces[i % t.faces.length] + '.png'; el.alt = ''; el.className = 'fx-float fx-face'; }
      else { el = document.createElement('span'); el.textContent = t.float[i % t.float.length]; el.className = 'fx-float'; }
      var size = t.faces ? rnd(44, 92) : rnd(22, 46);
      // Mostly in the side margins (wide screens have empty space there); the rest stay faint behind the text.
      var gutter = (innerWidth - 1180) / 2 + 30, side = gutter > 70 && Math.random() < 0.75;
      var x = side ? (Math.random() < 0.5 ? rnd(4, gutter - size - 8) : innerWidth - rnd(gutter - 8, size + 12)) : rnd(4, innerWidth - size - 4);
      if (!side) el.classList.add('fx-dim');
      el.style.cssText = 'left:' + Math.round(x) + 'px;top:' + rnd(6, 90).toFixed(1) + '%;--s:' + size.toFixed(0) + 'px;--d:' + rnd(7, 14).toFixed(1) + 's;--delay:-' + rnd(0, 10).toFixed(1) + 's;--r:' + rnd(-18, 18).toFixed(0) + 'deg';
      layer.appendChild(el);
    }
    // Chant ribbon along the bottom
    var rb = document.createElement('div');
    rb.className = 'theme-ribbon'; rb.setAttribute('aria-hidden', 'true');
    rb.style.setProperty('--rb-bg', t.ribbonBg); rb.style.setProperty('--rb-fg', t.ribbonFg);
    var text = t.ribbon.join('   ·   ') + '   ·   ';
    rb.innerHTML = '<div class="theme-ribbon-track"><span>' + text + text + '</span><span>' + text + text + '</span></div>';
    document.body.appendChild(rb); fx.ribbon = rb;
    document.body.classList.add('has-ribbon');
    // Matrix: a faint rain behind everything for as long as you're in it
    if (t.rain) matrixRain(layer);
    // Fly-by every so often
    if (t.flyby && !reduceMotion) {
      var fly = function () {
        var f = document.createElement('span');
        f.className = 'fx-flyby fx-' + name; f.textContent = t.flyby;
        f.style.top = rnd(14, 70).toFixed(0) + '%';
        layer.appendChild(f);
        setTimeout(function () { f.remove(); }, 4200);
      };
      setTimeout(fly, 700); flybyTimer = setInterval(function () { if (!document.hidden) fly(); }, 11000);
    }
  }

  function matrixRain(layer) {
    var cv = document.createElement('canvas'), cx = cv.getContext('2d'), cols, drops, last = 0, burstUntil = performance.now() + 2600;
    cv.className = 'fx-rain'; layer.appendChild(cv);
    function size() { cv.width = innerWidth; cv.height = innerHeight; cols = Math.ceil(innerWidth / 16); drops = []; for (var i = 0; i < cols; i++) drops.push(Math.random() * -40); }
    size(); window.addEventListener('resize', size);
    (function tick(now) {
      if (!fx || fx.layer !== layer) { window.removeEventListener('resize', size); return; }
      rainRaf = requestAnimationFrame(tick);
      if (now - last < (now < burstUntil ? 16 : 70)) return; // full speed for the intro, then a calm drizzle
      last = now;
      cx.fillStyle = 'rgba(6,8,13,.14)'; cx.fillRect(0, 0, cv.width, cv.height);
      cx.fillStyle = '#22e36b'; cx.font = '15px "JetBrains Mono", monospace';
      drops.forEach(function (y, i) { cx.fillText('ROBWISCOUNT01ｱｲｳｴｵｶｷ'.charAt(Math.floor(Math.random() * 20)), i * 16, y * 16); drops[i] = y > cv.height / 16 && Math.random() > 0.96 ? 0 : y + 1; });
      cv.style.opacity = now < burstUntil ? 1 : 0.22;
    })(performance.now());
    if (reduceMotion) { cancelAnimationFrame(rainRaf); cv.style.opacity = 0.15; }
  }

  /* Swaps: the LeBron theme puts LeBron in Rob's place (photo and name), and puts it all back after. */
  var swapped = null;
  function restoreSwaps() {
    if (!swapped) return;
    swapped.forEach(function (x) {
      if (x.attr === 'class') x.el.classList.remove(x.val);
      else if (x.attr === 'html') x.el.innerHTML = x.val;
      else if (x.attr) x.el.setAttribute(x.attr, x.val);
      else x.el.textContent = x.val;
    });
    if (swapped.roles && RW.setRoles) RW.setRoles(null);
    if (swapped.me) { // my photo pops back in
      swapped.me.classList.remove('back-in'); void swapped.me.offsetWidth; swapped.me.classList.add('back-in');
    }
    swapped = null;
  }
  // Swap an element's text (attr omitted), innerHTML ('html'), an attribute, or add a class ('class'); restoreSwaps undoes it.
  function swap(el, val, attr) {
    if (!el) return;
    if (attr === 'class') { if (el.classList.contains(val)) return; swapped.push({ el: el, attr: attr, val: val }); el.classList.add(val); return; }
    swapped.push({ el: el, attr: attr, val: attr === 'html' ? el.innerHTML : attr ? el.getAttribute(attr) : el.textContent });
    if (attr === 'html') el.innerHTML = val; else if (attr) el.setAttribute(attr, val); else el.textContent = val;
  }
  function firstThatLoads(srcs, done) { // try each image in order; call done(src) for the first that exists
    var i = 0;
    (function next() {
      if (i >= srcs.length) return;
      var im = new Image(), src = srcs[i++];
      im.onload = function () { done(src); }; im.onerror = next; im.src = src;
    })();
  }
  function applySwaps(name, t) {
    swapped = [];
    if (t.name) {
      var lines = document.querySelectorAll('.hero-title .line > span');
      if (lines[0]) swap(lines[0], t.name[0]);
      if (lines[1]) swap(lines[1], t.name[1]);
      swap(document.querySelector('.nav-brand span'), t.name.join(' '));
    }
    if (t.hero) { // the rest of the hero tells their story, not mine
      var h = t.hero, q = function (sel) { return document.querySelector(sel); };
      var pill = q('.status-pill');
      if (pill && pill.lastChild) swap(pill.lastChild, ' ' + h.pill);
      var sub = q('.hero-sub');
      if (sub && sub.firstChild && sub.firstChild.nodeType === 3) swap(sub.firstChild, h.verb + ' ');
      if (h.roles && RW.setRoles) { RW.setRoles(h.roles); swapped.roles = true; }
      var proof = document.querySelectorAll('.hero-proof li');
      (h.proof || []).forEach(function (p, i) { if (proof[i]) swap(proof[i], '<b>' + p[0] + '</b><span>' + p[1] + '</span>', 'html'); });
      if (h.copy) swap(q('.hero-copy'), h.copy, 'html');
      (h.badges || []).forEach(function (b, i) {
        var el = q('.fb-' + (i + 1));
        if (el) swap(el, '<span class="ico">' + b[0] + '</span><span>' + b[1] + '<small>' + b[2] + '</small></span>', 'html');
      });
    }
    if (t.portrait) {
      var img = document.querySelector('.portrait-hex img'), mine = swapped;
      firstThatLoads(t.portrait, function (src) {
        if (swapped !== mine) return; // theme changed while loading
        swap(img, src, 'src'); swap(img, 'Portrait of ' + t.name.join(' ') + ' (LeBron mode)', 'alt');
        swap(img, 'swapped-in', 'class');
        swapped.me = img;
      });
    }
  }

  /* Cameo: the team mascot (or Keanu, or LeBron) peeks up from the bottom corner, if its art is there. */
  function addCameo(t) {
    if (!t.cameo || !fx) return;
    var layer = fx.layer;
    firstThatLoads(['assets/themes/' + t.cameo + '.png'], function (src) {
      if (!fx || fx.layer !== layer) return;
      var c = document.createElement('img');
      c.className = 'fx-cameo'; c.src = src; c.alt = '';
      document.body.appendChild(c); fx.cameo = c;
      // Say hi, then duck down so only the head peeks over the ribbon (it would cover the page otherwise). Tap to pop back up.
      var tuck = function () { clearTimeout(c.t); c.t = setTimeout(function () { c.classList.add('tucked'); }, 5500); };
      c.addEventListener('click', function () { c.classList.remove('tucked'); tuck(); });
      tuck();
    });
  }

  /* The theme bar: shows which theme is on, lets you hop to another, and turns it off. No terminal needed. */
  var bar = null;
  function renderBar(name) {
    if (!THEMES[name]) { if (bar) { bar.classList.remove('show'); var b0 = bar; setTimeout(function () { if (!b0.classList.contains('show')) b0.hidden = true; }, 300); } return; }
    if (!bar) {
      bar = document.createElement('div');
      bar.className = 'theme-bar'; bar.setAttribute('role', 'group'); bar.setAttribute('aria-label', 'Theme');
      document.body.appendChild(bar);
      bar.addEventListener('click', function (e) {
        var b = e.target.closest('button');
        if (!b) return;
        switchTheme(b.getAttribute('data-theme'), e);
      });
    }
    var t = THEMES[name];
    bar.innerHTML = '<span class="tb-now">' + t.emoji + ' <b>' + t.label + ' mode</b></span>' +
      '<span class="tb-picks">' + Object.keys(THEMES).filter(function (k) { return THEMES[k] && k !== name; }).map(function (k) {
        return '<button type="button" class="tb-pick" data-theme="' + k + '" title="' + THEMES[k].label + ' mode" aria-label="Switch to ' + THEMES[k].label + ' mode" style="--sw:' + THEMES[k].blue + '">' + THEMES[k].emoji + '</button>';
      }).join('') + '</span>' +
      '<button type="button" class="tb-off" data-theme="default" aria-label="Back to normal"><i class="fas fa-times" aria-hidden="true"></i><span> Back to normal</span></button>';
    bar.hidden = false;
    requestAnimationFrame(function () { bar.classList.add('show'); });
  }

  /* Switching themes is a little show: the new theme spreads out from wherever you clicked (Matrix
     rains down in steps; going back to normal shrinks the theme away). View Transitions API where
     supported, a quick fade elsewhere. */
  function switchTheme(name, from) {
    var cur = document.documentElement.getAttribute('data-theme') || 'default';
    if (name === cur) return;
    var x = from && from.clientX != null ? from.clientX : innerWidth / 2, y = from && from.clientY != null ? from.clientY : innerHeight / 2;
    var apply = function () { setTheme(name); renderBar(name); };
    if (reduceMotion || !document.startViewTransition) {
      var veil = document.createElement('div'); veil.className = 'theme-veil'; document.body.appendChild(veil);
      setTimeout(apply, reduceMotion ? 0 : 140); setTimeout(function () { veil.remove(); }, 450);
      return;
    }
    var r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    var vt = document.startViewTransition(apply);
    vt.ready.then(function () {
      var el = document.documentElement, opts = { duration: 900, easing: 'cubic-bezier(.7,0,.25,1)' };
      if (name === 'default') { // the theme shrinks back into where you clicked
        el.animate({ clipPath: ['circle(' + r + 'px at ' + x + 'px ' + y + 'px)', 'circle(0px at ' + x + 'px ' + y + 'px)'] }, Object.assign({ pseudoElement: '::view-transition-old(root)', fill: 'forwards' }, opts));
      } else if (name === 'matrix') { // digital rain wipe
        el.animate({ clipPath: ['inset(0 0 100% 0)', 'inset(0 0 0% 0)'] }, { pseudoElement: '::view-transition-new(root)', duration: 1100, easing: 'steps(22, end)' });
      } else if (name === 'lebron') { // a crown-gold burst with a little spin
        el.animate({ clipPath: ['circle(0px at ' + x + 'px ' + y + 'px)', 'circle(' + r + 'px at ' + x + 'px ' + y + 'px)'], transform: ['scale(1.06) rotate(-2deg)', 'none'] }, Object.assign({ pseudoElement: '::view-transition-new(root)' }, opts));
      } else { // team themes sweep in diagonally like a jersey stripe
        el.animate({ clipPath: ['polygon(0 0, 0 0, -30% 100%, -30% 100%)', 'polygon(0 0, 130% 0, 100% 100%, -30% 100%)'] }, Object.assign({ pseudoElement: '::view-transition-new(root)' }, opts, { duration: 800 }));
      }
    }).catch(function () {});
  }
  RW.setTheme = switchTheme;

  function setTheme(name) {
    var root = document.documentElement, t = THEMES[name];
    ['--blue', '--blue-hi', '--blue-soft', '--blue-glow', '--logo-filter'].forEach(function (v) { root.style.removeProperty(v); });
    root.removeAttribute('data-theme');
    clearFx(); restoreSwaps();
    if (t) {
      var rgb = t.blue.match(/\w\w/g).map(function (h) { return parseInt(h, 16); }).join(',');
      root.style.setProperty('--blue', t.blue); root.style.setProperty('--blue-hi', t.hi);
      root.style.setProperty('--blue-soft', 'rgba(' + rgb + ',.12)'); root.style.setProperty('--blue-glow', 'rgba(' + rgb + ',.35)');
      var hsl = hexHsl(t.blue);
      root.style.setProperty('--logo-filter', 'hue-rotate(' + Math.round(hsl.h - BASE_HUE) + 'deg) saturate(' + Math.max(0.7, hsl.s / 0.93).toFixed(2) + ')');
      root.setAttribute('data-theme', name);
      buildFx(name, t); applySwaps(name, t); addCameo(t);
    }
    // "Green squares, but make them blue." names the theme's color instead.
    var sq = document.querySelector('#commits .h2 .blue');
    if (sq) { if (!sq.getAttribute('data-orig')) sq.setAttribute('data-orig', sq.textContent); sq.textContent = t ? 'but make them ' + t.squares : sq.getAttribute('data-orig'); }
    document.dispatchEvent(new CustomEvent('rw:theme', { detail: name }));
  }

  var NEO = [
    "        .-''''''-.",
    "      .'          '.",
    "     /   ________   \\",
    "    |   |__||  |__|   |     \"Whoa.\"",
    "    |        __        |",
    "     \\     '.__.'     /      - Neo",
    "      '.            .'",
    "        '-.______.-'"
  ].join('\n');

  C.theme = function (arg) {
    var name = (arg || '').toLowerCase();
    if (!(name in THEMES) && name !== 'blue') {
      print('usage: theme &lt;name&gt;   —   ' + Object.keys(THEMES).join(' · '), 'dim');
      return;
    }
    if (name === 'blue') name = 'default';
    var tr = document.querySelector('.terminal'), tb = tr && tr.getBoundingClientRect();
    switchTheme(name, tb ? { clientX: tb.left + tb.width / 2, clientY: tb.top + tb.height / 2 } : null);
    if (name === 'default') { print('Back to RW blue. ✔', 'ok'); return; }
    print(THEMES[name].line, 'ok');
    unlock('theme');
    if (name === 'matrix') {
      print(esc(NEO), 'ok');
      print('Red pill or blue pill? Type <span class="p">red</span> to stay in the Matrix, or <span class="p">blue</span> to wake up in your bed.', 'dim');
      RW.setTermMode(function (line) {
        var l = (line || '').trim().toLowerCase();
        RW.setTermMode(null);
        if (l === 'red' || l === 'red pill') print('Welcome to the real world. 🐇 (theme default gets you out)', 'ok');
        else if (l === 'blue' || l === 'blue pill') { switchTheme('default'); print('The story ends. You wake up in your bed and believe whatever you want to believe. 💊', 'ok'); }
        else if (l) RW.run(line);
      });
    } else print('<span class="dim">Back to normal any time: the ✕ at the bottom of the screen, or </span><span class="p">theme default</span>');
  };
  C.themes = function () { C.theme(''); };

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
    // Keep scrolling past the bottom and a cue fills up like a film reel; full reel = credits.
    // The cue shows how close you are, drains slowly instead of resetting, and can just be tapped.
    var NEED = 700, pushed = 0, cooldown = 0, touchY = null, drain = 0;
    var cue = document.createElement('button');
    cue.type = 'button'; cue.className = 'credits-cue';
    cue.innerHTML = '<span class="cc-text">🎬 Keep scrolling for the credits</span><span class="cc-bar"><i></i></span>';
    cue.setAttribute('aria-label', 'Roll the end credits');
    var foot = $('.footer'); (foot || document.body).appendChild(cue); // its own row at the very end of the page, never over anything
    var fill = cue.querySelector('i');
    function atBottom() { return innerHeight + scrollY >= document.documentElement.scrollHeight - 12; }
    function paint() { fill.style.transform = 'scaleX(' + Math.min(1, pushed / NEED).toFixed(3) + ')'; }
    function roll() { pushed = 0; paint(); cooldown = Date.now() + 1500; rollCredits(); }
    function push(d) {
      if (crawlOpen || Date.now() < cooldown || !atBottom()) return;
      pushed += d; paint();
      if (pushed >= NEED) return roll();
      clearInterval(drain); // let go and the reel slowly rewinds
      drain = setTimeout(function () { drain = setInterval(function () { pushed = Math.max(0, pushed - 30); paint(); if (!pushed) clearInterval(drain); }, 40); }, 900);
    }
    function onScroll() { cue.classList.toggle('show', atBottom()); } // lights up once you're there
    cue.addEventListener('click', roll);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('wheel', function (e) { if (e.deltaY > 0) push(Math.min(e.deltaY, 120)); }, { passive: true });
    window.addEventListener('keydown', function (e) { if ((e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === ' ' || e.key === 'End') && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) push(120); });
    window.addEventListener('touchstart', function (e) { touchY = e.touches[0].clientY; }, { passive: true });
    window.addEventListener('touchmove', function (e) { if (touchY !== null) { var d = touchY - e.touches[0].clientY; if (d > 0) push(d * 2.5); touchY = e.touches[0].clientY; } }, { passive: true });
  })();

  /* ==========================================================================
     Mile A Day mode: scrolling the page is running it
     ========================================================================== */
  (function () {
    // The page is one mile long. A pill rides the progress bar with how far you've "run",
    // cheers at each quarter, and turns into your finish time at the bottom. After a short
    // victory lap it packs itself away for the rest of the visit (the trophy case keeps the record).
    var chip = document.createElement('button');
    chip.type = 'button'; chip.className = 'mile-chip';
    chip.innerHTML = '<i class="fas fa-running" aria-hidden="true"></i><span class="mile-d">0.00 mi</span>';
    chip.setAttribute('aria-label', 'Mile A Day mode: this page is one mile long');
    var ticks = document.createElement('div');
    ticks.className = 'mile-ticks'; ticks.setAttribute('aria-hidden', 'true');
    ticks.innerHTML = '<i style="left:25%"></i><i style="left:50%"></i><i style="left:75%"></i>';
    document.body.appendChild(ticks); document.body.appendChild(chip);
    var dEl = chip.querySelector('.mile-d'), nav = $('.nav');
    var started = 0, finished = false, packed = false, idle = 0, fade = 0, best = 0, cheering = 0, lastQ = 0;
    var CHEERS = { 1: '¼ mile in 👟', 2: 'Halfway 💪', 3: '¾ — almost there' };

    function onScroll() {
      var max = document.documentElement.scrollHeight - innerHeight, p = max > 0 ? Math.min(1, Math.max(0, scrollY / max)) : 0;
      best = Math.max(best, p);
      var w = chip.offsetWidth || 90, x = Math.max(8, Math.min(innerWidth - w - 8, p * innerWidth - w / 2));
      var top = nav && !nav.classList.contains('hidden') ? 82 : 10; // stay clear of the nav when it's showing
      chip.style.transform = 'translate(' + Math.round(x) + 'px,' + top + 'px)';
      var show = !packed && (scrollY > 240 || finished);
      chip.classList.toggle('show', show); ticks.classList.toggle('show', show);
      if (!finished && !cheering) dEl.textContent = p.toFixed(2) + ' mi';
      if (!started && scrollY > 0) started = performance.now();
      var q = Math.floor(best * 4 + 1e-6);
      if (!finished && q > lastQ && q < 4) { lastQ = q; cheer(CHEERS[q]); }
      if (!reduceMotion) { chip.classList.add('running'); clearTimeout(idle); idle = setTimeout(function () { chip.classList.remove('running'); }, 200); }
      // Fade out while you read; come back when you scroll.
      chip.classList.remove('rest'); clearTimeout(fade); fade = setTimeout(function () { if (!finished) chip.classList.add('rest'); }, 2600);
      if (!finished && started && p > 0.995) finish();
    }
    function cheer(text) {
      cheering = 1; dEl.textContent = text; chip.classList.add('cheer');
      setTimeout(function () { cheering = 0; chip.classList.remove('cheer'); onScroll(); }, 1600);
    }
    function finish() {
      finished = true;
      var secs = Math.max(1, Math.round((performance.now() - started) / 1000)), pace = Math.floor(secs / 60) + ':' + ('0' + secs % 60).slice(-2);
      var quip = secs < 45 ? 'Speedrun. Did you read any of it?' : secs < 223 ? 'Faster than the world record mile (3:43). Suspicious.' : 'Solid pace. Same time tomorrow?';
      var today = ymd(new Date()), y = new Date(); y.setDate(y.getDate() - 1);
      var s = store('rw-mile') || {};
      var streak = s.last === today ? s.streak || 1 : s.last === ymd(y) ? (s.streak || 1) + 1 : 1;
      store('rw-mile', { last: today, streak: streak });
      chip.classList.add('done'); chip.classList.remove('rest');
      chip.querySelector('i').className = 'fas fa-flag-checkered';
      dEl.textContent = '1 mile · ' + pace;
      var r = chip.getBoundingClientRect(); RW.burst(r.left + r.width / 2, r.bottom, 50);
      RW.toast('🏃 You ran 1 mile of robwiscount.org in ' + pace + '. ' + quip + (streak > 1 ? ' Day ' + streak + ' of your streak 🔥' : ''));
      unlock('mile');
      setTimeout(function () { // victory lap's over: tuck it away so it isn't on screen all visit
        chip.classList.add('packed');
        setTimeout(function () { packed = true; onScroll(); }, 600);
      }, 6500);
    }
    chip.addEventListener('click', function () {
      RW.toast(finished ? '🏁 Mile logged. Rob runs one every day — the app that tracks it is up in Mile A Day.' : '🏃 This page is exactly one mile long. Scroll to the bottom to log your mile, Mile A Day style.');
    });
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
