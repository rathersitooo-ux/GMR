import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BATTLE_CAUSAL_ORDER_BRIDGE_CONTRACT,
  adaptBattleActionOrderToCausalOrderChain,
  projectBattleResolutionWithActionOrder,
} from '../browser/battle-resolution-action-order-adapter.mjs';

const ACTION_ORDER = {
  schema: 'gameroad.battle-action-order-presentation.v1',
  presentationOnly: true,
  gameplayAuthority: false,
  gameStateWrite: false,
  orderCalculation: false,
  winnerCalculation: false,
  targetCalculation: false,
  secretProjectionAuthority: false,
  motion: 'presentation_allowed',
  processingOrderParticipantIds: ['P2', 'P1', 'P4', 'P3'],
  processingOrderCardIds: ['C2', 'C1', 'C4', 'C3'],
  cards: [
    { participantId: 'P2', cardId: 'C2', printedNumber: 2, jankenHand: 'ROCK', finalState: 'RESOLVED_WIN' },
    { participantId: 'P1', cardId: 'C1', printedNumber: 5, jankenHand: 'PAPER', finalState: 'INVALIDATED' },
    { participantId: 'P4', cardId: 'C4', printedNumber: 7, jankenHand: 'SCISSORS', finalState: 'UNRESOLVED' },
    { participantId: 'P3', cardId: 'C3', printedNumber: 9, jankenHand: null, finalState: 'UNRESOLVED' },
  ],
  steps: [
    { processedParticipantId: 'P2' },
    { processedParticipantId: 'P4' },
  ],
};

const BOARD_RETURN = {
  eventId: 'settle-9',
  source: 'accepted_public_compound_attack_package',
  visualIntent: 'resolution_to_committed_shield',
  effectMutationClaimed: false,
  cardId: 'C2',
  jankenHand: 'ROCK',
  path: [{ nodeId: 'ROAD-A' }, { nodeId: 'ROAD-B' }],
  direction: 'LEFT',
  roadId: 'ROAD-01',
  battleId: 'BATTLE-01',
  opponentId: 'P3',
  shieldLane: 'R',
  shieldRef: 'shield:P3:R',
  destinationKey: 'P3:R',
};

test('preserves caller processing order while translating display vocabulary only', () => {
  const bridge = adaptBattleActionOrderToCausalOrderChain(ACTION_ORDER);
  assert.deepEqual(bridge.processingOrder, ['P2', 'P1', 'P4', 'P3']);
  assert.deepEqual(bridge.processedOrder, ['P2', 'P4']);
  assert.deepEqual(bridge.finalSlots.map(slot => slot.playerId), ['P2', 'P1', 'P4', 'P3']);
  assert.deepEqual(bridge.finalSlots.map(slot => slot.cardId), ['C2', 'C1', 'C4', 'C3']);
  assert.deepEqual(bridge.finalSlots.map(slot => slot.visualState), [
    'resolved-win', 'invalidated', 'unresolved-final', 'unresolved-final',
  ]);
  assert.deepEqual(bridge.finalSlots.map(slot => slot.displayNumber), [2, 5, 7, 9]);
  assert.deepEqual(bridge.finalSlots.map(slot => slot.hand), ['ROCK', 'PAPER', 'SCISSORS', null]);
  assert.equal(bridge.orderCalculation, false);
  assert.equal(bridge.winnerCalculation, false);
  assert.equal(bridge.targetCalculation, false);
  assert.equal(Object.isFrozen(bridge), true);
});

test('composes merged action-order presentation into causal board return without changing destination', () => {
  const projection = projectBattleResolutionWithActionOrder({ boardReturn: BOARD_RETURN, actionOrder: ACTION_ORDER });
  assert.deepEqual(projection.stages.map(stage => stage.kind), [
    'cause', 'processing', 'accepted_resolution', 'return_path', 'destination',
  ]);
  assert.deepEqual(projection.processing.processingOrder, ['P2', 'P1', 'P4', 'P3']);
  assert.deepEqual(projection.processing.processedOrder, ['P2', 'P4']);
  assert.equal(projection.sourceCard.cardId, 'C2');
  assert.equal(projection.sourceCard.jankenHand, 'ROCK');
  assert.equal(projection.destination.destinationKey, 'P3:R');
  assert.equal(projection.destination.shieldLane, 'R');
  assert.deepEqual(projection.acceptedPath, BOARD_RETURN.path);
  assert.equal(projection.orderCalculation, undefined);
  assert.equal(projection.winnerCalculation, false);
  assert.equal(projection.targetCalculation, false);
  assert.equal(projection.routeCalculation, false);
});

test('action order remains optional and reduced motion preserves the same causal destination', () => {
  const projection = projectBattleResolutionWithActionOrder({
    boardReturn: BOARD_RETURN,
    actionOrder: null,
    reducedMotion: true,
  });
  assert.deepEqual(projection.stages.map(stage => stage.kind), [
    'cause', 'accepted_resolution', 'return_path', 'destination',
  ]);
  assert.equal(projection.processing, null);
  assert.equal(projection.motion.mode, 'static_causal_trace');
  assert.equal(projection.destination.destinationKey, 'P3:R');
});

test('fails closed instead of repairing mismatched caller order', () => {
  assert.throws(
    () => adaptBattleActionOrderToCausalOrderChain({
      ...ACTION_ORDER,
      processingOrderCardIds: ['C1', 'C2', 'C4', 'C3'],
    }),
    /BATTLE_CAUSAL_ORDER_CARD_ORDER_MISMATCH/,
  );
  assert.throws(
    () => adaptBattleActionOrderToCausalOrderChain({
      ...ACTION_ORDER,
      cards: ACTION_ORDER.cards.map((card, index) => index === 0 ? { ...card, finalState: 'MYSTERY' } : card),
    }),
    /BATTLE_CAUSAL_ORDER_SOURCE_REJECTED:FINAL_STATE/,
  );
});

test('contract owns no gameplay decisions', () => {
  assert.equal(BATTLE_CAUSAL_ORDER_BRIDGE_CONTRACT.preservesCallerOrder, true);
  assert.equal(BATTLE_CAUSAL_ORDER_BRIDGE_CONTRACT.sortingOwnedHere, false);
  assert.equal(BATTLE_CAUSAL_ORDER_BRIDGE_CONTRACT.winnerCalculation, false);
  assert.equal(BATTLE_CAUSAL_ORDER_BRIDGE_CONTRACT.targetCalculation, false);
  assert.equal(BATTLE_CAUSAL_ORDER_BRIDGE_CONTRACT.destinationCalculation, false);
});