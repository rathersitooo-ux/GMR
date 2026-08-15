import test from 'node:test';
import assert from 'node:assert/strict';

import {
  GACHA_PRESENTATION_SCHEMA,
  applyGachaPresentationEvent,
  createGachaPresentation,
  projectGachaPresentation,
  restoreGachaPresentation,
  snapshotGachaPresentation,
} from '../browser/gacha-presentation-core.mjs';

const makeBundle = () => [
  { slot: 1, kind: 'card', cardId: 'CARD_A', rarity: 'common' },
  { slot: 2, kind: 'card', cardId: 'CARD_B', rarity: 'rare' },
  { slot: 3, kind: 'ticket', ticketId: 'TICKET_C' },
];

function create(overrides = {}) {
  return createGachaPresentation({
    presentationId: 'presentation-001',
    resultIdentity: 'server-confirmed-result-001',
    resultBundle: makeBundle(),
    assets: { character: 'formal', video: 'formal' },
    ...overrides,
  });
}

function event(state, eventId, type, extra = {}) {
  return applyGachaPresentationEvent(state, {
    presentationId: state.presentationId,
    resultIdentity: state.resultIdentity,
    eventId,
    sequence: state.sequence + 1,
    type,
    ...extra,
  });
}

function bundleJson(state) {
  return JSON.stringify(state.resultBundle);
}

test('requires a server-confirmed opaque ordered result bundle and freezes an independent copy', () => {
  const input = makeBundle();
  const state = create({ resultBundle: input });

  assert.equal(state.schema, GACHA_PRESENTATION_SCHEMA);
  assert.equal(state.stage, 'idle');
  assert.equal(state.revealIndex, -1);
  assert.equal(state.viewIndex, -1);
  assert.equal(state.effects.motion, 'full');
  assert.equal(state.effects.video, 'enabled');
  assert.equal(state.assets.character, 'formal');
  assert.equal(state.assets.video, 'formal');
  assert.ok(Object.isFrozen(state));
  assert.ok(Object.isFrozen(state.resultBundle));
  assert.ok(Object.isFrozen(state.resultBundle[0]));

  input[0].cardId = 'MUTATED_AFTER_CREATE';
  input.push({ slot: 4, kind: 'card', cardId: 'EXTRA' });
  assert.equal(state.resultBundle.length, 3);
  assert.equal(state.resultBundle[0].cardId, 'CARD_A');

  assert.throws(() => create({ resultBundle: [] }), /non-empty ordered array/);
  assert.throws(() => create({ resultIdentity: '' }), /resultIdentity/);
});

test('normal presentation advances only through presentation states and preserves confirmed order', () => {
  let state = create();
  const confirmed = bundleJson(state);

  state = event(state, 'e1', 'START');
  assert.equal(state.stage, 'pre_shot');
  assert.equal(state.revealIndex, -1);

  state = event(state, 'e2', 'REVEAL_NEXT');
  assert.equal(state.stage, 'reveal');
  assert.equal(state.revealIndex, 0);
  assert.equal(state.viewIndex, 0);
  assert.equal(projectGachaPresentation(state).currentResult.cardId, 'CARD_A');

  state = event(state, 'e3', 'REVEAL_NEXT');
  assert.equal(state.revealIndex, 1);
  assert.equal(projectGachaPresentation(state).currentResult.cardId, 'CARD_B');

  state = event(state, 'e4', 'REVEAL_NEXT');
  assert.equal(state.revealIndex, 2);
  assert.equal(projectGachaPresentation(state).currentResult.ticketId, 'TICKET_C');

  state = event(state, 'e5', 'COMPLETE');
  assert.equal(state.stage, 'completed');
  assert.equal(state.revealIndex, 2);
  assert.equal(bundleJson(state), confirmed);
  assert.deepEqual(projectGachaPresentation(state).revealedResults, makeBundle());
  assert.throws(() => event(state, 'e6', 'REVEAL_NEXT'), /invalid from completed/);
});

test('pause freezes the reveal and resume continues from the same card without result mutation', () => {
  let state = create();
  state = event(state, 'e1', 'START');
  state = event(state, 'e2', 'REVEAL_NEXT');
  state = event(state, 'e3', 'REVEAL_NEXT');
  const before = bundleJson(state);
  const index = state.revealIndex;
  const view = state.viewIndex;

  state = event(state, 'e4', 'PAUSE');
  assert.equal(state.stage, 'paused');
  assert.equal(state.revealIndex, index);
  assert.equal(state.viewIndex, view);
  assert.equal(state.pausedFrom, 'reveal');

  state = event(state, 'e5', 'RESUME');
  assert.equal(state.stage, 'reveal');
  assert.equal(state.revealIndex, index);
  assert.equal(state.viewIndex, view);
  assert.equal(state.pausedFrom, null);
  assert.equal(bundleJson(state), before);
});

test('tap and swipe navigation can inspect only revealed items and never reveal, reorder, or replace results', () => {
  let state = create();
  state = event(state, 'e1', 'START');
  state = event(state, 'e2', 'REVEAL_NEXT');
  state = event(state, 'e3', 'REVEAL_NEXT');
  const before = bundleJson(state);
  const revealIndex = state.revealIndex;

  state = event(state, 'e4', 'VIEW', { source: 'swipe', targetIndex: 0 });
  assert.equal(state.viewIndex, 0);
  assert.equal(state.revealIndex, revealIndex);
  assert.equal(projectGachaPresentation(state).currentResult.cardId, 'CARD_A');

  state = event(state, 'e5', 'VIEW', { source: 'tap', targetIndex: 1 });
  assert.equal(state.viewIndex, 1);
  assert.equal(state.revealIndex, revealIndex);
  assert.equal(bundleJson(state), before);

  assert.throws(
    () => event(state, 'e6', 'VIEW', { source: 'tap', targetIndex: 2 }),
    /unrevealed/,
  );
  assert.throws(
    () => event(state, 'e6b', 'VIEW', { source: 'keyboard', targetIndex: 0 }),
    /tap or swipe/,
  );
});

