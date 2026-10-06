const { test, expect, term, termOut } = require('./mock');

test.beforeEach(async ({ page }) => { await page.goto('/'); });

test('help, and a friendly unknown command', async ({ page }) => {
  await term(page, 'help');
  await term(page, 'definitely-not-a-command');
  const out = await termOut(page);
  expect(out).toContain('Available commands');
  expect(out).toContain('command not found');
});

test('commands take arguments (cowsay)', async ({ page }) => {
  await term(page, 'cowsay go birds');
  expect(await termOut(page)).toContain('< go birds >');
});

test('vim traps you until Esc, then :wq', async ({ page }) => {
  await term(page, 'vim');
  await term(page, ':q');
  expect(await termOut(page)).toContain('-- INSERT --');
  await term(page, 'esc');
  await term(page, ':wq');
  expect(await termOut(page)).toContain('You escaped vim');
  await term(page, 'help'); // the prompt is back to normal
  expect(await termOut(page)).toContain('Available commands');
});

test('themes swap the design tokens and come back', async ({ page }) => {
  const blue = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--blue').trim());
  const before = await blue();
  await term(page, 'theme eagles');
  expect(await blue()).not.toBe(before);
  await term(page, 'theme default');
  expect(await blue()).toBe(before);
});

test('achievements unlock and are counted in the trophy case', async ({ page }) => {
  await term(page, 'theme matrix');
  await term(page, 'colophon');
  await expect(page.locator('.ach-foot')).not.toContainText(' 0/');
  await page.locator('.ach-foot').click();
  await expect(page.locator('.ach-panel')).toBeVisible();
  await expect(page.locator('.ach-grid li.on', { hasText: 'Repainted' })).toHaveCount(1);
  await expect(page.locator('.ach-grid li.on', { hasText: 'Read the Manual' })).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.locator('.ach-panel')).toBeHidden();
});

test('rm -rf / puts everything back', async ({ page }) => {
  await term(page, 'rm -rf /');
  await expect.poll(() => termOut(page), { timeout: 15000 }).toContain('Restored from backup');
  expect(await page.evaluate(() => document.getAnimations().filter((a) => a.constructor.name === 'Animation' && a.playState === 'running').length)).toBe(0);
});
