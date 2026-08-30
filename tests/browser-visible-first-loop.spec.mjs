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
          description: `gameroad-version.json returned 404 ${versionManifest404Count} time(s); tracked separately from interaction evidence`,
        });
      }
      expect(unexpectedHttpErrors, `unexpected HTTP errors:\n${unexpectedHttpErrors.join('\n')}`).toEqual([]);
      expect(pageErrors, `page errors:\n${pageErrors.join('\n')}`).toEqual([]);
      expect(remainingConsoleErrors, `console errors:\n${remainingConsoleErrors.join('\n')}`).toEqual([]);
    },
  };
}

async function screenshot(page, testInfo, stateName) {
  await testInfo.attach(`${testInfo.project.name}-${stateName}.png`, {
    body: await page.screenshot({ fullPage: true, animations: 'disabled' }),
    contentType: 'image/png',
  });
}

async function boot(page) {
  const response = await page.goto('/browser/GAMEROAD.html', { waitUntil: 'domcontentloaded' });
  expect(response, 'main HTML response').not.toBeNull();
  expect(response.ok(), `main HTML status ${response.status()}`).toBeTruthy();
  await page.waitForTimeout(1_000);
  await expect(page.locator('section[data-screen="home"]')).toBeVisible();
}

function visibleGo(page, target) {
  return page
    .locator(`[data-go="${target}"]:visible, [data-home-target="${target}"]:visible, [data-root-go="${target}"]:visible`)
    .first();
}

async function backVisible(page) {
  const back = page.locator('section.screen.active [data-back]:visible').first();
  await expect(back).toBeVisible();
  await back.click();
}

async function numericText(locator) {
  return Number.parseInt((await locator.textContent()) ?? '', 10);
}

async function buildAndSaveDeckVisible(page, testInfo) {
  const cardsGo = visibleGo(page, 'cards');
  await expect(cardsGo).toBeVisible();
  await cardsGo.click();

  const cards = page.locator('section[data-screen="cards"]');
  await expect(cards).toBeVisible();
  const deckCount = cards.locator('#deckCount');
  const initialCount = await numericText(deckCount);
  expect(Number.isFinite(initialCount), 'initial main-deck count').toBeTruthy();
  expect(initialCount, 'default deck leaves room for visible additions').toBeLessThan(40);

  const candidateIds = await cards
    .locator('#collectionGrid button.slot.live.cardFace:not(.inDeck)[data-id]')
    .evaluateAll((nodes) => [...new Set(nodes.map((node) => node.getAttribute('data-id')).filter(Boolean))]);
  const rejected = [];

  for (const cardId of candidateIds) {
    const before = await numericText(deckCount);
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

    const after = await numericText(deckCount);
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

  await expect(deckCount, 'visible Deck construction reaches the required 40 cards').toHaveText('40');
  await expect(cards.locator('#exDeckCount')).toHaveText('0');

  const trayToggle = cards.locator('#r4DeckTrayToggle:visible');
  if ((await trayToggle.count()) > 0) {
    await trayToggle.click();
    await page.waitForTimeout(120);
  }

  const saveDeck = cards.locator('#saveDeck');
  await expect(saveDeck).toBeVisible();
  await expect(saveDeck).toBeEnabled();
  await saveDeck.click();
  await expect(cards.locator('#deckSaveState')).toHaveText('保存済み');
  expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY), 'visible Save persists the deck').not.toBeNull();
  await screenshot(page, testInfo, 'visible-loop-deck-saved-40');

  if ((await trayToggle.count()) > 0) {
    await trayToggle.click();
    await page.waitForTimeout(120);
  }

  await backVisible(page);
  await expect(page.locator('section[data-screen="home"]')).toBeVisible();
}

