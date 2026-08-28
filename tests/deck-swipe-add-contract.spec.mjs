import { test, expect } from '@playwright/test';

// INTENTIONALLY RED until the deck-card Product Mount implements the user-locked
// interaction contract. This file is isolated from the default Required Gate
// testMatch so the contract can land on its own draft PR without pretending the
// product behavior already exists.

test.use({ viewport: { width: 390, height: 844 } });

async function openDeckEditor(page) {
  const response = await page.goto('/browser/GAMEROAD.html', { waitUntil: 'domcontentloaded' });
  expect(response, 'main HTML response').not.toBeNull();
  expect(response.ok(), `main HTML status ${response.status()}`).toBeTruthy();

  await page.waitForFunction(() => {
    const api = window.__GAMEROAD_TEST__;
    return !!api && Array.isArray(window.__CARD_DATA__) && typeof api.deckSetDraft === 'function';
  });

  await page.evaluate(() => window.__GAMEROAD_TEST__.show('cards'));
  await expect(page.locator('section[data-screen="cards"].screen.active:visible')).toBeVisible();
  await expect(page.locator('#collectionGrid .slot[data-id]').first()).toBeVisible();
}

async function pickMainCandidate(page) {
  return page.evaluate(() => {
    const api = window.__GAMEROAD_TEST__;
    const card = api.deckPublic().find((entry) => entry.slot === 'main' && !api.isRoyalCard(entry.id));
    if (!card) throw new Error('No non-Royal public main-deck card is available for swipe contract');
    return card.id;
  });
}

async function seedDraft(page, main = [], ex = []) {
  return page.evaluate(({ mainIds, exIds }) => {
    const api = window.__GAMEROAD_TEST__;
    api.deckSetDraft(mainIds, exIds);
    window.__GAMEROAD_CONTEXT_HELP_TEST__?.clear?.();
    return {
      main: [...api.state.deckDraft.main],
      ex: [...api.state.deckDraft.ex],
    };
  }, { mainIds: main, exIds: ex });
}

async function draftSnapshot(page) {
  return page.evaluate(() => {
    const api = window.__GAMEROAD_TEST__;
    return {
      main: [...api.state.deckDraft.main],
      ex: [...api.state.deckDraft.ex],
      context: window.__GAMEROAD_CONTEXT_HELP_TEST__?.snapshot?.().current ?? null,
    };
  });
}

async function swipeCard(page, cardId, { dx, dy }) {
  const tile = page.locator(`#collectionGrid .slot[data-id="${cardId}"]`).first();
  await expect(tile, `collection tile ${cardId}`).toBeVisible();
  const box = await tile.boundingBox();
  expect(box, `collection tile ${cardId} bounding box`).not.toBeNull();

  const startX = box.x + Math.max(8, Math.min(24, box.width * 0.25));
  const startY = box.y + Math.max(8, Math.min(24, box.height * 0.25));
  const pointerId = 41;
  const common = { pointerId, pointerType: 'touch', isPrimary: true, button: 0 };

  await tile.dispatchEvent('pointerdown', {
    ...common,
    buttons: 1,
    clientX: startX,
    clientY: startY,
  });
  await tile.dispatchEvent('pointermove', {
    ...common,
    buttons: 1,
    clientX: startX + dx * 0.55,
    clientY: startY + dy * 0.55,
  });
  await tile.dispatchEvent('pointermove', {
    ...common,
    buttons: 1,
    clientX: startX + dx,
    clientY: startY + dy,
  });
  await tile.dispatchEvent('pointerup', {
    ...common,
    buttons: 0,
    clientX: startX + dx,
    clientY: startY + dy,
  });

  await page.waitForTimeout(80);
}

