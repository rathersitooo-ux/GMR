import assert from 'node:assert/strict';
import test from 'node:test';

import { composeTurnMovementBudget } from '../browser/new-base-movement-budget-core.mjs';

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
