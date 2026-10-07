/* robwiscount.org live — presence, cursors and a coarse visitor map.
   One Durable Object ("global") holds every socket and the visit tallies.
   Privacy: only Cloudflare's city/region/country (+ lat/lon rounded to 0.1°) is used.
   No IPs are stored or sent; browsers are deduped by a random per-day id they make up. */

const ORIGINS = ['https://robwiscount.org', 'https://www.robwiscount.org', 'https://robwizzie.github.io'];
const DEV_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
const MAX_SOCKETS = 100;
const MAX_MSG = 200;          // bytes per socket message
const MSG_PER_SEC = 30;       // client sends ~15/s; anything past this is dropped
const RECENT = 25;
const TOP_CITIES = 150;
const STATS_TTL = 5000;
const VISITS_PER_MIN = 240;   // global safety valve on /visit
const LETTERBOXD_USER = 'robwizzie';
const LETTERBOXD_TTL = 1800;  // seconds
const NOTE_MAX = 120, NAME_MAX = 24, NOTES_SHOWN = 40, PENDING_CAP = 300, NOTES_PER_HOUR = 30;
const SOURCE_DAYS = 120;      // how long visit sources are kept
const DEVICES = ['phone', 'tablet', 'desktop'];

function allowed(origin) { return !!origin && (ORIGINS.includes(origin) || DEV_ORIGIN.test(origin)); }

function cors(origin) {
  const h = { 'Vary': 'Origin' };
  if (allowed(origin)) {
    h['Access-Control-Allow-Origin'] = origin;
    h['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
    h['Access-Control-Allow-Headers'] = 'Content-Type, Authorization';
    h['Access-Control-Max-Age'] = '86400';
  }
  return h;
}

function json(body, status, origin, extra) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, cors(origin), extra || {})
  });
}

