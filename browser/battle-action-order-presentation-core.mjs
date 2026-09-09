const SCHEMA = 'gameroad.battle-action-order-presentation.v1';
const FINAL_STATES = Object.freeze(['RESOLVED_WIN', 'INVALIDATED', 'UNRESOLVED']);

function fail(code) {
  throw new TypeError(code);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function requireId(value, code) {
  if (typeof value !== 'string' || value.trim() === '') fail(code);
  return value.trim();
}

function requirePrintedNumber(value) {
  if (!Number.isSafeInteger(value)) fail('BATTLE_ACTION_ORDER_PRINTED_NUMBER_INVALID');
  return value;
}

function optionalString(value, code) {
  if (value == null) return null;
  return requireId(value, code);
}

function normalizeOrderedCards(orderedCards) {
  if (!Array.isArray(orderedCards) || orderedCards.length < 1 || orderedCards.length > 4) {
    fail('BATTLE_ACTION_ORDER_CARDS_INVALID');
  }
  const participantIds = new Set();
  const cardIds = new Set();
  return orderedCards.map((raw, index) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('BATTLE_ACTION_ORDER_CARD_INVALID');
    const participantId = requireId(raw.participantId, 'BATTLE_ACTION_ORDER_PARTICIPANT_ID_INVALID');
    const cardId = requireId(raw.cardId, 'BATTLE_ACTION_ORDER_CARD_ID_INVALID');
    if (participantIds.has(participantId)) fail('BATTLE_ACTION_ORDER_PARTICIPANT_DUPLICATE');
    if (cardIds.has(cardId)) fail('BATTLE_ACTION_ORDER_CARD_DUPLICATE');
    participantIds.add(participantId);
    cardIds.add(cardId);
    return {
      participantId,
      cardId,
      printedNumber: requirePrintedNumber(raw.printedNumber),
      jankenHand: optionalString(raw.jankenHand, 'BATTLE_ACTION_ORDER_JANKEN_HAND_INVALID'),
      orderIndex: index,
      orderBadge: index + 1
    };
  });
}

function requireIdArray(value, code) {
  if (!Array.isArray(value)) fail(code);
  const ids = value.map(item => requireId(item, code));
  if (new Set(ids).size !== ids.length) fail(`${code}_DUPLICATE`);
  return ids;
}

function assertKnownIds(ids, known, code) {
  for (const id of ids) if (!known.has(id)) fail(`${code}:${id}`);
}

function normalizeResolution(resolution, orderedParticipantIds) {
  if (!resolution || typeof resolution !== 'object' || Array.isArray(resolution)) {
    fail('BATTLE_ACTION_ORDER_RESOLUTION_INVALID');
  }
  const processingOrder = requireIdArray(resolution.processingOrder, 'BATTLE_ACTION_ORDER_PROCESSING_ORDER_INVALID');
  if (processingOrder.length !== orderedParticipantIds.length || processingOrder.some((id, i) => id !== orderedParticipantIds[i])) {
    fail('BATTLE_ACTION_ORDER_CALLER_ORDER_MISMATCH');
  }

  const known = new Set(processingOrder);
  const resolvedWinners = requireIdArray(resolution.resolvedWinners, 'BATTLE_ACTION_ORDER_RESOLVED_WINNERS_INVALID');
  const invalidated = requireIdArray(resolution.invalidated, 'BATTLE_ACTION_ORDER_INVALIDATED_INVALID');
  const unresolvedSurvivors = requireIdArray(resolution.unresolvedSurvivors, 'BATTLE_ACTION_ORDER_UNRESOLVED_INVALID');
  assertKnownIds(resolvedWinners, known, 'BATTLE_ACTION_ORDER_UNKNOWN_RESOLVED_WINNER');
  assertKnownIds(invalidated, known, 'BATTLE_ACTION_ORDER_UNKNOWN_INVALIDATED');
  assertKnownIds(unresolvedSurvivors, known, 'BATTLE_ACTION_ORDER_UNKNOWN_UNRESOLVED');

  const finalMembership = new Map(processingOrder.map(id => [id, 0]));
  for (const id of resolvedWinners) finalMembership.set(id, finalMembership.get(id) + 1);
  for (const id of invalidated) finalMembership.set(id, finalMembership.get(id) + 1);
  for (const id of unresolvedSurvivors) finalMembership.set(id, finalMembership.get(id) + 1);
  if ([...finalMembership.values()].some(count => count !== 1)) fail('BATTLE_ACTION_ORDER_FINAL_STATE_NOT_PARTITIONED');

  if (!Array.isArray(resolution.steps)) fail('BATTLE_ACTION_ORDER_STEPS_INVALID');
  const processedIds = new Set();
  const steps = resolution.steps.map((raw, stepIndex) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('BATTLE_ACTION_ORDER_STEP_INVALID');
    const processedParticipantId = requireId(raw.processedPlayerId, 'BATTLE_ACTION_ORDER_STEP_PARTICIPANT_INVALID');
    if (!known.has(processedParticipantId)) fail(`BATTLE_ACTION_ORDER_STEP_PARTICIPANT_UNKNOWN:${processedParticipantId}`);
    if (processedIds.has(processedParticipantId)) fail('BATTLE_ACTION_ORDER_STEP_PARTICIPANT_DUPLICATE');
    processedIds.add(processedParticipantId);
    if (typeof raw.resolvedWinner !== 'boolean') fail('BATTLE_ACTION_ORDER_STEP_WINNER_FLAG_INVALID');
    const invalidatedParticipantIds = requireIdArray(raw.invalidated, 'BATTLE_ACTION_ORDER_STEP_INVALIDATED_INVALID');
    const survivorParticipantIds = requireIdArray(raw.survivors, 'BATTLE_ACTION_ORDER_STEP_SURVIVORS_INVALID');
    assertKnownIds(invalidatedParticipantIds, known, 'BATTLE_ACTION_ORDER_STEP_INVALIDATED_UNKNOWN');
    assertKnownIds(survivorParticipantIds, known, 'BATTLE_ACTION_ORDER_STEP_SURVIVOR_UNKNOWN');
    if (invalidatedParticipantIds.includes(processedParticipantId)) fail('BATTLE_ACTION_ORDER_STEP_INVALIDATES_SELF');
    if (raw.resolvedWinner && !resolvedWinners.includes(processedParticipantId)) fail('BATTLE_ACTION_ORDER_STEP_WINNER_CONTRADICTS_FINAL');
    return {
      stepIndex,
      processedParticipantId,
      winningHand: optionalString(raw.winningHand, 'BATTLE_ACTION_ORDER_STEP_HAND_INVALID'),
      resolvedWinner: raw.resolvedWinner,
      invalidatedParticipantIds,
      survivorParticipantIds
    };
  });

  return { processingOrder, resolvedWinners, invalidated, unresolvedSurvivors, steps };
}

