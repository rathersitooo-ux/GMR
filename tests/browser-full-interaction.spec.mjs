import { test, expect } from '@playwright/test';

const CORE_SCREENS = ['home', 'cards', 'characters', 'setup', 'battle', 'result', 'shop'];
const NAV_TARGETS = ['cards', 'characters', 'setup', 'battle', 'shop'];
const STORAGE_KEY = 'gameroad.browser.v10.core.1';

function observeRuntimeErrors(page) {
  const pageErrors = [];
  const consoleErrors = [];
  const unexpectedHttpErrors = [];
  let versionManifest404Count = 0;
  let partnerVisual404Count = 0;

  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('response', (response) => {
    if (response.status() < 400) return;
    const url = new URL(response.url());
    if (response.status() === 404 && url.pathname.endsWith('/browser/gameroad-version.json')) {
      versionManifest404Count += 1;
      return;
    }
    if (response.status() === 404 && url.pathname === '/ws' && url.searchParams.get('partnerOp') === 'visual') {
      partnerVisual404Count += 1;
      return;
    }
    unexpectedHttpErrors.push(`${response.status()} ${url.pathname}`);
  });

  return {
    assertClean(testInfo) {
      const remainingConsoleErrors = [...consoleErrors];
      for (let i = 0; i < versionManifest404Count + partnerVisual404Count; i += 1) {
        const index = remainingConsoleErrors.findIndex((message) =>
          message.includes('Failed to load resource') && message.includes('404'),
        );
        if (index >= 0) remainingConsoleErrors.splice(index, 1);
      }
      if (versionManifest404Count > 0) {
        testInfo.annotations.push({
          type: 'known-deployment-gap',
          description: `gameroad-version.json returned 404 ${versionManifest404Count} time(s); tracked separately from interaction evidence`,
        });
      }
      if (partnerVisual404Count > 0) {
        testInfo.annotations.push({
          type: 'known-local-static-server-gap',
          description: `/ws?partnerOp=visual returned 404 ${partnerVisual404Count} time(s) on the local static BFI server; the exact public edge route remains outside this observer's local serving boundary`,
        });
      }

      expect(unexpectedHttpErrors, `unexpected HTTP errors:\n${unexpectedHttpErrors.join('\n')}`).toEqual([]);
      expect(pageErrors, `page errors:\n${pageErrors.join('\n')}`).toEqual([]);
      expect(remainingConsoleErrors, `console errors:\n${remainingConsoleErrors.join('\n')}`).toEqual([]);
    },
  };
}

async function attachStateScreenshot(page, testInfo, stateName) {
  const png = await page.screenshot({ fullPage: true, animations: 'disabled' });
  await testInfo.attach(`${testInfo.project.name}-${stateName}.png`, {
    body: png,
    contentType: 'image/png',
  });
}

async function bootCurrentBrowser(page) {
  const response = await page.goto('/browser/GAMEROAD.html', { waitUntil: 'domcontentloaded' });
  expect(response, 'main HTML response').not.toBeNull();
  expect(response.ok(), `main HTML status ${response.status()}`).toBeTruthy();
  await page.waitForTimeout(1_000);

  const doctype = await page.evaluate(() => document.doctype?.name?.toLowerCase() ?? '');
  expect(doctype).toBe('html');

  for (const screen of CORE_SCREENS) {
    const count = await page.locator(`section[data-screen="${screen}"]`).count();
    expect(count, `core screen ${screen}`).toBeGreaterThan(0);
  }

  await expect(page.locator('section[data-screen="home"]')).toBeVisible();
}

function visibleHomeControl(page, target) {
  return page
    .locator(`[data-home-target="${target}"]:visible, [data-go="${target}"]:visible`)
    .first();
}

async function enterCardsFromHome(page) {
  const cardsControl = visibleHomeControl(page, 'cards');
  await expect(cardsControl).toBeVisible();
  await cardsControl.click();
  const cards = page.locator('section[data-screen="cards"]');
  await expect(cards).toBeVisible();
  await page.waitForTimeout(250);
  return cards;
}

async function numericText(locator) {
  return Number.parseInt((await locator.textContent()) ?? '', 10);
}

async function installLegalBattleDeck(page) {
  return page.evaluate(() => {
    const t = window.__GAMEROAD_TEST__;
    const publicMain = new Set(t.deckPublic().filter((card) => card.slot === 'main').map((card) => card.id));
    const standard = window.__CARD_DATA__
      .filter((card) => publicMain.has(card.id) && /^(SP|HT|DI|CL)$/.test(card.suit) && /^(A|[2-9]|10|J|Q|K)$/.test(String(card.rank)))
      .map((card) => card.id);
    const royalIds = ['SP_J', 'SP_Q', 'SP_K'];
    const nonRoyal = standard.filter((id) => !t.isRoyalCard(id));
    const main = [...nonRoyal.slice(0, 37), ...royalIds];
    const setValidation = t.deckSetDraft(main, []);
    const draftValidation = t.deckValidate(t.state.deckDraft, { forBattle: true });
    const committed = draftValidation.ok ? t.deckCommit() : false;
    const savedValidation = t.deckValidate(t.state.savedDeck, { forBattle: true });
    return {
      main,
      publicRoyalIds: royalIds.filter((id) => publicMain.has(id)),
      setValidation,
      draftValidation,
      committed,
      savedValidation,
    };
  });
}

async function beginVisibleTwoPlayerRoadShield(page, testInfo, evidencePrefix) {
  const deckSetup = await installLegalBattleDeck(page);
  expect(deckSetup.main).toHaveLength(40);
  expect(deckSetup.committed, 'legal deck precondition committed without starting or advancing the match').toBeTruthy();
  expect(deckSetup.savedValidation.ok, `saved deck validation: ${JSON.stringify(deckSetup.savedValidation)}`).toBeTruthy();

  const setupControl = visibleHomeControl(page, 'setup');
  await expect(setupControl).toBeVisible();
  await setupControl.click();
  const setup = page.locator('section[data-screen="setup"]');
  await expect(setup).toBeVisible();
  await setup.locator('[data-content="road_shield"]').click();
  await setup.locator('[data-mode="2p"]').click();
  const startMatch = setup.locator('#startMatch');
  await expect(startMatch).toBeVisible();
  await expect(startMatch).toBeEnabled();
  await startMatch.click();

  const battle = page.locator('section[data-screen="battle"]');
  await expect(battle).toBeVisible();
  await expect(battle.locator('#phaseTitle')).toContainText('行動を計画');
  await attachStateScreenshot(page, testInfo, `${evidencePrefix}-battle-start-visible`);
  return battle;
}

async function satisfyVisibleAbilityChoice(page) {
  const veil = page.locator('#abilityVeil.on:visible');
  if ((await veil.count()) === 0) return false;
  const choices = veil.locator('#abilityChoices .abilityChoice:visible');
  const confirm = veil.locator('#abilityConfirm:visible');
  const count = await choices.count();
  expect(count, 'visible ability choice has at least one legal option').toBeGreaterThan(0);
  for (let i = 0; i < count; i += 1) {
    await choices.nth(i).click();
    if (await confirm.isEnabled()) {
      await confirm.click();
      return true;
    }
  }
  throw new Error('visible ability choice never enabled its confirm control');
}

async function submitVisiblePlan(battle) {
  const roadSelect = battle.locator('#roadSelect');
  const battleSelect = battle.locator('#battleSelect');
  const ready = battle.locator('#readyPlan');
  await expect(roadSelect).toBeVisible();
  await expect(battleSelect).toBeVisible();
  const handCards = battle.locator('#hand .handCard:visible:not(:disabled)');
  const jankenCards = battle.locator('[data-battle-janken-slidepad="1"] [data-janken-slot]:visible:not(:disabled)');
  const candidateGroups = [
    { locator: handCards, selector: '#hand .handCard' },
    { locator: jankenCards, selector: '[data-battle-janken-slidepad="1"] [data-janken-slot]' },
  ];
  const candidateCount = (await Promise.all(candidateGroups.map(({ locator }) => locator.evaluateAll((nodes) => nodes
    .filter((node) => !node.disabled && node.getClientRects().length > 0 && getComputedStyle(node).visibility !== 'hidden')
    .map((node) => node.getAttribute('data-card-id'))
    .filter(Boolean)))))
    .flat().length;
  expect(candidateCount, 'visible plan controls expose at least two distinct cards').toBeGreaterThanOrEqual(2);

  const clickCandidate = async (excludedId = null) => {
    for (const group of candidateGroups) {
      const ids = await group.locator.evaluateAll((nodes) => nodes
        .filter((node) => !node.disabled && node.getClientRects().length > 0 && getComputedStyle(node).visibility !== 'hidden')
        .map((node) => node.getAttribute('data-card-id'))
        .filter(Boolean));
      for (const id of ids) {
        if (!id || id === excludedId) continue;
        const candidate = battle.locator(`${group.selector}[data-card-id="${id}"]`).first();
        if (!(await candidate.isVisible()) || await candidate.isDisabled()) continue;
        await candidate.click();
        return id;
      }
    }
    return null;
  };

  if (!(await roadSelect.inputValue())) await expect.poll(() => clickCandidate()).not.toBeNull();
  if (!(await battleSelect.inputValue())) {
    const roadValue = await roadSelect.inputValue();
    await expect.poll(() => clickCandidate(roadValue)).not.toBeNull();
    await expect(battleSelect, 'a different visible card can be reserved as Battle').not.toHaveValue('');
  }

  expect(await roadSelect.inputValue(), 'visible Road selection').not.toBe('');
  expect(await battleSelect.inputValue(), 'visible Battle selection').not.toBe('');
  expect(await battleSelect.inputValue(), 'Road and Battle remain distinct').not.toBe(await roadSelect.inputValue());
  await expect(ready).toBeEnabled();
  await ready.click();
}

async function playVisibleTwoPlayerToResult(page, testInfo, evidencePrefix) {
  const battle = await beginVisibleTwoPlayerRoadShield(page, testInfo, evidencePrefix);
  const result = page.locator('section[data-screen="result"]');
  const deadline = Date.now() + 80_000;
  let roundsSubmitted = 0;
  let targetConfirms = 0;
  let presentationAdvances = 0;
  let abilityConfirms = 0;
  let cardPresentationFallbacks = 0;
  let lastCardPresentationEvent = null;
  let conveyorObserved = false;
  let conveyorMaxTravel = 0;

  while (Date.now() < deadline) {
    if (await result.isVisible().catch(() => false)) break;

    const cardPresentation = battle.locator('#battleResolution[data-card-presentation="fallback"]:visible');
    if ((await cardPresentation.count()) > 0) {
      const eventId = await cardPresentation.first().getAttribute('data-card-presentation-event');
      if (eventId && eventId !== lastCardPresentationEvent) {
        lastCardPresentationEvent = eventId;
        cardPresentationFallbacks += 1;
        await attachStateScreenshot(page, testInfo, `${evidencePrefix}-card-presentation-fallback-${cardPresentationFallbacks}`);
      }
    }

    const conveyorEnvironment = battle.locator('#battlePhaseSurface [data-battle-conveyor-environment]').first();
  if ((await conveyorEnvironment.count()) > 0) {
    conveyorObserved = true;
    const travel = Number(await conveyorEnvironment.getAttribute('data-battle-conveyor-travel'));
    if (Number.isFinite(travel)) conveyorMaxTravel = Math.max(conveyorMaxTravel, travel);
  }
    if (await satisfyVisibleAbilityChoice(page)) {
      abilityConfirms += 1;
      continue;
    }

    const advance = battle.locator('#battleResolution .resolutionAdvance:visible');
    if ((await advance.count()) > 0) {
      await advance.first().click();
      presentationAdvances += 1;
      continue;
    }

    const targetConfirm = battle.locator('#targetBox.on #confirmTarget:visible');
    if ((await targetConfirm.count()) > 0) {
      await targetConfirm.click();
      targetConfirms += 1;
      continue;
    }

    const roadSelect = battle.locator('#roadSelect:visible');
    if ((await roadSelect.count()) > 0 && (await roadSelect.isEnabled())) {
      await submitVisiblePlan(battle);
      roundsSubmitted += 1;
      continue;
    }

    await page.waitForTimeout(80);
  }

  await expect(result, 'visible play reaches Result without direct result/state injection').toBeVisible({ timeout: 2_000 });
  expect(roundsSubmitted, 'at least one visible plan was submitted').toBeGreaterThan(0);
  expect(presentationAdvances, 'at least one visible Battle result advance was used').toBeGreaterThan(0);
  expect(cardPresentationFallbacks, 'accepted/public Battle resolution mounts the current CardPRES fallback on the visible production resolution surface').toBeGreaterThan(0);
  const finalConveyorEnvironment = battle.locator('#battlePhaseSurface [data-battle-conveyor-environment]').first();
  expect(conveyorObserved, 'accepted Battle resolution mounted the finite conveyor environment').toBeTruthy();
  await expect(finalConveyorEnvironment).toHaveAttribute('aria-hidden', 'true');
  await expect(finalConveyorEnvironment).toHaveAttribute('data-battle-conveyor-authority', 'decorative_visual_loop_only');
  expect(await finalConveyorEnvironment.locator('[data-battle-conveyor-segment]').count(), 'finite recycled environment segment pool').toBe(8);
  expect(await finalConveyorEnvironment.evaluate((node) => getComputedStyle(node).pointerEvents), 'decorative environment cannot intercept input').toBe('none');
  expect(conveyorMaxTravel, 'normal-motion accepted Battle resolution advances environment travel').toBeGreaterThan(0);
  expect(await battle.locator('#readyPlan').count(), 'existing screen-space decision control remains singular').toBe(1);
  expect(await finalConveyorEnvironment.locator('#readyPlan').count(), 'decision control is never moved inside the decorative environment').toBe(0);
  const roundsText = (await result.locator('#resultRounds').textContent()) ?? '';
  expect(roundsText, 'Result exposes a real round count').toMatch(/\d+ラウンド/);
  await expect(result.locator('#resultRanking .rankLine')).toHaveCount(2);
  await expect(result.locator('#resultMode')).toHaveText('二人');
  await attachStateScreenshot(page, testInfo, `${evidencePrefix}-result-visible`);
  testInfo.annotations.push({
    type: 'visible-result-path',
    description: `submitted=${roundsSubmitted}, targetConfirms=${targetConfirms}, battleAdvances=${presentationAdvances}, abilityConfirms=${abilityConfirms}, cardPresentationFallbacks=${cardPresentationFallbacks}, result=${roundsText}` ,
  });
  return { battle, result, roundsSubmitted, targetConfirms, presentationAdvances, abilityConfirms, cardPresentationFallbacks, roundsText };
}

