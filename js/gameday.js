/* robwiscount.org - Gameday: the Philly Game center. A pill in the hero shows today's score with real team logos
   (or the four teams on an off day) and opens a panel with each team's season, numbers worth a look and every game
   back three seasons, and any game's box score, full player stats, scoring plays and win probability.
   Everything comes from ESPN's public site API; logos are ESPN's own image URLs. Needs window.RW from js/site.js. */
(function () {
  'use strict';
  var RW = window.RW;
  if (!RW || !window.fetch) return;
  var $ = RW.$, print = RW.print;
  function esc(s) { return RW.esc(s == null ? '' : String(s)); }

  var API = 'https://site.api.espn.com/apis/site/v2/sports/';
  var TEAMS = [
    { id: 'eagles', league: 'football/nfl', sport: 'nfl', name: 'Eagles', color: '#1fb5a8', cheer: 'GO BIRDS', unit: 'points' },
    { id: 'sixers', league: 'basketball/nba', sport: 'nba', name: 'Sixers', color: '#3d7bff', cheer: 'Trust the process', unit: 'points' },
    { id: 'phillies', league: 'baseball/mlb', sport: 'mlb', name: 'Phillies', color: '#ff3347', cheer: 'Ring the bell', unit: 'runs' },
    { id: 'flyers', league: 'hockey/nhl', sport: 'nhl', name: 'Flyers', color: '#ff6a2b', cheer: 'Let\'s go Flyers', unit: 'goals' }
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

  /* ---------- Parsing ESPN's shapes (scoreboard, schedule and summary disagree on a few fields) ---------- */
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
      id: String(t.id || ''), abbr: t.abbreviation || '', name: t.shortDisplayName || t.name || t.displayName || '', full: t.displayName || t.name || '',
      logo: logoOf(t), home: c.homeAway === 'home', score: scoreOf(c), winner: !!c.winner,
      record: overall ? overall.summary || overall.displayValue || '' : '',
      lines: (c.linescores || []).map(function (l) { return l.displayValue != null ? l.displayValue : l.value; }),
      hits: c.hits, errors: c.errors, leaders: c.leaders || []
    };
  }
  function parseEvent(ev) {
    var comp = ev.competitions && ev.competitions[0];
    if (!comp || !comp.competitors) return null;
    var sides = comp.competitors.map(side);
    var us = sides.filter(function (s) { return s.abbr === 'PHI'; })[0];
    if (!us) return null;
    var them = sides.filter(function (s) { return s !== us; })[0] || { name: 'them', lines: [], leaders: [] };
    var type = (ev.status || comp.status || {}).type || {};
    var done = !!type.completed || type.state === 'post';
    var tv = ((comp.broadcasts || [])[0] || {}).names || [];
    if (!tv.length && comp.broadcast) tv = [comp.broadcast];
    var sit = comp.situation || {};
    return {
      id: String(ev.id || comp.id), date: ev.date || comp.date, state: type.state || (done ? 'post' : 'pre'), done: done,
      detail: type.shortDetail || type.detail || '', us: us, them: them,
      away: sides.filter(function (s) { return !s.home; })[0] || them, home: sides.filter(function (s) { return s.home; })[0] || us,
      won: us.winner || (done && us.score != null && them.score != null && us.score > them.score),
      venue: (comp.venue || {}).fullName || '', tv: tv.join(', '),
      situation: sit.downDistanceText || (sit.lastPlay && sit.lastPlay.text) || '',
      post: (ev.seasonType && ev.seasonType.type === 3) || false
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

  /* ---------- Small formatting helpers ---------- */
  // Width and height go in the markup too, so a 500px logo can never render full size (say, next to a stale stylesheet).
  var SIZE = { 'gd-logo': 22, 'gd-team': 20, 'gc-mini': 20, 'gc-logo': 64, 'gc-tab-logo': 22, 'gc-shot': 34 };
  function img(src, cls, alt) {
    var px = SIZE[cls.split(' ')[0]] || 24;
    return src ? '<img class="' + cls + '" src="' + esc(src) + '" alt="' + esc(alt || '') + '" width="' + px + '" height="' + px + '" loading="lazy" onerror="this.style.visibility=\'hidden\'">' : '<span class="' + cls + '"></span>';
  }
  function when(d) { return new Date(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); }
  function shortDate(d) { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
  function time(d) { return new Date(d).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); }
  function score(g) { return g.us.score + '–' + g.them.score; }
  function vs(g) { return (g.us.home ? 'vs ' : '@ ') + g.them.name; }
  function line(t, g) {
    if (g.state === 'in') return t.name + ' ' + g.us.score + ', ' + g.them.name + ' ' + g.them.score + ' · ' + g.detail;
    if (g.state === 'post') return g.won ? t.name + ' beat the ' + g.them.name + ' ' + score(g) + ' · ' + t.cheer : t.name + ' fell to the ' + g.them.name + ' ' + g.them.score + '–' + g.us.score + ' · we go again';
    return t.name + ' vs ' + g.them.name + ' · ' + time(g.date);
  }
  function fresh(g) { return g && (g.state === 'in' || Math.abs(Date.now() - new Date(g.date)) < 20 * 3600e3); }
  // Every control in the panel is a button with data-act; data-k lets focus survive a re-render.
  function btn(act, attrs, html, cls, tab) {
    var a = '';
    for (var k in attrs) a += ' data-' + k + '="' + esc(attrs[k]) + '"';
    return '<button type="button" class="' + (cls || '') + '" data-act="' + act + '"' + a + (tab != null ? ' role="tab" aria-selected="' + !!tab + '"' : '') + '>' + html + '</button>';
  }
  function seg(label, items) { return '<div class="gc-seg" role="tablist" aria-label="' + esc(label) + '">' + items.join('') + '</div>'; }

  /* ---------- The pill in the hero: today's score, or the four teams on an off day ---------- */
  var anchor = $('.status-pill'), pill = null, games = [], timer = null;

  function todayPick() {
    var pick = null;
    ['in', 'post', 'pre'].some(function (s) {
      games.some(function (x) { if (x.g && x.g.state === s && fresh(x.g)) { pick = x; return true; } return false; });
      return !!pick;
    });
    return pick;
  }

  function renderPill() {
    if (!anchor) return;
    var pick = todayPick();
    document.documentElement.classList.toggle('gameday', !!(pick && pick.g.state === 'in'));
    if (!pill) {
      pill = document.createElement('button'); pill.type = 'button';
      anchor.parentNode.insertBefore(pill, anchor.nextSibling);
      pill.addEventListener('click', function () { open(pill.getAttribute('data-team') || null); });
    }
    if (!pick) {
      pill.className = 'gd-pill idle';
      pill.removeAttribute('data-team');
      pill.style.removeProperty('--team');
      pill.setAttribute('aria-label', 'Open the Philly game center: scores, records and stats');
      pill.innerHTML = '<span class="gd-teams" aria-hidden="true">' + TEAMS.map(function (t) { return img(t.logo, 'gd-team', ''); }).join('') + '</span>' +
        '<span class="gd-more">Game center</span>';
      return;
    }
    var t = pick.t, g = pick.g;
    pill.setAttribute('data-team', t.id);
    pill.style.setProperty('--team', t.color);
    document.documentElement.style.setProperty('--team', t.color);
    pill.className = 'gd-pill ' + g.state;
    pill.setAttribute('aria-label', line(t, g) + '. Open the game center');
    pill.innerHTML = '<span class="gd-dot" aria-hidden="true"></span>' +
      '<span class="gd-match" aria-hidden="true">' + img(g.us.logo || t.logo, 'gd-logo', '') +
        (g.state === 'pre' ? '<span class="gd-vs">vs</span>' : '<b>' + g.us.score + '</b><span class="gd-dash">–</span><b>' + g.them.score + '</b>') +
        img(g.them.logo, 'gd-logo', '') + '</span>' +
      '<span class="gd-detail" aria-hidden="true">' + esc(g.state === 'pre' ? time(g.date) : g.state === 'post' ? (g.won ? 'Final · W' : 'Final · L') : g.detail) + '</span>' +
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
      if (panel && !panel.hidden) {
        var live = view.game && games.some(function (x) { return x.g && x.g.id === view.game && x.g.state === 'in'; });
        if (live) loadGame(view.game, true); else renderPanel();
      }
      clearTimeout(timer);
      if (games.some(function (x) { return x.g && x.g.state === 'in'; })) {
        timer = setTimeout(function tick() { if (document.hidden) { timer = setTimeout(tick, 60000); return; } refresh(); }, 60000);
      }
    });
  }
  renderPill(); // the off-day pill shows right away; today's score replaces it once ESPN answers
  setTimeout(refresh, 1200);

  /* ---------- Data for the panel ---------- */
  var teamData = {}, seasons = {}, summaries = {};

  function teamById(id) { return TEAMS.filter(function (t) { return t.id === id; })[0] || TEAMS[0]; }
  function todayOf(t) { var x = games.filter(function (x) { return x.t === t; })[0]; return x && x.g; }

  function loadTeam(t) {
    if (teamData[t.id]) return Promise.resolve(teamData[t.id]);
    return getJSON(API + t.league + '/teams/phi', 600000).then(function (d) { return (teamData[t.id] = (d && d.team) || {}); })
      .catch(function () { return (teamData[t.id] = {}); });
  }

  // A season is the regular season plus the playoffs. The first call (no year) tells us which season is current.
  function loadSeason(t, year) {
    var key = t.id + ':' + (year || 'now');
    if (seasons[key]) return Promise.resolve(seasons[key]);
    var base = API + t.league + '/teams/phi/schedule';
    var first = year ? getJSON(base + '?season=' + year + '&seasontype=2', 3600e3) : getJSON(base, 600000);
    return first.catch(function () { return null; }).then(function (d) {
      var y = year || (d && ((d.requestedSeason && d.requestedSeason.year) || (d.season && d.season.year))) || null;
      var post = y ? getJSON(base + '?season=' + y + '&seasontype=3', year ? 3600e3 : 600000).catch(function () { return null; }) : Promise.resolve(null);
      return post.then(function (p) {
        var seen = {}, list = [];
        [d, p].forEach(function (x, i) {
          ((x && x.events) || []).forEach(function (ev) {
            var g = parseEvent(ev);
            if (!g || seen[g.id]) return;
            seen[g.id] = true;
            if (i === 1) g.post = true;
            list.push(g);
          });
        });
        list.sort(function (a, b) { return new Date(a.date) - new Date(b.date); });
        var s = { year: y, games: list, failed: !d };
        seasons[key] = s;
        if (!year && y) seasons[t.id + ':' + y] = s;
        return s;
      });
    });
  }

  function loadGame(id, force) {
    var t = view.team, today = todayOf(t), live = today && today.id === id && today.state === 'in';
    if (summaries[id] && !force) return Promise.resolve(summaries[id]);
    return getJSON(API + t.league + '/summary?event=' + id, live || force ? 30000 : 3600e3)
      .then(function (d) { summaries[id] = d || {}; })
      .catch(function () { if (!summaries[id]) summaries[id] = { failed: true }; })
      .then(function () { if (view.game === id) renderPanel(); });
  }

  // ESPN names NBA and NHL seasons by the year they end in, the NFL and MLB by the year they start.
  function seasonLabel(t, y) { return t.sport === 'nba' || t.sport === 'nhl' ? (y - 1) + '–' + String(y).slice(2) : String(y); }

  /* ---------- Numbers worth a look: computed from the season's finished games ---------- */
  function seasonOf(team) {
    if (!team || !team.record) return null;
    var items = team.record.items || [];
    function rec(type) { var it = items.filter(function (i) { return i.type === type; })[0]; return it ? it.summary : ''; }
    var total = items.filter(function (i) { return i.type === 'total'; })[0] || items[0] || {};
    var st = {};
    (total.stats || []).forEach(function (s) { st[s.name] = s.value; });
    return { record: total.summary || '', standing: team.standingSummary || '', home: rec('home'), road: rec('road'), st: st };
  }

  function funOf(t, list) {
    var done = list.filter(function (g) { return g.done && g.us.score != null && g.them.score != null; });
    if (!done.length) return [];
    var w = 0, run = 0, best = 0, big = null, worst = null, high = null, margin = 0, homeW = 0, homeN = 0;
    done.forEach(function (g) {
      var m = g.us.score - g.them.score;
      margin += m;
      if (g.us.home) { homeN++; if (g.won) homeW++; }
      if (g.won) { w++; run++; best = Math.max(best, run); } else run = 0;
      if (g.won && (!big || m > big.m)) big = { g: g, m: m };
      if (!g.won && (!worst || m < worst.m)) worst = { g: g, m: m };
      if (!high || g.us.score > high.g.us.score) high = { g: g };
    });
    var last = done.slice(-10), lw = last.filter(function (g) { return g.won; }).length;
    var out = [
      { k: 'Last ' + last.length, v: lw + '-' + (last.length - lw), form: last.map(function (g) { return g.won ? 'w' : 'l'; }) },
      { k: 'Best win streak', v: best ? String(best) : '0', sub: best === 1 ? 'game' : 'games in a row' }
    ];
    if (big) out.push({ k: 'Biggest win', v: '+' + big.m, sub: vs(big.g) + ' · ' + score(big.g), game: big.g.id });
    if (worst) out.push({ k: 'Toughest loss', v: '−' + Math.abs(worst.m), sub: vs(worst.g) + ' · ' + score(worst.g), game: worst.g.id });
    if (high) out.push({ k: 'Most ' + t.unit, v: String(high.g.us.score), sub: vs(high.g) + ' · ' + shortDate(high.g.date), game: high.g.id });
    out.push({ k: 'Avg margin', v: (margin >= 0 ? '+' : '−') + Math.abs(margin / done.length).toFixed(1), sub: homeN ? homeW + '-' + (homeN - homeW) + ' at home' : '' });
    return out;
  }

  /* ---------- Game pieces ---------- */
  function linescore(t, g) {
    var n = Math.max(g.away.lines.length, g.home.lines.length);
    if (!n) return '';
    function label(i) {
      if (t.sport === 'mlb') return i + 1;
      var reg = t.sport === 'nhl' ? 3 : 4, p = t.sport === 'nhl' ? 'P' : 'Q';
      if (i < reg) return p + (i + 1);
      if (t.sport === 'nhl') return i === reg ? 'OT' : 'SO';
      return i === reg ? 'OT' : 'OT' + (i - reg + 1);
    }
    var rhe = t.sport === 'mlb' && g.away.hits != null;
    var head = '', rows = '';
    for (var i = 0; i < n; i++) head += '<th scope="col">' + label(i) + '</th>';
    [g.away, g.home].forEach(function (s) {
      var cells = '';
      for (var i = 0; i < n; i++) cells += '<td>' + (s.lines[i] != null ? esc(String(s.lines[i])) : '') + '</td>';
      rows += '<tr' + (s.abbr === 'PHI' ? ' class="us"' : '') + '><th scope="row">' + img(s.logo, 'gc-mini', '') + esc(s.abbr) + '</th>' + cells +
        '<td class="gc-t">' + (s.score != null ? s.score : '') + '</td>' + (rhe ? '<td>' + esc(String(s.hits)) + '</td><td>' + esc(String(s.errors)) + '</td>' : '') + '</tr>';
    });
    return '<div class="gc-scroll"><table class="gc-lines"><thead><tr><th scope="col"><span class="sr">Team</span></th>' + head +
      '<th scope="col" class="gc-t">' + (rhe ? 'R' : 'T') + '</th>' + (rhe ? '<th scope="col">H</th><th scope="col">E</th>' : '') + '</tr></thead><tbody>' + rows + '</tbody></table></div>';
  }

  function matchup(g) {
    function team(s) {
      return '<div class="gc-side' + (s.abbr === 'PHI' ? ' us' : '') + '">' + img(s.logo, 'gc-logo', s.full) +
        '<b>' + esc(s.name) + '</b><small>' + esc(s.record || (s.home ? 'Home' : 'Away')) + '</small></div>';
    }
    var mid = g.state === 'pre'
      ? '<div class="gc-mid"><span class="gc-when">' + esc(when(g.date)) + '</span><b class="gc-time">' + esc(time(g.date)) + '</b></div>'
      : '<div class="gc-mid ' + g.state + '"><div class="gc-score"><b' + (g.away.winner ? ' class="w"' : '') + '>' + g.away.score + '</b><span>–</span><b' + (g.home.winner ? ' class="w"' : '') + '>' + g.home.score + '</b></div>' +
        '<span class="gc-status ' + g.state + '">' + (g.state === 'in' ? '<i class="gd-dot"></i>' : '') + esc(g.detail || 'Final') + '</span></div>';
    var meta = [g.state === 'pre' ? '' : when(g.date), g.post ? 'Playoffs' : '', g.venue, g.tv].filter(Boolean).map(esc).join(' · ');
    return '<div class="gc-match">' + team(g.away) + mid + team(g.home) + '</div>' +
      (g.situation && g.state === 'in' ? '<p class="gc-sit">' + esc(g.situation) + '</p>' : '') +
      (meta ? '<p class="gc-meta">' + meta + '</p>' : '');
  }

  // Leaders: the summary has them per team; the scoreboard has them per competitor.
  function leadersOf(g, summary) {
    var out = [];
    function logoFor(abbr) { return abbr === g.away.abbr ? g.away.logo : g.home.logo; }
    function add(abbr, cats) {
      (cats || []).slice(0, 4).forEach(function (c) {
        var l = (c.leaders || [])[0];
        if (!l || !l.athlete) return;
        out.push({ abbr: abbr, cat: c.shortDisplayName || c.displayName || c.name, who: l.athlete.shortName || l.athlete.displayName, val: l.displayValue || '',
          shot: l.athlete.headshot && (l.athlete.headshot.href || l.athlete.headshot), logo: logoFor(abbr) });
      });
    }
    if (summary && summary.leaders && summary.leaders.length) summary.leaders.forEach(function (t) { add((t.team || {}).abbreviation, t.leaders); });
    else [g.away, g.home].forEach(function (s) { add(s.abbr, s.leaders); });
    return out;
  }
  function leadersHTML(list) {
    return '<ul class="gc-leaders">' + list.map(function (l) {
      return '<li' + (l.abbr === 'PHI' ? ' class="us"' : '') + '>' + (l.shot ? img(l.shot, 'gc-shot', '') : img(l.logo, 'gc-shot gc-shot-logo', '')) +
        '<span><b>' + esc(l.who) + '</b><small>' + esc(l.abbr + ' · ' + l.cat) + '</small></span><em>' + esc(l.val) + '</em></li>';
    }).join('') + '</ul>';
  }

  // Every team stat both sides report, side by side.
  function teamStats(g, summary) {
    var teams = summary && summary.boxscore && summary.boxscore.teams;
    if (!teams || teams.length < 2) return [];
    function flat(t) {
      var m = {}, order = [];
      function put(k, v) { if (k && v != null && m[k] == null) { m[k] = v; order.push(k); } }
      (t.statistics || []).forEach(function (s) {
        if (s.stats) s.stats.forEach(function (x) { put(x.label || x.abbreviation || x.name, x.displayValue); });
        else put(s.label || s.name, s.displayValue);
      });
      return { m: m, order: order };
    }
    var by = {};
    teams.forEach(function (t) { by[(t.team || {}).abbreviation] = flat(t); });
    var a = by[g.away.abbr], h = by[g.home.abbr];
    if (!a || !h) return [];
    return a.order.filter(function (k) { return h.m[k] != null && k.length < 30; }).map(function (k) {
      var x = parseFloat(a.m[k]), y = parseFloat(h.m[k]), share = isFinite(x) && isFinite(y) && x + y > 0 ? x / (x + y) : 0.5;
      return { label: k, away: a.m[k], home: h.m[k], share: share };
    });
  }
  function statsHTML(g, stats) {
    return '<div class="gc-stats-head">' + img(g.away.logo, 'gc-mini', g.away.abbr) + '<span></span>' + img(g.home.logo, 'gc-mini', g.home.abbr) + '</div>' +
      '<ul class="gc-cmp' + (g.home.abbr === 'PHI' ? ' us-home' : '') + '">' + stats.map(function (s) {
        return '<li><b>' + esc(s.away) + '</b><span>' + esc(s.label) + '<i style="--a:' + (s.share * 100).toFixed(1) + '%"></i></span><b>' + esc(s.home) + '</b></li>';
      }).join('') + '</ul>';
  }

  // Win probability over the game, from Philly's side: above the middle line, we're favored.
  function winProb(g, summary) {
    var wp = summary && summary.winprobability;
    if (!wp || wp.length < 3) return '';
    var usHome = g.home.abbr === 'PHI', W = 600, H = 120;
    var pts = wp.map(function (p, i) {
      var v = usHome ? p.homeWinPercentage : 1 - p.homeWinPercentage;
      return [(i / (wp.length - 1) * W).toFixed(1), ((1 - v) * H).toFixed(1), v];
    });
    var path = pts.map(function (p, i) { return (i ? 'L' : 'M') + p[0] + ' ' + p[1]; }).join(' ');
    var now = Math.round(pts[pts.length - 1][2] * 100);
    return '<section class="gc-card"><h3 class="gc-h">Win probability <span class="gc-h-r">' + esc(g.us.abbr) + ' ' + now + '%</span></h3>' +
      '<svg class="gc-wp" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" role="img" aria-label="Philadelphia win probability over the game, ending at ' + now + ' percent">' +
      '<line x1="0" y1="' + H / 2 + '" x2="' + W + '" y2="' + H / 2 + '" class="gc-wp-mid"/>' +
      '<path d="' + path + ' L' + W + ' ' + H + ' L0 ' + H + 'Z" class="gc-wp-fill"/><path d="' + path + '" class="gc-wp-line"/></svg>' +
      '<div class="gc-wp-ends"><span>Start</span><span>' + (g.done ? 'Final' : 'Now') + '</span></div></section>';
  }

  function periodName(t, n) {
    if (t.sport === 'nhl') return n <= 3 ? 'Period ' + n : 'Overtime';
    if (t.sport === 'mlb') return 'Inning ' + n;
    return n <= 4 ? 'Quarter ' + n : 'Overtime';
  }
  function scoringHTML(t, g, summary) {
    var plays = (summary && summary.scoringPlays) || [];
    var byKey = {};
    [g.away, g.home].forEach(function (s) { byKey[s.id] = s; byKey[s.abbr] = s; });
    var last = null, html = '';
    plays.forEach(function (p) {
      var n = p.period && p.period.number;
      if (n !== last) { html += '<li class="gc-per">' + esc(periodName(t, n)) + '</li>'; last = n; }
      var s = byKey[(p.team && (p.team.abbreviation || p.team.id)) || ''] || {};
      html += '<li class="gc-play' + (s.abbr === 'PHI' ? ' us' : '') + '">' + img(s.logo || logoOf(p.team), 'gc-mini', '') +
        '<span><b>' + esc((p.type && p.type.text) || 'Score') + '</b><small>' + esc(p.text || '') + '</small></span>' +
        '<em>' + (p.awayScore != null ? esc(g.away.abbr + ' ' + p.awayScore + ' · ' + g.home.abbr + ' ' + p.homeScore) : '') + '<small>' + esc((p.clock && p.clock.displayValue) || '') + '</small></em></li>';
    });
    return '<ul class="gc-plays">' + html + '</ul>';
  }

  // Full box score: every player and every stat ESPN has, one table per category (passing, rushing, batting...).
  function boxHTML(g, summary) {
    var players = summary && summary.boxscore && summary.boxscore.players;
    if (!players || !players.length) return '<p class="gc-empty">No player stats for this game' + (g.state === 'pre' ? ' yet' : '') + '.</p>';
    var pick = players.filter(function (p) { return (p.team || {}).abbreviation === view.box; })[0] || players[0];
    var toggle = seg('Team', players.map(function (p) {
      var a = (p.team || {}).abbreviation, on = p === pick;
      return btn('box', { side: a, k: 'box-' + a }, img(logoOf(p.team), 'gc-mini', '') + esc((p.team || {}).shortDisplayName || (p.team || {}).displayName || a), 'gc-seg-b' + (on ? ' on' : ''), on);
    }));
    var tables = (pick.statistics || []).map(function (cat) {
      var labels = cat.labels || cat.names || [], desc = cat.descriptions || [], athletes = cat.athletes || [];
      if (!labels.length || !athletes.length) return '';
      var title = cat.text || (cat.name ? cat.name.charAt(0).toUpperCase() + cat.name.slice(1) : '');
      var body = athletes.map(function (a) {
        var p = a.athlete || {}, pos = p.position && p.position.abbreviation;
        var name = '<th scope="row"><b>' + esc(p.shortName || p.displayName || '') + '</b>' + (pos ? '<small>' + esc(pos) + '</small>' : '') + '</th>';
        if (a.didNotPlay || !(a.stats || []).length) return '<tr class="dnp">' + name + '<td colspan="' + labels.length + '">' + esc(a.reason || 'Did not play') + '</td></tr>';
        return '<tr' + (a.starter ? ' class="starter"' : '') + '>' + name + a.stats.map(function (v) { return '<td>' + esc(String(v)) + '</td>'; }).join('') + '</tr>';
      }).join('');
      var totals = (cat.totals || []).length ? '<tr class="tot"><th scope="row">Team</th>' + cat.totals.map(function (v) { return '<td>' + esc(String(v)) + '</td>'; }).join('') + '</tr>' : '';
      return '<section class="gc-bx-cat">' + (title ? '<h4>' + esc(title) + '</h4>' : '') + '<div class="gc-scroll"><table class="gc-bx"><thead><tr><th scope="col">Player</th>' +
        labels.map(function (l, i) { return '<th scope="col"' + (desc[i] ? ' title="' + esc(desc[i]) + '"' : '') + '>' + esc(l) + '</th>'; }).join('') +
        '</tr></thead><tbody>' + body + totals + '</tbody></table></div></section>';
    }).join('');
    return toggle + (tables || '<p class="gc-empty">No player stats for this team yet.</p>');
  }

  /* ---------- Panel views ---------- */
  var panel = null, lastFocus = null;
  var view = { team: TEAMS[0], year: null, game: null, tab: 'summary', box: 'PHI', all: false };

  function tabsHTML() {
    return '<div class="gc-tabs" role="tablist" aria-label="Team">' + TEAMS.map(function (x) {
      var tg = todayOf(x), live = tg && tg.state === 'in', on = x === view.team;
      return '<button type="button" role="tab" class="gc-tab' + (on ? ' on' : '') + '" data-act="team" data-team="' + x.id + '" data-k="team-' + x.id + '" aria-selected="' + on + '" style="--team:' + x.color + '">' +
        img(x.logo, 'gc-tab-logo', '') + '<span>' + x.name + '</span>' + (live ? '<i class="gd-dot" title="Live"></i>' : '') + '</button>';
    }).join('') + '</div>';
  }

  function resultRow(g) {
    var cls = g.done ? (g.won ? 'w' : 'l') : g.state === 'in' ? 'live' : 'pre';
    return '<li>' + btn('game', { id: g.id, k: 'g-' + g.id },
      '<span class="gc-wl ' + cls + '">' + (g.done ? (g.won ? 'W' : 'L') : g.state === 'in' ? '<i class="gd-dot"></i>' : '') + '</span>' + img(g.them.logo, 'gc-mini', '') +
      '<span class="gc-opp">' + esc(vs(g)) + (g.post ? ' <small class="gc-tag">Playoffs</small>' : '') + '</span>' +
      '<b>' + (g.done || g.state === 'in' ? g.us.score + '–' + g.them.score : esc(time(g.date))) + '</b><small>' + esc(shortDate(g.date)) + '</small>' +
      '<i class="fas fa-chevron-right gc-chev" aria-hidden="true"></i>', 'gc-row') + '</li>';
  }

  function teamView() {
    var t = view.team, today = todayOf(t), cur = seasons[t.id + ':now'], s = seasons[t.id + ':' + (view.year || 'now')];
    var html = '';
    var past = s ? s.games.filter(function (g) { return g.done; }).reverse() : [];
    var next = cur ? cur.games.filter(function (g) { return !g.done && new Date(g.date) > Date.now() - 6 * 3600e3; }) : [];

    if (!view.year) {
      var feature = (today && fresh(today) && today) || next[0] || past[0];
      if (feature) {
        var label = feature.state === 'in' ? 'Live now' : feature === today ? 'Today' : feature.done ? 'Last game' : 'Next game';
        html += '<section class="gc-card gc-feature"><h3 class="gc-h">' + label + (feature.state !== 'pre' ? btn('game', { id: feature.id, k: 'feat' }, 'Game stats <i class="fas fa-arrow-right" aria-hidden="true"></i>', 'gc-h-link') : '') + '</h3>' +
          matchup(feature) + (feature.state !== 'pre' ? linescore(t, feature) : '') + '</section>';
      }
      var season = seasonOf(teamData[t.id]);
      if (season && season.record) {
        var st = season.st, extra = [];
        if (st.streak) extra.push(['Streak', (st.streak > 0 ? 'W' : 'L') + Math.abs(st.streak)]);
        if (st.avgPointsFor != null) extra.push([t.unit.charAt(0).toUpperCase() + t.unit.slice(1) + ' / game', (+st.avgPointsFor).toFixed(1)]);
        if (st.avgPointsAgainst != null) extra.push(['Allowed / game', (+st.avgPointsAgainst).toFixed(1)]);
        html += '<section class="gc-card"><h3 class="gc-h">This season</h3><div class="gc-season">' +
          '<div class="gc-rec"><b>' + esc(season.record) + '</b><small>' + esc(season.standing || 'Overall') + '</small></div>' +
          (season.home ? '<div><b>' + esc(season.home) + '</b><small>Home</small></div>' : '') +
          (season.road ? '<div><b>' + esc(season.road) + '</b><small>Away</small></div>' : '') +
          extra.map(function (e) { return '<div><b>' + esc(e[1]) + '</b><small>' + esc(e[0]) + '</small></div>'; }).join('') + '</div></section>';
      }
      var upcoming = next.filter(function (g) { return g !== feature; }).slice(0, 3);
      if (upcoming.length) {
        html += '<section class="gc-card"><h3 class="gc-h">Coming up</h3><ul class="gc-results">' + upcoming.map(function (g) {
          return '<li><div class="gc-row static"><span class="gc-wl pre"></span>' + img(g.them.logo, 'gc-mini', '') + '<span class="gc-opp">' + esc(vs(g)) + '</span><b>' + esc(time(g.date)) + '</b><small>' + esc(shortDate(g.date)) + '</small><span></span></div></li>';
        }).join('') + '</ul></section>';
      }
    }

    // Season picker: this season and the two before it.
    var picker = '';
    if (cur && cur.year) {
      var years = [cur.year, cur.year - 1, cur.year - 2];
      picker = seg('Season', years.map(function (y, i) {
        var on = (view.year || cur.year) === y;
        return btn('season', { year: i ? y : '', k: 'y-' + y }, esc(seasonLabel(t, y)), 'gc-seg-b' + (on ? ' on' : ''), on);
      }));
    }
    html += '<section class="gc-card gc-games"><div class="gc-games-head"><h3 class="gc-h">' + (view.year ? 'Season' : 'Results') + '</h3>' + picker + '</div>';
    if (!s) html += '<p class="gc-empty">Loading the schedule…</p>';
    else if (s.failed && !s.games.length) html += '<p class="gc-empty">Couldn\'t reach ESPN for the schedule. Try again in a minute.</p>';
    else {
      var fun = funOf(t, s.games);
      if (fun.length) html += '<div class="gc-fun">' + fun.map(function (f) {
        var inner = '<small>' + esc(f.k) + '</small><b>' + esc(f.v) + '</b>' +
          (f.form ? '<span class="gc-form" aria-hidden="true">' + f.form.map(function (x) { return '<i class="' + x + '"></i>'; }).join('') + '</span>' : '') +
          (f.sub ? '<span class="gc-fun-sub">' + esc(f.sub) + '</span>' : '');
        return f.game ? btn('game', { id: f.game, k: 'fun-' + f.k }, inner, 'gc-fun-i link') : '<div class="gc-fun-i">' + inner + '</div>';
      }).join('') + '</div>';
      if (past.length) {
        var shown = view.all ? past : past.slice(0, 8);
        html += '<ul class="gc-results">' + shown.map(resultRow).join('') + '</ul>' +
          (past.length > shown.length ? btn('all', { k: 'all' }, 'Show all ' + past.length + ' games', 'gc-more-b') : '');
      } else html += '<p class="gc-empty">No ' + t.name + ' games played ' + (view.year ? 'that season.' : 'yet this season.') + '</p>';
    }
    return html + '</section>';
  }

  function findGame(id) {
    var t = view.team, g = null, today = todayOf(t);
    if (today && today.id === id) g = today;
    Object.keys(seasons).forEach(function (k) { if (!g && k.indexOf(t.id + ':') === 0) seasons[k].games.forEach(function (x) { if (x.id === id) g = x; }); });
    // The summary's header is the freshest and has the linescore, so it wins once it's here.
    var sum = summaries[id], hc = sum && sum.header && sum.header.competitions && sum.header.competitions[0];
    if (hc) {
      var p = parseEvent({ id: id, date: hc.date, competitions: [hc], status: hc.status });
      if (p) { if (g) { p.venue = p.venue || g.venue; p.tv = p.tv || g.tv; p.post = p.post || g.post; } g = p; }
    }
    return g;
  }

  function gameView() {
    var t = view.team, id = view.game, g = findGame(id), sum = summaries[id];
    var html = btn('back', { k: 'back' }, '<i class="fas fa-arrow-left" aria-hidden="true"></i> ' + esc(t.name) + (view.year ? ' ' + esc(seasonLabel(t, view.year)) : '') + ' games', 'gc-back');
    if (!g) return html + '<p class="gc-empty">Loading the game…</p>';
    html += '<section class="gc-card gc-feature">' + matchup(g) + linescore(t, g) + '</section>';
    var hasPlays = sum && sum.scoringPlays && sum.scoringPlays.length;
    var tabs = [['summary', 'Summary'], ['box', 'Player stats']];
    if (hasPlays) tabs.push(['plays', 'Scoring']);
    if (view.tab === 'plays' && !hasPlays) view.tab = 'summary';
    html += '<div class="gc-gtabs">' + seg('Game details', tabs.map(function (x) {
      var on = view.tab === x[0];
      return btn('gtab', { tab: x[0], k: 'gt-' + x[0] }, x[1], 'gc-seg-b' + (on ? ' on' : ''), on);
    })) + '</div>';
    if (!sum) return html + '<p class="gc-empty">Loading stats…</p>';
    if (sum.failed) return html + '<p class="gc-empty">ESPN didn\'t send stats for this game. Try again in a minute.</p>';
    if (view.tab === 'box') return html + '<section class="gc-card">' + boxHTML(g, sum) + '</section>';
    if (view.tab === 'plays') return html + '<section class="gc-card">' + scoringHTML(t, g, sum) + '</section>';

    var leaders = leadersOf(g, sum), stats = teamStats(g, sum);
    if (leaders.length) html += '<section class="gc-card"><h3 class="gc-h">Leaders</h3>' + leadersHTML(leaders) + '</section>';
    html += winProb(g, sum);
    if (stats.length) html += '<section class="gc-card"><h3 class="gc-h">Team stats</h3>' + statsHTML(g, stats) + '</section>';
    if (!leaders.length && !stats.length) html += '<p class="gc-empty">' + (g.state === 'pre' ? 'Stats show up once the game starts.' : 'No stats reported for this game.') + '</p>';
    var info = sum.gameInfo || {}, bits = [];
    if (info.attendance) bits.push('Attendance ' + Number(info.attendance).toLocaleString());
    if (info.officials && info.officials.length) bits.push('Officials: ' + info.officials.map(function (o) { return o.displayName || o.fullName; }).filter(Boolean).slice(0, 4).join(', '));
    if (bits.length) html += '<p class="gc-meta gc-info">' + bits.map(esc).join(' · ') + '</p>';
    return html;
  }

  function renderPanel() {
    if (!panel) return;
    var active = document.activeElement, focusKey = active && panel.contains(active) && active.getAttribute('data-k');
    var box = panel.firstChild, scroll = box ? box.scrollTop : 0;
    panel.innerHTML = '<div class="gc-box" style="--team:' + view.team.color + '">' +
      '<button class="round-btn gc-close" type="button" data-k="close" aria-label="Close game center"><i class="fas fa-times"></i></button>' +
      '<span class="eyebrow">Game center · from ESPN</span>' + tabsHTML() +
      '<div class="gc-body">' + (view.game ? gameView() : teamView()) + '</div>' +
      '<p class="gc-foot">Scores and stats from ESPN. Logos belong to their teams.</p></div>';
    panel.firstChild.scrollTop = scroll;
    $('.gc-close', panel).addEventListener('click', close);
    if (focusKey) { var b = panel.querySelector('[data-k="' + focusKey + '"]'); if (b) b.focus(); }
  }
  function toTop() { if (panel.firstChild) panel.firstChild.scrollTop = 0; }

  function selectTeam(t) {
    view = { team: t, year: null, game: null, tab: 'summary', box: 'PHI', all: false };
    renderPanel(); toTop();
    Promise.all([loadTeam(t), loadSeason(t)]).then(function () { if (view.team === t && !view.game) renderPanel(); });
  }
  function openGame(id) {
    view.game = id; view.tab = 'summary'; view.box = 'PHI';
    renderPanel(); toTop();
    var b = $('.gc-back', panel); if (b) b.focus();
    loadGame(id);
  }
  function back() {
    var id = view.game;
    view.game = null;
    renderPanel();
    var row = panel.querySelector('[data-k="g-' + id + '"]') || $('.gc-tab.on', panel); // land back on the game you opened
    if (row) { row.focus(); if (row.scrollIntoView) row.scrollIntoView({ block: 'center' }); }
  }

  function act(el) {
    var a = el.getAttribute('data-act');
    if (a === 'team') return selectTeam(teamById(el.getAttribute('data-team')));
    if (a === 'game') return openGame(el.getAttribute('data-id'));
    if (a === 'back') return back();
    if (a === 'gtab') { view.tab = el.getAttribute('data-tab'); return renderPanel(); }
    if (a === 'box') { view.box = el.getAttribute('data-side'); return renderPanel(); }
    if (a === 'all') { view.all = true; renderPanel(); var r = panel.querySelectorAll('.gc-results .gc-row')[8]; if (r) r.focus(); return; }
    if (a === 'season') {
      var y = el.getAttribute('data-year'), t = view.team;
      view.year = y ? +y : null; view.all = false;
      renderPanel();
      loadSeason(t, view.year).then(function () { if (view.team === t) renderPanel(); });
    }
  }

  function open(id) {
    if (!panel) {
      panel = document.createElement('div');
      panel.className = 'gc-panel'; panel.hidden = true;
      panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-label', 'Game center');
      document.body.appendChild(panel);
      panel.addEventListener('click', function (e) {
        if (e.target === panel) return close();
        var el = e.target.closest('[data-act]');
        if (el && panel.contains(el)) act(el);
      });
      panel.addEventListener('keydown', function (e) {
        var tab = e.target.closest && e.target.closest('.gc-tab');
        if (!tab || (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft')) return;
        var i = TEAMS.indexOf(teamById(tab.getAttribute('data-team'))), n = TEAMS[(i + (e.key === 'ArrowRight' ? 1 : TEAMS.length - 1)) % TEAMS.length];
        e.preventDefault(); selectTeam(n);
        var b = panel.querySelector('.gc-tab[data-team="' + n.id + '"]'); if (b) b.focus();
      });
      document.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape' || !panel || panel.hidden) return;
        if (view.game) back(); else close(); // Esc steps out of a game first, then closes
      });
    }
    // Default to whoever is playing: live first, then today's final, then today's upcoming game.
    var t = id ? teamById(id) : null, pick = todayPick();
    if (!t && pick) t = pick.t;
    lastFocus = document.activeElement;
    panel.hidden = false; document.body.classList.add('modal-open');
    selectTeam(t || TEAMS[0]);
    requestAnimationFrame(function () { panel.classList.add('open'); var c = $('.gc-close', panel); if (c) c.focus(); });
    if (!games.length) refresh();
  }
  function close() {
    panel.classList.remove('open'); document.body.classList.remove('modal-open');
    setTimeout(function () { panel.hidden = true; }, 250);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  // The Philly card in the About section links here too.
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
