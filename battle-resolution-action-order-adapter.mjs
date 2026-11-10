import { auditBattleActionOrderPresentation } from './battle-action-order-presentation-core.mjs';
import { projectBattleResolutionBoardReturn } from './battle-resolution-board-return-presentation-core.mjs';

export const BATTLE_CAUSAL_ORDER_BRIDGE_SCHEMA = 'gameroad.battle-causal-order-bridge.v1';

const FINAL_STATE_MAP = Object.freeze({
  RESOLVED_WIN: 'resolved-win',
  INVALIDATED: 'invalidated',
  UNRESOLVED: 'unresolved-final',
});

function fail(code) {
  throw new TypeError(code);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function requiredString(value, code) {
  if (typeof value !== 'string' || value.trim() === '') fail(code);
  return value.trim();
}

/**
 * Shape-only bridge from the merged WorkUnit27 presentation model to the
 * optional orderChain accepted by the merged causal board-return projector.
 * It never sorts, resolves, selects a winner/target, or changes destinations.
 */
export function adaptBattleActionOrderToCausalOrderChain(actionOrder) {
  const audit = auditBattleActionOrderPresentation(actionOrder);
  if (!audit.ok) fail(`BATTLE_CAUSAL_ORDER_SOURCE_REJECTED:${audit.defects.join(',')}`);

  const processingOrder = [...actionOrder.processingOrderParticipantIds];
  const cards = actionOrder.cards;
  if (cards.length !== processingOrder.length) fail('BATTLE_CAUSAL_ORDER_CARD_COUNT_MISMATCH');
  if (!Array.isArray(actionOrder.processingOrderCardIds) || actionOrder.processingOrderCardIds.length !== processingOrder.length) {
    fail('BATTLE_CAUSAL_ORDER_CARD_ORDER_INVALID');
  }

  const finalSlots = processingOrder.map((playerId, index) => {
    const card = cards[index];
    if (requiredString(card.participantId, 'BATTLE_CAUSAL_ORDER_PARTICIPANT_INVALID') !== playerId) {
      fail('BATTLE_CAUSAL_ORDER_PARTICIPANT_ORDER_MISMATCH');
    }
    const cardId = requiredString(card.cardId, 'BATTLE_CAUSAL_ORDER_CARD_INVALID');
    if (actionOrder.processingOrderCardIds[index] !== cardId) fail('BATTLE_CAUSAL_ORDER_CARD_ORDER_MISMATCH');
    const visualState = FINAL_STATE_MAP[card.finalState];
    if (!visualState) fail('BATTLE_CAUSAL_ORDER_FINAL_STATE_UNKNOWN');
    return {
      playerId,
      cardId,
      displayNumber: card.printedNumber,
      hand: card.jankenHand ?? null,
      visualState,
    };
  });

  const processedOrder = actionOrder.steps.map(step =>
    requiredString(step.processedParticipantId, 'BATTLE_CAUSAL_ORDER_PROCESSED_PARTICIPANT_INVALID'));
  const processingSet = new Set(processingOrder);
  if (new Set(processedOrder).size !== processedOrder.length) fail('BATTLE_CAUSAL_ORDER_PROCESSED_DUPLICATE');
  if (processedOrder.some(playerId => !processingSet.has(playerId))) fail('BATTLE_CAUSAL_ORDER_PROCESSED_UNKNOWN');

  return deepFreeze({
    schema: BATTLE_CAUSAL_ORDER_BRIDGE_SCHEMA,
    presentationOnly: true,
    gameplayAuthority: false,
    gameStateWrite: false,
    orderCalculation: false,
    winnerCalculation: false,
    targetCalculation: false,
    processingOrder,
    processedOrder,
    finalSlots,
  });
}

export function projectBattleResolutionWithActionOrder({
  boardReturn,
  actionOrder = null,
  reducedMotion = false,
  lowPerf = false,
} = {}) {
  const orderChain = actionOrder == null
    ? null
    : adaptBattleActionOrderToCausalOrderChain(actionOrder);
  return projectBattleResolutionBoardReturn({
    boardReturn,
    orderChain,
    reducedMotion,
    lowPerf,
  });
}

export const BATTLE_CAUSAL_ORDER_BRIDGE_CONTRACT = deepFreeze({
  schema: BATTLE_CAUSAL_ORDER_BRIDGE_SCHEMA,
  authority: 'NONE_PRESENTATION_ONLY',
  source: 'MERGED_BATTLE_ACTION_ORDER_PRESENTATION',
  destination: 'MERGED_BATTLE_RESOLUTION_BOARD_RETURN_OPTIONAL_ORDER_CHAIN',
  preservesCallerOrder: true,
  sortingOwnedHere: false,
  winnerCalculation: false,
  targetCalculation: false,
  destinationCalculation: false,
});