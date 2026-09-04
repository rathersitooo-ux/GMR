import test from 'node:test';
import assert from 'node:assert/strict';

import {
  advanceSlotRollDrag,
  createSlotRollState,
  projectSlotRollWindow,
  resolveSlotRollCommit,
  stepSlotRoll,
  wrapSlotRollIndex,
} from '../browser/slidepad-slot-roll-core.mjs';

const items = Object.freeze([
  Object.freeze({ id: 'alpha', label: 'Alpha' }),
  Object.freeze({ id: 'beta', label: 'Beta' }),
  Object.freeze({ id: 'gamma', label: 'Gamma' }),
]);

test('Slot Roll wraps indices in both directions', () => {
  assert.equal(wrapSlotRollIndex(3, 3), 0);
  assert.equal(wrapSlotRollIndex(4, 3), 1);
  assert.equal(wrapSlotRollIndex(-1, 3), 2);
  assert.equal(wrapSlotRollIndex(-4, 3), 2);
});

test('Slot Roll uses the entered first button as the fixed selection anchor', () => {
  const state = createSlotRollState({ items, anchorIndex: 0 });
  const window = projectSlotRollWindow(state, { radius: 1 });
  assert.deepEqual(window.map((entry) => entry.itemId), ['gamma', 'alpha', 'beta']);
  assert.deepEqual(window.map((entry) => entry.selected), [false, true, false]);
});

test('right detents loop seamlessly through the first anchor again', () => {
  let state = createSlotRollState({ items });
  ({ state } = advanceSlotRollDrag(state, { deltaPx: 20, detentPx: 20 }));
  assert.equal(state.itemId, 'beta');
  ({ state } = advanceSlotRollDrag(state, { deltaPx: 20, detentPx: 20 }));
  assert.equal(state.itemId, 'gamma');
  const result = advanceSlotRollDrag(state, { deltaPx: 20, detentPx: 20 });
  assert.equal(result.state.itemId, 'alpha');
  assert.equal(result.detents.length, 1);
  assert.equal(result.detents[0].wrapped, true);
  assert.equal(result.detents[0].direction, 1);
});

test('left detent from the first anchor loops to the far end', () => {
  const state = createSlotRollState({ items });
  const result = advanceSlotRollDrag(state, { deltaPx: -20, detentPx: 20 });
  assert.equal(result.state.itemId, 'gamma');
  assert.equal(result.detents.length, 1);
  assert.equal(result.detents[0].wrapped, true);
  assert.equal(result.detents[0].direction, -1);
});

test('one-stroke drag can cross multiple detents while preserving residual travel', () => {
  const state = createSlotRollState({ items });
  const result = advanceSlotRollDrag(state, { deltaPx: 52, detentPx: 20 });
  assert.equal(result.state.itemId, 'gamma');
  assert.equal(result.detents.length, 2);
  assert.equal(result.state.carryPx, 12);
});

test('reversing the same stroke walks the same loop back before release', () => {
  let state = createSlotRollState({ items });
  ({ state } = advanceSlotRollDrag(state, { deltaPx: 40, detentPx: 20 }));
  assert.equal(state.itemId, 'gamma');
  ({ state } = advanceSlotRollDrag(state, { deltaPx: -20, detentPx: 20 }));
  assert.equal(state.itemId, 'beta');
  ({ state } = advanceSlotRollDrag(state, { deltaPx: -20, detentPx: 20 }));
  assert.equal(state.itemId, 'alpha');
  assert.equal(resolveSlotRollCommit(state).itemId, 'alpha');
});

test('sub-detent movement does not change focus', () => {
  const state = createSlotRollState({ items });
  const result = advanceSlotRollDrag(state, { deltaPx: 19, detentPx: 20 });
  assert.equal(result.state.itemId, 'alpha');
  assert.equal(result.state.carryPx, 19);
  assert.equal(result.detents.length, 0);
});

test('a one-item branch does not manufacture meaningless roll detents', () => {
  const state = createSlotRollState({ items: [{ id: 'only' }] });
  const result = advanceSlotRollDrag(state, { deltaPx: 100, detentPx: 20 });
  assert.equal(result.state.itemId, 'only');
  assert.equal(result.detents.length, 0);
  assert.equal(resolveSlotRollCommit(result.state).itemId, 'only');
});

test('step helper preserves circular semantics without presentation assumptions', () => {
  let state = createSlotRollState({ items, anchorIndex: 2 });
  state = stepSlotRoll(state, 1);
  assert.equal(state.itemId, 'alpha');
  state = stepSlotRoll(state, -1);
  assert.equal(state.itemId, 'gamma');
});
