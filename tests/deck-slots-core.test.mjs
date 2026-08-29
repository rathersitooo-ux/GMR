import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DECK_SLOT_COUNT,
  DECK_SLOTS_SCHEMA,
  assertDeckSlotsState,
  clearDeckSlot,
  createDeckSlots,
  getDeckSlot,
  setDeckSlot,
} from '../browser/deck-slots-core.mjs';

test('creates exactly 12 empty slots by default', () => {
  const state = createDeckSlots();
  assert.equal(state.schema, DECK_SLOTS_SCHEMA);
  assert.equal(state.slots.length, DECK_SLOT_COUNT);
  assert.deepEqual(state.slots, Array(12).fill(null));
});

test('accepts caller-provided opaque slot payloads without interpreting deck rules', () => {
  const first = { any: 'payload', cards: ['A', 'B'] };
  const state = createDeckSlots({ slots: [first] });
  assert.deepEqual(getDeckSlot(state, 0), first);
  assert.equal(getDeckSlot(state, 1), null);
});

test('does not retain caller object references', () => {
  const first = { cards: ['A'] };
  const state = createDeckSlots({ slots: [first] });
  first.cards.push('B');
  assert.deepEqual(getDeckSlot(state, 0), { cards: ['A'] });
});

test('updates only the addressed slot', () => {
  const state = createDeckSlots({ slots: [{ id: 1 }, { id: 2 }] });
  const next = setDeckSlot(state, 1, { id: 20 });
  assert.deepEqual(getDeckSlot(next, 0), { id: 1 });
  assert.deepEqual(getDeckSlot(next, 1), { id: 20 });
  assert.equal(getDeckSlot(next, 2), null);
});

test('clearDeckSlot empties only the addressed slot', () => {
  const state = createDeckSlots({ slots: [{ id: 1 }, { id: 2 }] });
  const next = clearDeckSlot(state, 0);
  assert.equal(getDeckSlot(next, 0), null);
  assert.deepEqual(getDeckSlot(next, 1), { id: 2 });
});

test('state and slot payloads are immutable', () => {
  const state = createDeckSlots({ slots: [{ cards: ['A'] }] });
  assert.equal(Object.isFrozen(state), true);
  assert.equal(Object.isFrozen(state.slots), true);
  assert.equal(Object.isFrozen(state.slots[0]), true);
  assert.equal(Object.isFrozen(state.slots[0].cards), true);
});

test('rejects more than 12 supplied slots', () => {
  assert.throws(
    () => createDeckSlots({ slots: Array(13).fill(null) }),
    /DECK_SLOTS_TOO_MANY/,
  );
});

test('rejects indexes outside 0 through 11', () => {
  const state = createDeckSlots();
  assert.throws(() => getDeckSlot(state, -1), /DECK_SLOT_INDEX_OUT_OF_RANGE/);
  assert.throws(() => getDeckSlot(state, 12), /DECK_SLOT_INDEX_OUT_OF_RANGE/);
  assert.throws(() => setDeckSlot(state, 1.5, {}), /DECK_SLOT_INDEX_OUT_OF_RANGE/);
});

test('assertDeckSlotsState rejects wrong schemas and wrong slot counts', () => {
  assert.throws(
    () => assertDeckSlotsState({ schema: 'wrong', slots: Array(12).fill(null) }),
    /DECK_SLOTS_SCHEMA_UNSUPPORTED/,
  );
  assert.throws(
    () => assertDeckSlotsState({ schema: DECK_SLOTS_SCHEMA, slots: Array(11).fill(null) }),
    /DECK_SLOTS_COUNT_INVALID/,
  );
});
