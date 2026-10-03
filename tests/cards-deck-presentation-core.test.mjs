import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  DEFAULT_DECK_SWIPE_PRESENTATION,
  DECK_SWIPE_PRESENTATION_EVENTS,
  DECK_SWIPE_EFFECT_ASSETS,
  SETUP_QUICK_DECK_PREVIEW_CONTRACT,
  SETUP_QUICK_DECK_LIVE_CONTRACT,
  createSetupQuickDeckLiveModel,
  installSetupQuickDeckFromCurrentRuntime,
  installSetupQuickDeckRuntime,
  createDeckSwipePresentationController,
  createDeckSwipeFeedbackDetail,
  createSetupQuickDeckPreview,
} from '../browser/cards-deck-presentation-core.mjs';

const rect = (left, top, width, height) => ({ left, top, width, height });

function fakeClassList() {
  const values = new Set();
  return {
    add: (...names) => names.forEach((name) => values.add(name)),
    remove: (...names) => names.forEach((name) => values.delete(name)),
    contains: (name) => values.has(name),
  };
}

function fakeElement(box = rect(0, 0, 100, 140)) {
  const attributes = new Map();
  const element = {
    classList: fakeClassList(),
    style: { setProperty(name, value) { this[name] = value; } },
    children: [],
    dataset: {},
    getBoundingClientRect: () => box,
    appendChild(child) { child.parentNode = this; this.children.push(child); return child; },
    cloneNode() { this.cloneCalls = (this.cloneCalls ?? 0) + 1; throw new Error('CARD_CLONE_FORBIDDEN'); },
    setAttribute(name, value) { attributes.set(name, String(value)); },
    getAttribute(name) { return attributes.get(name) ?? null; },
    removeAttribute(name) { attributes.delete(name); },
    remove() { this.removed = true; },
    animate(keyframes, options) { this.animations = [...(this.animations ?? []), { keyframes, options }]; return {}; },
  };
  return element;
}

function fakeDocument() {
  const events = [];
  const body = fakeElement();
  const head = fakeElement();
  return {
    events,
    body,
    head,
    documentElement: fakeElement(),
    createElement() { return fakeElement(); },
    getElementById() { return null; },
    dispatchEvent(event) { events.push(event); return true; },
  };
}

class FakeCustomEvent {
  constructor(type, init = {}) { this.type = type; this.detail = init.detail; }
}

function deferredWindow() {
  let next = 1;
  const pending = new Map();
  return {
    CustomEvent: FakeCustomEvent,
    matchMedia: () => ({ matches: false }),
    setTimeout(fn, ms) { const id = next++; pending.set(id, { fn, ms }); return id; },
    clearTimeout(id) { pending.delete(id); },
    pending,
  };
}

function descendants(node) {
  return (node?.children ?? []).flatMap((child) => [child, ...descendants(child)]);
}

test('cards deck presentation core preserves the existing swipe presentation contract', () => {
  assert.equal(DECK_SWIPE_PRESENTATION_EVENTS.COMMIT, 'gameroad:deck-swipe-commit');
  assert.deepEqual(
    createDeckSwipeFeedbackDetail({ phase: 'commit', cardId: 'HT_8', reducedMotion: false }),
    {
      phase: 'commit',
      cardId: 'HT_8',
      reason: null,
      reducedMotion: false,
    },
  );
});

