import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBattleJankenOrderChain } from '../browser/battle-janken-order-chain-presentation-core.mjs';

const PUBLIC_CARDS = [
  { playerId: 'p4', cardId: 'c4', displayNumber: 3, hand: 'gamma' },
  { playerId: 'p3', cardId: 'c3', displayNumber: 7, hand: 'gamma' },
  { playerId: 'p2', cardId: 'c2', displayNumber: 1, hand: 'beta' },
  { playerId: 'p1', cardId: 'c1', displayNumber: 9, hand: 'alpha' },
];

const RESOLUTION = {
  processingOrder: ['p1', 'p2', 'p3', 'p4'],
  resolvedWinners: ['p1'],
  unresolvedSurvivors: ['p3', 'p4'],
  invalidated: ['p2'],
  steps: [
    {
      processedPlayerId: 'p1',
      winningHand: 'alpha',
      resolvedWinner: true,
      invalidated: ['p2'],
    },
    {
      processedPlayerId: 'p3',
      winningHand: 'gamma',
      resolvedWinner: false,
      invalidated: [],
    },
    {
      processedPlayerId: 'p4',
      winningHand: 'gamma',
      resolvedWinner: false,
      invalidated: [],
    },
  ],
};

test('projects caller authority order without sorting display numbers or publicCards', () => {
  const result = buildBattleJankenOrderChain({ publicCards: PUBLIC_CARDS, resolution: RESOLUTION });
  assert.deepEqual(result.processingOrder, ['p1', 'p2', 'p3', 'p4']);
  assert.deepEqual(result.orderSlots.map((slot) => slot.playerId), ['p1', 'p2', 'p3', 'p4']);
  assert.deepEqual(result.orderSlots.map((slot) => slot.displayNumber), [9, 1, 7, 3]);
  assert.deepEqual(result.sequenceEdges, [
    { kind: 'sequence', fromPlayerId: 'p1', toPlayerId: 'p2' },
    { kind: 'sequence', fromPlayerId: 'p2', toPlayerId: 'p3' },
    { kind: 'sequence', fromPlayerId: 'p3', toPlayerId: 'p4' },
  ]);
});

test('keeps an invalidated ordered slot visible while skipping its processing pass', () => {
  const result = buildBattleJankenOrderChain({ publicCards: PUBLIC_CARDS, resolution: RESOLUTION });
  assert.deepEqual(result.processedOrder, ['p1', 'p3', 'p4']);
  assert.equal(result.orderSlots[1].playerId, 'p2');
  assert.equal(result.orderSlots[1].skipped, true);
  assert.equal(result.orderSlots[1].receivesProcessingPass, false);
  assert.deepEqual(result.frames[0].causeEdges, [
    { kind: 'invalidate', stepIndex: 0, fromPlayerId: 'p1', toPlayerId: 'p2' },
  ]);
  assert.equal(result.frames[0].slots.find((slot) => slot.playerId === 'p1').visualState, 'current');
  assert.equal(result.frames[0].slots.find((slot) => slot.playerId === 'p2').visualState, 'invalidated');
  assert.equal(result.frames[1].slots.find((slot) => slot.playerId === 'p1').visualState, 'resolved-win');
});

test('projects authoritative final classifications without choosing a destination', () => {
  const result = buildBattleJankenOrderChain({ publicCards: PUBLIC_CARDS, resolution: RESOLUTION });
  assert.deepEqual(result.finalSlots.map(({ playerId, visualState }) => ({ playerId, visualState })), [
    { playerId: 'p1', visualState: 'resolved-win' },
    { playerId: 'p2', visualState: 'invalidated' },
    { playerId: 'p3', visualState: 'unresolved-final' },
    { playerId: 'p4', visualState: 'unresolved-final' },
  ]);
  assert.doesNotMatch(JSON.stringify(result), /destination|graveyard|subdeck|chip/i);
});

test('fails closed when public metadata or authoritative classifications are incomplete', () => {
  assert.throws(() => buildBattleJankenOrderChain({
    publicCards: PUBLIC_CARDS.filter((card) => card.playerId !== 'p2'),
    resolution: RESOLUTION,
  }), /missing public card/);

  assert.throws(() => buildBattleJankenOrderChain({
    publicCards: PUBLIC_CARDS,
    resolution: { ...RESOLUTION, unresolvedSurvivors: ['p3'] },
  }), /does not classify/);
});

test('fails closed when an invalidated card is given a later processing pass', () => {
  assert.throws(() => buildBattleJankenOrderChain({
    publicCards: PUBLIC_CARDS,
    resolution: {
      ...RESOLUTION,
      steps: [
        ...RESOLUTION.steps,
        { processedPlayerId: 'p2', winningHand: 'beta', resolvedWinner: false, invalidated: [] },
      ],
    },
  }), /later processing pass/);
});
