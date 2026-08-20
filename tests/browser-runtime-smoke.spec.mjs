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

test('Highlander rejects distinct card IDs that resolve to the same canonical name', async ({ page }) => {
  const response = await page.goto('/browser/GAMEROAD.html', { waitUntil: 'domcontentloaded' });
  expect(response, 'main HTML response').not.toBeNull();
  expect(response.ok(), `main HTML status ${response.status()}`).toBeTruthy();
  await page.waitForTimeout(500);

  const deckSetup = await installLegalBattleDeck(page);
  expect(deckSetup.main).toHaveLength(40);
  expect(deckSetup.setValidation.ok, `set deck validation: ${JSON.stringify(deckSetup.setValidation)}`).toBeTruthy();
  expect(deckSetup.committed, 'legal test deck committed').toBeTruthy();
  expect(deckSetup.savedValidation.ok, `saved deck validation: ${JSON.stringify(deckSetup.savedValidation)}`).toBeTruthy();

  const evidence = await page.evaluate(({ aliasId, targetId }) => {
    const core = window.__GAMEROAD_TEST__;
    const cardData = window.__CARD_DATA__;
    if (!core || !Array.isArray(cardData)) throw new Error('deck validation test hooks are unavailable');
    if (!aliasId || !targetId || aliasId === targetId) throw new Error('two distinct deck card IDs are required');

    const aliasCard = cardData.find((card) => card.id === aliasId);
    const targetCard = cardData.find((card) => card.id === targetId);
    if (!aliasCard || !targetCard) throw new Error('selected deck cards are missing from card data');

    const targetCanonicalName = targetCard.canonical_name
      || targetCard.base_card_name
      || targetCard.display_name
      || targetCard.id;
    const hadCanonicalName = Object.prototype.hasOwnProperty.call(aliasCard, 'canonical_name');
    const originalCanonicalName = aliasCard.canonical_name;
    const before = core.deckValidate(core.state.savedDeck, { forBattle: true });
    let aliased = null;
    let restored = null;

    try {
      aliasCard.canonical_name = targetCanonicalName;
      aliased = core.deckValidate(core.state.savedDeck, { forBattle: true });
    } finally {
      if (hadCanonicalName) aliasCard.canonical_name = originalCanonicalName;
      else delete aliasCard.canonical_name;
      restored = core.deckValidate(core.state.savedDeck, { forBattle: true });
    }

    return {
      aliasId,
      targetId,
      targetCanonicalName,
      hadCanonicalName,
      originalCanonicalName: originalCanonicalName ?? null,
      aliasCanonicalNameAfterRestore: aliasCard.canonical_name ?? null,
      before,
      aliased,
      restored,
    };
  }, { aliasId: deckSetup.main[0], targetId: deckSetup.main[1] });

  expect(evidence.aliasId).not.toBe(evidence.targetId);
  expect(evidence.targetCanonicalName).toBeTruthy();
  expect(evidence.before.ok, `pre-alias validation: ${JSON.stringify(evidence.before)}`).toBeTruthy();
  expect(JSON.stringify(evidence.before)).not.toContain('同名1枚まで');
  expect(evidence.aliased?.ok, `aliased validation: ${JSON.stringify(evidence.aliased)}`).toBeFalsy();
  expect(JSON.stringify(evidence.aliased)).toContain('同名1枚まで');
  expect(evidence.restored.ok, `restored validation: ${JSON.stringify(evidence.restored)}`).toBeTruthy();
  expect(JSON.stringify(evidence.restored)).not.toContain('同名1枚まで');
  if (evidence.hadCanonicalName) {
    expect(evidence.aliasCanonicalNameAfterRestore).toBe(evidence.originalCanonicalName);
  } else {
    expect(evidence.aliasCanonicalNameAfterRestore).toBeNull();
  }
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

test('2v2 starts four seats with canonical P1/P2 vs P3/P4 team assignment', async ({ page }) => {
  const response = await page.goto('/browser/GAMEROAD.html', { waitUntil: 'domcontentloaded' });
  expect(response, 'main HTML response').not.toBeNull();
  expect(response.ok(), `main HTML status ${response.status()}`).toBeTruthy();
  await page.waitForTimeout(500);

  const deckSetup = await installLegalBattleDeck(page);
  expect(deckSetup.main).toHaveLength(40);
  expect(deckSetup.setValidation.ok, `set deck validation: ${JSON.stringify(deckSetup.setValidation)}`).toBeTruthy();
  expect(deckSetup.committed, 'legal test deck committed').toBeTruthy();

  const evidence = await page.evaluate(() => {
    const core = window.__GAMEROAD_TEST__;
    if (!core) throw new Error('GAMEROAD runtime test hook is unavailable');
    const match = core.start('2v2', 'road_shield');
    if (!match) throw new Error('2v2 match failed to start');
    return {
      mode: match.mode ?? null,
      screen: core.state.screen ?? null,
      teams: Array.isArray(match.players)
        ? match.players.map((player) => ({ id: player.id, team: player.team ?? null }))
        : [],
    };
  });

  expect(evidence.mode).toBe('2v2');
  expect(evidence.screen).toBe('battle');
  expect(evidence.teams).toEqual([
    { id: 'P1', team: 'A' },
    { id: 'P2', team: 'A' },
    { id: 'P3', team: 'B' },
    { id: 'P4', team: 'B' },
  ]);
});

test('records build-linked visible Home to Shop P0 evidence', async ({ page }, testInfo) => {
  const response = await page.goto('/browser/GAMEROAD.html', { waitUntil: 'domcontentloaded' });
  expect(response, 'main HTML response').not.toBeNull();
  expect(response.ok(), `main HTML status ${response.status()}`).toBeTruthy();
  await page.waitForTimeout(500);

  const home = page.locator('section[data-screen="home"]');
  await expect(home).toBeVisible();

  const shopControl = page.getByRole('button', { name: 'ショップへ', exact: true });
  await expect(shopControl, 'visible Home-to-Shop pointer control').toBeVisible();
  await shopControl.click();

  const shop = page.locator('section[data-screen="shop"]');
  await expect(shop, 'Shop target reached through visible pointer navigation').toBeVisible();
  await page.waitForTimeout(120);

  const png = await page.screenshot({ fullPage: true, animations: 'disabled' });
  await testInfo.attach('p0-home-shop-visible.png', {
    body: png,
    contentType: 'image/png',
  });
  testInfo.annotations.push({
    type: 'minor-mode-playtest-evidence',
    description: 'P0 HOME-SHOP-BRIDGE visible pointer transition with attached runtime screenshot on this exact GitHub revision.',
  });
});

test('records build-linked visible Home to Partner and Home return P0 evidence', async ({ page }, testInfo) => {
  const response = await page.goto('/browser/GAMEROAD.html', { waitUntil: 'domcontentloaded' });
  expect(response, 'main HTML response').not.toBeNull();
  expect(response.ok(), `main HTML status ${response.status()}`).toBeTruthy();
  await page.waitForTimeout(500);

  const home = page.locator('section[data-screen="home"]');
  await expect(home).toBeVisible();

  const charactersControl = page
    .locator('[data-go="characters"]:visible, [data-home-target="characters"]:visible, [data-root-go="characters"]:visible')
    .first();
  await expect(charactersControl, 'visible Home-to-Characters pointer control').toBeVisible();
  await charactersControl.click();

  const characters = page.locator('section[data-screen="characters"]');
  await expect(characters, 'Characters target reached through visible pointer navigation').toBeVisible();
  await characters.locator('[data-role="partner"]').click();

  const candidate = characters.locator('.charCard[aria-pressed="false"]:visible').first();
  await expect(candidate, 'real visible Partner candidate').toBeVisible();
  const candidateName = ((await candidate.locator('.charCardCopy b').textContent()) || '').trim();
  expect(candidateName, 'Partner candidate has visible identity').not.toBe('');
  await candidate.click();

  const selected = characters.locator('.charCard[aria-pressed="true"]:visible');
  await expect(selected, 'Partner selection state').toHaveCount(1);
  await expect(selected.locator('.charCardCopy b')).toHaveText(candidateName);
  await expect(characters.locator('#charRoleLabel')).toHaveText('パートナー');
  await expect(characters.locator('#charName')).toHaveText(candidateName);

  const partnerPng = await page.screenshot({ fullPage: true, animations: 'disabled' });
  await testInfo.attach('p0-home-partner-visible.png', {
    body: partnerPng,
    contentType: 'image/png',
  });

  const backControl = characters.locator('[data-back]:visible').first();
  await expect(backControl, 'visible Characters-to-Home back control').toBeVisible();
  await backControl.click();
  await expect(home, 'Home visible after Partner round trip').toBeVisible();

  const homeReturnPng = await page.screenshot({ fullPage: true, animations: 'disabled' });
  await testInfo.attach('p0-home-partner-home-return.png', {
    body: homeReturnPng,
    contentType: 'image/png',
  });
  testInfo.annotations.push({
    type: 'minor-mode-playtest-evidence',
    description: `P0 HOME-PARTNER-BRIDGE visible pointer round trip selected Partner ${candidateName} and returned Home with both runtime screenshots attached on this exact GitHub revision.`,
  });
});

test('Desktop Cards pointer targets satisfy current AA size-or-spacing and keyboard-focus audit', async ({ page }, testInfo) => {
  const response = await page.goto('/browser/GAMEROAD.html', { waitUntil: 'domcontentloaded' });
  expect(response, 'main HTML response').not.toBeNull();
  expect(response.ok(), `main HTML status ${response.status()}`).toBeTruthy();
  await page.waitForTimeout(500);

  const cardsControl = page
    .locator('[data-go="cards"]:visible, [data-home-target="cards"]:visible, [data-root-go="cards"]:visible')
    .first();
  await expect(cardsControl, 'visible Home-to-Cards pointer control').toBeVisible();
  await cardsControl.click();

  const cards = page.locator('section[data-screen="cards"]');
  await expect(cards, 'Cards screen reached through visible pointer navigation').toBeVisible();
  await page.waitForTimeout(250);

  const audit = await cards.evaluate((root) => {
    const isSemantic = (element) => {
      if (!(element instanceof HTMLElement)) return false;
      if (element.matches('button, a[href], select, textarea')) return true;
      if (element.matches('input:not([type="hidden"])')) return true;
      if (element.matches('[role="button"], [role="link"], [role="checkbox"], [role="radio"], [role="tab"]')) return true;
      return element.hasAttribute('tabindex');
    };
    const isVisible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none'
        && style.visibility !== 'hidden'
        && Number(style.opacity || 1) > 0
        && rect.width > 0
        && rect.height > 0;
    };
    const isPointerCandidate = (element) => {
      if (!(element instanceof HTMLElement) || !isVisible(element)) return false;
      if (element.matches(':disabled, [aria-disabled="true"]')) return false;
      return isSemantic(element)
        || element.hasAttribute('onclick')
        || getComputedStyle(element).cursor === 'pointer';
    };
    const hasCandidateAncestor = (element) => {
      let parent = element.parentElement;
      while (parent && parent !== root) {
        if (isPointerCandidate(parent)) return true;
        parent = parent.parentElement;
      }
      return false;
    };
    const describe = (element) => {
      const text = String(element.getAttribute('aria-label') || element.textContent || '').replace(/\s+/g, ' ').trim();
      const dataKey = [...element.attributes]
        .find((attribute) => /^data-(go|back|role|action|card|deck|tab|filter|sort)/.test(attribute.name));
      return element.id
        || (dataKey ? `${dataKey.name}=${dataKey.value}` : '')
        || text.slice(0, 80)
        || `${element.tagName.toLowerCase()}${element.className ? `.${String(element.className).trim().replace(/\s+/g, '.')}` : ''}`;
    };
    const nativeKeyboard = (element) => element.matches('button, a[href], select, textarea, input:not([type="hidden"])');
    const candidates = [...root.querySelectorAll('*')]
      .filter((element) => isPointerCandidate(element))
      .filter((element) => isSemantic(element) || !hasCandidateAncestor(element));
    const targets = candidates.map((element, index) => {
      const rect = element.getBoundingClientRect();
      return {
        index,
        element,
        label: describe(element),
        tag: element.tagName.toLowerCase(),
        role: element.getAttribute('role'),
        tabIndex: element.tabIndex,
        width: Number(rect.width.toFixed(2)),
        height: Number(rect.height.toFixed(2)),
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        centerX: rect.left + rect.width / 2,
        centerY: rect.top + rect.height / 2,
        keyboardReachable: nativeKeyboard(element) || element.tabIndex >= 0,
      };
    });
    const pointToRectDistance = (x, y, other) => {
      const dx = Math.max(other.left - x, 0, x - other.right);
      const dy = Math.max(other.top - y, 0, y - other.bottom);
      return Math.hypot(dx, dy);
    };
    const report = targets.map((target) => {
      const sizePass = target.width >= 24 && target.height >= 24;
      const neighborDistances = targets
        .filter((other) => other.index !== target.index)
        .map((other) => {
          const otherSizePass = other.width >= 24 && other.height >= 24;
          return otherSizePass
            ? pointToRectDistance(target.centerX, target.centerY, other)
            : Math.hypot(target.centerX - other.centerX, target.centerY - other.centerY) / 2;
        });
      const nearestClearance = neighborDistances.length ? Math.min(...neighborDistances) : Infinity;
      const spacingPass = sizePass || nearestClearance >= 12;
      return {
        label: target.label,
        tag: target.tag,
        role: target.role,
        tabIndex: target.tabIndex,
        width: target.width,
        height: target.height,
        sizePass,
        nearestClearance: Number.isFinite(nearestClearance) ? Number(nearestClearance.toFixed(2)) : null,
        spacingPass,
        keyboardReachable: target.keyboardReachable,
      };
    });
    return {
      viewport: { width: innerWidth, height: innerHeight },
      targetCount: report.length,
      targets: report,
    };
  });

  await testInfo.attach('desktop-cards-target-audit.json', {
    body: Buffer.from(`${JSON.stringify(audit, null, 2)}\n`, 'utf8'),
    contentType: 'application/json',
  });
  console.log(`GAMEROAD_CARDS_TARGET_AUDIT ${JSON.stringify(audit)}`);

  const unresolvedSizeOrSpacing = audit.targets.filter((target) => !target.sizePass && !target.spacingPass);
  const keyboardMisses = audit.targets.filter((target) => !target.keyboardReachable);
  expect(audit.targetCount, 'at least one current Cards interactive pointer target is audited').toBeGreaterThan(0);
  expect(
    unresolvedSizeOrSpacing,
    `Cards targets below the 24px size-or-spacing path:\n${JSON.stringify(unresolvedSizeOrSpacing, null, 2)}`,
  ).toEqual([]);
  expect(
    keyboardMisses,
    `Cards pointer targets missing keyboard focus reachability:\n${JSON.stringify(keyboardMisses, null, 2)}`,
  ).toEqual([]);
});
