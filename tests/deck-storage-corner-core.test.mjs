import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addCardToStorage,
  createDeckStorageState,
  createStorageCornerViewModel,
  moveStorageCardToDeck,
  removeCardFromDeck,
  removeCardFromStorage,
  resolveDeckEditorSwipe,
} from '../browser/deck-storage-corner-core.mjs';

test('collection left means Deck remove while right still means Deck add', () => {
  assert.equal(resolveDeckEditorSwipe({ surface: 'collection', deltaX: -80, deltaY: 4 }).action, 'deck-remove');
  assert.equal(resolveDeckEditorSwipe({ surface: 'collection', deltaX: 80, deltaY: 4 }).action, 'deck-add');

  const state = createDeckStorageState({ deck: ['a'], storage: [] });
  const result = addCardToStorage(state, 'b');
  assert.equal(result.openStorage, true);
  assert.deepEqual(result.state.storage, ['b']);
});

test('deck left swipe removes one while deck right remains reserved', () => {
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

test('storage uses normal-left royal-right view and yellow +N button before overflow', () => {
  const state = createDeckStorageState({ deck: [], storage: ['normal', 'royal', 'normal2'] });
  const view = createStorageCornerViewModel(state, { isRoyal: (id) => id === 'royal' });
  assert.deepEqual(view.normal, ['normal', 'normal2']);
  assert.deepEqual(view.royal, ['royal']);
  assert.equal(view.storageButtonLabel, '+3');
  assert.equal(view.storageButtonTone, 'yellow');
  assert.equal(view.selectionCount, 3);
  assert.equal(view.overDeckLimit, false);
  assert.deepEqual(view.layout, { normalSide: 'left', royalSide: 'right' });
});

test('forty plus overflow storage projects cumulative 41/40 and 42/40 labels', () => {
  const deck = Array.from({ length: 40 }, (_, index) => `d${index}`);
  const view41 = createStorageCornerViewModel(
    createDeckStorageState({ deck, storage: ['overflow'] }),
    { isRoyal: () => false },
  );
  assert.equal(view41.deckCount, 40);
  assert.equal(view41.storageCount, 1);
  assert.equal(view41.selectionCount, 41);
  assert.equal(view41.storageButtonLabel, '41/40');
  assert.equal(view41.storageButtonTone, 'overflow');
  assert.equal(view41.overDeckLimit, true);

  const view42 = createStorageCornerViewModel(
    createDeckStorageState({ deck, storage: ['overflow', 'overflow2'] }),
    { isRoyal: () => false },
  );
  assert.equal(view42.storageCount, 2);
  assert.equal(view42.selectionCount, 42);
  assert.equal(view42.storageButtonLabel, '42/40');
});

test('storage candidates can be discarded without touching deck', () => {
  const state = createDeckStorageState({ deck: ['a'], storage: ['x', 'y'] });
  const result = removeCardFromStorage(state, 'x');
  assert.equal(result.ok, true);
  assert.deepEqual(result.state.deck, ['a']);
  assert.deepEqual(result.state.storage, ['y']);
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
