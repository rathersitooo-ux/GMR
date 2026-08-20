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