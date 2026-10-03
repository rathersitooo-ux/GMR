import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import {
  SETUP_QUICK_DECK_LIVE_CONTRACT,
  createSetupQuickDeckLiveModel,
  installSetupQuickDeckFromCurrentRuntime,
  installSetupQuickDeckRuntime,
} from '../browser/setup-quick-deck-runtime-mount.mjs';

class FakeClassList {
  constructor(node) { this.node = node; }
  contains(token) { return String(this.node.className || '').split(/\s+/).includes(token); }
}

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = String(tagName).toUpperCase();
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.parentElement = null;
    this.dataset = {};
    this.attributes = new Map();
    this.listeners = new Map();
    this.className = '';
    this.classList = new FakeClassList(this);
    this.id = '';
    this.type = '';
    this.textContent = '';
    this.hidden = false;
  }
  append(...nodes) {
    for (const node of nodes) {
      if (!node) continue;
      node.parentElement = this;
      this.children.push(node);
    }
  }
  appendChild(node) { this.append(node); return node; }
  replaceChildren(...nodes) {
    for (const child of this.children) child.parentElement = null;
    this.children = [];
    this.append(...nodes);
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  addEventListener(type, handler) { this.listeners.set(type, handler); }
  removeEventListener(type, handler) {
    if (this.listeners.get(type) === handler) this.listeners.delete(type);
  }
  focus() { this.ownerDocument.activeElement = this; }
  click() { this.listeners.get('click')?.({ target: this }); }
  pointerDown(target = this) { this.listeners.get('pointerdown')?.({ target }); }
  remove() {
    if (!this.parentElement) return;
    this.parentElement.children = this.parentElement.children.filter((child) => child !== this);
    this.parentElement = null;
  }
}

class FakeMutationObserver {
  constructor(handler) { this.handler = handler; }
  observe() {}
  disconnect() {}
}

class FakeDocument {
  constructor() {
    this.listeners = new Map();
    this.head = new FakeElement('head', this);
    this.documentElement = new FakeElement('html', this);
    this.setup = new FakeElement('section', this);
    this.setup.className = 'screen setup active';
    this.recovery = new FakeElement('div', this);
    this.recovery.className = 'setupDeckRecovery';
    this.note = new FakeElement('div', this);
    this.note.id = 'setupDeckNote';
    this.recovery.append(this.note);
    this.setup.append(this.recovery);
    this.activeElement = null;
  }
  createElement(tagName) { return new FakeElement(tagName, this); }
  querySelector(selector) {
    if (selector === 'section[data-screen="setup"]') return this.setup;
    if (selector === '.setupDeckRecovery') return this.recovery;
    return null;
  }
  getElementById(id) {
    const visit = (node) => {
      if (node.id === id) return node;
      for (const child of node.children || []) {
        const found = visit(child);
        if (found) return found;
      }
      return null;
    };
    return visit(this.head) || visit(this.setup);
  }
  addEventListener(type, handler) { this.listeners.set(type, handler); }
  removeEventListener(type, handler) {
    if (this.listeners.get(type) === handler) this.listeners.delete(type);
  }
  dispatchKey(key) {
    const event = {
      key,
      prevented: false,
      stopped: false,
      preventDefault() { this.prevented = true; },
      stopPropagation() { this.stopped = true; },
    };
    this.listeners.get('keydown')?.(event);
    return event;
  }
}

function allNodes(root) {
  const out = [];
  const visit = (node) => {
    out.push(node);
    for (const child of node.children || []) visit(child);
  };
  visit(root);
  return out;
}

function byRole(root, role) {
  return allNodes(root).find((node) => node.dataset?.role === role) || null;
}

test('live model reuses caller-owned immutable Setup preview and card labels', () => {
  const source = {
    selectedDeckNumber: 12,
    savedDeck: { main: ['A', 'B', 'A'], ex: ['X'] },
    savedDeckRule: { id: 'first', revision: 7 },
  };
  const before = structuredClone(source);
  const model = createSetupQuickDeckLiveModel(source, (id) => ({ A: 'Alpha', B: 'Beta', X: 'Extra' }[id]));
  assert.deepEqual(source, before);
  assert.equal(model.selectedDeckNumber, 12);
  assert.equal(model.title, 'デッキ12の内容');
  assert.equal(model.summary, 'メイン3・EX1');
  assert.deepEqual(model.main.map((row) => [row.cardId, row.label, row.quantity]), [
    ['A', 'Alpha', 2],
    ['B', 'Beta', 1],
  ]);
  assert.deepEqual(model.ex.map((row) => [row.cardId, row.label, row.quantity]), [['X', 'Extra', 1]]);
  assert.equal(model.readOnly, true);
});

test('live contract never owns or mutates deck, selection, legality or editor', () => {
  assert.equal(SETUP_QUICK_DECK_LIVE_CONTRACT.readOnly, true);
  assert.equal(SETUP_QUICK_DECK_LIVE_CONTRACT.ownsDeck, false);
  assert.equal(SETUP_QUICK_DECK_LIVE_CONTRACT.mutatesDeck, false);
  assert.equal(SETUP_QUICK_DECK_LIVE_CONTRACT.mutatesSelection, false);
  assert.equal(SETUP_QUICK_DECK_LIVE_CONTRACT.validatesDeck, false);
  assert.equal(SETUP_QUICK_DECK_LIVE_CONTRACT.editRoute, 'existing-deck-editor-only');
  assert.deepEqual(SETUP_QUICK_DECK_LIVE_CONTRACT.closeActions, ['CLOSE_BUTTON', 'OUTSIDE_POINTER', 'ESCAPE']);
});