test('success presentation uses the formal aura and light trail without cloning the source card', () => {
  const doc = fakeDocument();
  const win = deferredWindow();
  const source = fakeElement(rect(40, 400, 120, 168));
  const target = fakeElement(rect(730, 120, 180, 250));
  const controller = createDeckSwipePresentationController({
    document: doc,
    window: win,
    sfx: false,
  });

  const result = controller.playSuccess({ sourceElement: source, targetElement: target, cardId: 'HT_8' });
  const layer = doc.body.children.find((child) => child.className.includes('gr-deck-swipe-layer'));
  const nodes = descendants(layer);
  const aura = nodes.find((node) => node.getAttribute('data-role') === 'deck-swipe-aura');
  const burst = nodes.find((node) => node.getAttribute('data-role') === 'deck-swipe-burst-sprite');
  const particles = nodes.filter((node) => node.getAttribute('data-role') === 'deck-swipe-particle');

  assert.equal(source.cloneCalls ?? 0, 0);
  assert.ok(layer);
  assert.equal(nodes.some((node) => node.className.includes('gr-deck-swipe-flight-card')), false);
  assert.ok(aura);
  assert.equal(aura.getAttribute('data-asset-id'), DECK_SWIPE_EFFECT_ASSETS.aura.id);
  assert.equal(aura.src, new URL('../assets/visual/battle-power-energy.jpg', import.meta.url).href);
  assert.ok(burst);
  assert.equal(burst.getAttribute('data-asset-id'), DECK_SWIPE_EFFECT_ASSETS.burstSprite.id);
  assert.equal(burst.getAttribute('data-frame-count'), '4');
  assert.equal(burst.style.backgroundImage, `url('${new URL('../assets/visual/effects/card-transfer-burst-sprite-v1.png', import.meta.url).href}')`);
  assert.equal(burst.style.backgroundSize, '400% 100%');
  assert.equal(burst.style.backgroundPosition, '0% 0%');
  const burstAnimation = burst.animations?.find(({ keyframes }) => keyframes.some((frame) => frame.backgroundPosition));
  assert.ok(burstAnimation);
  assert.deepEqual(burstAnimation.keyframes.map((frame) => frame.backgroundPosition), ['0% 0%', '33.333% 0%', '66.667% 0%', '100% 0%']);
  assert.equal(particles.length, DEFAULT_DECK_SWIPE_PRESENTATION.particleCount);
  assert.deepEqual(result.effect, {
    kind: 'light-trail',
    auraAssetId: 'battle-power-energy',
    burstSpriteAssetId: 'card-transfer-burst-sprite-v1',
    burstFrameCount: 4,
    burstAnimation: true,
    particleCount: 6,
    lowPerf: false,
  });
  assert.deepEqual(doc.events.map((event) => event.type), ['gameroad:deck-swipe-commit']);
  controller.cancelAll();
});

test('local Deck success confirms the acted card and visible count without a spatial destination', () => {
  const doc = fakeDocument();
  const win = deferredWindow();
  const source = fakeElement(rect(40, 400, 120, 168));
  const count = fakeElement();
  const controller = createDeckSwipePresentationController({ document: doc, window: win, sfx: false });

  const result = controller.playLocalSuccess({ sourceElement: source, countElement: count, cardId: 'HT_8' });

  assert.equal(result.kind, 'local-confirmation');
  assert.equal(result.spatialTransfer, false);
  assert.equal(result.cardId, 'HT_8');
  assert.equal(doc.body.children.some((child) => String(child.className || '').includes('gr-deck-swipe-layer')), false);
  assert.equal(source.classList.contains('gr-deck-swipe-source-armed'), true);
  assert.equal(count.classList.contains('gr-deck-swipe-count-hit'), true);
  assert.deepEqual(doc.events.map((event) => event.type), ['gameroad:deck-swipe-commit']);

  for (const timer of [...win.pending.values()]) timer.fn();
  assert.deepEqual(doc.events.map((event) => event.type), [
    'gameroad:deck-swipe-commit',
    'gameroad:deck-swipe-land',
  ]);
});

test('low-performance card transfer keeps the light path but caps particles', () => {
  const doc = fakeDocument();
  doc.body.classList.add('low-perf');
  const win = deferredWindow();
  const controller = createDeckSwipePresentationController({ document: doc, window: win, sfx: false });
  const result = controller.playSuccess({
    sourceElement: fakeElement(rect(0, 0, 100, 140)),
    targetElement: fakeElement(rect(500, 100, 180, 250)),
  });
  const layer = doc.body.children.find((child) => child.className.includes('gr-deck-swipe-layer'));
  const particles = descendants(layer).filter((node) => node.getAttribute('data-role') === 'deck-swipe-particle');
  const burst = descendants(layer).find((node) => node.getAttribute('data-role') === 'deck-swipe-burst-sprite');

  assert.match(layer.className, /gr-deck-swipe-low-perf/);
  assert.ok(burst);
  assert.equal(burst.getAttribute('data-asset-id'), DECK_SWIPE_EFFECT_ASSETS.burstSprite.id);
  assert.equal(particles.length, DEFAULT_DECK_SWIPE_PRESENTATION.lowPerfParticleCount);
  assert.equal(result.effect.lowPerf, true);
  controller.cancelAll();
});

