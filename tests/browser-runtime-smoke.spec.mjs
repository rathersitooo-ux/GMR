import { test, expect } from '@playwright/test';

const CORE_SCREENS = ['home', 'cards', 'characters', 'setup', 'battle', 'result', 'shop'];
const NAV_TARGETS = ['home', 'cards', 'characters', 'setup', 'battle', 'shop'];

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
    const committed = setValidation.ok ? t.deckCommit() : false;
    const savedValidation = t.deckValidate(t.state.savedDeck, { forBattle: true });
    return { main, setValidation, committed, savedValidation };
  });
}

test('GAMEROAD boots and core navigation runs without JS errors', async ({ page }) => {
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

  const navigationWallStart = Date.now();
  const response = await page.goto('/browser/GAMEROAD.html', { waitUntil: 'domcontentloaded' });
  expect(response, 'main HTML response').not.toBeNull();
  expect(response.ok(), `main HTML status ${response.status()}`).toBeTruthy();

  const firstVisibleControl = page.locator('[data-go]:visible').first();
  await firstVisibleControl.waitFor({ state: 'visible', timeout: 5_000 });
  const firstVisibleControlWallMs = Date.now() - navigationWallStart;

  await page.waitForLoadState('load');
  const bootTiming = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0];
    if (!nav) return null;
    return {
      responseEndMs: Number(nav.responseEnd.toFixed(1)),
      domInteractiveMs: Number(nav.domInteractive.toFixed(1)),
      domContentLoadedMs: Number(nav.domContentLoadedEventEnd.toFixed(1)),
      loadEventMs: Number(nav.loadEventEnd.toFixed(1)),
      transferSizeBytes: nav.transferSize,
      encodedBodySizeBytes: nav.encodedBodySize,
      decodedBodySizeBytes: nav.decodedBodySize,
    };
  });

  expect(bootTiming, 'Navigation Timing entry').not.toBeNull();
  console.log(`GAMEROAD_LOAD_TIMING ${JSON.stringify({
    ...bootTiming,
    firstVisibleControlWallMs,
  })}`);
  test.info().annotations.push({
    type: 'boot-timing',
    description: JSON.stringify({ ...bootTiming, firstVisibleControlWallMs }),
  });

  await page.waitForTimeout(1_000);

  const doctype = await page.evaluate(() => document.doctype?.name?.toLowerCase() ?? '');
  expect(doctype).toBe('html');

  for (const screen of CORE_SCREENS) {
    const count = await page.locator(`section[data-screen="${screen}"]`).count();
    expect(count, `core screen ${screen}`).toBeGreaterThan(0);
  }

  const dataGoCount = await page.locator('[data-go]').count();
  expect(dataGoCount, 'runtime data-go controls').toBeGreaterThan(0);

  let pointerClicks = 0;
  for (const target of NAV_TARGETS) {
    const control = page.locator(`[data-go="${target}"]:visible`).first();
    if (await control.count()) {
      await control.click({ timeout: 5_000 });
      pointerClicks += 1;
      await page.waitForTimeout(120);
      const targetCount = await page.locator(`section[data-screen="${target}"]`).count();
      expect(targetCount, `navigation target ${target}`).toBeGreaterThan(0);
    }
  }

  // The current repository intentionally does not contain the deployment-side
  // gameroad-version.json companion. Preserve that gap as explicit evidence,
  // but do not let its single browser-generated 404 console line hide real errors.
  const remainingConsoleErrors = [...consoleErrors];
  for (let i = 0; i < versionManifest404Count; i += 1) {
    const index = remainingConsoleErrors.findIndex((message) =>
      message.includes('Failed to load resource') && message.includes('404'),
    );
    if (index >= 0) remainingConsoleErrors.splice(index, 1);
  }
  if (versionManifest404Count > 0) {
    test.info().annotations.push({
      type: 'known-deployment-gap',
      description: `gameroad-version.json returned 404 ${versionManifest404Count} time(s); tracked separately from runtime smoke`,
    });
  }

  expect(pointerClicks, 'at least one real visible data-go control was clicked').toBeGreaterThan(0);
  expect(unexpectedHttpErrors, `unexpected HTTP errors:\n${unexpectedHttpErrors.join('\n')}`).toEqual([]);
  expect(pageErrors, `page errors:\n${pageErrors.join('\n')}`).toEqual([]);
  expect(remainingConsoleErrors, `console errors:\n${remainingConsoleErrors.join('\n')}`).toEqual([]);
});

