import test from 'node:test';
import assert from 'node:assert/strict';

import {
  GACHA_PRESENTATION_QUALITY_SCHEMA,
  GACHA_PRESENTATION_SCHEMA,
  applyGachaPresentationEvent,
  createGachaPresentation,
  projectGachaPresentation,
  projectGachaPresentationQuality,
  restoreGachaPresentation,
  snapshotGachaPresentation,
} from '../browser/gacha-presentation-core.mjs';

const makeBundle = () => [
  { slot: 1, kind: 'card', cardId: 'CARD_A', rarity: 'common' },
  { slot: 2, kind: 'card', cardId: 'CARD_B', rarity: 'rare' },
  { slot: 3, kind: 'ticket', ticketId: 'TICKET_C' },
];

const makeCurrentSevenResultBundle = () => [
  { slot: 1, label: 'Mana Wake', rank: '4', rarity: '希少' },
  { slot: 2, label: 'スペード6', rank: '6', rarity: '通常' },
  { slot: 3, label: 'クラブ3', rank: '3', rarity: '通常' },
  { slot: 4, label: 'クラブ5', rank: '5', rarity: '通常' },
  { slot: 5, label: 'ハート10', rank: '10', rarity: '通常' },
  { slot: 6, label: 'スペードK', rank: 'K', rarity: '通常' },
  { slot: 7, label: 'フローズン', rank: '1', rarity: '希少' },
];