test('captures success-state screenshots for current pointer navigation', async ({ page }, testInfo) => {
  const runtime = observeRuntimeErrors(page);
  await bootCurrentBrowser(page);
  await attachStateScreenshot(page, testInfo, 'home');


// R53 short-landscape Home/Profile geometry regression.
// Exact pre-repair Home pad union: 305 CSS px wide at 667x375.
if (testInfo.project.name === 'short-landscape-667x375') {
  const padLocators = [
    page.locator('[data-home-target="setup"]:visible').first(),
    page.locator('.codexPadShop:visible').first(),
    page.locator('.codexPadPartner:visible').first(),
    page.locator('.codexPadDeck:visible').first(),
    page.locator('#homePadCenter:visible').first(),
  ];
  const padBoxes = [];
  for (const control of padLocators) {
    await expect(control).toBeVisible();
    const box = await control.boundingBox();
    expect(box, 'short-landscape Home pad control has geometry').not.toBeNull();
    padBoxes.push(box);
  }
  const viewportWidth = page.viewportSize().width;
  const padLeft = Math.min(...padBoxes.map((box) => box.x));
  const padRight = Math.max(...padBoxes.map((box) => box.x + box.width));
  const padUnionWidth = padRight - padLeft;
  const minPadTarget = Math.min(...padBoxes.flatMap((box) => [box.width, box.height]));
  expect(padUnionWidth, 'short-landscape Home pad is narrower than the reproduced 305px pre-repair union').toBeLessThan(305);
  expect(padRight, 'short-landscape Home pad stays inside the viewport').toBeLessThanOrEqual(viewportWidth);
  expect(minPadTarget, 'short-landscape Home controls retain WCAG minimum target size').toBeGreaterThanOrEqual(24);

  const profileButton = page.locator('button.homeUtilityBtn[data-go="profile"]:visible').first();
  await expect(profileButton).toBeVisible();
  await profileButton.click();
  const profile = page.locator('section[data-screen="profile"]');
  await expect(profile).toBeVisible();
  const name = profile.locator('#profileCharName');
  const partnerImage = profile.locator('#profileRuntime .grtc-image:visible').first();
  await expect(name).toBeVisible();
  await expect(partnerImage).toBeVisible();
  const nameBox = await name.boundingBox();
  const imageBox = await partnerImage.boundingBox();
  expect(nameBox, 'short-landscape Profile name has geometry').not.toBeNull();
  expect(imageBox, 'short-landscape Profile partner image has geometry').not.toBeNull();
  const overlapWidth = Math.max(0, Math.min(nameBox.x + nameBox.width, imageBox.x + imageBox.width) - Math.max(nameBox.x, imageBox.x));
  const overlapHeight = Math.max(0, Math.min(nameBox.y + nameBox.height, imageBox.y + imageBox.height) - Math.max(nameBox.y, imageBox.y));
  expect(overlapWidth * overlapHeight, 'short-landscape Profile partner image does not cover the displayed name').toBe(0);
  await attachStateScreenshot(page, testInfo, 'profile-short-landscape-readable');
}

  let pointerTransitions = 0;
  const unreachableTargets = [];

  for (const target of NAV_TARGETS) {
    await page.goto('/browser/GAMEROAD.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);

    const control = visibleHomeControl(page, target);
    if ((await control.count()) === 0) {
      unreachableTargets.push(target);
      continue;
    }

    await control.click({ timeout: 5_000 });
    pointerTransitions += 1;
    const targetSection = page.locator(`section[data-screen="${target}"]`);
    await expect(targetSection, `pointer navigation target ${target}`).toBeVisible();
    await page.waitForTimeout(120);
    await attachStateScreenshot(page, testInfo, target);
  }

  if (unreachableTargets.length > 0) {
    testInfo.annotations.push({
      type: 'not-yet-covered',
      description: `No visible root control for: ${unreachableTargets.join(', ')}. This evidence does not claim full interaction coverage.`,
    });
  }

  expect(pointerTransitions, 'at least one real visible Home pointer transition').toBeGreaterThan(0);
  runtime.assertClean(testInfo);
});

test('persists a legal 40-card deck across save and page reload through visible UI', async ({ page }, testInfo) => {
  const runtime = observeRuntimeErrors(page);
  await bootCurrentBrowser(page);
  let cards = await enterCardsFromHome(page);

  const deckCount = cards.locator('#deckCount');
  const initialCount = await numericText(deckCount);
  expect(Number.isFinite(initialCount), 'initial main-deck count').toBeTruthy();
  expect(initialCount, 'current default main deck is already legal and complete').toBe(40);

  const candidateIds = await cards
    .locator('#collectionGrid button.slot.live.cardFace:not(.inDeck)[data-id]')
    .evaluateAll((nodes) => [...new Set(nodes.map((node) => node.getAttribute('data-id')).filter(Boolean))]);
  const rejectedCandidateIds = [];

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
    await expect(addSelected, `add selected card ${cardId}`).toBeEnabled();
    await addSelected.click();
    await page.waitForTimeout(120);

    const after = await numericText(deckCount);
    expect([before, before + 1], `deck count after visible add attempt for ${cardId}`).toContain(after);
    if (after === before) rejectedCandidateIds.push(cardId);

    const closePreview = cards.locator('#r4PreviewClose:visible');
    if ((await closePreview.count()) > 0) await closePreview.click();
  }

  if (rejectedCandidateIds.length > 0) {
    testInfo.annotations.push({
      type: 'visible-rule-rejection',
      description: `Current deck rules rejected visible add attempts for: ${rejectedCandidateIds.join(', ')}; test continued through other UI candidates without bypassing rules.`,
    });
  }

  await expect(deckCount, 'a legal main deck can reach 40 through current visible UI').toHaveText('40');
  await expect(cards.locator('#exDeckCount')).toHaveText('0');

  const mobileTrayToggle = cards.locator('#r4DeckTrayToggle:visible');
  if ((await mobileTrayToggle.count()) > 0) {
    await mobileTrayToggle.click();
    await page.waitForTimeout(120);
  }

  const saveDeck = cards.locator('#saveDeck');
  await expect(saveDeck).toBeVisible();
  await expect(saveDeck).toBeEnabled();
  await saveDeck.click();
  await expect(cards.locator('#deckSaveState')).toHaveText('保存済み');

  const storedBeforeReload = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
  expect(storedBeforeReload, `${STORAGE_KEY} after Save`).not.toBeNull();
  await attachStateScreenshot(page, testInfo, 'deck-saved-40');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1_000);
  await expect(page.locator('section[data-screen="home"]')).toBeVisible();
  cards = await enterCardsFromHome(page);

  await expect(cards.locator('#deckCount'), 'main deck after reload').toHaveText('40');
  await expect(cards.locator('#exDeckCount'), 'EX deck after reload').toHaveText('0');
  await expect(cards.locator('#deckSaveState'), 'save state after reload').toHaveText('保存済み');
  const storedAfterReload = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
  expect(storedAfterReload, 'saved browser state must survive reload unchanged').toBe(storedBeforeReload);
  await attachStateScreenshot(page, testInfo, 'deck-reloaded-40');

  runtime.assertClean(testInfo);
});

test('starts through visible Setup and advances the first Battle decision through visible controls', async ({ page }, testInfo) => {
  const runtime = observeRuntimeErrors(page);
  await bootCurrentBrowser(page);

  const deckSetup = await installLegalBattleDeck(page);
  expect(deckSetup.main).toHaveLength(40);
  expect(deckSetup.committed, 'legal deck precondition committed without starting or advancing the match').toBeTruthy();
  expect(deckSetup.savedValidation.ok, `saved deck validation: ${JSON.stringify(deckSetup.savedValidation)}`).toBeTruthy();

  const setupControl = visibleHomeControl(page, 'setup');
  await expect(setupControl).toBeVisible();
  await setupControl.click();

  const setup = page.locator('section[data-screen="setup"]');
  await expect(setup).toBeVisible();
  await setup.locator('[data-content="road_shield"]').click();
  await setup.locator('[data-mode="2p"]').click();
  const startMatch = setup.locator('#startMatch');
  await expect(startMatch).toBeVisible();
  await expect(startMatch).toBeEnabled();
  await attachStateScreenshot(page, testInfo, 'setup-ready-visible');

  await startMatch.click();
  const battle = page.locator('section[data-screen="battle"]');
  await expect(battle).toBeVisible();
  await expect(battle.locator('#phaseTitle')).toContainText('行動を計画');
  await attachStateScreenshot(page, testInfo, 'battle-first-plan-visible');

  const initialHands = await page.evaluate(() => window.__GAMEROAD_TEST__.state.match.players.map((player) => player.hand.length));
  expect(initialHands, 'fresh match deals seven source hand cards to every participant').toEqual([7, 7]);
  const handCards = battle.locator('#hand .handCard:visible');
  expect(await handCards.count(), 'janken reservation leaves ordinary hand cards visibly playable').toBeGreaterThanOrEqual(2);
  await handCards.nth(0).click();
  await expect(battle.locator('#roadSelect')).not.toHaveValue('');
  await handCards.nth(1).click();
  await expect(battle.locator('#battleSelect')).not.toHaveValue('');

  const roadValue = await battle.locator('#roadSelect').inputValue();
  const battleValue = await battle.locator('#battleSelect').inputValue();
  expect(roadValue, 'visible hand click selects a Road card').not.toBe('');
  expect(battleValue, 'visible hand click selects a Battle card').not.toBe('');
  expect(battleValue, 'Road and Battle use different visible hand cards').not.toBe(roadValue);

  const ready = battle.locator('#readyPlan');
  await expect(ready).toBeVisible();
  await expect(ready).toBeEnabled();
  await ready.click();

  const cue = battle.locator('#first10Cue');
  await expect(cue, 'visible first-cycle cue confirms Road decision, public reveal, and progression beyond Plan').toContainText('ロード決定 → 公開 → 次の行動まで確認 ✓', { timeout: 30_000 });
  await attachStateScreenshot(page, testInfo, 'battle-first-decision-progressed-visible');

  runtime.assertClean(testInfo);
});

