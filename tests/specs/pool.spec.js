const { test, expect, term } = require('./mock');
const P = require('../../play/pool/physics.js');
global.Pool8Physics = P;
const B = require('../../play/pool/brain.js');

function table(list) { return { balls: list.map(([n, x, y]) => ({ n, x, y, vx: 0, vy: 0, qx: 0, qy: 0, s: 0, on: true, pocket: -1 })) }; }

test.describe('8-ball physics and rules', () => {
  test.skip(({ isMobile }) => isMobile, 'pure Node, once is enough');

  test('draw comes back, follow goes through, a stun stops dead', () => {
    // where the cue ball is headed half a second after it hits the object ball
    const after = (ey, speed) => {
      const w = table([[0, 20, 19.5], [1, 32, 19.5]]), ev = P.newEvents(); P.strike(w, 0, speed || 120, 0, ey);
      while (ev.first == null) P.step(w, ev);
      for (let i = 0; i < 300; i++) P.step(w, ev);
      return P.cue(w).vx;
    };
    expect(after(-1)).toBeLessThan(-15);  // drawing back
    expect(after(0.6)).toBeGreaterThan(15); // following through
    expect(Math.abs(after(-0.42, 60))).toBeLessThan(4); // a touch of draw at this distance: stops dead
  });

  test('english kicks off the rail the way it should', () => {
    const kick = (ex) => { const w = table([[0, 30, 20]]); P.strike(w, -Math.PI / 2, 100, ex, 0); const ev = P.newEvents(); while (!ev.cueRails) P.step(w, ev); return P.cue(w).vx; };
    expect(kick(1)).toBeGreaterThan(10);
    expect(kick(-1)).toBeLessThan(-10);
    expect(Math.abs(kick(0))).toBeLessThan(0.01);
  });

  test('straight-in balls drop and shallow side-pocket shots don\'t', () => {
    const roll = (x, y, vx, vy) => { const w = table([[1, x, y]]); const b = w.balls[0]; b.vx = b.qx = vx; b.vy = b.qy = vy; P.simulate(w, 5); return b.on ? -1 : b.pocket; };
    expect(roll(10, 10, -60, -60)).toBe(0);         // into the top-left corner
    expect(roll(P.W / 2, 12, 0, -60)).toBe(1);      // straight into the top side pocket
    expect(roll(P.W / 2 + 15, 3, -80, -8)).toBe(-1); // too shallow for the side pocket
  });

  test('rules: groups, fouls, ball in hand and the 8', () => {
    const g = B.newGame(() => 0.5); g.breakShot = false; g.turn = 0;
    let res = B.judge(g, { first: 1, rail: true, potted: [{ n: 1, pocket: 0 }] }, B.targets(g, 0), null);
    expect(g.groups).toEqual(['solids', 'stripes']);
    expect(res.keep).toBe(true);
    res = B.judge(g, { first: 9, rail: true, potted: [] }, B.targets(g, 0), null);
    expect(res.foul).toBe('Wrong ball first');
    expect(g.turn).toBe(1); expect(g.inHand).toBe(true);
    res = B.judge(g, { first: 9, rail: false, potted: [] }, B.targets(g, 1), null);
    expect(res.foul).toBe('No rail after contact');
    // sinking the 8 before your group is cleared loses
    g.turn = 0; res = B.judge(g, { first: 2, rail: true, potted: [{ n: 8, pocket: 2 }] }, B.targets(g, 0), 2);
    expect(g.over).toBe(true); expect(g.winner).toBe(1);
  });

  test('APA break: 8 wins, 8 plus scratch loses, a scratch is ball in hand behind the line', () => {
    const fresh = () => { const g = B.newGame(() => 0.5); g.turn = 0; return g; };
    let g = fresh(); B.judge(g, { first: 1, rail: true, potted: [{ n: 8, pocket: 2 }] }, B.targets(g, 0), null);
    expect(g).toMatchObject({ over: true, winner: 0 });
    g = fresh(); B.judge(g, { first: 1, rail: true, potted: [{ n: 8, pocket: 2 }, { n: 0, pocket: 0 }] }, B.targets(g, 0), null);
    expect(g).toMatchObject({ over: true, winner: 1 });
    g = fresh(); const res = B.judge(g, { first: 1, rail: true, potted: [{ n: 0, pocket: 1 }] }, B.targets(g, 0), null);
    expect(res.foul).toBe('Scratch on the break');
    expect(g).toMatchObject({ turn: 1, inHand: true, kitchen: true });
    // ...and any later scratch is ball in hand anywhere
    B.judge(g, { first: 3, rail: true, potted: [{ n: 0, pocket: 1 }] }, B.targets(g, 1), null);
    expect(g).toMatchObject({ turn: 0, inHand: true, kitchen: false });
  });

  test('the CPU places behind the line after a break scratch', () => {
    const g = B.newGame(); g.turn = 1;
    B.judge(g, { first: 1, rail: true, potted: [{ n: 0, pocket: 1 }] }, B.targets(g, 1), null); // you scratch on the break
    g.turn = 1; // (the CPU's turn either way in this setup)
    const it = B.plan(g, 'hard'); let r; while (!(r = it.next()).done);
    expect(r.value.place).toBeTruthy();
    expect(r.value.place.x).toBeLessThanOrEqual(P.HEAD_X);
  });

  test('the CPU levels are in the right order', () => {
    let hardWins = 0;
    for (let i = 0; i < 2; i++) {
      const g = B.newGame(); g.turn = i % 2;
      for (let s = 0; s < 120 && !g.over; s++) {
        const it = B.plan(g, g.turn === 0 ? 'hard' : 'easy'); let r; while (!(r = it.next()).done);
        const sh = r.value, c = P.cue(g.world);
        if (sh.place) { c.x = sh.place.x; c.y = sh.place.y; }
        const pre = B.targets(g, g.turn);
        P.strike(g.world, sh.angle, sh.speed, sh.ex, sh.ey);
        B.judge(g, P.simulate(g.world, 30), pre, sh.called);
      }
      expect(g.over).toBe(true);
      if (g.winner === 0) hardWins++;
    }
    expect(hardWins).toBeGreaterThanOrEqual(1);
  });
});

