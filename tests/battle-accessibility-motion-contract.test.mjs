import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BATTLE_JANKEN_ORDER_MOTION,
  auditBattleJankenOrderMotion,
  buildBattleJankenOrderMotion,
} from '../browser/battle-janken-order-motion-core.mjs';
import {
  auditBattleResolutionBoardReturnProjection,
  projectBattleResolutionBoardReturn,
} from '../browser/battle-resolution-board-return-presentation-core.mjs';
import {
  BATTLE_CAMERA_COMMANDS,
  BATTLE_CAMERA_MODES,
  applyBattleCameraCommand,
  createBattleCameraControlState,
} from '../browser/battle-camera-control-core.mjs';
import {
  BATTLE_CARD_RELEASE_FLIGHT_LOW_PERF_MAX_DURATION_MS,
  BATTLE_CARD_RELEASE_FLIGHT_MODE,
  projectBattleCardReleaseFlightMotion,
} from '../browser/battle-card-release-flight-motion-core.mjs';

function orderChain() {
  const processingOrder = ['P2', 'P1', 'P3', 'P4'];
  const cards = ['CARD-02', 'CARD-11', 'CARD-23', 'CARD-34'];
  return {
    processingOrder,
    orderSlots: processingOrder.map((playerId, sequenceIndex) => ({
      playerId,
      cardId: cards[sequenceIndex],
      displayNumber: [2, 11, 23, 34][sequenceIndex],
      hand: ['ROCK', 'PAPER', 'SCISSORS', 'ROCK'][sequenceIndex],
      sequenceIndex,
      receivesProcessingPass: sequenceIndex < 2,
      skipped: sequenceIndex === 2,
      finalState: ['resolved-win', 'invalidated', 'unresolved-final', 'unresolved-final'][sequenceIndex],
    })),
    sequenceEdges: processingOrder.slice(0, -1).map((fromPlayerId, sequenceIndex) => ({
      kind: 'sequence',
      fromPlayerId,
      toPlayerId: processingOrder[sequenceIndex + 1],
      sequenceIndex,
    })),
    frames: [
      {
        stepIndex: 0,
        currentPlayerId: 'P2',
        currentResolvedWinner: false,
        slots: [
          { playerId: 'P2', cardId: 'CARD-02', sequenceIndex: 0, visualState: 'current' },
          { playerId: 'P1', cardId: 'CARD-11', sequenceIndex: 1, visualState: 'pending' },
          { playerId: 'P3', cardId: 'CARD-23', sequenceIndex: 2, visualState: 'pending' },
          { playerId: 'P4', cardId: 'CARD-34', sequenceIndex: 3, visualState: 'pending' },
        ],
      },
      {
        stepIndex: 1,
        currentPlayerId: 'P1',
        currentResolvedWinner: true,
        slots: [
          { playerId: 'P2', cardId: 'CARD-02', sequenceIndex: 0, visualState: 'processed' },
          { playerId: 'P1', cardId: 'CARD-11', sequenceIndex: 1, visualState: 'current' },
          { playerId: 'P3', cardId: 'CARD-23', sequenceIndex: 2, visualState: 'invalidated' },
          { playerId: 'P4', cardId: 'CARD-34', sequenceIndex: 3, visualState: 'pending' },
        ],
      },
    ],
    finalSlots: [
      { playerId: 'P2', cardId: 'CARD-02', sequenceIndex: 0, visualState: 'resolved-win' },
      { playerId: 'P1', cardId: 'CARD-11', sequenceIndex: 1, visualState: 'invalidated' },
      { playerId: 'P3', cardId: 'CARD-23', sequenceIndex: 2, visualState: 'unresolved-final' },
      { playerId: 'P4', cardId: 'CARD-34', sequenceIndex: 3, visualState: 'unresolved-final' },
    ],
  };
}

