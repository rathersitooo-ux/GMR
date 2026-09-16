import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBattleJankenOrderChain } from '../browser/battle-janken-order-chain-presentation-core.mjs';
import {
  BATTLE_JANKEN_ORDER_MOTION,
  auditBattleJankenOrderMotion,
  buildBattleJankenOrderMotion
} from '../browser/battle-janken-order-motion-core.mjs';
import { projectBattleResolutionBoardReturn } from '../browser/battle-resolution-board-return-presentation-core.mjs';
import {
  BATTLE_CAMERA_COMMANDS,
  BATTLE_CAMERA_MODES,
  applyBattleCameraCommand,
  createBattleCameraControlState,
} from '../browser/battle-camera-control-core.mjs';
import { projectBattleCardReleaseFlightMotion } from '../browser/battle-card-release-flight-motion-core.mjs';

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

const BOARD_RETURN = {
  eventId: 'settle-r3-25',
  source: 'accepted_public_compound_attack_package',
  visualIntent: 'resolution_to_committed_shield',
  effectMutationClaimed: false,
  cardId: 'c1',
  jankenHand: 'alpha',
  path: ['road-7', 'junction-2', 'shield-p3-r'],
  direction: 'upper-right',
  roadId: 'road-7',
  battleId: 'battle-r3-25',
  opponentId: 'p3',
  shieldLane: 'R',
  shieldRef: 'shield-p3-r',
  destinationKey: 'p3:R',
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
    assert.deepEqual(motion.finalSettle.map((slot) => slot.sourceFinalState), chain.finalSlots.map((slot) => slot.visualState));
    assert.equal(motion.steps[0].slots.find((slot) => slot.playerId === 'p1').action, 'current-emphasis');
    assert.equal(motion.steps[1].slots.find((slot) => slot.playerId === 'p1').action, 'processed-settled');
    assert.equal(motion.steps[0].slots.find((slot) => slot.playerId === 'p2').action, 'invalidated-stay-skip');
    assert.equal(JSON.stringify(motion).includes('current-pop'), false);
    assert.equal(JSON.stringify(motion).includes('processed-retreat'), false);
  }
});

test('reduced-motion and low-perf preserve cross-module card lineage, invalidation, route and Shield destination', () => {
  const chain = makeChain();
  const orderChain = {
    processingOrder: chain.processingOrder,
    processedOrder: chain.processedOrder,
    finalSlots: chain.finalSlots,
  };
  const releaseStart = { x: 612, y: 332 };
  const releaseTarget = { x: 386, y: 168 };

  const variants = [
    { name: 'reducedMotion', orderFlags: { reducedMotion: true }, returnFlags: { reducedMotion: true }, releaseFlags: { reducedMotion: true } },
    { name: 'lowPerf', orderFlags: { lowPerf: true }, returnFlags: { lowPerf: true }, releaseFlags: { lowPerf: true } },
  ];

  for (const variant of variants) {
    const orderMotion = buildBattleJankenOrderMotion({ chain, ...variant.orderFlags });
    const boardReturn = projectBattleResolutionBoardReturn({
      boardReturn: BOARD_RETURN,
      orderChain,
      ...variant.returnFlags,
    });
    const release = projectBattleCardReleaseFlightMotion({
      start: releaseStart,
      target: releaseTarget,
      role: 'top',
      ...variant.releaseFlags,
    });

    assert.deepEqual(orderMotion.processingOrder, ['p1', 'p2', 'p3', 'p4'], `${variant.name}: processing order`);
    assert.deepEqual(orderMotion.subjects.map((subject) => subject.cardId), ['c1', 'c2', 'c3', 'c4'], `${variant.name}: card identity`);
    assert.equal(orderMotion.finalSettle.find((slot) => slot.playerId === 'p2').sourceFinalState, 'invalidated', `${variant.name}: invalidated state`);

    assert.equal(boardReturn.sourceCard.cardId, 'c1', `${variant.name}: causal source card`);
    assert.deepEqual(boardReturn.processing.processingOrder, orderMotion.processingOrder, `${variant.name}: processing order joins board return`);
    assert.equal(boardReturn.processing.finalSlots.find((slot) => slot.playerId === 'p2').visualState, 'invalidated', `${variant.name}: invalidated survives causal return`);
    assert.deepEqual(boardReturn.acceptedPath, BOARD_RETURN.path, `${variant.name}: accepted route`);
    assert.deepEqual(boardReturn.destination, {
      opponentId: 'p3',
      shieldLane: 'R',
      shieldRef: 'shield-p3-r',
      destinationKey: 'p3:R',
    }, `${variant.name}: exact Shield destination`);
    assert.equal(boardReturn.motion.mode, 'static_causal_trace', `${variant.name}: presentation motion suppressed only`);

    assert.ok(release, `${variant.name}: release projection exists`);
    assert.deepEqual(release.start, releaseStart, `${variant.name}: release source geometry`);
    assert.deepEqual(release.target, releaseTarget, `${variant.name}: exact release destination geometry`);
    assert.equal(release.destinationCue.x, releaseTarget.x, `${variant.name}: destination cue x`);
    assert.equal(release.destinationCue.y, releaseTarget.y, `${variant.name}: destination cue y`);
  }
});

