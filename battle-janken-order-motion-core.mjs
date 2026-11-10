const SCHEMA = 'gameroad.battle-janken-order-motion.v1';
const FRAME_STATES = new Set(['pending', 'current', 'invalidated', 'resolved-win', 'processed']);
const FINAL_STATES = new Set(['resolved-win', 'invalidated', 'unresolved-final']);

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

function requireUniqueIds(value, code) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 4) fail(code);
  const ids = value.map((id) => requireId(id, code));
  if (new Set(ids).size !== ids.length) fail(`${code}_DUPLICATE`);
  return ids;
}

function assertExactOrder(actual, expected, code) {
  if (!Array.isArray(actual) || actual.length !== expected.length) fail(code);
  for (let index = 0; index < expected.length; index += 1) {
    if (actual[index] !== expected[index]) fail(code);
  }
}

function normalizeOrderSlots(chain, processingOrder) {
  if (!Array.isArray(chain.orderSlots) || chain.orderSlots.length !== processingOrder.length) {
    fail('BATTLE_ORDER_MOTION_ORDER_SLOTS_INVALID');
  }

  const slots = chain.orderSlots.map((raw, index) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('BATTLE_ORDER_MOTION_ORDER_SLOT_INVALID');
    const playerId = requireId(raw.playerId, 'BATTLE_ORDER_MOTION_PLAYER_ID_INVALID');
    if (playerId !== processingOrder[index]) fail('BATTLE_ORDER_MOTION_ORDER_SLOT_MISMATCH');
    if (raw.sequenceIndex !== index) fail('BATTLE_ORDER_MOTION_SEQUENCE_INDEX_MISMATCH');
    const cardId = raw.cardId == null ? null : requireId(raw.cardId, 'BATTLE_ORDER_MOTION_CARD_ID_INVALID');
    return {
      playerId,
      cardId,
      displayNumber: raw.displayNumber ?? null,
      hand: raw.hand ?? null,
      sequenceIndex: index,
      receivesProcessingPass: raw.receivesProcessingPass === true,
      skipped: raw.skipped === true,
      finalState: raw.finalState ?? null
    };
  });

  const cardIds = slots.map((slot) => slot.cardId).filter((id) => id != null);
  if (new Set(cardIds).size !== cardIds.length) fail('BATTLE_ORDER_MOTION_CARD_ID_DUPLICATE');
  return slots;
}

function normalizeSequenceEdges(chain, processingOrder) {
  const expectedCount = Math.max(0, processingOrder.length - 1);
  if (!Array.isArray(chain.sequenceEdges) || chain.sequenceEdges.length !== expectedCount) {
    fail('BATTLE_ORDER_MOTION_SEQUENCE_EDGES_INVALID');
  }

  return chain.sequenceEdges.map((raw, index) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('BATTLE_ORDER_MOTION_SEQUENCE_EDGE_INVALID');
    if (raw.kind !== 'sequence') fail('BATTLE_ORDER_MOTION_SEQUENCE_EDGE_KIND_INVALID');
    const fromPlayerId = requireId(raw.fromPlayerId, 'BATTLE_ORDER_MOTION_SEQUENCE_FROM_INVALID');
    const toPlayerId = requireId(raw.toPlayerId, 'BATTLE_ORDER_MOTION_SEQUENCE_TO_INVALID');
    if (fromPlayerId !== processingOrder[index] || toPlayerId !== processingOrder[index + 1]) {
      fail('BATTLE_ORDER_MOTION_SEQUENCE_EDGE_ORDER_MISMATCH');
    }
    return { kind: 'sequence', fromPlayerId, toPlayerId, sequenceIndex: index };
  });
}