async function satisfyAbilityChoice(page) {
  const veil = page.locator('#abilityVeil.on:visible');
  if ((await veil.count()) === 0) return false;
  const choices = veil.locator('#abilityChoices .abilityChoice:visible');
  const confirm = veil.locator('#abilityConfirm:visible');
  const count = await choices.count();
  expect(count, 'visible ability choice exposes a legal option').toBeGreaterThan(0);
  for (let index = 0; index < count; index += 1) {
    await choices.nth(index).click();
    if (await confirm.isEnabled()) {
      await confirm.click();
      return true;
    }
  }
  throw new Error('visible ability choice never enabled Confirm');
}

async function submitVisiblePlan(battle) {
  const roadSelect = battle.locator('#roadSelect');
  const battleSelect = battle.locator('#battleSelect');
  const ready = battle.locator('#readyPlan');
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
    expect(picked, 'a second visible hand card can be selected as Battle').toBeTruthy();
  }

  expect(await roadSelect.inputValue()).not.toBe('');
  expect(await battleSelect.inputValue()).not.toBe('');
  expect(await battleSelect.inputValue()).not.toBe(await roadSelect.inputValue());
  await expect(ready).toBeEnabled();
  await ready.click();
}

async function playToResultVisible(page, testInfo) {
  const setupGo = visibleGo(page, 'setup');
  await expect(setupGo).toBeVisible();
  await setupGo.click();

  const setup = page.locator('section[data-screen="setup"]');
  await expect(setup).toBeVisible();
  await setup.locator('[data-content="road_shield"]').click();
  await setup.locator('[data-mode="2p"]').click();
  const start = setup.locator('#startMatch');
  await expect(start, 'the visibly saved Deck unlocks Start without test-state injection').toBeVisible();
  await expect(start, 'the visibly saved Deck unlocks Start without test-state injection').toBeEnabled();
  await screenshot(page, testInfo, 'visible-loop-setup-ready');
  await start.click();

  const battle = page.locator('section[data-screen="battle"]');
  const result = page.locator('section[data-screen="result"]');
  await expect(battle).toBeVisible();
  await expect(battle.locator('#phaseTitle')).toContainText('行動を計画');
  await screenshot(page, testInfo, 'visible-loop-battle-start');

  const deadline = Date.now() + 100_000;
  let plans = 0;
  let advances = 0;
  let targets = 0;
  let abilities = 0;

  while (Date.now() < deadline) {
    if (await result.isVisible().catch(() => false)) break;

    if (await satisfyAbilityChoice(page)) {
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
      await submitVisiblePlan(battle);
      plans += 1;
      continue;
    }

    await page.waitForTimeout(80);
  }

  await expect(result, 'visible Battle progression reaches Result without direct result/state injection').toBeVisible({ timeout: 2_000 });
  expect(plans, 'at least one visible plan was submitted').toBeGreaterThan(0);
  expect(advances, 'at least one visible Battle presentation was advanced').toBeGreaterThan(0);
  await expect(result.locator('#resultRanking .rankLine')).toHaveCount(2);
  await expect(result.locator('#resultMode')).toHaveText('二人');
  const rounds = (await result.locator('#resultRounds').textContent()) ?? '';
  expect(rounds).toMatch(/\d+ラウンド/);
  await screenshot(page, testInfo, 'visible-loop-result');

  testInfo.annotations.push({
    type: 'visible-first-loop',
    description: `plans=${plans}, battleAdvances=${advances}, targetConfirms=${targets}, abilityConfirms=${abilities}, result=${rounds}`,
  });
  return result;
}

test('closes Home Deck Battle Result Home through one visible session without game-state injection', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const runtime = observeRuntimeErrors(page);
  await boot(page);
  await screenshot(page, testInfo, 'visible-loop-home-start');

  await buildAndSaveDeckVisible(page, testInfo);
  const result = await playToResultVisible(page, testInfo);

  const home = result.locator('[data-root-go="home"]');
  await expect(home).toBeVisible();
  await expect(home).toBeEnabled();
  await home.click();
  await expect(page.locator('section[data-screen="home"]')).toBeVisible();
  await screenshot(page, testInfo, 'visible-loop-home-returned');

  runtime.assertClean(testInfo);
});