function clean(s, max) { return typeof s === 'string' ? s.replace(/[<>&"\u0000-\u001f]/g, '').trim().slice(0, max) : ''; }
function round1(v) { const n = parseFloat(v); return isFinite(n) ? Math.round(n * 10) / 10 : null; }

// Coarse place from request.cf. Dev override (?dev_city=…) only when ALLOW_DEV_OVERRIDE is set.
function placeOf(request, env, url) {
  const cf = request.cf || {};
  const p = {
    city: clean(cf.city, 60),
    region: clean(cf.regionCode, 8),
    country: clean(cf.country, 2).toUpperCase(),
    lat: round1(cf.latitude),
    lon: round1(cf.longitude)
  };
  if (env.ALLOW_DEV_OVERRIDE && url.searchParams.has('dev_city')) {
    const q = url.searchParams;
    p.city = clean(q.get('dev_city'), 60);
    p.region = clean(q.get('dev_region') || '', 8);
    p.country = clean(q.get('dev_country') || '', 2).toUpperCase();
    p.lat = round1(q.get('dev_lat'));
    p.lon = round1(q.get('dev_lon'));
  }
  if (p.country === 'T1' || p.country === 'XX') p.country = ''; // Tor / unknown
  return p;
}

// Constant-time compare for the admin token.
async function sameSecret(a, b) {
  const enc = new TextEncoder();
  const [x, y] = await Promise.all([a, b].map((v) => crypto.subtle.digest('SHA-256', enc.encode(v))));
  const p = new Uint8Array(x), q = new Uint8Array(y);
  let d = 0;
  for (let i = 0; i < p.length; i++) d |= p[i] ^ q[i];
  return d === 0;
}

/* ---------- Letterboxd: the latest diary entries, from the public RSS feed ---------- */
function decodeXml(s) {
  return String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").trim();
}
function tag(xml, name) { const m = xml.match(new RegExp('<' + name + '>([\\s\\S]*?)</' + name + '>')); return m ? decodeXml(m[1]) : ''; }

async function letterboxd(request, origin) {
  const cache = caches.default, key = new Request('https://rw-live.cache/letterboxd/' + LETTERBOXD_USER);
  let hit = await cache.match(key);
  if (!hit) {
    let films = [];
    try {
      const r = await fetch('https://letterboxd.com/' + LETTERBOXD_USER + '/rss/', { headers: { 'User-Agent': 'robwiscount.org (rw-live)' }, cf: { cacheTtl: LETTERBOXD_TTL } });
      if (r.ok) {
        const xml = await r.text();
        films = (xml.match(/<item>[\s\S]*?<\/item>/g) || []).map((it) => {
          const desc = tag(it, 'description'), poster = (desc.match(/<img[^>]+src="([^"]+)"/) || [])[1] || '';
          const title = tag(it, 'letterboxd:filmTitle');
          if (!title) return null; // lists, not diary entries
          return {
            title: cleanNote(title, 120), year: +tag(it, 'letterboxd:filmYear') || null,
            rating: parseFloat(tag(it, 'letterboxd:memberRating')) || null,
            watched: tag(it, 'letterboxd:watchedDate') || null, rewatch: tag(it, 'letterboxd:rewatch') === 'Yes',
            liked: tag(it, 'letterboxd:memberLike') === 'Yes',
            url: /^https:\/\/letterboxd\.com\//.test(tag(it, 'link')) ? tag(it, 'link') : 'https://letterboxd.com/' + LETTERBOXD_USER + '/',
            poster: /^https:\/\/[a-z0-9.-]*ltrbxd\.com\//.test(poster) ? poster : ''
          };
        }).filter(Boolean).slice(0, 6);
      }
    } catch (e) {}
    hit = new Response(JSON.stringify({ user: LETTERBOXD_USER, films }), {
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=' + (films.length ? LETTERBOXD_TTL : 120) }
    });
    await cache.put(key, hit.clone());
  }
  const out = new Response(hit.body, hit);
  const c = cors(origin);
  Object.keys(c).forEach((k) => out.headers.set(k, c[k]));
  out.headers.set('Cache-Control', 'public, max-age=600');
  return out;
}

/* ---------- Visit sources: where people came from (referrer host + ?r= tag + utm) ---------- */
const SOURCES = [
  [/(^|\.)(linkedin\.com|lnkd\.in)$/, 'LinkedIn'], [/(^|\.)github\.(com|io)$/, 'GitHub'], [/^mail\.google\.com$/, 'Gmail'],
  [/(^|\.)google\./, 'Google'], [/(^|\.)bing\.com$/, 'Bing'], [/(^|\.)duckduckgo\.com$/, 'DuckDuckGo'],
  [/(^|\.)indeed\./, 'Indeed'], [/(^|\.)glassdoor\./, 'Glassdoor'], [/(^|\.)(wellfound\.com|angel\.co)$/, 'Wellfound'],
  [/(^|\.)ziprecruiter\.com$/, 'ZipRecruiter'], [/(^|\.)(dice\.com)$/, 'Dice'], [/(^|\.)(greenhouse\.io|lever\.co|ashbyhq\.com|workday\.com|myworkdayjobs\.com)$/, 'Applicant tracker'],
  [/(^|\.)(t\.co|x\.com|twitter\.com)$/, 'X'], [/(^|\.)(facebook\.com|fb\.com|instagram\.com)$/, 'Meta'], [/(^|\.)reddit\.com$/, 'Reddit'],
  [/(^|\.)(chatgpt\.com|openai\.com|claude\.ai|perplexity\.ai)$/, 'AI assistant'], [/(^|\.)(outlook\.(live|office)\.com|mail\.yahoo\.com)$/, 'Email']
];
function sourceOf(refHost, utm) {
  if (utm) {
    const known = SOURCES.map((x) => x[1]).find((n) => n.toLowerCase() === utm.toLowerCase());
    return known || clean(utm, 40);
  }
  if (!refHost) return 'Direct';
  for (const [re, name] of SOURCES) if (re.test(refHost)) return name;
  return refHost;
}
function hostOf(ref) {
  try {
    const h = new URL(ref).hostname.toLowerCase().replace(/^www\./, '');
    return /^(robwiscount\.org|robwizzie\.github\.io|localhost|127\.0\.0\.1)$/.test(h) ? '' : h.slice(0, 80);
  } catch (e) { return ''; }
}
function slug(s, max) { return typeof s === 'string' ? s.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max) : ''; }

/* ---------- Guestbook notes: plain text, short, no links ---------- */
function cleanNote(s, max) {
  if (typeof s !== 'string') return '';
  return s.normalize('NFC').replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}
const LINKY = /(https?:|www\.|\b[a-z0-9-]+\.(com|net|org|io|ru|xyz|top|info|biz|co|me|app|link|ly)\b|@[a-z0-9-]+\.)/i;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const route = url.pathname.replace(/\/+$/, '') || '/';

    if (request.method === 'OPTIONS') return new Response(null, { status: allowed(origin) ? 204 : 403, headers: cors(origin) });
    if (route === '/') return json({ ok: true, service: 'rw-live' }, 200, origin);
    if (route === '/letterboxd') return letterboxd(request, origin);
    const admin = route.startsWith('/admin/');
    if (!['/live', '/visit', '/stats', '/guestbook'].includes(route) && !admin) return json({ error: 'not found' }, 404, origin);
    if (admin) {
      if (!env.ADMIN_TOKEN) return json({ error: 'ADMIN_TOKEN is not set — run: npx wrangler secret put ADMIN_TOKEN' }, 503, origin);
      if (!(await sameSecret(request.headers.get('Authorization') || '', 'Bearer ' + env.ADMIN_TOKEN))) return json({ error: 'unauthorized' }, 401, origin);
    }
    if (route === '/guestbook' && request.method === 'POST' && !allowed(origin)) return json({ error: 'forbidden origin' }, 403, origin);

    if (route === '/live') {
      if (request.headers.get('Upgrade') !== 'websocket') return json({ error: 'expected websocket' }, 426, origin);
      if (!allowed(origin)) return new Response('forbidden origin', { status: 403 });
    }
    if (route === '/visit') {
      if (request.method !== 'POST') return json({ error: 'POST only' }, 405, origin);
      if (!allowed(origin)) return json({ error: 'forbidden origin' }, 403, origin);
    }
    if (route === '/stats' && request.method !== 'GET') return json({ error: 'GET only' }, 405, origin);
    if (route === '/guestbook' && !['GET', 'POST'].includes(request.method)) return json({ error: 'GET or POST' }, 405, origin);

    // Hand the DO a fresh request: the coarse place rides in a header the client can't set.
    const headers = new Headers();
    headers.set('X-RW-Place', JSON.stringify(placeOf(request, env, url)));
    headers.set('X-RW-Origin', origin);
    if (route === '/live') headers.set('Upgrade', 'websocket');
    if (env.AUTO_APPROVE) headers.set('X-RW-Auto', '1');
    const body = request.method === 'POST' ? (await request.text()).slice(0, 1024) : undefined;
    const stub = env.LIVE.get(env.LIVE.idFromName('global'));
    const res = await stub.fetch(new Request('https://do' + route + url.search, { method: request.method, headers, body }));
    if (route === '/live') return res;
    const out = new Response(res.body, res);
    const c = cors(origin);
    Object.keys(c).forEach((k) => out.headers.set(k, c[k]));
    return out;
  }
};

