import assert from 'node:assert/strict';
import test from 'node:test';

import { linkSelectedFixedJankenSlot } from '../browser/newbase-selected-slot-janken-link-core.mjs';

const assignments = Object.freeze([
  Object.freeze({ slotId: 'ROCK', jankenHand: 'ROCK', cardId: 'card-spade' }),
  Object.freeze({ slotId: 'SCISSORS', jankenHand: 'SCISSORS', cardId: 'card-club' }),
  Object.freeze({ slotId: 'PAPER', jankenHand: 'PAPER', cardId: 'card-diamond' }),
]);

test('selecting a fixed slot links its assigned card and slot janken hand atomically', () => {
  assert.deepEqual(
    linkSelectedFixedJankenSlot({ assignments, selectedSlotId: 'ROCK' }),
    {
      selectedSlotId: 'ROCK',
      selectedCardId: 'card-spade',
      selectedJankenHand: 'ROCK',
    },
  );
  assert.deepEqual(
    linkSelectedFixedJankenSlot({ assignments, selectedSlotId: 'SCISSORS' }),
    {
      selectedSlotId: 'SCISSORS',
      selectedCardId: 'card-club',
      selectedJankenHand: 'SCISSORS',
    },
  );
  assert.deepEqual(
    linkSelectedFixedJankenSlot({ assignments, selectedSlotId: 'PAPER' }),
    {
      selectedSlotId: 'PAPER',
      selectedCardId: 'card-diamond',
      selectedJankenHand: 'PAPER',
    },
  );
});

test('native card suit is separate and cannot override the fixed-slot janken hand', () => {
  const nativeCard = Object.freeze({ id: 'card-spade', suit: 'SPADE' });
  const result = linkSelectedFixedJankenSlot({
    assignments,
    selectedSlotId: 'ROCK',
    selectedJankenHand: 'PAPER',
  });

  assert.equal(result.selectedCardId, nativeCard.id);
  assert.equal(result.selectedJankenHand, 'ROCK');
  assert.equal(nativeCard.suit, 'SPADE');
  assert.equal('suit' in result, false);
});

test('returns an immutable selection snapshot', () => {
  const result = linkSelectedFixedJankenSlot({ assignments, selectedSlotId: 'PAPER' });
  assert.equal(Object.isFrozen(result), true);
});

test('fails closed when the selected slot is not assigned', () => {
  assert.throws(
    () => linkSelectedFixedJankenSlot({ assignments, selectedSlotId: 'LIZARD' }),
    /selected_slot_not_assigned/,
  );
});

test('fails closed when the selected slot appears more than once', () => {
  const duplicate = [
    { slotId: 'ROCK', jankenHand: 'ROCK', cardId: 'a' },
    { slotId: 'ROCK', jankenHand: 'ROCK', cardId: 'b' },
    { slotId: 'PAPER', jankenHand: 'PAPER', cardId: 'c' },
  ];

  assert.throws(
    () => linkSelectedFixedJankenSlot({ assignments: duplicate, selectedSlotId: 'ROCK' }),
    /selected_slot_assignment_must_be_unique/,
  );
});

test('fails closed on malformed assignment contract', () => {
  assert.throws(
    () => linkSelectedFixedJankenSlot({ assignments: assignments.slice(0, 2), selectedSlotId: 'ROCK' }),
    /assignments_must_contain_exactly_3_slots/,
  );
  assert.throws(
    () => linkSelectedFixedJankenSlot({
      assignments: [assignments[0], assignments[1], { slotId: 'PAPER', jankenHand: '', cardId: 'c' }],
      selectedSlotId: 'PAPER',
    }),
    /assignment_2_jankenHand_nonempty_string_required/,
  );
});