test('partner delegation preserves the player-selected match envelope and rejects stale or mutated state', async ({ page }) => {
  const response = await page.goto('/browser/GAMEROAD.html', { waitUntil: 'domcontentloaded' });
  expect(response, 'main HTML response').not.toBeNull();
  expect(response.ok(), `main HTML status ${response.status()}`).toBeTruthy();
  await page.waitForTimeout(500);

  const deckSetup = await installLegalBattleDeck(page);
  expect(deckSetup.main).toHaveLength(40);
  expect(deckSetup.setValidation.ok, `set deck validation: ${JSON.stringify(deckSetup.setValidation)}`).toBeTruthy();
  expect(deckSetup.committed, 'legal test deck committed').toBeTruthy();
  expect(deckSetup.savedValidation.ok, `saved deck validation: ${JSON.stringify(deckSetup.savedValidation)}`).toBeTruthy();

  const evidence = await page.evaluate(async () => {
    const core = window.__GAMEROAD_TEST__;
    const partner = window.__GAMEROAD_HATE_PARTNER_TEST__;
    if (!core || !partner) throw new Error('partner selection test hooks are unavailable');

    const first = core.start('4p', 'road_shield');
    if (!first) throw new Error('first match failed to start');
    const firstMatchId = first.id;
    const firstLock = { ...partner.selectionLock() };
    const initialCheck = partner.selectionCheck();

    partner.setRule('left');
    partner.setVoluntary(true);
    const persisted = partner.persistSelection();
    const sessionKey = `gameroad.partner.match-preservation.v1:${firstMatchId}`;
    const persistedPack = JSON.parse(sessionStorage.getItem(sessionKey) || 'null');

    const originalMode = first.mode;
    first.mode = originalMode === '4p' ? '2p' : '4p';
    const voluntaryMutationCheck = partner.selectionCheck();
    const voluntaryAttempt = await partner.attempt('qa-voluntary-mutation');
    const voluntaryBlocker = partner.status()?.blocker || null;
    first.mode = originalMode;

    const human = first.players.find((player) => player.human);
    const originalDeckHead = human?.sourceDeckIds?.[0] ?? null;
    let deckMutationCheck = null;
    if (human && Array.isArray(human.sourceDeckIds) && human.sourceDeckIds.length > 0) {
      human.sourceDeckIds[0] = `${originalDeckHead || 'card'}__QA_MUTATION__`;
      deckMutationCheck = partner.selectionCheck();
      human.sourceDeckIds[0] = originalDeckHead;
    }

    first.mode = originalMode === '4p' ? '2p' : '4p';
    if (human) human.hateExploded = true;
    const forcedAttempt = await partner.attempt('qa-forced-mutation');
    const forcedBlocker = partner.status()?.blocker || null;
    if (human) human.hateExploded = false;
    first.mode = originalMode;

    const repairedCheck = partner.selectionCheck();
    await new Promise((resolve) => setTimeout(resolve, 3));
    const second = core.start('4p', 'road_shield');
    if (!second) throw new Error('second match failed to start');
    const staleRestore = partner.restoreSelection();
    const secondCheck = partner.selectionCheck();

    return {
      firstMatchId,
      secondMatchId: second.id,
      firstLock,
      initialCheck,
      persisted,
      persistedPack,
      voluntaryMutationCheck,
      voluntaryAttempt,
      voluntaryBlocker,
      deckMutationCheck,
      forcedAttempt,
      forcedBlocker,
      repairedCheck,
      staleRestore,
      secondCheck,
    };
  });

  expect(evidence.firstMatchId).not.toBe(evidence.secondMatchId);
  expect(evidence.firstLock.mode).toBe('4p');
  expect(evidence.firstLock.contentId).toBe('road_shield');
  expect(evidence.firstLock.mainCount).toBe(40);
  expect(evidence.initialCheck).toEqual({ ok: true, reason: 'ok' });
  expect(evidence.persisted).toBe(true);
  expect(evidence.persistedPack?.matchId).toBe(evidence.firstMatchId);
  expect(evidence.persistedPack?.mode).toBe('4p');
  expect(evidence.persistedPack?.mainCount).toBe(40);
  expect(evidence.persistedPack).not.toHaveProperty('sourceDeckDigest');
  expect(evidence.persistedPack).not.toHaveProperty('sourceDeckIds');

  expect(evidence.voluntaryMutationCheck).toEqual({ ok: false, reason: 'mode_changed' });
  expect(evidence.voluntaryAttempt).toBe(false);
  expect(evidence.voluntaryBlocker).toContain('試合開始時の札組・モード保持に失敗(mode_changed)');

  expect(evidence.deckMutationCheck).toEqual({ ok: false, reason: 'deck_snapshot_changed' });
  expect(evidence.forcedAttempt).toBe(false);
  expect(evidence.forcedBlocker).toContain('試合開始時の札組・モード保持に失敗(mode_changed)');
  expect(evidence.repairedCheck).toEqual({ ok: true, reason: 'ok' });

  expect(evidence.staleRestore, 'an old match session must not restore into a new match instance').toBe(false);
  expect(evidence.secondCheck).toEqual({ ok: true, reason: 'ok' });
});