test('open reads fresh selected saved deck, Escape/outside restore trigger focus, edit reuses callback', () => {
  const doc = new FakeDocument();
  const win = { MutationObserver: FakeMutationObserver };
  let source = {
    selectedDeckNumber: 1,
    savedDeck: { main: ['A'], ex: [] },
    savedDeckRule: { id: 'r', revision: 1 },
  };
  const edited = [];
  const runtime = installSetupQuickDeckRuntime({
    document: doc,
    window: win,
    getSource: () => source,
    getCardLabel: (id) => id === 'A' ? 'Alpha' : id,
    onEdit: (model) => edited.push(model.selectedDeckNumber),
  });
  assert.equal(runtime.installed, true);

  const trigger = doc.getElementById('gameroad-setup-quick-deck-open');
  const root = doc.getElementById('gameroad-setup-quick-deck-root');
  assert.ok(trigger);
  assert.ok(root);
  trigger.focus();
  trigger.click();
  assert.equal(runtime.isOpen(), true);
  assert.equal(root.hidden, false);
  assert.equal(runtime.getLastModel().selectedDeckNumber, 1);

  const escaped = doc.dispatchKey('Escape');
  assert.equal(escaped.prevented, true);
  assert.equal(runtime.isOpen(), false);
  assert.equal(root.hidden, true);
  assert.equal(doc.activeElement, trigger);

  source = {
    selectedDeckNumber: 12,
    savedDeck: { main: ['B', 'C'], ex: ['X'] },
    savedDeckRule: { id: 'r', revision: 1 },
  };
  trigger.click();
  assert.equal(runtime.getLastModel().selectedDeckNumber, 12);
  const backdrop = byRole(root, 'setup-quick-deck-backdrop');
  assert.ok(backdrop);
  backdrop.pointerDown(backdrop);
  assert.equal(runtime.isOpen(), false);
  assert.equal(doc.activeElement, trigger);

  trigger.click();
  const edit = byRole(root, 'setup-quick-deck-edit');
  assert.ok(edit);
  edit.click();
  assert.equal(runtime.isOpen(), false);
  assert.deepEqual(edited, [12]);
});

test('invalid caller state fails closed instead of inventing deck data', () => {
  const doc = new FakeDocument();
  const runtime = installSetupQuickDeckRuntime({
    document: doc,
    window: { MutationObserver: FakeMutationObserver },
    getSource: () => ({ selectedDeckNumber: 13, savedDeck: { main: [], ex: [] } }),
  });
  assert.deepEqual(runtime.open(), { ok: false, reason: 'INVALID_SOURCE', model: null });
  assert.equal(runtime.isOpen(), false);
});

test('production integration reads current selected saved deck and existing editor route only', () => {
  const coreSource = fs.readFileSync(new URL('../browser/cards-deck-presentation-core.mjs', import.meta.url), 'utf8');
  const runtimeSource = fs.readFileSync(new URL('../browser/setup-quick-deck-runtime-mount.mjs', import.meta.url), 'utf8');
  assert.ok(coreSource.includes("import('./setup-quick-deck-runtime-mount.mjs')"));
  assert.ok(coreSource.includes('installSetupQuickDeckFromCurrentRuntime'));
  assert.ok(runtimeSource.includes('selectedDeckNumber: Number(state?.selectedDeckIndex) + 1'));
  assert.ok(runtimeSource.includes('savedDeck: state?.savedDeck'));
  assert.ok(runtimeSource.includes('savedDeckRule: state?.savedDeckRule'));
  assert.ok(runtimeSource.includes("navigate?.('cards', { reason: 'detail' })"));
  assert.equal(runtimeSource.includes('localStorage'), false);
  assert.equal(runtimeSource.includes('sessionStorage'), false);
  assert.equal(runtimeSource.includes('writeDeck'), false);
  assert.equal(runtimeSource.includes('commitDeck'), false);
});

test('current-runtime adapter opens slot 12 from live state and sends edit through existing navigation', () => {
  const doc = new FakeDocument();
  const navigations = [];
  const runtimeGlobal = {
    document: doc,
    window: { MutationObserver: FakeMutationObserver },
    __CARD_DATA__: [
      { id: 'A', display_name: 'Alpha' },
      { id: 'X', display_name: 'Extra' },
    ],
    __GAMEROAD_TEST__: {
      state: {
        selectedDeckIndex: 11,
        savedDeck: { main: ['A'], ex: ['X'] },
        savedDeckRule: { id: 'r', revision: 1 },
      },
    },
    GAMEROAD_SCREEN_TRANSITION: {
      navigate: (...args) => navigations.push(args),
    },
  };
  const runtime = installSetupQuickDeckFromCurrentRuntime({ global: runtimeGlobal });
  assert.equal(runtime.installed, true);
  const trigger = doc.getElementById('gameroad-setup-quick-deck-open');
  trigger.click();
  assert.equal(runtime.getLastModel().selectedDeckNumber, 12);
  assert.equal(runtime.getLastModel().main[0].label, 'Alpha');
  byRole(doc.getElementById('gameroad-setup-quick-deck-root'), 'setup-quick-deck-edit').click();
  assert.deepEqual(navigations, [['cards', { reason: 'detail' }]]);
});

test('live mount keeps compact portrait and landscape geometry plus 44px controls', () => {
  const runtimeSource = fs.readFileSync(new URL('../browser/setup-quick-deck-runtime-mount.mjs', import.meta.url), 'utf8');
  assert.ok(runtimeSource.includes('@media(max-width:480px)'));
  assert.ok(runtimeSource.includes('@media(max-height:470px) and (orientation:landscape)'));
  assert.ok(runtimeSource.includes('min-height:44px'));
  assert.ok(runtimeSource.includes('max-height:calc(100dvh - 12px)'));
  assert.ok(runtimeSource.includes('max-height:calc(100dvh - 10px)'));
});
