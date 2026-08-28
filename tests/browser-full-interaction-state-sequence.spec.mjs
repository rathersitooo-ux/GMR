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

async function r43VisibleInternalSnapshot(page, label) {
  const snapshot = await page.evaluate((snapshotLabel) => {
    const visible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };
    const active = [...document.querySelectorAll('section.screen.active')].filter(visible);
    return {
      label: snapshotLabel,
      now: Date.now(),
      performanceNow: performance.now(),
      visibleActiveCount: active.length,
      visibleScreen: active[0]?.dataset.screen ?? null,
      internalScreen: window.__GAMEROAD_TEST__?.state?.screen ?? null,
      activeText: active[0]?.innerText?.slice(0, 240) ?? '',
    };
  }, label);

  expect(snapshot.visibleActiveCount, `${label}: exactly one visible active screen`).toBe(1);
  expect(snapshot.internalScreen, `${label}: internal current screen is exposed`).toBeTruthy();
  expect(snapshot.visibleScreen, `${label}: visible and internal screen agree at the same sample`).toBe(snapshot.internalScreen);
  return snapshot;
}

async function r43WebQualitySnapshot(page) {
  return page.evaluate(() => {
    const visible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };
    const accessibleNameProxy = (element) => {
      const ariaLabel = element.getAttribute('aria-label')?.trim();
      if (ariaLabel) return ariaLabel;
      const labelledBy = element.getAttribute('aria-labelledby');
      if (labelledBy) {
        const text = labelledBy
          .split(/\s+/)
          .map((id) => document.getElementById(id)?.textContent?.trim() ?? '')
          .filter(Boolean)
          .join(' ');
        if (text) return text;
      }
      if ('labels' in element && element.labels?.length) {
        const text = [...element.labels].map((label) => label.textContent?.trim() ?? '').filter(Boolean).join(' ');
        if (text) return text;
      }
      const text = element.textContent?.trim();
      if (text) return text;
      return element.getAttribute('title')?.trim() || element.getAttribute('alt')?.trim() || element.getAttribute('value')?.trim() || '';
    };

    const active = [...document.querySelectorAll('section.screen.active')].find(visible) ?? null;
    const interactiveSelector = 'button, a[href], input, select, textarea, [role="button"], [tabindex]:not([tabindex="-1"])';
    const interactives = active ? [...active.querySelectorAll(interactiveSelector)].filter(visible) : [];
    const unnamedInteractives = interactives
      .filter((element) => !accessibleNameProxy(element))
      .slice(0, 30)
      .map((element) => ({
        tag: element.tagName.toLowerCase(),
        id: element.id || null,
        role: element.getAttribute('role'),
        type: element.getAttribute('type'),
        className: String(element.className || '').slice(0, 120) || null,
      }));

    const ids = active ? [...active.querySelectorAll('[id]')].filter(visible).map((element) => element.id).filter(Boolean) : [];
    const duplicateVisibleIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
    const ariaHiddenFocusable = [...document.querySelectorAll('[aria-hidden="true"]')]
      .flatMap((container) => [...container.querySelectorAll(interactiveSelector)])
      .filter(visible)
      .slice(0, 30)
      .map((element) => element.id || element.tagName.toLowerCase());

    const navigation = performance.getEntriesByType('navigation')[0] ?? null;
    const resources = performance.getEntriesByType('resource');
    return {
      document: {
        lang: document.documentElement.lang || '',
        title: document.title || '',
        viewportMeta: document.querySelector('meta[name="viewport"]')?.getAttribute('content') ?? '',
      },
      activeScreen: {
        visible: active?.dataset.screen ?? null,
        internal: window.__GAMEROAD_TEST__?.state?.screen ?? null,
        interactiveCount: interactives.length,
        unnamedInteractiveCount: unnamedInteractives.length,
        unnamedInteractives,
        duplicateVisibleIds,
        ariaHiddenFocusable,
      },
      layout: {
        viewportWidth: document.documentElement.clientWidth,
        viewportHeight: document.documentElement.clientHeight,
        documentWidth: document.documentElement.scrollWidth,
        documentHeight: document.documentElement.scrollHeight,
        overflowX: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
      },
      performance: {
        navigation: navigation ? {
          responseStart: navigation.responseStart,
          responseEnd: navigation.responseEnd,
          domContentLoadedEventEnd: navigation.domContentLoadedEventEnd,
          loadEventEnd: navigation.loadEventEnd,
          duration: navigation.duration,
        } : null,
        resourceCount: resources.length,
        transferSize: resources.reduce((sum, entry) => sum + (Number(entry.transferSize) || 0), 0),
        encodedBodySize: resources.reduce((sum, entry) => sum + (Number(entry.encodedBodySize) || 0), 0),
      },
    };
  });
}

