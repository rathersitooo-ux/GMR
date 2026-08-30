import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeckStorageGestureRuntime } from '../browser/deck-storage-corner-runtime.mjs';

function createHarness(overrides = {}) {
  const calls = { deckAdd: [], deckRemove: [], storageAdd: [] };
  const defaults = {
    addDeckCard(cardId, context) {
      calls.deckAdd.push({ cardId, context });
      return { ok: true, authority: 'deck-add' };
    },
    removeDeckCard(cardId, context) {
      calls.deckRemove.push({ cardId, context });
      return { ok: true, authority: 'deck-remove' };
    },
    addStorageCard(cardId, context) {
      calls.storageAdd.push({ cardId, context });
      return { ok: true, authority: 'storage-add' };
    },
  };
  const authorities = { ...defaults, ...overrides };
  return { calls, runtime: createDeckStorageGestureRuntime(authorities) };
}

test('collection right swipe delegates exactly once to deck-add authority', () => {
  const expected = Object.freeze({ ok: true, accepted: 'deck' });
  const calls = [];
  const { runtime, calls: otherCalls } = createHarness({
    addDeckCard(cardId, context) {
      calls.push({ cardId, context });
      return expected;
    },
  });

  const receipt = runtime.handleSwipe({ surface: 'collection', cardId: 'card-a', deltaX: 84, deltaY: 3 });
  assert.equal(receipt.handled, true);
  assert.equal(receipt.action, 'deck-add');
  assert.equal(receipt.cardId, 'card-a');
  assert.strictEqual(receipt.authorityResult, expected);
  assert.deepEqual(calls, [{
    cardId: 'card-a',
    context: { action: 'deck-add', surface: 'collection', deltaX: 84, deltaY: 3 },
  }]);
  assert.equal(otherCalls.deckRemove.length, 0);
  assert.equal(otherCalls.storageAdd.length, 0);
});

test('deck left swipe delegates exactly once to deck-remove authority', () => {
  const { runtime, calls } = createHarness();
  const receipt = runtime.handleSwipe({ surface: 'deck', cardId: 'card-b', deltaX: -90, deltaY: 4 });

  assert.equal(receipt.handled, true);
  assert.equal(receipt.action, 'deck-remove');
  assert.equal(calls.deckRemove.length, 1);
  assert.equal(calls.deckRemove[0].cardId, 'card-b');
  assert.equal(calls.deckAdd.length, 0);
  assert.equal(calls.storageAdd.length, 0);
});

test('collection left swipe delegates exactly once to storage-add authority', () => {
  const { runtime, calls } = createHarness();
  const receipt = runtime.handleSwipe({ surface: 'collection', cardId: 'card-c', deltaX: -82, deltaY: 2 });

  assert.equal(receipt.handled, true);
  assert.equal(receipt.action, 'storage-add');
  assert.equal(calls.storageAdd.length, 1);
  assert.equal(calls.storageAdd[0].cardId, 'card-c');
  assert.equal(calls.deckAdd.length, 0);
  assert.equal(calls.deckRemove.length, 0);
});

test('non-qualifying swipe performs no authority mutation', () => {
  const { runtime, calls } = createHarness();
  const receipt = runtime.handleSwipe({ surface: 'collection', cardId: 'card-d', deltaX: 24, deltaY: 5 });

  assert.deepEqual(receipt, { handled: false, action: 'none', cardId: 'card-d', authorityResult: null });
  assert.equal(calls.deckAdd.length, 0);
  assert.equal(calls.deckRemove.length, 0);
  assert.equal(calls.storageAdd.length, 0);
});

test('authority rejection is propagated without fallback mutation', () => {
  const rejected = Object.freeze({ ok: false, reason: 'copy-limit' });
  const calls = [];
  const { runtime, calls: otherCalls } = createHarness({
    addDeckCard(cardId, context) {
      calls.push({ cardId, context });
      return rejected;
    },
  });

  const receipt = runtime.handleSwipe({ surface: 'collection', cardId: 'card-e', deltaX: 80, deltaY: 1 });
  assert.strictEqual(receipt.authorityResult, rejected);
  assert.equal(receipt.action, 'deck-add');
  assert.equal(calls.length, 1);
  assert.equal(otherCalls.deckRemove.length, 0);
  assert.equal(otherCalls.storageAdd.length, 0);
});

test('authority errors propagate and never fall through to another authority', () => {
  const { runtime, calls } = createHarness({
    addDeckCard() {
      throw new Error('deck-authority-blocked');
    },
  });

  assert.throws(
    () => runtime.handleSwipe({ surface: 'collection', cardId: 'card-f', deltaX: 90, deltaY: 0 }),
    /deck-authority-blocked/,
  );
  assert.equal(calls.deckRemove.length, 0);
  assert.equal(calls.storageAdd.length, 0);
});

test('runtime requires all three existing mutation authorities', () => {
  assert.throws(
    () => createDeckStorageGestureRuntime({ addDeckCard() {}, removeDeckCard() {} }),
    /ADD_STORAGE_CARD_REQUIRED/,
  );
});
