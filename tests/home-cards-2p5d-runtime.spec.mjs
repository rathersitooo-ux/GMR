import { test, expect } from '@playwright/test';

test('Home to Cards runs live hybrid 2.5D presentation without owning semantic navigation', async ({ page }) => {
  const response = await page.goto('/browser/GAMEROAD.html', { waitUntil: 'load' });
  expect(response?.ok()).toBeTruthy();
  await page.waitForFunction(() => Boolean(
    globalThis.GAMEROAD_HOMECARDS_2P5D
    && globalThis.GAMEROAD_SCREEN_TRANSITION
    && globalThis.GAMEROAD_NAV_QA,
  ));
  await expect(page.locator('section[data-screen="home"]')).toBeVisible();

  const before = await page.evaluate(() => globalThis.GAMEROAD_HOMECARDS_2P5D.snapshot());
  expect(before.mounted).toBe(true);
  expect(before.stagePresent).toBe(false);

  const cards = page.locator('.homePadChoice[data-home-target="cards"]:visible').first();
  await expect(cards).toBeVisible();
  await cards.click();
  await page.waitForFunction(() => (
    globalThis.GAMEROAD_NAV_QA.snapshot().screen === 'cards'
    && globalThis.GAMEROAD_SCREEN_TRANSITION.getState().phase === 'IDLE'
  ));
  await expect(page.locator('section[data-screen="cards"]')).toBeVisible();

  const completed = await page.evaluate(() => globalThis.GAMEROAD_HOMECARDS_2P5D.snapshot());
  expect(completed.startedCount).toBeGreaterThan(before.startedCount);
  expect(completed.completedCount).toBeGreaterThan(before.completedCount);
  expect(completed.lastRoute).toBe('home->cards');
  expect(completed.lastPhase).toBe('IDLE');
  expect(completed.active).toBe(false);
  expect(completed.stagePresent).toBe(false);

  await page.evaluate(() => globalThis.GAMEROAD_NAV_QA.root('home'));
  await page.waitForFunction(() => (
    globalThis.GAMEROAD_NAV_QA.snapshot().screen === 'home'
    && globalThis.GAMEROAD_SCREEN_TRANSITION.getState().phase === 'IDLE'
  ));

  const abortBefore = await page.evaluate(() => globalThis.GAMEROAD_HOMECARDS_2P5D.snapshot());
  const cancelled = await page.evaluate(async () => {
    const runtime = globalThis.GAMEROAD_SCREEN_TRANSITION;
    const pending = runtime.navigate('cards', { reason: 'detail' });
    await new Promise((resolve) => requestAnimationFrame(() => resolve()));
    const cancelReturned = runtime.cancel();
    const result = await pending;
    return {
      cancelReturned,
      result,
      screen: globalThis.GAMEROAD_NAV_QA.snapshot().screen,
      phase: runtime.getState().phase,
      presentation: globalThis.GAMEROAD_HOMECARDS_2P5D.snapshot(),
    };
  });
  expect(cancelled.cancelReturned).toBe(true);
  expect(cancelled.result.status).toBe('superseded');
  expect(cancelled.screen).toBe('home');
  expect(cancelled.phase).toBe('IDLE');
  expect(cancelled.presentation.abortedCount).toBeGreaterThan(abortBefore.abortedCount);
  expect(cancelled.presentation.active).toBe(false);
  expect(cancelled.presentation.stagePresent).toBe(false);
});

test('Home to Cards respects reduced-motion while retaining the same semantic result', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const response = await page.goto('/browser/GAMEROAD.html', { waitUntil: 'load' });
  expect(response?.ok()).toBeTruthy();
  await page.waitForFunction(() => Boolean(globalThis.GAMEROAD_HOMECARDS_2P5D));
  const before = await page.evaluate(() => globalThis.GAMEROAD_HOMECARDS_2P5D.snapshot());

  const cards = page.locator('.homePadChoice[data-home-target="cards"]:visible').first();
  await expect(cards).toBeVisible();
  await cards.click();
  await page.waitForFunction(() => (
    globalThis.GAMEROAD_NAV_QA.snapshot().screen === 'cards'
    && globalThis.GAMEROAD_SCREEN_TRANSITION.getState().phase === 'IDLE'
  ));

  const after = await page.evaluate(() => globalThis.GAMEROAD_HOMECARDS_2P5D.snapshot());
  expect(after.completedCount).toBeGreaterThan(before.completedCount);
  expect(after.lastProfile).toBe('reduced');
  expect(after.lastRoute).toBe('home->cards');
  expect(after.stagePresent).toBe(false);
  expect(await page.evaluate(() => globalThis.GAMEROAD_NAV_QA.snapshot().screen)).toBe('cards');
});
