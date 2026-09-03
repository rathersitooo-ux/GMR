import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_DECK_SWIPE_PRESENTATION,
  DECK_SWIPE_PRESENTATION_EVENTS,
  DECK_SWIPE_SFX_CUES,
  normalizeDeckSwipeRect,
  createDeckSwipeFlightPlan,
  createDeckSwipeRejectPlan,
  createDeckSwipeFeedbackDetail,
  createDeckSwipePresentationController,
  createDeckSwipeSfxPlayer,
  isNeutralizedDeckEditorSwipe,
  presentDeckAddSwipe,
} from '../browser/cards-deck-presentation.mjs';

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
  return {
    classList: fakeClassList(),
    style: { setProperty() {} },
    children: [],
    getBoundingClientRect: () => box,
    appendChild(child) { this.children.push(child); return child; },
    cloneNode() { return fakeElement(box); },
    setAttribute() {},
    removeAttribute() {},
    remove() { this.removed = true; },
  };
}

function fakeDocument() {
  const events = [];
  const body = fakeElement();
  const head = fakeElement();
  return {
    events,
    body,
    head,
    createElement(tag) {
      const el = fakeElement();
      el.tagName = tag.toUpperCase();
      el.textContent = '';
      el.id = '';
      el.className = '';
      return el;
    },
    getElementById() { return null; },
    dispatchEvent(event) { events.push(event); return true; },
  };
}

class FakeCustomEvent {
  constructor(type, init = {}) { this.type = type; this.detail = init.detail; }
}

function immediateWindow({ reduced = false } = {}) {
  let next = 1;
  return {
    CustomEvent: FakeCustomEvent,
    matchMedia: () => ({ matches: reduced }),
    setTimeout(fn) { fn(); return next++; },
    clearTimeout() {},
  };
}

test('default visual contract is stable and frozen', () => {
  assert.equal(Object.isFrozen(DEFAULT_DECK_SWIPE_PRESENTATION), true);
  assert.equal(DEFAULT_DECK_SWIPE_PRESENTATION.flightMs, 220);
  assert.equal(DEFAULT_DECK_SWIPE_PRESENTATION.streakCount, 2);
  assert.deepEqual(DECK_SWIPE_PRESENTATION_EVENTS, {
    COMMIT: 'gameroad:deck-swipe-commit',
    LAND: 'gameroad:deck-swipe-land',
    REJECT: 'gameroad:deck-swipe-reject',
  });
});

test('live Deck add binding reuses inserted slot as the existing presentation landing', () => {
  const source = fakeElement();
  const target = fakeElement();
  target.dataset = { id: 'c7' };
  const deck = fakeElement();
  target.closest = () => deck;
  const calls = [];
  const doc = {
    querySelectorAll(selector) {
      return selector === '#deckSlots [data-id], #exDeckSlots [data-id]' ? [target] : [];
    },
    querySelector() { return deck; },
  };
  const presentation = {
    playSuccess(payload) { calls.push(['success', payload]); },
    playReject(payload) { calls.push(['reject', payload]); },
  };

  assert.equal(presentDeckAddSwipe({
    doc,
    presentation,
    result: { ok: true, action: 'deck-add' },
    sourceElement: source,
    cardId: 'c7',
  }), true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'success');
  assert.equal(calls[0][1].sourceElement, source);
  assert.equal(calls[0][1].targetElement, deck);
  assert.equal(calls[0][1].insertedElement, target);
});

test('live Deck add binding rejects without fake landing and presentation failures stay non-fatal', () => {
  const source = fakeElement();
  const deck = fakeElement();
  const calls = [];
  const doc = { querySelectorAll: () => [], querySelector: () => deck };
  assert.equal(presentDeckAddSwipe({
    doc,
    presentation: { playReject(payload) { calls.push(payload); } },
    result: { ok: false, action: 'deck-add', reason: 'deck-rule-rejected' },
    sourceElement: source,
    cardId: 'c9',
  }), true);
  assert.equal(calls[0].reason, 'deck-rule-rejected');
  assert.equal(presentDeckAddSwipe({
    doc,
    presentation: { playSuccess() { throw new Error('visual-only failure'); } },
    result: { ok: true, action: 'deck-add' },
    sourceElement: source,
    cardId: 'c9',
  }), false);
});