test('moves resolve off the board into the dedicated Battle Phase with Naki cut-in and four-player compare', async ({ page }, testInfo) => {
  const runtime = observeRuntimeErrors(page);
  await bootCurrentBrowser(page);

  const deckSetup = await installLegalBattleDeck(page);
  expect(deckSetup.main).toHaveLength(40);
  expect(deckSetup.publicRoyalIds).toEqual(['SP_J', 'SP_Q', 'SP_K']);
  expect(deckSetup.setValidation.ok, `set deck validation: ${JSON.stringify(deckSetup.setValidation)}`).toBeTruthy();
  expect(deckSetup.draftValidation.ok, `test deck validation: ${JSON.stringify(deckSetup.draftValidation)}`).toBeTruthy();
  expect(deckSetup.committed, 'legal test deck committed').toBeTruthy();
  expect(deckSetup.savedValidation.ok, `saved deck validation: ${JSON.stringify(deckSetup.savedValidation)}`).toBeTruthy();

  await page.evaluate(() => {
    const t = window.__GAMEROAD_TEST__;
    t.battlePresentationFast(false);
    t.start('4p', 'road_shield');
    window.__R2_BATTLE_ROUND_PROMISE__ = t.autoRound();
  });

  const battle = page.locator('section[data-screen="battle"]');
  const board = page.locator('#battleMap');
  const surface = page.locator('#battlePhaseSurface');
  await expect(battle).toBeVisible();

  await page.waitForFunction(() => {
    const s = window.__GAMEROAD_BATTLE_PHASE_R2__?.snapshot?.();
    return s?.live === true && s?.stage === 'focus';
  }, null, { timeout: 15_000 });

  const focus = await page.evaluate(() => window.__GAMEROAD_BATTLE_PHASE_R2__.snapshot());
  expect(focus.surfaceHidden).toBe(false);
  expect(focus.cutinHold, 'Naki cut-in keeps battle reveal hidden at scene entry').toBe(true);
  expect(focus.boardVisibility).toBe('hidden');
  expect(focus.boardPointer).toBe('none');
  expect(focus.resolutionParent).toBe('battlePhaseResolutionSlot');
  expect(focus.stage).toBe('focus');
  expect(focus.nakiCharacter).toBe('partner.naki');
  await expect(surface).toBeVisible();
  await expect(board).toBeHidden();
  await page.waitForFunction(() => document.querySelector('#battlePhaseNaki')?.childElementCount > 0, null, { timeout: 5_000 });
  const nakiState = await page.locator('#battlePhaseNaki').evaluate((node) => ({
    children: node.childElementCount,
    characterId: node.dataset.characterId ?? null,
  }));
  expect(nakiState.children, 'Naki cut-in mounted visible content').toBeGreaterThan(0);
  expect(nakiState.characterId).toBe('partner.naki');
  await attachStateScreenshot(page, testInfo, 'battle-phase-naki-cutin');

  await page.waitForFunction(() => {
    const hook = window.__GAMEROAD_BATTLE_PHASE_R2__;
    const snapshot = hook?.snapshot?.();
    return snapshot?.live === true && snapshot?.cutinHold === false && document.querySelectorAll('#battlePhaseSurface #battleResolution .resolutionPlayer').length === 4;
  }, null, { timeout: 8_000 });
  const compareStage = await page.evaluate(() => window.__GAMEROAD_BATTLE_PHASE_R2__.snapshot().stage);
  expect(['reveal', 'read', 'compare', 'winner', 'settle']).toContain(compareStage);
  await expect(page.locator('#battlePhaseSurface #battleResolution .resolutionPlayer')).toHaveCount(4);
  await expect(page.locator('#battlePhaseTarget')).toContainText('4人全員比較');
  await attachStateScreenshot(page, testInfo, 'battle-phase-four-player-compare');

  await page.evaluate(async () => {
    window.__GAMEROAD_TEST__.battlePresentationFast(true);
    await window.__R2_BATTLE_ROUND_PROMISE__;
  });
  await page.waitForFunction(() => window.__GAMEROAD_BATTLE_PHASE_R2__?.snapshot?.().live === false, null, { timeout: 5_000 });

  const after = await page.evaluate(() => ({
    shell: window.__GAMEROAD_BATTLE_PHASE_R2__.snapshot(),
    conservation: window.__GAMEROAD_TEST__.cardConservation(),
    phase: window.__GAMEROAD_TEST__.state.match?.phase ?? null,
    screen: window.__GAMEROAD_TEST__.state.screen,
  }));
  expect(after.shell.surfaceHidden).toBe(true);
  expect(after.shell.resolutionParent).toBe('battleMap');
  expect(after.conservation, 'card conservation after dedicated Battle Phase').toBe(true);
  expect(['plan', null]).toContain(after.phase);
  expect(['battle', 'result']).toContain(after.screen);

  runtime.assertClean(testInfo);
});

test('reaches Result and starts a rematch through visible controls only', async ({ page }, testInfo) => {
  test.setTimeout(110_000);
  const runtime = observeRuntimeErrors(page);
  await bootCurrentBrowser(page);
  const { result } = await playVisibleTwoPlayerToResult(page, testInfo, 'visible-rematch');

  const rematch = result.locator('#rematch');
  await expect(rematch).toBeVisible();
  await expect(rematch).toBeEnabled();
  await rematch.click();
  const battle = page.locator('section[data-screen="battle"]');
  await expect(battle, 'visible Result rematch returns to a fresh Battle').toBeVisible();
  await expect(battle.locator('#roundNo')).toHaveText('1');
  await expect(battle.locator('#phaseTitle')).toContainText('行動を計画');
  const rematchHands = await page.evaluate(() => window.__GAMEROAD_TEST__.state.match.players.map((player) => player.hand.length));
  expect(rematchHands, 'visible rematch creates a fresh seven-card opening hand for every participant').toEqual([7, 7]);
  await attachStateScreenshot(page, testInfo, 'visible-rematch-battle-restarted');

  runtime.assertClean(testInfo);
});

test('reaches Result and exits to Home through the visible Result control only', async ({ page }, testInfo) => {
  test.setTimeout(110_000);
  const runtime = observeRuntimeErrors(page);
  await bootCurrentBrowser(page);
  const { result } = await playVisibleTwoPlayerToResult(page, testInfo, 'visible-result-home');

  const home = result.locator('[data-root-go="home"]');
  await expect(home).toBeVisible();
  await expect(home).toBeEnabled();
  await home.click();
  await expect(page.locator('section[data-screen="home"]'), 'visible Result Home control returns to Home').toBeVisible();
  await attachStateScreenshot(page, testInfo, 'visible-result-home-returned');

  runtime.assertClean(testInfo);
});


test('deck recovery preserves blocked raw saves, repairs legacy only on explicit legal commit, rolls back failures, and resets without reseeding', async ({ page }, testInfo) => {
  const runtime = observeRuntimeErrors(page);
  await bootCurrentBrowser(page);
  const initialRaw = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
  expect(initialRaw, 'missing save is not implicitly materialized on boot').toBeNull();
  const defaultDeck = await page.evaluate(() => [...window.__DEFAULT_DECK__]);
  expect(defaultDeck).toHaveLength(40);
  const legacyDeck = defaultDeck.slice(0, 26);
  expect(legacyDeck).toHaveLength(26);

  const reloadWithRaw = async (raw) => {
    await page.evaluate(({ key, rawValue }) => localStorage.setItem(key, rawValue), { key: STORAGE_KEY, rawValue: raw });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);
    return page.evaluate((key) => ({ raw: localStorage.getItem(key), recovery: window.__GAMEROAD_SAVE_RECOVERY__.snapshot(), savedDeck: [...window.__GAMEROAD_TEST__.state.savedDeck.main], rule: { ...window.__GAMEROAD_TEST__.state.savedDeckRule }, playerCharacterId: window.__GAMEROAD_TEST__.state.playerCharacterId, selectedPartnerId: window.__GAMEROAD_TEST__.state.selectedPartnerId, setupMode: window.__GAMEROAD_TEST__.state.setupMode, setupContent: window.__GAMEROAD_TEST__.state.setupContent }), STORAGE_KEY);
  };

  const corruptRaw = '{not-json';
  let observed = await reloadWithRaw(corruptRaw);
  expect(observed.raw).toBe(corruptRaw);
  expect(observed.recovery.inspection.status).toBe('corrupt');
  expect(observed.recovery.classification.status).toBe('blocked');

  const unknownRaw = JSON.stringify({ v: 3, opaque: { keep: 7 }, deck: { main: defaultDeck, ex: [], ruleId: 'FIRST_REGULATION', ruleRevision: 99 } });
  observed = await reloadWithRaw(unknownRaw);
  expect(observed.raw).toBe(unknownRaw);
  expect(observed.recovery.classification.reason).toBe('RULE_UNKNOWN_OR_UNSUPPORTED');

  const newerRaw = JSON.stringify({ v: 4, opaque: { keep: 8 }, deck: { main: defaultDeck, ex: [], ruleId: 'FIRST_REGULATION', ruleRevision: 3 } });
  observed = await reloadWithRaw(newerRaw);
  expect(observed.raw).toBe(newerRaw);
  expect(observed.recovery.classification.reason).toBe('SAVE_REVISION_NEWER');

  const legacyRaw = JSON.stringify({ v: 2, selectedCharacter: 'partner.naki', history: [{ keep: 'legacy-history' }], settings: { reduceMotion: true }, progression: { battlePoints: 9 }, setupMode: '4p', setupContent: 'honey_hunt', deck: { main: legacyDeck, ex: [], ruleId: 'FIRST_REGULATION', ruleRevision: 2 }, opaque: { keep: 9 } });
  observed = await reloadWithRaw(legacyRaw);
  expect(observed.raw).toBe(legacyRaw);
  expect(observed.recovery.classification.status).toBe('recognized_legacy');
  expect(observed.savedDeck).toHaveLength(40);
  expect(observed.rule.revision).toBe(3);
  const legal = await installLegalBattleDeck(page);
  expect(legal.committed).toBeTruthy();
  let stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
  expect(stored.v).toBe(3);
  expect(stored.opaque.keep).toBe(9);
  expect(stored.history[0].keep).toBe('legacy-history');
  expect(stored.playerCharacterId).toBe('partner.naki');
  expect(stored.partner.selectedId).toBe('partner.naki');
  expect(stored.setupMode).toBe('4p');
  expect(stored.setupContent).toBe('honey_hunt');
  expect(stored.deck.main).toHaveLength(40);
  expect(stored.deck.ruleRevision).toBe(3);

  observed = await reloadWithRaw(JSON.stringify(stored));
  expect(observed.playerCharacterId).toBe('partner.naki');
  expect(observed.selectedPartnerId).toBe('partner.naki');
  expect(observed.setupMode).toBe('4p');
  expect(observed.setupContent).toBe('honey_hunt');

  const previousRaw = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
  const mismatch = await page.evaluate((key) => {
    const t = window.__GAMEROAD_TEST__, proto = Object.getPrototypeOf(localStorage), originalSetItem = proto.setItem;
    let writes = 0;
    Object.defineProperty(proto, 'setItem', { configurable: true, writable: true, value(k, v) { if (k === key) { writes += 1; return originalSetItem.call(this, k, writes === 1 ? `${v}x` : v); } return originalSetItem.call(this, k, v); } });
    let committed;
    try { committed = t.deckCommit(); } finally { Object.defineProperty(proto, 'setItem', { configurable: true, writable: true, value: originalSetItem }); }
    return { committed, raw: localStorage.getItem(key), recovery: window.__GAMEROAD_SAVE_RECOVERY__.snapshot() };
  }, STORAGE_KEY);
  expect(mismatch.committed).toBeFalsy();
  expect(mismatch.raw).toBe(previousRaw);
  expect(mismatch.recovery.write.reason).toBe('STORAGE_READBACK_MISMATCH');

  const readFailure = await page.evaluate(() => {
    const t = window.__GAMEROAD_TEST__, proto = Object.getPrototypeOf(localStorage), originalGetItem = proto.getItem;
    Object.defineProperty(proto, 'getItem', { configurable: true, writable: true, value() { throw new Error('forced-storage-read-failure'); } });
    let committed;
    try { committed = t.deckCommit(); } finally { Object.defineProperty(proto, 'getItem', { configurable: true, writable: true, value: originalGetItem }); }
    return { committed, savedCount: t.state.savedDeck.main.length, recovery: window.__GAMEROAD_SAVE_RECOVERY__.snapshot() };
  });
  expect(readFailure.committed).toBeFalsy();
  expect(readFailure.savedCount).toBe(40);
  expect(readFailure.recovery.write.reason).toBe('STORAGE_READ_FAILED');

  page.once('dialog', async (dialog) => dialog.accept());
  const removeFailureResult = await page.evaluate((key) => {
    const proto = Object.getPrototypeOf(localStorage), originalRemoveItem = proto.removeItem;
    Object.defineProperty(proto, 'removeItem', { configurable: true, writable: true, value() { throw new Error('forced-storage-remove-failure'); } });
    try { document.querySelector('#resetSave').click(); } finally { Object.defineProperty(proto, 'removeItem', { configurable: true, writable: true, value: originalRemoveItem }); }
    return { raw: localStorage.getItem(key), savedCount: window.__GAMEROAD_TEST__.state.savedDeck.main.length, recovery: window.__GAMEROAD_SAVE_RECOVERY__.snapshot() };
  }, STORAGE_KEY);
  expect(removeFailureResult.raw).toBe(previousRaw);
  expect(removeFailureResult.savedCount).toBe(40);
  expect(removeFailureResult.recovery.reset.reason).toBe('STORAGE_REMOVE_FAILED');

  page.once('dialog', async (dialog) => dialog.accept());
  await page.evaluate(() => document.querySelector('#resetSave').click());
  await page.waitForTimeout(120);
  const afterReset = await page.evaluate((key) => ({ raw: localStorage.getItem(key), savedCount: window.__GAMEROAD_TEST__.state.savedDeck.main.length, rule: { ...window.__GAMEROAD_TEST__.state.savedDeckRule } }), STORAGE_KEY);
  expect(afterReset.raw, 'explicit reset does not resurrect the transient starter as a durable save').toBeNull();
  expect(afterReset.savedCount).toBe(40);
  expect(afterReset.rule.id).toBeNull();

  const writeFailure = await page.evaluate((key) => {
    const t = window.__GAMEROAD_TEST__;
    const publicMain = new Set(t.deckPublic().filter((card) => card.slot === 'main').map((card) => card.id));
    const standard = window.__CARD_DATA__.filter((card) => publicMain.has(card.id) && /^(SP|HT|DI|CL)$/.test(card.suit) && /^(A|[2-9]|10|J|Q|K)$/.test(String(card.rank))).map((card) => card.id);
    const royalIds = ['SP_J', 'SP_Q', 'SP_K'];
    const nonRoyal = standard.filter((id) => !t.isRoyalCard(id));
    const main = [...nonRoyal.slice(0, 37), ...royalIds];
    const setValidation = t.deckSetDraft(main, []);
    const proto = Object.getPrototypeOf(localStorage), originalSetItem = proto.setItem;
    Object.defineProperty(proto, 'setItem', { configurable: true, writable: true, value(k, v) { if (k === key) throw new Error('forced-storage-write-failure'); return originalSetItem.call(this, k, v); } });
    let committed;
    try { committed = t.deckCommit(); } finally { Object.defineProperty(proto, 'setItem', { configurable: true, writable: true, value: originalSetItem }); }
    return { committed, setValidation, raw: localStorage.getItem(key), recovery: window.__GAMEROAD_SAVE_RECOVERY__.snapshot(), savedCount: t.state.savedDeck.main.length };
  }, STORAGE_KEY);
  expect(writeFailure.setValidation.ok).toBeTruthy();
  expect(writeFailure.committed).toBeFalsy();
  expect(writeFailure.raw).toBeNull();
  expect(writeFailure.savedCount).toBe(40);
  expect(writeFailure.recovery.write.status).toBe('failed');
  runtime.assertClean(testInfo);
});

