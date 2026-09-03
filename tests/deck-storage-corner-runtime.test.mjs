import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDeckStorageCornerController,
  installDeckStorageCardsDiscovery,
  mountDeckStorageCorner,
  shouldRevealDeckStorageFromCardsSwipe,
} from '../browser/deck-storage-corner-runtime.mjs';

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

function discoveryDocument() {
  const listeners = new Map();
  const document = fakeDocument();
  const screen = fakeElement();
  screen.classList = { contains: (name) => name === 'active' };
  screen.contains = (node) => node === screen || node?.parentNode === screen;
  screen.querySelector = (selector) => selector === '[data-role="deck-storage-discovery-hint"]'
    ? screen.children.find((node) => node.dataset?.role === 'deck-storage-discovery-hint') ?? null
    : null;

  document.querySelector = (selector) => selector === '.screen.cards' ? screen : null;
  document.addEventListener = (type, handler) => {
    const set = listeners.get(type) ?? new Set();
    set.add(handler);
    listeners.set(type, set);
  };
  document.removeEventListener = (type, handler) => listeners.get(type)?.delete(handler);
  document.emit = (type, event) => {
    for (const handler of [...(listeners.get(type) ?? [])]) handler(event);
  };
  return { document, screen };
}

test('collection left swipe stores the card and opens Storage', () => {
  const { controller, calls, deck } = fixture();
  const result = controller.applySwipe({ surface: 'collection', cardId: 'N_1', deltaX: -90, deltaY: 3 });
  assert.equal(result.ok, true);
  assert.equal(result.action, 'storage-add');
  assert.equal(result.view.open, true);
  assert.equal(result.view.storageCount, 1);
  assert.deepEqual(result.view.normal, ['N_1']);
  assert.deepEqual(calls, { add: [], remove: [] });
  assert.deepEqual(deck(), ['a']);
});

test('collection right swipe below forty delegates directly to existing addDeckCard authority', () => {
  const { controller, calls, deck } = fixture();
  const result = controller.applySwipe({ surface: 'collection', cardId: 'N_2', deltaX: 90, deltaY: 2 });
  assert.equal(result.ok, true);
  assert.deepEqual(calls.add, ['N_2']);
  assert.deepEqual(deck(), ['a', 'N_2']);
  assert.equal(result.view.storageCount, 0);
});

