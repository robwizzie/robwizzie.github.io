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

function allowed(origin) { return !!origin && (ORIGINS.includes(origin) || DEV_ORIGIN.test(origin)); }

function cors(origin) {
  const h = { 'Vary': 'Origin' };
  if (allowed(origin)) {
    h['Access-Control-Allow-Origin'] = origin;
    h['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
    h['Access-Control-Allow-Headers'] = 'Content-Type';
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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const route = url.pathname.replace(/\/+$/, '') || '/';

    if (request.method === 'OPTIONS') return new Response(null, { status: allowed(origin) ? 204 : 403, headers: cors(origin) });
    if (route === '/') return json({ ok: true, service: 'rw-live' }, 200, origin);
    if (!['/live', '/visit', '/stats'].includes(route)) return json({ error: 'not found' }, 404, origin);

    if (route === '/live') {
      if (request.headers.get('Upgrade') !== 'websocket') return json({ error: 'expected websocket' }, 426, origin);
      if (!allowed(origin)) return new Response('forbidden origin', { status: 403 });
    }
    if (route === '/visit') {
      if (request.method !== 'POST') return json({ error: 'POST only' }, 405, origin);
      if (!allowed(origin)) return json({ error: 'forbidden origin' }, 403, origin);
    }
    if (route === '/stats' && request.method !== 'GET') return json({ error: 'GET only' }, 405, origin);

    // Hand the DO a fresh request: the coarse place rides in a header the client can't set.
    const headers = new Headers();
    headers.set('X-RW-Place', JSON.stringify(placeOf(request, env, url)));
    headers.set('X-RW-Origin', origin);
    if (route === '/live') headers.set('Upgrade', 'websocket');
    const body = route === '/visit' ? (await request.text()).slice(0, 256) : undefined;
    const stub = env.LIVE.get(env.LIVE.idFromName('global'));
    const res = await stub.fetch(new Request('https://do' + route, { method: request.method, headers, body }));
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
    `);
    // Answer keepalive pings without waking the object.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  async fetch(request) {
    const url = new URL(request.url);
    let place = {};
    try { place = JSON.parse(request.headers.get('X-RW-Place') || '{}'); } catch (e) {}
    if (url.pathname === '/live') return this.connect(place);
    if (url.pathname === '/visit') return this.visit(place, await request.text());
    return json(this.stats());
  }

  /* ---------- Visits ---------- */
  async visit(place, raw) {
    let id = '';
    try { id = String(JSON.parse(raw || '{}').id || ''); } catch (e) {}
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
      this.sql.exec('DELETE FROM recent WHERE id <= (SELECT id FROM recent ORDER BY id DESC LIMIT 1 OFFSET ?)', RECENT);
      this.cache = null;
    }
    if (now - this.lastPrune > 3600000) {
      // Keep only today's and yesterday's dedupe keys.
      const yday = new Date(now - 86400000).toISOString().slice(0, 10);
      this.sql.exec('DELETE FROM seen WHERE day < ?', yday);
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

  /* ---------- Sockets ---------- */
  sockets(except) {
    return this.ctx.getWebSockets().filter((ws) => ws !== except && ws.readyState !== 2 && ws.readyState !== 3);
  }

  peers(except) {
    return this.sockets(except).slice(0, 50).map((ws) => {
      const a = ws.deserializeAttachment() || {};
      return { id: a.id, city: a.city, region: a.region, country: a.country, lat: a.lat, lon: a.lon };
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
