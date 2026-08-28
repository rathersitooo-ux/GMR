import { test, expect } from '@playwright/test';

const NAKI = 'ナキ';

function visibleHomeControl(page, target) {
  return page.locator(`[data-go="${target}"]:visible, [data-home-target="${target}"]:visible`).first();
}

async function boot(page) {
  const response = await page.goto('/browser/GAMEROAD.html', { waitUntil: 'domcontentloaded' });
  expect(response).not.toBeNull();
  expect(response.ok()).toBeTruthy();
  await page.waitForTimeout(800);
  await expect(page.locator('section[data-screen="home"]')).toBeVisible();
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
    const draftValidation = t.deckValidate(t.state.deckDraft, { forBattle: true });
    const committed = draftValidation.ok ? t.deckCommit() : false;
    const savedValidation = t.deckValidate(t.state.savedDeck, { forBattle: true });
    return { main, setValidation, draftValidation, committed, savedValidation };
  });
}

async function assertOnlyNakiSelectable(page) {
  const charactersGo = visibleHomeControl(page, 'characters');
  await expect(charactersGo).toBeVisible();
  await charactersGo.click();
  const characters = page.locator('section[data-screen="characters"]');
  await expect(characters).toBeVisible();
  await characters.locator('[data-role="player"]').click();

  const roster = await characters.locator('.charCard:visible').evaluateAll((nodes) =>
    nodes.map((node) => ({
      name: (node.querySelector('.charCardCopy b')?.textContent || node.textContent || '').trim(),
      disabled: node.matches(':disabled') || node.getAttribute('aria-disabled') === 'true',
      pressed: node.getAttribute('aria-pressed'),
    })),
  );

  expect(roster.length, 'player roster must expose at least the implemented Naki character').toBeGreaterThan(0);
  const nakiRows = roster.filter((row) => row.name.includes(NAKI));
  expect(nakiRows, 'Naki appears exactly once in the player roster').toHaveLength(1);
  expect(nakiRows[0].disabled, 'Naki remains selectable').toBe(false);

  const selectableNames = roster.filter((row) => !row.disabled).map((row) => row.name);
  expect(selectableNames, 'unimplemented characters cannot be selected').toEqual([expect.stringContaining(NAKI)]);

  const nakiCard = characters.locator('.charCard:visible').filter({ hasText: NAKI }).first();
  await nakiCard.click();
  await expect(nakiCard).toHaveAttribute('aria-pressed', 'true');
  await expect(characters.locator('#charName')).toContainText(NAKI);
}

async function assertVisibleSeatsAreNaki(battle, expectedSeatCount) {
  const chips = battle.locator('#publicPlayerStrip .publicPlayerChip:visible');
  await expect(chips).toHaveCount(expectedSeatCount);
  const labels = (await chips.allTextContents()).map((text) => text.replace(/\s+/g, ' ').trim());
  expect(labels, `all ${expectedSeatCount} visible player seats use Naki`).toHaveLength(expectedSeatCount);
  for (const label of labels) expect(label).toContain(NAKI);
  return labels;
}

async function satisfyAbilityChoice(page) {
  const veil = page.locator('#abilityVeil.on:visible');
  if ((await veil.count()) === 0) return false;
  const choices = veil.locator('#abilityChoices .abilityChoice:visible');
  const confirm = veil.locator('#abilityConfirm:visible');
  const count = await choices.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i += 1) {
    await choices.nth(i).click();
    if (await confirm.isEnabled()) {
      await confirm.click();
      return true;
    }
  }
  throw new Error('ability choice never enabled confirm');
}

async function submitVisiblePlan(battle) {
  const roadSelect = battle.locator('#roadSelect');
  const battleSelect = battle.locator('#battleSelect');
  const ready = battle.locator('#readyPlan');
  const handCards = battle.locator('#hand .handCard:visible:not(:disabled)');
  expect(await handCards.count()).toBeGreaterThanOrEqual(2);

  if (!(await roadSelect.inputValue())) await handCards.nth(0).click();
  if (!(await battleSelect.inputValue())) {
    const roadValue = await roadSelect.inputValue();
    const count = await handCards.count();
    for (let i = 0; i < count; i += 1) {
      const id = await handCards.nth(i).getAttribute('data-card-id');
      if (!id || id === roadValue) continue;
      await handCards.nth(i).click();
      if (await battleSelect.inputValue()) break;
    }
  }

  expect(await roadSelect.inputValue()).not.toBe('');
  expect(await battleSelect.inputValue()).not.toBe('');
  expect(await battleSelect.inputValue()).not.toBe(await roadSelect.inputValue());
  await expect(ready).toBeEnabled();
  await ready.click();
}

async function playModeToResult(page, { mode, content, expectedSeatCount }) {
  await boot(page);
  const deck = await installLegalBattleDeck(page);
  expect(deck.main).toHaveLength(40);
  expect(deck.committed).toBeTruthy();
  expect(deck.savedValidation.ok).toBeTruthy();

  const setupGo = visibleHomeControl(page, 'setup');
  await expect(setupGo).toBeVisible();
  await setupGo.click();
  const setup = page.locator('section[data-screen="setup"]');
  await expect(setup).toBeVisible();
  await setup.locator(`[data-content="${content}"]`).click();
  await setup.locator(`[data-mode="${mode}"]`).click();
  const start = setup.locator('#startMatch');
  await expect(start).toBeEnabled();
  await start.click();

  const battle = page.locator('section[data-screen="battle"]');
  const result = page.locator('section[data-screen="result"]');
  await expect(battle).toBeVisible();
  const seatLabelsAtStart = await assertVisibleSeatsAreNaki(battle, expectedSeatCount);

  const deadline = Date.now() + 240_000;
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

  await expect(result, `${mode} reaches Result using visible controls`).toBeVisible({ timeout: 2_000 });
  expect(plans, `${mode} submitted at least one visible plan`).toBeGreaterThan(0);
  await expect(result.locator('#resultRanking .rankLine')).toHaveCount(expectedSeatCount);

  return { seatLabelsAtStart, plans, advances, targets, abilities };
}

test('player character selection exposes Naki as the only selectable implemented character', async ({ page }) => {
  await boot(page);
  await assertOnlyNakiSelectable(page);
});

for (const route of [
  { title: '2P Road Shield', mode: '2p', content: 'road_shield', expectedSeatCount: 2 },
  { title: '4P Honey Hunt', mode: '4p', content: 'honey_hunt', expectedSeatCount: 4 },
  { title: '2v2 Road Shield', mode: '2v2', content: 'road_shield', expectedSeatCount: 4 },
]) {
  test(`${route.title} keeps every visible player seat on Naki and reaches Result`, async ({ page }, testInfo) => {
    test.setTimeout(300_000);
    const evidence = await playModeToResult(page, route);
    testInfo.annotations.push({
      type: 'naki-fullpath',
      description: `${route.title}: seats=${evidence.seatLabelsAtStart.join(' | ')}, plans=${evidence.plans}, advances=${evidence.advances}, targets=${evidence.targets}, abilities=${evidence.abilities}`,
    });
  });
}
