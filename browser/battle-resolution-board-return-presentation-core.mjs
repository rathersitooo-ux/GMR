export const BATTLE_RESOLUTION_BOARD_RETURN_SCHEMA = 'gameroad.battle-resolution-board-return-presentation.v1';

const SHIELD_LANES = new Set(['L', 'C', 'R']);
const FINAL_ORDER_STATES = new Set(['resolved-win', 'unresolved-final', 'invalidated']);

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

function optionalString(value, code) {
  if (value == null) return null;
  return requiredString(value, code);
}

function cloneAcceptedPath(path) {
  if (!Array.isArray(path) || path.length === 0) fail('BATTLE_CAUSAL_RETURN_PATH_REQUIRED');
  try {
    return JSON.parse(JSON.stringify(path));
  } catch {
    fail('BATTLE_CAUSAL_RETURN_PATH_INVALID');
  }
}

function normalizeBoardReturn(boardReturn) {
  if (!boardReturn || typeof boardReturn !== 'object' || Array.isArray(boardReturn)) {
    fail('BATTLE_CAUSAL_RETURN_BOARD_RETURN_REQUIRED');
  }
  if (boardReturn.source !== 'accepted_public_compound_attack_package') {
    fail('BATTLE_CAUSAL_RETURN_SOURCE_NOT_ACCEPTED');
  }
  if (boardReturn.visualIntent !== 'resolution_to_committed_shield') {
    fail('BATTLE_CAUSAL_RETURN_VISUAL_INTENT_INVALID');
  }
  if (boardReturn.effectMutationClaimed !== false) {
    fail('BATTLE_CAUSAL_RETURN_EFFECT_AUTHORITY_FORBIDDEN');
  }

  const eventId = requiredString(boardReturn.eventId, 'BATTLE_CAUSAL_RETURN_EVENT_ID_REQUIRED');
  const cardId = requiredString(boardReturn.cardId, 'BATTLE_CAUSAL_RETURN_CARD_ID_REQUIRED');
  const jankenHand = requiredString(boardReturn.jankenHand, 'BATTLE_CAUSAL_RETURN_JANKEN_HAND_REQUIRED');
  const opponentId = requiredString(boardReturn.opponentId, 'BATTLE_CAUSAL_RETURN_OPPONENT_REQUIRED');
  const shieldLane = requiredString(boardReturn.shieldLane, 'BATTLE_CAUSAL_RETURN_SHIELD_LANE_REQUIRED').toUpperCase();
  if (!SHIELD_LANES.has(shieldLane)) fail('BATTLE_CAUSAL_RETURN_SHIELD_LANE_INVALID');

  const destinationKey = requiredString(boardReturn.destinationKey, 'BATTLE_CAUSAL_RETURN_DESTINATION_KEY_REQUIRED');
  if (destinationKey !== `${opponentId}:${shieldLane}`) {
    fail('BATTLE_CAUSAL_RETURN_DESTINATION_KEY_MISMATCH');
  }

  return deepFreeze({
    eventId,
    cardId,
    jankenHand,
    opponentId,
    shieldLane,
    shieldRef: optionalString(boardReturn.shieldRef, 'BATTLE_CAUSAL_RETURN_SHIELD_REF_INVALID'),
    destinationKey,
    path: cloneAcceptedPath(boardReturn.path),
    direction: optionalString(boardReturn.direction, 'BATTLE_CAUSAL_RETURN_DIRECTION_INVALID'),
    roadId: optionalString(boardReturn.roadId, 'BATTLE_CAUSAL_RETURN_ROAD_INVALID'),
    battleId: optionalString(boardReturn.battleId, 'BATTLE_CAUSAL_RETURN_BATTLE_INVALID'),
  });
}

function normalizeUniqueIds(value, code) {
  if (!Array.isArray(value)) fail(code);
  const ids = value.map((entry) => requiredString(entry, code));
  if (new Set(ids).size !== ids.length) fail(`${code}_DUPLICATE`);
  return ids;
}

