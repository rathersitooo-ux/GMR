import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BATTLE_JANKEN_ORDER_LIVE_BRIDGE_CONTRACT,
  BATTLE_JANKEN_ORDER_LIVE_BRIDGE_SCHEMA,
  createBattleJankenOrderLiveBridge,
} from '../browser/battle-janken-order-live-bridge.mjs';

function acceptedPublicCards() {
  return [
    { playerId: 'p1', cardId: 'card-30', displayNumber: 30, hand: 'ROCK' },
    { playerId: 'p2', cardId: 'card-10', displayNumber: 10, hand: 'SCISSORS' },
    { playerId: 'p3', cardId: 'card-40', displayNumber: 40, hand: 'PAPER' },
    { playerId: 'p4', cardId: 'card-20', displayNumber: 20, hand: 'ROCK' },
  ];
}

function deferred() {
  let resolve;
  const promise = new Promise((fulfill) => { resolve = fulfill; });
  return { promise, resolve };
}

test('resolved snapshot is read once and presented exactly once', async () => {
  const calls = { read: 0, present: 0 };
  let received = null;
  const bridge = createBattleJankenOrderLiveBridge({
    async readPublicCards() {
      calls.read += 1;
      return acceptedPublicCards();
    },
    async presentOrderMotion(motion, metadata) {
      calls.present += 1;
      received = { motion, metadata };
      return true;
    },
  });

  const result = await bridge.sync();

  assert.equal(calls.read, 1);
  assert.equal(calls.present, 1);
  assert.equal(result.ok, true);
  assert.equal(result.presented, true);
  assert.equal(result.reason, 'PRESENTATION_ACCEPTED');
  assert.deepEqual(result.chain.processingOrder, ['p2', 'p4', 'p1', 'p3']);
  assert.equal(result.motion.schema, 'gameroad.battle-janken-order-motion.v1');
  assert.equal(result.motion.gameStateWrite, false);
  assert.equal(received.metadata.chain.processingOrder.join(','), 'p2,p4,p1,p3');
  assert.deepEqual(bridge.status(), { inFlight: false });
});

test('equal printed numbers are reported without presenting and never invent an order', async () => {
  const calls = { read: 0, present: 0 };
  const bridge = createBattleJankenOrderLiveBridge({
    async readPublicCards() {
      calls.read += 1;
      const cards = acceptedPublicCards();
      cards[0].displayNumber = 10;
      return cards;
    },
    async presentOrderMotion() {
      calls.present += 1;
      return true;
    },
  });

  const result = await bridge.sync();

  assert.equal(calls.read, 1);
  assert.equal(calls.present, 0);
  assert.equal(result.ok, false);
  assert.equal(result.presented, false);
  assert.equal(result.status, 'UNRESOLVED_EQUAL_PRINTED_NUMBER');
  assert.equal(result.reason, 'EQUAL_PRINTED_NUMBER_PROCESSING_ORDER_UNRESOLVED');
  assert.deepEqual(result.tiedPrintedNumbers, [10]);
  assert.equal(result.processingOrder, null);
  assert.deepEqual(bridge.status(), { inFlight: false });
});

test('a second sync while one is in flight is refused and presents nothing extra', async () => {
  const gate = deferred();
  const calls = { present: 0 };
  const bridge = createBattleJankenOrderLiveBridge({
    async readPublicCards() {
      return acceptedPublicCards();
    },
    async presentOrderMotion() {
      calls.present += 1;
      await gate.promise;
      return true;
    },
  });

  const first = bridge.sync();
  const second = await bridge.sync();
  gate.resolve();
  const firstResult = await first;

  assert.equal(second.ok, false);
  assert.equal(second.presented, false);
  assert.equal(second.reason, 'SYNC_IN_FLIGHT');
  assert.equal(firstResult.ok, true);
  assert.equal(firstResult.presented, true);
  assert.equal(calls.present, 1);
});

test('a surface that refuses the motion is reported as not presented', async () => {
  const bridge = createBattleJankenOrderLiveBridge({
    async readPublicCards() {
      return acceptedPublicCards();
    },
    async presentOrderMotion() {
      return false;
    },
  });

  const result = await bridge.sync();

  assert.equal(result.ok, false);
  assert.equal(result.presented, false);
  assert.equal(result.reason, 'PRESENTATION_REJECTED');
});

test('malformed public cards fail closed instead of presenting a partial order', async () => {
  const calls = { present: 0 };
  const bridge = createBattleJankenOrderLiveBridge({
    async readPublicCards() {
      return acceptedPublicCards().slice(0, 3);
    },
    async presentOrderMotion() {
      calls.present += 1;
      return true;
    },
  });

  await assert.rejects(() => bridge.sync(), /exactly four/);
  assert.equal(calls.present, 0);
  assert.deepEqual(bridge.status(), { inFlight: false });
});

test('contract owns no ordering, comparison, winner or game-state authority', () => {
  assert.equal(BATTLE_JANKEN_ORDER_LIVE_BRIDGE_CONTRACT.schema, BATTLE_JANKEN_ORDER_LIVE_BRIDGE_SCHEMA);
  assert.equal(
    BATTLE_JANKEN_ORDER_LIVE_BRIDGE_CONTRACT.snapshotAuthority,
    'battle-janken-processing-order-authority-adapter.mjs',
  );
  assert.equal(
    BATTLE_JANKEN_ORDER_LIVE_BRIDGE_CONTRACT.presentationTransport,
    'battle-janken-order-live-adapter.mjs',
  );
  assert.equal(
    BATTLE_JANKEN_ORDER_LIVE_BRIDGE_CONTRACT.presentationSurface,
    'battle-janken-slidepad-runtime-mount.mjs presentOrderMotion',
  );
  assert.equal(BATTLE_JANKEN_ORDER_LIVE_BRIDGE_CONTRACT.sortingOwnedHere, false);
  assert.equal(BATTLE_JANKEN_ORDER_LIVE_BRIDGE_CONTRACT.comparisonOwnedHere, false);
  assert.equal(BATTLE_JANKEN_ORDER_LIVE_BRIDGE_CONTRACT.winnerOwnedHere, false);
  assert.equal(BATTLE_JANKEN_ORDER_LIVE_BRIDGE_CONTRACT.gameStateWrite, false);
  assert.equal(BATTLE_JANKEN_ORDER_LIVE_BRIDGE_CONTRACT.unresolvedTieBreak, false);
  assert.equal(
    BATTLE_JANKEN_ORDER_LIVE_BRIDGE_CONTRACT.unresolvedTiePolicy,
    'REPORT_WITHOUT_PRESENTING',
  );
  assert.deepEqual(BATTLE_JANKEN_ORDER_LIVE_BRIDGE_CONTRACT.liveCallerSupplies, [
    'readPublicCards',
    'sync trigger',
  ]);
});