test('R43 controlled browser time keeps visible and internal screen state aligned', async ({ page }, testInfo) => {
  const runtime = observeRuntimeErrors(page);
  const fixedTime = new Date('2026-08-28T00:00:00.000Z');
  await page.clock.install({ time: fixedTime });
  await bootCurrentBrowser(page);
  const installedNow = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(installedNow);

  const timeline = [];
  timeline.push(await r43VisibleInternalSnapshot(page, 'home-paused'));

  await page.evaluate(() => {
    document.documentElement.dataset.gameroadTemporalProbe = 'pending';
    setTimeout(() => {
      document.documentElement.dataset.gameroadTemporalProbe = 'done';
    }, 250);
  });
  await page.clock.runFor(249);
  expect(await page.locator('html').getAttribute('data-gameroad-temporal-probe')).toBe('pending');
  timeline.push(await r43VisibleInternalSnapshot(page, 'home-plus-249ms'));
  await page.clock.runFor(1);
  expect(await page.locator('html').getAttribute('data-gameroad-temporal-probe')).toBe('done');
  timeline.push(await r43VisibleInternalSnapshot(page, 'home-plus-250ms'));

  const cardsControl = rootGo(page, 'cards');
  await expect(cardsControl, 'Home exposes a visible Cards control').toBeVisible();
  await cardsControl.click();
  timeline.push(await r43VisibleInternalSnapshot(page, 'cards-after-input'));
  await page.clock.runFor(16);
  timeline.push(await r43VisibleInternalSnapshot(page, 'cards-plus-16ms'));
  await page.clock.runFor(84);
  timeline.push(await r43VisibleInternalSnapshot(page, 'cards-plus-100ms'));
  await page.clock.runFor(150);
  timeline.push(await r43VisibleInternalSnapshot(page, 'cards-plus-250ms'));

  await attachReplay(testInfo, `${testInfo.project.name}-r43-temporal-state.json`, {
    method: 'Playwright controlled browser time plus same-moment visible/internal screen readback',
    fixedTime: fixedTime.toISOString(),
    timeline,
    nonClaims: ['CSS animation frame determinism', 'human motion acceptance', 'physical-device feel'],
  });
  const screenshot = await page.screenshot({ fullPage: true });
  await testInfo.attach(`${testInfo.project.name}-r43-temporal-cards.png`, { body: screenshot, contentType: 'image/png' });

  runtime.assertClean(testInfo);
});

test('R43 records bounded web-quality evidence without inventing performance budgets', async ({ page }, testInfo) => {
  const runtime = observeRuntimeErrors(page);
  await bootCurrentBrowser(page);

  const home = await r43WebQualitySnapshot(page);
  expect(home.document.lang, 'document language is declared').toBeTruthy();
  expect(home.document.title.trim(), 'document title is non-empty').toBeTruthy();
  expect(home.document.viewportMeta, 'mobile viewport metadata is present').toContain('width=device-width');
  expect(home.activeScreen.visible, 'Home visible/internal state consistency').toBe(home.activeScreen.internal);
  expect(home.performance.navigation, 'navigation timing entry exists').not.toBeNull();
  expect(home.performance.navigation.responseEnd).toBeGreaterThanOrEqual(home.performance.navigation.responseStart);
  expect(home.performance.navigation.domContentLoadedEventEnd).toBeGreaterThanOrEqual(home.performance.navigation.responseEnd);

  const cardsControl = rootGo(page, 'cards');
  await expect(cardsControl).toBeVisible();
  await cardsControl.click();
  await expect(page.locator('section[data-screen="cards"]')).toBeVisible();
  const cards = await r43WebQualitySnapshot(page);
  expect(cards.activeScreen.visible, 'Cards visible/internal state consistency').toBe(cards.activeScreen.internal);

  const debt = {
    unnamedInteractives: home.activeScreen.unnamedInteractiveCount + cards.activeScreen.unnamedInteractiveCount,
    duplicateVisibleIds: home.activeScreen.duplicateVisibleIds.length + cards.activeScreen.duplicateVisibleIds.length,
    ariaHiddenFocusable: home.activeScreen.ariaHiddenFocusable.length + cards.activeScreen.ariaHiddenFocusable.length,
    overflowX: { home: home.layout.overflowX, cards: cards.layout.overflowX },
  };
  if (debt.unnamedInteractives > 0 || debt.duplicateVisibleIds > 0 || debt.ariaHiddenFocusable > 0) {
    testInfo.annotations.push({
      type: 'accessibility-debt-evidence',
      description: `sampled debt: unnamed=${debt.unnamedInteractives}; duplicateVisibleIds=${debt.duplicateVisibleIds}; ariaHiddenFocusable=${debt.ariaHiddenFocusable}`,
    });
  }
  if (debt.overflowX.home > 0 || debt.overflowX.cards > 0) {
    testInfo.annotations.push({
      type: 'layout-overflow-evidence',
      description: `sampled horizontal overflow px: home=${debt.overflowX.home}; cards=${debt.overflowX.cards}`,
    });
  }

  await attachReplay(testInfo, `${testInfo.project.name}-r43-web-quality.json`, {
    method: 'bounded DOM/accessibility/layout/resource/navigation evidence on current Browser build',
    home,
    cards,
    debt,
    nonClaims: ['Lighthouse score', 'WCAG conformance', 'human visual acceptance', 'physical-device acceptance'],
  });

  runtime.assertClean(testInfo);
});