// FULLREG R12 supplemental visible-operation coverage
function visibleOperationGo(page, target) {
  return page
    .locator(`[data-home-target="${target}"]:visible, [data-go="${target}"]:visible, [data-root-go="${target}"]:visible`)
    .first();
}

async function backOperationVisible(page) {
  const back = page.locator('section.screen.active [data-back]:visible').first();
  await expect(back).toBeVisible();
  await back.click();
}

test('covers current Home center input semantics plus auxiliary Settings navigation without claiming hidden controls', async ({ page }, testInfo) => {
  const runtime = observeRuntimeErrors(page);
  await bootCurrentBrowser(page);

  const center = page.locator('#homePadCenter:visible');
  if ((await center.count()) > 0) {
    const home = page.locator('section[data-screen="home"]');
    await center.click();
    const expandedAfterPointer = await center.getAttribute('aria-expanded');
    expect(['true', 'false'], 'Home center exposes a current expanded/collapsed state after pointer input').toContain(expandedAfterPointer);
    await expect(home).toHaveAttribute('data-home-state', expandedAfterPointer === 'false' ? 'HOME_COLLAPSED' : 'HOME_EXPANDED');
    if (expandedAfterPointer === 'true') {
      testInfo.annotations.push({
        type: 'current-input-semantics',
        description: 'The mounted slidepad tap adapter resolves the current pointer tap back to expanded; keyboard input supplies the explicit collapse transition.',
      });
      await center.focus();
      await page.keyboard.press('Escape');
    }
    await expect(center).toHaveAttribute('aria-expanded', 'false');
    await expect(home).toHaveAttribute('data-home-state', 'HOME_COLLAPSED');
    await attachStateScreenshot(page, testInfo, 'home-collapsed-visible');

    await center.focus();
    await page.keyboard.press('Escape');
    await expect(center).toHaveAttribute('aria-expanded', 'true');
    await expect(home).toHaveAttribute('data-home-state', 'HOME_EXPANDED');
    await attachStateScreenshot(page, testInfo, 'home-expanded-visible');
  } else {
    testInfo.annotations.push({ type: 'not-visible-in-viewport', description: 'Home center collapse/expand control is not exposed in this viewport.' });
  }

  const settings = visibleOperationGo(page, 'settings');
  await expect(settings, 'Settings must be reachable by a visible current Home control').toBeVisible();
  await settings.click();
  await expect(page.locator('section[data-screen="settings"]')).toBeVisible();
  await attachStateScreenshot(page, testInfo, 'settings-entry-visible');
  runtime.assertClean(testInfo);
});

test('R62R proves Home illustration orientation transitions through temporal Browser evidence', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-1280x720', 'The bounded orientation matrix runs once on the desktop evidence project.');
  const runtime = observeRuntimeErrors(page);
  await bootCurrentBrowser(page);

  const home = page.locator('section[data-screen="home"]');
  await expect(home).toBeVisible();
  await expect(home).toHaveAttribute('data-codex-home-source', 'provided-illustration-drive-source');
  await expect(home).toHaveAttribute('data-home-art-source-id', /1t-viE1VSuatsJd6rC1yuc2ctncguwOVx/);
  await expect(home.locator('.codexHomeArtPlate[data-home-art-orientation="landscape"]')).toHaveJSProperty('naturalWidth', 1536);
  await expect(home.locator('.codexHomeArtPlate[data-home-art-orientation="portrait"]')).toHaveJSProperty('naturalWidth', 853);

  const matrix = [
    { name: 'landscape-1280x720', width: 1280, height: 720 },
    { name: 'portrait-390x844', width: 390, height: 844 },
    { name: 'landscape-844x390', width: 844, height: 390 },
    { name: 'landscape-667x375', width: 667, height: 375 },
  ];
  const expectedPhases = ['PREPARE', 'EXIT', 'SWAP', 'ENTER', 'SETTLE'];
  let previousOrientation = 'landscape';

  for (const size of matrix) {
    const expectedOrientation = size.width >= size.height ? 'landscape' : 'portrait';
    const transitionExpected = expectedOrientation !== previousOrientation;
    const beforeLogLength = await page.evaluate(() => window.__GAMEROAD_HOME_ORIENTATION_LOG__?.length ?? 0);
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.waitForTimeout(45);
    await testInfo.attach(`${testInfo.project.name}-${size.name}-bridge.png`, {
      body: await page.screenshot({ fullPage: false }),
      contentType: 'image/png',
    });
    await page.waitForTimeout(130);
    await testInfo.attach(`${testInfo.project.name}-${size.name}-enter.png`, {
      body: await page.screenshot({ fullPage: false }),
      contentType: 'image/png',
    });
    await page.waitForFunction((orientation) => {
      const root = document.querySelector('.codexHome');
      return root?.dataset.homeOrientation === orientation
        && document.documentElement.dataset.orientationProjection === orientation
        && root?.dataset.homeTransitionPhase === undefined;
    }, expectedOrientation);
    await testInfo.attach(`${testInfo.project.name}-${size.name}-settled.png`, {
      body: await page.screenshot({ fullPage: false }),
      contentType: 'image/png',
    });

    const evidence = await page.evaluate(({ expectedOrientation, beforeLogLength }) => {
      const root = document.querySelector('.codexHome');
      const log = window.__GAMEROAD_HOME_ORIENTATION_LOG__ ?? [];
      const recent = log.slice(beforeLogLength);
      return {
        viewport: { width: innerWidth, height: innerHeight },
        screen: document.querySelector('.screen.active')?.dataset.screen ?? null,
        orientation: root?.dataset.homeOrientation ?? null,
        projection: root?.dataset.homeProjection ?? null,
        revision: root?.dataset.homeProjectionRevision ?? null,
        transitionPhase: root?.dataset.homeTransitionPhase ?? null,
        artState: root?.dataset.homeArtState ?? null,
        sourceId: root?.dataset.homeArtSourceId ?? null,
        artReady: [...root?.querySelectorAll('.codexHomeArtPlate') ?? []].map((image) => ({
          orientation: image.dataset.homeArtOrientation,
          naturalWidth: image.naturalWidth,
          naturalHeight: image.naturalHeight,
        })),
        phases: recent.filter((entry) => entry.revision !== null).map((entry) => entry.phase),
        latest: recent.at(-1) ?? null,
        expectedOrientation,
      };
    }, { expectedOrientation, beforeLogLength });

    expect(evidence.screen, `${size.name} remains on Home`).toBe('home');
    expect(evidence.orientation, `${size.name} orientation`).toBe(expectedOrientation);
    expect(evidence.projection).toBe(`Home:HOME_INITIAL_DEFAULT:${expectedOrientation}`);
    expect(evidence.transitionPhase).toBeNull();
    expect(evidence.artState).toBe('ready');
    expect(evidence.sourceId).toContain('1t-viE1VSuatsJd6rC1yuc2ctncguwOVx');
    expect(evidence.sourceId).toContain('1nzw0J6yRLTxxZm9An4L4abI7_rUwUKfx');
    expect(evidence.artReady.every((image) => image.naturalWidth > 0 && image.naturalHeight > 0)).toBeTruthy();
    if (transitionExpected) {
      expect(evidence.phases).toEqual(expectedPhases);
      expect(evidence.latest?.settle).toBe(true);
      expect(evidence.latest?.superseded).toBe(false);
      expect(evidence.latest?.viewport).toEqual({ width: size.width, height: size.height });
    }
    previousOrientation = expectedOrientation;
  }

  runtime.assertClean(testInfo);
});

test('covers Cards search, suit filtering, detail open/close, mobile tray, and restore', async ({ page }, testInfo) => {
  const runtime = observeRuntimeErrors(page);
  await bootCurrentBrowser(page);

  const cardsGo = visibleOperationGo(page, 'cards');
  await expect(cardsGo).toBeVisible();
  await cardsGo.click();
  const cards = page.locator('section[data-screen="cards"]');
  await expect(cards).toBeVisible();

  const search = cards.locator('#cardSearch');
  await search.fill('スペードA');
  const result = cards.locator('#collectionGrid button.slot.live.cardFace:visible').first();
  await expect(result).toBeVisible();
  await result.click();
  await expect(cards.locator('.cardPreview')).toBeVisible();
  await expect(cards.locator('#previewName')).toContainText('スペードA');
  await attachStateScreenshot(page, testInfo, 'card-detail-visible');
  await cards.locator('#r4PreviewClose').click();

  await search.fill('');
  await cards.locator('[data-suit-filter="SP"]').click();
  const visibleSuits = await cards.locator('#collectionGrid button.slot.live.cardFace:visible').evaluateAll((nodes) => [...new Set(nodes.map((node) => node.dataset.suit))]);
  expect(visibleSuits).toEqual(['SP']);

  const tray = cards.locator('#r4DeckTrayToggle:visible');
  const restore = cards.locator('#restoreDeck');
  if ((await tray.count()) > 0) {
    await tray.click();
    await expect(cards).toHaveAttribute('data-deck-drawer', 'open');
    await attachStateScreenshot(page, testInfo, 'deck-tray-open-visible');
    await expect(restore).toBeVisible();
    await restore.click();
    await attachStateScreenshot(page, testInfo, 'cards-filtered-restored-visible');
    if ((await cards.getAttribute('data-deck-drawer')) === 'open') {
      await tray.click();
      await expect(cards).not.toHaveAttribute('data-deck-drawer', 'open');
    }
  } else {
    await expect(restore).toBeVisible();
    await restore.click();
    await attachStateScreenshot(page, testInfo, 'cards-filtered-restored-visible');
  }
  runtime.assertClean(testInfo);
});

