import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBattleJankenOrderChain } from '../browser/battle-janken-order-chain-presentation-core.mjs';
import {
  BATTLE_JANKEN_ORDER_MOTION,
  auditBattleJankenOrderMotion,
  buildBattleJankenOrderMotion
} from '../browser/battle-janken-order-motion-core.mjs';

const PUBLIC_CARDS = [
  { playerId: 'p4', cardId: 'c4', displayNumber: 3, hand: 'gamma' },
  { playerId: 'p3', cardId: 'c3', displayNumber: 7, hand: 'gamma' },
  { playerId: 'p2', cardId: 'c2', displayNumber: 1, hand: 'beta' },
  { playerId: 'p1', cardId: 'c1', displayNumber: 9, hand: 'alpha' }
];

const RESOLUTION = {
  processingOrder: ['p1', 'p2', 'p3', 'p4'],
  resolvedWinners: ['p1'],
  unresolvedSurvivors: ['p3', 'p4'],
  invalidated: ['p2'],
  steps: [
    {
      processedPlayerId: 'p1',
      winningHand: 'alpha',
      resolvedWinner: true,
      invalidated: ['p2']
    },
    {
      processedPlayerId: 'p3',
      winningHand: 'gamma',
      resolvedWinner: false,
      invalidated: []
    },
    {
      processedPlayerId: 'p4',
      winningHand: 'gamma',
      resolvedWinner: false,
      invalidated: []
    }
  ]
};

function makeChain() {
  return buildBattleJankenOrderChain({ publicCards: PUBLIC_CARDS, resolution: RESOLUTION });
}

test('projects order-link establish -> current pop -> processed retreat without reordering authority', () => {
  const chain = makeChain();
  const motion = buildBattleJankenOrderMotion({ chain });

  assert.equal(motion.schema, 'gameroad.battle-janken-order-motion.v1');
  assert.equal(motion.motionMode, 'full');
  assert.deepEqual(motion.processingOrder, ['p1', 'p2', 'p3', 'p4']);
  assert.deepEqual(motion.subjects.map((subject) => subject.cardId), ['c1', 'c2', 'c3', 'c4']);
  assert.deepEqual(motion.sequenceBuild, [
    { phase: 'order-link-establish', sequenceIndex: 0, fromPlayerId: 'p1', toPlayerId: 'p2', action: 'link-establish' },
    { phase: 'order-link-establish', sequenceIndex: 1, fromPlayerId: 'p2', toPlayerId: 'p3', action: 'link-establish' },
    { phase: 'order-link-establish', sequenceIndex: 2, fromPlayerId: 'p3', toPlayerId: 'p4', action: 'link-establish' }
  ]);

  const first = motion.steps[0];
  assert.equal(first.currentPlayerId, 'p1');
  assert.equal(first.slots.find((slot) => slot.playerId === 'p1').action, 'current-pop');
  assert.equal(first.slots.find((slot) => slot.playerId === 'p2').action, 'invalidated-stay-skip');

  const second = motion.steps[1];
  assert.equal(second.currentPlayerId, 'p3');
  assert.equal(second.slots.find((slot) => slot.playerId === 'p1').action, 'processed-retreat');
  assert.equal(second.slots.find((slot) => slot.playerId === 'p2').action, 'invalidated-stay-skip');
  assert.equal(second.slots.find((slot) => slot.playerId === 'p3').action, 'current-pop');

  assert.equal(motion.steps.some((step) => step.currentPlayerId === 'p2'), false);
  assert.deepEqual(motion.finalSettle.map(({ playerId, sourceFinalState, action }) => ({ playerId, sourceFinalState, action })), [
    { playerId: 'p1', sourceFinalState: 'resolved-win', action: 'final-settled-win' },
    { playerId: 'p2', sourceFinalState: 'invalidated', action: 'final-settled-invalidated' },
    { playerId: 'p3', sourceFinalState: 'unresolved-final', action: 'final-settled-unresolved' },
    { playerId: 'p4', sourceFinalState: 'unresolved-final', action: 'final-settled-unresolved' }
  ]);
});