test('Setup Quick Deck projection is immutable and isolated from later source mutations', () => {
  const source = {
    selectedDeckNumber: 2,
    savedDeck: { main: ['SP_A', 'HT_2'], ex: ['EX_1'] },
    savedDeckRule: { id: 'FIRST_REGULATION', revision: 3 },
  };
  const before = structuredClone(source);
  const preview = createSetupQuickDeckPreview(source);

  assert.equal(SETUP_QUICK_DECK_PREVIEW_CONTRACT.readOnly, true);
  assert.equal(SETUP_QUICK_DECK_PREVIEW_CONTRACT.ownsDeck, false);
  assert.equal(SETUP_QUICK_DECK_PREVIEW_CONTRACT.mutatesDeck, false);
  assert.equal(SETUP_QUICK_DECK_PREVIEW_CONTRACT.mutatesSelection, false);
  assert.equal(SETUP_QUICK_DECK_PREVIEW_CONTRACT.validatesDeck, false);
  assert.deepEqual(source, before);
  assert.deepEqual(preview, {
    schema: 'gameroad.setup-quick-deck-preview.v1',
    selectedDeckNumber: 2,
    deck: {
      main: ['SP_A', 'HT_2'],
      ex: ['EX_1'],
      mainCount: 2,
      exCount: 1,
      rule: { id: 'FIRST_REGULATION', revision: 3 },
    },
    readOnly: true,
  });

  source.savedDeck.main[0] = 'MUTATED';
  source.savedDeck.ex.push('EX_2');
  source.savedDeckRule.id = 'OTHER';
  assert.deepEqual(preview.deck.main, ['SP_A', 'HT_2']);
  assert.deepEqual(preview.deck.ex, ['EX_1']);
  assert.deepEqual(preview.deck.rule, { id: 'FIRST_REGULATION', revision: 3 });
  assert.equal(Object.isFrozen(preview), true);
  assert.equal(Object.isFrozen(preview.deck), true);
  assert.equal(Object.isFrozen(preview.deck.main), true);
  assert.equal(Object.isFrozen(preview.deck.ex), true);
  assert.equal(Object.isFrozen(preview.deck.rule), true);
  assert.throws(() => preview.deck.main.push('SP_K'), TypeError);
});

test('Setup Quick Deck projection preserves caller-selected deck identity 1 to 3 without inventing legality', () => {
  for (const selectedDeckNumber of [1, 2, 3]) {
    const preview = createSetupQuickDeckPreview({
      selectedDeckNumber,
      savedDeck: { main: ['SP_A'], ex: [] },
      savedDeckRule: null,
    });
    assert.equal(preview.selectedDeckNumber, selectedDeckNumber);
    assert.equal(preview.deck.mainCount, 1);
    assert.equal(preview.deck.exCount, 0);
    assert.deepEqual(preview.deck.rule, { id: null, revision: null });
  }
});

test('Setup Quick Deck projection fails closed on malformed deck shape or opaque identity references', () => {
  assert.throws(
    () => createSetupQuickDeckPreview({ selectedDeckNumber: 0, savedDeck: { main: [], ex: [] } }),
    /SELECTED_DECK_NUMBER_INVALID/,
  );
  assert.throws(
    () => createSetupQuickDeckPreview({ selectedDeckNumber: 13, savedDeck: { main: [], ex: [] } }),
    /SELECTED_DECK_NUMBER_INVALID/,
  );
  assert.throws(
    () => createSetupQuickDeckPreview({ selectedDeckNumber: 1, savedDeck: { main: 'SP_A', ex: [] } }),
    /SAVED_DECK_MAIN_REQUIRED/,
  );
  assert.throws(
    () => createSetupQuickDeckPreview({ selectedDeckNumber: 1, savedDeck: { main: [''], ex: [] } }),
    /SAVED_DECK_MAIN_CARD_ID_INVALID/,
  );
  assert.throws(
    () => createSetupQuickDeckPreview({
      selectedDeckNumber: 1,
      savedDeck: { main: ['SP_A'], ex: [] },
      savedDeckRule: { id: { nested: true }, revision: 1 },
    }),
    /SAVED_DECK_RULE_ID_INVALID/,
  );
});

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
  assert.equal(coreSource.includes("import('./setup-quick-deck-runtime-mount.mjs')"), false);
  assert.ok(coreSource.includes('installSetupQuickDeckFromCurrentRuntime'));
  assert.ok(coreSource.includes('selectedDeckNumber: Number(state?.selectedDeckIndex) + 1'));
  assert.ok(coreSource.includes('savedDeck: state?.savedDeck'));
  assert.ok(coreSource.includes('savedDeckRule: state?.savedDeckRule'));
  assert.ok(coreSource.includes("navigate?.('cards', { reason: 'detail' })"));
  assert.equal(coreSource.includes('localStorage'), false);
  assert.equal(coreSource.includes('sessionStorage'), false);
  assert.equal(coreSource.includes('writeDeck'), false);
  assert.equal(coreSource.includes('commitDeck'), false);
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
  const coreSource = fs.readFileSync(new URL('../browser/cards-deck-presentation-core.mjs', import.meta.url), 'utf8');
  assert.ok(coreSource.includes('@media(max-width:480px)'));
  assert.ok(coreSource.includes('@media(max-height:470px) and (orientation:landscape)'));
  assert.ok(coreSource.includes('min-height:44px'));
  assert.ok(coreSource.includes('max-height:calc(100dvh - 12px)'));
  assert.ok(coreSource.includes('max-height:calc(100dvh - 10px)'));
});
