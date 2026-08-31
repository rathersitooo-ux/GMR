import { test, expect } from '@playwright/test';

const CORE_SCREENS = ['home', 'cards', 'characters', 'setup', 'missions', 'profile', 'shop', 'records', 'settings', 'gacha'];
const ROOT_TARGETS = ['cards', 'characters', 'setup', 'missions', 'profile', 'shop', 'records', 'settings'];
const CHILD_TARGETS = {
  profile: ['characters', 'records', 'settings'],
  shop: ['gacha', 'characters', 'cards'],
};
const SEEDS = [0x52a71f, 0xc0ffee, 0x5eed1234];
const STEPS_PER_SEED = 12;

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
          description: `gameroad-version.json returned 404 ${versionManifest404Count} time(s); tracked separately from state-sequence evidence`,
        });
      }
      expect(unexpectedHttpErrors, `unexpected HTTP errors:\n${unexpectedHttpErrors.join('\n')}`).toEqual([]);
      expect(pageErrors, `page errors:\n${pageErrors.join('\n')}`).toEqual([]);
      expect(remainingConsoleErrors, `console errors:\n${remainingConsoleErrors.join('\n')}`).toEqual([]);
    },
  };
}

function seededNext(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state;
  };
}

function legalCommands(model) {
  const current = model.stack.at(-1);
  if (current === 'home') {
    return ROOT_TARGETS.map((target) => ({ kind: 'go', target }));
  }

  const commands = (CHILD_TARGETS[current] ?? []).map((target) => ({ kind: 'go', target }));
  commands.push({ kind: 'back' });
  return commands;
}

async function bootCurrentBrowser(page) {
  const response = await page.goto('/browser/GAMEROAD.html', { waitUntil: 'domcontentloaded' });
  expect(response, 'main HTML response').not.toBeNull();
  expect(response.ok(), `main HTML status ${response.status()}`).toBeTruthy();
  await page.waitForTimeout(400);
  for (const screen of CORE_SCREENS) {
    expect(await page.locator(`section[data-screen="${screen}"]`).count(), `required screen ${screen}`).toBeGreaterThan(0);
  }
  await expect(page.locator('section[data-screen="home"]')).toBeVisible();
}

async function assertModelScreen(page, model) {
  const expectedScreen = model.stack.at(-1);
  const active = page.locator('section.screen.active:visible');
  await expect(active, `exactly one active screen for model=${model.stack.join('>')}`).toHaveCount(1);
  await expect(active).toHaveAttribute('data-screen', expectedScreen);
}

function rootGo(page, target) {
  return page
    .locator(`[data-go="${target}"]:visible, [data-home-target="${target}"]:visible, [data-root-go="${target}"]:visible`)
    .first();
}

function nestedGo(page, current, target) {
  return page.locator(`section[data-screen="${current}"] [data-go="${target}"]:visible`).first();
}

async function executeCommand(page, model, command) {
  const current = model.stack.at(-1);

  if (command.kind === 'go') {
    const control = current === 'home' ? rootGo(page, command.target) : nestedGo(page, current, command.target);
    await expect(control, `precondition ${current} -> ${command.target} has a visible legal control`).toBeVisible();
    await control.click();
    model.stack.push(command.target);
    await expect(page.locator(`section[data-screen="${command.target}"]`), `transition ${current} -> ${command.target}`).toBeVisible();
    await assertModelScreen(page, model);
    return;
  }

  expect(command.kind).toBe('back');
  expect(model.stack.length, `back requires a parent state; stack=${model.stack.join('>')}`).toBeGreaterThan(1);
  const expectedParent = model.stack.at(-2);
  const back = page.locator(`section[data-screen="${current}"] [data-back]:visible`).first();
  await expect(back, `precondition ${current} -> ${expectedParent} has a visible Back control`).toBeVisible();
  await back.click();
  model.stack.pop();
  await expect(page.locator(`section[data-screen="${expectedParent}"]`), `back transition ${current} -> ${expectedParent}`).toBeVisible();
  await assertModelScreen(page, model);
}

