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

test('Cards collection right swipe adds once while non-command gestures and 40-card overflow do not mutate', async ({ page }) => {
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
  expect(await snapshot(), 'left swipe on a card absent from the deck does not underflow the deck').toEqual(before);

  await swipe(cardId, 8, 64, 12);
  expect(await snapshot(), 'vertical swipe is scrolling intent, not a deck command').toEqual(before);

  await swipe(cardId, 30, 0, 13);
  expect(await snapshot(), 'short right movement stays below the command threshold').toEqual(before);

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

const prepareCardsGestureContract = async (page) => {
  const response = await page.goto('/browser/GAMEROAD.html', { waitUntil: 'load' });
  expect(response?.ok()).toBeTruthy();
  await page.waitForFunction(() => Boolean(globalThis.__GAMEROAD_TEST__));
  await page.evaluate(() => {
    const t = globalThis.__GAMEROAD_TEST__;
    t.state.deckDraft.main.splice(0);
    t.state.deckDraft.ex.splice(0);
  });
  const control = page.locator('.homePadChoice[data-home-target="cards"]:visible').first();
  await expect(control).toBeVisible();
  await control.click();
  await page.waitForFunction(() => (
    globalThis.GAMEROAD_NAV_QA.snapshot().screen === 'cards'
    && globalThis.GAMEROAD_SCREEN_TRANSITION.getState().phase === 'IDLE'
  ));
  await expect(page.locator('#collectionGrid .slot.live.cardFace').first()).toBeVisible();
};

const deckDraftSnapshot = (page) => page.evaluate(() => {
  const t = globalThis.__GAMEROAD_TEST__;
  return { main: [...t.state.deckDraft.main], ex: [...t.state.deckDraft.ex] };
});

const outsideMainCardId = (page) => page.evaluate(() => {
  const t = globalThis.__GAMEROAD_TEST__;
  const occupied = new Set([...t.state.deckDraft.main, ...t.state.deckDraft.ex]);
  const card = t.deckPublic().find((entry) => entry.slot === 'main' && !occupied.has(entry.id));
  if (!card) throw new Error('no public main-deck card outside current draft');
  return card.id;
});

const collectionCard = (page, cardId) => page.locator(`#collectionGrid .slot.live.cardFace[data-id="${cardId}"]`).first();
const deckCard = (page, cardId) => page.locator(`#deckSlots .slot.live.cardFace[data-id="${cardId}"], #exDeckSlots .slot.live.cardFace[data-id="${cardId}"]`).first();

const dispatchTouchSwipe = async (locator, { dx, dy = 0, pointerId, cancel = false }) => {
  await expect(locator).toBeVisible();
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  const startX = box.x + Math.max(12, Math.min(box.width * 0.3, box.width - 12));
  const startY = box.y + Math.max(12, Math.min(box.height * 0.5, box.height - 12));
  const base = { pointerId, pointerType: 'touch', isPrimary: true, button: 0, clientX: startX, clientY: startY };
  await locator.dispatchEvent('pointerdown', { ...base, buttons: 1 });
  await locator.dispatchEvent('pointermove', { ...base, buttons: 1, clientX: startX + dx, clientY: startY + dy });
  if (cancel) {
    await locator.dispatchEvent('pointercancel', { ...base, buttons: 0, clientX: startX + dx, clientY: startY + dy });
  } else {
    await locator.dispatchEvent('pointerup', { ...base, buttons: 0, clientX: startX + dx, clientY: startY + dy });
  }
  await locator.page().waitForTimeout(80);
};

const visibleResponseSignals = (page) => page.evaluate(() => {
  const selector = [
    '[role="status"]',
    '[aria-live]',
    '.toast',
    '#toast',
    '[id*="toast" i]',
    '[class*="toast" i]',
    '[data-feedback]',
    '[data-status-message]',
  ].join(',');
  const visible = (element) => {
    const style = getComputedStyle(element);
    const box = element.getBoundingClientRect();
    return style.display !== 'none'
      && style.visibility !== 'hidden'
      && Number(style.opacity || 1) > 0
      && box.width > 0
      && box.height > 0;
  };
  return [...document.querySelectorAll(selector)]
    .filter(visible)
    .map((element) => ({
      id: element.id || '',
      className: String(element.className || ''),
      role: element.getAttribute('role') || '',
      ariaLive: element.getAttribute('aria-live') || '',
      text: (element.textContent || '').trim(),
    }))
    .filter((signal) => signal.text || signal.role || signal.ariaLive);
});

const addByCollectionRightSwipe = async (page, cardId, pointerId) => {
  const before = await deckDraftSnapshot(page);
  await dispatchTouchSwipe(collectionCard(page, cardId), { dx: 64, dy: 4, pointerId });
  const after = await deckDraftSnapshot(page);
  expect(after.main).toContain(cardId);
  expect(after.main).toHaveLength(before.main.length + 1);
};

test('Cards collection tap inspects without mutation and inspector CTA remains a simple-pointer add fallback', async ({ page }) => {
  await prepareCardsGestureContract(page);
  const cardId = await outsideMainCardId(page);
  const before = await deckDraftSnapshot(page);

  await collectionCard(page, cardId).click();
  expect(await deckDraftSnapshot(page), 'tap is inspect, not an implicit deck mutation').toEqual(before);
  await expect(page.locator('#r4PreviewClose')).toBeVisible();
  await expect(page.locator('#addSelectedCard')).toBeVisible();

  await page.locator('#addSelectedCard').click();
  const after = await deckDraftSnapshot(page);
  expect(after.main).toContain(cardId);
  expect(after.main).toHaveLength(before.main.length + 1);
});

test('Cards collection left swipe means -1 when the visible card is already in the current deck', async ({ page }) => {
  await prepareCardsGestureContract(page);
  const cardId = await outsideMainCardId(page);
  await addByCollectionRightSwipe(page, cardId, 31);

  await dispatchTouchSwipe(collectionCard(page, cardId), { dx: -64, pointerId: 32 });
  const after = await deckDraftSnapshot(page);
  expect(after.main, 'the same visible card uses left = -1 on the Collection surface').not.toContain(cardId);
});

test('Cards committed collection left swipe at zero does not underflow and still acknowledges the recognized -1 attempt', async ({ page }) => {
  await prepareCardsGestureContract(page);
  const cardId = await outsideMainCardId(page);
  const beforeDeck = await deckDraftSnapshot(page);
  const beforeSignals = await visibleResponseSignals(page);

  await dispatchTouchSwipe(collectionCard(page, cardId), { dx: -64, pointerId: 33 });

  expect(await deckDraftSnapshot(page), 'removing an absent card cannot underflow the deck').toEqual(beforeDeck);
  const afterSignals = await visibleResponseSignals(page);
  expect(afterSignals, 'a committed, recognized -1 attempt must not be a silent no-op').not.toEqual(beforeSignals);
});

test('Cards deck surface uses left = -1, while tap inspects without destructive mutation', async ({ page }) => {
  await prepareCardsGestureContract(page);
  const leftCardId = await outsideMainCardId(page);
  await addByCollectionRightSwipe(page, leftCardId, 41);

  await dispatchTouchSwipe(deckCard(page, leftCardId), { dx: -64, pointerId: 42 });
  expect((await deckDraftSnapshot(page)).main, 'left swipe removes exactly one from the Deck surface').not.toContain(leftCardId);

  const tapCardId = await outsideMainCardId(page);
  await addByCollectionRightSwipe(page, tapCardId, 43);
  const beforeTap = await deckDraftSnapshot(page);
  await deckCard(page, tapCardId).click();
  expect(await deckDraftSnapshot(page), 'deck-card tap is inspect, not remove').toEqual(beforeTap);
  await expect(page.locator('#r4PreviewClose')).toBeVisible();
});

test('Cards deck right swipe keeps +1 semantics: Highlander rejection is non-mutating but visibly acknowledged', async ({ page }) => {
  await prepareCardsGestureContract(page);
  const cardId = await outsideMainCardId(page);
  await addByCollectionRightSwipe(page, cardId, 51);
  const beforeDeck = await deckDraftSnapshot(page);
  const beforeSignals = await visibleResponseSignals(page);

  await dispatchTouchSwipe(deckCard(page, cardId), { dx: 64, pointerId: 52 });

  expect(await deckDraftSnapshot(page), 'current Highlander legality still prevents a duplicate').toEqual(beforeDeck);
  const afterSignals = await visibleResponseSignals(page);
  expect(afterSignals, 'right = +1 is still recognized on Deck even when the rule validator rejects +1').not.toEqual(beforeSignals);
});

test('Cards cancelled horizontal gesture is not a command and cannot mutate the deck', async ({ page }) => {
  await prepareCardsGestureContract(page);
  const cardId = await outsideMainCardId(page);
  const before = await deckDraftSnapshot(page);

  await dispatchTouchSwipe(collectionCard(page, cardId), { dx: 72, pointerId: 61, cancel: true });

  expect(await deckDraftSnapshot(page), 'pointercancel cancels the pending gesture').toEqual(before);
});

test('Cards duplicate and 40-card right-swipe rejections preserve state and expose a response instead of silence', async ({ page }) => {
  await prepareCardsGestureContract(page);
  const cardId = await outsideMainCardId(page);
  await addByCollectionRightSwipe(page, cardId, 71);

  const duplicateBefore = await deckDraftSnapshot(page);
  const duplicateSignalsBefore = await visibleResponseSignals(page);
  await dispatchTouchSwipe(collectionCard(page, cardId), { dx: 64, pointerId: 72 });
  expect(await deckDraftSnapshot(page), 'duplicate rejection preserves the current draft').toEqual(duplicateBefore);
  expect(await visibleResponseSignals(page), 'duplicate rejection returns visible/status feedback').not.toEqual(duplicateSignalsBefore);

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
    return { main, setValidation };
  });
  expect(full.main).toHaveLength(40);

  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(globalThis.__GAMEROAD_TEST__));
  const control = page.locator('.homePadChoice[data-home-target="cards"]:visible').first();
  await control.click();
  await page.waitForFunction(() => globalThis.GAMEROAD_NAV_QA.snapshot().screen === 'cards');
  const overflowCardId = await outsideMainCardId(page);
  const fullBefore = await deckDraftSnapshot(page);
  const fullSignalsBefore = await visibleResponseSignals(page);

  await dispatchTouchSwipe(collectionCard(page, overflowCardId), { dx: 64, pointerId: 73 });

  expect(await deckDraftSnapshot(page), '40-card rejection preserves the full draft').toEqual(fullBefore);
  expect(await visibleResponseSignals(page), '40-card rejection returns visible/status feedback').not.toEqual(fullSignalsBefore);
});