function normalizeFrames(chain, processingOrder) {
  if (!Array.isArray(chain.frames) || chain.frames.length > processingOrder.length) {
    fail('BATTLE_ORDER_MOTION_FRAMES_INVALID');
  }

  const currentSeen = new Set();
  return chain.frames.map((raw, frameIndex) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('BATTLE_ORDER_MOTION_FRAME_INVALID');
    if (raw.stepIndex !== frameIndex) fail('BATTLE_ORDER_MOTION_STEP_INDEX_MISMATCH');
    const currentPlayerId = requireId(raw.currentPlayerId, 'BATTLE_ORDER_MOTION_CURRENT_PLAYER_INVALID');
    if (!processingOrder.includes(currentPlayerId)) fail('BATTLE_ORDER_MOTION_CURRENT_PLAYER_UNKNOWN');
    if (currentSeen.has(currentPlayerId)) fail('BATTLE_ORDER_MOTION_CURRENT_PLAYER_DUPLICATE');
    currentSeen.add(currentPlayerId);

    if (!Array.isArray(raw.slots) || raw.slots.length !== processingOrder.length) {
      fail('BATTLE_ORDER_MOTION_FRAME_SLOTS_INVALID');
    }

    const slotPlayerIds = raw.slots.map((slot) => requireId(slot?.playerId, 'BATTLE_ORDER_MOTION_FRAME_SLOT_PLAYER_INVALID'));
    assertExactOrder(slotPlayerIds, processingOrder, 'BATTLE_ORDER_MOTION_FRAME_SLOT_ORDER_MISMATCH');

    let currentCount = 0;
    const slots = raw.slots.map((slot) => {
      if (!FRAME_STATES.has(slot.visualState)) fail('BATTLE_ORDER_MOTION_FRAME_VISUAL_STATE_INVALID');
      if (slot.visualState === 'current') {
        currentCount += 1;
        if (slot.playerId !== currentPlayerId) fail('BATTLE_ORDER_MOTION_CURRENT_STATE_MISMATCH');
      }
      return {
        playerId: slot.playerId,
        cardId: slot.cardId ?? null,
        sequenceIndex: slot.sequenceIndex,
        sourceVisualState: slot.visualState
      };
    });
    if (currentCount !== 1) fail('BATTLE_ORDER_MOTION_CURRENT_STATE_COUNT_INVALID');

    return {
      stepIndex: frameIndex,
      currentPlayerId,
      currentResolvedWinner: raw.currentResolvedWinner === true,
      slots
    };
  });
}

function normalizeFinalSlots(chain, processingOrder) {
  if (!Array.isArray(chain.finalSlots) || chain.finalSlots.length !== processingOrder.length) {
    fail('BATTLE_ORDER_MOTION_FINAL_SLOTS_INVALID');
  }
  const playerIds = chain.finalSlots.map((slot) => requireId(slot?.playerId, 'BATTLE_ORDER_MOTION_FINAL_PLAYER_INVALID'));
  assertExactOrder(playerIds, processingOrder, 'BATTLE_ORDER_MOTION_FINAL_ORDER_MISMATCH');

  return chain.finalSlots.map((slot) => {
    if (!FINAL_STATES.has(slot.visualState)) fail('BATTLE_ORDER_MOTION_FINAL_STATE_INVALID');
    return {
      playerId: slot.playerId,
      cardId: slot.cardId ?? null,
      sequenceIndex: slot.sequenceIndex,
      sourceFinalState: slot.visualState
    };
  });
}

function fullActionFor(state) {
  if (state === 'current') return 'current-pop';
  if (state === 'processed' || state === 'resolved-win') return 'processed-retreat';
  if (state === 'invalidated') return 'invalidated-stay-skip';
  return 'hold';
}

function semanticOnlyActionFor(state) {
  if (state === 'current') return 'current-emphasis';
  if (state === 'processed' || state === 'resolved-win') return 'processed-settled';
  if (state === 'invalidated') return 'invalidated-stay-skip';
  return 'hold';
}

function finalActionFor(state) {
  if (state === 'resolved-win') return 'final-settled-win';
  if (state === 'invalidated') return 'final-settled-invalidated';
  return 'final-settled-unresolved';
}

