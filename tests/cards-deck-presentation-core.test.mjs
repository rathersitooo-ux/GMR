import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_DECK_SWIPE_PRESENTATION,
  DECK_SWIPE_PRESENTATION_EVENTS,
  DECK_SWIPE_EFFECT_ASSETS,
  SETUP_QUICK_DECK_PREVIEW_CONTRACT,
  QUICK_DECK_REGISTRY_CONTRACT,
  createDeckSwipePresentationController,
  createDeckSwipeFeedbackDetail,
  createSetupQuickDeckPreview,
  normalizeQuickDeckSlotRefs,
  toggleQuickDeckSlotRef,
  projectQuickDeckChoices,
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

test('Quick Deck registry stores at most three unique existing slot references and never deck data', () => {
  assert.equal(QUICK_DECK_REGISTRY_CONTRACT.maxQuickDecks, 3);
  assert.equal(QUICK_DECK_REGISTRY_CONTRACT.defaultDeckSlotCount, 12);
  assert.equal(QUICK_DECK_REGISTRY_CONTRACT.duplicatesDeckData, false);
  assert.deepEqual(
    [...normalizeQuickDeckSlotRefs({ slotIndices: [2, 2, -1, 11, 12, 5, 7] })],
    [2, 11, 5],
  );
});

test('Quick Deck registration toggles without auto-evicting when all three references are occupied', () => {
  let refs = [];
  for (const deckIndex of [4, 1, 9]) {
    const result = toggleQuickDeckSlotRef(refs, deckIndex);
    assert.equal(result.changed, true);
    assert.equal(result.registered, true);
    refs = [...result.slotIndices];
  }
  assert.deepEqual(refs, [4, 1, 9]);

  const full = toggleQuickDeckSlotRef(refs, 6);
  assert.equal(full.changed, false);
  assert.equal(full.reason, 'QUICK_DECK_LIMIT_REACHED');
  assert.deepEqual([...full.slotIndices], [4, 1, 9]);

  const removed = toggleQuickDeckSlotRef(refs, 1);
  assert.equal(removed.changed, true);
  assert.equal(removed.registered, false);
  assert.deepEqual([...removed.slotIndices], [4, 9]);
});

test('Quick Deck choices preserve registration order while projecting the existing 12-slot library', () => {
  const deckSlots = Array.from({ length: 12 }, (_, index) => ({
    deckIndex: index,
    deckNumber: index + 1,
    mainCount: index === 5 ? 40 : 0,
    exCount: index === 5 ? 3 : 0,
  }));
  const choices = projectQuickDeckChoices({
    slotIndices: [5, 0, 9],
    deckSlots,
    selectedDeckIndex: 5,
  });
  assert.deepEqual(choices, [
    { quickNumber: 1, deckIndex: 5, deckNumber: 6, selected: true, mainCount: 40, exCount: 3 },
    { quickNumber: 2, deckIndex: 0, deckNumber: 1, selected: false, mainCount: 0, exCount: 0 },
    { quickNumber: 3, deckIndex: 9, deckNumber: 10, selected: false, mainCount: 0, exCount: 0 },
  ]);
});
