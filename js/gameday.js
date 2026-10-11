/* robwiscount.org - Gameday: when a Philly team plays, the hero shows the score with real team logos,
   and the Game center panel has the box score, leaders, team stats, records and recent results.
   Everything comes from ESPN's public site API; logos are ESPN's own image URLs. Needs window.RW from js/site.js. */
(function () {
  'use strict';
  var RW = window.RW;
  if (!RW || !window.fetch) return;
  var $ = RW.$, esc = RW.esc, print = RW.print;

  var API = 'https://site.api.espn.com/apis/site/v2/sports/';
  var TEAMS = [
    { id: 'eagles', league: 'football/nfl', sport: 'nfl', name: 'Eagles', full: 'Philadelphia Eagles', color: '#1fb5a8', cheer: 'GO BIRDS', period: 'Q' },
    { id: 'sixers', league: 'basketball/nba', sport: 'nba', name: 'Sixers', full: 'Philadelphia 76ers', color: '#3d7bff', cheer: 'Trust the process', period: 'Q' },
    { id: 'phillies', league: 'baseball/mlb', sport: 'mlb', name: 'Phillies', full: 'Philadelphia Phillies', color: '#ff3347', cheer: 'Ring the bell', period: '' },
    { id: 'flyers', league: 'hockey/nhl', sport: 'nhl', name: 'Flyers', full: 'Philadelphia Flyers', color: '#ff6a2b', cheer: 'Let\'s go Flyers', period: 'P' }
  ];
  TEAMS.forEach(function (t) { t.logo = 'https://a.espncdn.com/i/teamlogos/' + t.sport + '/500/phi.png'; });

  function store(key, val) {
    try {
      if (val === undefined) return JSON.parse(localStorage.getItem(key));
      localStorage.setItem(key, JSON.stringify(val));
    } catch (e) { return null; }
  }

  // GET with a short sessionStorage cache, so reopening the panel or reloading the page doesn't refetch.
  function getJSON(url, maxAge) {
    var key = 'rw-gd:' + url;
    try { var c = JSON.parse(sessionStorage.getItem(key)); if (c && Date.now() - c.t < maxAge) return Promise.resolve(c.d); } catch (e) {}
    return fetch(url).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (d) {
      try { sessionStorage.setItem(key, JSON.stringify({ t: Date.now(), d: d })); } catch (e) {}
      return d;
    });
  }

  /* ---------- Parsing ESPN's shapes (the scoreboard and the schedule disagree on a few fields) ---------- */
  function logoOf(team) {
    if (!team) return '';
    if (team.logo) return team.logo;
    var l = (team.logos || [])[0];
    return l ? l.href : '';
  }
  function scoreOf(c) {
    var s = c.score;
    if (s && typeof s === 'object') s = s.displayValue != null ? s.displayValue : s.value;
    return s == null || s === '' ? null : +s;
  }
  function side(c) {
    var t = c.team || {}, rec = (c.records || c.record || []);
    var overall = rec.filter(function (r) { return r.type === 'total' || r.name === 'overall' || r.name === 'All Splits'; })[0] || rec[0];
    return {
      abbr: t.abbreviation || '', name: t.shortDisplayName || t.name || t.displayName || '', full: t.displayName || t.name || '',
      logo: logoOf(t), home: c.homeAway === 'home', score: scoreOf(c), winner: !!c.winner,
      record: overall ? overall.summary || overall.displayValue || '' : '',
      lines: (c.linescores || []).map(function (l) { return l.displayValue != null ? l.displayValue : l.value; }),
      leaders: c.leaders || []
    };
  }
  function parseEvent(ev) {
    var comp = ev.competitions && ev.competitions[0];
    if (!comp || !comp.competitors) return null;
    var sides = comp.competitors.map(side);
    var us = sides.filter(function (s) { return s.abbr === 'PHI'; })[0];
    if (!us) return null;
    var them = sides.filter(function (s) { return s !== us; })[0] || { name: 'them', lines: [], leaders: [] };
    var st = (ev.status || comp.status || {}), type = st.type || {};
    var tv = ((comp.broadcasts || [])[0] || {}).names || [];
    if (!tv.length && comp.broadcast) tv = [comp.broadcast];
    var sit = comp.situation || {};
    return {
      id: ev.id, date: ev.date, state: type.state || (type.completed ? 'post' : 'pre'),
      detail: type.shortDetail || type.detail || '', us: us, them: them,
      away: sides.filter(function (s) { return !s.home; })[0] || them, home: sides.filter(function (s) { return s.home; })[0] || us,
      won: us.winner, venue: (comp.venue || {}).fullName || '', tv: tv.join(', '),
      situation: sit.downDistanceText || sit.lastPlay && sit.lastPlay.text || '',
      leaders: comp.leaders || []
    };
  }

  // Today's game (or the one that just ended) from the league scoreboard.
  function loadToday(team) {
    return getJSON(API + team.league + '/scoreboard', 60000).then(function (data) {
      var g = null;
      (data.events || []).forEach(function (ev) { var p = parseEvent(ev); if (p) g = p; });
      return g;
    }).catch(function () { return null; });
  }

  /* ---------- The score pill in the hero ---------- */
  var anchor = $('.status-pill'), pill = null, games = [], timer = null;

  function score(g) { return g.us.score + '–' + g.them.score; }
  function line(t, g) {
    if (g.state === 'in') return t.name + ' ' + g.us.score + ', ' + g.them.name + ' ' + g.them.score + ' · ' + g.detail;
    if (g.state === 'post') return g.won ? t.name + ' beat the ' + g.them.name + ' ' + score(g) + ' · ' + t.cheer : t.name + ' fell to the ' + g.them.name + ' ' + g.them.score + '–' + g.us.score + ' · we go again';
    return t.name + ' vs ' + g.them.name + ' · ' + new Date(g.date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }
  function fresh(g) { return g && (g.state === 'in' || Math.abs(Date.now() - new Date(g.date)) < 20 * 3600e3); }
  // Width and height go in the markup too, so a 500px logo can never render full size (say, next to a stale stylesheet).
  var SIZE = { 'gd-logo': 22, 'gc-mini': 20, 'gc-logo': 64, 'gc-tab-logo': 22, 'gc-shot': 34 };
  function img(src, cls, alt) {
    var px = SIZE[cls.split(' ')[0]] || 24;
    return src ? '<img class="' + cls + '" src="' + esc(src) + '" alt="' + esc(alt || '') + '" width="' + px + '" height="' + px + '" loading="lazy" onerror="this.style.visibility=\'hidden\'">' : '<span class="' + cls + '"></span>';
  }

  function renderPill() {
    if (!anchor) return;
    var pick = null;
    ['in', 'post', 'pre'].some(function (s) {
      games.some(function (x) { if (x.g && x.g.state === s && fresh(x.g)) { pick = x; return true; } return false; });
      return !!pick;
    });
    document.documentElement.classList.toggle('gameday', !!(pick && pick.g.state === 'in'));
    if (!pick) { if (pill) { pill.remove(); pill = null; } return; }
    var t = pick.t, g = pick.g;
    if (!pill) {
      pill = document.createElement('button'); pill.type = 'button';
      anchor.parentNode.insertBefore(pill, anchor.nextSibling);
      pill.addEventListener('click', function () { open(pill.getAttribute('data-team')); });
    }
    pill.setAttribute('data-team', t.id);
    pill.style.setProperty('--team', t.color);
    document.documentElement.style.setProperty('--team', t.color);
    pill.className = 'gd-pill ' + g.state;
    pill.setAttribute('aria-label', line(t, g) + '. Open the game center');
    pill.innerHTML = '<span class="gd-dot" aria-hidden="true"></span>' +
      '<span class="gd-match" aria-hidden="true">' + img(g.us.logo || t.logo, 'gd-logo', '') +
        (g.state === 'pre' ? '<span class="gd-vs">vs</span>' : '<b>' + g.us.score + '</b><span class="gd-dash">–</span><b>' + g.them.score + '</b>') +
        img(g.them.logo, 'gd-logo', '') + '</span>' +
      '<span class="gd-detail" aria-hidden="true">' + esc(g.state === 'pre' ? new Date(g.date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : g.state === 'post' ? (g.won ? 'Final · W' : 'Final · L') : g.detail) + '</span>' +
      '<span class="gd-more" aria-hidden="true">Game center</span>';
    // The first visit after a Philly win opens with confetti, once per game.
    if (g.state === 'post' && g.won) {
      var seen = store('rw-gd-won') || [];
      if (seen.indexOf(g.id) < 0) {
        store('rw-gd-won', seen.concat(g.id).slice(-20));
        setTimeout(function () { RW.party(); RW.toast(t.cheer + '! ' + t.name + ' won ' + score(g)); }, 1600);
      }
    }
  }

  function refresh() {
    return Promise.all(TEAMS.map(loadToday)).then(function (res) {
      games = TEAMS.map(function (t, i) { return { t: t, g: res[i] }; });
      renderPill();
      if (panel && !panel.hidden) renderPanel();
      clearTimeout(timer);
      if (games.some(function (x) { return x.g && x.g.state === 'in'; })) {
        timer = setTimeout(function tick() { if (document.hidden) { timer = setTimeout(tick, 60000); return; } refresh(); }, 60000);
      }
    });
  }
  setTimeout(refresh, 1200);

  /* ---------- Game center panel ---------- */
  var panel = null, current = null, lastFocus = null, extra = {};

  function teamById(id) { return TEAMS.filter(function (t) { return t.id === id; })[0] || TEAMS[0]; }
  function todayOf(t) { var x = games.filter(function (x) { return x.t === t; })[0]; return x && x.g; }

  // Season record, standings line and recent results load when a team's tab opens.
  function loadExtra(t) {
    if (extra[t.id] && Date.now() - extra[t.id].t < 120000) return Promise.resolve(extra[t.id]);
    var g = todayOf(t);
    return Promise.all([
      getJSON(API + t.league + '/teams/phi', 600000).catch(function () { return null; }),
      getJSON(API + t.league + '/teams/phi/schedule', 600000).catch(function () { return null; }),
      g ? getJSON(API + t.league + '/summary?event=' + g.id, g.state === 'in' ? 45000 : 600000).catch(function () { return null; }) : null
    ]).then(function (r) {
      var e = { t: Date.now(), team: r[0] && r[0].team, schedule: r[1], summary: r[2] };
      extra[t.id] = e;
      return e;
    });
  }

  function seasonOf(team) {
    if (!team) return null;
    var items = (team.record && team.record.items) || [];
    function rec(type) { var it = items.filter(function (i) { return i.type === type; })[0]; return it ? it.summary : ''; }
    var total = items.filter(function (i) { return i.type === 'total'; })[0] || items[0] || {};
    var st = {};
    (total.stats || []).forEach(function (s) { st[s.name] = s.value; });
    var out = { record: total.summary || '', standing: team.standingSummary || '', home: rec('home'), road: rec('road'), stats: [] };
    if (st.streak != null && st.streak !== 0) out.stats.push(['Streak', (st.streak > 0 ? 'W' : 'L') + Math.abs(st.streak)]);
    if (st.winPercent != null) out.stats.push(['Win %', (+st.winPercent).toFixed(3).replace(/^0/, '')]);
    if (st.avgPointsFor != null) out.stats.push(['Scored / game', (+st.avgPointsFor).toFixed(1)]);
    if (st.avgPointsAgainst != null) out.stats.push(['Allowed / game', (+st.avgPointsAgainst).toFixed(1)]);
    if (st.pointDifferential != null) out.stats.push(['Differential', (st.pointDifferential > 0 ? '+' : '') + st.pointDifferential]);
    return out;
  }

  function recentOf(schedule) {
    var past = [], next = null;
    ((schedule && schedule.events) || []).forEach(function (ev) {
      var g = parseEvent(ev);
      if (!g) return;
      var comp = ev.competitions[0], done = (comp.status && comp.status.type && comp.status.type.completed) || g.state === 'post';
      if (done && g.us.score != null) past.push(g);
      else if (!done && !next && new Date(g.date) > Date.now() - 6 * 3600e3) next = g;
    });
    return { past: past.slice(-6).reverse(), next: next };
  }

  function linescore(t, g) {
    var n = Math.max(g.away.lines.length, g.home.lines.length);
    if (!n) return '';
    function label(i) {
      if (t.sport === 'mlb') return i + 1;
      var reg = t.sport === 'nhl' ? 3 : 4;
      if (i < reg) return t.period + (i + 1);
      if (t.sport === 'nhl') return i === reg ? 'OT' : 'SO';
      return i === reg ? 'OT' : 'OT' + (i - reg + 1);
    }
    var head = '', rows = '';
    for (var i = 0; i < n; i++) head += '<th scope="col">' + label(i) + '</th>';
    [g.away, g.home].forEach(function (s) {
      var cells = '';
      for (var i = 0; i < n; i++) cells += '<td>' + (s.lines[i] != null ? esc(String(s.lines[i])) : '') + '</td>';
      rows += '<tr' + (s.abbr === 'PHI' ? ' class="us"' : '') + '><th scope="row">' + img(s.logo, 'gc-mini', '') + esc(s.abbr) + '</th>' + cells + '<td class="gc-t">' + (s.score != null ? s.score : '') + '</td></tr>';
    });
    return '<div class="gc-scroll"><table class="gc-lines"><thead><tr><th scope="col"><span class="sr">Team</span></th>' + head + '<th scope="col" class="gc-t">T</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
  }

  // Leaders: the summary has them per team; the scoreboard has them per competitor (or per game in the NFL).
  function leadersOf(g, summary) {
    var out = [];
    function add(abbr, cats) {
      (cats || []).slice(0, 3).forEach(function (c) {
        var l = (c.leaders || [])[0];
        if (!l || !l.athlete) return;
        out.push({ abbr: abbr, cat: c.shortDisplayName || c.displayName || c.name, who: l.athlete.shortName || l.athlete.displayName, val: l.displayValue || '', shot: l.athlete.headshot && (l.athlete.headshot.href || l.athlete.headshot) });
      });
    }
    if (summary && summary.leaders && summary.leaders.length) {
      summary.leaders.forEach(function (t) { add((t.team || {}).abbreviation, t.leaders); });
    } else {
      [g.away, g.home].forEach(function (s) { add(s.abbr, s.leaders); });
    }
    return out;
  }

  // Team stats side by side, only where both teams report the same plain number.
  function teamStats(g, summary) {
    var teams = summary && summary.boxscore && summary.boxscore.teams;
    if (!teams || teams.length < 2) return [];
    function flat(t) {
      var m = {};
      (t.statistics || []).forEach(function (s) {
        if (s.stats) s.stats.forEach(function (x) { if (x.displayValue != null) m[x.label || x.abbreviation || x.name] = x.displayValue; });
        else if (s.displayValue != null) m[s.label || s.name] = s.displayValue;
      });
      return m;
    }
    var by = {};
    teams.forEach(function (t) { by[(t.team || {}).abbreviation] = flat(t); });
    var a = by[g.away.abbr], h = by[g.home.abbr];
    if (!a || !h) return [];
    return Object.keys(a).filter(function (k) { return h[k] != null && k.length < 26; }).slice(0, 8).map(function (k) {
      var x = parseFloat(a[k]), y = parseFloat(h[k]), share = isFinite(x) && isFinite(y) && x + y > 0 ? x / (x + y) : 0.5;
      return { label: k, away: a[k], home: h[k], share: share };
    });
  }

  function when(d) { return new Date(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); }
  function time(d) { return new Date(d).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); }

  function matchup(t, g) {
    function team(s) {
      return '<div class="gc-side' + (s.abbr === 'PHI' ? ' us' : '') + '">' + img(s.logo, 'gc-logo', s.full) +
        '<b>' + esc(s.name) + '</b><small>' + esc(s.record || (s.home ? 'Home' : 'Away')) + '</small></div>';
    }
    var mid = g.state === 'pre'
      ? '<div class="gc-mid"><span class="gc-when">' + esc(when(g.date)) + '</span><b class="gc-time">' + esc(time(g.date)) + '</b></div>'
      : '<div class="gc-mid ' + g.state + '"><div class="gc-score"><b' + (g.away.winner ? ' class="w"' : '') + '>' + g.away.score + '</b><span>–</span><b' + (g.home.winner ? ' class="w"' : '') + '>' + g.home.score + '</b></div>' +
        '<span class="gc-status ' + g.state + '">' + (g.state === 'in' ? '<i class="gd-dot"></i>' : '') + esc(g.detail) + '</span></div>';
    var meta = [g.venue, g.tv].filter(Boolean).map(esc).join(' · ');
    return '<div class="gc-match">' + team(g.away) + mid + team(g.home) + '</div>' +
      (g.situation && g.state === 'in' ? '<p class="gc-sit">' + esc(g.situation) + '</p>' : '') +
      (meta ? '<p class="gc-meta">' + meta + '</p>' : '');
  }

  function renderPanel() {
    if (!panel) return;
    var t = current, g = todayOf(t), e = extra[t.id], season = e && seasonOf(e.team), recent = e && recentOf(e.schedule);
    var tabs = TEAMS.map(function (x) {
      var tg = todayOf(x), live = tg && tg.state === 'in';
      return '<button type="button" role="tab" class="gc-tab' + (x === t ? ' on' : '') + '" data-team="' + x.id + '" aria-selected="' + (x === t) + '" style="--team:' + x.color + '">' +
        img(x.logo, 'gc-tab-logo', '') + '<span>' + x.name + '</span>' + (live ? '<i class="gd-dot" title="Live"></i>' : '') + '</button>';
    }).join('');

    var html = '<div class="gc-box" style="--team:' + t.color + '">' +
      '<button class="round-btn gc-close" type="button" aria-label="Close game center"><i class="fas fa-times"></i></button>' +
      '<span class="eyebrow">Game center · live from ESPN</span>' +
      '<div class="gc-tabs" role="tablist" aria-label="Team">' + tabs + '</div>';

    var game = g || (recent && recent.next) || (recent && recent.past[0]);
    if (game) {
      var label = game.state === 'in' ? 'Live now' : game.state === 'post' ? (game === g ? 'Today' : 'Last game') : 'Next game';
      html += '<section class="gc-card"><h3 class="gc-h">' + label + '</h3>' + matchup(t, game) + (game.state !== 'pre' ? linescore(t, game) : '') + '</section>';
      if (game === g && game.state !== 'pre') {
        var leaders = leadersOf(game, e && e.summary), stats = teamStats(game, e && e.summary);
        if (leaders.length || stats.length) {
          html += '<div class="gc-two">';
          if (leaders.length) html += '<section class="gc-card"><h3 class="gc-h">Leaders</h3><ul class="gc-leaders">' + leaders.map(function (l) {
            var logo = l.abbr === game.away.abbr ? game.away.logo : game.home.logo;
            return '<li' + (l.abbr === 'PHI' ? ' class="us"' : '') + '>' + (l.shot ? img(l.shot, 'gc-shot', '') : img(logo, 'gc-shot gc-shot-logo', '')) +
              '<span><b>' + esc(l.who) + '</b><small>' + esc(l.abbr + ' · ' + l.cat) + '</small></span><em>' + esc(l.val) + '</em></li>';
          }).join('') + '</ul></section>';
          if (stats.length) html += '<section class="gc-card"><h3 class="gc-h">Team stats</h3><div class="gc-stats-head">' + img(game.away.logo, 'gc-mini', game.away.abbr) + '<span></span>' + img(game.home.logo, 'gc-mini', game.home.abbr) + '</div><ul class="gc-cmp' + (game.home.abbr === 'PHI' ? ' us-home' : '') + '">' + stats.map(function (s) {
            return '<li><b>' + esc(s.away) + '</b><span>' + esc(s.label) + '<i style="--a:' + (s.share * 100).toFixed(1) + '%"></i></span><b>' + esc(s.home) + '</b></li>';
          }).join('') + '</ul></section>';
          html += '</div>';
        }
      }
    } else if (!e) {
      html += '<p class="gc-empty">Checking the schedule…</p>';
    } else {
      html += '<p class="gc-empty">No ' + t.name + ' games on the schedule right now.</p>';
    }

    if (season && season.record) {
      html += '<section class="gc-card"><h3 class="gc-h">Season</h3><div class="gc-season">' +
        '<div class="gc-rec"><b>' + esc(season.record) + '</b><small>' + esc(season.standing || 'Overall') + '</small></div>' +
        (season.home ? '<div><b>' + esc(season.home) + '</b><small>Home</small></div>' : '') +
        (season.road ? '<div><b>' + esc(season.road) + '</b><small>Away</small></div>' : '') +
        season.stats.map(function (s) { return '<div><b>' + esc(s[1]) + '</b><small>' + esc(s[0]) + '</small></div>'; }).join('') +
        '</div></section>';
    }

    if (recent && recent.past.length) {
      html += '<section class="gc-card"><h3 class="gc-h">Recent results</h3><ul class="gc-recent">' + recent.past.map(function (p) {
        var w = p.us.winner || (p.us.score > p.them.score);
        return '<li><span class="gc-wl ' + (w ? 'w' : 'l') + '">' + (w ? 'W' : 'L') + '</span>' + img(p.them.logo, 'gc-mini', '') +
          '<span class="gc-opp">' + (p.us.home ? 'vs ' : '@ ') + esc(p.them.name) + '</span><b>' + p.us.score + '–' + p.them.score + '</b><small>' + esc(when(p.date)) + '</small></li>';
      }).join('') + '</ul></section>';
    }
    if (recent && recent.next && game !== recent.next) {
      var n = recent.next;
      html += '<p class="gc-next">Next: ' + (n.us.home ? 'vs ' : '@ ') + esc(n.them.name) + ' · ' + esc(when(n.date) + ', ' + time(n.date)) + (n.tv ? ' · ' + esc(n.tv) : '') + '</p>';
    }
    html += '<p class="gc-foot">Scores and stats from ESPN. Logos belong to their teams.</p></div>';

    var focused = document.activeElement && document.activeElement.getAttribute && document.activeElement.getAttribute('data-team');
    panel.innerHTML = html;
    $('.gc-close', panel).addEventListener('click', close);
    if (focused) { var b = panel.querySelector('.gc-tab[data-team="' + focused + '"]'); if (b) b.focus(); }
  }

  function select(t) {
    current = t;
    renderPanel();
    loadExtra(t).then(function () { if (current === t && !panel.hidden) renderPanel(); });
  }

  function open(id) {
    if (!panel) {
      panel = document.createElement('div');
      panel.className = 'gc-panel'; panel.hidden = true;
      panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-label', 'Game center');
      document.body.appendChild(panel);
      panel.addEventListener('click', function (e) {
        if (e.target === panel) return close();
        var tab = e.target.closest('.gc-tab');
        if (tab) select(teamById(tab.getAttribute('data-team')));
      });
      panel.addEventListener('keydown', function (e) {
        var tab = e.target.closest && e.target.closest('.gc-tab');
        if (!tab || (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft')) return;
        var i = TEAMS.indexOf(teamById(tab.getAttribute('data-team'))), n = TEAMS[(i + (e.key === 'ArrowRight' ? 1 : TEAMS.length - 1)) % TEAMS.length];
        e.preventDefault(); select(n);
        var b = panel.querySelector('.gc-tab[data-team="' + n.id + '"]'); if (b) b.focus();
      });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && panel && !panel.hidden) close(); });
    }
    // Default to whoever is playing: live first, then today's final, then today's upcoming game.
    var t = id ? teamById(id) : null;
    if (!t) ['in', 'post', 'pre'].some(function (s) { return TEAMS.some(function (x) { var g = todayOf(x); if (g && g.state === s && fresh(g)) { t = x; return true; } return false; }); });
    lastFocus = document.activeElement;
    panel.hidden = false; document.body.classList.add('modal-open');
    select(t || TEAMS[0]);
    requestAnimationFrame(function () { panel.classList.add('open'); var c = $('.gc-close', panel); if (c) c.focus(); });
    if (!games.length) refresh();
  }
  function close() {
    panel.classList.remove('open'); document.body.classList.remove('modal-open');
    setTimeout(function () { panel.hidden = true; }, 250);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  // The Philly card in the About section links here too, so the scores are reachable on any day.
  var phillyLink = $('[data-gamecenter]');
  if (phillyLink) phillyLink.addEventListener('click', function (e) { e.preventDefault(); open(); });

  RW.gameday = { open: open, teams: TEAMS };
  RW.commands.scores = RW.commands.score = function () {
    if (!games.length) { print('Checking the scoreboard…', 'dim'); refresh().then(RW.commands.scores); return; }
    games.forEach(function (x) {
      if (!x.g) print(x.t.name + ': no game today', 'dim');
      else print(esc(line(x.t, x.g)), x.g.state === 'in' ? 'ok' : '');
    });
    print('<a href="#" data-gc-open>→ open the game center</a>');
  };
  RW.commands.gamecenter = RW.commands['game center'] = function () { open(); };
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('[data-gc-open]');
    if (a) { e.preventDefault(); open(); }
  });
})();
