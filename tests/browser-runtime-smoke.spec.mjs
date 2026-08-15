import { test, expect } from '@playwright/test';

const CORE_SCREENS = ['home', 'cards', 'characters', 'setup', 'battle', 'result', 'shop'];
const NAV_TARGETS = ['home', 'cards', 'characters', 'setup', 'battle', 'shop'];

test('GAMEROAD boots and core navigation runs without JS errors', async ({ page }) => {
  const pageErrors = [];
  const consoleErrors = [];
  const unexpectedHttpErrors = [];
  let versionManifest404Count = 0;

  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('response', (response) => {
    if (response.status() < 400) return;
    const url = new URL(response.url());
    if (response.status() === 404 && url.pathname.endsWith('/browser/gameroad-version.json')) {
      versionManifest404Count += 1;
      return;
    }
    unexpectedHttpErrors.push(`${response.status()} ${url.pathname}`);
  });

  const response = await page.goto('/browser/GAMEROAD.html', { waitUntil: 'domcontentloaded' });
  expect(response, 'main HTML response').not.toBeNull();
  expect(response.ok(), `main HTML status ${response.status()}`).toBeTruthy();

  await page.waitForTimeout(1_000);

  const doctype = await page.evaluate(() => document.doctype?.name?.toLowerCase() ?? '');
  expect(doctype).toBe('html');

  for (const screen of CORE_SCREENS) {
    const count = await page.locator(`section[data-screen="${screen}"]`).count();
    expect(count, `core screen ${screen}`).toBeGreaterThan(0);
  }

  const dataGoCount = await page.locator('[data-go]').count();
  expect(dataGoCount, 'runtime data-go controls').toBeGreaterThan(0);

  let pointerClicks = 0;
  for (const target of NAV_TARGETS) {
    const control = page.locator(`[data-go="${target}"]:visible`).first();
    if (await control.count()) {
      await control.click({ timeout: 5_000 });
      pointerClicks += 1;
      await page.waitForTimeout(120);
      const targetCount = await page.locator(`section[data-screen="${target}"]`).count();
      expect(targetCount, `navigation target ${target}`).toBeGreaterThan(0);
    }
  }

  // The current repository intentionally does not contain the deployment-side
  // gameroad-version.json companion. Preserve that gap as explicit evidence,
  // but do not let its single browser-generated 404 console line hide real errors.
  const remainingConsoleErrors = [...consoleErrors];
  for (let i = 0; i < versionManifest404Count; i += 1) {
    const index = remainingConsoleErrors.findIndex((message) =>
      message.includes('Failed to load resource') && message.includes('404'),
    );
    if (index >= 0) remainingConsoleErrors.splice(index, 1);
  }
  if (versionManifest404Count > 0) {
    test.info().annotations.push({
      type: 'known-deployment-gap',
      description: `gameroad-version.json returned 404 ${versionManifest404Count} time(s); tracked separately from runtime smoke`,
    });
  }

  expect(pointerClicks, 'at least one real visible data-go control was clicked').toBeGreaterThan(0);
  expect(unexpectedHttpErrors, `unexpected HTTP errors:\n${unexpectedHttpErrors.join('\n')}`).toEqual([]);
  expect(pageErrors, `page errors:\n${pageErrors.join('\n')}`).toEqual([]);
  expect(remainingConsoleErrors, `console errors:\n${remainingConsoleErrors.join('\n')}`).toEqual([]);
});
