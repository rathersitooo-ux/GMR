import test from 'node:test';
import assert from 'node:assert/strict';

import {
  NEW_BASE_FIXED_JANKEN_SLOT_IDS,
  NEW_BASE_FIXED_JANKEN_SLOT_STATE,
} from '../browser/new-base-fixed-janken-slot-state.mjs';

const EXPECTED_SLOT_KEYS = ['PAPER', 'ROCK', 'SCISSORS'];

test('defines exactly the three fixed janken slot identities', () => {
  assert.deepEqual(Object.keys(NEW_BASE_FIXED_JANKEN_SLOT_IDS).sort(), EXPECTED_SLOT_KEYS);
  assert.deepEqual(Object.keys(NEW_BASE_FIXED_JANKEN_SLOT_STATE).sort(), EXPECTED_SLOT_KEYS);

  assert.deepEqual(NEW_BASE_FIXED_JANKEN_SLOT_STATE.ROCK, {
    slotId: 'ROCK',
    jankenHand: 'ROCK',
  });
  assert.deepEqual(NEW_BASE_FIXED_JANKEN_SLOT_STATE.SCISSORS, {
    slotId: 'SCISSORS',
    jankenHand: 'SCISSORS',
  });
  assert.deepEqual(NEW_BASE_FIXED_JANKEN_SLOT_STATE.PAPER, {
    slotId: 'PAPER',
    jankenHand: 'PAPER',
  });
});

test('keeps fixed slot state immutable and free of assignment, card, suit, resolver, and presentation state', () => {
  assert.equal(Object.isFrozen(NEW_BASE_FIXED_JANKEN_SLOT_IDS), true);
  assert.equal(Object.isFrozen(NEW_BASE_FIXED_JANKEN_SLOT_STATE), true);

  for (const slot of Object.values(NEW_BASE_FIXED_JANKEN_SLOT_STATE)) {
    assert.equal(Object.isFrozen(slot), true);
    assert.deepEqual(Object.keys(slot).sort(), ['jankenHand', 'slotId']);
  }
});
