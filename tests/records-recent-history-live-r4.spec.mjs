import { test, expect } from '@playwright/test';

const VIEWPORTS = [
  { name: 'phone-portrait-390x844', width: 390, height: 844 },
  { name: 'phone-landscape-844x390', width: 844, height: 390 },
  { name: 'desktop-1280x720', width: 1280, height: 720 },
];

async function boot(page) {
  const response = await page.goto('/browser/GAMEROAD.html', { waitUntil: 'domcontentloaded' });
  expect(response?.ok(), 'GAMEROAD.html loads').toBeTruthy();
  await page.waitForTimeout(450);
  await expect(page.locator('section[data-screen="home"]')).toBeVisible();
  await expect.poll(() => page.evaluate(() => !!window.__GAMEROAD_TEST__)).toBeTruthy();
}

async function commitLegalDeckAndFinishMatch(page) {
  return page.evaluate(async () => {
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
    if (!committed) return { reached: false, reason: 'LEGAL_DECK_COMMIT_FAILED', setValidation, draftValidation };

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
      latest: t.state.history?.[0] ?? null,
      storage: t.state.storage,
    };
  });
}

async function navigateHomeProfileRecords(page) {
  await page.evaluate(() => window.__GAMEROAD_TEST__.show('home'));
  await expect(page.locator('section[data-screen="home"]')).toBeVisible();
  const profileControl = page.locator('[data-go="profile"]:visible, [data-home-target="profile"]:visible, [data-root-go="profile"]:visible').first();
  await expect(profileControl, 'visible Home→Profile control').toBeVisible();
  await profileControl.click();
  const profile = page.locator('section[data-screen="profile"]');
  await expect(profile).toBeVisible();
  const recordsControl = profile.locator('[data-go="records"]:visible').first();
  await expect(recordsControl, 'visible Profile→Records control').toBeVisible();
  await recordsControl.click();
  const records = page.locator('section[data-screen="records"]');
  await expect(records).toBeVisible();
  return records;
}

for (const viewport of VIEWPORTS) {
  test(`current completed match is visible and persists in Records @ ${viewport.name}`, async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await boot(page);

    const driven = await commitLegalDeckAndFinishMatch(page);
    expect(driven.reached, JSON.stringify(driven)).toBeTruthy();
    expect(driven.screen).toBe('result');
    expect(driven.historyLength).toBeGreaterThan(0);
    expect(driven.latest?.mode).toBe('2p');
    expect(driven.latest?.rank).toBeGreaterThan(0);
    expect(driven.latest?.rounds).toBeGreaterThan(0);

    let records = await navigateHomeProfileRecords(page);
    const row = records.locator('#recordsList .record').first();
    await expect(row, 'latest completed match renders on production Records surface').toBeVisible();
    const beforeReloadText = (await row.innerText()).trim();
    expect(beforeReloadText).toMatch(/2P\s*\/\s*\d+位/);
    expect(beforeReloadText).toMatch(/\d+巡/);
    await testInfo.attach(`${viewport.name}-records-before-reload.txt`, {
      body: Buffer.from(`${JSON.stringify({ driven, beforeReloadText }, null, 2)}\n`, 'utf8'),
      contentType: 'application/json',
    });

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(450);
    records = await navigateHomeProfileRecords(page);
    const persistedRow = records.locator('#recordsList .record').first();
    await expect(persistedRow, 'latest completed match survives reload through existing save authority').toBeVisible();
    const afterReloadText = (await persistedRow.innerText()).trim();
    expect(afterReloadText).toBe(beforeReloadText);

    const png = await page.screenshot({ fullPage: true, animations: 'disabled' });
    await testInfo.attach(`${viewport.name}-records-after-reload.png`, { body: png, contentType: 'image/png' });
  });
}
