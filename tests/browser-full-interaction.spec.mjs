import { test, expect } from '@playwright/test';

const CORE_SCREENS = ['home', 'cards', 'characters', 'setup', 'battle', 'result', 'shop'];
const NAV_TARGETS = ['cards', 'characters', 'setup', 'battle', 'shop'];
const STORAGE_KEY = 'gameroad.browser.v10.core.1';

function observeRuntimeErrors(page) {
  const pageErrors = [];
  const consoleErrors = [];
  const unexpectedHttpErrors = [];
  let versionManifest404Count = 0;

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
    unexpectedHttpErrors.push(`${response.status()} ${url.pathname}`);
  });

  return {
    assertClean(testInfo) {
      const remainingConsoleErrors = [...consoleErrors];
      for (let i = 0; i < versionManifest404Count; i += 1) {
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
    .locator(`[data-go="${target}"]:visible, [data-home-target="${target}"]:visible`)
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
  expect(await handCards.count(), 'visible plan hand has at least two cards').toBeGreaterThanOrEqual(2);

  if (!(await roadSelect.inputValue())) await handCards.nth(0).click();
  if (!(await battleSelect.inputValue())) {
    const roadValue = await roadSelect.inputValue();
    const candidates = battle.locator('#hand .handCard:visible:not(:disabled)');
    const candidateCount = await candidates.count();
    let picked = false;
    for (let i = 0; i < candidateCount; i += 1) {
      const id = await candidates.nth(i).getAttribute('data-card-id');
      if (!id || id === roadValue) continue;
      await candidates.nth(i).click();
      if (await battleSelect.inputValue()) {
        picked = true;
        break;
      }
    }
    expect(picked, 'a different visible hand card can be reserved as Battle').toBeTruthy();
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
  const roundsText = (await result.locator('#resultRounds').textContent()) ?? '';
  expect(roundsText, 'Result exposes a real round count').toMatch(/\d+ラウンド/);
  await expect(result.locator('#resultRanking .rankLine')).toHaveCount(2);
  await expect(result.locator('#resultMode')).toHaveText('二人');
  await attachStateScreenshot(page, testInfo, `${evidencePrefix}-result-visible`);
  testInfo.annotations.push({
    type: 'visible-result-path',
    description: `submitted=${roundsSubmitted}, targetConfirms=${targetConfirms}, battleAdvances=${presentationAdvances}, abilityConfirms=${abilityConfirms}, result=${roundsText}`,
  });
  return { battle, result, roundsSubmitted, targetConfirms, presentationAdvances, abilityConfirms, roundsText };
}

test('captures success-state screenshots for current pointer navigation', async ({ page }, testInfo) => {
  const runtime = observeRuntimeErrors(page);
  await bootCurrentBrowser(page);
  await attachStateScreenshot(page, testInfo, 'home');

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
  expect(initialCount, 'default deck leaves room for UI additions').toBeLessThan(40);

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

  const handCards = battle.locator('#hand .handCard:visible');
  await expect(handCards).toHaveCount(3);
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
  expect(defaultDeck).toHaveLength(26);

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

  const legacyRaw = JSON.stringify({ v: 2, selectedCharacter: 'partner.naki', history: [{ keep: 'legacy-history' }], settings: { reduceMotion: true }, progression: { battlePoints: 9 }, setupMode: '4p', setupContent: 'honey_hunt', deck: { main: defaultDeck, ex: [], ruleId: 'FIRST_REGULATION', ruleRevision: 2 }, opaque: { keep: 9 } });
  observed = await reloadWithRaw(legacyRaw);
  expect(observed.raw).toBe(legacyRaw);
  expect(observed.recovery.classification.status).toBe('recognized_legacy');
  expect(observed.savedDeck).toHaveLength(26);
  expect(observed.rule.revision).toBe(2);
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
    Object.defineProperty(proto, 'setItem', { configurable: true, writable: true, value(k, v) { writes += 1; return originalSetItem.call(this, k, writes === 1 ? `${v}x` : v); } });
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
  expect(afterReset.savedCount).toBe(26);
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
    Object.defineProperty(proto, 'setItem', { configurable: true, writable: true, value() { throw new Error('forced-storage-write-failure'); } });
    let committed;
    try { committed = t.deckCommit(); } finally { Object.defineProperty(proto, 'setItem', { configurable: true, writable: true, value: originalSetItem }); }
    return { committed, setValidation, raw: localStorage.getItem(key), recovery: window.__GAMEROAD_SAVE_RECOVERY__.snapshot(), savedCount: t.state.savedDeck.main.length };
  }, STORAGE_KEY);
  expect(writeFailure.setValidation.ok).toBeTruthy();
  expect(writeFailure.committed).toBeFalsy();
  expect(writeFailure.raw).toBeNull();
  expect(writeFailure.savedCount).toBe(26);
  expect(writeFailure.recovery.write.status).toBe('failed');
  runtime.assertClean(testInfo);
});

// FULLREG R12 supplemental visible-operation coverage
function visibleOperationGo(page, target) {
  return page
    .locator(`[data-go="${target}"]:visible, [data-home-target="${target}"]:visible, [data-root-go="${target}"]:visible`)
    .first();
}

async function backOperationVisible(page) {
  const back = page.locator('section.screen.active [data-back]:visible').first();
  await expect(back).toBeVisible();
  await back.click();
}

test('covers Home collapse/expand plus auxiliary Settings navigation without claiming hidden controls', async ({ page }, testInfo) => {
  const runtime = observeRuntimeErrors(page);
  await bootCurrentBrowser(page);

  const center = page.locator('#homePadCenter:visible');
  if ((await center.count()) > 0) {
    await center.click();
    await expect(center).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('section[data-screen="home"]')).toHaveAttribute('data-home-state', 'HOME_COLLAPSED');
    await attachStateScreenshot(page, testInfo, 'home-collapsed-visible');

    await center.click();
    await expect(center).toHaveAttribute('aria-expanded', 'true');
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

test('covers partner/player role tabs and a real visible character selection', async ({ page }, testInfo) => {
  const runtime = observeRuntimeErrors(page);
  await bootCurrentBrowser(page);

  const charactersGo = visibleOperationGo(page, 'characters');
  await expect(charactersGo).toBeVisible();
  await charactersGo.click();
  const characters = page.locator('section[data-screen="characters"]');
  await expect(characters).toBeVisible();

  await characters.locator('[data-role="player"]').click();
  const unselected = characters.locator('.charCard[aria-pressed="false"]').first();
  await expect(unselected).toBeVisible();
  const targetText = (await unselected.textContent())?.trim() || '';
  const targetName = targetText.replace(/操作人物にする|選択中/g, '').trim();
  expect(targetName).not.toBe('');
  await unselected.click();
  const selected = characters.locator('.charCard[aria-pressed="true"]');
  await expect(selected).toHaveCount(1);
  await expect(selected).toContainText(targetName);
  await attachStateScreenshot(page, testInfo, 'player-character-selection-visible');

  await characters.locator('[data-role="partner"]').click();
  await attachStateScreenshot(page, testInfo, 'partner-role-visible');
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
