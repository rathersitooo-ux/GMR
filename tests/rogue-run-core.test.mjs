import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ROGUE_RUN_SCHEMA_VERSION,
  createRogueRunState,
  applyRogueRunEvent,
  snapshotRogueRunState,
  restoreRogueRunState,
} from '../browser/rogue-run-core.mjs';

function makeRun() {
  return createRogueRunState({
    runId: 'run-a',
    pathSeed: 'seed-authoritative',
    deckSnapshot: { cardIds: ['c1', 'c2'] },
    handSnapshot: { cardIds: ['c1'] },
    chapterIdentity: 'chapter-authoritative',
  });
}

test('creates an opaque run snapshot without game-value defaults', () => {
  const state = makeRun();
  assert.equal(state.schemaVersion, ROGUE_RUN_SCHEMA_VERSION);
  assert.equal(state.phase, 'AWAITING_ROUTE');
  assert.deepEqual(state.deckSnapshot, { cardIds: ['c1', 'c2'] });
  assert.equal('chapterNumber' in state, false);
  assert.equal('hp' in state, false);
});

test('closes route -> existing Battle result -> reward -> next node without owning Battle or reward rules', () => {
  const start = makeRun();
  const routed = applyRogueRunEvent(start, {
    type: 'ROUTE_CONFIRMED', receiptId: 'route-1', nodeId: 'node-x', nodeKind: 'battle',
    battleHandoff: { matchRequestId: 'battle-existing-1' },
  });
  assert.equal(routed.phase, 'AWAITING_BATTLE_RESULT');
  assert.deepEqual(routed.battleHandoff, { matchRequestId: 'battle-existing-1' });

  const resolved = applyRogueRunEvent(routed, {
    type: 'BATTLE_RESULT_CONFIRMED', receiptId: 'battle-result-1',
    result: { resultReceiptId: 'existing-result-1', winnerIds: ['p1'] },
    authoritativeDisposition: 'REWARD',
  });
  assert.equal(resolved.phase, 'AWAITING_REWARD_DECISION');

  const rewarded = applyRogueRunEvent(resolved, {
    type: 'REWARD_DECISION_CONFIRMED', receiptId: 'reward-1', decision: 'SELECT', selectedCardId: 'c3',
    nextDeckSnapshot: { cardIds: ['c1', 'c2', 'c3'] },
  });
  assert.equal(rewarded.phase, 'READY_FOR_NEXT_NODE');
  assert.deepEqual(rewarded.deckSnapshot, { cardIds: ['c1', 'c2', 'c3'] });

  const advanced = applyRogueRunEvent(rewarded, {
    type: 'ADVANCE_CONFIRMED', receiptId: 'advance-1',
  });
  assert.equal(advanced.phase, 'AWAITING_ROUTE');
  assert.equal(advanced.currentNode, null);
  assert.deepEqual(start.deckSnapshot, { cardIds: ['c1', 'c2'] });
});

test('boss is only another caller-supplied Battle handoff and can complete from authoritative result', () => {
  const routed = applyRogueRunEvent(makeRun(), {
    type: 'ROUTE_CONFIRMED', receiptId: 'route-boss', nodeId: 'boss-node', nodeKind: 'boss',
    battleHandoff: { matchRequestId: 'battle-existing-boss' },
  });
  const complete = applyRogueRunEvent(routed, {
    type: 'BATTLE_RESULT_CONFIRMED', receiptId: 'boss-result',
    result: { resultReceiptId: 'existing-boss-result' },
    authoritativeDisposition: 'RUN_COMPLETE',
    completion: { resultHandoff: 'existing-result-screen-payload' },
  });
  assert.equal(complete.phase, 'COMPLETE');
  assert.deepEqual(complete.completion, { resultHandoff: 'existing-result-screen-payload' });
  assert.equal('bossHp' in complete, false);
});

test('non-battle route does not invent combat and can advance directly', () => {
  const routed = applyRogueRunEvent(makeRun(), {
    type: 'ROUTE_CONFIRMED', receiptId: 'route-event', nodeId: 'event-node', nodeKind: 'event',
  });
  assert.equal(routed.phase, 'READY_FOR_NEXT_NODE');
  assert.equal(routed.battleHandoff, null);
  const advanced = applyRogueRunEvent(routed, {
    type: 'ADVANCE_CONFIRMED', receiptId: 'advance-event', nextChapterIdentity: 'caller-next-chapter',
  });
  assert.equal(advanced.chapterIdentity, 'caller-next-chapter');
});

test('receipt ids are globally one-shot and phase order fails closed', () => {
  const routed = applyRogueRunEvent(makeRun(), {
    type: 'ROUTE_CONFIRMED', receiptId: 'same-receipt', nodeId: 'node', nodeKind: 'event',
  });
  assert.throws(() => applyRogueRunEvent(routed, {
    type: 'ADVANCE_CONFIRMED', receiptId: 'same-receipt',
  }), /duplicate_receipt/);
  assert.throws(() => applyRogueRunEvent(makeRun(), {
    type: 'REWARD_DECISION_CONFIRMED', receiptId: 'reward-too-early', decision: 'SKIP',
    nextDeckSnapshot: { cardIds: ['c1', 'c2'] },
  }), /reward_wrong_phase/);
});

test('reward seam never mutates the deck implicitly', () => {
  const routed = applyRogueRunEvent(makeRun(), {
    type: 'ROUTE_CONFIRMED', receiptId: 'r1', nodeId: 'n1', nodeKind: 'battle', battleHandoff: { id: 'b' },
  });
  const resolved = applyRogueRunEvent(routed, {
    type: 'BATTLE_RESULT_CONFIRMED', receiptId: 'b1', result: { id: 'result' }, authoritativeDisposition: 'REWARD',
  });
  assert.throws(() => applyRogueRunEvent(resolved, {
    type: 'REWARD_DECISION_CONFIRMED', receiptId: 'rw1', decision: 'SKIP',
  }), /next_deck_snapshot_required/);
  assert.deepEqual(resolved.deckSnapshot, { cardIds: ['c1', 'c2'] });
});

test('snapshot restore is strict about schema and duplicate receipt history', () => {
  const state = makeRun();
  const snap = snapshotRogueRunState(state);
  assert.deepEqual(restoreRogueRunState(snap), state);
  assert.throws(() => restoreRogueRunState({ ...snap, schemaVersion: 'OLD' }), /schema_version_invalid/);
  assert.throws(() => restoreRogueRunState({ ...snap, receiptIds: ['x', 'x'] }), /receipt_id_duplicate/);
});