test('reduced-motion and low-perf keep the same semantic order without travel motion', () => {
  const chain = makeChain();
  const reduced = buildBattleJankenOrderMotion({ chain, reducedMotion: true });
  const lowPerf = buildBattleJankenOrderMotion({ chain, lowPerf: true });

  for (const motion of [reduced, lowPerf]) {
    assert.equal(motion.motionMode, 'semantic-only');
    assert.deepEqual(motion.processingOrder, chain.processingOrder);
    assert.deepEqual(motion.subjects.map((subject) => subject.cardId), ['c1', 'c2', 'c3', 'c4']);
    assert.deepEqual(motion.finalSettle.map((slot) => slot.sourceFinalState), chain.finalSlots.map((slot) => slot.visualState));
    assert.equal(motion.steps[0].slots.find((slot) => slot.playerId === 'p1').action, 'current-emphasis');
    assert.equal(motion.steps[1].slots.find((slot) => slot.playerId === 'p1').action, 'processed-settled');
    assert.equal(motion.steps[0].slots.find((slot) => slot.playerId === 'p2').action, 'invalidated-stay-skip');
    assert.equal(motion.sequenceBuild[0].action, 'link-visible-static');
    assert.equal(JSON.stringify(motion).includes('current-pop'), false);
    assert.equal(JSON.stringify(motion).includes('processed-retreat'), false);
  }
});

test('does not turn printed card numbers into a sorter or tie-breaker', () => {
  const chain = buildBattleJankenOrderChain({
    publicCards: [
      { playerId: 'p4', cardId: 'e4', displayNumber: 5, hand: 'gamma' },
      { playerId: 'p2', cardId: 'e2', displayNumber: 5, hand: 'gamma' },
      { playerId: 'p1', cardId: 'e1', displayNumber: 5, hand: 'gamma' }
    ],
    resolution: {
      processingOrder: ['p4', 'p2', 'p1'],
      resolvedWinners: [],
      unresolvedSurvivors: ['p4', 'p2', 'p1'],
      invalidated: [],
      steps: [
        { processedPlayerId: 'p4', winningHand: 'gamma', resolvedWinner: false, invalidated: [] },
        { processedPlayerId: 'p2', winningHand: 'gamma', resolvedWinner: false, invalidated: [] },
        { processedPlayerId: 'p1', winningHand: 'gamma', resolvedWinner: false, invalidated: [] }
      ]
    }
  });

  const motion = buildBattleJankenOrderMotion({ chain });
  assert.deepEqual(motion.processingOrder, ['p4', 'p2', 'p1']);
  assert.deepEqual(motion.subjects.map((subject) => subject.cardId), ['e4', 'e2', 'e1']);
});

test('fails closed when the supplied chain no longer preserves one authoritative identity/order', () => {
  const chain = makeChain();
  const badFrame = {
    ...chain.frames[0],
    slots: chain.frames[0].slots.map((slot, index) => index === 0 ? { ...slot, playerId: 'px' } : slot)
  };
  assert.throws(
    () => buildBattleJankenOrderMotion({ chain: { ...chain, frames: [badFrame, ...chain.frames.slice(1)] } }),
    /FRAME_SLOT_ORDER_MISMATCH/
  );

  assert.throws(
    () => buildBattleJankenOrderMotion({ chain: { ...chain, sequenceEdges: [...chain.sequenceEdges].reverse() } }),
    /SEQUENCE_EDGE_ORDER_MISMATCH/
  );
});

test('declares a presentation-only motion boundary and freezes the projected model', () => {
  const motion = buildBattleJankenOrderMotion({ chain: makeChain() });
  assert.equal(motion.presentationOnly, true);
  assert.equal(motion.gameplayAuthority, false);
  assert.equal(motion.gameStateWrite, false);
  assert.equal(motion.orderCalculation, false);
  assert.equal(motion.comparisonCalculation, false);
  assert.equal(motion.winnerCalculation, false);
  assert.equal(motion.targetCalculation, false);
  assert.equal(motion.physicalTimingAuthority, false);
  assert.equal(auditBattleJankenOrderMotion(motion).ok, true);
  assert.equal(Object.isFrozen(motion), true);
  assert.equal(Object.isFrozen(motion.steps), true);
  assert.equal(Object.isFrozen(motion.steps[0].slots), true);

  assert.equal(BATTLE_JANKEN_ORDER_MOTION.authority, 'NONE_PRESENTATION_ONLY');
  assert.equal(BATTLE_JANKEN_ORDER_MOTION.sourceAuthority, 'WORKUNIT27_ORDER_CHAIN');
  assert.equal(BATTLE_JANKEN_ORDER_MOTION.sortingOwnedHere, false);
  assert.equal(BATTLE_JANKEN_ORDER_MOTION.comparisonOwnedHere, false);
  assert.equal(BATTLE_JANKEN_ORDER_MOTION.gameplayOwnedHere, false);
  assert.equal(BATTLE_JANKEN_ORDER_MOTION.physicalTimingOwnedHere, false);
  assert.equal(BATTLE_JANKEN_ORDER_MOTION.invalidatedCardsRemainInOrderSlot, true);
});