test('skip exposes the same immutable confirmed bundle in the same order', () => {
  let state = create();
  const confirmed = bundleJson(state);
  state = event(state, 'e1', 'START');
  state = event(state, 'e2', 'REVEAL_NEXT');
  state = event(state, 'e3', 'PAUSE');
  state = event(state, 'e4', 'SKIP');

  assert.equal(state.stage, 'completed');
  assert.equal(state.revealIndex, 2);
  assert.equal(state.viewIndex, 2);
  assert.equal(bundleJson(state), confirmed);
  assert.deepEqual(projectGachaPresentation(state).revealedResults, makeBundle());
});

test('reduced-motion and low-performance fallbacks remove long motion without losing result information', () => {
  const reduced = create({ reducedMotion: true, assets: { character: 'formal', video: 'formal' } });
  assert.deepEqual(reduced.effects, { motion: 'still', video: 'disabled' });
  assert.equal(projectGachaPresentation(reduced).resultCount, 3);

  const low = create({ lowPerf: true, assets: { character: 'formal', video: 'formal' } });
  assert.deepEqual(low.effects, { motion: 'short_fade', video: 'disabled' });
  assert.equal(projectGachaPresentation(low).resultCount, 3);

  const missing = create({ assets: {} });
  assert.deepEqual(missing.assets, { character: 'fallback', video: 'fallback' });
  assert.deepEqual(missing.effects, { motion: 'full', video: 'fallback' });
  assert.deepEqual(missing.resultBundle, makeBundle());
});

test('duplicate events are idempotent while stale, gap, presentation, and result identity mismatches fail closed', () => {
  let state = create();
  state = event(state, 'e1', 'START');
  const started = state;

  const duplicate = applyGachaPresentationEvent(state, {
    presentationId: state.presentationId,
    resultIdentity: state.resultIdentity,
    eventId: 'e1',
    sequence: 1,
    type: 'START',
  });
  assert.equal(duplicate, started);

  assert.throws(() => applyGachaPresentationEvent(state, {
    presentationId: state.presentationId,
    resultIdentity: state.resultIdentity,
    eventId: 'stale',
    sequence: 1,
    type: 'REVEAL_NEXT',
  }), /stale/);

  assert.throws(() => applyGachaPresentationEvent(state, {
    presentationId: state.presentationId,
    resultIdentity: state.resultIdentity,
    eventId: 'gap',
    sequence: 3,
    type: 'REVEAL_NEXT',
  }), /gap/);

  assert.throws(() => applyGachaPresentationEvent(state, {
    presentationId: 'different-presentation',
    resultIdentity: state.resultIdentity,
    eventId: 'wrong-presentation',
    sequence: 2,
    type: 'REVEAL_NEXT',
  }), /presentationId mismatch/);

  assert.throws(() => applyGachaPresentationEvent(state, {
    presentationId: state.presentationId,
    resultIdentity: 'different-result',
    eventId: 'wrong-result',
    sequence: 2,
    type: 'REVEAL_NEXT',
  }), /resultIdentity mismatch/);
});

test('snapshot restore accepts the exact confirmed identity and bundle, but rejects redraw or identity replacement', () => {
  let state = create();
  state = event(state, 'e1', 'START');
  state = event(state, 'e2', 'REVEAL_NEXT');
  state = event(state, 'e3', 'PAUSE');
  const snapshot = snapshotGachaPresentation(state);

  const restored = restoreGachaPresentation(snapshot, {
    presentationId: 'presentation-001',
    resultIdentity: 'server-confirmed-result-001',
    resultBundle: makeBundle(),
  });
  assert.deepEqual(restored, state);
  assert.ok(Object.isFrozen(restored));

  assert.throws(() => restoreGachaPresentation(snapshot, {
    presentationId: 'presentation-001',
    resultIdentity: 'server-confirmed-result-REPLACED',
    resultBundle: makeBundle(),
  }), /resultIdentity mismatch/);

  const redrawn = makeBundle();
  redrawn[1] = { slot: 2, kind: 'card', cardId: 'REDRAWN', rarity: 'ultimate' };
  assert.throws(() => restoreGachaPresentation(snapshot, {
    presentationId: 'presentation-001',
    resultIdentity: 'server-confirmed-result-001',
    resultBundle: redrawn,
  }), /result bundle mismatch/);
});

test('invalid state transitions fail closed instead of silently skipping required presentation state', () => {
  let state = create();
  assert.throws(() => event(state, 'e1', 'REVEAL_NEXT'), /invalid from idle/);
  assert.throws(() => event(state, 'e1b', 'PAUSE'), /invalid from idle/);

  state = event(state, 'e1', 'START');
  assert.throws(() => event(state, 'e2', 'COMPLETE'), /requires the final result item/);

  state = event(state, 'e2', 'REVEAL_NEXT');
  assert.throws(() => event(state, 'e3', 'COMPLETE'), /requires the final result item/);
});
