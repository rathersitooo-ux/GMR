import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BATTLE_RESOLUTION_BOARD_RETURN_CONTRACT,
  auditBattleResolutionBoardReturnProjection,
  projectBattleResolutionBoardReturn,
} from '../browser/battle-resolution-board-return-presentation-core.mjs';

const BOARD_RETURN = {
  eventId: 'settle-42',
  source: 'accepted_public_compound_attack_package',
  visualIntent: 'resolution_to_committed_shield',
  effectMutationClaimed: false,
  cardId: 'card-a',
  jankenHand: 'ROCK',
  path: ['road-2', 'junction-7', 'shield-p2-l'],
  direction: 'upper-left',
  roadId: 'road-2',
  battleId: 'battle-9',
  opponentId: 'p2',
  shieldLane: 'L',
  shieldRef: 'shield-p2-l',
  destinationKey: 'p2:L',
};

const ORDER_CHAIN = {
  processingOrder: ['p4', 'p1', 'p3', 'p2'],
  processedOrder: ['p4', 'p3', 'p2'],
  finalSlots: [
    { playerId: 'p4', cardId: 'c4', displayNumber: 9, hand: 'PAPER', visualState: 'resolved-win' },
    { playerId: 'p1', cardId: 'c1', displayNumber: 1, hand: 'ROCK', visualState: 'invalidated' },
    { playerId: 'p3', cardId: 'c3', displayNumber: 5, hand: 'SCISSORS', visualState: 'unresolved-final' },
    { playerId: 'p2', cardId: 'c2', displayNumber: 2, hand: 'ROCK', visualState: 'unresolved-final' },
  ],
};

test('projects accepted cause through accepted path to exact Shield destination without recomputation', () => {
  const result = projectBattleResolutionBoardReturn({ boardReturn: BOARD_RETURN });

  assert.equal(result.sourceCard.cardId, 'card-a');
  assert.equal(result.sourceCard.jankenHand, 'ROCK');
  assert.deepEqual(result.acceptedPath, BOARD_RETURN.path);
  assert.deepEqual(result.destination, {
    opponentId: 'p2',
    shieldLane: 'L',
    shieldRef: 'shield-p2-l',
    destinationKey: 'p2:L',
  });
  assert.deepEqual(result.stages.map((stage) => stage.kind), [
    'cause',
    'accepted_resolution',
    'return_path',
    'destination',
  ]);
  assert.equal(result.targetCalculation, false);
  assert.equal(result.winnerCalculation, false);
  assert.equal(result.effectCalculation, false);
  assert.equal(result.legalityCalculation, false);
  assert.equal(result.routeCalculation, false);
  assert.equal(auditBattleResolutionBoardReturnProjection(result).ok, true);
});

test('preserves caller-supplied authoritative processing order instead of sorting or resolving it', () => {
  const result = projectBattleResolutionBoardReturn({
    boardReturn: BOARD_RETURN,
    orderChain: ORDER_CHAIN,
  });

  assert.deepEqual(result.processing.processingOrder, ['p4', 'p1', 'p3', 'p2']);
  assert.deepEqual(result.processing.processedOrder, ['p4', 'p3', 'p2']);
  assert.deepEqual(result.processing.finalSlots.map((slot) => [slot.playerId, slot.displayNumber, slot.visualState]), [
    ['p4', 9, 'resolved-win'],
    ['p1', 1, 'invalidated'],
    ['p3', 5, 'unresolved-final'],
    ['p2', 2, 'unresolved-final'],
  ]);
  assert.deepEqual(result.stages.map((stage) => stage.kind), [
    'cause',
    'processing',
    'accepted_resolution',
    'return_path',
    'destination',
  ]);
});

