import { test, expect } from '@playwright/test';

const ENTRY_PATH = '/browser/GAMEROAD.html';
const VIEWPORT_LABELS = new Set([
  'desktop-1280x720',
  'short-landscape-667x375',
  'phone-390x844',
]);

function observeRuntimeErrors(page) {
  const pageErrors = [];
  const consoleErrors = [];
  const httpErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('response', (response) => {
    if (response.status() < 400) return;
    const url = new URL(response.url());
    if (response.status() === 404 && url.pathname.endsWith('/browser/gameroad-version.json')) return;
    if (response.status() === 404 && url.pathname === '/ws' && url.searchParams.get('partnerOp') === 'visual') return;
    httpErrors.push(`${response.status()} ${url.pathname}`);
  });
  return () => {
    const ignorable404 = (message) => message.includes('Failed to load resource') && message.includes('404');
    expect(pageErrors, `page errors:\n${pageErrors.join('\n')}`).toEqual([]);
    expect(httpErrors, `unexpected HTTP errors:\n${httpErrors.join('\n')}`).toEqual([]);
    expect(consoleErrors.filter((message) => !ignorable404(message)), `console errors:\n${consoleErrors.join('\n')}`).toEqual([]);
  };
}

async function attachFrame(page, testInfo, name) {
  const png = await page.screenshot({ fullPage: true, animations: 'allow' });
  await testInfo.attach(`${testInfo.project.name}-${name}.png`, {
    body: png,
    contentType: 'image/png',
  });
}

async function boot(page) {
  const response = await page.goto(ENTRY_PATH, { waitUntil: 'domcontentloaded' });
  expect(response, 'GAMEROAD HTML response').not.toBeNull();
  expect(response.ok(), `GAMEROAD HTML status ${response.status()}`).toBeTruthy();
  await page.waitForTimeout(900);
  await expect(page.locator('section[data-screen="home"]')).toBeVisible();
  expect(await page.locator('section[data-screen="battle"]').count(), 'Battle screen exists').toBeGreaterThan(0);
}

function visibleHomeControl(page, target) {
  return page.locator(`[data-home-target="${target}"]:visible, [data-go="${target}"]:visible`).first();
}

async function installLegalBattleDeck(page) {
  return page.evaluate(() => {
    const t = window.__GAMEROAD_TEST__;
    if (!t) throw new Error('__GAMEROAD_TEST__ is unavailable');
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

async function enterBasicBattle(page) {
  const deck = await installLegalBattleDeck(page);
  expect(deck.main).toHaveLength(40);
  expect(deck.committed, `legal deck commit: ${JSON.stringify(deck)}`).toBeTruthy();
  expect(deck.savedValidation.ok, `saved deck validation: ${JSON.stringify(deck.savedValidation)}`).toBeTruthy();

  const setupControl = visibleHomeControl(page, 'setup');
  await expect(setupControl).toBeVisible();
  await setupControl.click();
  const setup = page.locator('section[data-screen="setup"]');
  await expect(setup).toBeVisible();
  const roadShield = setup.locator('[data-content="road_shield"]');
  if ((await roadShield.count()) > 0) await roadShield.click();
  const twoPlayer = setup.locator('[data-mode="2p"]');
  if ((await twoPlayer.count()) > 0) await twoPlayer.click();
  const start = setup.locator('#startMatch');
  await expect(start).toBeVisible();
  await expect(start).toBeEnabled();
  await start.click();

  const battle = page.locator('section[data-screen="battle"]');
  await expect(battle).toBeVisible();
  await expect(battle.locator('#phaseTitle')).toContainText('行動を計画');
  return battle;
}

async function visibleOptionalRuleControls(battle) {
  return battle.locator('button:visible, [role="button"]:visible, input:visible, select:visible').evaluateAll((nodes) => nodes
    .map((node) => ({
      text: (node.textContent || '').trim(),
      aria: node.getAttribute('aria-label') || '',
      id: node.id || '',
      action: node.getAttribute('data-action') || '',
      role: node.getAttribute('data-role') || '',
    }))
    .filter((entry) => /サイコロ|ルーレット|dice|roulette/i.test(Object.values(entry).join(' '))));
}

async function assertViewportFit(page, battle) {
  const overflow = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    scrollWidth: document.documentElement.scrollWidth,
    scrollHeight: document.documentElement.scrollHeight,
  }));
  expect(overflow.scrollWidth, `horizontal overflow ${JSON.stringify(overflow)}`).toBeLessThanOrEqual(overflow.innerWidth + 1);

  for (const [label, locator] of [
    ['phase title', battle.locator('#phaseTitle')],
    ['ready plan', battle.locator('#readyPlan')],
  ]) {
    await expect(locator, `${label} visible`).toBeVisible();
    const box = await locator.boundingBox();
    expect(box, `${label} geometry`).not.toBeNull();
    expect(box.x, `${label} left edge`).toBeGreaterThanOrEqual(-1);
    expect(box.y, `${label} top edge`).toBeGreaterThanOrEqual(-1);
    expect(box.x + box.width, `${label} right edge`).toBeLessThanOrEqual(overflow.innerWidth + 1);
    expect(box.y + box.height, `${label} bottom edge`).toBeLessThanOrEqual(overflow.innerHeight + 1);
  }
}

test('Battle final acceptance: three-card Basic state, three viewports, optional rules absent, visual evidence', async ({ page }, testInfo) => {
  test.skip(!VIEWPORT_LABELS.has(testInfo.project.name), `not a WorkUnit46 acceptance viewport: ${testInfo.project.name}`);
  const assertRuntimeClean = observeRuntimeErrors(page);
  await boot(page);
  const battle = await enterBasicBattle(page);

  const handLengths = await page.evaluate(() => window.__GAMEROAD_TEST__.state.match.players.map((player) => player.hand.length));
  expect(handLengths.length, 'match has participants').toBeGreaterThan(0);
  expect(handLengths, 'CURRENT Basic must start every participant with exactly three cards').toEqual(handLengths.map(() => 3));

  const visibleJankenSlots = battle.locator('[data-battle-janken-slidepad="1"] [data-janken-slot]:visible');
  if ((await battle.locator('[data-battle-janken-slidepad="1"]').count()) > 0) {
    const ids = await visibleJankenSlots.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-card-id')).filter(Boolean));
    expect(new Set(ids).size, 'three distinct card identities are projected into Janken slots').toBe(3);
  }

  expect(await visibleOptionalRuleControls(battle), 'Basic exposes no dice/roulette control').toEqual([]);
  await assertViewportFit(page, battle);
  await attachFrame(page, testInfo, 'battle-basic-start');

  const slidePad = battle.locator('[data-battle-janken-slidepad="1"]').first();
  if ((await slidePad.count()) > 0) {
    const handle = slidePad.locator('.grJankenSlidePadHandle:visible').first();
    if ((await handle.count()) > 0) {
      await attachFrame(page, testInfo, 'janken-before-open');
      await handle.click();
      await page.waitForTimeout(120);
      await attachFrame(page, testInfo, 'janken-opening');
      await page.waitForTimeout(320);
      await attachFrame(page, testInfo, 'janken-open-settled');
      await expect(slidePad).toHaveAttribute('data-expanded', 'true');
      expect(await visibleOptionalRuleControls(battle), 'opening Janken does not reveal optional dice/roulette controls').toEqual([]);
    }
  }

  assertRuntimeClean();
});
