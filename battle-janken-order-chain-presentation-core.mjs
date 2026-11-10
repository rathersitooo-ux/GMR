function fail(message) {
  throw new TypeError(message);
}

function requireIdList(value, name) {
  if (!Array.isArray(value)) fail(`${name} must be an array`);
  const result = value.map((entry) => {
    if (typeof entry !== 'string' || !entry) fail(`${name} must contain non-empty player ids`);
    return entry;
  });
  if (new Set(result).size !== result.length) fail(`${name} must not contain duplicate player ids`);
  return result;
}

function requireSubset(ids, orderSet, name) {
  for (const playerId of ids) {
    if (!orderSet.has(playerId)) fail(`${name} references player outside processingOrder: ${playerId}`);
  }
}

function cloneCard(card) {
  return Object.freeze({
    playerId: card.playerId,
    cardId: card.cardId ?? null,
    displayNumber: card.displayNumber ?? null,
    hand: card.hand ?? null,
  });
}

/**
 * Pure presentation projection for an already-authoritative ordered janken result.
 *
 * This module intentionally does not sort display numbers, compare hands, resolve
 * winners, choose destinations, or mutate battle state. The caller must provide
 * the accepted `processingOrder` and `steps` emitted by battle authority.
 */
export function buildBattleJankenOrderChain({ publicCards, resolution } = {}) {
  if (!Array.isArray(publicCards)) fail('publicCards must be an array');
  if (!resolution || typeof resolution !== 'object' || Array.isArray(resolution)) {
    fail('resolution must be an object');
  }

  const processingOrder = requireIdList(resolution.processingOrder, 'processingOrder');
  const orderSet = new Set(processingOrder);
  if (!Array.isArray(resolution.steps)) fail('resolution.steps must be an array');

  const publicCardByPlayer = new Map();
  for (const card of publicCards) {
    if (!card || typeof card !== 'object' || Array.isArray(card)) fail('public card must be an object');
    if (typeof card.playerId !== 'string' || !card.playerId) fail('public card playerId must be a non-empty string');
    if (publicCardByPlayer.has(card.playerId)) fail(`duplicate public card playerId: ${card.playerId}`);
    publicCardByPlayer.set(card.playerId, cloneCard(card));
  }
  for (const playerId of processingOrder) {
    if (!publicCardByPlayer.has(playerId)) fail(`missing public card for processingOrder player: ${playerId}`);
  }

  const resolvedWinners = requireIdList(resolution.resolvedWinners, 'resolvedWinners');
  const unresolvedSurvivors = requireIdList(resolution.unresolvedSurvivors, 'unresolvedSurvivors');
  const invalidated = requireIdList(resolution.invalidated, 'invalidated');
  requireSubset(resolvedWinners, orderSet, 'resolvedWinners');
  requireSubset(unresolvedSurvivors, orderSet, 'unresolvedSurvivors');
  requireSubset(invalidated, orderSet, 'invalidated');

  const finalMembership = new Map();
  for (const [state, ids] of [
    ['resolved-win', resolvedWinners],
    ['unresolved-final', unresolvedSurvivors],
    ['invalidated', invalidated],
  ]) {
    for (const playerId of ids) {
      if (finalMembership.has(playerId)) fail(`final result overlaps for player: ${playerId}`);
      finalMembership.set(playerId, state);
    }
  }
  for (const playerId of processingOrder) {
    if (!finalMembership.has(playerId)) fail(`final result does not classify processingOrder player: ${playerId}`);
  }

  const processedIds = [];
  const invalidatedAtStep = new Map();
  const resolvedAtStep = new Map();
  const normalizedSteps = resolution.steps.map((step, stepIndex) => {
    if (!step || typeof step !== 'object' || Array.isArray(step)) fail(`step ${stepIndex} must be an object`);
    const processedPlayerId = step.processedPlayerId;
    if (typeof processedPlayerId !== 'string' || !processedPlayerId) fail(`step ${stepIndex} processedPlayerId must be a non-empty string`);
    if (!orderSet.has(processedPlayerId)) fail(`step ${stepIndex} processedPlayerId is outside processingOrder`);
    if (processedIds.includes(processedPlayerId)) fail(`processed player appears more than once: ${processedPlayerId}`);
    processedIds.push(processedPlayerId);

    const stepInvalidated = requireIdList(step.invalidated, `steps[${stepIndex}].invalidated`);
    requireSubset(stepInvalidated, orderSet, `steps[${stepIndex}].invalidated`);
    for (const playerId of stepInvalidated) {
      if (!invalidatedAtStep.has(playerId)) invalidatedAtStep.set(playerId, stepIndex);
    }
    if (step.resolvedWinner === true && !resolvedAtStep.has(processedPlayerId)) {
      resolvedAtStep.set(processedPlayerId, stepIndex);
    }

    return Object.freeze({
      stepIndex,
      processedPlayerId,
      resolvedWinner: step.resolvedWinner === true,
      winningHand: step.winningHand ?? null,
      invalidated: Object.freeze([...stepInvalidated]),
      causeEdges: Object.freeze(stepInvalidated.map((playerId) => Object.freeze({
        kind: 'invalidate',
        stepIndex,
        fromPlayerId: processedPlayerId,
        toPlayerId: playerId,
      }))),
    });
  });

  const processedSet = new Set(processedIds);
  for (const playerId of invalidated) {
    if (processedSet.has(playerId) && invalidatedAtStep.has(playerId)) {
      const passIndex = normalizedSteps.findIndex((step) => step.processedPlayerId === playerId);
      if (passIndex > invalidatedAtStep.get(playerId)) {
        fail(`invalidated player receives a later processing pass: ${playerId}`);
      }
    }
  }

  const orderSlots = processingOrder.map((playerId, sequenceIndex) => {
    const card = publicCardByPlayer.get(playerId);
    return Object.freeze({
      ...card,
      sequenceIndex,
      receivesProcessingPass: processedSet.has(playerId),
      skipped: !processedSet.has(playerId),
      finalState: finalMembership.get(playerId),
    });
  });

  const sequenceEdges = processingOrder.slice(0, -1).map((playerId, index) => Object.freeze({
    kind: 'sequence',
    fromPlayerId: playerId,
    toPlayerId: processingOrder[index + 1],
  }));

  const frames = normalizedSteps.map((step, stepIndex) => {
    const invalidatedThroughStep = new Set(
      [...invalidatedAtStep.entries()].filter(([, at]) => at <= stepIndex).map(([playerId]) => playerId),
    );
    const resolvedThroughStep = new Set(
      [...resolvedAtStep.entries()].filter(([, at]) => at <= stepIndex).map(([playerId]) => playerId),
    );
    const processedBefore = new Set(processedIds.slice(0, stepIndex));

    const slots = orderSlots.map((slot) => {
      let visualState = 'pending';
      if (slot.playerId === step.processedPlayerId) visualState = 'current';
      else if (invalidatedThroughStep.has(slot.playerId)) visualState = 'invalidated';
      else if (resolvedThroughStep.has(slot.playerId)) visualState = 'resolved-win';
      else if (processedBefore.has(slot.playerId)) visualState = 'processed';
      return Object.freeze({ ...slot, visualState });
    });

    return Object.freeze({
      stepIndex,
      currentPlayerId: step.processedPlayerId,
      currentResolvedWinner: step.resolvedWinner,
      slots: Object.freeze(slots),
      causeEdges: step.causeEdges,
    });
  });

  const finalSlots = orderSlots.map((slot) => Object.freeze({
    ...slot,
    visualState: slot.finalState,
  }));

  return Object.freeze({
    processingOrder: Object.freeze([...processingOrder]),
    processedOrder: Object.freeze([...processedIds]),
    orderSlots: Object.freeze(orderSlots),
    sequenceEdges: Object.freeze(sequenceEdges),
    frames: Object.freeze(frames),
    finalSlots: Object.freeze(finalSlots),
  });
}