export class Live {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.sql = ctx.storage.sql;
    this.rate = new Map();   // socket id -> { s: second, n: count }; in memory only, fine to lose on hibernation
    this.cache = null;
    this.visitWindow = { m: 0, n: 0 };
    this.lastPrune = 0;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS cities (k TEXT PRIMARY KEY, city TEXT, region TEXT, country TEXT, lat REAL, lon REAL, n INTEGER NOT NULL, last INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS cities_n ON cities (n DESC);
      CREATE TABLE IF NOT EXISTS recent (id INTEGER PRIMARY KEY AUTOINCREMENT, city TEXT, region TEXT, country TEXT, t INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS seen (h TEXT PRIMARY KEY, day TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS seen_day ON seen (day);
      CREATE TABLE IF NOT EXISTS sources (id INTEGER PRIMARY KEY AUTOINCREMENT, t INTEGER NOT NULL, day TEXT NOT NULL, source TEXT, host TEXT, tag TEXT, medium TEXT, campaign TEXT, page TEXT, city TEXT, region TEXT, country TEXT);
      CREATE INDEX IF NOT EXISTS sources_day ON sources (day);
      CREATE TABLE IF NOT EXISTS notes (id INTEGER PRIMARY KEY AUTOINCREMENT, t INTEGER NOT NULL, status TEXT NOT NULL, name TEXT, note TEXT NOT NULL, city TEXT, region TEXT, country TEXT, lat REAL, lon REAL, h TEXT);
      CREATE INDEX IF NOT EXISTS notes_status ON notes (status, id);
    `);
    this.noteWindow = { h: 0, n: 0 };
    // Answer keepalive pings without waking the object.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  async fetch(request) {
    const url = new URL(request.url);
    let place = {};
    try { place = JSON.parse(request.headers.get('X-RW-Place') || '{}'); } catch (e) {}
    if (url.pathname === '/live') return this.connect(place);
    if (url.pathname === '/visit') return this.visit(place, await request.text());
    if (url.pathname === '/guestbook') return request.method === 'POST' ? this.sign(place, await request.text(), !!request.headers.get('X-RW-Auto')) : json(this.notes());
    if (url.pathname === '/admin/summary') return json(this.summary(+url.searchParams.get('days') || 30));
    if (url.pathname === '/admin/note') return this.moderate(await request.text());
    return json(this.stats());
  }

  /* ---------- Visits ---------- */
  async visit(place, raw) {
    let id = '', body = {};
    try { body = JSON.parse(raw || '{}') || {}; id = String(body.id || ''); } catch (e) {}
    if (!/^[A-Za-z0-9_-]{8,64}$/.test(id)) return json({ error: 'bad id' }, 400);

    const now = Date.now(), day = new Date(now).toISOString().slice(0, 10);
    const minute = Math.floor(now / 60000);
    if (this.visitWindow.m !== minute) this.visitWindow = { m: minute, n: 0 };

    // Hash the id with the day so the stored key is useless outside today.
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(day + ':' + id));
    const h = [...new Uint8Array(digest).slice(0, 12)].map((b) => b.toString(16).padStart(2, '0')).join('');
    const fresh = this.sql.exec('SELECT 1 FROM seen WHERE h = ?', h).toArray().length === 0;
    let counted = false;

    if (fresh && this.visitWindow.n++ < VISITS_PER_MIN) {
      counted = true;
      this.sql.exec('INSERT OR IGNORE INTO seen (h, day) VALUES (?, ?)', h, day);
      this.sql.exec("INSERT INTO meta (k, v) VALUES ('total', 1) ON CONFLICT(k) DO UPDATE SET v = v + 1");
      if (place.city && place.lat != null && place.lon != null) {
        const k = (place.city + '|' + place.region + '|' + place.country).toLowerCase();
        this.sql.exec(
          `INSERT INTO cities (k, city, region, country, lat, lon, n, last) VALUES (?, ?, ?, ?, ?, ?, 1, ?)
           ON CONFLICT(k) DO UPDATE SET n = n + 1, last = excluded.last, lat = excluded.lat, lon = excluded.lon`,
          k, place.city, place.region || '', place.country || '', place.lat, place.lon, now);
      }
      this.sql.exec('INSERT INTO recent (city, region, country, t) VALUES (?, ?, ?, ?)', place.city || '', place.region || '', place.country || '', now);
      // Where they came from: referrer host only (never the full URL), plus ?r= and utm tags.
      const host = hostOf(body.ref), utm = clean(body.utm_source, 40);
      this.sql.exec('INSERT INTO sources (t, day, source, host, tag, medium, campaign, page, city, region, country) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        now, day, sourceOf(host, utm), host, slug(body.r, 40), slug(body.utm_medium, 40), slug(body.utm_campaign, 60), clean(body.path, 60).replace(/[?#].*$/, ''),
        place.city || '', place.region || '', place.country || '');
      this.sql.exec('DELETE FROM recent WHERE id <= (SELECT id FROM recent ORDER BY id DESC LIMIT 1 OFFSET ?)', RECENT);
      this.cache = null;
    }
    if (now - this.lastPrune > 3600000) {
      // Keep only today's and yesterday's dedupe keys.
      const yday = new Date(now - 86400000).toISOString().slice(0, 10);
      this.sql.exec('DELETE FROM seen WHERE day < ?', yday);
      this.sql.exec('DELETE FROM sources WHERE day < ?', new Date(now - SOURCE_DAYS * 86400000).toISOString().slice(0, 10));
      this.lastPrune = now;
    }
    const out = this.stats();
    out.counted = counted;
    out.you = { city: place.city || '', region: place.region || '', country: place.country || '', lat: place.lat, lon: place.lon };
    return json(out);
  }

  stats() {
    const now = Date.now();
    if (this.cache && now - this.cache.at < STATS_TTL) return Object.assign({}, this.cache.body, { now: this.sockets().length });
    const row = this.sql.exec("SELECT v FROM meta WHERE k = 'total'").toArray()[0];
    const agg = this.sql.exec("SELECT COUNT(*) AS c, COUNT(DISTINCT NULLIF(country, '')) AS k FROM cities").one();
    const cities = this.sql.exec('SELECT city, region, country, lat, lon, n FROM cities ORDER BY n DESC, last DESC LIMIT ?', TOP_CITIES).toArray();
    const recent = this.sql.exec('SELECT city, region, country, t FROM recent ORDER BY id DESC LIMIT ?', RECENT).toArray();
    const body = { total: row ? row.v : 0, countries: agg.k, cityCount: agg.c, cities, recent };
    this.cache = { at: now, body };
    return Object.assign({}, body, { now: this.sockets().length });
  }

  /* ---------- Guestbook ---------- */
  notes() {
    const rows = this.sql.exec("SELECT id, t, name, note, city, region, country, lat, lon FROM notes WHERE status = 'ok' ORDER BY id DESC LIMIT ?", NOTES_SHOWN).toArray();
    return { notes: rows };
  }

  async sign(place, raw, auto) {
    let b = {};
    try { b = JSON.parse(raw || '{}') || {}; } catch (e) {}
    const id = String(b.id || ''), note = cleanNote(b.note, NOTE_MAX), name = cleanNote(b.name, NAME_MAX);
    if (!/^[A-Za-z0-9_-]{8,64}$/.test(id)) return json({ error: 'bad id' }, 400);
    if (note.length < 2) return json({ error: 'Say a little more than that.' }, 400);
    if (LINKY.test(note) || LINKY.test(name)) return json({ error: 'No links, please — just a note.' }, 400);
    const now = Date.now(), day = new Date(now).toISOString().slice(0, 10), hour = Math.floor(now / 3600000);
    if (this.noteWindow.h !== hour) this.noteWindow = { h: hour, n: 0 };
    if (this.noteWindow.n >= NOTES_PER_HOUR) return json({ error: 'The guestbook is busy — try again in a bit.' }, 429);
    const pending = this.sql.exec("SELECT COUNT(*) AS c FROM notes WHERE status = 'pending'").one().c;
    if (pending >= PENDING_CAP) return json({ error: 'The guestbook is full for now — try again later.' }, 429);
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('note:' + day + ':' + id));
    const h = [...new Uint8Array(digest).slice(0, 12)].map((x) => x.toString(16).padStart(2, '0')).join('');
    if (this.sql.exec('SELECT 1 FROM notes WHERE h = ?', h).toArray().length) return json({ error: 'One note a day — come back tomorrow.' }, 429);
    this.noteWindow.n++;
    const status = auto ? 'ok' : 'pending';
    this.sql.exec('INSERT INTO notes (t, status, name, note, city, region, country, lat, lon, h) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      now, status, name, note, place.city || '', place.region || '', place.country || '', place.lat, place.lon, h);
    const row = this.sql.exec('SELECT last_insert_rowid() AS id').one();
    return json({ ok: true, status, note: { id: row.id, t: now, name, note, city: place.city || '', region: place.region || '', country: place.country || '', lat: place.lat, lon: place.lon } });
  }

  moderate(raw) {
    let b = {};
    try { b = JSON.parse(raw || '{}') || {}; } catch (e) {}
    const id = parseInt(b.id, 10);
    if (!id) return json({ error: 'bad id' }, 400);
    if (b.action === 'approve') this.sql.exec("UPDATE notes SET status = 'ok' WHERE id = ?", id);
    else if (b.action === 'hide') this.sql.exec("UPDATE notes SET status = 'pending' WHERE id = ?", id);
    else if (b.action === 'delete') this.sql.exec('DELETE FROM notes WHERE id = ?', id);
    else return json({ error: 'action must be approve, hide or delete' }, 400);
    return json({ ok: true });
  }

  /* ---------- Admin: who's visiting, and the guestbook queue ---------- */
  summary(days) {
    days = Math.max(1, Math.min(SOURCE_DAYS, days));
    const since = new Date(Date.now() - (days - 1) * 86400000).toISOString().slice(0, 10);
    const q = (sql, ...a) => this.sql.exec(sql, ...a).toArray();
    return {
      days,
      visits: q('SELECT COUNT(*) AS n FROM sources WHERE day >= ?', since)[0].n,
      sources: q('SELECT source, COUNT(*) AS n FROM sources WHERE day >= ? GROUP BY source ORDER BY n DESC LIMIT 30', since),
      tags: q("SELECT tag, COUNT(*) AS n, MAX(t) AS last, MAX(city) AS city FROM sources WHERE day >= ? AND tag != '' GROUP BY tag ORDER BY last DESC LIMIT 50", since),
      campaigns: q("SELECT campaign, medium, COUNT(*) AS n FROM sources WHERE day >= ? AND campaign != '' GROUP BY campaign, medium ORDER BY n DESC LIMIT 30", since),
      hosts: q("SELECT host, COUNT(*) AS n FROM sources WHERE day >= ? AND host != '' GROUP BY host ORDER BY n DESC LIMIT 30", since),
      daily: q('SELECT day, COUNT(*) AS n FROM sources WHERE day >= ? GROUP BY day ORDER BY day', since),
      recent: q('SELECT t, source, host, tag, campaign, page, city, region, country FROM sources ORDER BY id DESC LIMIT 60'),
      pending: q("SELECT id, t, name, note, city, region, country FROM notes WHERE status = 'pending' ORDER BY id DESC LIMIT 100"),
      approved: q("SELECT id, t, name, note, city, region, country FROM notes WHERE status = 'ok' ORDER BY id DESC LIMIT 100")
    };
  }

  /* ---------- Sockets ---------- */
  sockets(except) {
    return this.ctx.getWebSockets().filter((ws) => ws !== except && ws.readyState !== 2 && ws.readyState !== 3);
  }

  peers(except) {
    return this.sockets(except).slice(0, 50).map((ws) => {
      const a = ws.deserializeAttachment() || {};
      return { id: a.id, city: a.city, region: a.region, country: a.country, lat: a.lat, lon: a.lon, d: a.d || '' };
    });
  }

  send(ws, msg) { try { ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg)); } catch (e) {} }

  broadcast(msg, except) {
    const s = JSON.stringify(msg);
    this.sockets(except).forEach((ws) => this.send(ws, s));
  }

  // gone: a socket that is leaving (left out of the list); skip: a socket that gets its own welcome instead.
  presence(gone, skip) {
    const msg = { t: 'p', n: this.sockets(gone).length, peers: this.peers(gone) };
    this.broadcast(msg, gone || skip);
  }

  connect(place) {
    if (this.sockets().length >= MAX_SOCKETS) return new Response('full', { status: 503 });
    const pair = new WebSocketPair();
    const client = pair[0], server = pair[1];
    const id = [...crypto.getRandomValues(new Uint8Array(5))].map((b) => b.toString(16).padStart(2, '0')).join('');
    const me = { id, city: place.city || '', region: place.region || '', country: place.country || '', lat: place.lat == null ? null : place.lat, lon: place.lon == null ? null : place.lon };
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment(me);
    const peers = this.peers();
    this.send(server, { t: 'hi', id, you: { city: me.city, region: me.region, country: me.country, lat: me.lat, lon: me.lon }, n: peers.length, peers });
    this.presence(null, server);
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(ws, data) {
    if (typeof data !== 'string' || data.length > MAX_MSG) return;
    const a = ws.deserializeAttachment();
    if (!a) return;
    const sec = Math.floor(Date.now() / 1000), r = this.rate.get(a.id) || { s: 0, n: 0 };
    if (r.s !== sec) { r.s = sec; r.n = 0; }
    if (++r.n > MSG_PER_SEC) { this.rate.set(a.id, r); return; }
    this.rate.set(a.id, r);
    let m;
    try { m = JSON.parse(data); } catch (e) { return; }
    if (!m || typeof m !== 'object') return;
    if (m.t === 'c') {
      const x = +m.x, y = +m.y;
      if (!isFinite(x) || !isFinite(y)) return;
      const cx = Math.round(Math.max(0, Math.min(1, x)) * 1e4) / 1e4;
      const cy = Math.round(Math.max(0, Math.min(1, y)) * 1e4) / 1e4;
      this.broadcast({ t: 'c', id: a.id, x: cx, y: cy }, ws);
    } else if (m.t === 'h') {
      this.broadcast({ t: 'h', id: a.id }, ws); // cursor left the window
    } else if (m.t === 'd' && !a.d && DEVICES.includes(m.d)) {
      a.d = m.d; // device hint, once per socket, so "Here now" can say "on a phone"
      ws.serializeAttachment(a);
      this.presence();
    }
  }

  webSocketClose(ws) {
    const a = ws.deserializeAttachment();
    if (a) this.rate.delete(a.id);
    try { ws.close(1000, 'bye'); } catch (e) {}
    if (a) this.broadcast({ t: 'h', id: a.id }, ws);
    this.presence(ws);
  }

  webSocketError(ws) { this.webSocketClose(ws, 1011); }
}