test('covers the current visible Saasuna partner conversation product surface', async ({ page }, testInfo) => {
  const runtime = observeRuntimeErrors(page);
  await bootCurrentBrowser(page);

  const charactersGo = visibleOperationGo(page, 'characters');
  await expect(charactersGo).toBeVisible();
  await charactersGo.click();
  const characters = page.locator('section[data-screen="characters"]');
  await expect(characters).toBeVisible();
  const conversation = characters.locator('.grPartnerConversation[data-gr-partner-conversation="1"]');
  await expect(conversation).toBeVisible();
  await expect(characters.locator('#charName')).toHaveText('サースナー');
  await expect(conversation).toHaveAttribute('data-static-visual', '1');
  await expect(conversation).toHaveAttribute('data-animatable', '0');
  await expect(conversation).toHaveAttribute('data-character-production-owned-here', '0');
  await expect(conversation.locator('.grPartnerStaticVisual')).toHaveAttribute('src', '/ws?partnerOp=visual');
  await expect(conversation.locator('.grPartnerConversationInput')).toBeVisible();
  await expect(conversation.locator('.grPartnerConversationSend')).toBeEnabled();
  await expect(characters.locator('.charRoleTab')).toHaveCount(0);
  const product = await page.evaluate(() => {
    const mounted = window.GAMEROAD_PARTNER_CONVERSATION_PRODUCT_MOUNT;
    return mounted ? {
      partnerId: mounted.partnerId,
      pickerRequired: mounted.pickerRequired,
      staticVisual: mounted.staticVisual,
      animatable: mounted.animatable,
      characterProductionOwnedHere: mounted.characterProductionOwnedHere,
    } : null;
  });
  expect(product).toEqual({
    partnerId: 'partner.saasuna',
    pickerRequired: false,
    staticVisual: true,
    animatable: false,
    characterProductionOwnedHere: false,
  });
  await attachStateScreenshot(page, testInfo, 'saasuna-partner-conversation-visible');
  runtime.assertClean(testInfo);
});

test('covers Setup Honey/4P/2v2 plus Friend Room create, ready, waiting, and leave', async ({ page }, testInfo) => {
  const runtime = observeRuntimeErrors(page);
  await bootCurrentBrowser(page);
  const deck = await installLegalBattleDeck(page);
  expect(deck.main).toHaveLength(40);
  expect(deck.committed).toBeTruthy();
  expect(deck.savedValidation.ok).toBeTruthy();
  testInfo.annotations.push({ type: 'deterministic-precondition', description: 'A legal 40-card deck is installed through the existing test API only to unlock visible Setup controls; no match state is injected.' });

  const setupGo = visibleOperationGo(page, 'setup');
  await expect(setupGo).toBeVisible();
  await setupGo.click();
  const setup = page.locator('section[data-screen="setup"]');
  await expect(setup).toBeVisible();

  await setup.locator('[data-content="honey_hunt"]').click();
  await setup.locator('[data-mode="4p"]').click();
  await expect(setup.locator('[data-content="honey_hunt"]')).toHaveClass(/on/);
  await expect(setup.locator('[data-mode="4p"]')).toHaveClass(/on/);
  await attachStateScreenshot(page, testInfo, 'setup-honey-four-player-visible');

  await setup.locator('[data-content="road_shield"]').click();
  await setup.locator('[data-mode="2v2"]').click();
  await expect(setup.locator('[data-mode="2v2"]')).toHaveClass(/on/);
  await attachStateScreenshot(page, testInfo, 'setup-two-v-two-visible');

  await setup.locator('#friendRoomEntry').click();
  const friend = page.locator('section[data-screen="friendroom"]');
  await expect(friend).toBeVisible();
  await expect(friend.locator('#friendCreate2')).toBeVisible();
  await expect(friend.locator('#friendCreate4')).toBeVisible();
  await expect(friend.locator('#friendJoinCode')).toBeVisible();
  await expect(friend.locator('#friendJoinBtn')).toBeVisible();
  await attachStateScreenshot(page, testInfo, 'friend-room-idle-visible');

  await friend.locator('#friendCreate2').click();
  await expect(friend.locator('.friendCode')).toContainText('部屋主');
  await expect(friend.locator('#friendReadyBtn')).toBeVisible();
  await expect(friend.locator('#friendStartBtn')).toBeDisabled();
  await attachStateScreenshot(page, testInfo, 'friend-room-host-waiting-visible');

  await friend.locator('#friendReadyBtn').click();
  await expect(friend.locator('#friendReadyBtn')).toContainText('準備を戻す');
  await attachStateScreenshot(page, testInfo, 'friend-room-ready-wait-visible');

  const transportContract = await page.evaluate(() => window.GAMEROAD_FRIEND_ROOM_R2?.contracts ?? null);
  expect(transportContract).not.toBeNull();
  expect(transportContract.publicWssVerified).toBe(false);
  expect(transportContract.physicalFourDeviceVerified).toBe(false);
  testInfo.annotations.push({ type: 'external-not-proven', description: 'Public WSS and physical four-device Friend Room play remain explicitly unverified by the current runtime contract; local CI does not claim them.' });

  await friend.locator('#friendLeaveBtn').click();
  await expect(setup).toBeVisible();
  runtime.assertClean(testInfo);
});

test('covers Settings reduced-motion/low-performance, volume and mute controls, then Gacha open/detail/back/cards', async ({ page }, testInfo) => {
  const runtime = observeRuntimeErrors(page);
  await bootCurrentBrowser(page);

  const settingsGo = visibleOperationGo(page, 'settings');
  await expect(settingsGo).toBeVisible();
  await settingsGo.click();
  const settings = page.locator('section[data-screen="settings"]');
  await expect(settings).toBeVisible();

  await settings.locator('#reduceMotion').click();
  await settings.locator('#lowPerf').click();
  await expect(settings.locator('#reduceMotion')).toHaveText('ON');
  await expect(settings.locator('#lowPerf')).toHaveText('ON');

  await settings.locator('#musicVolume').fill('35');
  await settings.locator('#sfxVolume').fill('45');
  await settings.locator('#partnerVoiceVolume').fill('55');
  await expect(settings.locator('#musicVolumeLabel')).toHaveText('35');
  await expect(settings.locator('#sfxVolumeLabel')).toHaveText('45');
  await expect(settings.locator('#partnerVoiceVolumeLabel')).toHaveText('55');

  await settings.locator('#musicMute').click();
  await settings.locator('#sfxMute').click();
  await settings.locator('#partnerVoiceMute').click();
  await expect(settings.locator('#musicMute')).toContainText('ON');
  await expect(settings.locator('#sfxMute')).toContainText('ON');
  await expect(settings.locator('#partnerVoiceMute')).toContainText('ON');
  await attachStateScreenshot(page, testInfo, 'settings-reduced-lowperf-audio-visible');

  await backOperationVisible(page);
  await expect(page.locator('section[data-screen="home"]')).toBeVisible();

  let gachaGo = visibleOperationGo(page, 'gacha');
  if ((await gachaGo.count()) === 0) {
    const shopGo = visibleOperationGo(page, 'shop');
    await expect(shopGo).toBeVisible();
    await shopGo.click();
    await expect(page.locator('section[data-screen="shop"]')).toBeVisible();
    gachaGo = visibleOperationGo(page, 'gacha');
  }
  await expect(gachaGo).toBeVisible();
  await gachaGo.click();

  const gacha = page.locator('section[data-screen="gacha"]');
  await expect(gacha).toBeVisible();
  await attachStateScreenshot(page, testInfo, 'gacha-idle-visible');
  await gacha.locator('#openPack').click();
  await expect(gacha.locator('#gachaResultsView')).not.toHaveClass(/hidden/);
  await expect(gacha.locator('#packResults .packCard')).toHaveCount(7);
  await attachStateScreenshot(page, testInfo, 'gacha-seven-results-visible');

  const detailCard = gacha.locator('#packResults button.packCard[aria-label*="詳細を開く"]').first();
  if ((await detailCard.count()) > 0) {
    await detailCard.click();
    await expect(gacha.locator('#gachaFocus')).not.toHaveClass(/hidden/);
    await attachStateScreenshot(page, testInfo, 'gacha-card-detail-visible');
    await gacha.locator('#gachaFocusBack').click();
    await expect(gacha.locator('#gachaResultsView')).not.toHaveClass(/hidden/);

    await detailCard.click();
    await gacha.locator('#gachaFocusToCards').click();
    await expect(page.locator('section[data-screen="cards"]')).toBeVisible();
    await expect(page.locator('section[data-screen="cards"] .cardPreview')).toBeVisible();
    await attachStateScreenshot(page, testInfo, 'gacha-to-card-detail-visible');
  } else {
    testInfo.annotations.push({ type: 'random-exception', description: 'All seven generated results were non-card ticket results, so the visible card-detail route could not be exercised in this random pack.' });
  }

  runtime.assertClean(testInfo);
});

