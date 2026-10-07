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

test('the Konami code works by swiping on a phone', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'touch only');
  await page.goto('/');
  await page.evaluate(() => {
    const at = (x, y) => new Touch({ identifier: 1, target: document.body, clientX: x, clientY: y });
    const fire = (type, x, y) => window.dispatchEvent(new TouchEvent(type, { touches: type === 'touchend' ? [] : [at(x, y)], changedTouches: [at(x, y)], bubbles: true }));
    const moves = { U: [0, -120], D: [0, 120], L: [-120, 0], R: [120, 0], T: [0, 0] };
    for (const m of 'UUDDLRLRTT') { fire('touchstart', 180, 400); fire('touchend', 180 + moves[m][0], 400 + moves[m][1]); }
  });
  await page.locator('.ach-foot').click();
  await expect(page.locator('.ach-grid li.on', { hasText: 'Cheat Code' })).toHaveCount(1);
});

test('whistling for the dog counts even when the 3D dog can\'t load', async ({ page }) => {
  await page.route('**/vendor/three/**', (r) => r.abort());
  await page.goto('/');
  await term(page, 'dog');
  await expect(page.locator('.toast')).toContainText('napping');
  await page.locator('.ach-foot').click();
  await expect(page.locator('.ach-grid li.on', { hasText: 'Who Let the Dog Out' })).toHaveCount(1);
});

const toBottom = (page) => expect.poll(() => page.evaluate(() => {
  document.documentElement.style.scrollBehavior = 'auto'; // the page grows as sections load, so keep going until it's really the end
  scrollTo(0, document.documentElement.scrollHeight);
  return innerHeight + scrollY >= document.documentElement.scrollHeight - 12;
}), { timeout: 15000 }).toBe(true);

test('scrolling past the bottom fills the credits reel and rolls them', async ({ page }) => {
  await page.goto('/');
  await toBottom(page);
  const cue = page.locator('.credits-cue');
  await expect(cue).toHaveClass(/show/);
  await expect(cue).toContainText('Keep scrolling for the credits');
  if (test.info().project.name === 'phone') { // phones swipe: drive real touch events
    const cdp = await page.context().newCDPSession(page);
    const touch = (type, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: 200, y }] });
    for (let i = 0; i < 4; i++) {
      await touch('touchStart', 600);
      for (let y = 560; y >= 200; y -= 40) await touch('touchMove', y);
      await touch('touchEnd');
    }
  } else {
    await page.mouse.move(600, 400);
    for (let i = 0; i < 8; i++) await page.mouse.wheel(0, 120);
  }
  await expect(page.locator('.credits')).toBeVisible();
});

test('the credits cue can just be tapped', async ({ page }) => {
  await page.goto('/');
  await toBottom(page);
  await page.locator('.credits-cue').click();
  await expect(page.locator('.credits')).toBeVisible();
});