function finalStateFor(participantId, resolution) {
  if (resolution.resolvedWinners.includes(participantId)) return 'RESOLVED_WIN';
  if (resolution.invalidated.includes(participantId)) return 'INVALIDATED';
  return 'UNRESOLVED';
}

export function projectBattleActionOrderChain({
  orderedCards,
  resolution,
  reducedMotion = false,
  lowPerf = false
} = {}) {
  const cards = normalizeOrderedCards(orderedCards);
  const participantIds = cards.map(card => card.participantId);
  const safeResolution = normalizeResolution(resolution, participantIds);
  const cardByParticipant = new Map(cards.map(card => [card.participantId, card]));

  const projectedCards = cards.map(card => ({
    ...card,
    finalState: finalStateFor(card.participantId, safeResolution)
  }));

  const steps = safeResolution.steps.map(step => {
    const processed = cardByParticipant.get(step.processedParticipantId);
    return {
      ...step,
      processedCardId: processed.cardId,
      processedOrderIndex: processed.orderIndex,
      processedOrderBadge: processed.orderBadge,
      invalidatedCardIds: step.invalidatedParticipantIds.map(id => cardByParticipant.get(id).cardId),
      survivorCardIds: step.survivorParticipantIds.map(id => cardByParticipant.get(id).cardId)
    };
  });

  const model = {
    schema: SCHEMA,
    presentationOnly: true,
    gameplayAuthority: false,
    gameStateWrite: false,
    orderCalculation: false,
    winnerCalculation: false,
    targetCalculation: false,
    secretProjectionAuthority: false,
    authorityBoundary: 'caller_authoritative_processing_order_plus_existing_triad_resolution',
    orderSource: 'caller_supplied_authoritative_processing_order',
    finalStateVocabulary: [...FINAL_STATES],
    motion: reducedMotion === true || lowPerf === true ? 'static_only' : 'presentation_allowed',
    reducedMotion: reducedMotion === true,
    lowPerf: lowPerf === true,
    processingOrderParticipantIds: [...safeResolution.processingOrder],
    processingOrderCardIds: cards.map(card => card.cardId),
    cards: projectedCards,
    steps
  };
  return deepFreeze(model);
}

export function auditBattleActionOrderPresentation(model) {
  const defects = [];
  if (!model || model.schema !== SCHEMA) defects.push('SCHEMA');
  if (model?.presentationOnly !== true || model?.gameplayAuthority !== false || model?.gameStateWrite !== false) defects.push('AUTHORITY');
  if (model?.orderCalculation !== false || model?.winnerCalculation !== false || model?.targetCalculation !== false || model?.secretProjectionAuthority !== false) defects.push('RECALCULATION');
  if (!Array.isArray(model?.cards) || model.cards.length < 1 || model.cards.length > 4) defects.push('CARDS');
  if (Array.isArray(model?.cards)) {
    if (new Set(model.cards.map(card => card.participantId)).size !== model.cards.length) defects.push('PARTICIPANT_IDENTITY');
    if (new Set(model.cards.map(card => card.cardId)).size !== model.cards.length) defects.push('CARD_IDENTITY');
    if (model.cards.some(card => !FINAL_STATES.includes(card.finalState))) defects.push('FINAL_STATE');
  }
  if (!Array.isArray(model?.processingOrderParticipantIds) || !Array.isArray(model?.processingOrderCardIds)) defects.push('ORDER');
  if (model?.motion !== 'presentation_allowed' && model?.motion !== 'static_only') defects.push('MOTION');
  return deepFreeze({ ok: defects.length === 0, defects });
}

export const BATTLE_ACTION_ORDER_PRESENTATION = deepFreeze({
  schema: SCHEMA,
  authority: 'NONE_PRESENTATION_ONLY',
  orderAuthority: 'CALLER',
  resolutionAuthority: 'EXISTING_TRIAD_RESOLVER_OUTPUT',
  finalStates: [...FINAL_STATES],
  sortingOwnedHere: false,
  invalidatedDestinationOwnedHere: false
});
