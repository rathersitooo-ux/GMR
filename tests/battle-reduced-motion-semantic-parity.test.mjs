import test from 'node:test';
import assert from 'node:assert/strict';

import { buildBattleJankenOrderChain } from '../browser/battle-janken-order-chain-presentation-core.mjs';
import { buildBattleJankenOrderMotion } from '../browser/battle-janken-order-motion-core.mjs';
import {
  BATTLE_CARD_RELEASE_FLIGHT_MODE,
  projectBattleCardReleaseFlightMotion,
} from '../browser/battle-card-release-flight-motion-core.mjs';
import {
  createControlledCharacterMotionState,
  projectControlledCharacterMotion,
  transitionControlledCharacterMotion,
} from '../browser/battle-controlled-character-motion-core.mjs';
import {
  TRANSITION_PHASES,
  applyUIFeedbackEvent,
  createTransitionDirector,
  createUIFeedbackState,
  projectUIFeedback,
} from '../browser/ui-state-feedback-core.mjs';

function makeJankenChain() {
  return buildBattleJankenOrderChain({
    publicCards: [
      { playerId: 'p4', cardId: 'card-4', displayNumber: 3, hand: 'gamma' },
      { playerId: 'p3', cardId: 'card-3', displayNumber: 7, hand: 'gamma' },
      { playerId: 'p2', cardId: 'card-2', displayNumber: 1, hand: 'beta' },
      { playerId: 'p1', cardId: 'card-1', displayNumber: 9, hand: 'alpha' },
    ],
    resolution: {
      processingOrder: ['p1', 'p2', 'p3', 'p4'],
      resolvedWinners: ['p1'],
      unresolvedSurvivors: ['p3', 'p4'],
      invalidated: ['p2'],
      steps: [
        { processedPlayerId: 'p1', winningHand: 'alpha', resolvedWinner: true, invalidated: ['p2'] },
        { processedPlayerId: 'p3', winningHand: 'gamma', resolvedWinner: false, invalidated: [] },
        { processedPlayerId: 'p4', winningHand: 'gamma', resolvedWinner: false, invalidated: [] },
      ],
    },
  });
}

function semanticJankenSignature(motion) {
  return {
    processingOrder: motion.processingOrder,
    subjects: motion.subjects.map(({ playerId, cardId }) => ({ playerId, cardId })),
    finalSettle: motion.finalSettle.map(({ playerId, sourceFinalState }) => ({ playerId, sourceFinalState })),
  };
}

test('ReducedMotion keeps Janken order, physical-card identity, and final result while removing travel choreography', () => {
  const chain = makeJankenChain();
  const full = buildBattleJankenOrderMotion({ chain });
  const reduced = buildBattleJankenOrderMotion({ chain, reducedMotion: true });

  assert.deepEqual(semanticJankenSignature(reduced), semanticJankenSignature(full));
  assert.equal(reduced.motionMode, 'semantic-only');
  assert.equal(JSON.stringify(reduced).includes('current-pop'), false);
  assert.equal(JSON.stringify(reduced).includes('processed-retreat'), false);
});

test('ReducedMotion removes release travel but keeps an explicit authoritative destination cue', () => {
  const start = { x: 80, y: 220 };
  const target = { x: 740, y: 188 };
  const reduced = projectBattleCardReleaseFlightMotion({
    start,
    target,
    role: 'top',
    reducedMotion: true,
  });

  assert.equal(reduced.mode, BATTLE_CARD_RELEASE_FLIGHT_MODE.REDUCED);
  assert.ok(reduced.durationMs <= 180);
  assert.equal(reduced.frames.every((frame) => frame.x === 0 && frame.y === 0 && frame.rotationDeg === 0), true);
  assert.deepEqual(reduced.destinationCue, {
    kind: 'DESTINATION_PULSE',
    x: target.x,
    y: target.y,
  });
});

test('ReducedMotion keeps accepted controlled-character position and state while suppressing travel embellishment', () => {
  const initial = createControlledCharacterMotionState({
    participantId: 'p1',
    characterId: 'partner-1',
    positionKey: 'lane-A',
  });
  const moved = transitionControlledCharacterMotion(initial, {
    type: 'MOVE_ACCEPTED',
    revision: 1,
    controlGeneration: 0,
    toPositionKey: 'lane-B',
    facing: 'right',
  });
  const full = projectControlledCharacterMotion(moved);
  const reduced = projectControlledCharacterMotion(moved, { reducedMotion: true });

  assert.equal(reduced.positionKey, full.positionKey);
  assert.equal(reduced.phase, full.phase);
  assert.equal(reduced.facing, full.facing);
  assert.equal(reduced.presentationOnly, true);
  assert.equal(reduced.gameplayAuthority, false);
  assert.equal(reduced.effects.travelBob, false);
  assert.equal(reduced.effects.overshoot, false);
  assert.ok(reduced.durationMs <= 90);
});

test('ReducedMotion keeps pressed, pending, failed, and intent semantics even when UI motion is none', () => {
  const config = { holdMs: 500, moveCancelDistance: 20, rightSwipeDistance: 45 };
  let state = createUIFeedbackState({ config, role: 'card', reducedMotion: true });

  state = applyUIFeedbackEvent(state, { type: 'POINTER_DOWN', x: 10, y: 10, atMs: 0 });
  let projection = projectUIFeedback(state);
  assert.equal(projection.motion, 'none');
  assert.equal(projection.semanticLabel, 'card:pressed');

  state = applyUIFeedbackEvent(state, { type: 'POINTER_UP' });
  assert.equal(state.intent, 'primary');

  state = applyUIFeedbackEvent(state, { type: 'BEGIN_PENDING', token: 'op-1' });
  projection = projectUIFeedback(state);
  assert.equal(projection.motion, 'none');
  assert.equal(projection.semanticLabel, 'card:pending');

  state = applyUIFeedbackEvent(state, { type: 'ACK_FAILED', token: 'op-1', reason: 'server_reject' });
  projection = projectUIFeedback(state);
  assert.equal(projection.motion, 'none');
  assert.equal(projection.semanticLabel, 'card:failed');
});

test('ReducedMotion keeps the complete screen-transition semantic lifecycle and swaps exactly once', async () => {
  const phases = [];
  let swaps = 0;
  const director = createTransitionDirector({
    runPhase: async (phase, context) => {
      phases.push({ phase, reducedMotion: context.reducedMotion });
    },
  });

  const result = await director.start({
    from: 'Home',
    to: 'Battle',
    reducedMotion: true,
    applySwap: () => { swaps += 1; },
  });

  assert.equal(result.status, 'completed');
  assert.equal(swaps, 1);
  assert.deepEqual(phases.map(({ phase }) => phase), [
    TRANSITION_PHASES.PREPARE,
    TRANSITION_PHASES.EXIT,
    TRANSITION_PHASES.SWAP,
    TRANSITION_PHASES.ENTER,
    TRANSITION_PHASES.SETTLE,
  ]);
  assert.equal(phases.every(({ reducedMotion }) => reducedMotion === true), true);
});
