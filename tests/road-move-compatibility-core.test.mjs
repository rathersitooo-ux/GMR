import assert from 'node:assert/strict';
import test from 'node:test';

import { compatible, compatibleRoadCards } from '../browser/road-move-compatibility-core.mjs';
import { rollAuthoritativeNewBaseDice } from '../browser/new-base-authoritative-dice-core.mjs';
import { composeTurnMovementBudget } from '../browser/new-base-movement-budget-core.mjs';
import {
  isBattleOptionalRuleEnabled,
  projectBattleOptionalRuleActivation,
} from '../browser/battle-optional-rule-activation-core.mjs';

function road({ id, printedNumber, movementDelta = 0 } = {}) {
  return { id, kind: 'road', printedNumber, movementDelta };
}
function battle(id = 'battle-1') { return { id, kind: 'battle', printedNumber: 6, movementDelta: 99 }; }
function path(steps) { return { steps }; }
function boardState({ legal = true, stoppable = true, diceMovementDelta = 0 } = {}) {
  return {
    movementBudgetOf(card) {
      if (card?.kind !== 'road') return null;
      return composeTurnMovementBudget({
        baseMovementBudget: card.movementDelta,
        diceMovementDelta,
      })?.totalMovementBudget ?? null;
    },
    pathStepCountOf(currentPath) { return currentPath?.steps; },
    isPathLegal() { return legal; },
    isPathStoppable() { return stoppable; },
  };
}

test('printed Road number is not movement authority', () => {
  const card = road({ id: 'printed-6-no-move', printedNumber: 6, movementDelta: 0 });
  assert.equal(compatible(card, path(1), boardState()), false);
});

test('explicit movement effect, not printed rank, sets the Road movement budget', () => {
  const card = road({ id: 'printed-1-move-4', printedNumber: 1, movementDelta: 4 });
  for (const steps of [1, 2, 3, 4]) assert.equal(compatible(card, path(steps), boardState()), true);
  assert.equal(compatible(card, path(5), boardState()), false);
});

test('a Road with no movement effect can still move when an enabled dice rule contributes movement', () => {
  const roll = rollAuthoritativeNewBaseDice({
    matchId: 'm1', turnId: 't1', rollId: 'r1', sides: 6, nextInteger: () => 4,
  });
  const card = road({ id: 'dice-only-road', printedNumber: 6, movementDelta: 0 });
  const state = boardState({ diceMovementDelta: roll.diceDelta });
  assert.equal(compatible(card, path(4), state), true);
  assert.equal(compatible(card, path(5), state), false);
});

test('the same Road with no movement effect cannot move when dice contributes zero', () => {
  const card = road({ id: 'no-dice-no-move', printedNumber: 6, movementDelta: 0 });
  assert.equal(compatible(card, path(1), boardState({ diceMovementDelta: 0 })), false);
});

test('dice contributes only when the authoritative rule context enables it', () => {
  const roll = rollAuthoritativeNewBaseDice({
    matchId: 'm2', turnId: 't2', rollId: 'r2', sides: 6, nextInteger: () => 5,
  });
  const card = road({ id: 'conditional-dice-road', printedNumber: 3, movementDelta: 0 });
  const basic = projectBattleOptionalRuleActivation();
  const diceMap = projectBattleOptionalRuleActivation({
    authorityRef: 'MAP:DICE-ON',
    optionalRules: { dice: { enabled: true, parameters: { sides: 6 } } },
  });
  const basicDelta = isBattleOptionalRuleEnabled(basic, 'dice') ? roll.diceDelta : 0;
  const enabledDelta = isBattleOptionalRuleEnabled(diceMap, 'dice') ? roll.diceDelta : 0;

  assert.equal(compatible(card, path(1), boardState({ diceMovementDelta: basicDelta })), false);
  assert.equal(compatible(card, path(5), boardState({ diceMovementDelta: enabledDelta })), true);
});

test('movement budgets may exceed six when explicit effects and dice compose', () => {
  const card = road({ id: 'move-5-plus-die', printedNumber: 2, movementDelta: 5 });
  const state = boardState({ diceMovementDelta: 4 });
  assert.equal(compatible(card, path(9), state), true);
  assert.equal(compatible(card, path(10), state), false);
});

test('candidate derivation keeps every matching Road card and never chooses one implicitly', () => {
  const hand = [
    road({ id: 'none', printedNumber: 6, movementDelta: 0 }),
    road({ id: 'move-2', printedNumber: 1, movementDelta: 2 }),
    road({ id: 'move-5', printedNumber: 3, movementDelta: 5 }),
    battle(),
  ];
  const before = structuredClone(hand);
  const candidates = compatibleRoadCards(hand, path(2), boardState());
  assert.deepEqual(candidates.map(card => card.id), ['move-2', 'move-5']);
  assert.deepEqual(hand, before);
});

test('backtracking naturally broadens candidates from current authoritative budgets', () => {
  const hand = [
    road({ id: 'move-2', printedNumber: 6, movementDelta: 2 }),
    road({ id: 'move-4', printedNumber: 1, movementDelta: 4 }),
    road({ id: 'move-7', printedNumber: 3, movementDelta: 7 }),
  ];
  const state = boardState();
  assert.deepEqual(compatibleRoadCards(hand, path(5), state).map(card => card.id), ['move-7']);
  assert.deepEqual(compatibleRoadCards(hand, path(2), state).map(card => card.id), ['move-2', 'move-4', 'move-7']);
});

test('existing board legality and stoppability remain authoritative consumers', () => {
  const card = road({ id: 'move-8', printedNumber: 1, movementDelta: 8 });
  assert.equal(compatible(card, path(2), boardState({ legal: false })), false);
  assert.equal(compatible(card, path(2), boardState({ stoppable: false })), false);
});

test('non-Road cards and invalid movement budgets fail closed', () => {
  assert.equal(compatible(battle(), path(1), boardState({ diceMovementDelta: 4 })), false);
  const card = road({ id: 'bad', printedNumber: 6, movementDelta: -1 });
  assert.equal(compatible(card, path(1), boardState()), false);
});

test('zero or invalid paths and missing or throwing adapters fail closed', () => {
  const card = road({ id: 'move-3', printedNumber: 6, movementDelta: 3 });
  const state = boardState();
  assert.equal(compatible(card, path(0), state), false);
  assert.equal(compatible(card, path(-1), state), false);
  assert.equal(compatible(card, path(1.5), state), false);
  assert.equal(compatible(card, path(1), {}), false);
  assert.equal(compatible(card, path(1), { ...state, isPathLegal() { throw new Error('stale'); } }), false);
  assert.deepEqual(compatibleRoadCards(null, path(1), state), []);
});
