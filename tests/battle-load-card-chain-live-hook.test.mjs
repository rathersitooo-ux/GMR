import test from 'node:test';
import assert from 'node:assert/strict';
import { mountBattleScreenExternalSurface } from '../browser/battle-screen-runtime-mount.mjs';

class FakeElement {
  constructor(tagName) {
    this.tagName = String(tagName).toUpperCase();
    this.id = '';
    this.className = '';
    this.textContent = '';
    this.hidden = false;
    this.dataset = {};
    this.style = {};
    this.attributes = new Map();
    this.children = [];
    this.parentNode = null;
  }

  appendChild(child) {
    if (child.parentNode) child.parentNode.removeChild(child);
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  removeChild(child) {
    const index = this.children.indexOf(child);
    if (index >= 0) this.children.splice(index, 1);
    child.parentNode = null;
    return child;
  }

  replaceChildren(...children) {
    for (const child of this.children) child.parentNode = null;
    this.children = [];
    for (const child of children) this.appendChild(child);
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.has(name) ? this.attributes.get(name) : null;
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  querySelector(selector) {
    if (selector === '[data-role="fanart-local-skin-overlay"]') {
      return walk(this, node => node !== this && node.dataset?.role === 'fanart-local-skin-overlay');
    }
    return null;
  }

  get firstChild() {
    return this.children[0] ?? null;
  }
}

function walk(root, predicate) {
  if (predicate(root)) return root;
  for (const child of root.children ?? []) {
    const found = walk(child, predicate);
    if (found) return found;
  }
  return null;
}

class FakeDocument {
  constructor() {
    this.head = new FakeElement('head');
    this.body = new FakeElement('body');
  }

  createElement(tag) {
    return new FakeElement(tag);
  }

  getElementById(id) {
    return walk(this.head, node => node.id === id) ?? walk(this.body, node => node.id === id);
  }

  querySelector(selector) {
    if (selector === '[data-gr-battle-screen-root]') {
      return walk(this.body, node => node.attributes?.has('data-gr-battle-screen-root'));
    }
    return null;
  }

  querySelectorAll(selector) {
    if (selector !== '#collectionGrid [data-id]') return [];
    const grid = this.getElementById('collectionGrid');
    return grid?.children?.filter(node => typeof node.dataset?.id === 'string') ?? [];
  }
}

function createRuntime() {
  const document = new FakeDocument();
  const collectionGrid = document.createElement('section');
  collectionGrid.id = 'collectionGrid';

  const collectionC1 = document.createElement('article');
  collectionC1.dataset.id = 'C1';
  const localC1Art = document.createElement('img');
  localC1Art.dataset.role = 'fanart-local-skin-overlay';
  localC1Art.src = 'blob:gameroad-local-c1';
  collectionC1.appendChild(localC1Art);
  collectionGrid.appendChild(collectionC1);
  document.body.appendChild(collectionGrid);

  const root = document.createElement('main');
  root.setAttribute('data-gr-battle-screen-root', '');
  document.body.appendChild(root);

  return { document, runtime: mountBattleScreenExternalSurface({ document }, { root }) };
}

test('shows the authoritative LOAD card as the real card while janken stays secondary', () => {
  const { runtime } = createRuntime();

  const snapshot = runtime.renderHud({
    loadCard: {
      cardId: 'C1',
      label: 'C1',
      displayNumber: 5,
      nativeSuit: '♦'
    },
    loadJanken: 'rock',
    playedCards: []
  });

  assert.equal(snapshot.loadCard.cardId, 'C1');
  assert.equal(runtime.hud.loadCard.hidden, false);
  assert.equal(runtime.hud.loadCard.dataset.cardId, 'C1');
  assert.equal(runtime.hud.loadCard.dataset.displayNumber, '5');
  assert.equal(runtime.hud.loadCard.dataset.nativeSuit, '♦');
  assert.equal(runtime.hud.loadCard.dataset.artSource, 'viewer_local');
  assert.equal(runtime.hud.loadCard.children[0].tagName, 'IMG');
  assert.equal(runtime.hud.loadCard.children[0].src, 'blob:gameroad-local-c1');
  assert.equal(runtime.hud.loadValue.textContent, 'グー');
  assert.equal(runtime.hud.root.dataset.loadCardResolved, 'true');
  assert.equal(runtime.hud.root.dataset.loadCardId, 'C1');
  assert.equal(runtime.hud.root.dataset.loadJankenResolved, 'true');
  assert.equal(runtime.hud.loadCard.textContent.includes('グー'), false);
});

test('keeps the same cardId and art when LOAD becomes the next played Battle card', () => {
  const { runtime } = createRuntime();

  runtime.renderHud({
    loadCard: { cardId: 'C1', label: 'C1' },
    loadJanken: 'rock',
    playedCards: []
  });
  assert.equal(runtime.hud.loadCard.dataset.cardId, 'C1');

  runtime.renderHud({
    loadCard: null,
    loadJanken: null,
    playedCards: [{ cardId: 'C1', label: 'C1' }]
  });

  assert.equal(runtime.hud.loadCard.hidden, true);
  assert.equal(runtime.hud.loadCard.dataset.cardId, undefined);
  assert.equal(runtime.hud.root.dataset.loadCardResolved, 'false');
  assert.equal(runtime.hud.root.dataset.loadCardId, undefined);
  assert.equal(runtime.hud.chain.children.length, 1);
  assert.equal(runtime.hud.chain.children[0].dataset.cardId, 'C1');
  assert.equal(runtime.hud.chain.children[0].dataset.order, '1');
  assert.equal(runtime.hud.chain.children[0].dataset.artSource, 'viewer_local');
  assert.equal(runtime.hud.chain.children[0].children[0].src, 'blob:gameroad-local-c1');
});

test('fails closed on unresolved LOAD identity without hiding valid janken annotation', () => {
  const { runtime } = createRuntime();

  const snapshot = runtime.renderHud({
    loadCard: { id: 'guessed-id', name: 'Do not use this as identity' },
    loadJanken: 'paper',
    playedCards: []
  });

  assert.equal(snapshot.loadCard, null);
  assert.equal(snapshot.loadIdentityState, 'unresolved');
  assert.equal(runtime.hud.loadCard.hidden, true);
  assert.equal(runtime.hud.loadCard.dataset.cardId, undefined);
  assert.equal(runtime.hud.root.dataset.loadCardResolved, 'false');
  assert.equal(runtime.hud.root.dataset.loadCardId, undefined);
  assert.equal(runtime.hud.loadValue.textContent, 'パー');
  assert.doesNotMatch(JSON.stringify(snapshot), /guessed-id|Do not use this as identity/);
});

test('does not turn an invalid heart-like annotation into a card or janken identity', () => {
  const { runtime } = createRuntime();

  runtime.renderHud({
    loadCard: { cardId: 'C1', label: 'C1' },
    loadJanken: 'heart',
    playedCards: []
  });

  assert.equal(runtime.hud.loadCard.dataset.cardId, 'C1');
  assert.equal(runtime.hud.loadValue.textContent, '?');
  assert.equal(runtime.hud.loadValue.dataset.resolved, 'false');
  assert.equal(runtime.hud.root.dataset.loadJankenResolved, 'false');
  assert.equal(runtime.hud.root.textContent.includes('♥'), false);
});
