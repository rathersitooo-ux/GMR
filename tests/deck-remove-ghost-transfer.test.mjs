import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeckRemoveGhostTransfer } from '../browser/deck-remove-ghost-transfer.mjs';
import { installDeckStorageCornerStyles } from '../browser/deck-storage-corner-runtime.mjs';

function classList() {
  const values = new Set();
  return { add: (...v) => v.forEach(x => values.add(x)), remove: (...v) => v.forEach(x => values.delete(x)), contains: x => values.has(x) };
}

function element(rect = { left: 10, top: 20, width: 80, height: 112 }) {
  return {
    children: [], classList: classList(), style: {}, offsetWidth: 80,
    getBoundingClientRect: () => rect,
    appendChild(node) { this.children.push(node); node.parentNode = this; return node; },
    cloneNode() { return element(rect); },
    setAttribute() {}, removeAttribute() {},
    animate(frames, options) { this.lastAnimation = { frames, options }; return {}; },
    remove() { this.removed = true; },
  };
}

function fixture() {
  const head = element();
  const body = element();
  const doc = {
    head, body,
    getElementById() { return null; },
    createElement() { return element(); },
  };
  let next = 1;
  const timers = new Map();
  const win = {
    matchMedia: () => ({ matches: false }),
    setTimeout(fn) { const id = next++; timers.set(id, fn); return id; },
    clearTimeout(id) { timers.delete(id); },
  };
  return { doc, win, timers };
}

test('prepare keeps source untouched and snapshots both stationary anchor and moving ghost', () => {
  const { doc, win } = fixture();
  const source = element({ left: 100, top: 220, width: 90, height: 126 });
  const beforeStyle = { ...source.style };
  const ghost = createDeckRemoveGhostTransfer({ document: doc, window: win });
  assert.equal(ghost.prepare({ cardId: 'c1', sourceElement: source }), true);
  assert.deepEqual(source.style, beforeStyle);
  assert.equal(source.lastAnimation, undefined);
  assert.equal(ghost.pendingCount, 1);
  const layer = doc.body.children.at(-1);
  assert.equal(layer.className, 'gr-deck-remove-ghost-layer');
  assert.equal(layer.children[0].classList.contains('gr-deck-remove-anchor-card'), true);
  assert.equal(layer.children[1].classList.contains('gr-deck-remove-ghost-card'), true);
  assert.equal(layer.children[0].style.left, '100px');
  assert.equal(layer.children[1].style.left, '100px');
});

test('commit leaves anchor position fixed while separate ghost fades toward target with streaks', () => {
  const { doc, win } = fixture();
  const source = element({ left: 300, top: 200, width: 90, height: 126 });
  const target = element({ left: 40, top: 210, width: 90, height: 126 });
  const transfer = createDeckRemoveGhostTransfer({ document: doc, window: win, flightMs: 230, streakCount: 2 });
  transfer.prepare({ cardId: 'c1', sourceElement: source });
  const layer = doc.body.children.at(-1);
  const anchor = layer.children[0];
  const ghost = layer.children[1];
  assert.equal(transfer.commit({ cardId: 'c1', targetElement: target }), true);
  assert.equal(source.lastAnimation, undefined);
  assert.equal(anchor.lastAnimation.options.duration, 230);
  assert.equal(anchor.lastAnimation.frames.every(frame => frame.transform === 'translate3d(0,0,0)'), true);
  assert.equal(ghost.lastAnimation.options.duration, 230);
  assert.equal(ghost.lastAnimation.frames.at(-1).opacity, 0);
  assert.match(ghost.lastAnimation.frames.at(-1).transform, /translate3d\(-260px,10px,0\)/);
  assert.equal(layer.children.filter(node => node.className === 'gr-deck-remove-ghost-streak').length, 2);
  assert.equal(target.classList.contains('gr-deck-remove-return-pulse'), true);
});

test('cancel removes prepared snapshots so rejected remove cannot fake a flight', () => {
  const { doc, win } = fixture();
  const source = element();
  const transfer = createDeckRemoveGhostTransfer({ document: doc, window: win });
  transfer.prepare({ cardId: 'c1', sourceElement: source });
  assert.equal(transfer.cancel({ cardId: 'c1' }), true);
  assert.equal(transfer.pendingCount, 0);
});

test('Storage dock is upper-left nonmodal and does not install a full-screen input blocker', () => {
  const { doc } = fixture();
  installDeckStorageCornerStyles(doc);
  const css = doc.head.children.at(-1)?.textContent ?? '';
  assert.match(css, /\.gr-storage-backdrop\{position:fixed;left:12px;top:12px;/);
  assert.match(css, /\.gr-storage-backdrop\{[^}]*pointer-events:none[^}]*background:transparent/);
  assert.match(css, /\.gr-storage-window\{pointer-events:auto/);
  assert.doesNotMatch(css, /\.gr-storage-backdrop\{position:fixed;inset:0/);
});