test('neutralized card left-swipe is explicitly recognized for follow-up click suppression', () => {
  assert.equal(isNeutralizedDeckEditorSwipe({ action: 'none', consumed: true }), true);
  assert.equal(isNeutralizedDeckEditorSwipe({ action: 'none' }), false);
  assert.equal(isNeutralizedDeckEditorSwipe({ action: 'deck-add', consumed: true }), false);
});

test('rect normalization preserves usable centers without trusting right/bottom', () => {
  const value = normalizeDeckSwipeRect(rect(20, 30, 100, 140));
  assert.deepEqual(value, {
    left: 20, top: 30, width: 100, height: 140,
    right: 120, bottom: 170, centerX: 70, centerY: 100,
  });
});

test('success plan flies source toward deck and keeps semantic landing feedback', () => {
  const plan = createDeckSwipeFlightPlan({
    sourceRect: rect(40, 400, 120, 168),
    targetRect: rect(730, 120, 180, 250),
  });
  assert.equal(plan.kind, 'success');
  assert.equal(plan.flightMs, 220);
  assert.equal(plan.streakCount, 2);
  assert.ok(plan.dx > 0);
  assert.ok(plan.dy < 0);
  assert.ok(plan.arcY < 0);
  assert.equal(plan.preserveSemanticFeedback, true);
});

test('reduced motion removes flight and streaks but keeps deck/count/recent feedback', () => {
  const plan = createDeckSwipeFlightPlan({
    sourceRect: rect(0, 0, 100, 140),
    targetRect: rect(500, 100, 180, 250),
    reducedMotion: true,
  });
  assert.equal(plan.flightMs, 0);
  assert.equal(plan.streakCount, 0);
  assert.equal(plan.landingPulseMs, 260);
  assert.equal(plan.countPulseMs, 280);
  assert.equal(plan.recentAddMs, 620);
  assert.equal(plan.preserveSemanticFeedback, true);
});

test('reject plan never pretends a failed add flew into the deck', () => {
  const plan = createDeckSwipeRejectPlan({ reason: 'deck_full' });
  assert.deepEqual(plan, {
    kind: 'reject',
    reason: 'deck_full',
    reducedMotion: false,
    recoilMs: 240,
    preserveSemanticFeedback: true,
  });
});

test('event detail separates commit, land and reject phases', () => {
  assert.deepEqual(createDeckSwipeFeedbackDetail({ phase: 'land', cardId: 17 }), {
    phase: 'land', cardId: '17', reason: null, reducedMotion: false,
  });
  assert.throws(() => createDeckSwipeFeedbackDetail({ phase: 'unknown' }), /PHASE_INVALID/);
});

test('invalid geometry/configuration fails closed', () => {
  assert.throws(
    () => createDeckSwipeFlightPlan({ sourceRect: rect(0, 0, 0, 10), targetRect: rect(1, 1, 10, 10) }),
    /SOURCE_RECT_WIDTH_INVALID/,
  );
  assert.throws(
    () => createDeckSwipeFlightPlan({
      sourceRect: rect(0, 0, 10, 10), targetRect: rect(10, 10, 10, 10), config: { streakCount: 9 },
    }),
    /STREAK_COUNT_INVALID/,
  );
});