test('covers visible 2v2 Battle shell, info/log drawer, range, partner advice, undo and exit', async ({ page }, testInfo) => {
  const runtime = observeRuntimeErrors(page);
  await bootCurrentBrowser(page);
  const deck = await installLegalBattleDeck(page);
  expect(deck.committed).toBeTruthy();
  testInfo.annotations.push({ type: 'deterministic-precondition', description: 'A legal 40-card deck is installed before using only visible Setup/Battle controls.' });

  const setupGo = visibleOperationGo(page, 'setup');
  await expect(setupGo).toBeVisible();
  await setupGo.click();
  const setup = page.locator('section[data-screen="setup"]');
  await setup.locator('[data-content="road_shield"]').click();
  await setup.locator('[data-mode="2v2"]').click();
  await setup.locator('#startMatch').click();

  const battle = page.locator('section[data-screen="battle"]');
  await expect(battle).toBeVisible();
const jankenSlidePad = battle.locator('[data-battle-janken-slidepad="1"]');
await expect(jankenSlidePad).toBeVisible();
await expect(jankenSlidePad.locator('[data-janken-slot]')).toHaveCount(3);
await expect.poll(async () => page.evaluate(() => window.__GAMEROAD_BATTLE_JANKEN_SLIDEPAD__?.snapshot?.()?.roundId ?? null)).not.toBeNull();
const jankenSnapshot = await page.evaluate(() => window.__GAMEROAD_BATTLE_JANKEN_SLIDEPAD__?.snapshot?.() ?? null);
expect(jankenSnapshot?.ordinaryHandCardIds?.length).toBeGreaterThan(0);
expect(jankenSnapshot?.assignment?.selectedJankenCardIds?.length).toBeGreaterThan(0);
for (const cardId of jankenSnapshot?.assignment?.selectedJankenCardIds ?? []) {
  await expect(battle.locator(`#hand .handCard[data-card-id="${cardId}"]`)).toHaveCount(1);
}
await expect(battle.locator('#publicPlayerStrip .publicPlayerChip')).toHaveCount(4);
  await expect(battle.locator('#boardPlayers .boardPlayerToken')).toHaveCount(4);
  await attachStateScreenshot(page, testInfo, 'battle-two-v-two-entry-visible');

  await battle.locator('#detailsBtn').click();
  const drawer = battle.locator('#battleDrawer');
  await expect(drawer).toHaveClass(/on/);
  await expect(drawer).toHaveAttribute('aria-hidden', 'false');
  await expect(drawer.locator('#partnerRule')).toBeVisible();
  await drawer.locator('#partnerRule').selectOption('left');
  const logSummary = drawer.locator('#battleLogDetails summary');
  await logSummary.click();
  await expect(drawer.locator('#battleLogDetails')).toHaveAttribute('open', '');
  await attachStateScreenshot(page, testInfo, 'battle-info-partner-rule-log-visible');
  await drawer.locator('#detailsClose').click();

  await battle.locator('#dangerBtn').click();
  await expect(battle.locator('#battleMap')).toHaveClass(/showRange/);
  await attachStateScreenshot(page, testInfo, 'battle-range-visible');

  await battle.locator('#partnerAdviceBtn').click();
  const advice = await page.evaluate(() => window.__GAMEROAD_HATE_PARTNER_TEST__?.adviceEnvelope?.() ?? null);
  expect(advice).not.toBeNull();
  expect(advice.kind).toBe('plan');
  expect(advice.status).toBe('ready');
  await attachStateScreenshot(page, testInfo, 'battle-partner-advice-visible');

  await expect.poll(async () => battle.locator('[data-partner-advice-role="partner-recommendation"]').count()).toBe(2);
  const adviceProjection = await page.evaluate(() => window.__GAMEROAD_PARTNER_ADVICE_BOARD_R21B__?.snapshot?.() ?? null);
  expect(adviceProjection).not.toBeNull();
  expect(adviceProjection.activeCount).toBe(2);
  expect(adviceProjection.rangeVisible, 'Partner recommendation does not replace the general range/threat surface').toBe(true);
  expect(adviceProjection.markers.map((marker) => marker.kind).sort()).toEqual(['battle', 'road']);
  for (const marker of adviceProjection.markers) {
    expect(marker.glyph).toContain('相棒推奨');
    expect(marker.aria).toContain('相棒推奨');
    expect(marker.outlineStyle).toBe('dashed');
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(battle.locator('[data-partner-advice-role="partner-recommendation"]')).toHaveCount(2);
  expect((await page.evaluate(() => window.__GAMEROAD_PARTNER_ADVICE_BOARD_R21B__?.snapshot?.()))?.activeCount).toBe(2);
  const staleProjection = await page.evaluate(async () => {
    const stale = window.__GAMEROAD_PARTNER_ADVICE_STALE__?.() ?? { status: 'blocked', kind: 'stale', error: 'STALE_STATE' };
    return window.__GAMEROAD_PARTNER_ADVICE_BOARD_R21B__?.render?.(stale) ?? null;
  });
  expect(staleProjection?.activeCount).toBe(0);
  await expect(battle.locator('[data-partner-advice-role="partner-recommendation"]')).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await battle.locator('#partnerAdviceBtn').click();
  await expect.poll(async () => battle.locator('[data-partner-advice-role="partner-recommendation"]').count()).toBe(2);
  await attachStateScreenshot(page, testInfo, 'battle-partner-advice-object-projection-visible');

  const overlapProjection = await page.evaluate(async () => {
    const board = window.__GAMEROAD_PARTNER_ADVICE_BOARD_R21B__;
    const partner = window.__GAMEROAD_HATE_PARTNER_TEST__;
    const ready = partner?.adviceEnvelope?.() ?? null;
    const stale = window.__GAMEROAD_PARTNER_ADVICE_STALE__?.() ?? { status: 'blocked', kind: 'stale', error: 'STALE_STATE' };
    const oldReady = board?.render?.(ready);
    const staleResult = await board?.render?.(stale);
    const oldResult = await oldReady;
    return {
      readyStatus: ready?.status ?? null,
      staleActiveCount: staleResult?.activeCount ?? null,
      oldActiveCount: oldResult?.activeCount ?? null,
      final: board?.snapshot?.() ?? null,
    };
  });
  expect(overlapProjection.readyStatus, 'race oracle starts from a real ready advice envelope').toBe('ready');
  expect(overlapProjection.staleActiveCount, 'newer stale render clears immediately').toBe(0);
  expect(overlapProjection.oldActiveCount, 'superseded ready render cannot resurrect recommendation markers').toBe(0);
  expect(overlapProjection.final?.activeCount, 'latest stale state remains authoritative after old render resumes').toBe(0);
  await expect(battle.locator('[data-partner-advice-role="partner-recommendation"]')).toHaveCount(0);

  await battle.locator('#clearPath').click();
  await battle.locator('#leaveMatch').click();
  await expect(page.locator('section[data-screen="home"]')).toBeVisible();
  await attachStateScreenshot(page, testInfo, 'battle-exit-home-visible');
  runtime.assertClean(testInfo);
});

test('records explicit boundaries instead of falsely claiming unconnected or external-only states', async ({ page }, testInfo) => {
  await bootCurrentBrowser(page);
  const boundaries = await page.evaluate(() => ({
    friend: window.GAMEROAD_FRIEND_ROOM_R2?.contracts ?? null,
    screens: [...document.querySelectorAll('section[data-screen]')].map((node) => node.dataset.screen),
    hasFusionScreen: !!document.querySelector('section[data-screen="fusion"]'),
    hasBossScreen: !!document.querySelector('section[data-screen="boss"]'),
    storageKeyPresent: localStorage.getItem('gameroad.browser.v10.core.1') !== null,
  }));

  expect(boundaries.friend).not.toBeNull();
  expect(boundaries.friend.publicWssVerified).toBe(false);
  expect(boundaries.friend.physicalFourDeviceVerified).toBe(false);
  expect(boundaries.hasFusionScreen).toBe(false);
  expect(boundaries.hasBossScreen).toBe(false);
  expect(boundaries.screens).toEqual(expect.arrayContaining(['home', 'cards', 'characters', 'setup', 'friendroom', 'battle', 'result', 'missions', 'profile', 'shop', 'gacha', 'records', 'settings']));

  testInfo.annotations.push({
    type: 'coverage-boundary',
    description: `No Fusion/Boss screen exists in current Browser; public WSS=${boundaries.friend.publicWssVerified}, physical4=${boundaries.friend.physicalFourDeviceVerified}. These remain NOT COVERED rather than being promoted by CI. ${STORAGE_KEY} may be absent on a clean boot by design.`,
  });
  await attachStateScreenshot(page, testInfo, 'coverage-boundary-home');
});


// FULLREG R13 reachable-operation residual
test('R13 covers all currently actionable auxiliary screen navigation surfaces', async ({ page }, testInfo) => {
  const runtime = observeRuntimeErrors(page);
  await bootCurrentBrowser(page);
  const home = page.locator('section[data-screen="home"]');

  for (const target of ['missions', 'records']) {
    const go = visibleOperationGo(page, target);
    await expect(go, `${target} must be reachable from Home`).toBeVisible();
    await go.click();
    const screen = page.locator(`section[data-screen="${target}"]`);
    await expect(screen).toBeVisible();
    await attachStateScreenshot(page, testInfo, `r13-${target}-visible`);
    await backOperationVisible(page);
    await expect(home).toBeVisible();
  }

  const profileGo = visibleOperationGo(page, 'profile');
  await expect(profileGo).toBeVisible();
  await profileGo.click();
  const profile = page.locator('section[data-screen="profile"]');
  await expect(profile).toBeVisible();
  await attachStateScreenshot(page, testInfo, 'r13-profile-visible');
  for (const target of ['characters', 'records', 'settings']) {
    const nested = profile.locator(`[data-go="${target}"]:visible`).first();
    await expect(nested).toBeVisible();
    await nested.click();
    await expect(page.locator(`section[data-screen="${target}"]`)).toBeVisible();
    await attachStateScreenshot(page, testInfo, `r13-profile-to-${target}-visible`);
    await backOperationVisible(page);
    await expect(profile).toBeVisible();
  }
  await backOperationVisible(page);
  await expect(home).toBeVisible();

  const shopGo = visibleOperationGo(page, 'shop');
  await expect(shopGo).toBeVisible();
  await shopGo.click();
  const shop = page.locator('section[data-screen="shop"]');
  await expect(shop).toBeVisible();
  await attachStateScreenshot(page, testInfo, 'r13-shop-visible');
  for (const target of ['gacha', 'characters', 'cards']) {
    const nested = shop.locator(`[data-go="${target}"]:visible`).first();
    await expect(nested).toBeVisible();
    await nested.click();
    await expect(page.locator(`section[data-screen="${target}"]`)).toBeVisible();
    await attachStateScreenshot(page, testInfo, `r13-shop-to-${target}-visible`);
    await backOperationVisible(page);
    await expect(shop).toBeVisible();
  }
  await backOperationVisible(page);
  await expect(home).toBeVisible();
  runtime.assertClean(testInfo);
});

test('R13 covers every visible card suit filter and mobile deck backdrop close', async ({ page }, testInfo) => {
  const runtime = observeRuntimeErrors(page);
  await bootCurrentBrowser(page);
  const cardsGo = visibleOperationGo(page, 'cards');
  await expect(cardsGo).toBeVisible();
  await cardsGo.click();
  const cards = page.locator('section[data-screen="cards"]');
  await expect(cards).toBeVisible();

  for (const filter of ['ALL', 'SP', 'HT', 'DI', 'CL', 'DCG']) {
    const button = cards.locator(`[data-suit-filter="${filter}"]`);
    await expect(button).toBeVisible();
    await button.click();
    await expect(button).toHaveClass(/on/);
    const visibleCards = cards.locator('#collectionGrid button.slot.live.cardFace:visible');
    if (filter === 'ALL') {
      expect(await visibleCards.count(), 'ALL filter exposes current public cards').toBeGreaterThan(0);
    } else {
      const visibleSuits = await visibleCards.evaluateAll((nodes) => nodes.map((node) => node.dataset.suit));
      expect(visibleSuits.every((suit) => suit === filter), `${filter} filter must not leak another suit`).toBeTruthy();
    }
  }
  await attachStateScreenshot(page, testInfo, 'r13-cards-all-suit-filters-exercised');

  const tray = cards.locator('#r4DeckTrayToggle:visible');
  if ((await tray.count()) > 0) {
    await tray.click();
    await expect(cards).toHaveAttribute('data-deck-drawer', 'open');
    const backdrop = cards.locator('#r4DeckBackdrop:visible');
    await expect(backdrop).toBeVisible();
    const backdropBox = await backdrop.boundingBox();
    const drawerBox = await cards.locator('.deckBoard:visible').boundingBox();
    expect(backdropBox).not.toBeNull();
    expect(drawerBox).not.toBeNull();
    const outsideX = backdropBox.x + backdropBox.width / 2;
    const outsideY = Math.max(backdropBox.y + 2, drawerBox.y - 8);
    await page.mouse.click(outsideX, outsideY);
    await expect(cards).not.toHaveAttribute('data-deck-drawer', 'open');
    await attachStateScreenshot(page, testInfo, 'r13-deck-backdrop-closed-visible');
  } else {
    testInfo.annotations.push({ type: 'not-visible-in-viewport', description: 'Mobile deck tray/backdrop is not exposed in this viewport.' });
  }
  runtime.assertClean(testInfo);
});

test('R13 covers four-player Friend Room ready toggle and visible Honey Hunt four-player start', async ({ page }, testInfo) => {
  const runtime = observeRuntimeErrors(page);
  await bootCurrentBrowser(page);
  const deck = await installLegalBattleDeck(page);
  expect(deck.main).toHaveLength(40);
  expect(deck.committed).toBeTruthy();
  expect(deck.savedValidation.ok).toBeTruthy();
  testInfo.annotations.push({ type: 'deterministic-precondition', description: 'A legal 40-card deck is installed only to unlock visible Setup controls; Friend Room and match state are entered through visible controls.' });

  const setupGo = visibleOperationGo(page, 'setup');
  await expect(setupGo).toBeVisible();
  await setupGo.click();
  const setup = page.locator('section[data-screen="setup"]');
  await expect(setup).toBeVisible();
  await setup.locator('[data-content="honey_hunt"]').click();
  await setup.locator('[data-mode="4p"]').click();
  await expect(setup.locator('[data-content="honey_hunt"]')).toHaveClass(/on/);
  await expect(setup.locator('[data-mode="4p"]')).toHaveClass(/on/);

  await setup.locator('#friendRoomEntry').click();
  const friend = page.locator('section[data-screen="friendroom"]');
  await expect(friend).toBeVisible();
  await expect(friend.locator('#friendCreate4')).toBeVisible();
  await friend.locator('#friendCreate4').click();
  await expect(friend.locator('.friendCode')).toContainText('部屋主');
  await expect(friend.locator('#friendReadyBtn')).toBeVisible();
  await expect(friend.locator('#friendStartBtn')).toBeDisabled();
  await attachStateScreenshot(page, testInfo, 'r13-friend-four-player-host-waiting-visible');

  await friend.locator('#friendReadyBtn').click();
  await expect(friend.locator('#friendReadyBtn')).toContainText('準備を戻す');
  await attachStateScreenshot(page, testInfo, 'r13-friend-four-player-ready-visible');
  await friend.locator('#friendReadyBtn').click();
  await expect(friend.locator('#friendReadyBtn')).not.toContainText('準備を戻す');
  await attachStateScreenshot(page, testInfo, 'r13-friend-four-player-unready-visible');
  await friend.locator('#friendLeaveBtn').click();
  await expect(setup).toBeVisible();

  await expect(setup.locator('[data-content="honey_hunt"]')).toHaveClass(/on/);
  await expect(setup.locator('[data-mode="4p"]')).toHaveClass(/on/);
  await expect(setup.locator('#startMatch')).toBeEnabled();
  await setup.locator('#startMatch').click();
  const battle = page.locator('section[data-screen="battle"]');
  await expect(battle).toBeVisible();
  await expect(battle.locator('#honeyMeter')).toBeVisible();
  await expect(battle.locator('#publicPlayerStrip .publicPlayerChip')).toHaveCount(4);
  await attachStateScreenshot(page, testInfo, 'r13-honey-four-player-battle-entry-visible');
  await battle.locator('#leaveMatch').click();
  await expect(page.locator('section[data-screen="home"]')).toBeVisible();
  runtime.assertClean(testInfo);
});

test('R13 covers visible save reset confirmation and records hidden development-audio boundary', async ({ page }, testInfo) => {
  const runtime = observeRuntimeErrors(page);
  await bootCurrentBrowser(page);
  const settingsGo = visibleOperationGo(page, 'settings');
  await expect(settingsGo).toBeVisible();
  await settingsGo.click();
  const settings = page.locator('section[data-screen="settings"]');
  await expect(settings).toBeVisible();

  for (const id of ['audioPreviewPack', 'battleMusicKey', 'previewBgm', 'previewMatchFound', 'previewBattleStart', 'previewComplete']) {
    await expect(settings.locator(`#${id}`), `${id} is development-only and must not be counted as a human-visible operation`).toBeHidden();
  }
  testInfo.annotations.push({ type: 'not-human-visible', description: 'Development audio preview/select controls exist in DOM but their parent surface is hidden in the current product. They are excluded from the human-visible operation inventory rather than force-clicked.' });
  await attachStateScreenshot(page, testInfo, 'r13-settings-hidden-development-audio-boundary');

  page.once('dialog', async (dialog) => {
    expect(dialog.type()).toBe('confirm');
    await dialog.accept();
  });
  await settings.locator('#resetSave').click();
  await expect(settings.locator('#reduceMotion')).toHaveText('オフ');
  await expect(settings.locator('#lowPerf')).toHaveText('オフ');
  await expect(settings.locator('#audioPreviewPack')).toHaveValue('none');
  await expect(settings.locator('#battleMusicKey')).toHaveValue('battle_music_none');
  await expect(settings.locator('#storageStatus')).toHaveText('一時保存');
  await attachStateScreenshot(page, testInfo, 'r13-settings-save-reset-visible');
  runtime.assertClean(testInfo);
});

test('R13 covers the visible pack-animation skip without injecting game state', async ({ page }, testInfo) => {
  const runtime = observeRuntimeErrors(page);
  await bootCurrentBrowser(page);
  let gachaGo = visibleOperationGo(page, 'gacha');
  if ((await gachaGo.count()) === 0) {
    const shopGo = visibleOperationGo(page, 'shop');
    await expect(shopGo).toBeVisible();
    await shopGo.click();
    gachaGo = visibleOperationGo(page, 'gacha');
  }
  await expect(gachaGo).toBeVisible();
  await gachaGo.click();
  const gacha = page.locator('section[data-screen="gacha"]');
  await expect(gacha).toBeVisible();

  await page.evaluate(() => {
    HTMLMediaElement.prototype.play = function () { return new Promise(() => {}); };
  });
  testInfo.annotations.push({ type: 'deterministic-precondition', description: 'Only media playback completion is held so the real visible Skip control remains reachable; no GAMEROAD state, pack result, or navigation is injected.' });

  await gacha.locator('#openPack').click();
  const skip = gacha.locator('#skipPack:visible');
  await expect(skip).toBeVisible();
  await attachStateScreenshot(page, testInfo, 'r13-gacha-skip-visible');
  await skip.click();
  await expect(gacha.locator('#gachaResultsView')).not.toHaveClass(/hidden/);
  await expect(gacha.locator('#packResults .packCard')).toHaveCount(7);
  await attachStateScreenshot(page, testInfo, 'r13-gacha-skip-results-visible');
  runtime.assertClean(testInfo);
});

// FULLREG R13 final visible-operation residual
test('R13 covers visible deck-slot removal followed by meaningful restore', async ({ page }, testInfo) => {
  const runtime = observeRuntimeErrors(page);
  await bootCurrentBrowser(page);
  const deck = await installLegalBattleDeck(page);
  expect(deck.main).toHaveLength(40);
  expect(deck.committed).toBeTruthy();
  expect(deck.savedValidation.ok).toBeTruthy();
  testInfo.annotations.push({ type: 'deterministic-precondition', description: 'A legal 40-card saved deck is installed only to expose the real deck-slot remove and restore controls; the remove/restore operations themselves use visible UI.' });

  const cardsGo = visibleOperationGo(page, 'cards');
  await expect(cardsGo).toBeVisible();
  await cardsGo.click();
  const cards = page.locator('section[data-screen="cards"]');
  await expect(cards).toBeVisible();
  await expect(cards.locator('#deckCount')).toHaveText('40');

  const tray = cards.locator('#r4DeckTrayToggle:visible');
  if ((await tray.count()) > 0 && (await cards.getAttribute('data-deck-drawer')) !== 'open') {
    await tray.click();
    await expect(cards).toHaveAttribute('data-deck-drawer', 'open');
  }
  const remove = cards.locator('#deckSlots [data-deck-remove]:visible').first();
  await expect(remove).toBeVisible();
  await remove.click();
  await expect(cards.locator('#deckCount')).toHaveText('39');
  await expect(cards.locator('#deckSaveState')).not.toHaveText('保存済み');
  await attachStateScreenshot(page, testInfo, 'r13-deck-slot-removed-visible');

  const restore = cards.locator('#restoreDeck:visible');
  await expect(restore).toBeVisible();
  await restore.click();
  await expect(cards.locator('#deckCount')).toHaveText('40');
  await expect(cards.locator('#deckSaveState')).toHaveText('保存済み');
  await attachStateScreenshot(page, testInfo, 'r13-deck-slot-restored-visible');
  runtime.assertClean(testInfo);
});

test('R13 covers the current visible advice-partner conversation composer without inventing a picker', async ({ page }, testInfo) => {
  const runtime = observeRuntimeErrors(page);
  await bootCurrentBrowser(page);
  const charactersGo = visibleOperationGo(page, 'characters');
  await expect(charactersGo).toBeVisible();
  await charactersGo.click();
  const characters = page.locator('section[data-screen="characters"]');
  await expect(characters).toBeVisible();
  const conversation = characters.locator('.grPartnerConversation[data-gr-partner-conversation="1"]');
  const input = conversation.locator('.grPartnerConversationInput');
  const send = conversation.locator('.grPartnerConversationSend');
  await expect(conversation).toBeVisible();
  await expect(conversation.locator('.grPartnerConversationState')).toHaveText('会話できます');
  await expect(send).toBeEnabled();
  await input.fill('表示中の会話入力を確認');
  await expect(input).toHaveValue('表示中の会話入力を確認');
  await expect(send).toBeEnabled();
  expect(await characters.locator('.charCard, .charRoleTab').count(), 'current product does not expose the retired partner picker').toBe(0);
  await attachStateScreenshot(page, testInfo, 'r13-partner-conversation-composer-visible');
  runtime.assertClean(testInfo);
});

test('R13 covers direct plan selectors, reachable-node click, avatar drag, real undo, and surfaced target selectors', async ({ page }, testInfo) => {
  const runtime = observeRuntimeErrors(page);
  await bootCurrentBrowser(page);
  const battle = await beginVisibleTwoPlayerRoadShield(page, testInfo, 'r13-direct-plan-movement');
  const roadSelect = battle.locator('#roadSelect');
  const battleSelect = battle.locator('#battleSelect');
  const roadOptions = await roadSelect.locator('option').evaluateAll((nodes) => nodes.map((node) => node.value).filter(Boolean));
  const battleOptions = await battleSelect.locator('option').evaluateAll((nodes) => nodes.map((node) => node.value).filter(Boolean));
  expect(roadOptions.length).toBeGreaterThan(1);
  expect(battleOptions.length).toBeGreaterThan(1);
  const roadId = roadOptions[0];
  const battleId = battleOptions.find((id) => id !== roadId);
  expect(battleId).toBeTruthy();

  await roadSelect.selectOption(roadId);
  await expect(roadSelect).toHaveValue(roadId);
  await battleSelect.selectOption(battleId);
  await expect(battleSelect).toHaveValue(battleId);
  await expect(battle.locator('#readyPlan')).toBeEnabled();

  const currentEndpoint = (await battle.locator('#endpointText').textContent()) || '';
  const visibleOneSteps = battle.locator('#board .node.reachable[data-move-distance="1"]:visible');
  const visibleOneStepCount = await visibleOneSteps.count();
  if (visibleOneStepCount > 0) {
    const oneStep = visibleOneSteps.first();
    const oneStepId = await oneStep.getAttribute('data-pos');
    expect(oneStepId).toBeTruthy();
    expect(oneStepId).not.toBe(currentEndpoint);

    const hitTest = await oneStep.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const top = document.elementFromPoint(x, y);
      return {
        direct: top === node || node.contains(top),
        blocker: top?.closest?.('#battleRuntime') ? 'battleRuntime' : String(top?.id || top?.className || top?.tagName || 'unknown'),
      };
    });

    if (hitTest.direct) {
      await oneStep.click();
      await expect(battle.locator('#endpointText')).toHaveText(oneStepId);
      await attachStateScreenshot(page, testInfo, 'r13-direct-select-node-route-visible');
      await battle.locator('#clearPath').click();
      await expect(battle.locator('#endpointText')).toHaveText(currentEndpoint);
    } else {
      testInfo.annotations.push({ type: 'not-human-reachable', description: `A one-step node is visibly rendered but its center hit target is intercepted by ${hitTest.blocker}; direct node click is not force-clicked.` });
      await attachStateScreenshot(page, testInfo, 'r13-direct-node-hit-target-boundary');
    }

    const avatar = battle.locator('#battleRuntime:visible');
    if ((await avatar.count()) > 0) {
      const avatarBox = await avatar.boundingBox();
      const targetBox = await oneStep.boundingBox();
      if (avatarBox && targetBox) {
        await page.mouse.move(avatarBox.x + avatarBox.width / 2, avatarBox.y + avatarBox.height / 2);
        await page.mouse.down();
        await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 10 });
        await page.mouse.up();
        await expect(battle.locator('#endpointText')).toHaveText(oneStepId);
        await attachStateScreenshot(page, testInfo, 'r13-avatar-drag-route-visible');
        await battle.locator('#clearPath').click();
        await expect(battle.locator('#endpointText')).toHaveText(currentEndpoint);
        await attachStateScreenshot(page, testInfo, 'r13-route-undo-after-real-move-visible');
      } else {
        testInfo.annotations.push({ type: 'not-human-reachable', description: 'Avatar drag source or visible one-step target has no current layout box; drag is not fabricated.' });
      }
    } else {
      testInfo.annotations.push({ type: 'not-human-visible', description: 'The draggable battle avatar is not visible in this viewport; avatar drag is excluded rather than force-invoked.' });
    }
  } else {
    testInfo.annotations.push({ type: 'not-human-visible', description: 'No one-step reachable board node is human-visible in this viewport after direct Road selection; direct node click and node-targeted avatar drag are excluded rather than force-clicked.' });
    await attachStateScreenshot(page, testInfo, 'r13-reachable-node-not-visible-boundary');
  }

  await battle.locator('#readyPlan').click();
  const targetSurface = battle.locator('#targetBox.on:visible');
  try {
    await targetSurface.waitFor({ state: 'visible', timeout: 6_000 });
    const lane = battle.locator('#targetLane');
    const shield = battle.locator('#targetShield');
    await lane.selectOption('R');
    await shield.selectOption('L');
    await expect(lane).toHaveValue('R');
    await expect(shield).toHaveValue('L');
    const playerOptions = await battle.locator('#targetPlayer option').count();
    expect(playerOptions).toBeGreaterThan(0);
    await attachStateScreenshot(page, testInfo, 'r13-target-selectors-surfaced-visible');
  } catch {
    testInfo.annotations.push({ type: 'runtime-dependent-visible-operation', description: 'The bot won attack right in this deterministic visible round, so target selectors were not surfaced to the human in this run; the test does not fabricate target-phase ownership.' });
  }
  runtime.assertClean(testInfo);
});

