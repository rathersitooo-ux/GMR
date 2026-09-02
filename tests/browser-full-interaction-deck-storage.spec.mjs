import { test, expect } from '@playwright/test';

async function attachScreenshot(page, testInfo, name) {
  await testInfo.attach(`${testInfo.project.name}-${name}.png`, {
    body: await page.screenshot({ fullPage: true, animations: 'disabled' }),
    contentType: 'image/png',
  });
}

async function bootToCards(page) {
  const response = await page.goto('/browser/GAMEROAD.html', { waitUntil: 'domcontentloaded' });
  expect(response, 'main HTML response').not.toBeNull();
  expect(response.ok(), `main HTML status ${response.status()}`).toBeTruthy();
  await page.waitForTimeout(1_000);

  const home = page.locator('section[data-screen="home"]');
  await expect(home).toBeVisible();
  const cardsGo = page
    .locator('[data-home-target="cards"]:visible, [data-go="cards"]:visible')
    .first();
  await expect(cardsGo, 'Cards has a visible human entry from Home').toBeVisible();
  await cardsGo.click();

  const cards = page.locator('section[data-screen="cards"]');
  await expect(cards).toBeVisible();
  await page.waitForTimeout(250);
  return cards;
}

function storageCountFromAria(value) {
  const match = String(value ?? '').match(/^ストレージ\s+(\d+)枚$/u);
  return match ? Number(match[1]) : Number.NaN;
}

test('R73 reaches Deck Storage from visible Cards controls and collection left swipe', async ({ page }, testInfo) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  const cards = await bootToCards(page);
  const storageButton = cards.locator('[data-role="deck-storage-button"]:visible');
  const discoveryHint = cards.locator('[data-role="deck-storage-discovery-hint"]:visible');

  await expect(storageButton, 'Deck Storage has a visible button on the live Cards screen').toBeVisible();
  await expect(discoveryHint, 'Cards exposes the existing left-swipe Storage hint').toBeVisible();
  await expect(discoveryHint).toHaveText('← ストレージ');

  const beforeLabel = await storageButton.getAttribute('aria-label');
  const beforeCount = storageCountFromAria(beforeLabel);
  expect(Number.isFinite(beforeCount), `storage count aria label: ${beforeLabel}`).toBeTruthy();

  await storageButton.click();
  let dialog = page.locator('[data-role="deck-storage-backdrop"]:visible [role="dialog"]');
  await expect(dialog, 'visible Storage button opens the live Storage dialog').toBeVisible();
  await expect(dialog.locator('.gr-storage-title')).toHaveText('ストレージ');
  await attachScreenshot(page, testInfo, 'r73-deck-storage-entry-visible');

  await dialog.locator('.gr-storage-close').click();
  await expect(page.locator('[data-role="deck-storage-backdrop"]')).toHaveCount(0);

  const collectionCard = cards.locator('#collectionGrid [data-id]:visible').first();
  await expect(collectionCard, 'at least one visible collection card is available for the human swipe').toBeVisible();
  const cardId = await collectionCard.getAttribute('data-id');
  expect(cardId, 'visible collection card has a stable card id').toBeTruthy();
  const box = await collectionCard.boundingBox();
  expect(box, 'visible collection card has pointer geometry').not.toBeNull();

  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX - 72, startY, { steps: 8 });
  await page.mouse.up();

  dialog = page.locator('[data-role="deck-storage-backdrop"]:visible [role="dialog"]');
  await expect(dialog, 'collection left swipe opens Storage through the live runtime').toBeVisible();
  await expect.poll(async () => storageCountFromAria(await storageButton.getAttribute('aria-label')))
    .toBe(beforeCount + 1);
  await expect(dialog.locator(`.gr-storage-card[data-card-id="${cardId}"]`), 'swiped collection card appears in Storage').toBeVisible();
  await attachScreenshot(page, testInfo, 'r73-deck-storage-card-stored-visible');

  expect(pageErrors, `page errors:\n${pageErrors.join('\n')}`).toEqual([]);
});
