import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RESULT_PRESENTATION_CORE,
  applyResultPresentationEvent,
  applyResultPresentationInput,
  createResultPresentation,
  projectResultCharacterState,
  projectResultPresentation,
  projectResultRankPresentation
} from '../browser/result-presentation-core.mjs';

const finalizedResult = Object.freeze({
  grade: 2,
  headline: '結果',
  ranking: [{ playerId: 'P2', rank: 1 }, { playerId: 'P1', rank: 2 }],
  points: { earned: 137, quick: 25, after: 9001 },
  opaqueUpstreamToken: 'do-not-recompute'
});

function makeState(options = {}) {
  return createResultPresentation({
    presentationId: 'RESULT-1',
    finalizedResult,
    assets: { character: true, rankEmblem: false, rewardVisual: false },
    ...options
  });
}

function event(state, type, sequence, eventId = `${type}-${sequence}`) {
  return { presentationId: state.presentationId, type, sequence, eventId };
}

test('normal presentation advances enter -> reveal -> settled -> exit without mutating finalized result', () => {
  const sourceBefore = JSON.stringify(finalizedResult);
  let state = makeState();
  assert.equal(RESULT_PRESENTATION_CORE.schema, 'GAMEROAD_RESULT_PRESENTATION_V1');
  assert.equal(state.stage, 'enter');
  for (const [type, expected] of [['REVEAL', 'reveal'], ['SETTLE', 'settled'], ['EXIT', 'exit']]) {
    const outcome = applyResultPresentationEvent(state, event(state, type, state.sequence + 1));
    assert.equal(outcome.accepted, true);
    assert.equal(outcome.duplicate, false);
    state = outcome.state;
    assert.equal(state.stage, expected);
  }
  assert.equal(JSON.stringify(finalizedResult), sourceBefore);
  assert.deepEqual(projectResultPresentation(state).finalizedResult, finalizedResult);
  assert.equal(Object.isFrozen(state), true);
});

test('corrected Result rank projection uses exact visible labels and semantic color roles', () => {
  assert.deepEqual(projectResultRankPresentation(1), {
    ok: true,
    reason: 'OK',
    formalRank: 1,
    visibleLabel: '1位',
    rankColorRole: null
  });
  assert.deepEqual(projectResultRankPresentation(2), {
    ok: true,
    reason: 'OK',
    formalRank: 2,
    visibleLabel: '勝利',
    rankColorRole: 'platinum'
  });
  assert.deepEqual(projectResultRankPresentation(3), {
    ok: true,
    reason: 'OK',
    formalRank: 3,
    visibleLabel: '勝利',
    rankColorRole: 'gold'
  });
  assert.deepEqual(projectResultRankPresentation(4), {
    ok: true,
    reason: 'OK',
    formalRank: 4,
    visibleLabel: '勝利',
    rankColorRole: 'silver'
  });
});

test('all valid formal ranks project the existing non-defeat Result character state', () => {
  for (const rank of [1, 2, 3, 4]) assert.equal(projectResultCharacterState(rank), 'joy');
  for (const rank of [undefined, null, 0, 5, 1.5, '2']) assert.equal(projectResultCharacterState(rank), null);
});

test('ties reuse the same higher formal rank presentation without inventing a second ranking rule', () => {
  const tiedResult = {
    ranking: [
      { playerId: 'P1', rank: 1 },
      { playerId: 'P2', rank: 2 },
      { playerId: 'P3', rank: 2 },
      { playerId: 'P4', rank: 4 }
    ]
  };
  const projected = projectResultPresentation(createResultPresentation({
    presentationId: 'TIED',
    finalizedResult: tiedResult
  }));
  assert.deepEqual(projected.rankingPresentation, [
    { sourceIndex: 0, playerId: 'P1', ok: true, reason: 'OK', formalRank: 1, visibleLabel: '1位', rankColorRole: null },
    { sourceIndex: 1, playerId: 'P2', ok: true, reason: 'OK', formalRank: 2, visibleLabel: '勝利', rankColorRole: 'platinum' },
    { sourceIndex: 2, playerId: 'P3', ok: true, reason: 'OK', formalRank: 2, visibleLabel: '勝利', rankColorRole: 'platinum' },
    { sourceIndex: 3, playerId: 'P4', ok: true, reason: 'OK', formalRank: 4, visibleLabel: '勝利', rankColorRole: 'silver' }
  ]);
  assert.deepEqual(projected.finalizedResult, tiedResult);
});

test('missing or invalid formal rank fails closed instead of guessing a visible rank color', () => {
  for (const rank of [undefined, null, 0, 5, 1.5, '2']) {
    assert.deepEqual(projectResultRankPresentation(rank), {
      ok: false,
      reason: 'FORMAL_RANK_INVALID',
      formalRank: null,
      visibleLabel: null,
      rankColorRole: null
    });
  }
});

test('skip goes directly to settled and still requires an explicit exit', () => {
  let state = makeState();
  const skipped = applyResultPresentationEvent(state, event(state, 'SKIP', 1, 'skip-1'));
  assert.equal(skipped.state.stage, 'settled');
  const exited = applyResultPresentationEvent(skipped.state, event(skipped.state, 'EXIT', 2, 'exit-2'));
  assert.equal(exited.state.stage, 'exit');
});

test('reduced motion and low-performance mode disable motion/particles without altering result payload', () => {
  for (const options of [{ reducedMotion: true }, { lowPerf: true }, { reducedMotion: true, lowPerf: true }]) {
    const state = makeState(options);
    const projected = projectResultPresentation(state);
    assert.deepEqual(projected.effects, { motion: 'instant', particles: 'disabled' });
    assert.deepEqual(projected.finalizedResult, finalizedResult);
  }
  assert.deepEqual(projectResultPresentation(makeState()).effects, { motion: 'enabled', particles: 'enabled' });
});