function assertOrderMeaningPreserved(model) {
  assert.deepEqual(model.processingOrder, ['P2', 'P1', 'P3', 'P4']);
  assert.deepEqual(
    model.subjects.map(({ playerId, cardId }) => [playerId, cardId]),
    [
      ['P2', 'CARD-02'],
      ['P1', 'CARD-11'],
      ['P3', 'CARD-23'],
      ['P4', 'CARD-34'],
    ],
  );
  assert.deepEqual(
    model.finalSettle.map(({ playerId, cardId, sourceFinalState }) => [playerId, cardId, sourceFinalState]),
    [
      ['P2', 'CARD-02', 'resolved-win'],
      ['P1', 'CARD-11', 'invalidated'],
      ['P3', 'CARD-23', 'unresolved-final'],
      ['P4', 'CARD-34', 'unresolved-final'],
    ],
  );
  assert.equal(model.gameplayAuthority, false);
  assert.equal(model.gameStateWrite, false);
  assert.deepEqual(auditBattleJankenOrderMotion(model), { ok: true, defects: [] });
}

test('ReducedMotion and LowPerf keep janken processing order, physical card identity, skip state, and final meaning', () => {
  const reduced = buildBattleJankenOrderMotion({ chain: orderChain(), reducedMotion: true });
  const lowPerf = buildBattleJankenOrderMotion({ chain: orderChain(), lowPerf: true });

  for (const model of [reduced, lowPerf]) {
    assert.equal(model.schema, BATTLE_JANKEN_ORDER_MOTION.schema);
    assert.equal(model.motionMode, 'semantic-only');
    assertOrderMeaningPreserved(model);
    assert.equal(model.steps[0].slots[0].action, 'current-emphasis');
    assert.equal(model.steps[1].slots[2].action, 'invalidated-stay-skip');
    assert.equal(model.sequenceBuild[0].action, 'link-visible-static');
  }
});

test('ReducedMotion and LowPerf keep the accepted cause, route and committed Shield destination while removing motion emphasis', () => {
  const input = {
    boardReturn: {
      source: 'accepted_public_compound_attack_package',
      visualIntent: 'resolution_to_committed_shield',
      effectMutationClaimed: false,
      eventId: 'EV-17',
      cardId: 'CARD-11',
      jankenHand: 'PAPER',
      opponentId: 'P3',
      shieldLane: 'R',
      shieldRef: 'P3-SHIELD-R',
      destinationKey: 'P3:R',
      path: [{ cellId: 'ROAD-8' }, { cellId: 'ROAD-9' }],
      direction: 'FORWARD',
      roadId: 'ROAD-R',
      battleId: 'BATTLE-7',
    },
    orderChain: {
      processingOrder: ['P2', 'P1'],
      processedOrder: ['P2'],
      finalSlots: [
        { playerId: 'P2', cardId: 'CARD-02', displayNumber: 2, hand: 'ROCK', visualState: 'resolved-win' },
        { playerId: 'P1', cardId: 'CARD-11', displayNumber: 11, hand: 'PAPER', visualState: 'invalidated' },
      ],
    },
  };

  const reduced = projectBattleResolutionBoardReturn({ ...input, reducedMotion: true });
  const lowPerf = projectBattleResolutionBoardReturn({ ...input, lowPerf: true });

  for (const projection of [reduced, lowPerf]) {
    assert.equal(projection.motion.mode, 'static_causal_trace');
    assert.equal(projection.motion.animateAcceptedPath, false);
    assert.equal(projection.motion.animateProcessingCollapse, false);
    assert.equal(projection.motion.destinationSettlePulse, false);
    assert.equal(projection.motion.preserveStageOrder, true);
    assert.deepEqual(projection.sourceCard, { cardId: 'CARD-11', jankenHand: 'PAPER' });
    assert.deepEqual(projection.acceptedPath, [{ cellId: 'ROAD-8' }, { cellId: 'ROAD-9' }]);
    assert.deepEqual(projection.processing.processingOrder, ['P2', 'P1']);
    assert.equal(projection.destination.destinationKey, 'P3:R');
    assert.equal(projection.destination.shieldRef, 'P3-SHIELD-R');
    assert.deepEqual(projection.stages.map(({ kind }) => kind), [
      'cause', 'processing', 'accepted_resolution', 'return_path', 'destination',
    ]);
    assert.deepEqual(auditBattleResolutionBoardReturnProjection(projection), { ok: true, defects: [] });
  }
});

