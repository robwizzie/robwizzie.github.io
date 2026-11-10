const { test, expect } = require('./mock');

// play/nre/ is an internal, unlisted demo like play/scheduler/: not linked anywhere, kept out of search engines.
test.describe('NRE tracker demo', () => {
  test('loads with the public-demo banner and the signed-in person’s tasks', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/play/nre/');
    await expect(page.getByText('Public demo')).toBeVisible();
    await expect(page.locator('.task-card').first()).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('stays unlisted', async ({ page, request }) => {
    await page.goto('/play/nre/');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    expect(await (await request.get('/robots.txt')).text()).not.toContain('/nre');
    expect(await (await request.get('/sitemap.xml')).text()).not.toContain('/nre');
  });

  test('workload flags overbooked people and the IMS summary exports to Excel', async ({ page }) => {
    await page.goto('/play/nre/#/workload');
    await expect(page.locator('.wl-cell.over').first()).toBeVisible();
    await page.goto('/play/nre/#/summary');
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Export to Excel/ }).click()]);
    expect(download.suggestedFilename()).toMatch(/\.xlsx$/);
  });
});