async function attachReplay(testInfo, name, payload) {
  await testInfo.attach(name, {
    body: Buffer.from(`${JSON.stringify(payload, null, 2)}\n`, 'utf8'),
    contentType: 'application/json',
  });
}

test('R26 explores deterministic legal navigation sequences with replayable seeds', async ({ page }, testInfo) => {
  const runtime = observeRuntimeErrors(page);
  const completed = [];

  for (const seed of SEEDS) {
    await bootCurrentBrowser(page);
    const model = { stack: ['home'] };
    const trace = [];
    const next = seededNext(seed);
    const seedHex = `0x${seed.toString(16)}`;
    testInfo.annotations.push({ type: 'r26-replay-seed', description: `${seedHex}; steps=${STEPS_PER_SEED}` });
    await assertModelScreen(page, model);

    try {
      for (let step = 0; step < STEPS_PER_SEED; step += 1) {
        const commands = legalCommands(model);
        expect(commands.length, `model has at least one legal command at ${model.stack.join('>')}`).toBeGreaterThan(0);
        const command = commands[next() % commands.length];
        const before = [...model.stack];
        await executeCommand(page, model, command);
        trace.push({ step, before, command, after: [...model.stack] });
      }
    } catch (error) {
      await attachReplay(testInfo, `r26-state-sequence-failure-${seedHex}.json`, {
        seed,
        seedHex,
        configuredSteps: STEPS_PER_SEED,
        executedPrefix: trace,
        modelAtFailure: model,
        reproduction: `Run this test with seed ${seedHex}; command choice is deterministic from the model state and seed.`,
      });
      throw error;
    }

    completed.push({ seed, seedHex, trace, finalModel: { stack: [...model.stack] } });
  }

  await attachReplay(testInfo, 'r26-state-sequence-replay.json', {
    method: 'bounded deterministic model-based navigation sequence',
    seeds: completed,
    nonClaims: ['exhaustive state coverage', 'automatic shrinking', 'human acceptance', 'physical-device acceptance'],
  });
  const finalPng = await page.screenshot({ fullPage: true, animations: 'disabled' });
  await testInfo.attach(`${testInfo.project.name}-r26-state-sequence-final.png`, { body: finalPng, contentType: 'image/png' });

  runtime.assertClean(testInfo);
});

test('R29 @mobile-touch drives a visible Home to Cards transition with real touch input', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'phone-touch-390x844', 'touch-only evidence project');
  const runtime = observeRuntimeErrors(page);
  await bootCurrentBrowser(page);

  const touchCapabilities = await page.evaluate(() => ({
    maxTouchPoints: navigator.maxTouchPoints,
    hasTouchEvent: 'ontouchstart' in window,
  }));
  expect(touchCapabilities.maxTouchPoints, 'emulated browser exposes touch points').toBeGreaterThan(0);
  expect(touchCapabilities.hasTouchEvent, 'emulated browser exposes touch events').toBeTruthy();

  const home = page.locator('section[data-screen="home"]');
  const cards = page.locator('section[data-screen="cards"]');
  await expect(home).toBeVisible();
  await expect(cards).toBeHidden();
  const beforePng = await page.screenshot({ fullPage: true, animations: 'disabled' });
  await testInfo.attach(`${testInfo.project.name}-touch-home-before-tap.png`, { body: beforePng, contentType: 'image/png' });

  const cardsControl = rootGo(page, 'cards');
  await expect(cardsControl).toBeVisible();
  await cardsControl.tap();

  await expect(cards).toBeVisible();
  await expect(home).toBeHidden();
  const afterPng = await page.screenshot({ fullPage: true, animations: 'disabled' });
  await testInfo.attach(`${testInfo.project.name}-touch-cards-after-tap.png`, { body: afterPng, contentType: 'image/png' });

  runtime.assertClean(testInfo);
  testInfo.annotations.push({
    type: 'input-modality-evidence',
    description: `touch maxTouchPoints=${touchCapabilities.maxTouchPoints}; visible Home→Cards transition completed with locator.tap()`,
  });
});

