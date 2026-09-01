import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveCyclicTriad, resolveCyclicTriadByProcessingOrder } from '../browser/triad-resolver-core.mjs';

const HAND_ORDER = Object.freeze(['alpha', 'beta', 'gamma']);
const BEATS = Object.freeze({ alpha: 'beta', beta: 'gamma', gamma: 'alpha' });
const NO_HAND = 'idle';
const CONFIG = Object.freeze({ handOrder: HAND_ORDER, beats: BEATS, noHand: NO_HAND });
const TOKENS = [...HAND_ORDER, NO_HAND];

function reference(selections) {
  const active = selections.filter((entry) => entry.hand !== NO_HAND);
  const seenHands = new Set(active.map((entry) => entry.hand));
  const uniqueHands = HAND_ORDER.filter((hand) => seenHands.has(hand));
  let winningHand = null;
  if (uniqueHands.length === 1) winningHand = uniqueHands[0];
  else if (uniqueHands.length === 2) {
    const [a, b] = uniqueHands;
    winningHand = BEATS[a] === b ? a : b;
  }
  return {
    participants: active.map((entry) => entry.playerId).sort(),
    nonParticipants: selections.filter((entry) => entry.hand === NO_HAND).map((entry) => entry.playerId).sort(),
    uniqueHands,
    winningHand,
    winners: winningHand === null
      ? []
      : active.filter((entry) => entry.hand === winningHand).map((entry) => entry.playerId).sort(),
  };
}

function enumerateHands(count, prefix = []) {
  if (prefix.length === count) return [prefix];
  return TOKENS.flatMap((hand) => enumerateHands(count, [...prefix, hand]));
}

for (const playerCount of [2, 3, 4]) {
  test(`neutral triad resolver matches the exhaustive ${playerCount}-player reference`, () => {
    for (const hands of enumerateHands(playerCount)) {
      const selections = hands.map((hand, index) => ({ playerId: `p${playerCount - index}`, hand }));
      assert.deepEqual(resolveCyclicTriad(selections, CONFIG), reference(selections));
    }
  });
}

test('one hand wins itself, two hands use the configured edge, and all three tie', () => {
  assert.equal(resolveCyclicTriad([
    { playerId: 'b', hand: 'alpha' },
    { playerId: 'a', hand: 'alpha' },
  ], CONFIG).winningHand, 'alpha');
  assert.equal(resolveCyclicTriad([
    { playerId: 'a', hand: 'alpha' },
    { playerId: 'b', hand: 'beta' },
  ], CONFIG).winningHand, 'alpha');
  assert.equal(resolveCyclicTriad([
    { playerId: 'a', hand: 'alpha' },
    { playerId: 'b', hand: 'beta' },
    { playerId: 'c', hand: 'gamma' },
  ], CONFIG).winningHand, null);
});

test('nonparticipants are excluded and all returned identity arrays use deterministic order', () => {
  assert.deepEqual(resolveCyclicTriad([
    { playerId: 'z', hand: 'idle' },
    { playerId: 'c', hand: 'beta' },
    { playerId: 'a', hand: 'alpha' },
    { playerId: 'b', hand: 'alpha' },
  ], CONFIG), {
    participants: ['a', 'b', 'c'],
    nonParticipants: ['z'],
    uniqueHands: ['alpha', 'beta'],
    winningHand: 'alpha',
    winners: ['a', 'b'],
  });
});

test('selection validation rejects malformed, duplicate, and unsupported inputs', () => {
  assert.throws(() => resolveCyclicTriad(null, CONFIG), /selections must be an array/);
  assert.throws(() => resolveCyclicTriad([null], CONFIG), /selection must be an object/);
  assert.throws(() => resolveCyclicTriad([
    { playerId: 'a', hand: 'alpha' },
    { playerId: 'a', hand: 'beta' },
  ], CONFIG), /duplicate playerId/);
  assert.throws(() => resolveCyclicTriad([{ playerId: 'a', hand: 'rock' }], CONFIG), /unsupported triad hand/);
});

