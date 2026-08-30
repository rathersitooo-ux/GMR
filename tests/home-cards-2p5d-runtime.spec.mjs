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

test('Cards collection right swipe adds once while wrong gestures and 40-card overflow do not', async ({ page }) => {
  const response = await page.goto('/browser/GAMEROAD.html', { waitUntil: 'load' });
  expect(response?.ok()).toBeTruthy();
  await page.waitForFunction(() => Boolean(globalThis.__GAMEROAD_TEST__));
  await expect(page.locator('section[data-screen="home"]')).toBeVisible();

  await page.evaluate(() => {
    const t = globalThis.__GAMEROAD_TEST__;
    t.state.deckDraft.main.splice(0);
    t.state.deckDraft.ex.splice(0);
  });

  const enterCards = async () => {
    const control = page.locator('.homePadChoice[data-home-target="cards"]:visible').first();
    await expect(control).toBeVisible();
    await control.click();
    await page.waitForFunction(() => (
      globalThis.GAMEROAD_NAV_QA.snapshot().screen === 'cards'
      && globalThis.GAMEROAD_SCREEN_TRANSITION.getState().phase === 'IDLE'
    ));
    await expect(page.locator('#collectionGrid .slot.live.cardFace').first()).toBeVisible();
  };

  const snapshot = () => page.evaluate(() => {
    const t = globalThis.__GAMEROAD_TEST__;
    return { main: [...t.state.deckDraft.main], ex: [...t.state.deckDraft.ex] };
  });

  const outsideMain = () => page.evaluate(() => {
    const t = globalThis.__GAMEROAD_TEST__;
    const occupied = new Set([...t.state.deckDraft.main, ...t.state.deckDraft.ex]);
    const card = t.deckPublic().find((entry) => entry.slot === 'main' && !occupied.has(entry.id));
    if (!card) throw new Error('no public main-deck card outside current draft');
    return card.id;
  });

  const swipe = async (cardId, dx, dy, pointerId) => {
    const card = page.locator(`#collectionGrid .slot.live.cardFace[data-id="${cardId}"]`).first();
    await expect(card).toBeVisible();
    await card.scrollIntoViewIfNeeded();
    const box = await card.boundingBox();
    expect(box).not.toBeNull();
    const startX = box.x + Math.max(12, Math.min(box.width * 0.3, box.width - 12));
    const startY = box.y + Math.max(12, Math.min(box.height * 0.5, box.height - 12));
    const base = { pointerId, pointerType: 'touch', isPrimary: true, button: 0, clientX: startX, clientY: startY };
    await card.dispatchEvent('pointerdown', { ...base, buttons: 1 });
    await card.dispatchEvent('pointermove', { ...base, buttons: 1, clientX: startX + dx, clientY: startY + dy });
    await card.dispatchEvent('pointerup', { ...base, buttons: 0, clientX: startX + dx, clientY: startY + dy });
    await page.waitForTimeout(100);
  };

  await enterCards();
  const cardId = await outsideMain();
  const before = await snapshot();

  await swipe(cardId, -64, 0, 11);
  expect(await snapshot(), 'left swipe does not mutate deck').toEqual(before);

  await swipe(cardId, 8, 64, 12);
  expect(await snapshot(), 'vertical swipe does not mutate deck').toEqual(before);

  await swipe(cardId, 30, 0, 13);
  expect(await snapshot(), 'short right swipe does not mutate deck').toEqual(before);

  await swipe(cardId, 64, 4, 14);
  const added = await snapshot();
  expect(added.main).toContain(cardId);
  expect(added.main).toHaveLength(before.main.length + 1);

  await swipe(cardId, 64, 0, 15);
  const duplicate = await snapshot();
  expect(duplicate.main.filter((id) => id === cardId)).toHaveLength(1);
  expect(duplicate.main).toHaveLength(added.main.length);

  const full = await page.evaluate(() => {
    const t = globalThis.__GAMEROAD_TEST__;
    const publicMain = new Set(t.deckPublic().filter((card) => card.slot === 'main').map((card) => card.id));
    const standard = globalThis.__CARD_DATA__
      .filter((card) => publicMain.has(card.id) && /^(SP|HT|DI|CL)$/.test(card.suit) && /^(A|[2-9]|10|J|Q|K)$/.test(String(card.rank)))
      .map((card) => card.id);
    const royalIds = ['SP_J', 'SP_Q', 'SP_K'];
    const nonRoyal = standard.filter((id) => !t.isRoyalCard(id));
    const main = [...nonRoyal.slice(0, 37), ...royalIds];
    const setValidation = t.deckSetDraft(main, []);
    const validation = t.deckValidate(t.state.deckDraft, { forBattle: true });
    const committed = validation.ok ? t.deckCommit() : false;
    return { main, setValidation, validation, committed };
  });
  expect(full.main).toHaveLength(40);
  expect(full.validation.ok).toBeTruthy();
  expect(full.committed).toBeTruthy();

  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(globalThis.__GAMEROAD_TEST__));
  await expect(page.locator('section[data-screen="home"]')).toBeVisible();
  await enterCards();

  const fullBefore = await snapshot();
  expect(fullBefore.main).toHaveLength(40);
  const overflowCardId = await outsideMain();
  await swipe(overflowCardId, 64, 0, 16);
  const fullAfter = await snapshot();
  expect(fullAfter.main).toHaveLength(40);
  expect(fullAfter.main).not.toContain(overflowCardId);
  expect(fullAfter).toEqual(fullBefore);
});

