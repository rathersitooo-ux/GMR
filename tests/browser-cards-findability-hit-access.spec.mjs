import { test, expect } from '@playwright/test';

const TARGET_PROJECTS = new Set(['phone-390x844', 'short-landscape-667x375']);

test('Cards findability keeps card hit access and existing filters', async ({ page }, testInfo) => {
  test.skip(!TARGET_PROJECTS.has(testInfo.project.name), 'mobile/short-landscape regression only');

  const response = await page.goto('/browser/GAMEROAD.html', { waitUntil: 'domcontentloaded' });
  expect(response?.ok()).toBeTruthy();

  const goCards = page.locator('[data-home-target="cards"]:visible, [data-go="cards"]:visible').first();
  await expect(goCards).toBeVisible();
  await goCards.click();

  const cards = page.locator('section[data-screen="cards"]');
  await expect(cards).toBeVisible();

  const search = cards.locator('#cardSearch');
  const host = cards.locator('[data-role="cards-deck-findability"]');
  await expect(search).toBeVisible();
  await expect(host).toHaveAttribute('data-integrated', 'true');
  await expect(host.locator('input')).toHaveCount(0);
  expect(await host.evaluate((node) => node.parentElement?.id ?? null)).toBe('r4SuitFilters');

  const first = cards.locator('#collectionGrid [data-id]:visible').first();
  const firstId = await first.getAttribute('data-id');
  expect(firstId).toBeTruthy();
  const centerOwner = await first.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    return hit?.closest?.('[data-id]')?.getAttribute('data-id') ?? null;
  });
  expect(centerOwner).toBe(firstId);

  await first.click();
  await expect(cards).toHaveAttribute('data-inspector', 'open');
  await page.keyboard.press('Escape');
  await expect(cards).toHaveAttribute('data-inspector', 'closed');

  const spade = cards.locator('#r4SuitFilters [data-suit-filter="SP"]:visible').first();
  await spade.click();
  await expect(spade).toHaveClass(/on/);

  await search.fill('スペード');
  await page.waitForTimeout(100);
  let visible = cards.locator('#collectionGrid [data-id]:visible');
  expect(await visible.count()).toBeGreaterThan(0);
  let suits = await visible.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-suit')));
  expect(suits.every((suit) => suit === 'SP')).toBeTruthy();

  await search.fill('');
  await page.waitForTimeout(100);
  visible = cards.locator('#collectionGrid [data-id]:visible');
  expect(await visible.count()).toBeGreaterThan(0);
  suits = await visible.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-suit')));
  expect(suits.every((suit) => suit === 'SP')).toBeTruthy();

  const notInDeck = cards.locator('#r4SuitFilters [data-filter="not-in-deck"]:visible').first();
  await notInDeck.click();
  await expect(notInDeck).toHaveAttribute('aria-pressed', 'true');

  visible = cards.locator('#collectionGrid [data-id]:visible');
  expect(await visible.count()).toBeGreaterThan(0);
  const states = await visible.evaluateAll((nodes) => nodes.map((node) => ({
    suit: node.getAttribute('data-suit'),
    inDeck: node.classList.contains('inDeck'),
  })));
  expect(states.every((state) => state.suit === 'SP' && state.inDeck === false)).toBeTruthy();
});
