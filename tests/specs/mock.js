// The outside world, mocked: every request that isn't to the local server is answered here or blocked,
// so the tests are fast, deterministic and never depend on ESPN, GitHub or Letterboxd being up.
const fs = require('fs');
const { test: base, expect } = require('@playwright/test');

const WORKER = 'https://rw-live.robertwiscount.workers.dev';
const world = fs.readFileSync(require.resolve('world-atlas/land-110m.json'));

function ymd(d) { return d.toISOString().slice(0, 10); }
function contributions() {
  const out = [], today = new Date();
  for (let i = 370; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 864e5), c = (i * 7) % 11 === 0 ? 0 : (i * 13) % 17;
    out.push({ date: ymd(d), count: c, level: c === 0 ? 0 : c < 4 ? 1 : c < 8 ? 2 : c < 12 ? 3 : 4 });
  }
  return { total: { lastYear: 0 }, contributions: out };
}
// Rob's streak as the calendar counts it, in Eastern time (same rule as the site).
function calendarStreak() {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: 'numeric', day: 'numeric' })
    .formatToParts(new Date()).reduce((o, x) => (o[x.type] = +x.value, o), {});
  return Math.round((Date.UTC(p.year, p.month - 1, p.day) - Date.UTC(2025, 4, 13)) / 864e5) + 1;
}
const stats = {
  total: 1234, countries: 12, cityCount: 40, now: 0,
  cities: [
    { city: 'Philadelphia', region: 'PA', country: 'US', lat: 40, lon: -75.2, n: 400 },
    { city: 'Austin', region: 'TX', country: 'US', lat: 30.3, lon: -97.7, n: 40 },
    { city: 'London', region: 'ENG', country: 'GB', lat: 51.5, lon: -0.1, n: 25 }
  ],
  recent: [{ city: 'Austin', region: 'TX', country: 'US', t: Date.now() - 60000 }]
};
const you = { city: 'Cherry Hill', region: 'NJ', country: 'US', lat: 39.9, lon: -75 };

async function mockWorld(page, opts = {}) {
  const calls = { visit: [], guestbook: [] };
  await page.route(/^https?:\/\/(?!localhost)/, async (route) => {
    const req = route.request(), url = req.url(), cors = { 'access-control-allow-origin': '*' };
    if (url.includes('github-contributions-api')) return route.fulfill({ json: contributions(), headers: cors });
    if (url.includes('site.api.espn.com')) return route.fulfill({ json: { events: [] }, headers: cors });
    if (url.includes('mad.mindgoblin.tech/public/users/rob')) return route.fulfill({ json: { username: 'rob', current_streak: opts.ranToday === false ? calendarStreak() - 1 : calendarStreak() }, headers: cors });
    if (url.includes('mad.mindgoblin.tech/public/stats')) return route.fulfill({ json: {}, headers: cors });
    if (url.includes('world-atlas')) return route.fulfill({ body: world, contentType: 'application/json', headers: cors });
    if (url.startsWith(WORKER)) {
      const p = new URL(url).pathname;
      if (p === '/visit') { calls.visit.push(JSON.parse(req.postData() || '{}')); return route.fulfill({ json: { ...stats, you, counted: true }, headers: cors }); }
      if (p === '/stats') return route.fulfill({ json: stats, headers: cors });
      if (p === '/letterboxd') return route.fulfill({ json: { user: 'robwizzie', films: [{ title: 'Weapons', year: 2025, rating: 4.5, watched: ymd(new Date()), url: 'https://letterboxd.com/robwizzie/', poster: '' }] }, headers: cors });
      if (p === '/guestbook' && req.method() === 'POST') {
        const b = JSON.parse(req.postData() || '{}'); calls.guestbook.push(b);
        return route.fulfill({ json: { ok: true, status: 'pending', note: { id: 99, t: Date.now(), name: b.name, note: b.note, ...you } }, headers: cors });
      }
      if (p === '/guestbook') return route.fulfill({ json: { notes: [{ id: 1, t: Date.now() - 3600e3, name: 'Priya', note: 'The pool break is unreal.', city: 'London', region: 'ENG', country: 'GB', lat: 51.5, lon: -0.1 }] }, headers: cors });
      return route.fulfill({ status: 404, json: {}, headers: cors });
    }
    return route.abort();
  });
  // A fake live server: says hi, then another visitor in Austin moves their cursor.
  await page.routeWebSocket(WORKER.replace('https', 'wss') + '/live', (ws) => {
    ws.send(JSON.stringify({ t: 'hi', id: 'me', you, n: 1, peers: [{ id: 'p1', city: 'Austin', region: 'TX', country: 'US', lat: 30.3, lon: -97.7 }] }));
    ws.send(JSON.stringify({ t: 'p', n: 2, peers: [{ id: 'p1', city: 'Austin', region: 'TX', country: 'US', lat: 30.3, lon: -97.7 }] }));
    setTimeout(() => ws.send(JSON.stringify({ t: 'c', id: 'p1', x: 0.5, y: 0.02 })), 300);
    ws.onMessage(() => {});
  });
  return calls;
}

const test = base.extend({
  calls: [async ({ page }, use) => { await use(await mockWorld(page)); }, { auto: true }],
  errors: [async ({ page }, use) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await use(errors);
    expect(errors, 'no uncaught script errors').toEqual([]);
  }, { auto: true }]
});

// Type a command into the site's terminal.
async function term(page, cmd) {
  await page.evaluate((c) => window.RW.run(c), cmd);
}
async function termOut(page) { return page.locator('#term-out').innerText(); }

module.exports = { test, expect, mockWorld, term, termOut, calendarStreak };