test('R19R2 mounts accepted replay rows on the production Result surface', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-1280x720', 'single-project replay mount evidence');
  test.setTimeout(120_000);
  const runtime = observeRuntimeErrors(page);
  await bootCurrentBrowser(page);

  const driven = await page.evaluate(async () => {
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
    if (!committed) {
      return { reached: false, reason: 'LEGAL_DECK_COMMIT_FAILED', setValidation, draftValidation };
    }

    t.battlePresentationFast(true);
    const match = t.start('2p', 'road_shield');
    window.__V105_ABILITY_TEST__?.setAutoChoices?.(true);
    const reached = await t.autoToResult(30);
    return {
      reached,
      screen: t.state.screen,
      matchId: match?.id ?? null,
      rounds: match?.round ?? null,
      historyLength: t.state.history?.length ?? 0,
    };
  });

  expect(driven.reached, JSON.stringify(driven)).toBeTruthy();
  expect(driven.screen).toBe('result');
  expect(driven.matchId).not.toBeNull();
  expect(driven.historyLength).toBeGreaterThan(0);

  const result = page.locator('section[data-screen="result"]');
  await expect(result).toBeVisible();
  const replay = result.locator('#resultReplay');
  await expect(replay, 'production Result exposes the accepted replay projection').toBeVisible({ timeout: 5_000 });
  const replayRows = replay.locator('#resultReplayEvents .rankLine');
  const rowCount = await replayRows.count();
  expect(rowCount, 'accepted replay contains at least one battle resolution plus match end').toBeGreaterThan(1);
  const replayText = (await replayRows.allTextContents()).join('\n');
  expect(replayText, 'accepted replay contains a battle-resolution row').toMatch(/第\d+ラウンド/);
  expect(replayText, 'accepted replay contains the match-end row').toContain('対戦終了');

  const summary = replay.locator('summary');
  await expect(summary).toBeVisible();
  await summary.focus();
  await expect(summary).toBeFocused();
  await summary.press('Enter');
  await expect(replay).toHaveAttribute('open', '');
  await expect(replayRows.first()).toBeVisible();
  const replayPng = await page.screenshot({ fullPage: true, animations: 'disabled' });
  await testInfo.attach(`${testInfo.project.name}-r19r2-result-replay-open.png`, { body: replayPng, contentType: 'image/png' });
  testInfo.annotations.push({
    type: 'result-replay-runtime-evidence',
    description: `match=${driven.matchId}; rounds=${driven.rounds}; replayRows=${rowCount}; production Result replay opened with native summary keyboard activation after current runtime accepted-event projection`,
  });

  runtime.assertClean(testInfo);
});

async function visibleLoopScreenshot(page, testInfo, stateName) {
  const png = await page.screenshot({ fullPage: true, animations: 'disabled' });
  await testInfo.attach(`${testInfo.project.name}-${stateName}.png`, { body: png, contentType: 'image/png' });
}

async function visibleLoopNumeric(locator) {
  return Number.parseInt((await locator.textContent()) ?? '', 10);
}

