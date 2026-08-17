import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: 'hatevfx-r8-current-geometry.spec.mjs',
  timeout: 120_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  outputDir: 'test-results/hatevfx-r8-playwright',
  reporter: [
    ['line'],
    ['html', { outputFolder: 'playwright-report-hatevfx-r8', open: 'never' }],
  ],
  use: {
    baseURL: 'http://127.0.0.1:4178',
    browserName: 'chromium',
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    { name: 'desktop-1280x800', use: { viewport: { width: 1280, height: 800 } } },
    { name: 'short-landscape-844x390', use: { viewport: { width: 844, height: 390 } } },
    { name: 'phone-390x844', use: { viewport: { width: 390, height: 844 } } },
  ],
  webServer: {
    command: 'python3 -m http.server 4178 --bind 127.0.0.1',
    url: 'http://127.0.0.1:4178/browser/GAMEROAD.html',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
