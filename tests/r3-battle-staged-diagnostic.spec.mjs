import { test, expect } from '@playwright/test';

const STORAGE_KEY = 'gameroad.browser.v10.core.1';

async function boot(page) {
  const response = await page.goto('/browser/GAMEROAD.html', { waitUntil: 'domcontentloaded' });
  expect(response?.ok()).toBeTruthy();
  await page.waitForTimeout(900);
  await expect(page.locator('section[data-screen="home"]')).toBeVisible();
}

function homeControl(page, target) {
  return page.locator(`[data-go="${target}"]:visible, [data-home-target="${target}"]:visible`).first();
}

async function numericText(locator) {
  return Number.parseInt((await locator.textContent()) ?? '', 10);
}

async function buildAndSaveLegal40(page) {
  await homeControl(page, 'cards').click();
  const cards = page.locator('section[data-screen="cards"]');
  await expect(cards).toBeVisible();
  const deckCount = cards.locator('#deckCount');
  const candidateIds = await cards
    .locator('#collectionGrid button.slot.live.cardFace:not(.inDeck)[data-id]')
    .evaluateAll((nodes) => [...new Set(nodes.map((node) => node.getAttribute('data-id')).filter(Boolean))]);

  for (const cardId of candidateIds) {
    const before = await numericText(deckCount);
    if (before >= 40) break;
    const candidate = cards.locator(`#collectionGrid button.slot.live.cardFace:not(.inDeck)[data-id="${cardId}"]:visible`).first();
    if ((await candidate.count()) === 0) continue;
    await candidate.click();
    const add = cards.locator('#addSelectedCard');
    await expect(add).toBeVisible();
    await add.click();
    await page.waitForTimeout(80);
    const close = cards.locator('#r4PreviewClose:visible');
    if ((await close.count()) > 0) await close.click();
  }

  await expect(deckCount).toHaveText('40');
  const tray = cards.locator('#r4DeckTrayToggle:visible');
  if ((await tray.count()) > 0) await tray.click();
  await cards.locator('#saveDeck').click();
  await expect(cards.locator('#deckSaveState')).toHaveText('保存済み');
  expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).not.toBeNull();
}

async function battleSnapshot(page) {
  const battle = page.locator('section[data-screen="battle"]');
  const visibleScreens = await page.locator('section[data-screen]:visible').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-screen')));
  const enabledButtons = await battle.locator('button:visible:not(:disabled)').evaluateAll((nodes) => nodes.slice(0, 60).map((node) => ({
    id: node.id || null,
    text: (node.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120),
    aria: node.getAttribute('aria-label'),
    className: typeof node.className === 'string' ? node.className : null,
    data: Object.fromEntries([...node.attributes]
      .filter((attribute) => attribute.name.startsWith('data-'))
      .map((attribute) => [attribute.name, attribute.value])),
  })));
  return {
    visibleScreens,
    text: ((await battle.textContent()) || '').replace(/\s+/g, ' ').trim().slice(0, 3200),
    roadValue: await battle.locator('#roadSelect').inputValue().catch(() => null),
    battleValue: await battle.locator('#battleSelect').inputValue().catch(() => null),
    readyEnabled: await battle.locator('#readyPlan').isEnabled().catch(() => false),
    enabledButtons,
  };
}

test('R3 staged diagnostic: visible round one through attack resolution advance', async ({ page }, testInfo) => {
  await boot(page);
  await buildAndSaveLegal40(page);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(900);
  await expect(page.locator('section[data-screen="home"]')).toBeVisible();

  await homeControl(page, 'setup').click();
  const setup = page.locator('section[data-screen="setup"]');
  await expect(setup).toBeVisible();
  const start = setup.locator('#startMatch:visible');
  await expect(start).toBeEnabled();
  await start.click();
  await page.waitForTimeout(500);

  const battle = page.locator('section[data-screen="battle"]');
  await expect(battle).toBeVisible();
  const diagnostic = {
    before: await battleSnapshot(page),
    afterReady: null,
    afterTargetConfirm: null,
    afterAdvances: [],
  };

  const hand = battle.locator('button[data-card-id]:visible:not(:disabled)');
  expect(await hand.count(), 'at least two visible hand cards').toBeGreaterThanOrEqual(2);
  const firstId = await hand.nth(0).getAttribute('data-card-id');
  await hand.nth(0).click();
  await page.waitForTimeout(180);
  const second = battle.locator(`button[data-card-id]:visible:not(:disabled):not([data-card-id="${firstId}"])`).first();
  await expect(second).toBeVisible();
  await second.click();
  await page.waitForTimeout(180);

  const ready = battle.locator('#readyPlan:visible');
  await expect(ready).toBeEnabled();
  await ready.click();
  await page.waitForTimeout(1_600);
  diagnostic.afterReady = await battleSnapshot(page);

  const confirmTarget = battle.locator('#confirmTarget:visible:not(:disabled)');
  if ((await confirmTarget.count()) > 0) {
    await confirmTarget.click();
    await page.waitForTimeout(1_400);
    diagnostic.afterTargetConfirm = await battleSnapshot(page);
  }

  for (let i = 0; i < 5; i += 1) {
    const next = battle.locator('button.resolutionAdvance:visible:not(:disabled), button[aria-label="次へ"]:visible:not(:disabled)').first();
    if ((await next.count()) === 0) break;
    await next.click();
    await page.waitForTimeout(900);
    diagnostic.afterAdvances.push(await battleSnapshot(page));
    const text = ((await battle.textContent()) || '').replace(/\s+/g, ' ');
    if (/ラウンド\s*2|第2ラウンド/.test(text)) break;
  }

  await testInfo.attach(`${testInfo.project.name}-r3-round-resolution.json`, {
    body: Buffer.from(JSON.stringify(diagnostic, null, 2)),
    contentType: 'application/json',
  });
  await testInfo.attach(`${testInfo.project.name}-r3-round-resolution-final.png`, {
    body: await page.screenshot({ fullPage: true, animations: 'disabled' }),
    contentType: 'image/png',
  });
});