async function buildAndSaveVisibleLoopDeck(page, testInfo) {
  const cardsGo = rootGo(page, 'cards');
  await expect(cardsGo).toBeVisible();
  await cardsGo.click();
  const cards = page.locator('section[data-screen="cards"]');
  await expect(cards).toBeVisible();

  const deckCount = cards.locator('#deckCount');
  const initialCount = await visibleLoopNumeric(deckCount);
  expect(Number.isFinite(initialCount), 'initial main-deck count').toBeTruthy();
  expect(initialCount, 'default deck leaves room for visible additions').toBeLessThan(40);

  const candidateIds = await cards
    .locator('#collectionGrid button.slot.live.cardFace:not(.inDeck)[data-id]')
    .evaluateAll((nodes) => [...new Set(nodes.map((node) => node.getAttribute('data-id')).filter(Boolean))]);
  const rejected = [];

  for (const cardId of candidateIds) {
    const before = await visibleLoopNumeric(deckCount);
    if (before >= 40) break;
    const candidate = cards
      .locator(`#collectionGrid button.slot.live.cardFace:not(.inDeck)[data-id="${cardId}"]:visible`)
      .first();
    if ((await candidate.count()) === 0) continue;

    await candidate.click();
    const add = cards.locator('#addSelectedCard');
    await expect(add, `visible add control for ${cardId}`).toBeVisible();
    await expect(add, `visible add control for ${cardId}`).toBeEnabled();
    await add.click();
    await page.waitForTimeout(120);

    const after = await visibleLoopNumeric(deckCount);
    expect([before, before + 1], `deck count after visible add for ${cardId}`).toContain(after);
    if (after === before) rejected.push(cardId);

    const closePreview = cards.locator('#r4PreviewClose:visible');
    if ((await closePreview.count()) > 0) await closePreview.click();
  }

  if (rejected.length > 0) {
    testInfo.annotations.push({
      type: 'visible-rule-rejection',
      description: `Current deck rules rejected visible add attempts for ${rejected.join(', ')}; other visible candidates were used without bypassing rules.`,
    });
  }

  await expect(deckCount, 'visible Deck construction reaches 40').toHaveText('40');
  await expect(cards.locator('#exDeckCount')).toHaveText('0');

  const trayToggle = cards.locator('#r4DeckTrayToggle:visible');
  if ((await trayToggle.count()) > 0) {
    await trayToggle.click();
    await page.waitForTimeout(120);
  }

  const save = cards.locator('#saveDeck');
  await expect(save).toBeVisible();
  await expect(save).toBeEnabled();
  await save.click();
  await expect(cards.locator('#deckSaveState')).toHaveText('保存済み');
  await visibleLoopScreenshot(page, testInfo, 'visible-first-loop-deck-saved');

  if ((await trayToggle.count()) > 0) {
    await trayToggle.click();
    await page.waitForTimeout(120);
  }

  const back = cards.locator('[data-back]:visible').first();
  await expect(back).toBeVisible();
  await back.click();
  await expect(page.locator('section[data-screen="home"]')).toBeVisible();
}

async function satisfyVisibleLoopAbility(page) {
  const veil = page.locator('#abilityVeil.on:visible');
  if ((await veil.count()) === 0) return false;
  const choices = veil.locator('#abilityChoices .abilityChoice:visible');
  const confirm = veil.locator('#abilityConfirm:visible');
  const count = await choices.count();
  expect(count, 'visible ability choice has an option').toBeGreaterThan(0);
  for (let index = 0; index < count; index += 1) {
    await choices.nth(index).click();
    if (await confirm.isEnabled()) {
      await confirm.click();
      return true;
    }
  }
  throw new Error('visible ability choice never enabled confirm');
}

async function submitVisibleLoopPlan(battle) {
  const roadSelect = battle.locator('#roadSelect');
  const battleSelect = battle.locator('#battleSelect');
  const hand = battle.locator('#hand .handCard:visible:not(:disabled)');
  expect(await hand.count(), 'visible plan has at least two playable hand cards').toBeGreaterThanOrEqual(2);

  if (!(await roadSelect.inputValue())) await hand.nth(0).click();
  if (!(await battleSelect.inputValue())) {
    const roadValue = await roadSelect.inputValue();
    const candidates = battle.locator('#hand .handCard:visible:not(:disabled)');
    let picked = false;
    for (let index = 0; index < await candidates.count(); index += 1) {
      const id = await candidates.nth(index).getAttribute('data-card-id');
      if (!id || id === roadValue) continue;
      await candidates.nth(index).click();
      if (await battleSelect.inputValue()) {
        picked = true;
        break;
      }
    }
    expect(picked, 'second visible hand card becomes Battle').toBeTruthy();
  }

  expect(await roadSelect.inputValue()).not.toBe('');
  expect(await battleSelect.inputValue()).not.toBe('');
  expect(await battleSelect.inputValue()).not.toBe(await roadSelect.inputValue());
  const ready = battle.locator('#readyPlan');
  await expect(ready).toBeEnabled();
  await ready.click();
}

