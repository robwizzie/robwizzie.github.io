const { test, expect, term } = require('./mock');

test('pool break: the About cards come back exactly where they were', async ({ page }) => {
  await page.goto('/');
  const rects = () => page.locator('#about .life-card').evaluateAll((els) => els.map((e) => {
    const r = e.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top + scrollY), Math.round(r.width), Math.round(r.height), getComputedStyle(e).opacity];
  }));
  await page.locator('#about .life').scrollIntoViewIfNeeded();
  await page.evaluate(() => document.querySelectorAll('#about .reveal').forEach((e) => e.classList.add('in'))); // cards below the fold haven't faded in yet
  await page.waitForTimeout(1500); // let the reveal animation finish
  const before = await rects();
  const done = page.evaluate(() => new Promise((res) => document.addEventListener('rw:egg', (e) => { if (e.detail === 'pool') res(); })));
  await term(page, 'break');
  await expect(page.locator('#about .life canvas')).toBeAttached({ timeout: 10000 });
  await done;
  await expect(page.locator('#about .life canvas')).toHaveCount(0, { timeout: 10000 });
  await page.waitForTimeout(800);
  expect(await rects()).toEqual(before);
});

test('the Fetch dog comes out, steals the logo, and gives it back', async ({ page }) => {
  await page.goto('/');
  const logo = page.locator('.nav-brand img');
  await term(page, 'dog luna');
  await expect(page.locator('canvas.dog-canvas.gl')).toBeAttached({ timeout: 15000 });
  await expect(logo).toHaveCSS('visibility', 'hidden', { timeout: 10000 }); // he took it
  await page.keyboard.press('Escape');
  await expect(logo).toHaveCSS('visibility', 'visible', { timeout: 10000 });
});

test('end credits roll and close', async ({ page }) => {
  await page.goto('/');
  await term(page, 'credits');
  await expect(page.locator('.credits')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.credits')).toHaveCount(0);
});
