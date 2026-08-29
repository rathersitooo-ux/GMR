import { test, expect } from '@playwright/test';

async function bootHome(page) {
  const response = await page.goto('/browser/GAMEROAD.html', { waitUntil: 'domcontentloaded' });
  expect(response, 'main HTML response').not.toBeNull();
  expect(response.ok(), `main HTML status ${response.status()}`).toBeTruthy();
  await page.waitForTimeout(500);
  await expect(page.locator('section[data-screen="home"]')).toBeVisible();
}

async function enterCards(page) {
  const control = page
    .locator('[data-go="cards"]:visible, [data-home-target="cards"]:visible')
    .first();
  await expect(control, 'visible Cards navigation control').toBeVisible();
  await control.click();
  await expect(page.locator('section[data-screen="cards"]')).toBeVisible();
  await expect(page.locator('#collectionGrid .slot.live.cardFace').first()).toBeVisible();
}

async function draftSnapshot(page) {
  return page.evaluate(() => {
    const t = window.__GAMEROAD_TEST__;
    if (!t?.state?.deckDraft) throw new Error('deck draft test hook unavailable');
    return {
      main: [...t.state.deckDraft.main],
      ex: [...t.state.deckDraft.ex],
      total: t.state.deckDraft.main.length + t.state.deckDraft.ex.length,
    };
  });
}

async function firstPublicMainOutsideDeck(page) {
  return page.evaluate(() => {
    const t = window.__GAMEROAD_TEST__;
    if (!t?.deckPublic || !t?.state?.deckDraft) throw new Error('deck test hooks unavailable');
    const occupied = new Set([...t.state.deckDraft.main, ...t.state.deckDraft.ex]);
    const candidate = t.deckPublic().find((card) => card.slot === 'main' && !occupied.has(card.id));
    if (!candidate) throw new Error('no public main-deck card outside current draft');
    return candidate.id;
  });
}

async function swipeCard(page, cardId, { dx, dy, pointerId }) {
  const card = page.locator(`#collectionGrid .slot.live.cardFace[data-id="${cardId}"]`).first();
  await expect(card, `collection card ${cardId}`).toBeVisible();
  await card.scrollIntoViewIfNeeded();
  const box = await card.boundingBox();
  expect(box, `bounding box for ${cardId}`).not.toBeNull();

  const startX = box.x + Math.min(Math.max(box.width * 0.3, 12), box.width - 12);
  const startY = box.y + Math.min(Math.max(box.height * 0.5, 12), box.height - 12);
  const base = {
    pointerId,
    pointerType: 'touch',
    isPrimary: true,
    button: 0,
    clientX: startX,
    clientY: startY,
  };

  await card.dispatchEvent('pointerdown', { ...base, buttons: 1 });
  await card.dispatchEvent('pointermove', {
    ...base,
    buttons: 1,
    clientX: startX + dx,
    clientY: startY + dy,
  });
  await card.dispatchEvent('pointerup', {
    ...base,
    buttons: 0,
    clientX: startX + dx,
    clientY: startY + dy,
  });
  await page.waitForTimeout(80);
}

async function installLegalFortyCardDeck(page) {
  return page.evaluate(() => {
    const t = window.__GAMEROAD_TEST__;
    if (!t?.deckPublic || !t?.deckSetDraft || !t?.deckCommit) throw new Error('deck setup hooks unavailable');
    const publicMain = new Set(t.deckPublic().filter((card) => card.slot === 'main').map((card) => card.id));
    const standard = window.__CARD_DATA__
      .filter((card) => publicMain.has(card.id)
        && /^(SP|HT|DI|CL)$/.test(card.suit)
        && /^(A|[2-9]|10|J|Q|K)$/.test(String(card.rank)))
      .map((card) => card.id);
    const royalIds = ['SP_J', 'SP_Q', 'SP_K'];
    const nonRoyal = standard.filter((id) => !t.isRoyalCard(id));
    const main = [...nonRoyal.slice(0, 37), ...royalIds];
    const setValidation = t.deckSetDraft(main, []);
    const draftValidation = t.deckValidate(t.state.deckDraft, { forBattle: true });
    const committed = draftValidation.ok ? t.deckCommit() : false;
    return { main, setValidation, draftValidation, committed };
  });
}

test('deck collection right swipe adds once while wrong gestures, duplicate, and 40-card overflow do not', async ({ page }) => {
  await bootHome(page);
  await enterCards(page);

  const cardId = await firstPublicMainOutsideDeck(page);
  const before = await draftSnapshot(page);

  await swipeCard(page, cardId, { dx: -64, dy: 0, pointerId: 11 });
  expect(await draftSnapshot(page), 'left swipe must not mutate deck').toEqual(before);

  await swipeCard(page, cardId, { dx: 8, dy: 64, pointerId: 12 });
  expect(await draftSnapshot(page), 'vertical swipe must not mutate deck').toEqual(before);

  await swipeCard(page, cardId, { dx: 30, dy: 0, pointerId: 13 });
  expect(await draftSnapshot(page), 'sub-threshold right swipe must not mutate deck').toEqual(before);

  await swipeCard(page, cardId, { dx: 64, dy: 4, pointerId: 14 });
  const added = await draftSnapshot(page);
  expect(added.total, 'committed right swipe adds exactly one card').toBe(before.total + 1);
  expect(added.main, 'right-swiped main card enters main deck').toContain(cardId);

  await swipeCard(page, cardId, { dx: 64, dy: 0, pointerId: 15 });
  const duplicate = await draftSnapshot(page);
  expect(duplicate.total, 'duplicate right swipe must not add another copy').toBe(added.total);
  expect(duplicate.main.filter((id) => id === cardId), 'duplicate card remains single-copy').toHaveLength(1);

  const forty = await installLegalFortyCardDeck(page);
  expect(forty.main, '40-card setup').toHaveLength(40);
  expect(forty.draftValidation.ok, `40-card validation: ${JSON.stringify(forty.draftValidation)}`).toBeTruthy();
  expect(forty.committed, '40-card setup committed for reload').toBeTruthy();

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);
  await expect(page.locator('section[data-screen="home"]')).toBeVisible();
  await enterCards(page);

  const fullBefore = await draftSnapshot(page);
  expect(fullBefore.main, 'reloaded main deck stays full').toHaveLength(40);
  const overflowCardId = await firstPublicMainOutsideDeck(page);
  await swipeCard(page, overflowCardId, { dx: 64, dy: 0, pointerId: 16 });
  const fullAfter = await draftSnapshot(page);
  expect(fullAfter.main, 'right swipe cannot exceed 40 main cards').toHaveLength(40);
  expect(fullAfter.main, 'overflow candidate stays outside deck').not.toContain(overflowCardId);
  expect(fullAfter.total, 'overflow attempt does not mutate total draft size').toBe(fullBefore.total);
});
