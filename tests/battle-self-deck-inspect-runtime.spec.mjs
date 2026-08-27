import { test, expect } from '@playwright/test';

async function bootCurrentBrowser(page) {
  const response = await page.goto('/browser/GAMEROAD.html', { waitUntil: 'domcontentloaded' });
  expect(response).not.toBeNull();
  expect(response.ok(), `main HTML status ${response.status()}`).toBeTruthy();
  await page.waitForTimeout(1_000);
  await expect(page.locator('section[data-screen="home"]')).toBeVisible();
}

function visibleHomeControl(page, target) {
  return page.locator(`[data-go="${target}"]:visible, [data-home-target="${target}"]:visible`).first();
}

async function installLegalBattleDeck(page) {
  return page.evaluate(() => {
    const t = window.__GAMEROAD_TEST__;
    if (!t) throw new Error('__GAMEROAD_TEST__ unavailable');
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

async function beginVisibleTwoPlayerBattle(page) {
  const setup = await installLegalBattleDeck(page);
  expect(setup.main).toHaveLength(40);
  expect(setup.committed, `deck commit: ${JSON.stringify(setup)}`).toBeTruthy();
  expect(setup.savedValidation.ok, `saved deck validation: ${JSON.stringify(setup.savedValidation)}`).toBeTruthy();

  const setupControl = visibleHomeControl(page, 'setup');
  await expect(setupControl).toBeVisible();
  await setupControl.click();
  const setupScreen = page.locator('section[data-screen="setup"]');
  await expect(setupScreen).toBeVisible();
  await setupScreen.locator('[data-content="road_shield"]').click();
  await setupScreen.locator('[data-mode="2p"]').click();
  const startMatch = setupScreen.locator('#startMatch');
  await expect(startMatch).toBeVisible();
  await expect(startMatch).toBeEnabled();
  await startMatch.click();

  const battle = page.locator('section[data-screen="battle"]');
  await expect(battle).toBeVisible();
  await expect(battle.locator('#phaseTitle')).toContainText('行動を計画');
  return battle;
}

function counts(ids) {
  const result = new Map();
  for (const id of ids) result.set(id, (result.get(id) ?? 0) + 1);
  return [...result.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([cardId, count]) => ({ cardId, count }));
}

test('current Browser Battle visibly exposes only the local player remaining-deck multiset', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await bootCurrentBrowser(page);
  const battle = await beginVisibleTwoPlayerBattle(page);

  const host = battle.locator('#gameroadSelfDeckInspect');
  const toggle = host.locator('[data-self-deck-inspect-toggle]');
  const panel = host.locator('[data-self-deck-inspect-panel]');
  await expect(host).toBeVisible({ timeout: 7_000 });
  await expect(toggle).toBeVisible();

  const actual = await page.evaluate(() => {
    const match = window.__GAMEROAD_TEST__?.state?.match;
    if (!match) throw new Error('match unavailable');
    const humans = match.players.filter((player) => player?.human === true);
    if (humans.length !== 1) throw new Error(`expected one local human, got ${humans.length}`);
    const owner = humans[0];
    const opponents = match.players.filter((player) => player !== owner);
    const runtimeSnapshot = window.__GAMEROAD_BATTLE_SELF_DECK_INSPECT_RUNTIME__?.snapshot?.();
    return {
      matchId: match.id,
      ownerId: owner.id,
      ownerDeck: [...owner.deck],
      ownerSourceDeck: [...(owner.sourceDeckIds ?? [])],
      opponentDecks: opponents.map((player) => [...(player.deck ?? [])]),
      runtimeSnapshot,
    };
  });

  expect(actual.ownerDeck.length, 'live remaining deck is nonempty after the initial hand draw').toBeGreaterThan(0);
  expect(actual.runtimeSnapshot?.ok).toBe(true);
  expect(actual.runtimeSnapshot.matchId).toBe(actual.matchId);
  expect(actual.runtimeSnapshot.ownerPlayerId).toBe(actual.ownerId);
  expect(actual.runtimeSnapshot.total).toBe(actual.ownerDeck.length);
  expect(actual.runtimeSnapshot.cardCounts).toEqual(counts(actual.ownerDeck));
  expect(Object.hasOwn(actual.runtimeSnapshot, 'remainingCardIds'), 'projection never exposes hidden deck order').toBe(false);
  expect(actual.ownerSourceDeck.length, 'match-start source snapshot exists but is not the remaining-deck authority').toBeGreaterThanOrEqual(actual.ownerDeck.length);

  await expect(toggle).toHaveText(`残り札 ${actual.ownerDeck.length}`);
  await expect(toggle).toHaveAttribute('aria-controls', 'gameroadSelfDeckInspectPanel');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(panel).toBeHidden();

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(panel).toBeVisible();
  await expect(panel.locator('[data-self-deck-inspect-summary]')).toContainText(`残り ${actual.ownerDeck.length}枚`);

  const domCounts = await panel.locator('[data-self-deck-inspect-row]').evaluateAll((rows) => rows.map((row) => ({
    cardId: row.dataset.cardId,
    count: Number.parseInt(row.querySelector('strong')?.textContent?.replace(/\D/g, '') ?? '0', 10),
  })));
  expect(domCounts).toEqual(counts(actual.ownerDeck));

  // Exact equality to the owner's multiset means no extra opponent-only cards can
  // enter this owner projection, even when the opponent has a different live deck.
  const ownerIds = new Set(actual.ownerDeck);
  const opponentOnlyIds = [...new Set(actual.opponentDecks.flat())].filter((id) => !ownerIds.has(id));
  const renderedIds = new Set(domCounts.map((entry) => entry.cardId));
  for (const id of opponentOnlyIds) expect(renderedIds.has(id), `opponent-only card leaked: ${id}`).toBe(false);

  await page.locator('body').click({ position: { x: 2, y: 2 } });
  await expect(panel).toBeHidden();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');

  await toggle.click();
  await expect(panel).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();

  expect(pageErrors, `page errors: ${pageErrors.join('\n')}`).toEqual([]);
});
