const { test, expect } = require('./mock');

// The capacity scheduler demo (play/scheduler/) is a built app from robwizzie/capacity-based-scheduling-app.
test.describe('capacity scheduler demo', () => {
  test('loads with the public-demo banner and a schedule', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/play/scheduler/');
    await expect(page.getByText('Public demo')).toBeVisible();
    await expect(page.locator('.bar').first()).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('the SAP import works with the built-in sample, and warns about real data', async ({ page }) => {
    await page.goto('/play/scheduler/#/import');
    await expect(page.getByText('This is a public demo.')).toBeVisible();
    await page.getByRole('button', { name: 'Try the sample' }).click();
    await expect(page.locator('.map-row.exact').first()).toBeVisible();
  });
});