test('reduced-motion and low-performance camera keep manual pan/zoom/angle and one-action controlled return', () => {
  const variants = [
    { name: 'reducedMotion', reducedMotion: true, lowPerformance: false },
    { name: 'lowPerformance', reducedMotion: false, lowPerformance: true },
  ];

  for (const variant of variants) {
    let state = createBattleCameraControlState({
      controlledCharacterId: 'P1-character',
      controlledWorldPoint: { x: 120, y: 80 },
      followZoom: 1.25,
      followAngle: 12,
      limits: {
        x: { min: -400, max: 400 },
        y: { min: -300, max: 300 },
        zoom: { min: 0.7, max: 2.4 },
        angle: { min: -35, max: 35 },
      },
      reducedMotion: variant.reducedMotion,
      lowPerformance: variant.lowPerformance,
    });

    assert.equal(state.manualInspectionAvailable, true, `${variant.name}: manual inspection remains available`);
    assert.equal(state.oneActionReturnAvailable, true, `${variant.name}: one-action return remains available`);
    assert.equal(state.reducedMotion, variant.reducedMotion);
    assert.equal(state.lowPerformance, variant.lowPerformance);

    state = applyBattleCameraCommand(state, { type: BATTLE_CAMERA_COMMANDS.BEGIN_MANUAL_INSPECT }).state;
    assert.equal(state.mode, BATTLE_CAMERA_MODES.MANUAL_INSPECT, `${variant.name}: manual mode`);

    state = applyBattleCameraCommand(state, { type: BATTLE_CAMERA_COMMANDS.PAN, dx: 55, dy: -30 }).state;
    assert.deepEqual(state.center, { x: 175, y: 50 }, `${variant.name}: pan`);

    state = applyBattleCameraCommand(state, { type: BATTLE_CAMERA_COMMANDS.SET_ZOOM, zoom: 1.8 }).state;
    assert.equal(state.zoom, 1.8, `${variant.name}: zoom`);

    state = applyBattleCameraCommand(state, { type: BATTLE_CAMERA_COMMANDS.SET_ANGLE, angle: -18 }).state;
    assert.equal(state.angle, -18, `${variant.name}: angle`);

    const returned = applyBattleCameraCommand(state, { type: BATTLE_CAMERA_COMMANDS.RETURN_TO_CONTROLLED });
    assert.equal(returned.ok, true);
    assert.equal(returned.reason, 'RETURNED_TO_CONTROLLED_CHARACTER');
    assert.equal(returned.state.mode, BATTLE_CAMERA_MODES.FOLLOW_CONTROLLED, `${variant.name}: follow restored`);
    assert.deepEqual(returned.state.center, { x: 120, y: 80 }, `${variant.name}: controlled center restored`);
    assert.equal(returned.state.zoom, 1.25, `${variant.name}: follow zoom restored`);
    assert.equal(returned.state.angle, 12, `${variant.name}: follow angle restored`);
    assert.equal(returned.state.gameStateWrite, false);
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