function normalizeOrderChain(orderChain) {
  if (orderChain == null) return null;
  if (!orderChain || typeof orderChain !== 'object' || Array.isArray(orderChain)) {
    fail('BATTLE_CAUSAL_RETURN_ORDER_CHAIN_INVALID');
  }

  const processingOrder = normalizeUniqueIds(
    orderChain.processingOrder,
    'BATTLE_CAUSAL_RETURN_PROCESSING_ORDER_INVALID',
  );
  const processedOrder = normalizeUniqueIds(
    orderChain.processedOrder,
    'BATTLE_CAUSAL_RETURN_PROCESSED_ORDER_INVALID',
  );
  const processingSet = new Set(processingOrder);
  for (const playerId of processedOrder) {
    if (!processingSet.has(playerId)) fail('BATTLE_CAUSAL_RETURN_PROCESSED_ORDER_OUTSIDE_PROCESSING_ORDER');
  }

  if (!Array.isArray(orderChain.finalSlots) || orderChain.finalSlots.length !== processingOrder.length) {
    fail('BATTLE_CAUSAL_RETURN_FINAL_SLOTS_INVALID');
  }
  const finalSlots = orderChain.finalSlots.map((slot, index) => {
    if (!slot || typeof slot !== 'object' || Array.isArray(slot)) {
      fail('BATTLE_CAUSAL_RETURN_FINAL_SLOT_INVALID');
    }
    const playerId = requiredString(slot.playerId, 'BATTLE_CAUSAL_RETURN_FINAL_SLOT_PLAYER_INVALID');
    if (playerId !== processingOrder[index]) fail('BATTLE_CAUSAL_RETURN_FINAL_SLOT_ORDER_MISMATCH');
    const visualState = requiredString(slot.visualState, 'BATTLE_CAUSAL_RETURN_FINAL_SLOT_STATE_INVALID');
    if (!FINAL_ORDER_STATES.has(visualState)) fail('BATTLE_CAUSAL_RETURN_FINAL_SLOT_STATE_UNKNOWN');
    return deepFreeze({
      playerId,
      cardId: optionalString(slot.cardId, 'BATTLE_CAUSAL_RETURN_FINAL_SLOT_CARD_INVALID'),
      displayNumber: slot.displayNumber ?? null,
      hand: slot.hand ?? null,
      visualState,
    });
  });

  return deepFreeze({
    source: 'caller_supplied_authoritative_order_projection',
    processingOrder: [...processingOrder],
    processedOrder: [...processedOrder],
    finalSlots,
  });
}

function motionProjection({ reducedMotion, lowPerf, hasProcessing }) {
  if (reducedMotion === true || lowPerf === true) {
    return deepFreeze({
      mode: 'static_causal_trace',
      animateAcceptedPath: false,
      animateProcessingCollapse: false,
      destinationSettlePulse: false,
      preserveStageOrder: true,
    });
  }
  return deepFreeze({
    mode: 'causal_return',
    animateAcceptedPath: true,
    animateProcessingCollapse: hasProcessing,
    destinationSettlePulse: true,
    preserveStageOrder: true,
  });
}

function buildStages(boardReturn, processing) {
  const stages = [
    deepFreeze({
      kind: 'cause',
      eventId: boardReturn.eventId,
      cardId: boardReturn.cardId,
      jankenHand: boardReturn.jankenHand,
      authority: 'accepted_settle_compound_attack_identity',
    }),
  ];

  if (processing) {
    stages.push(deepFreeze({
      kind: 'processing',
      processingOrder: [...processing.processingOrder],
      processedOrder: [...processing.processedOrder],
      finalSlots: processing.finalSlots,
      authority: processing.source,
    }));
  }

  stages.push(
    deepFreeze({
      kind: 'accepted_resolution',
      eventId: boardReturn.eventId,
      authority: 'accepted_settle_event_only',
      winnerInferred: false,
      effectInferred: false,
    }),
    deepFreeze({
      kind: 'return_path',
      path: cloneAcceptedPath(boardReturn.path),
      direction: boardReturn.direction,
      roadId: boardReturn.roadId,
      battleId: boardReturn.battleId,
      authority: 'accepted_compound_attack_path_only',
    }),
    deepFreeze({
      kind: 'destination',
      opponentId: boardReturn.opponentId,
      shieldLane: boardReturn.shieldLane,
      shieldRef: boardReturn.shieldRef,
      destinationKey: boardReturn.destinationKey,
      authority: 'accepted_committed_shield_destination_only',
    }),
  );

  return Object.freeze(stages);
}

