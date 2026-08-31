import test from 'node:test';
import assert from 'node:assert/strict';

import {
  NEW_BASE_DICE_ROLL_SCHEMA,
  rollAuthoritativeNewBaseDice,
} from '../browser/new-base-authoritative-dice-core.mjs';

const identity = Object.freeze({
  matchId: 'match-new-base-01',
  turnId: 'turn-0007',
  rollId: 'roll-0007',
});

test('binds one injected authoritative roll to exact match/turn/roll identity', () => {
  const requests = [];
  const result = rollAuthoritativeNewBaseDice({
    ...identity,
    sides: 9,
    nextInteger(request) {
      requests.push(request);
      return 7;
    },
  });

  assert.deepEqual(requests, [{
    min: 1,
    max: 9,
    ...identity,
  }]);
  assert.deepEqual(result, {
    schema: NEW_BASE_DICE_ROLL_SCHEMA,
    ...identity,
    sides: 9,
    value: 7,
    diceDelta: 7,
  });
  assert.equal(Object.isFrozen(requests[0]), true);
  assert.equal(Object.isFrozen(result), true);
});

test('does not invent a six-sided default', () => {
  for (const sides of [1, 4, 12, 20]) {
    const result = rollAuthoritativeNewBaseDice({
      ...identity,
      sides,
      nextInteger: ({ max }) => max,
    });
    assert.equal(result.sides, sides);
    assert.equal(result.value, sides);
    assert.equal(result.diceDelta, sides);
  }

  assert.throws(() => rollAuthoritativeNewBaseDice({
    ...identity,
    nextInteger: () => 1,
  }), /sides/);
});

test('pulls the authoritative integer source exactly once per roll call', () => {
  let calls = 0;
  const result = rollAuthoritativeNewBaseDice({
    ...identity,
    sides: 6,
    nextInteger: () => {
      calls += 1;
      return 3;
    },
  });
  assert.equal(calls, 1);
  assert.equal(result.value, 3);
});

test('fails closed when the injected source returns an invalid roll', () => {
  for (const value of [0, 7, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => rollAuthoritativeNewBaseDice({
      ...identity,
      sides: 6,
      nextInteger: () => value,
    }), /authoritative dice value/);
  }
});

test('fails closed for invalid side counts and missing entropy source', () => {
  for (const sides of [0, -1, 2.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => rollAuthoritativeNewBaseDice({
      ...identity,
      sides,
      nextInteger: () => 1,
    }), /sides/);
  }
  assert.throws(() => rollAuthoritativeNewBaseDice({ ...identity, sides: 6 }), /nextInteger/);
});

test('requires canonical non-empty identity strings', () => {
  for (const field of ['matchId', 'turnId', 'rollId']) {
    for (const value of ['', ' padded ', null, undefined]) {
      assert.throws(() => rollAuthoritativeNewBaseDice({
        ...identity,
        [field]: value,
        sides: 6,
        nextInteger: () => 1,
      }), new RegExp(field));
    }
  }
});

test('stays decoupled from movement, card, Honey and mana policy', () => {
  const result = rollAuthoritativeNewBaseDice({
    ...identity,
    sides: 8,
    nextInteger: () => 5,
  });
  assert.deepEqual(Object.keys(result), [
    'schema', 'matchId', 'turnId', 'rollId', 'sides', 'value', 'diceDelta',
  ]);
  for (const forbidden of ['movementBudget', 'cardValue', 'path', 'honeyDelta', 'manaDelta', 'maximumMana']) {
    assert.equal(Object.hasOwn(result, forbidden), false);
  }
});
