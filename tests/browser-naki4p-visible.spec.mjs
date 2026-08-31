import { test, expect } from '@playwright/test';

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
    return { main, setValidation, draftValidation, committed };
  });
}

test.only('shows four actual Naki visuals together in the current 4P Battle', async ({ page }, testInfo) => {
  test.setTimeout(60_000);

  const response = await page.goto('/browser/GAMEROAD.html', { waitUntil: 'domcontentloaded' });
  expect(response?.ok()).toBeTruthy();
  await expect(page.locator('section[data-screen="home"]')).toBeVisible();

  const deck = await installLegalBattleDeck(page);
  expect(deck.main).toHaveLength(40);
  expect(deck.setValidation.ok).toBeTruthy();
  expect(deck.draftValidation.ok).toBeTruthy();
  expect(deck.committed).toBeTruthy();

  const setupGo = page.locator('[data-go="setup"]:visible, [data-home-target="setup"]:visible').first();
  await expect(setupGo).toBeVisible();
  await setupGo.click();

  const setup = page.locator('section[data-screen="setup"]');
  await expect(setup).toBeVisible();
  await setup.locator('[data-content="road_shield"]').click();
  await setup.locator('[data-mode="4p"]').click();
  await setup.locator('#startMatch').click();

  const battle = page.locator('section[data-screen="battle"]');
  await expect(battle).toBeVisible();
  await expect(battle.locator('#publicPlayerStrip .publicPlayerChip')).toHaveCount(4);

  await page.evaluate(() => {
    window.__NAKI4P_VISIBLE_ROUND__ = window.__GAMEROAD_TEST__.autoRound();
  });

  await page.waitForFunction(() => {
    const surfaces = [...document.querySelectorAll('[data-battle-character-visual="naki"]')];
    if (surfaces.length !== 4) return false;
    return surfaces.every((surface) => {
      const rect = surface.getBoundingClientRect();
      const style = getComputedStyle(surface);
      const image = surface.querySelector('.grBattleCharacterImage');
      return surface.dataset.visualMode === 'asset'
        && surface.dataset.characterId === 'naki'
        && style.display !== 'none'
        && style.visibility !== 'hidden'
        && Number(style.opacity) > 0
        && rect.width > 0
        && rect.height > 0
        && image
        && image.hidden === false
        && image.complete
        && image.naturalWidth > 0
        && /^data:image\//i.test(image.getAttribute('src') || '');
    });
  }, null, { timeout: 30_000 });

  const proof = await page.locator('[data-battle-character-visual="naki"]').evaluateAll((surfaces) => surfaces.map((surface) => {
    const rect = surface.getBoundingClientRect();
    const image = surface.querySelector('.grBattleCharacterImage');
    return {
      participantId: surface.dataset.participantId,
      characterId: surface.dataset.characterId,
      visualMode: surface.dataset.visualMode,
      width: rect.width,
      height: rect.height,
      imageVisible: Boolean(image && !image.hidden && image.naturalWidth > 0),
    };
  }));

  expect(proof).toHaveLength(4);
  expect(new Set(proof.map((row) => row.participantId)).size).toBe(4);
  expect(proof.every((row) => row.characterId === 'naki' && row.visualMode === 'asset' && row.imageVisible)).toBeTruthy();

  const png = await page.screenshot({ fullPage: true, animations: 'disabled' });
  await testInfo.attach('naki-4p-visible-once.png', { body: png, contentType: 'image/png' });
});