/**
 * Presentation-only projection for a Battle result that has already reached the
 * accepted settle/boardReturn boundary. It never resolves janken, picks a target,
 * computes an effect, checks legality, or changes the accepted route.
 */
export function projectBattleResolutionBoardReturn({
  boardReturn,
  orderChain = null,
  reducedMotion = false,
  lowPerf = false,
} = {}) {
  const normalizedReturn = normalizeBoardReturn(boardReturn);
  const processing = normalizeOrderChain(orderChain);
  const stages = buildStages(normalizedReturn, processing);

  return deepFreeze({
    schema: BATTLE_RESOLUTION_BOARD_RETURN_SCHEMA,
    presentationOnly: true,
    gameplayAuthority: false,
    gameStateWrite: false,
    targetCalculation: false,
    winnerCalculation: false,
    effectCalculation: false,
    legalityCalculation: false,
    routeCalculation: false,
    eventId: normalizedReturn.eventId,
    traceKey: `${normalizedReturn.eventId}:${normalizedReturn.destinationKey}`,
    sourceCard: {
      cardId: normalizedReturn.cardId,
      jankenHand: normalizedReturn.jankenHand,
    },
    processing,
    destination: {
      opponentId: normalizedReturn.opponentId,
      shieldLane: normalizedReturn.shieldLane,
      shieldRef: normalizedReturn.shieldRef,
      destinationKey: normalizedReturn.destinationKey,
    },
    acceptedPath: normalizedReturn.path,
    stages,
    motion: motionProjection({
      reducedMotion: reducedMotion === true,
      lowPerf: lowPerf === true,
      hasProcessing: processing !== null,
    }),
  });
}

export function auditBattleResolutionBoardReturnProjection(projection) {
  const defects = [];
  if (!projection || projection.schema !== BATTLE_RESOLUTION_BOARD_RETURN_SCHEMA) defects.push('SCHEMA');
  if (projection?.presentationOnly !== true || projection?.gameplayAuthority !== false || projection?.gameStateWrite !== false) defects.push('AUTHORITY');
  if (projection?.targetCalculation !== false || projection?.winnerCalculation !== false || projection?.effectCalculation !== false || projection?.legalityCalculation !== false || projection?.routeCalculation !== false) defects.push('RECALCULATION');
  if (!Array.isArray(projection?.stages) || projection.stages[0]?.kind !== 'cause' || projection.stages.at(-1)?.kind !== 'destination') defects.push('CAUSAL_STAGES');
  if (!Array.isArray(projection?.acceptedPath) || projection.acceptedPath.length === 0) defects.push('PATH');
  if (!SHIELD_LANES.has(projection?.destination?.shieldLane)) defects.push('SHIELD');
  if (projection?.destination?.destinationKey !== `${projection?.destination?.opponentId}:${projection?.destination?.shieldLane}`) defects.push('DESTINATION');
  if (!['causal_return', 'static_causal_trace'].includes(projection?.motion?.mode)) defects.push('MOTION');
  return deepFreeze({ ok: defects.length === 0, defects });
}

export const BATTLE_RESOLUTION_BOARD_RETURN_CONTRACT = deepFreeze({
  schema: BATTLE_RESOLUTION_BOARD_RETURN_SCHEMA,
  authority: 'NONE_PRESENTATION_ONLY',
  requiredSource: 'battle-screen-presentation-core accepted settle boardReturn',
  optionalProcessingSource: 'caller-supplied authoritative order-chain projection',
  targetCalculation: false,
  winnerCalculation: false,
  effectCalculation: false,
  legalityCalculation: false,
  routeCalculation: false,
  liveMountOwnedHere: false,
  destinationKinds: Object.freeze(['L', 'C', 'R']),
});