test('does not invent winner, effect, legality, target or invalidated-card destination when optional processing is absent', () => {
  const result = projectBattleResolutionBoardReturn({ boardReturn: BOARD_RETURN });
  const serialized = JSON.stringify(result);

  assert.equal(result.processing, null);
  assert.doesNotMatch(serialized, /winnerId|damage|legalTargets|graveyard|subdeck|chip/i);
  assert.equal(result.stages.find((stage) => stage.kind === 'accepted_resolution').winnerInferred, false);
  assert.equal(result.stages.find((stage) => stage.kind === 'accepted_resolution').effectInferred, false);
});

test('reduced motion and low performance preserve causal order while suppressing travel effects', () => {
  for (const flags of [{ reducedMotion: true }, { lowPerf: true }]) {
    const result = projectBattleResolutionBoardReturn({
      boardReturn: BOARD_RETURN,
      orderChain: ORDER_CHAIN,
      ...flags,
    });
    assert.equal(result.motion.mode, 'static_causal_trace');
    assert.equal(result.motion.animateAcceptedPath, false);
    assert.equal(result.motion.animateProcessingCollapse, false);
    assert.equal(result.motion.destinationSettlePulse, false);
    assert.equal(result.motion.preserveStageOrder, true);
    assert.deepEqual(result.stages.map((stage) => stage.kind), [
      'cause',
      'processing',
      'accepted_resolution',
      'return_path',
      'destination',
    ]);
  }
});

test('fails closed when the accepted destination identity or path is incomplete', () => {
  assert.throws(
    () => projectBattleResolutionBoardReturn({
      boardReturn: { ...BOARD_RETURN, destinationKey: 'p3:L' },
    }),
    /DESTINATION_KEY_MISMATCH/,
  );
  assert.throws(
    () => projectBattleResolutionBoardReturn({
      boardReturn: { ...BOARD_RETURN, shieldLane: 'X', destinationKey: 'p2:X' },
    }),
    /SHIELD_LANE_INVALID/,
  );
  assert.throws(
    () => projectBattleResolutionBoardReturn({
      boardReturn: { ...BOARD_RETURN, path: [] },
    }),
    /PATH_REQUIRED/,
  );
  assert.throws(
    () => projectBattleResolutionBoardReturn({
      boardReturn: { ...BOARD_RETURN, source: 'preview_only' },
    }),
    /SOURCE_NOT_ACCEPTED/,
  );
});

test('fails closed on incomplete or reordered order-chain projection instead of repairing it', () => {
  assert.throws(
    () => projectBattleResolutionBoardReturn({
      boardReturn: BOARD_RETURN,
      orderChain: {
        ...ORDER_CHAIN,
        finalSlots: ORDER_CHAIN.finalSlots.slice(0, 3),
      },
    }),
    /FINAL_SLOTS_INVALID/,
  );
  assert.throws(
    () => projectBattleResolutionBoardReturn({
      boardReturn: BOARD_RETURN,
      orderChain: {
        ...ORDER_CHAIN,
        finalSlots: [ORDER_CHAIN.finalSlots[1], ORDER_CHAIN.finalSlots[0], ...ORDER_CHAIN.finalSlots.slice(2)],
      },
    }),
    /FINAL_SLOT_ORDER_MISMATCH/,
  );
});

test('projection is immutable and contract explicitly owns no live mount or gameplay authority', () => {
  const result = projectBattleResolutionBoardReturn({ boardReturn: BOARD_RETURN, orderChain: ORDER_CHAIN });
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.stages), true);
  assert.equal(Object.isFrozen(result.acceptedPath), true);
  assert.equal(BATTLE_RESOLUTION_BOARD_RETURN_CONTRACT.authority, 'NONE_PRESENTATION_ONLY');
  assert.equal(BATTLE_RESOLUTION_BOARD_RETURN_CONTRACT.liveMountOwnedHere, false);
  assert.equal(BATTLE_RESOLUTION_BOARD_RETURN_CONTRACT.targetCalculation, false);
  assert.equal(BATTLE_RESOLUTION_BOARD_RETURN_CONTRACT.winnerCalculation, false);
});
