import test from 'node:test';
import assert from 'node:assert/strict';

import {
  NEW_BASE_JANKEN_SUIT_BY_HAND,
  NEW_BASE_ROUND_START_JANKEN_SLOT_ASSIGNMENT_SCHEMA,
  NEW_BASE_ROUND_START_JANKEN_SLOT_STATUS,
  createRoundStartJankenSlotAssignment,
  ensureRoundStartJankenSlotAssignment,
} from '../browser/new-base-round-start-janken-slot-assignment-core.mjs';

function slotByHand(snapshot, jankenHand) {
  return snapshot.slots.find((slot) => slot.jankenHand === jankenHand);
}

test('binds CL/DI/SP to fixed ROCK/SCISSORS/PAPER and removes selected physical cards from ordinary hand membership', () => {
  const requests = [];
  const snapshot = createRoundStartJankenSlotAssignment({
    roundId: 'round-7',
    hand: [
      { id: 'CL_A', suit: 'CL' },
      { id: 'CL_4', suit: 'CL' },
      { id: 'DI_8', suit: 'DI' },
      { id: 'SP_Q', suit: 'SP' },
      { id: 'HT_2', suit: 'HT' },
    ],
    pickDuplicateIndex(request) {
      requests.push(request);
      return 1;
    },
  });

  assert.equal(snapshot.schema, NEW_BASE_ROUND_START_JANKEN_SLOT_ASSIGNMENT_SCHEMA);
  assert.equal(snapshot.roundId, 'round-7');
  assert.deepEqual(NEW_BASE_JANKEN_SUIT_BY_HAND, {
    ROCK: 'CL',
    SCISSORS: 'DI',
    PAPER: 'SP',
  });
  assert.equal(slotByHand(snapshot, 'ROCK').cardId, 'CL_4');
  assert.equal(slotByHand(snapshot, 'SCISSORS').cardId, 'DI_8');
  assert.equal(slotByHand(snapshot, 'PAPER').cardId, 'SP_Q');
  assert.deepEqual(snapshot.sourceHandCardIds, ['CL_A', 'CL_4', 'DI_8', 'SP_Q', 'HT_2']);
  assert.deepEqual(snapshot.selectedJankenCardIds, ['CL_4', 'DI_8', 'SP_Q']);
  assert.deepEqual(snapshot.ordinaryHandCardIds, ['CL_A', 'HT_2']);
  for (const selectedCardId of snapshot.selectedJankenCardIds) {
    assert.equal(snapshot.ordinaryHandCardIds.includes(selectedCardId), false);
  }

  assert.equal(requests.length, 1, 'authoritative chooser is called only for duplicate suits');
  assert.deepEqual(requests[0], {
    roundId: 'round-7',
    slotId: 'ROCK',
    jankenHand: 'ROCK',
    suit: 'CL',
    candidateCardIds: ['CL_A', 'CL_4'],
    min: 0,
    max: 1,
  });
});

test('keeps missing-suit directions present as empty disabled slots without duplicating the occupied card', () => {
  const snapshot = createRoundStartJankenSlotAssignment({
    roundId: 'round-empty',
    hand: [
      { id: 'CL_2', suit: 'CL' },
      { id: 'HT_K', suit: 'HT' },
    ],
  });

  assert.equal(snapshot.slots.length, 3);
  assert.deepEqual(slotByHand(snapshot, 'ROCK'), {
    slotId: 'ROCK',
    jankenHand: 'ROCK',
    suit: 'CL',
    status: NEW_BASE_ROUND_START_JANKEN_SLOT_STATUS.OCCUPIED,
    selectable: true,
    cardId: 'CL_2',
    candidateCardIds: ['CL_2'],
  });
  assert.deepEqual(slotByHand(snapshot, 'SCISSORS'), {
    slotId: 'SCISSORS',
    jankenHand: 'SCISSORS',
    suit: 'DI',
    status: NEW_BASE_ROUND_START_JANKEN_SLOT_STATUS.EMPTY_DISABLED,
    selectable: false,
    cardId: null,
    candidateCardIds: [],
  });
  assert.deepEqual(slotByHand(snapshot, 'PAPER'), {
    slotId: 'PAPER',
    jankenHand: 'PAPER',
    suit: 'SP',
    status: NEW_BASE_ROUND_START_JANKEN_SLOT_STATUS.EMPTY_DISABLED,
    selectable: false,
    cardId: null,
    candidateCardIds: [],
  });
  assert.deepEqual(snapshot.selectedJankenCardIds, ['CL_2']);
  assert.deepEqual(snapshot.ordinaryHandCardIds, ['HT_K']);
});

