import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: ['character-naki-fullpath.spec.mjs'],
  timeout: 300_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  outputDir: 'test-results/character-naki',
  reporter: [
    ['line'],
    ['html', { outputFolder: 'playwright-report-character-naki', open: 'never' }],
  ],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    browserName: 'chromium',
    headless: true,
    viewport: { width: 1280, height: 720 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  webServer: {
    command: 'python3 -m http.server 4173 --bind 127.0.0.1',
    url: 'http://127.0.0.1:4173/browser/GAMEROAD.html',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
