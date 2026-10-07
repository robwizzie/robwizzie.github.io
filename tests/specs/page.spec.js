const { test, expect } = require('./mock');

test('home page loads cleanly with every section', async ({ page }) => {
  await page.goto('/');
  for (const id of ['experience', 'mile-a-day', 'work', 'fetch', 'lebronify', 'skills', 'commits', 'visitors', 'about', 'terminal', 'contact']) {
    await expect(page.locator('#' + id), id).toBeAttached();
  }
  await expect(page.locator('h1')).toContainText('Rob');
});

test('no sideways scrolling', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
});

test('GitHub squares draw a year of contributions', async ({ page }) => {
  await page.goto('/');
  await page.locator('#commits').scrollIntoViewIfNeeded();
  await expect(page.locator('#gh-grid .gh-c[data-i]')).toHaveCount(371);
  await expect(page.locator('#gh-total')).not.toHaveText('—');
});

test('streak card says when today\'s mile is done', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#ls-today')).toContainText('Today\'s mile is done');
});

test('streak card says when today\'s mile is still to come', async ({ page }) => {
  const { mockWorld } = require('./mock');
  await mockWorld(page, { ranToday: false }); // later routes win
  await page.goto('/');
  await expect(page.locator('#ls-today')).toContainText('isn\'t logged yet');
});

test('colophon and admin pages load', async ({ page }) => {
  await page.goto('/how-it-works.html');
  await expect(page.locator('h1')).toContainText('How this site');
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  await page.goto('/admin.html');
  await expect(page.locator('#adm-gate')).toBeVisible();
  await expect(page.locator('#adm-app')).toBeHidden();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
});

test('missing pages get the 404 page, a dog, and a good guess', async ({ page }) => {
  const res = await page.goto('/old/stuff/resume-2024');
  expect(res.status()).toBe(404);
  await expect(page.locator('h1')).toContainText('ran off with this page');
  await expect(page.locator('#lost-path')).toHaveText('/old/stuff/resume-2024');
  await expect(page.locator('#lost-guess-link')).toHaveAttribute('href', /Resume/);
  await expect(page.locator('#lost-stage canvas, #lost-stage.flat')).toHaveCount(1, { timeout: 10000 });
  await page.click('#lost-drop'); // the dog lets go
  await page.click('#lost-home');
  await page.waitForURL('http://localhost:4173/', { timeout: 5000 });
});

test('the mile pill logs your time at the bottom, then packs itself away', async ({ page }) => {
  await page.goto('/');
  const chip = page.locator('.mile-chip');
  for (let i = 1; i <= 10; i++) {
    await page.evaluate(i => scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * i / 10), i);
    await page.waitForTimeout(120);
  }
  await expect(chip).toHaveClass(/done/);
  await expect(chip).toContainText('1 mile');
  await expect(chip).toHaveClass(/packed/, { timeout: 9000 });
  await page.evaluate(() => scrollTo(0, 3000)); // scrolling again doesn't bring it back
  await expect(chip).not.toHaveClass(/show/);
});
