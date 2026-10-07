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
