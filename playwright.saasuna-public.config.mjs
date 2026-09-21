import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: ['saasuna-advice-motion-public-acceptance.spec.mjs'],
  timeout: 45_000,
  expect: { timeout: 7_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  outputDir: 'test-results/saasuna-public-motion',
  reporter: [
    ['line'],
    ['json', { outputFile: 'test-results/saasuna-public-motion/report.json' }],
    ['html', { outputFolder: 'playwright-report-saasuna-public-motion', open: 'never' }],
  ],
  use: {
    baseURL: process.env.GAMEROAD_PUBLIC_BASE_URL || 'https://gameroad-browser-r5.pages.dev',
    browserName: 'chromium',
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
});