test('supports arbitrary source hand size and partitions selected janken cards from ordinary cards', () => {
  for (const hand of [
    [],
    [{ id: 'HT_A', suit: 'HT' }],
    [
      { id: 'CL_A', suit: 'CL' },
      { id: 'DI_A', suit: 'DI' },
      { id: 'SP_A', suit: 'SP' },
      { id: 'HT_A', suit: 'HT' },
      { id: 'HT_2', suit: 'HT' },
      { id: 'HT_3', suit: 'HT' },
      { id: 'HT_4', suit: 'HT' },
    ],
  ]) {
    const snapshot = createRoundStartJankenSlotAssignment({ roundId: `round-${hand.length}`, hand });
    assert.equal(snapshot.sourceHandCardIds.length, hand.length);
    assert.equal(
      snapshot.selectedJankenCardIds.length + snapshot.ordinaryHandCardIds.length,
      snapshot.sourceHandCardIds.length,
    );
    assert.deepEqual(
      snapshot.selectedJankenCardIds.filter((id) => snapshot.ordinaryHandCardIds.includes(id)),
      [],
    );
    assert.equal(snapshot.slots.length, 3);
  }
});

test('returns the exact same immutable snapshot within a round and never rerolls on redraw/focus/drag projection', () => {
  let chooserCalls = 0;
  const first = ensureRoundStartJankenSlotAssignment({
    roundId: 'round-stable',
    hand: [
      { id: 'CL_3', suit: 'CL' },
      { id: 'CL_9', suit: 'CL' },
      { id: 'HT_A', suit: 'HT' },
    ],
    pickDuplicateIndex() {
      chooserCalls += 1;
      return 0;
    },
  });

  const repeated = ensureRoundStartJankenSlotAssignment({
    currentSnapshot: first,
    roundId: 'round-stable',
    hand: [
      { id: 'CL_3', suit: 'CL' },
      { id: 'CL_9', suit: 'CL' },
      { id: 'SP_5', suit: 'SP' },
    ],
    pickDuplicateIndex() {
      chooserCalls += 1;
      return 1;
    },
  });

  assert.strictEqual(repeated, first);
  assert.equal(chooserCalls, 1);
  assert.equal(slotByHand(repeated, 'ROCK').cardId, 'CL_3');
  assert.equal(slotByHand(repeated, 'PAPER').cardId, null, 'same-round redraw does not backfill an empty slot');
  assert.deepEqual(repeated.selectedJankenCardIds, ['CL_3']);
  assert.deepEqual(repeated.ordinaryHandCardIds, ['CL_9', 'HT_A']);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.slots), true);
});

test('creates a fresh assignment for a new round and can choose a different duplicate candidate', () => {
  let chooserCalls = 0;
  const first = ensureRoundStartJankenSlotAssignment({
    roundId: 'round-1',
    hand: [
      { id: 'DI_2', suit: 'DI' },
      { id: 'DI_7', suit: 'DI' },
    ],
    pickDuplicateIndex() {
      chooserCalls += 1;
      return 0;
    },
  });
  const next = ensureRoundStartJankenSlotAssignment({
    currentSnapshot: first,
    roundId: 'round-2',
    hand: [
      { id: 'DI_2', suit: 'DI' },
      { id: 'DI_7', suit: 'DI' },
    ],
    pickDuplicateIndex() {
      chooserCalls += 1;
      return 1;
    },
  });

  assert.notStrictEqual(next, first);
  assert.equal(slotByHand(first, 'SCISSORS').cardId, 'DI_2');
  assert.equal(slotByHand(next, 'SCISSORS').cardId, 'DI_7');
  assert.deepEqual(first.ordinaryHandCardIds, ['DI_7']);
  assert.deepEqual(next.ordinaryHandCardIds, ['DI_2']);
  assert.equal(chooserCalls, 2);
});

test('fails closed when duplicate selection has no authoritative chooser or returns an invalid index', () => {
  const duplicateHand = [
    { id: 'SP_2', suit: 'SP' },
    { id: 'SP_6', suit: 'SP' },
  ];
  assert.throws(
    () => createRoundStartJankenSlotAssignment({ roundId: 'r1', hand: duplicateHand }),
    /pickDuplicateIndex is required/,
  );
  assert.throws(
    () => createRoundStartJankenSlotAssignment({
      roundId: 'r1', hand: duplicateHand, pickDuplicateIndex: () => 2,
    }),
    /must return an integer in \[0, 1\]/,
  );
});

test('rejects duplicate card identities rather than assigning one physical card twice', () => {
  assert.throws(
    () => createRoundStartJankenSlotAssignment({
      roundId: 'r1',
      hand: [
        { id: 'same', suit: 'CL' },
        { id: 'same', suit: 'DI' },
      ],
    }),
    /hand card id must be unique/,
  );
});
