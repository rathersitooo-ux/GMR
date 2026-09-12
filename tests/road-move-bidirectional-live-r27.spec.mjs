import { test, expect } from '@playwright/test';

async function bootRoadBattle(page) {
  const response = await page.goto('/browser/GAMEROAD.html', { waitUntil: 'domcontentloaded' });
  expect(response?.ok(), 'GAMEROAD.html loads').toBeTruthy();
  await page.waitForTimeout(300);

  await expect.poll(
    () => page.evaluate(() => typeof window.__GAMEROAD_TEST__?.start === 'function'),
    { timeout: 100000 },
  ).toBe(true);
  await page.evaluate(() => window.__GAMEROAD_TEST__.start('2p', 'road_shield'));

  const battle = page.locator('section[data-screen="battle"]');
  await expect(battle).toBeVisible();

  const fixture = await page.evaluate(() => {
    const me = window.__GAMEROAD_TEST__.state.match.players[0];
    const preferred = { 1: 'SP_A', 3: 'SP_3', 5: 'SP_5', 6: 'SP_6' };
    const byId = new Map(window.__CARD_DATA__.map((card) => [card.id, card]));
    const byPower = new Map();
    for (const power of [1, 3, 5, 6]) {
      const card = byId.get(preferred[power]);
      if (!card || card.runtime_status !== 'playable' || Number(card.power) !== power) {
        throw new Error(`invalid current Road fixture power ${power}`);
      }
      byPower.set(power, card.id);
    }
    me.hand = [1, 3, 5, 6].map((power) => byPower.get(power));
    me.plan = { roadId: null, battleId: null, path: [me.position] };
    window.__GAMEROAD_TEST__.battlePresentationRender();
    return { byPower: Object.fromEntries(byPower), position: me.position };
  });
  return { battle, fixture };
}

async function roadSnapshot(page) {
  return page.evaluate(() => {
    const me = window.__GAMEROAD_TEST__.state.match.players[0];
    const cards = [...document.querySelectorAll('#hand .handCard[data-card-id]')].map((node) => ({
      id: node.dataset.cardId,
      state: node.dataset.roadMoveState || null,
      disabled: node.disabled || node.getAttribute('aria-disabled') === 'true',
      rects: node.getClientRects().length,
    }));
    return {
      roadId: me.plan?.roadId || null,
      battleId: me.plan?.battleId || null,
      path: [...(me.plan?.path || [me.position])],
      compatibleRoadIds: cards.filter((card) => card.state === 'COMPATIBLE' || card.state === 'FOCUSED').map((card) => card.id),
      invalidFocusIds: cards.filter((card) => card.state === 'INVALID_FOCUS').map((card) => card.id),
      cards,
    };
  });
}

test('move-first exposes legal movement and model-derived Road candidates without touching Battle selection', async ({ page }) => {
  const { battle, fixture } = await bootRoadBattle(page);
  await expect(battle.locator('#roadSelect')).toHaveValue('');
  await expect(battle.locator('#battleSelect')).toHaveValue('');

  const twoStep = battle.locator('.node.reachable[data-move-distance="2"]').first();
  await expect(twoStep, 'move-first must expose a 2-step target before Road focus').toBeEnabled();
  await twoStep.click();

  const moved = await roadSnapshot(page);
  expect(moved.path.length - 1).toBe(2);
  expect(moved.roadId).toBeNull();
  expect(moved.battleId).toBeNull();
  expect(new Set(moved.compatibleRoadIds)).toEqual(new Set([fixture.byPower[3], fixture.byPower[5], fixture.byPower[6]]));

  const beforeRerender = [...moved.compatibleRoadIds].sort();
  await page.evaluate(() => window.__GAMEROAD_TEST__.battlePresentationRender());
  const afterRerender = await roadSnapshot(page);
  expect([...afterRerender.compatibleRoadIds].sort(), 'hand rerender must not change model-derived compatibility truth').toEqual(beforeRerender);
  expect(afterRerender.battleId).toBeNull();
});

test('candidate touch focuses Road and preserves the current path; no compatible candidate is auto-submitted', async ({ page }) => {
  const { battle, fixture } = await bootRoadBattle(page);
  const twoStep = battle.locator('.node.reachable[data-move-distance="2"]').first();
  await expect(twoStep).toBeEnabled();
  await twoStep.click();
  const before = await roadSnapshot(page);
  expect(before.roadId).toBeNull();
  expect(before.compatibleRoadIds.length).toBeGreaterThan(1);

  const road5 = fixture.byPower[5];
  await battle.locator(`#hand .handCard[data-card-id="${road5}"]`).click();
  const focused = await roadSnapshot(page);
  expect(focused.roadId).toBe(road5);
  expect(focused.battleId).toBeNull();
  expect(focused.path).toEqual(before.path);
  await expect(battle.locator(`#hand .handCard[data-card-id="${road5}"]`)).toHaveAttribute('data-road-move-state', 'FOCUSED');
});

test('card-first supports Elastic Focus and switching Road cards without discarding the path', async ({ page }) => {
  const { battle, fixture } = await bootRoadBattle(page);
  const road3 = fixture.byPower[3];
  const road5 = fixture.byPower[5];

  await battle.locator(`#hand .handCard[data-card-id="${road3}"]`).click();
  await expect(battle.locator('#roadSelect')).toHaveValue(road3);

  const fourStep = battle.locator('.node.reachable[data-move-distance="4"]').first();
  await expect(fourStep, 'another held Road card should keep the 4-step extension inspectable').toBeEnabled();
  await fourStep.click();

  const extended = await roadSnapshot(page);
  expect(extended.path.length - 1).toBe(4);
  expect(extended.roadId).toBe(road3);
  expect(extended.battleId).toBeNull();
  expect(extended.invalidFocusIds).toContain(road3);
  expect(extended.compatibleRoadIds).toEqual(expect.arrayContaining([road5, fixture.byPower[6]]));

  const heldPath = [...extended.path];
  await battle.locator(`#hand .handCard[data-card-id="${road5}"]`).click();
  const switched = await roadSnapshot(page);
  expect(switched.roadId).toBe(road5);
  expect(switched.battleId).toBeNull();
  expect(switched.path).toEqual(heldPath);
});

test('backtracking recomputes and expands Road candidates from the current path', async ({ page }) => {
  const { battle, fixture } = await bootRoadBattle(page);
  const fiveStep = battle.locator('.node.reachable[data-move-distance="5"]').first();
  await expect(fiveStep).toBeEnabled();
  await fiveStep.click();
  let snap = await roadSnapshot(page);
  expect(snap.path.length - 1).toBe(5);
  expect(new Set(snap.compatibleRoadIds)).toEqual(new Set([fixture.byPower[5], fixture.byPower[6]]));

  for (let i = 0; i < 3; i += 1) await battle.locator('#clearPath').click();
  snap = await roadSnapshot(page);
  expect(snap.path.length - 1).toBe(2);
  expect(new Set(snap.compatibleRoadIds)).toEqual(new Set([fixture.byPower[3], fixture.byPower[5], fixture.byPower[6]]));
  expect(snap.battleId).toBeNull();
});
