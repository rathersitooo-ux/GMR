import { test, expect } from '@playwright/test';

const FAVORITE_KEY = 'gameroad.cards.favorite.v1';

async function boot(page) {
  const response = await page.goto('/browser/GAMEROAD.html', { waitUntil: 'domcontentloaded' });
  expect(response?.ok(), `main HTML status ${response?.status()}`).toBeTruthy();
  await page.waitForTimeout(700);
  await expect(page.locator('section[data-screen="home"]')).toBeVisible();
}

async function enterCards(page) {
  const cards = page.locator('section[data-screen="cards"]');
  if (await cards.isVisible().catch(() => false)) return cards;
  const control = page.locator('[data-home-target="cards"]:visible, [data-go="cards"]:visible').first();
  await expect(control, 'Cards has a visible Home entry control').toBeVisible();
  await control.click();
  await expect(cards).toBeVisible();
  await page.waitForTimeout(200);
  return cards;
}

async function chooseAndFavoriteFirstCard(page, cards) {
  const card = cards.locator('#collectionGrid button.slot.live.cardFace[data-id]:visible').first();
  await expect(card, 'collection exposes a physically clickable card').toBeVisible();
  const cardId = await card.getAttribute('data-id');
  expect(cardId, 'selected card has a data-id').toBeTruthy();
  await card.click();

  const favoriteAction = cards.locator('[data-role="cards-favorite-action"]:visible');
  await expect(favoriteAction, 'favorite action is exposed after a real card click').toBeVisible();
  await favoriteAction.click();
  await expect(favoriteAction).toHaveAttribute('aria-pressed', 'true');

  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) || '[]'), FAVORITE_KEY);
  expect(saved, 'favorite is saved through the current local UI authority').toContain(cardId);

  const closePreview = cards.locator('#r4PreviewClose:visible');
  if ((await closePreview.count()) > 0) await closePreview.click();
  return cardId;
}

async function assertFavoriteFilterPhysicallyUsable(page, cards, cardId) {
  const filter = cards.locator('[data-role="cards-deck-findability"] button[data-filter="favorite"]:visible');
  await expect(filter, 'favorite-only filter is visible').toBeVisible();
  await filter.click();
  await expect(filter, 'favorite-only filter receives the physical click').toHaveAttribute('aria-pressed', 'true');

  const visibleIds = await cards.locator('#collectionGrid [data-id]').evaluateAll((nodes) =>
    nodes.filter((node) => !node.hidden).map((node) => node.getAttribute('data-id')).filter(Boolean),
  );
  expect(visibleIds.length, 'favorite-only filter leaves at least one visible favorite').toBeGreaterThan(0);
  expect(new Set(visibleIds), 'favorite-only filter hides non-favorites').toEqual(new Set([cardId]));

  const favoriteCard = cards.locator(`#collectionGrid button.slot.live.cardFace[data-id="${cardId}"]:visible`).first();
  await expect(favoriteCard, 'favorite card remains physically clickable after stacking repair').toBeVisible();
  await favoriteCard.click();
  await expect(cards.locator('.cardPreview')).toBeVisible();
}

test('Cards favorite-only filter remains physically clickable and persists across reload', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await boot(page);
  await page.evaluate((key) => localStorage.removeItem(key), FAVORITE_KEY);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(700);

  let cards = await enterCards(page);
  const cardId = await chooseAndFavoriteFirstCard(page, cards);
  await assertFavoriteFilterPhysicallyUsable(page, cards, cardId);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(700);
  cards = await enterCards(page);
  const persisted = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) || '[]'), FAVORITE_KEY);
  expect(persisted, 'favorite survives a full reload').toContain(cardId);
  await assertFavoriteFilterPhysicallyUsable(page, cards, cardId);

  expect(pageErrors, `page errors:\n${pageErrors.join('\n')}`).toEqual([]);
});
