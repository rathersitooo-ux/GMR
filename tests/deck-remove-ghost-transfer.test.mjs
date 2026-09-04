import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareDeckRemoveGhostTransfer } from '../browser/deck-remove-ghost-transfer.mjs';
import {
  createDeckStorageCornerController,
  installDeckStorageCornerStyles,
} from '../browser/deck-storage-corner-runtime.mjs';

const rect = (left, top, width, height) => ({ left, top, width, height });

function classList() {
  const values = new Set();
  return {
    add: (...names) => names.forEach((name) => values.add(name)),
    remove: (...names) => names.forEach((name) => values.delete(name)),
    contains: (name) => values.has(name),
  };
}

function element(box = rect(0, 0, 100, 140)) {
  const node = {
    children: [],
    style: { setProperty(name, value) { this[name] = value; } },
    classList: classList(),
    animations: [],
    attributes: {},
    removed: false,
    getBoundingClientRect: () => box,
    appendChild(child) { this.children.push(child); child.parentNode = this; return child; },
    setAttribute(name, value) { this.attributes[name] = String(value); },
    removeAttribute(name) { delete this.attributes[name]; },
    animate(keyframes, options) {
      const animation = { keyframes, options, onfinish: null };
      this.animations.push(animation);
      return animation;
    },
    cloneNode() { return element(box); },
    remove() { this.removed = true; },
  };
  return node;
}

function timerWindow({ reduced = false } = {}) {
  let next = 1;
  const timers = new Map();
  return {
    matchMedia: () => ({ matches: reduced }),
    setTimeout(fn) { const id = next++; timers.set(id, fn); return id; },
    clearTimeout(id) { timers.delete(id); },
    flush() {
      for (const [id, fn] of [...timers]) {
        timers.delete(id);
        fn();
      }
    },
  };
}

function documentFixture() {
  const body = element();
  const head = element();
  const created = [];
  return {
    body,
    head,
    created,
    createElement(tag) {
      const node = element();
      node.tagName = String(tag).toUpperCase();
      node.textContent = '';
      node.id = '';
      node.className = '';
      created.push(node);
      return node;
    },
    getElementById: () => null,
  };
}

test('Deck remove transfer keeps a stationary source anchor and moves only a fading ghost with streaks', () => {
  const doc = documentFixture();
  const win = timerWindow();
  const source = element(rect(680, 390, 110, 154));
  const target = element(rect(90, 130, 110, 154));

  const prepared = prepareDeckRemoveGhostTransfer({
    document: doc,
    window: win,
    sourceElement: source,
    targetElement: target,
    cardId: 'c7',
  });

  assert.ok(prepared);
  assert.equal(prepared.sourceElement, source);
  assert.notEqual(prepared.anchorElement, source);
  assert.notEqual(prepared.ghostElement, source);
  assert.notEqual(prepared.anchorElement, prepared.ghostElement);
  assert.equal(source.animations.length, 0);
  assert.equal(prepared.anchorElement.animations.length, 0);
  assert.equal(prepared.streakElements.length, 2);
  assert.equal(doc.body.children.length, 1);
  assert.equal(doc.body.children[0].style.visibility, 'hidden');

  assert.equal(prepared.play(), true);
  assert.equal(source.animations.length, 0, 'the real/source card must never translate or fade');
  assert.equal(prepared.anchorElement.animations.length, 0, 'the visible source anchor must remain stationary');
  assert.equal(prepared.ghostElement.animations.length, 1);
  const ghostFrames = prepared.ghostElement.animations[0].keyframes;
  assert.equal(ghostFrames.at(-1).opacity, 0);
  assert.match(ghostFrames.at(-1).transform, /translate3d\(-/);
  assert.ok(prepared.streakElements.every((streak) => streak.animations.length === 1));
  assert.equal(doc.body.children[0].style.visibility, 'visible');
});

test('Deck remove controller emits preparation before the existing remove authority mutates the deck', () => {
  let deck = ['a', 'b'];
  const snapshots = [];
  const events = [];
  const controller = createDeckStorageCornerController({
    getDeck: () => [...deck],
    addDeckCard: () => ({ ok: false }),
    removeDeckCard: (id) => {
      const index = deck.indexOf(id);
      if (index < 0) return { ok: false, reason: 'not-in-deck' };
      deck.splice(index, 1);
      return { ok: true };
    },
    isRoyal: () => false,
  });
  controller.subscribe((payload) => {
    if (payload.event.startsWith('deck-remove')) {
      events.push(payload.event);
      snapshots.push([...deck]);
    }
  });

  const result = controller.applySwipe({ surface: 'deck', cardId: 'b', deltaX: -90, deltaY: 2 });
  assert.equal(result.ok, true);
  assert.deepEqual(events, ['deck-remove-prepare', 'deck-remove']);
  assert.deepEqual(snapshots[0], ['a', 'b']);
  assert.deepEqual(snapshots[1], ['a']);
});

test('overflow selection keeps the physical deck at forty and advances Storage count through 41/40 and 42/40', () => {
  const deck = Array.from({ length: 40 }, (_, index) => `d${index}`);
  const controller = createDeckStorageCornerController({
    getDeck: () => [...deck],
    addDeckCard: () => { throw new Error('overflow must not call Deck add authority'); },
    removeDeckCard: () => ({ ok: false }),
    isRoyal: () => false,
  });

  const first = controller.applySwipe({ surface: 'collection', cardId: 'x41', deltaX: 90, deltaY: 1 });
  assert.equal(first.ok, true);
  assert.equal(first.view.deckCount, 40);
  assert.equal(first.view.storageCount, 1);
  assert.equal(first.view.storageButtonLabel, '41/40');

  const second = controller.applySwipe({ surface: 'collection', cardId: 'x42', deltaX: 90, deltaY: 1 });
  assert.equal(second.ok, true);
  assert.equal(second.view.deckCount, 40);
  assert.equal(second.view.storageCount, 2);
  assert.equal(second.view.storageButtonLabel, '42/40');
});

test('Storage styling is a compact upper-left pointer-through panel rather than a blocking modal surface', () => {
  const doc = documentFixture();
  installDeckStorageCornerStyles(doc);
  assert.equal(doc.head.children.length, 1);
  const css = doc.head.children[0].textContent;
  assert.match(css, /\.gr-storage-backdrop\{position:fixed;inset:0;[^}]*background:transparent;pointer-events:none/);
  assert.match(css, /\.gr-storage-window\{position:absolute;left:max\(10px,env\(safe-area-inset-left\)\);top:max\(10px,env\(safe-area-inset-top\)\)/);
  assert.match(css, /width:min\(300px,calc\(100vw - 20px\)\)/);
  assert.doesNotMatch(css, /background:rgba\(0,0,0,\.34\)/);
});
