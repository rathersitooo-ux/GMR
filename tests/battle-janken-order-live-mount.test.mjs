import test from 'node:test';
import assert from 'node:assert/strict';
import { BATTLE_JANKEN_ORDER_LIVE_MOUNT_CONTRACT, createBattleJankenOrderLiveMount } from '../browser/battle-janken-order-live-mount.mjs';

function snapshot({ turnId = 'T1' } = {}) {
  return {
    sessionId: 'S1', turnId,
    publicCards: [
      { playerId: 'P2', cardId: 'C2', displayNumber: 2, hand: 'SCISSORS' },
      { playerId: 'P3', cardId: 'C3', displayNumber: 3, hand: 'PAPER' },
      { playerId: 'P1', cardId: 'C1', displayNumber: 1, hand: 'ROCK' },
    ],
    resolution: {
      processingOrder: ['P2', 'P1', 'P3'],
      steps: [
        { processedPlayerId: 'P2', resolvedWinner: true, winningHand: 'SCISSORS', invalidated: ['P1'] },
        { processedPlayerId: 'P3', resolvedWinner: false, winningHand: null, invalidated: [] },
      ],
      resolvedWinners: ['P2'], unresolvedSurvivors: ['P3'], invalidated: ['P1'],
    },
  };
}

function visibilityDocument(initial = 'visible') {
  const listeners = new Set();
  return {
    visibilityState: initial,
    get hidden() { return this.visibilityState === 'hidden'; },
    addEventListener(type, fn) { if (type === 'visibilitychange') listeners.add(fn); },
    removeEventListener(type, fn) { if (type === 'visibilitychange') listeners.delete(fn); },
    setVisibility(value) { this.visibilityState = value; for (const fn of listeners) fn(); },
    listenerCount() { return listeners.size; },
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

test('hidden→visible keeps authoritative processingOrder instead of display-number order', async () => {
  const documentRef = visibilityDocument('hidden');
  let reads = 0; const presented = [];
  const mount = createBattleJankenOrderLiveMount({
    documentRef,
    async readAuthoritativeOrderSnapshot() { reads += 1; return snapshot(); },
    slidepadRuntime: { async presentOrderMotion(value) { presented.push(value); return { durationMs: 0 }; } },
  });
  assert.equal((await mount.mount()).reason, 'DOCUMENT_HIDDEN');
  assert.equal(reads, 0);
  documentRef.setVisibility('visible');
  await flush();
  assert.equal(reads, 1);
  assert.deepEqual(presented[0].publicCards.map((card) => card.displayNumber), [2, 3, 1]);
  assert.deepEqual(presented[0].resolution.processingOrder, ['P2', 'P1', 'P3']);
  assert.notDeepEqual(presented[0].resolution.processingOrder, ['P2', 'P3', 'P1']);
});

test('same accepted snapshot dedupes and new turn presents', async () => {
  const documentRef = visibilityDocument(); let current = snapshot(); const turns = [];
  const mount = createBattleJankenOrderLiveMount({
    documentRef,
    async readAuthoritativeOrderSnapshot() { return structuredClone(current); },
    slidepadRuntime: { async presentOrderMotion(value) { turns.push(value.turnId); return { durationMs: 0 }; } },
  });
  assert.equal((await mount.mount()).presented, true);
  const duplicate = await mount.sync();
  assert.equal(duplicate.presented, false); assert.equal(duplicate.deduped, true); assert.equal(duplicate.reason, 'ALREADY_PRESENTED');
  current = snapshot({ turnId: 'T2' });
  assert.equal((await mount.sync()).presented, true);
  assert.deepEqual(turns, ['T1', 'T2']);
});

test('hidden sync reads and presents nothing', async () => {
  const documentRef = visibilityDocument('hidden'); let reads = 0; let presentations = 0;
  const mount = createBattleJankenOrderLiveMount({
    documentRef,
    async readAuthoritativeOrderSnapshot() { reads += 1; return snapshot(); },
    slidepadRuntime: { presentOrderMotion() { presentations += 1; return { durationMs: 0 }; } },
  });
  const receipt = await mount.sync();
  assert.equal(receipt.reason, 'DOCUMENT_HIDDEN'); assert.equal(reads, 0); assert.equal(presentations, 0);
});

test('dispose removes listener and blocks later sync', async () => {
  const documentRef = visibilityDocument('hidden'); let reads = 0;
  const mount = createBattleJankenOrderLiveMount({
    documentRef,
    async readAuthoritativeOrderSnapshot() { reads += 1; return snapshot(); },
    slidepadRuntime: { presentOrderMotion() { return { durationMs: 0 }; } },
  });
  await mount.mount(); assert.equal(documentRef.listenerCount(), 1); mount.dispose(); assert.equal(documentRef.listenerCount(), 0);
  documentRef.setVisibility('visible'); await flush(); assert.equal((await mount.sync()).reason, 'MOUNT_DISPOSED'); assert.equal(reads, 0);
});

test('contract owns no game meaning or timing authority', () => {
  assert.equal(BATTLE_JANKEN_ORDER_LIVE_MOUNT_CONTRACT.processingOrderPolicy, 'PRESERVE_CALLER_PROCESSING_ORDER_EXACTLY');
  for (const key of ['sortingOwnedHere','comparisonOwnedHere','winnerOwnedHere','targetOwnedHere','destinationOwnedHere','gameplayOwnedHere','gameStateWrite','physicalTimingOwnedHere','secondJankenEngine']) {
    assert.equal(BATTLE_JANKEN_ORDER_LIVE_MOUNT_CONTRACT[key], false);
  }
});
