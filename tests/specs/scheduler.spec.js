const { test, expect } = require('./mock');

// play/scheduler/ is an internal, unlisted demo: not linked anywhere and kept out of search engines.
test.describe('capacity scheduler demo', () => {
  test('loads with the public-demo banner and a schedule', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/play/scheduler/');
    await expect(page.getByText('Public demo')).toBeVisible();
    await expect(page.locator('.bar').first()).toBeVisible();
    expect(errors).toEqual([]);
  });

  // Unlisted, not advertised: noindex on the page, and no mention in robots.txt or the sitemap
  // (robots.txt is public, and a Disallow would also stop crawlers from seeing the noindex).
  test('stays unlisted', async ({ page, request }) => {
    await page.goto('/play/scheduler/');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    expect(await (await request.get('/robots.txt')).text()).not.toContain('scheduler');
    expect(await (await request.get('/sitemap.xml')).text()).not.toContain('scheduler');
  });

  test('the SAP import works with the built-in sample, and warns about real data', async ({ page }) => {
    await page.goto('/play/scheduler/#/import');
    await expect(page.getByText('This is a public demo.')).toBeVisible();
    await page.getByRole('button', { name: 'Try the sample' }).click();
    await expect(page.locator('.map-row.exact').first()).toBeVisible();
  });
});