test('reduced controller emits commit then land and exposes SFX hooks without owning audio', () => {
  const doc = fakeDocument();
  const order = [];
  const controller = createDeckSwipePresentationController({
    document: doc,
    window: immediateWindow({ reduced: true }),
    reducedMotion: true,
    onCommitSfx: (detail) => order.push(`sfx:${detail.phase}`),
    onLandSfx: (detail) => order.push(`sfx:${detail.phase}`),
  });
  const source = fakeElement(rect(10, 300, 100, 140));
  const target = fakeElement(rect(500, 40, 180, 240));
  const count = fakeElement();
  const inserted = fakeElement();
  const result = controller.playSuccess({ sourceElement: source, targetElement: target, countElement: count, insertedElement: inserted, cardId: 'c7' });

  assert.equal(result.plan.reducedMotion, true);
  assert.deepEqual(doc.events.map((event) => event.type), [
    'gameroad:deck-swipe-commit',
    'gameroad:deck-swipe-land',
  ]);
  assert.deepEqual(order, ['sfx:commit', 'sfx:land']);
});

test('reject controller emits reject only and never a land event', () => {
  const doc = fakeDocument();
  const hook = [];
  const controller = createDeckSwipePresentationController({
    document: doc,
    window: immediateWindow({ reduced: false }),
    onRejectSfx: (detail) => hook.push(detail.reason),
  });
  controller.playReject({ sourceElement: fakeElement(), targetElement: fakeElement(), cardId: 'c9', reason: 'duplicate' });
  assert.deepEqual(doc.events.map((event) => event.type), ['gameroad:deck-swipe-reject']);
  assert.deepEqual(hook, ['duplicate']);
});

test('local SFX contract supplies distinct commit, land and reject cues without assets', () => {
  assert.equal(Object.isFrozen(DECK_SWIPE_SFX_CUES), true);
  assert.equal(DECK_SWIPE_SFX_CUES.commit.kind, 'noise');
  assert.equal(DECK_SWIPE_SFX_CUES.land.kind, 'tone');
  assert.ok(DECK_SWIPE_SFX_CUES.land.endHz > DECK_SWIPE_SFX_CUES.land.startHz);
  assert.ok(DECK_SWIPE_SFX_CUES.reject.endHz < DECK_SWIPE_SFX_CUES.reject.startHz);
});

function fakeAudioParam() {
  const calls = [];
  return {
    calls,
    setValueAtTime: (...args) => calls.push(['set', ...args]),
    linearRampToValueAtTime: (...args) => calls.push(['linear', ...args]),
    exponentialRampToValueAtTime: (...args) => calls.push(['exp', ...args]),
    cancelScheduledValues: (...args) => calls.push(['cancel', ...args]),
  };
}

class FakeAudioContext {
  constructor() {
    FakeAudioContext.instances += 1;
    this.currentTime = 2;
    this.sampleRate = 48000;
    this.state = 'running';
    this.destination = {};
    this.oscillators = [];
    this.bufferSources = [];
  }
  createGain() { return { gain: fakeAudioParam(), connect() {} }; }
  createOscillator() {
    const node = { frequency: fakeAudioParam(), connect() {}, start() { this.started = true; }, stop() { this.stopped = true; } };
    this.oscillators.push(node);
    return node;
  }
  createBuffer(_channels, frames) { return { getChannelData: () => new Float32Array(frames) }; }
  createBufferSource() {
    const node = { connect() {}, start() { this.started = true; }, stop() { this.stopped = true; } };
    this.bufferSources.push(node);
    return node;
  }
  createBiquadFilter() { return { Q: fakeAudioParam(), frequency: fakeAudioParam(), connect() {} }; }
  close() { this.closed = true; }
}
FakeAudioContext.instances = 0;

test('SFX player creates AudioContext lazily and plays asset-free whoosh/tone cues', () => {
  FakeAudioContext.instances = 0;
  const player = createDeckSwipeSfxPlayer({ window: { AudioContext: FakeAudioContext } });
  assert.equal(FakeAudioContext.instances, 0);
  assert.equal(player.playCommit(), true);
  assert.equal(FakeAudioContext.instances, 1);
  assert.equal(player.playLand(), true);
  assert.equal(player.playReject(), true);
  assert.equal(FakeAudioContext.instances, 1);
});

