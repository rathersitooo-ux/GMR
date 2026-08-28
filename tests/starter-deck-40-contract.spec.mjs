import { test, expect } from '@playwright/test';

const STORAGE_KEY = 'gameroad.browser.v10.core.1';

async function bootFresh(page) {
  const response = await page.goto('/browser/GAMEROAD.html', { waitUntil: 'domcontentloaded' });
  expect(response, 'main HTML response').not.toBeNull();
  expect(response.ok(), `main HTML status ${response.status()}`).toBeTruthy();
  await page.evaluate((key) => localStorage.removeItem(key), STORAGE_KEY);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  await expect(page.locator('section[data-screen="home"]')).toBeVisible();
}

function visibleHomeControl(page, target) {
  return page
    .locator(`[data-go="${target}"]:visible, [data-home-target="${target}"]:visible`)
    .first();
}

test('fresh starter deck is exactly 40 cards and immediately battle-legal', async ({ page }) => {
  await bootFresh(page);

  const contract = await page.evaluate(() => {
    const t = window.__GAMEROAD_TEST__;
    return {
      defaultCount: window.__DEFAULT_DECK__.length,
      savedCount: t.state.savedDeck.main.length,
      validation: t.deckValidate(t.state.savedDeck, { forBattle: true }),
      raw: localStorage.getItem('gameroad.browser.v10.core.1'),
    };
  });

  expect(contract.raw, 'fresh boot keeps the starter transient until an explicit save').toBeNull();
  expect(contract.defaultCount, '__DEFAULT_DECK__ contract').toBe(40);
  expect(contract.savedCount, 'fresh savedDeck main count').toBe(40);
  expect(contract.validation.ok, `fresh starter validation: ${JSON.stringify(contract.validation)}`).toBeTruthy();

  const cardsControl = visibleHomeControl(page, 'cards');
  await expect(cardsControl).toBeVisible();
  await cardsControl.click();
  const cards = page.locator('section[data-screen="cards"]');
  await expect(cards).toBeVisible();
  await expect(cards.locator('#deckCount'), 'visible fresh deck count').toHaveText('40');
  await expect(cards.locator('#exDeckCount'), 'visible fresh EX deck count').toHaveText('0');
});

test('fresh starter can enter Setup without a deck-count repair step', async ({ page }) => {
  await bootFresh(page);

  const setupControl = visibleHomeControl(page, 'setup');
  await expect(setupControl).toBeVisible();
  await setupControl.click();

  const setup = page.locator('section[data-screen="setup"]');
  await expect(setup).toBeVisible();
  await setup.locator('[data-content="road_shield"]').click();
  await setup.locator('[data-mode="2p"]').click();
  const startMatch = setup.locator('#startMatch');
  await expect(startMatch, 'fresh 40-card starter requires no deck repair before play').toBeEnabled();
});

test('explicit reset returns to the transient legal 40-card starter', async ({ page }) => {
  await bootFresh(page);

  const cardsControl = visibleHomeControl(page, 'cards');
  await expect(cardsControl).toBeVisible();
  await cardsControl.click();
  const cards = page.locator('section[data-screen="cards"]');
  await expect(cards).toBeVisible();
  const saveDeck = cards.locator('#saveDeck');
  await expect(saveDeck, 'fresh legal starter can be explicitly saved').toBeEnabled();
  await saveDeck.click();
  await expect(cards.locator('#deckSaveState')).toHaveText('保存済み');
  expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).not.toBeNull();

  page.once('dialog', async (dialog) => dialog.accept());
  await page.evaluate(() => document.querySelector('#resetSave').click());
  await page.waitForTimeout(120);

  const afterReset = await page.evaluate((key) => ({
    raw: localStorage.getItem(key),
    defaultCount: window.__DEFAULT_DECK__.length,
    savedCount: window.__GAMEROAD_TEST__.state.savedDeck.main.length,
    validation: window.__GAMEROAD_TEST__.deckValidate(window.__GAMEROAD_TEST__.state.savedDeck, { forBattle: true }),
  }), STORAGE_KEY);

  expect(afterReset.raw, 'reset does not immediately materialize a durable save').toBeNull();
  expect(afterReset.defaultCount).toBe(40);
  expect(afterReset.savedCount).toBe(40);
  expect(afterReset.validation.ok, `reset starter validation: ${JSON.stringify(afterReset.validation)}`).toBeTruthy();
});