test('deck left swipe removes exactly one card through existing remove authority', () => {
  const { controller, calls, deck } = fixture({ deck: ['a', 'b', 'b'] });
  const result = controller.applySwipe({ surface: 'deck', cardId: 'b', deltaX: -84, deltaY: 1 });
  assert.equal(result.ok, true);
  assert.equal(result.action, 'deck-remove');
  assert.deepEqual(calls.remove, ['b']);
  assert.deepEqual(deck(), ['a', 'b']);
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

test('forty-card right swipe routes overflow to Storage instead of hard rejecting', () => {
  const deck = Array.from({ length: 40 }, (_, i) => `d${i}`);
  const { controller, calls, deck: readDeck } = fixture({ deck });
  const result = controller.applySwipe({ surface: 'collection', cardId: 'N_candidate', deltaX: 90, deltaY: 2 });
  assert.equal(result.ok, true);
  assert.equal(result.action, 'storage-add');
  assert.equal(result.overflow, true);
  assert.equal(result.reason, 'deck-full-overflow');
  assert.deepEqual(calls.add, []);
  assert.equal(readDeck().length, 40);
  assert.equal(result.view.storageCount, 1);
  assert.equal(result.view.selectionCount, 41);
  assert.equal(result.view.storageButtonLabel, '41/40');
  assert.equal(result.view.overDeckLimit, true);
  assert.equal(result.view.open, true);
});

test('forty-card deck cannot move overflow Storage card back into Deck until space exists', () => {
  const deck = Array.from({ length: 40 }, (_, i) => `d${i}`);
  const { controller, calls } = fixture({ deck });
  controller.applySwipe({ surface: 'collection', cardId: 'N_candidate', deltaX: 90, deltaY: 2 });
  const result = controller.sendToDeck('N_candidate');
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'deck-full');
  assert.deepEqual(calls.add, ['N_candidate']);
  assert.equal(controller.view().storageCount, 1);
});

test('overflow button renders 41/40 with red-text state while physical deck stays forty', () => {
  const deck = Array.from({ length: 40 }, (_, i) => `d${i}`);
  const { controller } = fixture({ deck });
  controller.applySwipe({ surface: 'collection', cardId: 'N_candidate', deltaX: 90, deltaY: 2 });
  const document = fakeDocument();
  const buttonHost = fakeElement();
  const mounted = mountDeckStorageCorner({ controller, buttonHost, document });
  assert.equal(mounted.button.textContent, '41/40');
  assert.equal(mounted.button.dataset.overflow, 'true');
  assert.match(mounted.button.attributes['aria-label'], /41\/40/);
  mounted.dispose();
});

test('storage discard never calls deck mutation authority', () => {
  const { controller, calls } = fixture();
  controller.store('N_1');
  const result = controller.discard('N_1');
  assert.equal(result.ok, true);
  assert.equal(controller.view().storageCount, 0);
  assert.deepEqual(calls, { add: [], remove: [] });
});

test('Cards discovery accepts only a horizontal left swipe from non-interactive surface', () => {
  assert.equal(shouldRevealDeckStorageFromCardsSwipe({ startX: 140, startY: 80, endX: 60, endY: 84 }), true);
  assert.equal(shouldRevealDeckStorageFromCardsSwipe({ startX: 60, startY: 80, endX: 140, endY: 84 }), false);
  assert.equal(shouldRevealDeckStorageFromCardsSwipe({ startX: 140, startY: 80, endX: 95, endY: 84 }), false);
  assert.equal(shouldRevealDeckStorageFromCardsSwipe({ startX: 140, startY: 80, endX: 60, endY: 160 }), false);
  assert.equal(shouldRevealDeckStorageFromCardsSwipe({ startX: 140, startY: 80, endX: 60, endY: 84, interactive: true }), false);
});

test('Cards discovery opens existing Storage once, ignores live card surfaces, and disposes cleanly', () => {
  const { document, screen } = discoveryDocument();
  let opens = 0;
  const discovery = installDeckStorageCardsDiscovery({ document, openStorage: () => { opens += 1; } });

  assert.equal(screen.children.length, 1);
  assert.equal(screen.children[0].dataset.role, 'deck-storage-discovery-hint');
  assert.equal(screen.children[0].textContent, '← ストレージ');

  const blank = { parentNode: screen, closest: () => null };
  document.emit('pointerdown', { target: blank, pointerId: 1, clientX: 150, clientY: 80 });
  document.emit('pointerup', { target: blank, pointerId: 1, clientX: 70, clientY: 82 });
  assert.equal(opens, 1);

  const deckCard = {
    parentNode: screen,
    closest: (selector) => selector.includes('#deckSlots [data-id]') ? deckCard : null,
  };
  document.emit('pointerdown', { target: deckCard, pointerId: 2, clientX: 150, clientY: 80 });
  document.emit('pointerup', { target: deckCard, pointerId: 2, clientX: 70, clientY: 82 });
  assert.equal(opens, 1);

  const collectionCard = {
    parentNode: screen,
    closest: (selector) => selector.includes('#collectionGrid [data-id]') ? collectionCard : null,
  };
  document.emit('pointerdown', { target: collectionCard, pointerId: 3, clientX: 150, clientY: 80 });
  document.emit('pointerup', { target: collectionCard, pointerId: 3, clientX: 70, clientY: 82 });
  assert.equal(opens, 1);

  document.emit('pointerdown', { target: blank, pointerId: 4, clientX: 70, clientY: 80 });
  document.emit('pointerup', { target: blank, pointerId: 4, clientX: 150, clientY: 82 });
  assert.equal(opens, 1);

  discovery.destroy();
  assert.equal(screen.children.length, 0);
  document.emit('pointerdown', { target: blank, pointerId: 5, clientX: 150, clientY: 80 });
  document.emit('pointerup', { target: blank, pointerId: 5, clientX: 70, clientY: 82 });
  assert.equal(opens, 1);
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
