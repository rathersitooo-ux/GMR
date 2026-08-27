const SCHEMA = 'GAMEROAD_BATTLE_RESULT_PRESENTATION_BRIDGE_V1';
const AUTOQUEUE_STATUSES = new Set([
  'idle', 'disabled', 'ineligible', 'starting', 'searching',
  'cancel_requested', 'cancelled', 'matched', 'connecting', 'failed'
]);
const CARD_KINDS = new Set(['scan', 'summon']);
const MODE = Object.freeze({ FULL: 'full', REDUCED: 'reduced', LOW_PERF: 'low_perf' });

function plainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function cloneJson(value) {
  if (value === undefined) return undefined;
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new TypeError('NON_JSON_VALUE');
  return JSON.parse(encoded);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function reject(reason) {
  return deepFreeze({ ok: false, reason });
}

function resolveMode(preferences = {}) {
  if (preferences.lowPerf === true) return MODE.LOW_PERF;
  if (preferences.reducedMotion === true) return MODE.REDUCED;
  return MODE.FULL;
}

function visualPolicy(mode) {
  if (mode === MODE.LOW_PERF) {
    return deepFreeze({ motion: 'instant', particles: 'disabled', optionalLayers: 'disabled' });
  }
  if (mode === MODE.REDUCED) {
    return deepFreeze({ motion: 'reduced', particles: 'disabled', optionalLayers: 'limited' });
  }
  return deepFreeze({ motion: 'full', particles: 'allowed', optionalLayers: 'allowed' });
}

function projectConveyorPlans(plans) {
  if (plans == null) return { ok: true, value: [] };
  if (!Array.isArray(plans)) return { ok: false, reason: 'CONVEYOR_PLANS_INVALID' };
  const projected = [];
  for (const plan of plans) {
    if (!plainObject(plan) || plan.presentationOnly !== true ||
        plan.authorityBoundary !== 'accepted_public_event_only' ||
        !nonEmptyString(plan.eventId) || !nonEmptyString(plan.kind)) {
      return { ok: false, reason: 'CONVEYOR_PLAN_UNTRUSTED' };
    }
    const publicData = plainObject(plan.publicData) ? cloneJson(plan.publicData) : {};
    if (plan.kind === 'partner_cutin') {
      if (!nonEmptyString(publicData.partnerId)) return { ok: false, reason: 'PARTNER_ID_REQUIRED' };
      projected.push({
        type: 'partner_cutin',
        eventId: plan.eventId,
        partnerId: publicData.partnerId,
        transition: plan.transition ?? null
      });
      continue;
    }
    if (plan.kind === 'compare4') {
      if (!Array.isArray(publicData.playerIds) || publicData.playerIds.length !== 4 ||
          publicData.playerIds.some(id => !nonEmptyString(id))) {
        return { ok: false, reason: 'COMPARE_PLAYERS_REQUIRED' };
      }
      if (!nonEmptyString(publicData.winnerId) || !publicData.playerIds.includes(publicData.winnerId)) {
        return { ok: false, reason: 'COMPARE_EXPLICIT_WINNER_REQUIRED' };
      }
      projected.push({
        type: 'compare4',
        eventId: plan.eventId,
        playerIds: cloneJson(publicData.playerIds),
        winnerId: publicData.winnerId,
        comparePayload: publicData.comparePayload === undefined ? null : cloneJson(publicData.comparePayload),
        transition: plan.transition ?? null
      });
      continue;
    }
    projected.push({
      type: plan.kind,
      eventId: plan.eventId,
      transition: plan.transition ?? null,
      publicData
    });
  }
  return { ok: true, value: projected };
}

function projectCard(card) {
  if (card == null) return { ok: true, value: null };
  if (!plainObject(card) || !plainObject(card.plan) || !plainObject(card.identity)) {
    return { ok: false, reason: 'CARD_BRIDGE_INVALID' };
  }
  const { plan, identity } = card;
  if (plan.presentationOnly !== true || !nonEmptyString(plan.eventId) || !CARD_KINDS.has(plan.kind)) {
    return { ok: false, reason: 'CARD_PLAN_UNTRUSTED' };
  }
  if (!nonEmptyString(identity.eventId) || identity.eventId !== plan.eventId) {
    return { ok: false, reason: 'CARD_EVENT_ID_MISMATCH' };
  }
  for (const key of ['cardId', 'actionId', 'characterId']) {
    if (!nonEmptyString(identity[key])) return { ok: false, reason: `CARD_${key.toUpperCase()}_REQUIRED` };
  }
  return {
    ok: true,
    value: {
      type: `card_${plan.kind}`,
      eventId: plan.eventId,
      kind: plan.kind,
      cardId: identity.cardId,
      actionId: identity.actionId,
      characterId: identity.characterId,
      visual: cloneJson(plan.visual ?? null),
      audio: cloneJson(plan.audio ?? null),
      identityWrite: false,
      gameplayWrite: false
    }
  };
}

function projectResult(result, autoQueueSnapshot) {
  if (result == null && autoQueueSnapshot == null) return { ok: true, value: null };
  if (!plainObject(result) || result.ok !== true || !nonEmptyString(result.stage) || !('finalizedResult' in result)) {
    return { ok: false, reason: 'RESULT_PRESENTATION_INVALID' };
  }
  let queue = null;
  if (autoQueueSnapshot != null) {
    if (!plainObject(autoQueueSnapshot) || !AUTOQUEUE_STATUSES.has(autoQueueSnapshot.status)) {
      return { ok: false, reason: 'AUTOQUEUE_SNAPSHOT_INVALID' };
    }
    queue = cloneJson(autoQueueSnapshot);
  }
  return {
    ok: true,
    value: {
      type: 'result',
      stage: result.stage,
      finalizedResult: cloneJson(result.finalizedResult),
      assets: cloneJson(result.assets ?? null),
      resultEffects: cloneJson(result.effects ?? null),
      autoQueue: queue,
      autoQueueSurface: 'same_result_screen',
      queueCommand: null,
      queueWrite: false,
      resultWrite: false
    }
  };
}

function semanticProjection({ battle, card, result }) {
  return {
    battle,
    card,
    result,
    authority: {
      presentationOnly: true,
      winnerWrite: false,
      legalityWrite: false,
      resultWrite: false,
      queueWrite: false,
      cardIdentityWrite: false
    }
  };
}

export function projectBattleResultPresentationBridge(input = {}, preferences = {}) {
  if (!plainObject(input)) return reject('INPUT_INVALID');
  if (Object.prototype.hasOwnProperty.call(input, 'hate1000Presentation')) {
    return reject('HATE1000_OUT_OF_SCOPE');
  }

  const battle = projectConveyorPlans(input.conveyorPlans);
  if (!battle.ok) return reject(battle.reason);
  const card = projectCard(input.cardPresentation);
  if (!card.ok) return reject(card.reason);
  const result = projectResult(input.resultPresentation, input.autoQueueSnapshot);
  if (!result.ok) return reject(result.reason);

  const mode = resolveMode(preferences);
  const semantic = semanticProjection({
    battle: battle.value,
    card: card.value,
    result: result.value
  });

  return deepFreeze({
    ok: true,
    schema: SCHEMA,
    presentationOnly: true,
    mode,
    semantic,
    visualPolicy: visualPolicy(mode)
  });
}

export const BATTLE_RESULT_PRESENTATION_BRIDGE_CORE = deepFreeze({
  schema: SCHEMA,
  modes: MODE,
  cardKinds: [...CARD_KINDS],
  autoQueueStatuses: [...AUTOQUEUE_STATUSES]
});
