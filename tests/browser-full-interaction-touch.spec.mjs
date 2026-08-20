import { test, expect } from '@playwright/test';

test('mobile touch emulation taps a visible Home control and reaches Cards', async ({ page }, testInfo) => {
  const response = await page.goto('/browser/GAMEROAD.html', { waitUntil: 'domcontentloaded' });
  expect(response, 'main HTML response').not.toBeNull();
  expect(response.ok(), `main HTML status ${response.status()}`).toBeTruthy();
  await page.waitForTimeout(750);

  const home = page.locator('section[data-screen="home"]');
  await expect(home).toBeVisible();

  const modality = await page.evaluate(() => ({
    maxTouchPoints: navigator.maxTouchPoints,
    touchEventSurface: 'ontouchstart' in window,
    coarsePointer: window.matchMedia('(pointer: coarse)').matches,
    viewport: { width: window.innerWidth, height: window.innerHeight },
  }));
  expect(modality.maxTouchPoints, 'touch-capable browser context').toBeGreaterThan(0);

  const cardsControl = page
    .locator('[data-go="cards"]:visible, [data-home-target="cards"]:visible')
    .first();
  await expect(cardsControl, 'visible Home-to-Cards touch target').toBeVisible();
  const targetBox = await cardsControl.boundingBox();
  expect(targetBox, 'touch target has a rendered hit box').not.toBeNull();

  await cardsControl.tap();

  const cards = page.locator('section[data-screen="cards"]');
  await expect(cards, 'Cards screen reached by tap').toBeVisible();

  await testInfo.attach('mobile-touch-evidence.json', {
    body: Buffer.from(`${JSON.stringify({
      project: testInfo.project.name,
      modality,
      targetBox,
      reachedScreen: 'cards',
      interaction: 'tap',
    }, null, 2)}\n`, 'utf8'),
    contentType: 'application/json',
  });

  const png = await page.screenshot({ fullPage: true, animations: 'disabled' });
  await testInfo.attach(`${testInfo.project.name}-cards-after-tap.png`, {
    body: png,
    contentType: 'image/png',
  });
});