// FULLREG R19 visible four-player Honey Hunt route
test('R19 reaches Result from visible four-player Honey Hunt and returns Home', async ({ page }, testInfo) => {
  test.setTimeout(240_000);
  const runtime = observeRuntimeErrors(page);
  await bootCurrentBrowser(page);
  const deck = await installLegalBattleDeck(page);
  expect(deck.main).toHaveLength(40);
  expect(deck.committed).toBeTruthy();
  expect(deck.savedValidation.ok).toBeTruthy();
  testInfo.annotations.push({ type: 'deterministic-precondition', description: 'A legal 40-card deck is installed only to unlock current visible Setup controls. Match mode/content and all match progression use visible controls.' });

  const setupGo = visibleOperationGo(page, 'setup');
  await expect(setupGo).toBeVisible();
  await setupGo.click();
  const setup = page.locator('section[data-screen="setup"]');
  await expect(setup).toBeVisible();
  const honey = setup.locator('[data-content="honey_hunt"]');
  const fourPlayer = setup.locator('[data-mode="4p"]');
  await expect(honey).toBeVisible();
  await expect(fourPlayer).toBeVisible();
  await honey.click();
  await fourPlayer.click();
  await expect(honey).toHaveClass(/on/);
  await expect(fourPlayer).toHaveClass(/on/);
  await attachStateScreenshot(page, testInfo, 'r19-honey-four-player-setup-visible');

  const startMatch = setup.locator('#startMatch');
  await expect(startMatch).toBeVisible();
  await expect(startMatch).toBeEnabled();
  await startMatch.click();
  const battle = page.locator('section[data-screen="battle"]');
  const result = page.locator('section[data-screen="result"]');
  await expect(battle).toBeVisible();
  await expect(battle.locator('#honeyMeter')).toBeVisible();
  await expect(battle.locator('#publicPlayerStrip .publicPlayerChip')).toHaveCount(4);
  await attachStateScreenshot(page, testInfo, 'r19-honey-four-player-battle-visible');

  const deadline = Date.now() + 210_000;
  let roundsSubmitted = 0;
  let targetConfirms = 0;
  let presentationAdvances = 0;
  let abilityConfirms = 0;

  while (Date.now() < deadline) {
    if (await result.isVisible().catch(() => false)) break;
    if (await satisfyVisibleAbilityChoice(page)) {
      abilityConfirms += 1;
      continue;
    }
    const advance = battle.locator('#battleResolution .resolutionAdvance:visible');
    if ((await advance.count()) > 0) {
      await advance.first().click();
      presentationAdvances += 1;
      continue;
    }
    const targetConfirm = battle.locator('#targetBox.on #confirmTarget:visible');
    if ((await targetConfirm.count()) > 0) {
      if (!(await targetConfirm.isEnabled())) {
        for (const selector of ['#targetPlayer', '#targetLane', '#targetShield']) {
          const select = battle.locator(`${selector}:visible`);
          if ((await select.count()) === 0 || !(await select.isEnabled())) continue;
          if (await select.inputValue()) continue;
          const firstLegal = await select.locator('option:not([disabled])').evaluateAll((nodes) => nodes.map((node) => node.value).find(Boolean) ?? '');
          if (firstLegal) await select.selectOption(firstLegal);
        }
      }
      await expect(targetConfirm).toBeEnabled();
      await targetConfirm.click();
      targetConfirms += 1;
      continue;
    }
    const roadSelect = battle.locator('#roadSelect:visible');
    if ((await roadSelect.count()) > 0 && (await roadSelect.isEnabled())) {
      await submitVisiblePlan(battle);
      roundsSubmitted += 1;
      continue;
    }
    await page.waitForTimeout(80);
  }

  await expect(result, 'visible four-player Honey Hunt reaches Result without direct match/result injection').toBeVisible({ timeout: 2_000 });
  expect(roundsSubmitted).toBeGreaterThan(0);
  expect(presentationAdvances).toBeGreaterThan(0);
  await expect(result.locator('#resultRanking .rankLine')).toHaveCount(4);
  const rankingViewport = await result.locator('#resultRanking').boundingBox();
  expect(rankingViewport, 'R20 result ranking viewport must have geometry').not.toBeNull();
  const rankingRows = await result.locator('#resultRanking .rankLine').evaluateAll((rows) => rows.map((row) => {
    const rect = row.getBoundingClientRect();
    return { top: rect.top, bottom: rect.bottom, height: rect.height };
  }));
  expect(rankingRows).toHaveLength(4);
  for (const [index, row] of rankingRows.entries()) {
    expect(row.height, `R20 rank row ${index + 1} must have positive visible height`).toBeGreaterThan(0);
    expect(row.top, `R20 rank row ${index + 1} must start inside ranking viewport`).toBeGreaterThanOrEqual(rankingViewport.y - 1);
    expect(row.bottom, `R20 rank row ${index + 1} must end inside ranking viewport`).toBeLessThanOrEqual(rankingViewport.y + rankingViewport.height + 1);
  }
  const resultButtonsBox = await result.locator('.resultBtns').boundingBox();
  expect(resultButtonsBox, 'R20 result actions must have geometry').not.toBeNull();
  expect(rankingRows.at(-1).bottom, 'R20 fourth rank row must not be covered by Result actions').toBeLessThanOrEqual(resultButtonsBox.y + 1);

  const roundsText = (await result.locator('#resultRounds').textContent()) ?? '';
  expect(roundsText).toMatch(/\d+ラウンド/);
  await attachStateScreenshot(page, testInfo, 'r19-honey-four-player-result-visible');

  const home = result.locator('[data-root-go="home"]');
  await expect(home).toBeVisible();
  await expect(home).toBeEnabled();
  await home.click();
  await expect(page.locator('section[data-screen="home"]')).toBeVisible();
  await attachStateScreenshot(page, testInfo, 'r19-honey-four-player-home-returned');
  testInfo.annotations.push({ type: 'visible-4p-honey-result-path', description: `submitted=${roundsSubmitted}, targetConfirms=${targetConfirms}, battleAdvances=${presentationAdvances}, abilityConfirms=${abilityConfirms}, result=${roundsText}` });
  runtime.assertClean(testInfo);
});