test('configuration validation requires exactly one closed three-hand cycle', () => {
  assert.throws(() => resolveCyclicTriad([], { handOrder: ['a', 'b'], beats: {} }), /exactly three/);
  assert.throws(() => resolveCyclicTriad([], {
    handOrder: ['a', 'a', 'b'], beats: { a: 'b', b: 'a' }, noHand: 'idle',
  }), /distinct/);
  assert.throws(() => resolveCyclicTriad([], {
    handOrder: ['a', 'b', 'c'], beats: { a: 'a', b: 'c', c: 'b' }, noHand: 'idle',
  }), /must not map a to itself/);
  assert.throws(() => resolveCyclicTriad([], {
    handOrder: ['a', 'b', 'c'], beats: { a: 'b', b: 'a', c: 'a' }, noHand: 'idle',
  }), /closed three-hand cycle/);
  assert.throws(() => resolveCyclicTriad([], {
    handOrder: ['a', 'b', 'c'], beats: { a: 'b', b: 'c', c: 'a' }, noHand: 'a',
  }), /noHand must be distinct/);
});

test('ordered elimination reuses the cyclic contest and invalidates only losing hands', () => {
  assert.deepEqual(resolveCyclicTriadByProcessingOrder([
    { playerId: 'p1', hand: 'alpha' },
    { playerId: 'p2', hand: 'beta' },
    { playerId: 'p3', hand: 'gamma' },
    { playerId: 'p4', hand: 'gamma' },
  ], CONFIG), {
    processingOrder: ['p1', 'p2', 'p3', 'p4'],
    nonParticipants: [],
    survivingHand: 'gamma',
    survivors: ['p3', 'p4'],
    invalidated: ['p2', 'p1'],
    steps: [
      {
        processedPlayerId: 'p2',
        winningHand: 'alpha',
        invalidated: ['p2'],
        survivors: ['p1'],
      },
      {
        processedPlayerId: 'p3',
        winningHand: 'gamma',
        invalidated: ['p1'],
        survivors: ['p3'],
      },
      {
        processedPlayerId: 'p4',
        winningHand: 'gamma',
        invalidated: [],
        survivors: ['p3', 'p4'],
      },
    ],
  });
});

test('ordered elimination never assigns a destination to invalidated cards', () => {
  const result = resolveCyclicTriadByProcessingOrder([
    { playerId: 'p1', hand: 'alpha' },
    { playerId: 'p2', hand: 'gamma' },
  ], CONFIG);
  assert.deepEqual(result.invalidated, ['p1']);
  assert.equal('destination' in result, false);
  assert.equal(JSON.stringify(result).includes('graveyard'), false);
  assert.equal(JSON.stringify(result).includes('chip'), false);
  assert.equal(JSON.stringify(result).includes('subdeck'), false);
});

test('four-player ordered elimination statistics cover every three-hand profile', () => {
  const activeHands = [...HAND_ORDER];
  const profiles = [];
  function enumerateActive(prefix = []) {
    if (prefix.length === 4) {
      profiles.push(prefix);
      return;
    }
    for (const hand of activeHands) enumerateActive([...prefix, hand]);
  }
  enumerateActive();

  const invalidatedCounts = new Map();
  const survivingHands = new Map(activeHands.map((hand) => [hand, 0]));
  const threeHandInvalidatedCounts = new Map();

  for (const hands of profiles) {
    const result = resolveCyclicTriadByProcessingOrder(
      hands.map((hand, index) => ({ playerId: `p${index + 1}`, hand })),
      CONFIG,
    );
    invalidatedCounts.set(
      result.invalidated.length,
      (invalidatedCounts.get(result.invalidated.length) ?? 0) + 1,
    );
    survivingHands.set(
      result.survivingHand,
      (survivingHands.get(result.survivingHand) ?? 0) + 1,
    );
    if (new Set(hands).size === 3) {
      threeHandInvalidatedCounts.set(
        result.invalidated.length,
        (threeHandInvalidatedCounts.get(result.invalidated.length) ?? 0) + 1,
      );
    }
  }

  assert.equal(profiles.length, 81);
  assert.deepEqual(Object.fromEntries(invalidatedCounts), { 0: 3, 1: 12, 2: 24, 3: 42 });
  assert.deepEqual(Object.fromEntries(survivingHands), { alpha: 27, beta: 27, gamma: 27 });
  assert.deepEqual(Object.fromEntries(threeHandInvalidatedCounts), { 2: 6, 3: 30 });
});
