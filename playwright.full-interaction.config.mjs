import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: ['browser-full-interaction.spec.mjs', 'browser-full-interaction-state-sequence.spec.mjs'],
  timeout: 90_000,
  expect: { timeout: 7_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  outputDir: 'test-results/full-interaction',
  reporter: [
    ['line'],
    ['html', { outputFolder: 'playwright-report-full-interaction', open: 'never' }],
    ['json', { outputFile: 'test-results/full-interaction/unattended-playtest-report.json' }],
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
      name: 'desktop-1280x720',
      use: { viewport: { width: 1280, height: 720 } },
    },
    {
      name: 'phone-390x844',
      use: { viewport: { width: 390, height: 844 } },
    },
    {
      name: 'short-landscape-667x375',
      use: { viewport: { width: 667, height: 375 } },
    },
    {
      name: 'phone-touch-390x844',
      testMatch: ['browser-full-interaction-touch.spec.mjs'],
      use: {
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: {
    command: 'python3 -m http.server 4173 --bind 127.0.0.1',
    url: 'http://127.0.0.1:4173/browser/GAMEROAD.html',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
