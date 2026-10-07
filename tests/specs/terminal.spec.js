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
  // Themes switch inside a view transition, so the new tokens land a frame or two later.
  await term(page, 'theme eagles');
  await expect.poll(blue).not.toBe(before);
  await expect(page.locator('.theme-bar.show')).toBeVisible();
  await page.locator('.tb-off').click(); // the theme bar turns it off without the terminal
  await expect.poll(blue).toBe(before);
  await expect(page.locator('.theme-bar.show')).toHaveCount(0);
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

test('locked achievements show their name, a hint and a nudge', async ({ page }) => {
  await page.locator('.ach-foot').click();
  const vim = page.locator('.ach-grid li', { hasText: 'Escaped Vim' });
  await expect(vim).toContainText('Type vim in the terminal');
  await vim.locator('summary').click();
  await expect(vim.locator('.ach-nudge')).toContainText(':wq');
});

test('hint walks you through the next one, and rob.hire() works from the terminal', async ({ page }) => {
  await term(page, 'hint');
  expect(await termOut(page)).toContain('💡');
  await term(page, 'rob.hire()');
  await expect(page.locator('.ach-foot')).not.toContainText(' 0/');
  await expect(page.locator('#hire-panel')).toBeVisible();
});

test('LeBron mode takes over the hero, and any other theme gives it back', async ({ page }) => {
  const hero = () => page.evaluate(() => ({
    name: document.querySelector('.hero-title').textContent.replace(/\s+/g, ' ').trim(),
    pill: document.querySelector('.status-pill').textContent.trim(),
    copy: document.querySelector('.hero-copy').innerHTML,
    proof: document.querySelector('.hero-proof').innerHTML,
    badge: document.querySelector('.fb-1').innerHTML,
    img: document.querySelector('.portrait-hex img').getAttribute('src'),
    fitted: document.querySelector('.portrait-hex img').classList.contains('swapped-in')
  }));
  const me = await hero();
  await term(page, 'theme lebron');
  await expect.poll(async () => (await hero()).img).toContain('lebron');
  const lb = await hero();
  expect(lb.name).toBe('LeBron James');
  expect(lb.pill).toBe('Still the King');
  expect(lb.copy).toContain('Akron');
  expect(lb.badge).toContain('NBA champion');
  expect(lb.fitted).toBe(true);
  await page.evaluate(() => RW.setTheme('eagles'));
  await expect.poll(hero).toEqual(me);
});