test('ReducedMotion/LowPerformance camera flags never remove manual inspect inputs or one-action controlled-character return', () => {
  let state = createBattleCameraControlState({
    controlledCharacterId: 'P1',
    controlledWorldPoint: { x: 40, y: 30 },
    followZoom: 1,
    followAngle: 0,
    limits: {
      x: { min: 0, max: 100 },
      y: { min: 0, max: 100 },
      zoom: { min: 0.5, max: 2 },
      angle: { min: -45, max: 45 },
    },
    reducedMotion: true,
    lowPerformance: true,
  });

  assert.equal(state.reducedMotion, true);
  assert.equal(state.lowPerformance, true);
  assert.equal(state.manualInspectionAvailable, true);
  assert.equal(state.oneActionReturnAvailable, true);
  assert.equal(state.screenSpaceUiAffected, false);

  state = applyBattleCameraCommand(state, { type: BATTLE_CAMERA_COMMANDS.BEGIN_MANUAL_INSPECT }).state;
  assert.equal(state.mode, BATTLE_CAMERA_MODES.MANUAL_INSPECT);
  state = applyBattleCameraCommand(state, { type: BATTLE_CAMERA_COMMANDS.PAN, dx: 15, dy: -10 }).state;
  state = applyBattleCameraCommand(state, { type: BATTLE_CAMERA_COMMANDS.SET_ZOOM, zoom: 1.6 }).state;
  state = applyBattleCameraCommand(state, { type: BATTLE_CAMERA_COMMANDS.SET_ANGLE, angle: 25 }).state;
  assert.deepEqual(state.center, { x: 55, y: 20 });
  assert.equal(state.zoom, 1.6);
  assert.equal(state.angle, 25);

  const returned = applyBattleCameraCommand(state, { type: BATTLE_CAMERA_COMMANDS.RETURN_TO_CONTROLLED });
  assert.equal(returned.ok, true);
  assert.equal(returned.reason, 'RETURNED_TO_CONTROLLED_CHARACTER');
  assert.equal(returned.state.mode, BATTLE_CAMERA_MODES.FOLLOW_CONTROLLED);
  assert.deepEqual(returned.state.center, { x: 40, y: 30 });
  assert.equal(returned.state.zoom, 1);
  assert.equal(returned.state.angle, 0);
});

test('ReducedMotion and LowPerf card release keep the exact destination identity while simplifying movement', () => {
  const start = { x: 12, y: 34 };
  const target = { x: 212, y: 134 };

  const reduced = projectBattleCardReleaseFlightMotion({
    start,
    target,
    role: 'top',
    reducedMotion: true,
  });
  assert.equal(reduced.mode, BATTLE_CARD_RELEASE_FLIGHT_MODE.REDUCED);
  assert.deepEqual(reduced.start, start);
  assert.deepEqual(reduced.target, target);
  assert.equal(reduced.spinDeg, 0);
  assert.equal(reduced.bendPx, 0);
  assert.deepEqual(reduced.destinationCue, {
    kind: 'DESTINATION_PULSE',
    x: target.x,
    y: target.y,
  });

  const lowPerf = projectBattleCardReleaseFlightMotion({
    start,
    target,
    role: 'bottom',
    lowPerf: true,
    durationMs: 999,
  });
  assert.equal(lowPerf.mode, BATTLE_CARD_RELEASE_FLIGHT_MODE.FULL);
  assert.equal(lowPerf.lowPerf, true);
  assert.deepEqual(lowPerf.start, start);
  assert.deepEqual(lowPerf.target, target);
  assert.equal(lowPerf.spinDeg, 0);
  assert.equal(lowPerf.bendPx, 0);
  assert.equal(lowPerf.durationMs, BATTLE_CARD_RELEASE_FLIGHT_LOW_PERF_MAX_DURATION_MS);
  assert.deepEqual(lowPerf.frames.at(-1), {
    offset: 1,
    x: target.x - start.x,
    y: target.y - start.y,
    rotationDeg: 0,
    scale: 0.33999999999999997,
    opacity: 0.5800000000000001,
    blurPx: 0,
    brightness: 1,
  });
});
