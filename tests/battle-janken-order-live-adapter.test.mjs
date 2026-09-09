import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BATTLE_JANKEN_ORDER_LIVE_ADAPTER_CONTRACT,
  createBattleJankenOrderLiveAdapter,
  projectBattleJankenOrderSnapshot,
} from '../browser/battle-janken-order-live-adapter.mjs';

function authoritativeSnapshot() {
  return {
    publicCards: [
      { playerId: 'P1', cardId: 'C1', displayNumber: 1, hand: 'ROCK' },
      { playerId: 'P2', cardId: 'C2', displayNumber: 2, hand: 'SCISSORS' },
      { playerId: 'P3', cardId: 'C3', displayNumber: 3, hand: 'PAPER' },
    ],
    resolution: {
      processingOrder: ['P1', 'P2', 'P3'],
      steps: [
        {
          processedPlayerId: 'P1',
          resolvedWinner: true,
          winningHand: 'ROCK',
          invalidated: ['P2'],
        },
        {
          processedPlayerId: 'P3',
          resolvedWinner: false,
          winningHand: null,
          invalidated: [],
        },
      ],
      resolvedWinners: ['P1'],
      unresolvedSurvivors: ['P3'],
      invalidated: ['P2'],
    },
  };
}

test('projects one authoritative snapshot through existing order chain and motion cores', () => {
  const source = authoritativeSnapshot();
  const before = structuredClone(source);
  const projected = projectBattleJankenOrderSnapshot(source);

  assert.deepEqual(source, before);
  assert.deepEqual(projected.chain.processingOrder, ['P1', 'P2', 'P3']);
  assert.deepEqual(projected.chain.processedOrder, ['P1', 'P3']);
  assert.equal(projected.motion.schema, 'gameroad.battle-janken-order-motion.v1');
  assert.equal(projected.motion.motionMode, 'full');
  assert.equal(projected.motion.steps.length, 2);
  assert.equal(projected.motion.steps[0].currentPlayerId, 'P1');
  assert.equal(projected.motion.steps[1].currentPlayerId, 'P3');
  assert.equal(projected.motion.gameStateWrite, false);
  assert.equal(projected.motion.orderCalculation, false);
  assert.equal(projected.motion.comparisonCalculation, false);
});

test('ReducedMotion and LowPerf preserve the same authoritative order in semantic-only mode', () => {
  const reduced = projectBattleJankenOrderSnapshot(authoritativeSnapshot(), { reducedMotion: true });
  const lowPerf = projectBattleJankenOrderSnapshot(authoritativeSnapshot(), { lowPerf: true });

  for (const projected of [reduced, lowPerf]) {
    assert.equal(projected.motion.motionMode, 'semantic-only');
    assert.deepEqual(projected.motion.processingOrder, ['P1', 'P2', 'P3']);
    assert.equal(projected.motion.steps[0].slots.find((slot) => slot.playerId === 'P1').action, 'current-emphasis');
    assert.equal(projected.motion.steps[0].slots.find((slot) => slot.playerId === 'P2').action, 'invalidated-stay-skip');
  }
});

test('live adapter reads one atomic snapshot and presents exactly once', async () => {
  const calls = { read: 0, present: 0 };
  let received = null;
  const adapter = createBattleJankenOrderLiveAdapter({
    async readAuthoritativeOrderSnapshot() {
      calls.read += 1;
      return authoritativeSnapshot();
    },
    async presentOrderMotion(motion, metadata) {
      calls.present += 1;
      received = { motion, metadata };
      return true;
    },
  });

  const receipt = await adapter.sync();
  assert.equal(receipt.ok, true);
  assert.equal(receipt.presented, true);
  assert.equal(receipt.reason, 'PRESENTATION_ACCEPTED');
  assert.equal(calls.read, 1);
  assert.equal(calls.present, 1);
  assert.deepEqual(received.motion.processingOrder, ['P1', 'P2', 'P3']);
  assert.deepEqual(received.metadata.chain.processingOrder, ['P1', 'P2', 'P3']);
  assert.equal(adapter.status().inFlight, false);
});

test('invalid authoritative snapshot fails before presentation', async () => {
  let presentCalls = 0;
  const adapter = createBattleJankenOrderLiveAdapter({
    async readAuthoritativeOrderSnapshot() {
      const snapshot = authoritativeSnapshot();
      snapshot.publicCards.push({ ...snapshot.publicCards[0] });
      return snapshot;
    },
    async presentOrderMotion() {
      presentCalls += 1;
      return true;
    },
  });

  await assert.rejects(() => adapter.sync(), /duplicate public card playerId/);
  assert.equal(presentCalls, 0);
  assert.equal(adapter.status().inFlight, false);
});

test('presentation rejection is surfaced without changing the projected authoritative model', async () => {
  const adapter = createBattleJankenOrderLiveAdapter({
    async readAuthoritativeOrderSnapshot() {
      return authoritativeSnapshot();
    },
    async presentOrderMotion() {
      return false;
    },
  });

  const receipt = await adapter.sync({ lowPerf: true });
  assert.equal(receipt.ok, false);
  assert.equal(receipt.presented, false);
  assert.equal(receipt.reason, 'PRESENTATION_REJECTED');
  assert.equal(receipt.motion.motionMode, 'semantic-only');
  assert.deepEqual(receipt.chain.processingOrder, ['P1', 'P2', 'P3']);
});

test('contract explicitly owns no gameplay, order, comparison, target, destination, or physical timing authority', () => {
  assert.equal(BATTLE_JANKEN_ORDER_LIVE_ADAPTER_CONTRACT.sortingOwnedHere, false);
  assert.equal(BATTLE_JANKEN_ORDER_LIVE_ADAPTER_CONTRACT.comparisonOwnedHere, false);
  assert.equal(BATTLE_JANKEN_ORDER_LIVE_ADAPTER_CONTRACT.winnerOwnedHere, false);
  assert.equal(BATTLE_JANKEN_ORDER_LIVE_ADAPTER_CONTRACT.targetOwnedHere, false);
  assert.equal(BATTLE_JANKEN_ORDER_LIVE_ADAPTER_CONTRACT.destinationOwnedHere, false);
  assert.equal(BATTLE_JANKEN_ORDER_LIVE_ADAPTER_CONTRACT.gameplayOwnedHere, false);
  assert.equal(BATTLE_JANKEN_ORDER_LIVE_ADAPTER_CONTRACT.gameStateWrite, false);
  assert.equal(BATTLE_JANKEN_ORDER_LIVE_ADAPTER_CONTRACT.physicalTimingOwnedHere, false);
  assert.equal(BATTLE_JANKEN_ORDER_LIVE_ADAPTER_CONTRACT.secondJankenEngine, false);
});