const QUALITY_VIEWPORTS = [
  { name: 'desktop-1280x720', width: 1280, height: 720, expectedClass: 'wide' },
  { name: 'phone-390x844', width: 390, height: 844, expectedClass: 'portrait' },
  { name: 'short-landscape-667x375', width: 667, height: 375, expectedClass: 'short_landscape' },
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

function createCurrentSeven(overrides = {}) {
  return createGachaPresentation({
    presentationId: 'presentation-current-seven',
    resultIdentity: 'server-confirmed-current-seven',
    resultBundle: makeCurrentSevenResultBundle(),
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

function completeBySkip(state) {
  state = event(state, 'quality-start', 'START');
  return event(state, 'quality-skip', 'SKIP');
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
    presentationId: 'different-presentation',
    resultIdentity: state.resultIdentity,
    eventId: 'e1',
    sequence: 1,
    type: 'START',
  }), /presentationId mismatch/);

  assert.throws(() => applyGachaPresentationEvent(state, {
    presentationId: state.presentationId,
    resultIdentity: 'different-result',
    eventId: 'e1',
    sequence: 1,
    type: 'START',
  }), /resultIdentity mismatch/);

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

test('result-review quality projection promotes visible confirmed results above repeat-purchase context on all representative viewports', () => {
  const confirmed = makeCurrentSevenResultBundle();
  let state = createCurrentSeven();
  state = completeBySkip(state);

  for (const viewport of QUALITY_VIEWPORTS) {
    const quality = projectGachaPresentationQuality(state, { viewport });

    assert.equal(quality.schema, GACHA_PRESENTATION_QUALITY_SCHEMA, viewport.name);
    assert.equal(quality.viewport.class, viewport.expectedClass, viewport.name);
    assert.equal(quality.reviewingResults, true, viewport.name);
    assert.equal(quality.hierarchy.priorityOrder[0], 'selected_result', viewport.name);
    assert.equal(quality.hierarchy.confirmedResultCollection, 'secondary', viewport.name);
    assert.equal(quality.hierarchy.openAgain, 'secondary_action', viewport.name);
    assert.equal(quality.hierarchy.packOdds, 'collapsed_support', viewport.name);
    assert.deepEqual(quality.visibleResults, confirmed, viewport.name);
    assert.deepEqual(quality.selectedResult, confirmed[6], viewport.name);
    assert.equal(quality.invariants.resultTruthMutable, false, viewport.name);
    assert.equal(quality.invariants.resultOrderMutable, false, viewport.name);
    assert.equal(quality.invariants.inventedResultSignalsAllowed, false, viewport.name);
    assert.equal(quality.invariants.unrevealedResultsExposed, false, viewport.name);
  }
});

test('quality projection exposes only already-revealed results during anticipation', () => {
  const confirmed = makeCurrentSevenResultBundle();
  let state = createCurrentSeven();
  state = event(state, 'quality-reveal-start', 'START');

  let preShot = projectGachaPresentationQuality(state, { viewport: QUALITY_VIEWPORTS[1] });
  assert.deepEqual(preShot.visibleResults, []);
  assert.equal(preShot.selectedResult, null);
  assert.equal('resultBundle' in preShot, false);

  state = event(state, 'quality-reveal-first', 'REVEAL_NEXT');
  const firstReveal = projectGachaPresentationQuality(state, { viewport: QUALITY_VIEWPORTS[1] });
  assert.deepEqual(firstReveal.visibleResults, [confirmed[0]]);
  assert.deepEqual(firstReveal.selectedResult, confirmed[0]);
  assert.equal(firstReveal.resultCount, 7);
  assert.equal(firstReveal.invariants.unrevealedResultsExposed, false);
});

test('result selection and rarity stay readable through redundant non-color channels', () => {
  let state = createCurrentSeven();
  state = completeBySkip(state);
  const quality = projectGachaPresentationQuality(state, { viewport: QUALITY_VIEWPORTS[1] });

  assert.deepEqual(quality.channels.selection, ['outline', 'position', 'label']);
  assert.deepEqual(quality.channels.rarity, ['text', 'frame_weight']);
  assert.equal(quality.accessibility.selectionMeaningPreservedWithoutColor, true);
  assert.equal(quality.accessibility.rarityMeaningPreservedWithoutColor, true);
});

test('reduced-motion and low-performance result review retain hierarchy, selection, and result truth', () => {
  for (const accessibility of [
    { reducedMotion: true, expectedTransition: 'none' },
    { lowPerf: true, expectedTransition: 'short_fade' },
  ]) {
    let state = createCurrentSeven(accessibility);
    state = completeBySkip(state);

    for (const viewport of QUALITY_VIEWPORTS) {
      const quality = projectGachaPresentationQuality(state, { viewport });
      assert.equal(quality.motion.transition, accessibility.expectedTransition, viewport.name);
      assert.deepEqual(quality.motion.semanticFeedback, ['outline', 'position', 'label'], viewport.name);
      assert.equal(quality.accessibility.resultMeaningPreservedWithoutMotion, true, viewport.name);
      assert.equal(quality.hierarchy.packOdds, 'collapsed_support', viewport.name);
      assert.equal(quality.hierarchy.openAgain, 'secondary_action', viewport.name);
      assert.deepEqual(quality.visibleResults, makeCurrentSevenResultBundle(), viewport.name);
    }
  }
});

test('pre-shot quality projection does not expose result items and keeps open-pack ahead of odds', () => {
  let state = createCurrentSeven();
  state = event(state, 'pre-shot-start', 'START');
  const quality = projectGachaPresentationQuality(state, { viewport: QUALITY_VIEWPORTS[1] });

  assert.equal(quality.reviewingResults, false);
  assert.equal(quality.selectedResult, null);
  assert.deepEqual(quality.visibleResults, []);
  assert.equal('resultBundle' in quality, false);
  assert.deepEqual(quality.hierarchy.priorityOrder, ['pack_preview', 'open_pack', 'pack_odds']);
  assert.equal(quality.hierarchy.selectedResult, 'hidden');
  assert.equal(quality.layout.packMeta, 'primary');
});

test('quality projection fails closed for invalid viewport without mutating presentation state', () => {
  let state = createCurrentSeven();
  state = completeBySkip(state);
  const before = snapshotGachaPresentation(state);

  assert.throws(() => projectGachaPresentationQuality(state, {
    viewport: { width: 0, height: 844 },
  }), /viewport/);
  assert.deepEqual(snapshotGachaPresentation(state), before);
});