async function fullMainFixture(page) {
  return page.evaluate(() => {
    const api = window.__GAMEROAD_TEST__;
    const sourceById = new Map(window.__CARD_DATA__.map((card) => [card.id, card]));
    const unique = [];
    const seenNames = new Set();

    for (const entry of api.deckPublic()) {
      if (entry.slot !== 'main') continue;
      const card = sourceById.get(entry.id);
      const canonicalName = card?.canonical_name || card?.base_card_name || card?.display_name || entry.id;
      if (seenNames.has(canonicalName)) continue;
      seenNames.add(canonicalName);
      unique.push(entry.id);
    }

    if (unique.length < 41) {
      throw new Error(`Swipe max-main contract needs 41 unique public main cards; found ${unique.length}`);
    }

    const candidate = unique.find((id) => !api.isRoyalCard(id));
    if (!candidate) throw new Error('No non-Royal candidate is available for max-main contract');
    const main = unique.filter((id) => id !== candidate).slice(0, 40);
    if (main.length !== 40) throw new Error(`Could not construct 40-card max-main fixture; got ${main.length}`);
    api.deckSetDraft(main, []);
    window.__GAMEROAD_CONTEXT_HELP_TEST__?.clear?.();
    return { candidate, main: [...api.state.deckDraft.main] };
  });
}

test.describe('deck editor right-swipe quick-add contract', () => {
  test('right swipe adds the touched card immediately exactly once', async ({ page }) => {
    await openDeckEditor(page);
    const cardId = await pickMainCandidate(page);
    const before = await seedDraft(page);
    expect(before.main).toHaveLength(0);

    await swipeCard(page, cardId, { dx: 112, dy: 8 });

    const after = await draftSnapshot(page);
    expect(after.main, 'one right swipe must add exactly one card').toEqual([cardId]);
    expect(JSON.stringify(after.context), 'one gesture must not double-fire into duplicate rejection')
      .not.toContain('DECK_ADD_REJECTED');
  });

  test('vertical scroll-like gesture does not add a card', async ({ page }) => {
    await openDeckEditor(page);
    const cardId = await pickMainCandidate(page);
    await seedDraft(page);

    await swipeCard(page, cardId, { dx: 8, dy: 112 });

    const after = await draftSnapshot(page);
    expect(after.main, 'vertical gesture must remain scroll/navigation intent').toHaveLength(0);
  });

  test('left swipe does not add a card', async ({ page }) => {
    await openDeckEditor(page);
    const cardId = await pickMainCandidate(page);
    await seedDraft(page);

    await swipeCard(page, cardId, { dx: -112, dy: 8 });

    const after = await draftSnapshot(page);
    expect(after.main, 'left swipe is not the quick-add gesture').toHaveLength(0);
  });

  test('short right movement remains a tap-sized movement and does not add', async ({ page }) => {
    await openDeckEditor(page);
    const cardId = await pickMainCandidate(page);
    await seedDraft(page);

    await swipeCard(page, cardId, { dx: 16, dy: 3 });

    const after = await draftSnapshot(page);
    expect(after.main, 'short movement must not cross the swipe-add threshold').toHaveLength(0);
  });

  test('right swipe cannot turn a full 40-card main deck into 41 cards', async ({ page }) => {
    await openDeckEditor(page);
    const fixture = await fullMainFixture(page);
    expect(fixture.main).toHaveLength(40);
    expect(fixture.main).not.toContain(fixture.candidate);

    await swipeCard(page, fixture.candidate, { dx: 112, dy: 8 });

    const after = await draftSnapshot(page);
    expect(after.main, 'quick-add must reuse the existing 40-card upper bound').toHaveLength(40);
    expect(after.main).not.toContain(fixture.candidate);
  });

  test('leaving and re-entering Cards keeps one right swipe single-shot', async ({ page }) => {
    await openDeckEditor(page);
    const cardId = await pickMainCandidate(page);
    await seedDraft(page);

    await page.evaluate(() => {
      const api = window.__GAMEROAD_TEST__;
      api.show('home');
      api.show('cards');
      api.show('home');
      api.show('cards');
      window.__GAMEROAD_CONTEXT_HELP_TEST__?.clear?.();
    });
    await expect(page.locator('section[data-screen="cards"].screen.active:visible')).toBeVisible();

    await swipeCard(page, cardId, { dx: 112, dy: 8 });

    const after = await draftSnapshot(page);
    expect(after.main, 're-entry must not multiply gesture listeners').toEqual([cardId]);
    expect(JSON.stringify(after.context), 're-entry must not leave a duplicate-add rejection')
      .not.toContain('DECK_ADD_REJECTED');
  });
});