test('ReducedMotion/LowPerf keep accepted route and committed Shield destination as a static causal trace', async () => {
  const {
    auditBattleResolutionBoardReturnProjection,
    projectBattleResolutionBoardReturn,
  } = await import('../browser/battle-resolution-board-return-presentation-core.mjs');

  const base = {
    boardReturn: {
      source: 'accepted_public_compound_attack_package',
      visualIntent: 'resolution_to_committed_shield',
      effectMutationClaimed: false,
      eventId: 'EV-25',
      cardId: 'c1',
      jankenHand: 'PAPER',
      opponentId: 'p3',
      shieldLane: 'R',
      shieldRef: 'p3-shield-r',
      destinationKey: 'p3:R',
      path: [{ cellId: 'road-8' }, { cellId: 'road-9' }],
      direction: 'FORWARD',
      roadId: 'road-r',
      battleId: 'battle-25',
    },
    orderChain: {
      processingOrder: ['p1', 'p2'],
      processedOrder: ['p1'],
      finalSlots: [
        { playerId: 'p1', cardId: 'c1', displayNumber: 9, hand: 'PAPER', visualState: 'resolved-win' },
        { playerId: 'p2', cardId: 'c2', displayNumber: 1, hand: 'ROCK', visualState: 'invalidated' },
      ],
    },
  };

  for (const options of [{ reducedMotion: true }, { lowPerf: true }]) {
    const projection = projectBattleResolutionBoardReturn({ ...base, ...options });
    assert.equal(projection.motion.mode, 'static_causal_trace');
    assert.equal(projection.motion.animateAcceptedPath, false);
    assert.equal(projection.motion.animateProcessingCollapse, false);
    assert.equal(projection.motion.destinationSettlePulse, false);
    assert.equal(projection.motion.preserveStageOrder, true);
    assert.deepEqual(projection.sourceCard, { cardId: 'c1', jankenHand: 'PAPER' });
    assert.deepEqual(projection.acceptedPath, [{ cellId: 'road-8' }, { cellId: 'road-9' }]);
    assert.deepEqual(projection.processing.processingOrder, ['p1', 'p2']);
    assert.equal(projection.destination.destinationKey, 'p3:R');
    assert.equal(projection.destination.shieldRef, 'p3-shield-r');
    assert.deepEqual(projection.stages.map((stage) => stage.kind), [
      'cause', 'processing', 'accepted_resolution', 'return_path', 'destination'
    ]);
    assert.deepEqual(auditBattleResolutionBoardReturnProjection(projection), { ok: true, defects: [] });
  }
});

test('ReducedMotion/LowPerf camera keeps manual inspect inputs and one-action controlled return', async () => {
  const {
    BATTLE_CAMERA_COMMANDS,
    BATTLE_CAMERA_MODES,
    applyBattleCameraCommand,
    createBattleCameraControlState,
  } = await import('../browser/battle-camera-control-core.mjs');

  let state = createBattleCameraControlState({
    controlledCharacterId: 'p1',
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

test('ReducedMotion/LowPerf card release keeps exact destination identity while simplifying movement', async () => {
  const {
    BATTLE_CARD_RELEASE_FLIGHT_LOW_PERF_MAX_DURATION_MS,
    BATTLE_CARD_RELEASE_FLIGHT_MODE,
    projectBattleCardReleaseFlightMotion,
  } = await import('../browser/battle-card-release-flight-motion-core.mjs');

  const start = { x: 12, y: 34 };
  const target = { x: 212, y: 134 };
  const reduced = projectBattleCardReleaseFlightMotion({ start, target, role: 'top', reducedMotion: true });
  assert.equal(reduced.mode, BATTLE_CARD_RELEASE_FLIGHT_MODE.REDUCED);
  assert.deepEqual(reduced.start, start);
  assert.deepEqual(reduced.target, target);
  assert.equal(reduced.spinDeg, 0);
  assert.equal(reduced.bendPx, 0);
  assert.deepEqual(reduced.destinationCue, { kind: 'DESTINATION_PULSE', x: 212, y: 134 });

  const lowPerf = projectBattleCardReleaseFlightMotion({ start, target, role: 'bottom', lowPerf: true, durationMs: 999 });
  assert.equal(lowPerf.mode, BATTLE_CARD_RELEASE_FLIGHT_MODE.FULL);
  assert.equal(lowPerf.lowPerf, true);
  assert.deepEqual(lowPerf.start, start);
  assert.deepEqual(lowPerf.target, target);
  assert.equal(lowPerf.spinDeg, 0);
  assert.equal(lowPerf.bendPx, 0);
  assert.equal(lowPerf.durationMs, BATTLE_CARD_RELEASE_FLIGHT_LOW_PERF_MAX_DURATION_MS);
  assert.equal(lowPerf.frames.at(-1).x, target.x - start.x);
  assert.equal(lowPerf.frames.at(-1).y, target.y - start.y);
});