test('play pool opens 8-ball, and a real shot plays out', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await term(page, 'play pool');
  await expect(page.locator('#game-modal')).toHaveClass(/open/);
  await expect(page.locator('#game-title')).toHaveText('8-BALL');
  const frame = page.frameLocator('#game-frame');
  await frame.locator('[data-level="easy"]').click();
  await frame.locator('#start').click();
  const f = page.frame({ url: /play\/pool/ });
  await f.waitForFunction(() => window.pool8 && pool8.state().mode === 'aim');
  await f.evaluate(() => { pool8.warp(8); pool8.start('easy'); });
  await f.waitForFunction(() => pool8.state().mode === 'aim' || pool8.state().turn === 1);
  // whoever breaks, the table moves and comes back to someone's turn
  await f.evaluate(() => { if (pool8.state().turn === 0) pool8.shoot(0, 1); });
  await f.waitForFunction(() => pool8.state().on < 16 || pool8.state().mode !== 'roll', null, { timeout: 20000 });
  await f.waitForFunction(() => ['aim', 'cpu', 'over'].indexOf(pool8.state().mode) > -1, null, { timeout: 20000 });
  expect(errors).toEqual([]);
  // Esc mid-game pauses into the menu instead of throwing the game away
  await f.evaluate(() => { pool8.start('easy'); if (pool8.state().turn !== 0) pool8.start('easy'); }); // breakers alternate: get yours
  expect(await f.evaluate(() => pool8.state())).toMatchObject({ mode: 'aim', turn: 0 });
  await frame.locator('#stage').press('Escape');
  await expect(frame.locator('#resume')).toBeVisible();
  await frame.locator('#resume').click();
  await expect(frame.locator('#menu')).toBeHidden();
  expect(await f.evaluate(() => pool8.state().mode)).toBe('aim');
});

test('beating the CPU unlocks Called Pocket', async ({ page }) => {
  await page.goto('/');
  await term(page, 'play pool');
  const frame = page.frameLocator('#game-frame');
  await frame.locator('#start').click();
  const f = page.frame({ url: /play\/pool/ });
  await f.waitForFunction(() => window.pool8 && pool8.state().mode === 'aim');
  // Set up a gimme: everything of yours is gone, the 8 sits in front of the top-right corner.
  await f.evaluate(() => {
    const g = pool8.game(), P = Pool8Physics;
    g.breakShot = false; g.kitchen = false; g.inHand = false; g.open = false; g.groups = ['solids', 'stripes']; g.turn = 0;
    g.world.balls.forEach((b) => { if (b.n !== 0 && b.n !== 8 && b.n < 8) { b.on = false; } });
    g.world.balls.forEach((b) => { if (b.n > 8) { b.x = 10 + (b.n - 9) * 3; b.y = P.H - 2; } });
    const e = P.find(g.world, 8), c = P.cue(g.world);
    e.x = P.W - 8; e.y = 8; c.x = P.W - 16; c.y = 16;
    pool8.callPocket(2);
    pool8.warp(6);
    pool8.shoot(-Math.PI / 4, 0.3, 0, -0.8); // with draw, so the cue ball doesn't follow it in
  });
  await expect(frame.locator('#over')).toBeVisible({ timeout: 15000 });
  await expect(frame.locator('#over-title'), await frame.locator('#over-why').textContent()).toContainText('YOU');
  await page.keyboard.press('Escape');
  await page.locator('.ach-foot').click();
  await expect(page.locator('.ach-grid li.on', { hasText: 'Called Pocket' })).toHaveCount(1);
});

