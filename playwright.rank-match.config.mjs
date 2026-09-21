import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: 'rank-match-waiting.browser.spec.mjs',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  outputDir: 'test-results/rank-waiting',
  reporter: [
    ['line'],
    ['html', { outputFolder: 'playwright-report-rank-waiting', open: 'never' }],
    ['json', { outputFile: 'test-results/rank-waiting/report.json' }],
  ],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    browserName: 'chromium',
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    {
      name: 'short-landscape-667x375',
      use: { viewport: { width: 667, height: 375 } },
    },
  ],
  webServer: {
    command: 'python3 -m http.server 4173 --bind 127.0.0.1',
    cwd: new URL('.', import.meta.url).pathname,
    url: 'http://127.0.0.1:4173/browser/GAMEROAD.html',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