test('SFX player fails silent when audio is disabled or unavailable', () => {
  assert.equal(createDeckSwipeSfxPlayer({ window: {}, enabled: true }).playCommit(), false);
  assert.equal(createDeckSwipeSfxPlayer({ window: { AudioContext: FakeAudioContext }, enabled: false }).playLand(), false);
  assert.throws(() => createDeckSwipeSfxPlayer({ volume: 3 }), /SFX_VOLUME_INVALID/);
});

test('custom timings remain bounded by semantic contract', () => {
  const plan = createDeckSwipeFlightPlan({
    sourceRect: rect(0, 0, 100, 140),
    targetRect: rect(400, 0, 100, 140),
    config: { flightMs: 180, landingPulseMs: 200, countPulseMs: 220, recentAddMs: 500, streakCount: 1 },
  });
  assert.equal(plan.flightMs, 180);
  assert.equal(plan.landingPulseMs, 200);
  assert.equal(plan.countPulseMs, 220);
  assert.equal(plan.recentAddMs, 500);
  assert.equal(plan.streakCount, 1);
});

function localSkinPngHeader(width, height) {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

test('Cards local skin contract is local-only and preserves canonical identity', async () => {
  const mod = await import('../browser/cards-deck-presentation.mjs');
  assert.equal(mod.FANART_LOCAL_SKIN_CONTRACT.localOnly, true);
  assert.equal(mod.FANART_LOCAL_SKIN_CONTRACT.canonicalIdentityPreserved, true);
  assert.equal(mod.FANART_LOCAL_SKIN_CONTRACT.networkSync, false);
  assert.equal(mod.FANART_LOCAL_SKIN_CONTRACT.rankedStateMutation, false);
  assert.equal(mod.FANART_LOCAL_SKIN_CONTRACT.dbName, 'gameroad_local_card_creator_v1');
  assert.equal(mod.normalizeLocalSkinCardId('SP_A'), 'SP_A');
  assert.equal(mod.normalizeLocalSkinCardId(' SP_A'), null);
});

test('Cards local skin source validation retains bounded PNG safety envelope', async () => {
  const mod = await import('../browser/cards-deck-presentation.mjs');
  const bytes = localSkinPngHeader(1200, 1600);
  assert.deepEqual(mod.inspectLocalSkinImageHeader(bytes), { type: 'image/png', width: 1200, height: 1600 });
  assert.deepEqual(mod.validateLocalSkinSource({ bytes, size: bytes.length }), { ok: true, type: 'image/png', width: 1200, height: 1600 });
  assert.equal(mod.validateLocalSkinSource({ bytes: localSkinPngHeader(5001, 1), size: 24 }).reason, 'SOURCE_DIMENSIONS');
  assert.equal(mod.validateLocalSkinSource({ bytes, size: mod.FANART_LOCAL_SKIN_CONTRACT.maxSourceBytes + 1 }).reason, 'SOURCE_SIZE');
});

test('Cards local skin consumer fails closed without a Cards document and has no transport fallback', async () => {
  const { readFile } = await import('node:fs/promises');
  const mod = await import('../browser/cards-deck-presentation.mjs');
  const installation = mod.installFanartLocalSkinCards({ document: null, window: null, indexedDB: null });
  assert.equal(typeof installation.destroy, 'function');
  assert.doesNotThrow(() => installation.destroy());
  const source = await readFile(new URL('../browser/cards-deck-presentation.mjs', import.meta.url), 'utf8');
  const localSkinSource = source.slice(source.indexOf("const FANART_DB_NAME = 'gameroad_local_card_creator_v1'"));
  assert.ok(localSkinSource.length > 0);
  for (const forbidden of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'localStorage', 'sessionStorage']) {
    assert.equal(localSkinSource.includes(forbidden), false, `forbidden transport/storage fallback: ${forbidden}`);
  }
});