test('Quick Deck reads the live rendered deck and dismisses on outside pointer or Escape', async ({ page }) => {
  const response = await page.goto('/browser/GAMEROAD.html', { waitUntil: 'load' });
  expect(response?.ok()).toBeTruthy();
  await page.waitForFunction(() => Boolean(globalThis.__GAMEROAD_TEST__ && globalThis.GAMEROAD_HOMECARDS_2P5D));
  await expect(page.locator('section[data-screen="home"]')).toBeVisible();

  const seeded = await page.evaluate(() => {
    const t = globalThis.__GAMEROAD_TEST__;
    const ids = t.deckPublic().filter((card) => card.slot === 'main').slice(0, 3).map((card) => card.id);
    if (ids.length !== 3) throw new Error('three public main-deck cards required');
    t.state.deckDraft.main.splice(0, t.state.deckDraft.main.length, ...ids);
    t.state.deckDraft.ex.splice(0);
    return ids;
  });

  const cards = page.locator('.homePadChoice[data-home-target="cards"]:visible').first();
  await expect(cards).toBeVisible();
  await cards.click();
  await page.waitForFunction(() => (
    globalThis.GAMEROAD_NAV_QA.snapshot().screen === 'cards'
    && globalThis.GAMEROAD_SCREEN_TRANSITION.getState().phase === 'IDLE'
  ));

  const quickDeckButton = page.locator('#gameroad-quick-deck-open');
  await expect(quickDeckButton).toBeVisible();
  const rendered = await page.locator('#deckSlots [data-id], #exDeckSlots [data-id]').evaluateAll(
    (nodes) => nodes.map((node) => node.dataset.id).filter(Boolean),
  );
  expect(rendered).toEqual(seeded);

  await quickDeckButton.click();
  const overlay = page.locator('#gameroad-quick-deck-overlay-root [data-quick-deck-overlay="open"]');
  await expect(overlay).toBeVisible();
  await expect(page.locator('#gameroad-quick-deck-overlay-root .gameroadQuickDeckSummary')).toHaveText(`${rendered.length}枚`);

  const projected = await page.locator('#gameroad-quick-deck-overlay-root .gameroadQuickDeckCard').evaluateAll((cards) => (
    cards.flatMap((card) => Array(Number(card.querySelector('[data-quantity]')?.dataset.quantity || 1)).fill(card.dataset.cardId))
  ));
  expect(projected).toEqual(rendered);

  await overlay.click({ position: { x: 5, y: 5 } });
  await expect(overlay).toHaveCount(0);

  await quickDeckButton.click();
  await expect(page.locator('#gameroad-quick-deck-overlay-root [data-quick-deck-overlay="open"]')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#gameroad-quick-deck-overlay-root [data-quick-deck-overlay="open"]')).toHaveCount(0);
});