export function buildBattleJankenOrderMotion({ chain, reducedMotion = false, lowPerf = false } = {}) {
  if (!chain || typeof chain !== 'object' || Array.isArray(chain)) fail('BATTLE_ORDER_MOTION_CHAIN_INVALID');

  const processingOrder = requireUniqueIds(chain.processingOrder, 'BATTLE_ORDER_MOTION_PROCESSING_ORDER_INVALID');
  const orderSlots = normalizeOrderSlots(chain, processingOrder);
  const sequenceEdges = normalizeSequenceEdges(chain, processingOrder);
  const frames = normalizeFrames(chain, processingOrder);
  const finalSlots = normalizeFinalSlots(chain, processingOrder);
  const semanticOnly = reducedMotion === true || lowPerf === true;
  const actionFor = semanticOnly ? semanticOnlyActionFor : fullActionFor;

  const sequenceBuild = sequenceEdges.map((edge) => ({
    phase: 'order-link-establish',
    sequenceIndex: edge.sequenceIndex,
    fromPlayerId: edge.fromPlayerId,
    toPlayerId: edge.toPlayerId,
    action: semanticOnly ? 'link-visible-static' : 'link-establish'
  }));

  const steps = frames.map((frame) => ({
    phase: 'processing-step',
    stepIndex: frame.stepIndex,
    currentPlayerId: frame.currentPlayerId,
    slots: frame.slots.map((slot) => ({
      ...slot,
      action: actionFor(slot.sourceVisualState)
    }))
  }));

  const finalSettle = finalSlots.map((slot) => ({
    ...slot,
    action: finalActionFor(slot.sourceFinalState)
  }));

  return deepFreeze({
    schema: SCHEMA,
    presentationOnly: true,
    gameplayAuthority: false,
    gameStateWrite: false,
    orderCalculation: false,
    comparisonCalculation: false,
    winnerCalculation: false,
    targetCalculation: false,
    physicalTimingAuthority: false,
    sourceAuthority: 'workunit27_authoritative_order_chain_projection',
    motionMode: semanticOnly ? 'semantic-only' : 'full',
    reducedMotion: reducedMotion === true,
    lowPerf: lowPerf === true,
    processingOrder: [...processingOrder],
    subjects: orderSlots.map((slot) => ({
      playerId: slot.playerId,
      cardId: slot.cardId,
      sequenceIndex: slot.sequenceIndex,
      skipped: slot.skipped
    })),
    sequenceBuild,
    steps,
    finalSettle
  });
}

export function auditBattleJankenOrderMotion(model) {
  const defects = [];
  if (!model || model.schema !== SCHEMA) defects.push('SCHEMA');
  if (model?.presentationOnly !== true || model?.gameplayAuthority !== false || model?.gameStateWrite !== false) defects.push('AUTHORITY');
  if (model?.orderCalculation !== false || model?.comparisonCalculation !== false || model?.winnerCalculation !== false || model?.targetCalculation !== false) defects.push('RECALCULATION');
  if (model?.physicalTimingAuthority !== false) defects.push('TIMING_AUTHORITY');
  if (!Array.isArray(model?.processingOrder) || model.processingOrder.length < 1 || model.processingOrder.length > 4) defects.push('ORDER');
  if (!Array.isArray(model?.subjects) || model.subjects.length !== model?.processingOrder?.length) defects.push('SUBJECTS');
  if (!Array.isArray(model?.sequenceBuild) || !Array.isArray(model?.steps) || !Array.isArray(model?.finalSettle)) defects.push('TIMELINE');
  if (model?.motionMode !== 'full' && model?.motionMode !== 'semantic-only') defects.push('MOTION_MODE');
  return deepFreeze({ ok: defects.length === 0, defects });
}

export const BATTLE_JANKEN_ORDER_MOTION = deepFreeze({
  schema: SCHEMA,
  authority: 'NONE_PRESENTATION_ONLY',
  sourceAuthority: 'WORKUNIT27_ORDER_CHAIN',
  sortingOwnedHere: false,
  comparisonOwnedHere: false,
  gameplayOwnedHere: false,
  physicalTimingOwnedHere: false,
  invalidatedCardsRemainInOrderSlot: true
});
