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

test('Home to Cards low-perf profile bypasses the heavy 2.5D layer', async ({ page }) => {
  const response = await page.goto('/browser/GAMEROAD.html', { waitUntil: 'load' });
  expect(response?.ok()).toBeTruthy();
  await page.waitForFunction(() => Boolean(globalThis.GAMEROAD_HOMECARDS_2P5D));

  const result = await page.evaluate(async () => {
    const presentation = globalThis.GAMEROAD_HOMECARDS_2P5D;
    const module = await import('/browser/home-cards-2p5d-presentation.mjs');
    const before = presentation.snapshot();
    const context = { from: 'home', to: 'cards', motionProfile: 'reduced', lowPerf: true };
    await module.runHomeCardsPresentationPhase('PREPARE', context);
    const prepared = presentation.snapshot();
    await module.runHomeCardsPresentationPhase('SETTLE', context);
    return { before, prepared, settled: presentation.snapshot() };
  });

  expect(result.prepared.lastProfile).toBe('lowperf-static');
  expect(result.prepared.startedCount).toBe(result.before.startedCount);
  expect(result.prepared.bypassedCount).toBe(result.before.bypassedCount + 1);
  expect(result.prepared.stagePresent).toBe(false);
  expect(result.settled.completedCount).toBe(result.before.completedCount + 1);
  expect(result.settled.lastPhase).toBe('IDLE');
  expect(result.settled.stagePresent).toBe(false);
});

test('Home to Cards keeps semantic navigation when the optional source visual is unavailable', async ({ page }) => {
  const response = await page.goto('/browser/GAMEROAD.html', { waitUntil: 'load' });
  expect(response?.ok()).toBeTruthy();
  await page.waitForFunction(() => Boolean(
    globalThis.GAMEROAD_HOMECARDS_2P5D
    && globalThis.GAMEROAD_SCREEN_TRANSITION
    && globalThis.GAMEROAD_NAV_QA,
  ));
  await expect(page.locator('section[data-screen="home"]')).toBeVisible();

  const before = await page.evaluate(() => globalThis.GAMEROAD_HOMECARDS_2P5D.snapshot());
  const cards = page.locator('.homePadChoice[data-home-target="cards"]:visible').first();
  await expect(cards).toBeVisible();
  await page.evaluate(() => {
    const button = document.querySelector('.homePadChoice[data-home-target="cards"]');
    const visual = button?.querySelector('.codexPadArt, img, svg, canvas');
    if (!(visual instanceof HTMLElement || visual instanceof SVGElement)) {
      throw new Error('Home Cards optional visual is unavailable before fallback simulation');
    }
    visual.style.display = 'none';
  });

  await cards.click();
  await page.waitForFunction(() => (
    globalThis.GAMEROAD_NAV_QA.snapshot().screen === 'cards'
    && globalThis.GAMEROAD_SCREEN_TRANSITION.getState().phase === 'IDLE'
  ));

  const after = await page.evaluate(() => globalThis.GAMEROAD_HOMECARDS_2P5D.snapshot());
  expect(after.startedCount).toBe(before.startedCount);
  expect(after.bypassedCount).toBeGreaterThan(before.bypassedCount);
  expect(after.completedCount).toBeGreaterThan(before.completedCount);
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
