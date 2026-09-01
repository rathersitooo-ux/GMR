import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeckStorageCornerController, mountDeckStorageCorner } from '../browser/deck-storage-corner-runtime.mjs';

function fixture({ deck = ['a'], rejectAdd = false, rejectRemove = false } = {}) {
  let currentDeck = [...deck];
  const calls = { add: [], remove: [] };
  const controller = createDeckStorageCornerController({
    getDeck: () => [...currentDeck],
    addDeckCard: (id) => {
      calls.add.push(id);
      if (rejectAdd || currentDeck.length >= 40) return { ok: false, reason: currentDeck.length >= 40 ? 'deck-full' : 'rule-rejected' };
      currentDeck.push(id);
      return { ok: true };
    },
    removeDeckCard: (id) => {
      calls.remove.push(id);
      if (rejectRemove) return { ok: false, reason: 'remove-rejected' };
      const index = currentDeck.indexOf(id);
      if (index < 0) return { ok: false, reason: 'not-in-deck' };
      currentDeck.splice(index, 1);
      return { ok: true };
    },
    isRoyal: (id) => id.startsWith('R_'),
  });
  return { controller, calls, deck: () => [...currentDeck] };
}

function fakeElement() {
  return {
    children: [],
    dataset: {},
    attributes: {},
    appendChild(node) {
      this.children.push(node);
      node.parentNode = this;
      return node;
    },
    append(...nodes) {
      for (const node of nodes) this.appendChild(node);
    },
    setAttribute(name, value) {
      this.attributes[name] = String(value);
    },
    addEventListener() {},
    remove() {
      if (this.parentNode?.children) this.parentNode.children = this.parentNode.children.filter((node) => node !== this);
      this.parentNode = null;
    },
  };
}

function fakeDocument() {
  return {
    head: fakeElement(),
    body: fakeElement(),
    createElement: () => fakeElement(),
    getElementById: () => null,
  };
}

test('collection left swipe stores candidate and opens storage immediately', () => {
  const { controller, calls } = fixture();
  const result = controller.applySwipe({ surface: 'collection', cardId: 'N_1', deltaX: -90, deltaY: 3 });
  assert.equal(result.ok, true);
  assert.equal(result.view.open, true);
  assert.equal(result.view.storageButtonLabel, '+1');
  assert.deepEqual(result.view.normal, ['N_1']);
  assert.deepEqual(calls.add, []);
});

test('collection right swipe still delegates directly to existing addDeckCard authority', () => {
  const { controller, calls, deck } = fixture();
  const result = controller.applySwipe({ surface: 'collection', cardId: 'N_2', deltaX: 90, deltaY: 2 });
  assert.equal(result.ok, true);
  assert.deepEqual(calls.add, ['N_2']);
  assert.deepEqual(deck(), ['a', 'N_2']);
  assert.equal(result.view.storageCount, 0);
});

test('deck left swipe delegates to existing removeDeckCard authority exactly once', () => {
  const { controller, calls, deck } = fixture({ deck: ['a', 'b'] });
  const result = controller.applySwipe({ surface: 'deck', cardId: 'b', deltaX: -84, deltaY: 1 });
  assert.equal(result.ok, true);
  assert.deepEqual(calls.remove, ['b']);
  assert.deepEqual(deck(), ['a']);
});

test('vertical and short gestures do not mutate deck or storage', () => {
  const { controller, calls } = fixture();
  assert.equal(controller.applySwipe({ surface: 'deck', cardId: 'a', deltaX: -30, deltaY: 80 }).action, 'none');
  assert.equal(controller.applySwipe({ surface: 'collection', cardId: 'x', deltaX: 30, deltaY: 2 }).action, 'none');
  assert.deepEqual(calls, { add: [], remove: [] });
  assert.equal(controller.view().storageCount, 0);
});

test('Royal candidates project right while other candidates project left', () => {
  const { controller } = fixture();
  controller.store('N_1');
  controller.store('R_1');
  controller.store('N_2');
  assert.deepEqual(controller.view().normal, ['N_1', 'N_2']);
  assert.deepEqual(controller.view().royal, ['R_1']);
  assert.equal(controller.view().storageButtonTone, 'yellow');
});

test('storage to deck removes candidate only after existing authority accepts it', () => {
  const rejectedFixture = fixture({ rejectAdd: true });
  rejectedFixture.controller.store('N_1');
  const rejected = rejectedFixture.controller.sendToDeck('N_1');
  assert.equal(rejected.ok, false);
  assert.deepEqual(rejectedFixture.controller.view().normal, ['N_1']);

  const acceptedFixture = fixture();
  acceptedFixture.controller.store('N_1');
  const accepted = acceptedFixture.controller.sendToDeck('N_1');
  assert.equal(accepted.ok, true);
  assert.deepEqual(acceptedFixture.controller.view().normal, []);
  assert.deepEqual(acceptedFixture.deck(), ['a', 'N_1']);
});

test('forty-card deck can still accumulate storage candidates but cannot consume them', () => {
  const deck = Array.from({ length: 40 }, (_, i) => `d${i}`);
  const { controller, calls } = fixture({ deck });
  controller.store('N_candidate');
  assert.equal(controller.view().storageCount, 1);
  const result = controller.sendToDeck('N_candidate');
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'deck-full');
  assert.deepEqual(calls.add, ['N_candidate']);
  assert.equal(controller.view().storageCount, 1);
});

test('storage discard never calls deck mutation authority', () => {
  const { controller, calls } = fixture();
  controller.store('N_1');
  const result = controller.discard('N_1');
  assert.equal(result.ok, true);
  assert.equal(controller.view().storageCount, 0);
  assert.deepEqual(calls, { add: [], remove: [] });
});

test('dispose closes storage state so remount does not reopen stale UI', () => {
  const { controller } = fixture();
  const document = fakeDocument();
  const buttonHost = fakeElement();
  const first = mountDeckStorageCorner({ controller, buttonHost, document });

  first.open();
  assert.equal(controller.view().open, true);
  assert.equal(document.body.children.length, 1);

  first.dispose();
  assert.equal(controller.view().open, false);
  assert.equal(document.body.children.length, 0);

  const second = mountDeckStorageCorner({ controller, buttonHost, document });
  assert.equal(controller.view().open, false);
  assert.equal(document.body.children.length, 0);
  second.dispose();
});
