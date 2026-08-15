import { test, expect } from '@playwright/test';

const SAVE_KEY = 'gameroad.browser.v10.core.1';

async function openScreen(page, screen) {
  const control = page
    .locator(`[data-go="${screen}"]:visible, [data-home-target="${screen}"]:visible`)
    .first();
  await expect(control, `visible navigation control for ${screen}`).toBeVisible();
  await control.click();
  await expect(page.locator(`section[data-screen="${screen}"]`)).toBeVisible();
}

async function readSavedDeck(page) {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    if (!raw) throw new Error(`missing ${key}`);
    const pack = JSON.parse(raw);
    if (!pack?.deck || !Array.isArray(pack.deck.main) || !Array.isArray(pack.deck.ex)) {
      throw new Error('saved deck payload is missing');
    }
    return structuredClone(pack.deck);
  }, SAVE_KEY);
}

async function numericText(locator) {
  return Number.parseInt((await locator.textContent()) ?? '', 10);
}

async function openMobileDeckTray(cards, page) {
  const mobileTrayToggle = cards.locator('#r4DeckTrayToggle:visible');
  if ((await mobileTrayToggle.count()) > 0) {
    await mobileTrayToggle.click();
    await page.waitForTimeout(80);
  }
}

async function saveLegalFortyThroughVisibleUi(page) {
  await openScreen(page, 'cards');
  const cards = page.locator('section[data-screen="cards"]');
  const deckCount = cards.locator('#deckCount');
  const candidateIds = await cards
    .locator('#collectionGrid button.slot.live.cardFace:not(.inDeck)[data-id]')
    .evaluateAll((nodes) => [...new Set(nodes.map((node) => node.getAttribute('data-id')).filter(Boolean))]);

  for (const cardId of candidateIds) {
    const before = await numericText(deckCount);
    if (before >= 40) break;

    const candidate = cards
      .locator(`#collectionGrid button.slot.live.cardFace:not(.inDeck)[data-id="${cardId}"]:visible`)
      .first();
    if ((await candidate.count()) === 0) continue;

    await candidate.click();
    const addSelected = cards.locator('#addSelectedCard');
    await expect(addSelected, `add selected card ${cardId}`).toBeVisible();
    await addSelected.click();
    await page.waitForTimeout(80);

    const closePreview = cards.locator('#r4PreviewClose:visible');
    if ((await closePreview.count()) > 0) await closePreview.click();
  }

  await expect(deckCount, 'visible legal deck reaches 40 cards').toHaveText('40');
  await expect(cards.locator('#deckValidation')).toContainText('保存できます');

  await openMobileDeckTray(cards, page);
  const saveDeck = cards.locator('#saveDeck');
  await expect(saveDeck).toBeVisible();
  await expect(saveDeck).toBeEnabled();
  await saveDeck.click();
  await expect(cards.locator('#deckSaveState')).toHaveText('保存済み');
  return readSavedDeck(page);
}

test('visible deck editor blocks re-adding a card already in the deck', async ({ page }) => {
  const response = await page.goto('/browser/GAMEROAD.html', { waitUntil: 'domcontentloaded' });
  expect(response, 'main HTML response').not.toBeNull();
  expect(response.ok(), `main HTML status ${response.status()}`).toBeTruthy();

  await openScreen(page, 'cards');

  const storedBefore = await readSavedDeck(page);
  const deckCountBefore = Number(await page.locator('#deckCount').textContent());
  const existingCard = page.locator('#collectionGrid .slot.inDeck:visible').first();
  await expect(existingCard, 'a saved-deck card is visible in the collection').toBeVisible();
  await existingCard.click();

  const addSelected = page.locator('#addSelectedCard');
  await expect(addSelected).toBeVisible();
  await expect(addSelected).toBeDisabled();
  await expect(addSelected).toHaveText('デッキに登録済み');

  expect(Number(await page.locator('#deckCount').textContent())).toBe(deckCountBefore);
  expect(await readSavedDeck(page)).toEqual(storedBefore);
});

test('persisted duplicate is preserved on reload, rejected by save, and cannot start a match', async ({ page }) => {
  const response = await page.goto('/browser/GAMEROAD.html', { waitUntil: 'domcontentloaded' });
  expect(response, 'main HTML response').not.toBeNull();
  expect(response.ok(), `main HTML status ${response.status()}`).toBeTruthy();

  const legal = await saveLegalFortyThroughVisibleUi(page);
  expect(legal.main).toHaveLength(40);

  const seeded = await page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    if (!raw) throw new Error(`missing ${key}`);
    const pack = JSON.parse(raw);
    if (pack?.v !== 3 || !pack?.deck || !Array.isArray(pack.deck.main) || pack.deck.main.length !== 40) {
      throw new Error('expected current v3 saved legal 40-card deck');
    }
    const duplicateId = String(pack.deck.main[0]);
    pack.deck.main[pack.deck.main.length - 1] = duplicateId;
    localStorage.setItem(key, JSON.stringify(pack));
    return { deck: structuredClone(pack.deck), duplicateId };
  }, SAVE_KEY);

  await page.reload({ waitUntil: 'domcontentloaded' });

  const afterReload = await readSavedDeck(page);
  expect(afterReload, 'load must not silently rewrite the invalid saved deck').toEqual(seeded.deck);
  expect(afterReload.main.filter((id) => String(id) === seeded.duplicateId).length).toBeGreaterThan(1);

  await openScreen(page, 'setup');
  await expect(page.locator('#setupDeckNote')).toContainText('同名1枚までです');
  await expect(page.locator('#startMatch')).toBeDisabled();
  await expect(page.locator('section[data-screen="battle"]')).not.toBeVisible();

  const fix = page.locator('#fixDeckFromSetup');
  await expect(fix).toBeVisible();
  await fix.click();
  const cards = page.locator('section[data-screen="cards"]');
  await expect(cards).toBeVisible();
  await expect(cards.locator('#deckValidation')).toContainText('同名1枚までです');

  const beforeRejectedSave = await readSavedDeck(page);
  await openMobileDeckTray(cards, page);
  const saveDeck = cards.locator('#saveDeck');
  await expect(saveDeck).toBeVisible();
  await expect(saveDeck).toBeEnabled();
  await saveDeck.click();
  await expect(page.locator('#toast')).toContainText('同名1枚までです');
  expect(await readSavedDeck(page), 'rejected save must not mutate persisted deck').toEqual(beforeRejectedSave);
});
