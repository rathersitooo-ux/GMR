import test from 'node:test';
import assert from 'node:assert/strict';

import {
  NEW_BASE_JANKEN_SUIT_BY_HAND,
  NEW_BASE_ROUND_START_JANKEN_ASSIGNMENT_MODE,
  NEW_BASE_ROUND_START_JANKEN_SLOT_ASSIGNMENT_SCHEMA,
  NEW_BASE_ROUND_START_JANKEN_SLOT_STATUS,
  createRoundStartJankenSlotAssignment,
  ensureRoundStartJankenSlotAssignment,
} from '../browser/new-base-round-start-janken-slot-assignment-core.mjs';

function slotByHand(snapshot, jankenHand) {
  return snapshot.slots.find((slot) => slot.jankenHand === jankenHand);
}

test('CURRENT_HAND3_POLICY assigns all three current cards to fixed RSP slots without using native suit as membership', () => {
  const snapshot = createRoundStartJankenSlotAssignment({
    roundId: 'round-current-1',
    hand: [
      { id: 'HEART_9', suit: 'HT' },
      { id: 'CLUB_A', suit: 'CL' },
      { id: 'SPADE_2', suit: 'SP' },
    ],
    assignmentMode: NEW_BASE_ROUND_START_JANKEN_ASSIGNMENT_MODE.CURRENT_HAND3_POLICY,
    assignedCardIdsByJankenHand: {
      ROCK: 'SPADE_2',
      SCISSORS: 'HEART_9',
      PAPER: 'CLUB_A',
    },
  });

  assert.equal(snapshot.schema, NEW_BASE_ROUND_START_JANKEN_SLOT_ASSIGNMENT_SCHEMA);
  assert.equal(snapshot.assignmentMode, NEW_BASE_ROUND_START_JANKEN_ASSIGNMENT_MODE.CURRENT_HAND3_POLICY);
  assert.equal(snapshot.roundId, 'round-current-1');
  assert.deepEqual(snapshot.sourceHandCardIds, ['HEART_9', 'CLUB_A', 'SPADE_2']);
  assert.deepEqual(snapshot.selectedJankenCardIds, ['SPADE_2', 'HEART_9', 'CLUB_A']);
  assert.deepEqual(snapshot.ordinaryHandCardIds, []);
  assert.equal(snapshot.slots.length, 3);

  assert.deepEqual(slotByHand(snapshot, 'ROCK'), {
    slotId: 'ROCK',
    jankenHand: 'ROCK',
    status: NEW_BASE_ROUND_START_JANKEN_SLOT_STATUS.OCCUPIED,
    selectable: true,
    cardId: 'SPADE_2',
    nativeSuit: 'SP',
    candidateCardIds: ['SPADE_2'],
  });
  assert.deepEqual(slotByHand(snapshot, 'SCISSORS'), {
    slotId: 'SCISSORS',
    jankenHand: 'SCISSORS',
    status: NEW_BASE_ROUND_START_JANKEN_SLOT_STATUS.OCCUPIED,
    selectable: true,
    cardId: 'HEART_9',
    nativeSuit: 'HT',
    candidateCardIds: ['HEART_9'],
  });
  assert.deepEqual(slotByHand(snapshot, 'PAPER'), {
    slotId: 'PAPER',
    jankenHand: 'PAPER',
    status: NEW_BASE_ROUND_START_JANKEN_SLOT_STATUS.OCCUPIED,
    selectable: true,
    cardId: 'CLUB_A',
    nativeSuit: 'CL',
    candidateCardIds: ['CLUB_A'],
  });

  for (const slot of snapshot.slots) {
    assert.equal(Object.hasOwn(slot, 'suit'), false,
      'current assignment keeps native suit separate from fixed janken position');
  }
});

test('CURRENT_HAND3_POLICY rejects non-three-card hands instead of inventing empty slots or leftovers', () => {
  for (const hand of [
    [],
    [{ id: 'A', suit: 'CL' }],
    [{ id: 'A', suit: 'CL' }, { id: 'B', suit: 'DI' }],
    [
      { id: 'A', suit: 'CL' },
      { id: 'B', suit: 'DI' },
      { id: 'C', suit: 'SP' },
      { id: 'D', suit: 'HT' },
    ],
  ]) {
    assert.throws(
      () => createRoundStartJankenSlotAssignment({
        roundId: `round-${hand.length}`,
        hand,
        assignmentMode: NEW_BASE_ROUND_START_JANKEN_ASSIGNMENT_MODE.CURRENT_HAND3_POLICY,
        assignedCardIdsByJankenHand: { ROCK: 'A', SCISSORS: 'B', PAPER: 'C' },
      }),
      /requires exactly 3 current hand cards/,
    );
  }
});

