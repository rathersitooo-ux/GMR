import { test, expect } from '@playwright/test';

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
          description: `gameroad-version.json returned 404 ${versionManifest404Count} time(s); tracked by the publication owner`,
        });
      }
      expect(unexpectedHttpErrors, `unexpected HTTP errors:\n${unexpectedHttpErrors.join('\n')}`).toEqual([]);
      expect(pageErrors, `page errors:\n${pageErrors.join('\n')}`).toEqual([]);
      expect(remainingConsoleErrors, `console errors:\n${remainingConsoleErrors.join('\n')}`).toEqual([]);
    },
  };
}

async function shot(page, testInfo, name) {
  const png = await page.screenshot({ fullPage: true, animations: 'disabled' });
  await testInfo.attach(`${testInfo.project.name}-${name}.png`, { body: png, contentType: 'image/png' });
}

async function boot(page) {
  const response = await page.goto('/browser/GAMEROAD.html', { waitUntil: 'domcontentloaded' });
  expect(response).not.toBeNull();
  expect(response.ok(), `GAMEROAD.html status ${response.status()}`).toBeTruthy();
  await page.waitForTimeout(800);
  await expect(page.locator('section[data-screen="home"]')).toBeVisible();
}

function visibleGo(page, target) {
  return page.locator(`[data-go="${target}"]:visible, [data-home-target="${target}"]:visible, [data-root-go="${target}"]:visible`).first();
}

async function backVisible(page) {
  const back = page.locator('section.screen.active [data-back]:visible').first();
  await expect(back).toBeVisible();
  await back.click();
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
    const committed = setValidation.ok && t.deckValidate(t.state.deckDraft, { forBattle: true }).ok ? t.deckCommit() : false;
    return { main, committed, saved: t.deckValidate(t.state.savedDeck, { forBattle: true }) };
  });
}

test('covers Home collapse/expand plus auxiliary Settings navigation without claiming hidden controls', async ({ page }, testInfo) => {
  const runtime = observeRuntimeErrors(page);
  await boot(page);

  const center = page.locator('#homePadCenter:visible');
  if ((await center.count()) > 0) {
    await center.click();
    await expect(center).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('section[data-screen="home"]')).toHaveAttribute('data-home-state', 'HOME_COLLAPSED');
    await shot(page, testInfo, 'home-collapsed-visible');

    await center.click();
    await expect(center).toHaveAttribute('aria-expanded', 'true');
    await shot(page, testInfo, 'home-expanded-visible');
  } else {
    testInfo.annotations.push({ type: 'not-visible-in-viewport', description: 'Home center collapse/expand control is not exposed in this viewport.' });
  }

  const settings = visibleGo(page, 'settings');
  await expect(settings, 'Settings must be reachable by a visible current Home control').toBeVisible();
  await settings.click();
  await expect(page.locator('section[data-screen="settings"]')).toBeVisible();
  await shot(page, testInfo, 'settings-entry-visible');
  runtime.assertClean(testInfo);
});

test('covers Cards search, suit filtering, detail open/close, mobile tray, and restore', async ({ page }, testInfo) => {
  const runtime = observeRuntimeErrors(page);
  await boot(page);

  const cardsGo = visibleGo(page, 'cards');
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
  await shot(page, testInfo, 'card-detail-visible');
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
    await shot(page, testInfo, 'deck-tray-open-visible');
    await expect(restore).toBeVisible();
    await restore.click();
    await shot(page, testInfo, 'cards-filtered-restored-visible');
    if ((await cards.getAttribute('data-deck-drawer')) === 'open') {
      await tray.click();
      await expect(cards).not.toHaveAttribute('data-deck-drawer', 'open');
    }
  } else {
    await expect(restore).toBeVisible();
    await restore.click();
    await shot(page, testInfo, 'cards-filtered-restored-visible');
  }
  runtime.assertClean(testInfo);
});

test('covers partner/player role tabs and a real visible character selection', async ({ page }, testInfo) => {
  const runtime = observeRuntimeErrors(page);
  await boot(page);

  const charactersGo = visibleGo(page, 'characters');
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
  await shot(page, testInfo, 'player-character-selection-visible');

  await characters.locator('[data-role="partner"]').click();
  await shot(page, testInfo, 'partner-role-visible');
  runtime.assertClean(testInfo);
});