test('breaking the rack offers a real game', async ({ page }) => {
  await page.goto('/');
  await page.locator('#about .life').scrollIntoViewIfNeeded();
  await term(page, 'break');
  const offer = page.locator('.pool-offer');
  await expect(offer).toBeVisible({ timeout: 15000 });
  await offer.click();
  await expect(page.locator('#game-modal')).toHaveClass(/open/);
  await expect(page.locator('#game-frame')).toHaveAttribute('src', 'play/pool/index.html');
});

test('controls: hold Space to charge, spin resets after the shot, closing the spin pad keeps your aim', async ({ page }) => {
  await page.goto('/');
  await term(page, 'play pool');
  const frame = page.frameLocator('#game-frame');
  await frame.locator('#start').click();
  const f = page.frame({ url: /play\/pool/ });
  await f.waitForFunction(() => window.pool8 && pool8.state().mode === 'aim');
  await f.evaluate(() => { pool8.start('easy'); if (pool8.state().turn !== 0) pool8.start('easy'); });
  // spin pad open, then a tap on the table only closes it
  await frame.locator('#spin').click();
  await expect(frame.locator('#pop')).toBeVisible();
  const before = await f.evaluate(() => pool8.aim());
  const box = await frame.locator('#table').boundingBox();
  await page.mouse.click(box.x + box.width * 0.6, box.y + box.height * 0.25);
  await expect(frame.locator('#pop')).toBeHidden();
  expect(await f.evaluate(() => pool8.aim())).toBe(before);
  // set some draw, then charge with Space: power climbs while held
  await f.evaluate(() => pool8.setSpin(0, -0.8));
  await f.evaluate(() => window.focus());
  await page.keyboard.down(' ');
  await page.waitForTimeout(450);
  const mid = await f.evaluate(() => pool8.power());
  await page.waitForTimeout(450);
  const later = await f.evaluate(() => pool8.power());
  expect(mid).toBeGreaterThan(0.1);
  expect(later).toBeGreaterThan(mid);
  await page.keyboard.up(' ');
  await f.waitForFunction(() => pool8.state().mode !== 'aim');
  expect(await f.evaluate(() => pool8.spin())).toEqual({ x: 0, y: 0 });
});

test('the menu shows your record and everyone\'s, and a finished game is reported once', async ({ page, calls }) => {
  await page.goto('/');
  await term(page, 'play pool');
  const frame = page.frameLocator('#game-frame');
  await expect(frame.locator('[data-all="easy"]')).toHaveText('All 120–340');
  await expect(frame.locator('[data-rec="easy"]')).toHaveText('You 0–0');
  await frame.locator('[data-level="hard"]').click();
  await frame.locator('#start').click();
  const f = page.frame({ url: /play\/pool/ });
  await f.waitForFunction(() => window.pool8 && pool8.state().mode === 'aim');
  await f.evaluate(() => { // the same gimme as above: 8 in front of the top-right corner
    const g = pool8.game(), P = Pool8Physics;
    g.breakShot = false; g.kitchen = false; g.inHand = false; g.open = false; g.groups = ['solids', 'stripes']; g.turn = 0;
    g.world.balls.forEach((b) => { if (b.n && b.n < 8) b.on = false; if (b.n > 8) { b.x = 10 + (b.n - 9) * 3; b.y = P.H - 2; } });
    const e = P.find(g.world, 8), c = P.cue(g.world); e.x = P.W - 8; e.y = 8; c.x = P.W - 16; c.y = 16;
    pool8.callPocket(2); pool8.warp(6); pool8.shoot(-Math.PI / 4, 0.3, 0, -0.8);
  });
  await expect(frame.locator('#over')).toBeVisible({ timeout: 15000 });
  await expect(frame.locator('#over-all')).toHaveText('Everyone vs hard: 4 wins, 99 losses');
  expect(calls.pool).toHaveLength(1);
  expect(calls.pool[0]).toMatchObject({ level: 'hard', won: true });
});
