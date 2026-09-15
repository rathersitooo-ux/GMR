import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BATTLE_HIDDEN_ROAD_JANKEN_ADD_CONTROL_CSS,
  createBattleHiddenRoadJankenAddController,
  projectBattleHiddenRoadJankenAddControl,
} from '../browser/battle-hidden-road-janken-add-control.mjs';

test('hidden Road add control is actionable only when the exact reserved card can enter an empty Road-janken membership', () => {
  const ready = projectBattleHiddenRoadJankenAddControl({
    hiddenPrivilegeAvailable: true,
    reservedCardId: 'road-hidden-7',
    roadJankenCardPresent: false,
    stageAvailable: true,
  });
  assert.equal(ready.enabled, true);
  assert.equal(ready.cardId, 'road-hidden-7');
  assert.equal(ready.visualState, 'deep-lemon-gummy-gold');

  const occupied = projectBattleHiddenRoadJankenAddControl({
    hiddenPrivilegeAvailable: true,
    reservedCardId: 'road-hidden-7',
    roadJankenCardPresent: true,
    stageAvailable: true,
  });
  assert.equal(occupied.enabled, false);
  assert.equal(occupied.disabledReason, 'road-card-already-present');
  assert.equal(occupied.visualState, 'gray');
});

test('missing privilege, exact reserved card, or current stage authority fails closed', () => {
  assert.equal(projectBattleHiddenRoadJankenAddControl({
    hiddenPrivilegeAvailable: false,
    reservedCardId: 'road-hidden-7',
  }).disabledReason, 'hidden-privilege-unavailable');

  assert.equal(projectBattleHiddenRoadJankenAddControl({
    hiddenPrivilegeAvailable: true,
    reservedCardId: '',
  }).disabledReason, 'reserved-card-unavailable');

  assert.equal(projectBattleHiddenRoadJankenAddControl({
    hiddenPrivilegeAvailable: true,
    reservedCardId: 'road-hidden-7',
    stageAvailable: false,
  }).disabledReason, 'road-stage-unavailable');
});

test('press delegates the same physical hidden Road card once and reprojects existing Road membership', async () => {
  const context = {
    hiddenPrivilegeAvailable: true,
    reservedCardId: 'road-hidden-7',
    roadJankenCardPresent: false,
    stageAvailable: true,
  };
  const delegated = [];
  const controller = createBattleHiddenRoadJankenAddController({
    readContext: () => ({ ...context }),
    stageReservedRoad: async (cardId) => {
      delegated.push(cardId);
      context.roadJankenCardPresent = true;
      return true;
    },
  });

  const result = await controller.press();
  assert.equal(result.accepted, true);
  assert.equal(result.cardId, 'road-hidden-7');
  assert.deepEqual(delegated, ['road-hidden-7']);
  assert.equal(result.projection.disabledReason, 'road-card-already-present');
  assert.equal(result.projection.visualState, 'gray');

  const second = await controller.press();
  assert.equal(second.accepted, false);
  assert.equal(second.reason, 'road-card-already-present');
  assert.deepEqual(delegated, ['road-hidden-7']);
});

test('button press never manufactures privilege consumption or a second hidden-card identity', async () => {
  const context = {
    hiddenPrivilegeAvailable: true,
    reservedCardId: 'same-physical-road',
    roadJankenCardPresent: false,
    stageAvailable: true,
  };
  let delegatedCardId = null;
  const controller = createBattleHiddenRoadJankenAddController({
    readContext: () => ({ ...context }),
    stageReservedRoad: (cardId) => {
      delegatedCardId = cardId;
      context.roadJankenCardPresent = true;
      return true;
    },
  });

  await controller.press();
  assert.equal(delegatedCardId, 'same-physical-road');
  assert.equal(context.hiddenPrivilegeAvailable, true);
  assert.equal(context.reservedCardId, 'same-physical-road');
});

test('re-entrant activation is blocked while the existing Road stage delegation is in flight', async () => {
  let release;
  const barrier = new Promise((resolve) => { release = resolve; });
  let calls = 0;
  const controller = createBattleHiddenRoadJankenAddController({
    readContext: () => ({
      hiddenPrivilegeAvailable: true,
      reservedCardId: 'road-hidden-7',
      roadJankenCardPresent: false,
      stageAvailable: true,
    }),
    stageReservedRoad: async () => {
      calls += 1;
      await barrier;
      return true;
    },
  });

  const first = controller.press();
  const second = await controller.press();
  assert.equal(second.accepted, false);
  assert.equal(second.reason, 'in-flight');
  assert.equal(calls, 1);
  release();
  assert.equal((await first).accepted, true);
});

test('presentation uses the requested lemon-gummy gold family and a semantic grey disabled state', () => {
  assert.match(BATTLE_HIDDEN_ROAD_JANKEN_ADD_CONTROL_CSS, /lemonchiffon/);
  assert.match(BATTLE_HIDDEN_ROAD_JANKEN_ADD_CONTROL_CSS, /gold/);
  assert.match(BATTLE_HIDDEN_ROAD_JANKEN_ADD_CONTROL_CSS, /goldenrod/);
  assert.match(BATTLE_HIDDEN_ROAD_JANKEN_ADD_CONTROL_CSS, /darkgoldenrod/);
  assert.match(BATTLE_HIDDEN_ROAD_JANKEN_ADD_CONTROL_CSS, /:disabled/);
  assert.match(BATTLE_HIDDEN_ROAD_JANKEN_ADD_CONTROL_CSS, /gray/);
  assert.match(BATTLE_HIDDEN_ROAD_JANKEN_ADD_CONTROL_CSS, /pointer-events:none/);
});
