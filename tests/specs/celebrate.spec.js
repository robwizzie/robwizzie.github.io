const fs = require('fs'), path = require('path');
const { test, expect, term, termOut } = require('./mock');

// The styles live in css/celebrate.css until they're folded into css/site.css.
const extra = path.join(__dirname, '../../css/celebrate.css');
async function styled(page) {
  const merged = await page.evaluate(() => [].some.call(document.styleSheets, (s) => { try { return [].some.call(s.cssRules, (r) => r.selectorText === '.cele'); } catch (e) { return false; } }));
  if (!merged && fs.existsSync(extra)) await page.addStyleTag({ content: fs.readFileSync(extra, 'utf8') });
}

// Every achievement found (the live ones too), spread over a couple of days.
async function finishAll(page, seen) {
  await page.goto('/');
  await page.evaluate((seen) => {
    const ids = window.RW.achievements.list().map((a) => a.id).concat(['live', 'guestbook']), got = {}, now = Date.now();
    ids.forEach((id, i) => { got[id] = now - 2 * 864e5 + i * 6e4; });
    localStorage.setItem('rw-eggs', JSON.stringify(got));
    if (seen) localStorage.setItem('rw-celebrated', JSON.stringify({ t: now, n: 99 }));
  }, seen);
  await page.reload();
  await styled(page);
  await page.waitForFunction(() => window.RW.achievements.list().some((a) => a.id === 'live')); // the live ones have joined
}

test('celebrate: the trophy, the real count, every badge and the three buttons', async ({ page }) => {
  await finishAll(page, true);
  const n = await page.evaluate(() => { window.RW.celebrate(); return window.RW.achievements.list().length; });
  const dlg = page.getByRole('dialog', { name: /every\. single\. one\./i });
  await expect(dlg).toBeVisible();
  await expect(dlg.locator('.cele-sub')).toContainText(n + ' of ' + n + ' secrets found');
  await expect(dlg.locator('.cele-sub')).toContainText('in 2 days');
  await expect(dlg.locator('.cele-badges li')).toHaveCount(n);
  await expect(dlg.locator('.cele-badges li.off')).toHaveCount(0);
  await expect(dlg.getByRole('button', { name: /download your trophy wallpaper/i })).toBeVisible();
  await expect(dlg.getByRole('button', { name: /share/i })).toBeVisible();
  await expect(dlg.getByRole('button', { name: /back to the site/i })).toBeVisible();
  await expect(page.locator('body')).toHaveClass(/modal-open/);
  expect(await page.evaluate(() => !!document.activeElement.closest('.cele'))).toBe(true);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('rw-celebrated')).n)).toBe(n);
});

test('celebrate: Esc closes it and cleans up after itself', async ({ page }) => {
  await finishAll(page, true);
  await page.locator('.ach-foot').focus();
  await page.evaluate(() => window.RW.celebrate());
  await expect(page.locator('.cele')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.cele')).toHaveCount(0);
  await expect(page.locator('body')).not.toHaveClass(/modal-open|celebrating/);
  expect(await page.evaluate(() => document.activeElement.classList.contains('ach-foot'))).toBe(true);
  // and it can play again
  await page.evaluate(() => window.RW.celebrate());
  await expect(page.locator('.cele')).toHaveCount(1);
  await page.getByRole('button', { name: /back to the site/i }).click();
  await expect(page.locator('.cele')).toHaveCount(0);
});

test('celebrate: Share copies a line when the share sheet is not there', async ({ page }) => {
  await finishAll(page, true);
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    window.RW.copy = (t) => { window.__copied = t; return Promise.resolve(); };
    window.RW.celebrate();
  });
  await page.locator('.cele-share').click();
  const n = await page.evaluate(() => window.RW.achievements.list().length);
  expect(await page.evaluate(() => window.__copied)).toBe('I found all ' + n + ' secrets on robwiscount.org 🏆 https://robwiscount.org');
  await expect(page.locator('.toast')).toContainText('Copied');
});

test('celebrate: plays once on its own when everything is found, then not again', async ({ page }) => {
  await finishAll(page, false);
  await expect(page.locator('.cele')).toBeVisible({ timeout: 15000 });
  await page.keyboard.press('Escape');
  await page.reload();
  await page.waitForTimeout(5000);
  await expect(page.locator('.cele')).toHaveCount(0);
});

test('celebrate: reduced motion gets the calm version, no fireworks', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await finishAll(page, true);
  await page.evaluate(() => window.RW.celebrate());
  await expect(page.locator('.cele.calm')).toBeVisible();
  await expect(page.locator('.cele-fx')).toHaveCount(0);
});

test('the celebrate command waits until everything is found', async ({ page }) => {
  await page.goto('/');
  await term(page, 'celebrate');
  const out = await termOut(page);
  expect(out).toMatch(/Not yet — \d+ secrets? left to find/);
  expect(out).toContain('hint');
  await expect(page.locator('.cele')).toHaveCount(0);
});

test('the celebrate command replays it once you have them all', async ({ page }) => {
  await finishAll(page, true);
  await term(page, 'celebrate');
  await expect(page.locator('.cele')).toBeVisible();
});
