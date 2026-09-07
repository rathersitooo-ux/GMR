import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DECK_SWIPE_DISCOVERY_CONTRACT,
  createDeckSwipeDiscoveryController,
  normalizeDeckSwipeDiscoveryState,
  parseDeckSwipeDiscoveryState,
} from '../browser/cards-deck-presentation.mjs';

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    value(key) { return values.get(key); },
  };
}

test('discovery contract is local UI only and motion independent', () => {
  assert.equal(DECK_SWIPE_DISCOVERY_CONTRACT.localUiOnly, true);
  assert.equal(DECK_SWIPE_DISCOVERY_CONTRACT.motion, 'none');
  assert.equal(DECK_SWIPE_DISCOVERY_CONTRACT.ownsDeck, false);
  assert.equal(DECK_SWIPE_DISCOVERY_CONTRACT.mutatesDeckRules, false);
  assert.equal(DECK_SWIPE_DISCOVERY_CONTRACT.dismissOn, 'matching-success-only');
});

test('missing or invalid persistence starts with both directional hints visible', () => {
  assert.deepEqual(normalizeDeckSwipeDiscoveryState(), { add: false, remove: false });
  assert.deepEqual(parseDeckSwipeDiscoveryState('not-json'), { add: false, remove: false });
  const controller = createDeckSwipeDiscoveryController({ storage: memoryStorage() });
  assert.deepEqual(controller.hints(), {
    add: { visible: true, text: '→ 右フリックで札組へ' },
    remove: { visible: true, text: '← 左フリックで外す' },
  });
});

test('failed neutral or mismatched gestures never dismiss a hint', () => {
  const controller = createDeckSwipeDiscoveryController({ storage: memoryStorage() });
  assert.equal(controller.recordSuccessfulSwipe({ surface: 'collection', result: { ok: false, action: 'deck-add' } }), false);
  assert.equal(controller.recordSuccessfulSwipe({ surface: 'collection', result: { ok: true, action: 'none' } }), false);
  assert.equal(controller.recordSuccessfulSwipe({ surface: 'deck', result: { ok: true, action: 'deck-add' } }), false);
  assert.deepEqual(controller.state(), { add: false, remove: false });
});

test('matching successful swipes dismiss only their own hint and persist', () => {
  const storage = memoryStorage();
  const controller = createDeckSwipeDiscoveryController({ storage });
  assert.equal(controller.recordSuccessfulSwipe({ surface: 'collection', result: { ok: true, action: 'deck-add' } }), true);
  assert.deepEqual(controller.state(), { add: true, remove: false });
  assert.equal(controller.hints().add.visible, false);
  assert.equal(controller.hints().remove.visible, true);
  assert.match(storage.value(DECK_SWIPE_DISCOVERY_CONTRACT.storageKey), /"add":true/);
  assert.equal(controller.recordSuccessfulSwipe({ surface: 'collection', result: { ok: true, action: 'deck-add' } }), false);
  assert.equal(controller.recordSuccessfulSwipe({ surface: 'deck', result: { ok: true, action: 'deck-remove' } }), true);
  assert.deepEqual(controller.state(), { add: true, remove: true });
  assert.equal(controller.hints().add.visible, false);
  assert.equal(controller.hints().remove.visible, false);
});

test('storage failure is non-fatal and current-session learning still works', () => {
  const storage = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); },
  };
  const controller = createDeckSwipeDiscoveryController({ storage });
  assert.doesNotThrow(() => controller.recordSuccessfulSwipe({ surface: 'collection', result: { ok: true, action: 'deck-add' } }));
  assert.deepEqual(controller.state(), { add: true, remove: false });
});