test('missing formal visual slots remain explicit fallbacks instead of fabricated assets', () => {
  const projected = projectResultPresentation(makeState());
  assert.deepEqual(projected.assets, {
    character: 'available',
    rankEmblem: 'fallback',
    rewardVisual: 'fallback'
  });
});

test('same event id is idempotent and does not advance twice', () => {
  const initial = makeState();
  const first = applyResultPresentationEvent(initial, event(initial, 'REVEAL', 1, 'evt-1'));
  const duplicate = applyResultPresentationEvent(first.state, {
    presentationId: 'RESULT-1', type: 'REVEAL', sequence: 2, eventId: 'evt-1'
  });
  assert.equal(duplicate.accepted, true);
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.state, first.state);
  assert.equal(duplicate.state.sequence, 1);
  assert.equal(duplicate.state.stage, 'reveal');
});

test('duplicate event id cannot bypass presentation identity validation', () => {
  const initial = makeState();
  const first = applyResultPresentationEvent(initial, event(initial, 'REVEAL', 1, 'evt-shared'));
  const forged = applyResultPresentationEvent(first.state, {
    presentationId: 'OTHER', type: 'SETTLE', sequence: 2, eventId: 'evt-shared'
  });
  assert.equal(forged.accepted, false);
  assert.equal(forged.duplicate, false);
  assert.equal(forged.reason, 'PRESENTATION_ID_MISMATCH');
  assert.equal(forged.state, first.state);
});

test('stale, gap, identity mismatch, and late-stage events fail closed without state mutation', () => {
  const entered = makeState();
  const revealed = applyResultPresentationEvent(entered, event(entered, 'REVEAL', 1, 'reveal-1')).state;
  const cases = [
    [{ presentationId: 'RESULT-1', type: 'SETTLE', sequence: 1, eventId: 'stale' }, 'STALE_EVENT'],
    [{ presentationId: 'RESULT-1', type: 'SETTLE', sequence: 3, eventId: 'gap' }, 'SEQUENCE_GAP'],
    [{ presentationId: 'OTHER', type: 'SETTLE', sequence: 2, eventId: 'wrong-id' }, 'PRESENTATION_ID_MISMATCH'],
    [{ presentationId: 'RESULT-1', type: 'EXIT', sequence: 2, eventId: 'late-stage' }, 'STAGE_MISMATCH']
  ];
  for (const [input, reason] of cases) {
    const outcome = applyResultPresentationEvent(revealed, input);
    assert.equal(outcome.accepted, false);
    assert.equal(outcome.reason, reason);
    assert.equal(outcome.state, revealed);
  }
});

test('module treats ranking/reward payload as opaque finalized upstream truth', () => {
  const weird = {
    grade: 999,
    ranking: [{ rank: 44, depth: -100 }],
    points: { earned: -123456 },
    futureField: { anything: ['is', 'preserved'] }
  };
  const state = createResultPresentation({ presentationId: 'OPAQUE', finalizedResult: weird });
  const projected = projectResultPresentation(state);
  assert.deepEqual(projected.finalizedResult, weird);
  assert.notEqual(projected.finalizedResult, weird);
  assert.equal(JSON.stringify(weird), JSON.stringify(projected.finalizedResult));
  assert.deepEqual(projected.rankingPresentation, [{
    sourceIndex: 0,
    playerId: null,
    ok: false,
    reason: 'FORMAL_RANK_INVALID',
    formalRank: null,
    visibleLabel: null,
    rankColorRole: null
  }]);
});

test('live input owns presentation identity and sequencing while caller supplies only presentation action', () => {
  let state = makeState();
  const sourceBefore = JSON.stringify(finalizedResult);
  const reveal = applyResultPresentationInput(state, {
    type: 'REVEAL',
    eventId: 'live-reveal',
    presentationId: 'FORGED',
    sequence: 999
  });
  assert.equal(reveal.accepted, true);
  assert.equal(reveal.state.presentationId, 'RESULT-1');
  assert.equal(reveal.state.sequence, 1);
  assert.equal(reveal.state.stage, 'reveal');
  state = reveal.state;

  const settle = applyResultPresentationInput(state, { type: 'SETTLE', eventId: 'live-settle' });
  assert.equal(settle.accepted, true);
  assert.equal(settle.state.sequence, 2);
  assert.equal(settle.state.stage, 'settled');
  assert.equal(JSON.stringify(finalizedResult), sourceBefore);
  assert.deepEqual(projectResultPresentation(settle.state).finalizedResult, finalizedResult);
});

test('live input preserves event-id idempotency without allowing a duplicate to consume sequence', () => {
  const initial = makeState();
  const first = applyResultPresentationInput(initial, { type: 'REVEAL', eventId: 'live-dup' });
  const duplicate = applyResultPresentationInput(first.state, { type: 'SETTLE', eventId: 'live-dup' });
  assert.equal(duplicate.accepted, true);
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.state, first.state);
  assert.equal(duplicate.state.sequence, 1);
  assert.equal(duplicate.state.stage, 'reveal');
});

test('live input fails closed for invalid input and illegal stage transitions without mutating state', () => {
  const state = makeState();
  const invalid = applyResultPresentationInput(state, null);
  assert.equal(invalid.accepted, false);
  assert.equal(invalid.reason, 'EVENT_INVALID');
  assert.equal(invalid.state, state);

  const illegal = applyResultPresentationInput(state, { type: 'EXIT', eventId: 'too-early' });
  assert.equal(illegal.accepted, false);
  assert.equal(illegal.reason, 'STAGE_MISMATCH');
  assert.equal(illegal.state, state);
  assert.deepEqual(projectResultPresentation(state).finalizedResult, finalizedResult);
});
