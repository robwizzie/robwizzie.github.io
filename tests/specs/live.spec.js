const { test, expect, term, termOut } = require('./mock');

test('visit records where it came from, then tidies the address bar', async ({ page, calls }) => {
  await page.goto('/?r=Acme&utm_source=linkedin');
  await expect.poll(() => calls.visit.length).toBe(1);
  expect(calls.visit[0]).toMatchObject({ r: 'Acme', utm_source: 'linkedin' });
  expect(page.url()).not.toContain('r=Acme');
});

test('visitor map, live cursor and guestbook', async ({ page, calls }) => {
  await page.goto('/');
  await expect(page.locator('#visitors')).toBeVisible();
  await expect(page.locator('#lv-title')).toContainText('Cherry Hill');
  await page.locator('#visitors').scrollIntoViewIfNeeded();
  await expect(page.locator('#lv-total')).toHaveText('1,234');
  await expect(page.locator('#lv-gb-list')).toContainText('The pool break is unreal.');
  await page.fill('#lv-gb-note', 'Hello from the test suite');
  await page.click('#lv-gb-form button');
  await expect(page.locator('#lv-gb-msg')).toContainText('once Rob approves it');
  await expect(page.locator('#lv-gb-list li.mine')).toContainText('Hello from the test suite');
  expect(calls.guestbook[0].note).toBe('Hello from the test suite');
  await term(page, 'who');
  expect(await termOut(page)).toContain('Austin');
});

test('last film on the movie card, and the movies command', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.life-card .lb-last')).toContainText('Weapons');
  await term(page, 'movies');
  expect(await termOut(page)).toContain('Weapons (2025)');
});

test('"Not Alone" unlocks from just sharing the site, so phones can earn it', async ({ page }) => {
  await page.goto('/');
  await page.locator('.ach-foot').click();
  await expect(page.locator('.ach-grid li.on', { hasText: 'Not Alone' })).toHaveCount(1);
});

test('live achievements only count when the live server is reachable', async ({ page }) => {
  await page.route('https://rw-live.robertwiscount.workers.dev/**', (r) => r.abort()); // later routes win
  await page.routeWebSocket(/rw-live/, (ws) => ws.close());
  await page.goto('/');
  await page.waitForTimeout(2000);
  await expect(page.locator('.ach-foot')).toContainText('/15');
  await page.locator('.ach-foot').click();
  await expect(page.locator('.ach-grid li', { hasText: 'Signed the Guestbook' })).toHaveCount(0);
});

/* ---------- Presence: who's here, join notes, cursors at scale ---------- */
const LIVE = 'wss://rw-live.robertwiscount.workers.dev/live';
const you = { city: 'Cherry Hill', region: 'NJ', country: 'US', lat: 39.9, lon: -75 };
const CITY = [['Austin', 'TX', 'US', 30.3, -97.7], ['London', 'ENG', 'GB', 51.5, -0.1], ['Toronto', 'ON', 'CA', 43.7, -79.4], ['Berlin', 'BE', 'DE', 52.5, 13.4]];
function peer(i, d) { const c = CITY[i % CITY.length]; return { id: 'p' + i, city: c[0], region: c[1], country: c[2], lat: c[3], lon: c[4], d: d || '' }; }
function peers(n) { return Array.from({ length: n }, (_, i) => peer(i, i % 2 ? 'phone' : 'desktop')); }
// A live server of our own (later routes win over the one in mock.js).
async function liveServer(page, script) {
  const sent = [];
  await page.routeWebSocket(LIVE, (ws) => {
    const say = (m) => ws.send(JSON.stringify(m));
    ws.onMessage((m) => sent.push(m));
    script(say);
  });
  return sent;
}

test('"Not Alone" unlocks from presence alone, and says who just joined', async ({ page }) => {
  const sent = await liveServer(page, (say) => {
    say({ t: 'hi', id: 'me', you, n: 1, peers: [] });
    setTimeout(() => say({ t: 'p', n: 2, peers: [peer(0, 'phone')] }), 2500);
  });
  await page.goto('/');
  const note = page.locator('.lv-hello');
  await expect(note).toContainText('Someone in Austin, TX just joined you on their phone');
  await expect(note).toContainText('not alone');
  expect(sent.map((m) => JSON.parse(m)).some((m) => m.t === 'd' && ['phone', 'desktop', 'tablet'].includes(m.d))).toBe(true);
  await page.locator('.ach-foot').click();
  await expect(page.locator('.ach-grid li.on', { hasText: 'Not Alone' })).toHaveCount(1);
});

