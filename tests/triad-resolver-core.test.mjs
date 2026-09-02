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

test('ordered resolution locks an earlier winner outside later comparison', () => {
  assert.deepEqual(resolveCyclicTriadByProcessingOrder([
    { playerId: 'p1', hand: 'alpha' },
    { playerId: 'p2', hand: 'beta' },
    { playerId: 'p3', hand: 'gamma' },
    { playerId: 'p4', hand: 'gamma' },
  ], CONFIG), {
    processingOrder: ['p1', 'p2', 'p3', 'p4'],
    nonParticipants: [],
    survivingHand: 'alpha',
    survivors: ['p1', 'p3', 'p4'],
    resolvedWinners: ['p1'],
    unresolvedSurvivors: ['p3', 'p4'],
    invalidated: ['p2'],
    steps: [
      {
        processedPlayerId: 'p1',
        winningHand: 'alpha',
        resolvedWinner: true,
        invalidated: ['p2'],
        survivors: ['p1', 'p3', 'p4'],
      },
      {
        processedPlayerId: 'p3',
        winningHand: 'gamma',
        resolvedWinner: false,
        invalidated: [],
        survivors: ['p1', 'p3', 'p4'],
      },
      {
        processedPlayerId: 'p4',
        winningHand: 'gamma',
        resolvedWinner: false,
        invalidated: [],
        survivors: ['p1', 'p3', 'p4'],
      },
    ],
  });
});

test('a card that scores a win cannot be invalidated by a later counter', () => {
  const result = resolveCyclicTriadByProcessingOrder([
    { playerId: 'p1', hand: 'alpha' },
    { playerId: 'p2', hand: 'gamma' },
    { playerId: 'p3', hand: 'beta' },
  ], CONFIG);
  assert.deepEqual(result.invalidated, ['p3']);
  assert.deepEqual(result.survivors, ['p1', 'p2']);
  assert.deepEqual(result.resolvedWinners, ['p1']);
  assert.deepEqual(result.unresolvedSurvivors, ['p2']);
  assert.deepEqual(result.steps.map((step) => step.processedPlayerId), ['p1', 'p2']);
});

test('an invalidated card never receives its later processing pass', () => {
  const result = resolveCyclicTriadByProcessingOrder([
    { playerId: 'p1', hand: 'alpha' },
    { playerId: 'p2', hand: 'beta' },
    { playerId: 'p3', hand: 'gamma' },
  ], CONFIG);
  assert.deepEqual(result.steps.map((step) => step.processedPlayerId), ['p1', 'p3']);
  assert.equal(result.steps.some((step) => step.processedPlayerId === 'p2'), false);
  assert.deepEqual(result.resolvedWinners, ['p1']);
});

test('ordered resolution never assigns a destination or special-suit effect to invalidated cards', () => {
  const result = resolveCyclicTriadByProcessingOrder([
    { playerId: 'p1', hand: 'alpha' },
    { playerId: 'p2', hand: 'gamma' },
  ], CONFIG);
  assert.deepEqual(result.invalidated, ['p1']);
  assert.deepEqual(result.resolvedWinners, ['p2']);
  assert.equal('destination' in result, false);
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /graveyard|chip|subdeck|heart|luna|support|interference/i);
});

test('four-player first-win-lock statistics keep hand symmetry and give the first numeric position initiative', () => {
  const profiles = [];
  function enumerateActive(prefix = []) {
    if (prefix.length === 4) {
      profiles.push(prefix);
      return;
    }
    for (const hand of HAND_ORDER) enumerateActive([...prefix, hand]);
  }
  enumerateActive();

  const invalidatedCounts = new Map();
  const survivorCounts = new Map();
  const survivorAppearancesByHand = new Map(HAND_ORDER.map((hand) => [hand, 0]));
  const survivorAppearancesByPosition = new Map([[0, 0], [1, 0], [2, 0], [3, 0]]);
  const resolvedWinnerAppearancesByPosition = new Map([[0, 0], [1, 0], [2, 0], [3, 0]]);
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
    survivorCounts.set(
      result.survivors.length,
      (survivorCounts.get(result.survivors.length) ?? 0) + 1,
    );
    for (const playerId of result.survivors) {
      const index = Number(playerId.slice(1)) - 1;
      survivorAppearancesByHand.set(
        hands[index],
        (survivorAppearancesByHand.get(hands[index]) ?? 0) + 1,
      );
      survivorAppearancesByPosition.set(
        index,
        (survivorAppearancesByPosition.get(index) ?? 0) + 1,
      );
    }
    for (const playerId of result.resolvedWinners) {
      const index = Number(playerId.slice(1)) - 1;
      resolvedWinnerAppearancesByPosition.set(
        index,
        (resolvedWinnerAppearancesByPosition.get(index) ?? 0) + 1,
      );
    }
    if (new Set(hands).size === 3) {
      threeHandInvalidatedCounts.set(
        result.invalidated.length,
        (threeHandInvalidatedCounts.get(result.invalidated.length) ?? 0) + 1,
      );
    }
  }

  assert.equal(profiles.length, 81);
  assert.deepEqual(Object.fromEntries(invalidatedCounts), { 0: 3, 1: 21, 2: 45, 3: 12 });
  assert.deepEqual(Object.fromEntries(survivorCounts), { 1: 12, 2: 45, 3: 21, 4: 3 });
  assert.deepEqual(Object.fromEntries(survivorAppearancesByHand), { alpha: 59, beta: 59, gamma: 59 });
  assert.deepEqual(Object.fromEntries(survivorAppearancesByPosition), { 0: 60, 1: 39, 2: 39, 3: 39 });
  assert.deepEqual(Object.fromEntries(resolvedWinnerAppearancesByPosition), { 0: 57, 1: 18, 2: 12, 3: 9 });
  assert.deepEqual(Object.fromEntries(threeHandInvalidatedCounts), { 1: 9, 2: 27 });
});
