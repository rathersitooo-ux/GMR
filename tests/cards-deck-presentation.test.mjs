import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_DECK_SWIPE_PRESENTATION,
  DECK_SWIPE_PRESENTATION_EVENTS,
  normalizeDeckSwipeRect,
  createDeckSwipeFlightPlan,
  createDeckSwipeRejectPlan,
  createDeckSwipeFeedbackDetail,
  createDeckSwipePresentationController,
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
