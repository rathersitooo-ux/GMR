import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildQuickDeckOverlayModel,
  mountQuickDeckOverlay,
  normalizeQuickDeckSnapshot,
} from '../browser/quick-deck-overlay-presentation.mjs';

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = String(tagName).toUpperCase();
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.dataset = {};
    this.className = '';
    this.textContent = '';
    this.type = '';
    this.id = '';
    this.attributes = new Map();
    this.listeners = new Map();
  }
  append(...children) { this.children.push(...children); }
  appendChild(child) { this.children.push(child); return child; }
  replaceChildren(...children) { this.children = [...children]; }
  addEventListener(type, handler) { this.listeners.set(type, handler); }
  removeEventListener(type, handler) {
    if (this.listeners.get(type) === handler) this.listeners.delete(type);
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  click() { this.listeners.get('click')?.({ target: this }); }
}

class FakeDocument {
  constructor() {
    this.listeners = new Map();
    this.head = new FakeElement('head', this);
  }
  createElement(tagName) { return new FakeElement(tagName, this); }
  addEventListener(type, handler) { this.listeners.set(type, handler); }
  removeEventListener(type, handler) {
    if (this.listeners.get(type) === handler) this.listeners.delete(type);
  }
  dispatchKey(key) { this.listeners.get('keydown')?.({ key }); }
  getElementById(id) {
    const visit = (node) => {
      if (node.id === id) return node;
      for (const child of node.children ?? []) {
        const found = visit(child);
        if (found) return found;
      }
      return null;
    };
    return visit(this.head);
  }
}

function makeRoot() {
  const doc = new FakeDocument();
  return new FakeElement('div', doc);
}

function allNodes(root) {
  const out = [];
  const visit = (node) => {
    out.push(node);
    for (const child of node.children ?? []) visit(child);
  };
  visit(root);
  return out;
}

function byClass(root, className) {
  return allNodes(root).filter((node) => node.className === className);
}

test('snapshot groups duplicate caller-owned card ids without mutating input', () => {
  const input = {
    deckId: 'deck.main',
    deckName: 'Main',
    capacity: 40,
    cards: [
      { cardId: 'A', displayName: 'Alpha', quantity: 2 },
      { cardId: 'B', displayName: 'Beta' },
      { cardId: 'A', displayName: 'Alpha', count: 3 },
    ],
  };
  const before = structuredClone(input);
  const deck = normalizeQuickDeckSnapshot(input);
  assert.deepEqual(input, before);
  assert.equal(deck.totalCards, 6);
  assert.equal(deck.capacity, 40);
  assert.deepEqual(deck.entries.map(({ cardId, quantity }) => ({ cardId, quantity })), [
    { cardId: 'A', quantity: 5 },
    { cardId: 'B', quantity: 1 },
  ]);
  assert.equal(deck.readOnlyProjection, true);
});

test('model exposes inspection-only semantics and no local edit action', () => {
  const model = buildQuickDeckOverlayModel({ cards: ['A', 'B'], capacity: 40 });
  assert.equal(model.summary, '2 / 40枚');
  assert.deepEqual(model.closeActions, ['CLOSE_BUTTON', 'OUTSIDE_POINTER', 'ESCAPE']);
  assert.equal(model.readOnlyProjection, true);
  assert.equal(JSON.stringify(model).includes('SAVE'), false);
  assert.equal(JSON.stringify(model).includes('ADD_CARD'), false);
  assert.equal(JSON.stringify(model).includes('REMOVE_CARD'), false);
});

test('invalid snapshot fails closed instead of inventing a deck', () => {
  assert.throws(() => normalizeQuickDeckSnapshot({}), /QUICK_DECK_CARDS_REQUIRED/);
  assert.throws(() => normalizeQuickDeckSnapshot({ cards: [{}] }), /CARD_0_ID_REQUIRED/);
});

test('open renders whole current deck and aggregates quantities', () => {
  const root = makeRoot();
  const runtime = mountQuickDeckOverlay({
    root,
    getDeckSnapshot: () => ({ deckName: 'テストデッキ', capacity: 40, cards: ['A', 'B', 'A'] }),
  });
  const result = runtime.open();
  assert.equal(result.ok, true);
  assert.equal(runtime.isOpen(), true);
  assert.equal(byClass(root, 'quick-deck-overlay-title')[0].textContent, 'テストデッキ');
  assert.equal(byClass(root, 'quick-deck-overlay-summary')[0].textContent, '3 / 40枚');
  assert.equal(byClass(root, 'quick-deck-overlay-card').length, 2);
  assert.deepEqual(byClass(root, 'quick-deck-overlay-card-count').map((node) => node.textContent), ['×2', '×1']);
});

test('every open re-reads caller-owned current deck snapshot', () => {
  const root = makeRoot();
  let cards = ['A'];
  const runtime = mountQuickDeckOverlay({ root, getDeckSnapshot: () => ({ cards }) });
  assert.equal(runtime.open().model.deck.totalCards, 1);
  assert.equal(runtime.close('PROGRAMMATIC'), true);
  cards = ['A', 'B', 'C'];
  assert.equal(runtime.open().model.deck.totalCards, 3);
  assert.equal(byClass(root, 'quick-deck-overlay-card').length, 3);
});

test('close button, backdrop pointer and Escape all close without navigation state', () => {
  const root = makeRoot();
  const closes = [];
  const runtime = mountQuickDeckOverlay({
    root,
    getDeckSnapshot: () => ({ cards: ['A'] }),
    onClose: (event) => closes.push(event.reason),
  });

  runtime.open();
  byClass(root, 'quick-deck-overlay-close')[0].click();
  assert.equal(runtime.isOpen(), false);

  runtime.open();
  byClass(root, 'quick-deck-overlay-backdrop')[0].click();
  assert.equal(runtime.isOpen(), false);

  runtime.open();
  root.ownerDocument.dispatchKey('Escape');
  assert.equal(runtime.isOpen(), false);
  assert.deepEqual(closes, ['CLOSE_BUTTON', 'OUTSIDE_POINTER', 'ESCAPE']);
  assert.equal(root.children.length, 0);
});

test('invalid current caller state clears stale overlay content', () => {
  const root = makeRoot();
  let snapshot = { cards: ['A'] };
  const runtime = mountQuickDeckOverlay({ root, getDeckSnapshot: () => snapshot });
  assert.equal(runtime.open().ok, true);
  snapshot = { notCards: true };
  const result = runtime.open();
  assert.deepEqual(result, { ok: false, reason: 'INVALID_SNAPSHOT', model: null });
  assert.equal(root.children.length, 0);
  assert.equal(runtime.isOpen(), false);
});

test('destroy clears the surface and makes later opens inert', () => {
  const root = makeRoot();
  const runtime = mountQuickDeckOverlay({ root, getDeckSnapshot: () => ({ cards: ['A'] }) });
  runtime.open();
  assert.equal(runtime.destroy(), true);
  assert.equal(root.children.length, 0);
  assert.deepEqual(runtime.open(), { ok: false, reason: 'DESTROYED', model: null });
});
