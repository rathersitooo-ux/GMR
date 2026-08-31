import assert from 'node:assert/strict';
import test from 'node:test';

import {
  compatible,
  compatibleRoadCards,
} from '../browser/road-move-compatibility-core.mjs';

function road(value, id = `road-${value}`) {
  return { id, kind: 'road', value };
}

function battle(id = 'battle-1') {
  return { id, kind: 'battle', value: 6 };
}

function path(steps) {
  return { steps };
}

function boardState({ legal = true, stoppable = true } = {}) {
  return {
    roadValueOf(card) {
      return card?.kind === 'road' ? card.value : null;
    },
    pathStepCountOf(currentPath) {
      return currentPath?.steps;
    },
    isPathLegal() {
      return legal;
    },
    isPathStoppable() {
      return stoppable;
    },
  };
}

for (let value = 1; value <= 6; value += 1) {
  test(`Road${value} accepts every legal stoppable path from 1 through ${value} steps`, () => {
    const state = boardState();
    for (let steps = 1; steps <= value; steps += 1) {
      assert.equal(compatible(road(value), path(steps), state), true, `Road${value} should accept ${steps}`);
    }
    assert.equal(compatible(road(value), path(value + 1), state), false);
  });
}

test('Road value is an upper bound rather than exact-match distance', () => {
  const state = boardState();
  for (const steps of [1, 2, 3, 4, 5]) {
    assert.equal(compatible(road(5), path(steps), state), true);
  }
});

test('candidate derivation keeps every matching Road card and never chooses one implicitly', () => {
  const hand = [road(1), road(3), road(5), battle()];
  const before = structuredClone(hand);

  const candidates = compatibleRoadCards(hand, path(2), boardState());

  assert.deepEqual(candidates.map(card => card.id), ['road-3', 'road-5']);
  assert.deepEqual(hand, before);
  assert.equal(candidates[0], hand[1]);
  assert.equal(candidates[1], hand[2]);
});

test('backtracking naturally broadens the derived candidates from current path only', () => {
  const hand = [road(2), road(4), road(5), road(6)];
  const state = boardState();

  assert.deepEqual(
    compatibleRoadCards(hand, path(5), state).map(card => card.value),
    [5, 6],
  );
  assert.deepEqual(
    compatibleRoadCards(hand, path(4), state).map(card => card.value),
    [4, 5, 6],
  );
  assert.deepEqual(
    compatibleRoadCards(hand, path(2), state).map(card => card.value),
    [2, 4, 5, 6],
  );
});

test('existing board legality and stoppability remain authoritative consumers', () => {
  assert.equal(compatible(road(6), path(2), boardState({ legal: false })), false);
  assert.equal(compatible(road(6), path(2), boardState({ stoppable: false })), false);
});

test('non-Road cards and values outside normal Road1-6 fail closed', () => {
  const state = boardState();
  assert.equal(compatible(battle(), path(1), state), false);
  assert.equal(compatible(road(0), path(1), state), false);
  assert.equal(compatible(road(7), path(1), state), false);
  assert.equal(compatible(road(2.5), path(1), state), false);
});

test('zero/invalid paths and missing or throwing adapters fail closed', () => {
  const state = boardState();
  assert.equal(compatible(road(3), path(0), state), false);
  assert.equal(compatible(road(3), path(-1), state), false);
  assert.equal(compatible(road(3), path(1.5), state), false);
  assert.equal(compatible(road(3), path(1), {}), false);
  assert.equal(compatible(road(3), path(1), {
    ...state,
    isPathLegal() {
      throw new Error('stale board adapter');
    },
  }), false);
  assert.deepEqual(compatibleRoadCards(null, path(1), state), []);
});
