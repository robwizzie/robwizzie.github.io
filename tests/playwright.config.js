// @ts-check
const { defineConfig, devices } = require('@playwright/test');

// Locally (or in a sandbox with a preinstalled Chromium) set CHROMIUM_PATH to use it.
const launchOptions = {
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'], // WebGL for the 3D dogs, without a GPU
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
};

module.exports = defineConfig({
  testDir: './specs',
  timeout: 45000,
  expect: { timeout: 8000 },
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: 'http://localhost:4173', trace: 'retain-on-failure', launchOptions },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 900 }, launchOptions } },
    { name: 'phone', use: { ...devices['Pixel 7'], launchOptions } }
  ],
  webServer: { command: 'node serve.js', url: 'http://localhost:4173', reuseExistingServer: !process.env.CI }
});