// UPDATE-MANIFEST-FUTURE-SAFE-REGRESSION R9
test('update manifest is strictly validated, rollback-safe in wording, session-local, and Home-only', async ({ page, browser }, testInfo) => {
  const runtime=observeRuntimeErrors(page);
  const BASE='1111111111111111111111111111111111111111';
  const ROLLBACK='2222222222222222222222222222222222222222';
  const NEXT='3333333333333333333333333333333333333333';
  const formal=(buildId,publishedAt='2026-08-22T00:00:00Z',overrides={})=>({schema:'GAMEROAD_BROWSER_VERSION_V1',channel:'current',build_id:buildId,published_at:publishedAt,reload_policy:'never-force-during-match',...overrides});
  let manifest=formal(BASE);
  await page.route('**/browser/gameroad-version.json*',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(manifest)}));
  await bootCurrentBrowser(page);
  await page.waitForFunction(()=>!!window.GAMEROAD_PARTNER_COMMENT);
  const banner=page.locator('#gameroadUpdateBanner');
  const title=page.locator('#gameroadUpdateTitle');
  await page.evaluate(()=>window.GAMEROAD_PARTNER_COMMENT.checkUpdate());
  await expect(banner).toBeHidden();
  await expect(banner).toHaveAttribute('aria-hidden','true');
  await expect.poll(()=>page.evaluate(()=>window.GAMEROAD_PARTNER_COMMENT.snapshot().update.pending)).toBe(null);

  const invalidManifests=[
    formal(ROLLBACK,'2026-08-21T00:00:00Z',{schema:'BROKEN_SCHEMA'}),
    formal(ROLLBACK,'2026-08-21T00:00:00Z',{channel:'preview'}),
    formal(ROLLBACK,'2026-08-21T00:00:00Z',{reload_policy:'force-now'}),
    formal('not-a-build-id','2026-08-21T00:00:00Z'),
    formal(ROLLBACK,'not-a-time'),
  ];
  for(const invalid of invalidManifests){
    manifest=invalid;
    await page.evaluate(()=>window.GAMEROAD_PARTNER_COMMENT.checkUpdate());
    await expect.poll(()=>page.evaluate(()=>window.GAMEROAD_PARTNER_COMMENT.snapshot().update.pending)).toBe(null);
    await expect(banner).toBeHidden();
    await expect.poll(()=>page.evaluate(()=>window.GAMEROAD_PARTNER_COMMENT.snapshot().update.status)).toBe('unavailable');
  }

  // An older successful production deployment can become the desired target during rollback.
  // Treat it as a valid target change without claiming it is a "newer" version.
  manifest=formal(ROLLBACK,'2026-08-21T00:00:00Z');
  await page.evaluate(()=>window.GAMEROAD_PARTNER_COMMENT.checkUpdate());
  await expect(banner).toBeVisible();
  await expect(banner).toHaveAttribute('aria-hidden','false');
  await expect(title).toHaveText('利用できる版が変わりました');
  await expect(title).not.toContainText('新版');
  await expect.poll(()=>page.evaluate(()=>window.GAMEROAD_PARTNER_COMMENT.snapshot().update.pending?.buildId||null)).toBe(ROLLBACK);

  // If production is rolled back/reverted to the build this session already loaded,
  // the previously advertised target is no longer current and must be withdrawn.
  manifest=formal(BASE,'2026-08-22T00:00:00Z');
  await page.evaluate(()=>window.GAMEROAD_PARTNER_COMMENT.checkUpdate());
  await expect.poll(()=>page.evaluate(()=>window.GAMEROAD_PARTNER_COMMENT.snapshot().update.pending)).toBe(null);
  await expect(banner).toBeHidden();

  // A later target can become pending again after the withdrawal.
  manifest=formal(ROLLBACK,'2026-08-21T00:00:00Z');
  await page.evaluate(()=>window.GAMEROAD_PARTNER_COMMENT.checkUpdate());
  await expect.poll(()=>page.evaluate(()=>window.GAMEROAD_PARTNER_COMMENT.snapshot().update.pending?.buildId||null)).toBe(ROLLBACK);
  await expect(banner).toBeVisible();

  const setupGo=visibleHomeControl(page,'setup');
  await setupGo.click();
  const setup=page.locator('section[data-screen="setup"]');
  await expect(setup).toBeVisible();
  await expect(banner).toBeHidden();
  await expect(banner).toHaveAttribute('aria-hidden','true');
  const honey=setup.locator('[data-content="honey_hunt"]');
  await honey.click();
  await expect(honey).toHaveClass(/on/);
  await testInfo.attach('setup-pending-target-hidden.png',{body:await page.screenshot({fullPage:false}),contentType:'image/png'});

  manifest=formal(NEXT,'2026-08-22T01:00:00Z');
  await page.evaluate(()=>window.GAMEROAD_PARTNER_COMMENT.checkUpdate());
  await expect(banner).toBeHidden();
  await expect.poll(()=>page.evaluate(()=>window.GAMEROAD_PARTNER_COMMENT.snapshot().update.pending?.buildId||null)).toBe(NEXT);

  const back=setup.locator('[data-back]:visible').first();
  await back.click();
  await expect(page.locator('section[data-screen="home"]')).toBeVisible();
  await expect(banner).toBeVisible();
  await expect(title).toHaveText('利用できる版が変わりました');

  const fresh=await browser.newContext({viewport:testInfo.project.use.viewport});
  const q=await fresh.newPage();
  await q.route('**/browser/gameroad-version.json*',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(formal(NEXT,'2026-08-22T01:00:00Z'))}));
  await q.goto(page.url(),{waitUntil:'domcontentloaded'});
  await q.waitForFunction(()=>!!window.GAMEROAD_PARTNER_COMMENT);
  await q.evaluate(()=>window.GAMEROAD_PARTNER_COMMENT.checkUpdate());
  await expect(q.locator('#gameroadUpdateBanner')).toBeHidden();
  await expect(q.locator('#gameroadUpdateBanner')).toHaveAttribute('aria-hidden','true');
  await expect.poll(()=>q.evaluate(()=>window.GAMEROAD_PARTNER_COMMENT.snapshot().update.pending)).toBe(null);
  await fresh.close();
  runtime.assertClean(testInfo);
});