test('CURRENT_HAND3_POLICY validates an external policy result as an exact three-card bijection', () => {
  const hand = [
    { id: 'A', suit: 'CL' },
    { id: 'B', suit: 'DI' },
    { id: 'C', suit: 'HT' },
  ];
  const base = {
    roundId: 'round-policy',
    hand,
    assignmentMode: NEW_BASE_ROUND_START_JANKEN_ASSIGNMENT_MODE.CURRENT_HAND3_POLICY,
  };

  assert.throws(
    () => createRoundStartJankenSlotAssignment(base),
    /must be supplied by the external auto-assignment policy/,
  );
  assert.throws(
    () => createRoundStartJankenSlotAssignment({
      ...base,
      assignedCardIdsByJankenHand: { ROCK: 'A', SCISSORS: 'A', PAPER: 'C' },
    }),
    /must assign three distinct physical cards/,
  );
  assert.throws(
    () => createRoundStartJankenSlotAssignment({
      ...base,
      assignedCardIdsByJankenHand: { ROCK: 'A', SCISSORS: 'B', PAPER: 'MISSING' },
    }),
    /assigned janken card is not in the current hand: MISSING/,
  );
  assert.throws(
    () => createRoundStartJankenSlotAssignment({
      ...base,
      assignedCardIdsByJankenHand: { ROCK: 'A', SCISSORS: 'B' },
    }),
    /assignedCardIdsByJankenHand.PAPER must be a non-empty canonical string/,
  );
});

test('CURRENT_HAND3_POLICY keeps the exact same immutable assignment within a round', () => {
  const first = ensureRoundStartJankenSlotAssignment({
    roundId: 'round-stable-current',
    hand: [
      { id: 'A', suit: 'CL' },
      { id: 'B', suit: 'DI' },
      { id: 'C', suit: 'SP' },
    ],
    assignmentMode: NEW_BASE_ROUND_START_JANKEN_ASSIGNMENT_MODE.CURRENT_HAND3_POLICY,
    assignedCardIdsByJankenHand: { ROCK: 'B', SCISSORS: 'C', PAPER: 'A' },
  });

  const repeated = ensureRoundStartJankenSlotAssignment({
    currentSnapshot: first,
    roundId: 'round-stable-current',
    hand: [
      { id: 'A', suit: 'CL' },
      { id: 'B', suit: 'DI' },
      { id: 'C', suit: 'SP' },
    ],
    assignmentMode: NEW_BASE_ROUND_START_JANKEN_ASSIGNMENT_MODE.CURRENT_HAND3_POLICY,
    assignedCardIdsByJankenHand: { ROCK: 'A', SCISSORS: 'B', PAPER: 'C' },
  });

  assert.strictEqual(repeated, first);
  assert.deepEqual(repeated.selectedJankenCardIds, ['B', 'C', 'A']);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.slots), true);
});

test('does not allow a live round snapshot to silently switch assignment modes', () => {
  const legacy = ensureRoundStartJankenSlotAssignment({
    roundId: 'round-mode',
    hand: [{ id: 'CL_A', suit: 'CL' }],
  });
  assert.throws(
    () => ensureRoundStartJankenSlotAssignment({
      currentSnapshot: legacy,
      roundId: 'round-mode',
      hand: [
        { id: 'CL_A', suit: 'CL' },
        { id: 'DI_A', suit: 'DI' },
        { id: 'SP_A', suit: 'SP' },
      ],
      assignmentMode: NEW_BASE_ROUND_START_JANKEN_ASSIGNMENT_MODE.CURRENT_HAND3_POLICY,
      assignedCardIdsByJankenHand: { ROCK: 'CL_A', SCISSORS: 'DI_A', PAPER: 'SP_A' },
    }),
    /assignmentMode cannot change inside an existing round snapshot/,
  );
});

test('legacy compatibility mode keeps CL/DI/SP fixed membership until the live caller is migrated', () => {
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

  assert.equal(snapshot.assignmentMode, NEW_BASE_ROUND_START_JANKEN_ASSIGNMENT_MODE.LEGACY_SUIT_BOUND);
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

  assert.equal(requests.length, 1, 'legacy authoritative chooser is called only for duplicate suits');
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

test('legacy compatibility mode keeps missing-suit directions empty and disabled', () => {
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

test('legacy compatibility mode still supports arbitrary source hand size without duplicating cards', () => {
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

test('legacy compatibility snapshot remains stable within a round and never rerolls on redraw/focus/drag projection', () => {
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

test('legacy compatibility mode creates a fresh assignment for a new round', () => {
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

test('legacy compatibility mode fails closed when duplicate selection has no authoritative chooser or returns an invalid index', () => {
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