test('covers Setup Honey/4P/2v2 plus Friend Room create, ready, waiting, and leave', async ({ page }, testInfo) => {
  const runtime = observeRuntimeErrors(page);
  await boot(page);
  const deck = await installLegalBattleDeck(page);
  expect(deck.main).toHaveLength(40);
  expect(deck.committed).toBeTruthy();
  expect(deck.saved.ok).toBeTruthy();
  testInfo.annotations.push({ type: 'deterministic-precondition', description: 'A legal 40-card deck is installed through the existing test API only to unlock visible Setup controls; no match state is injected.' });

  const setupGo = visibleGo(page, 'setup');
  await expect(setupGo).toBeVisible();
  await setupGo.click();
  const setup = page.locator('section[data-screen="setup"]');
  await expect(setup).toBeVisible();

  await setup.locator('[data-content="honey_hunt"]').click();
  await setup.locator('[data-mode="4p"]').click();
  await expect(setup.locator('[data-content="honey_hunt"]')).toHaveClass(/on/);
  await expect(setup.locator('[data-mode="4p"]')).toHaveClass(/on/);
  await shot(page, testInfo, 'setup-honey-four-player-visible');

  await setup.locator('[data-content="road_shield"]').click();
  await setup.locator('[data-mode="2v2"]').click();
  await expect(setup.locator('[data-mode="2v2"]')).toHaveClass(/on/);
  await shot(page, testInfo, 'setup-two-v-two-visible');

  await setup.locator('#friendRoomEntry').click();
  const friend = page.locator('section[data-screen="friendroom"]');
  await expect(friend).toBeVisible();
  await expect(friend.locator('#friendCreate2')).toBeVisible();
  await expect(friend.locator('#friendCreate4')).toBeVisible();
  await expect(friend.locator('#friendJoinCode')).toBeVisible();
  await expect(friend.locator('#friendJoinBtn')).toBeVisible();
  await shot(page, testInfo, 'friend-room-idle-visible');

  await friend.locator('#friendCreate2').click();
  await expect(friend.locator('.friendCode')).toContainText('部屋主');
  await expect(friend.locator('#friendReadyBtn')).toBeVisible();
  await expect(friend.locator('#friendStartBtn')).toBeDisabled();
  await shot(page, testInfo, 'friend-room-host-waiting-visible');

  await friend.locator('#friendReadyBtn').click();
  await expect(friend.locator('#friendReadyBtn')).toContainText('準備を戻す');
  await shot(page, testInfo, 'friend-room-ready-wait-visible');

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
  await boot(page);

  const settingsGo = visibleGo(page, 'settings');
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
  await shot(page, testInfo, 'settings-reduced-lowperf-audio-visible');

  await backVisible(page);
  await expect(page.locator('section[data-screen="home"]')).toBeVisible();

  let gachaGo = visibleGo(page, 'gacha');
  if ((await gachaGo.count()) === 0) {
    const shopGo = visibleGo(page, 'shop');
    await expect(shopGo).toBeVisible();
    await shopGo.click();
    await expect(page.locator('section[data-screen="shop"]')).toBeVisible();
    gachaGo = visibleGo(page, 'gacha');
  }
  await expect(gachaGo).toBeVisible();
  await gachaGo.click();

  const gacha = page.locator('section[data-screen="gacha"]');
  await expect(gacha).toBeVisible();
  await shot(page, testInfo, 'gacha-idle-visible');
  await gacha.locator('#openPack').click();
  await expect(gacha.locator('#gachaResultsView')).not.toHaveClass(/hidden/);
  await expect(gacha.locator('#packResults .packCard')).toHaveCount(7);
  await shot(page, testInfo, 'gacha-seven-results-visible');

  const detailCard = gacha.locator('#packResults button.packCard[aria-label*="詳細を開く"]').first();
  if ((await detailCard.count()) > 0) {
    await detailCard.click();
    await expect(gacha.locator('#gachaFocus')).not.toHaveClass(/hidden/);
    await shot(page, testInfo, 'gacha-card-detail-visible');
    await gacha.locator('#gachaFocusBack').click();
    await expect(gacha.locator('#gachaResultsView')).not.toHaveClass(/hidden/);

    await detailCard.click();
    await gacha.locator('#gachaFocusToCards').click();
    await expect(page.locator('section[data-screen="cards"]')).toBeVisible();
    await expect(page.locator('section[data-screen="cards"] .cardPreview')).toBeVisible();
    await shot(page, testInfo, 'gacha-to-card-detail-visible');
  } else {
    testInfo.annotations.push({ type: 'random-exception', description: 'All seven generated results were non-card ticket results, so the visible card-detail route could not be exercised in this random pack.' });
  }

  runtime.assertClean(testInfo);
});

test('covers visible 2v2 Battle shell, info/log drawer, range, partner advice, undo and exit', async ({ page }, testInfo) => {
  const runtime = observeRuntimeErrors(page);
  await boot(page);
  const deck = await installLegalBattleDeck(page);
  expect(deck.committed).toBeTruthy();
  testInfo.annotations.push({ type: 'deterministic-precondition', description: 'A legal 40-card deck is installed before using only visible Setup/Battle controls.' });

  const setupGo = visibleGo(page, 'setup');
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
  await shot(page, testInfo, 'battle-two-v-two-entry-visible');

  await battle.locator('#detailsBtn').click();
  const drawer = battle.locator('#battleDrawer');
  await expect(drawer).toHaveClass(/on/);
  await expect(drawer).toHaveAttribute('aria-hidden', 'false');
  await expect(drawer.locator('#partnerRule')).toBeVisible();
  await drawer.locator('#partnerRule').selectOption('left');
  const logSummary = drawer.locator('#battleLogDetails summary');
  await logSummary.click();
  await expect(drawer.locator('#battleLogDetails')).toHaveAttribute('open', '');
  await shot(page, testInfo, 'battle-info-partner-rule-log-visible');
  await drawer.locator('#detailsClose').click();

  await battle.locator('#dangerBtn').click();
  await expect(battle.locator('#battleMap')).toHaveClass(/showRange/);
  await shot(page, testInfo, 'battle-range-visible');

  await battle.locator('#partnerAdviceBtn').click();
  const advice = await page.evaluate(() => window.__GAMEROAD_HATE_PARTNER_TEST__?.adviceEnvelope?.() ?? null);
  expect(advice).not.toBeNull();
  expect(advice.kind).toBe('plan');
  expect(advice.status).toBe('ready');
  await shot(page, testInfo, 'battle-partner-advice-visible');

  await battle.locator('#clearPath').click();
  await battle.locator('#leaveMatch').click();
  await expect(page.locator('section[data-screen="home"]')).toBeVisible();
  await shot(page, testInfo, 'battle-exit-home-visible');
  runtime.assertClean(testInfo);
});

test('records explicit boundaries instead of falsely claiming unconnected or external-only states', async ({ page }, testInfo) => {
  await boot(page);
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
  await shot(page, testInfo, 'coverage-boundary-home');
});