test('R30 closes visible Home Deck Battle Result Home without state injection', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'phone-touch-390x844', 'base viewport matrix covers this loop; touch project remains dedicated to @mobile-touch evidence');
  test.setTimeout(180_000);
  const runtime = observeRuntimeErrors(page);
  await bootCurrentBrowser(page);
  await visibleLoopScreenshot(page, testInfo, 'visible-first-loop-home-start');

  await buildAndSaveVisibleLoopDeck(page, testInfo);

  const setupGo = rootGo(page, 'setup');
  await expect(setupGo).toBeVisible();
  await setupGo.click();
  const setup = page.locator('section[data-screen="setup"]');
  await expect(setup).toBeVisible();
  await setup.locator('[data-content="road_shield"]').click();
  await setup.locator('[data-mode="2p"]').click();
  const start = setup.locator('#startMatch');
  await expect(start, 'visible saved deck unlocks Start without test-state injection').toBeVisible();
  await expect(start, 'visible saved deck unlocks Start without test-state injection').toBeEnabled();
  await visibleLoopScreenshot(page, testInfo, 'visible-first-loop-setup-ready');
  await start.click();

  const battle = page.locator('section[data-screen="battle"]');
  const result = page.locator('section[data-screen="result"]');
  await expect(battle).toBeVisible();
  await expect(battle.locator('#phaseTitle')).toContainText('行動を計画');
  await visibleLoopScreenshot(page, testInfo, 'visible-first-loop-battle-start');

  const deadline = Date.now() + 100_000;
  let plans = 0;
  let advances = 0;
  let targets = 0;
  let abilities = 0;

  while (Date.now() < deadline) {
    if (await result.isVisible().catch(() => false)) break;

    if (await satisfyVisibleLoopAbility(page)) {
      abilities += 1;
      continue;
    }

    const advance = battle.locator('#battleResolution .resolutionAdvance:visible');
    if ((await advance.count()) > 0) {
      await advance.first().click();
      advances += 1;
      continue;
    }

    const targetConfirm = battle.locator('#targetBox.on #confirmTarget:visible');
    if ((await targetConfirm.count()) > 0) {
      await targetConfirm.click();
      targets += 1;
      continue;
    }

    const roadSelect = battle.locator('#roadSelect:visible');
    if ((await roadSelect.count()) > 0 && (await roadSelect.isEnabled())) {
      await submitVisibleLoopPlan(battle);
      plans += 1;
      continue;
    }

    await page.waitForTimeout(80);
  }

  await expect(result, 'visible Battle progression reaches Result without direct state/result injection').toBeVisible({ timeout: 2_000 });
  expect(plans, 'at least one visible plan was submitted').toBeGreaterThan(0);
  await expect(result.locator('#resultRanking .rankLine')).toHaveCount(2);
  await expect(result.locator('#resultMode')).toHaveText('二人');
  const rounds = (await result.locator('#resultRounds').textContent()) ?? '';
  expect(rounds).toMatch(/\d+ラウンド/);
  await visibleLoopScreenshot(page, testInfo, 'visible-first-loop-result');

  const home = result.locator('[data-root-go="home"]');
  await expect(home).toBeVisible();
  await expect(home).toBeEnabled();
  await home.click();
  await expect(page.locator('section[data-screen="home"]')).toBeVisible();
  await visibleLoopScreenshot(page, testInfo, 'visible-first-loop-home-returned');

  testInfo.annotations.push({
    type: 'visible-first-loop',
    description: `plans=${plans}, battleAdvances=${advances}, targetConfirms=${targets}, abilityConfirms=${abilities}, result=${rounds}`,
  });
  runtime.assertClean(testInfo);
});
