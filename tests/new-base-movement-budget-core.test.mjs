import assert from 'node:assert/strict';
import test from 'node:test';

import {
  composeExplicitTurnMovementBudget,
  composeTurnMovementBudget,
} from '../browser/new-base-movement-budget-core.mjs';

test('adds an authoritative dice delta to an authoritative base movement budget', () => {
  assert.deepEqual(
    composeTurnMovementBudget({ baseMovementBudget: 3, diceMovementDelta: 4 }),
    {
      baseMovementBudget: 3,
      diceMovementDelta: 4,
      totalMovementBudget: 7,
    },
  );
});

test('preserves both contributors in an immutable snapshot', () => {
  const budget = composeTurnMovementBudget({ baseMovementBudget: 2, diceMovementDelta: 6 });

  assert.equal(budget.baseMovementBudget, 2);
  assert.equal(budget.diceMovementDelta, 6);
  assert.equal(budget.totalMovementBudget, 8);
  assert.equal(Object.isFrozen(budget), true);
});

test('accepts zero base movement without inventing a card-derived movement value', () => {
  assert.deepEqual(
    composeTurnMovementBudget({ baseMovementBudget: 0, diceMovementDelta: 5 }),
    {
      baseMovementBudget: 0,
      diceMovementDelta: 5,
      totalMovementBudget: 5,
    },
  );
});

test('does not invent a movement cap or reinterpret caller-authoritative inputs', () => {
  assert.deepEqual(
    composeTurnMovementBudget({ baseMovementBudget: 7, diceMovementDelta: 9 }),
    {
      baseMovementBudget: 7,
      diceMovementDelta: 9,
      totalMovementBudget: 16,
    },
  );
});

test('fails closed for missing, invalid, negative, fractional, or overflowing inputs', () => {
  const invalidCases = [
    {},
    { baseMovementBudget: null, diceMovementDelta: 1 },
    { baseMovementBudget: 1, diceMovementDelta: null },
    { baseMovementBudget: -1, diceMovementDelta: 1 },
    { baseMovementBudget: 1, diceMovementDelta: -1 },
    { baseMovementBudget: 1.5, diceMovementDelta: 1 },
    { baseMovementBudget: 1, diceMovementDelta: 1.5 },
    { baseMovementBudget: '1', diceMovementDelta: 1 },
    { baseMovementBudget: 1, diceMovementDelta: '1' },
    { baseMovementBudget: Number.NaN, diceMovementDelta: 1 },
    { baseMovementBudget: 1, diceMovementDelta: Number.POSITIVE_INFINITY },
    { baseMovementBudget: Number.MAX_SAFE_INTEGER, diceMovementDelta: 1 },
  ];

  for (const input of invalidCases) {
    assert.equal(composeTurnMovementBudget(input), null);
  }
});

test('a Road with no movement effect and no dice contributes zero movement', () => {
  assert.deepEqual(composeExplicitTurnMovementBudget(), {
    ruleMovementDelta: 0,
    cardMovementDelta: 0,
    diceMovementDelta: 0,
    additionalMovementDeltas: [],
    totalMovementBudget: 0,
  });
});

test('explicit card movement works without inferring printed rank', () => {
  assert.equal(
    composeExplicitTurnMovementBudget({ cardMovementDelta: 4 }).totalMovementBudget,
    4,
  );
});

test('optional dice can supply movement even when the Road effect contributes zero', () => {
  assert.equal(
    composeExplicitTurnMovementBudget({ diceMovementDelta: 4 }).totalMovementBudget,
    4,
  );
});

test('resolved rule, card, dice and additional effects compose without a six-step cap', () => {
  assert.deepEqual(composeExplicitTurnMovementBudget({
    ruleMovementDelta: 2,
    cardMovementDelta: 3,
    diceMovementDelta: 4,
    additionalMovementDeltas: [1, 2],
  }), {
    ruleMovementDelta: 2,
    cardMovementDelta: 3,
    diceMovementDelta: 4,
    additionalMovementDeltas: [1, 2],
    totalMovementBudget: 12,
  });
});

test('explicit contribution snapshot is detached and deeply immutable where it owns arrays', () => {
  const extras = [1, 2];
  const out = composeExplicitTurnMovementBudget({ additionalMovementDeltas: extras });
  extras.push(99);

  assert.deepEqual(out.additionalMovementDeltas, [1, 2]);
  assert.equal(Object.isFrozen(out), true);
  assert.equal(Object.isFrozen(out.additionalMovementDeltas), true);
});

test('explicit contribution composer fails closed for invalid or overflowing deltas', () => {
  const invalidCases = [
    { ruleMovementDelta: -1 },
    { cardMovementDelta: 1.5 },
    { diceMovementDelta: '1' },
    { additionalMovementDeltas: null },
    { additionalMovementDeltas: [1, -1] },
    { additionalMovementDeltas: [Number.NaN] },
    { ruleMovementDelta: Number.MAX_SAFE_INTEGER, cardMovementDelta: 1 },
    { ruleMovementDelta: Number.MAX_SAFE_INTEGER - 1, additionalMovementDeltas: [1, 1] },
  ];

  for (const input of invalidCases) {
    assert.equal(composeExplicitTurnMovementBudget(input), null);
  }
});
