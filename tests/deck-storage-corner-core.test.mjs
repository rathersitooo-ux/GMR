import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addCardToStorage,
  createDeckStorageState,
  createStorageCornerViewModel,
  moveStorageCardToDeck,
  removeCardFromDeck,
  resolveDeckEditorSwipe,
} from '../browser/deck-storage-corner-core.mjs';

test('collection left stores and asks UI to open storage', () => {
  const state = createDeckStorageState({ deck: ['a'], storage: [] });
  assert.equal(resolveDeckEditorSwipe({ surface: 'collection', deltaX: -80, deltaY: 4 }).action, 'storage-add');
  const result = addCardToStorage(state, 'b');
  assert.equal(result.openStorage, true);
  assert.deepEqual(result.state.storage, ['b']);
});

test('deck left swipe resolves to remove while deck right is reserved', () => {
  assert.equal(resolveDeckEditorSwipe({ surface: 'deck', deltaX: -70, deltaY: 2 }).action, 'deck-remove');
  assert.equal(resolveDeckEditorSwipe({ surface: 'deck', deltaX: 70, deltaY: 2 }).action, 'none');
  const result = removeCardFromDeck(createDeckStorageState({ deck: ['a', 'b'], storage: [] }), 'a');
  assert.deepEqual(result.state.deck, ['b']);
});

test('storage stays outside deck and cannot bypass forty-card gate', () => {
  const deck = Array.from({ length: 40 }, (_, index) => `d${index}`);
  const state = createDeckStorageState({ deck, storage: ['candidate'] });
  const result = moveStorageCardToDeck(state, 'candidate');
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'deck-full');
  assert.equal(result.state.storage.length, 1);
});

test('storage uses normal-left royal-right view and +N button label', () => {
  const state = createDeckStorageState({ deck: [], storage: ['normal', 'royal', 'normal2'] });
  const view = createStorageCornerViewModel(state, { isRoyal: (id) => id === 'royal' });
  assert.deepEqual(view.normal, ['normal', 'normal2']);
  assert.deepEqual(view.royal, ['royal']);
  assert.equal(view.storageButtonLabel, '+3');
  assert.deepEqual(view.layout, { normalSide: 'left', royalSide: 'right' });
});

test('storage to deck delegates legality to existing deck authority hook', () => {
  const state = createDeckStorageState({ deck: ['a'], storage: ['x'] });
  const rejected = moveStorageCardToDeck(state, 'x', { canAdd: () => ({ ok: false, reason: 'copy-limit' }) });
  assert.equal(rejected.reason, 'copy-limit');
  assert.deepEqual(rejected.state.storage, ['x']);
  const accepted = moveStorageCardToDeck(state, 'x', { canAdd: () => true });
  assert.deepEqual(accepted.state.deck, ['a', 'x']);
  assert.deepEqual(accepted.state.storage, []);
});