test('arriving while others are here says so once; bursts of joins become one note', async ({ page }) => {
  await liveServer(page, (say) => {
    say({ t: 'hi', id: 'me', you, n: 3, peers: peers(2) });
    setTimeout(() => say({ t: 'p', n: 6, peers: peers(5) }), 2600);
  });
  await page.goto('/');
  const note = page.locator('.lv-hello p');
  await expect(note).toContainText('2 other people are here right now');
  // the burst lands inside the 20s quiet window, so it waits rather than replacing the arrival note
  await page.waitForTimeout(3000);
  await expect(note).toContainText('2 other people are here right now');
  await expect(note).toContainText('3 people just joined you', { timeout: 25000 });
  await expect(note).toContainText(/from .+ and /);
});

test('"Here now" panel: who, where, on what, and closes on Escape', async ({ page }) => {
  await liveServer(page, (say) => say({ t: 'hi', id: 'me', you, n: 3, peers: [peer(0, 'phone'), peer(1, 'desktop')] }));
  await page.goto('/');
  const chip = page.locator('#visitors .lv-live-btn');
  await chip.scrollIntoViewIfNeeded();
  await expect(chip).toContainText('3 people here now');
  await chip.click();
  const panel = page.getByRole('dialog', { name: 'Here now' });
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('Cursors are other visitors\' mice');
  await expect(panel.locator('li', { hasText: 'Austin, TX' })).toContainText('on a phone');
  await expect(panel.locator('li', { hasText: 'London, GB' })).toContainText('on a computer');
  await expect(chip).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(chip).toBeFocused();
  await expect(page.locator('.lv-pill')).toHaveAttribute('aria-haspopup', 'dialog');
});

test('a crowd: at most 6 cursors, calm mode, and "+N more here"', async ({ page }) => {
  await liveServer(page, (say) => {
    say({ t: 'hi', id: 'me', you, n: 13, peers: peers(12).map((p, i) => ({ ...p, city: 'Town ' + i })) });
    let k = 0;
    const iv = setInterval(() => {
      for (let i = 0; i < 10; i++) say({ t: 'c', id: 'p' + i, x: 0.1 + i * 0.08, y: 0.02 + (k % 5) * 0.001 });
      if (++k > 40) clearInterval(iv);
    }, 100);
  });
  await page.goto('/');
  await expect(page.locator('.lv-layer.calm')).toHaveCount(1);
  await page.waitForTimeout(1500);
  expect(await page.locator('.lv-cur').count()).toBeLessThanOrEqual(6);
  const chip = page.locator('#visitors .lv-live-btn');
  await chip.scrollIntoViewIfNeeded();
  await chip.click();
  await expect(page.locator('#lv-here')).toContainText('+7 more here');
  await expect(page.locator('#lv-here')).toContainText(/Showing the 6 most active · \+\d more moving/);
});

test('turning live cursors off sticks across visits', async ({ page }) => {
  await liveServer(page, (say) => {
    say({ t: 'hi', id: 'me', you, n: 2, peers: [peer(0, 'desktop')] });
    const iv = setInterval(() => say({ t: 'c', id: 'p0', x: 0.5, y: 0.02 }), 200);
    setTimeout(() => clearInterval(iv), 8000);
  });
  await page.goto('/');
  await expect(page.locator('.lv-cur')).toHaveCount(1);
  const chip = page.locator('#visitors .lv-live-btn');
  await chip.scrollIntoViewIfNeeded();
  await chip.click();
  const sw = page.getByRole('switch', { name: 'Live cursors' });
  await expect(sw).toHaveAttribute('aria-checked', 'true');
  await sw.click();
  await expect(sw).toHaveAttribute('aria-checked', 'false');
  expect(await page.evaluate(() => localStorage.getItem('rw-live-cursors'))).toBe('false');
  await page.reload();
  await page.waitForTimeout(2500);
  await expect(page.locator('.lv-cur')).toHaveCount(0);
  await page.locator('#visitors .lv-live-btn').scrollIntoViewIfNeeded();
  await page.locator('#visitors .lv-live-btn').click();
  await expect(page.getByRole('switch', { name: 'Live cursors' })).toHaveAttribute('aria-checked', 'false');
});

test('the visitor map follows the terminal theme', async ({ page }) => {
  await page.goto('/');
  await page.locator('#visitors').scrollIntoViewIfNeeded();
  await expect(page.locator('#lv-map.ready')).toHaveCount(1);
  // lit squares that are teal (green over red and blue) only exist once the eagles theme is on
  const teal = () => page.evaluate(() => {
    const c = document.getElementById('lv-canvas'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200 && d[i + 1] > d[i + 2] + 4 && d[i + 1] > d[i] + 60) n++;
    return n;
  });
  expect(await teal()).toBe(0);
  await term(page, 'theme eagles');
  await expect.poll(teal).toBeGreaterThan(0);
});
