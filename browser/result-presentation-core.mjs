const SCHEMA = 'GAMEROAD_RESULT_PRESENTATION_V1';
const STAGES = Object.freeze(['enter', 'reveal', 'settled', 'exit']);
const ASSET_KEYS = Object.freeze(['character', 'rankEmblem', 'rewardVisual']);
const RANK_COLOR_ROLES = Object.freeze({
  2: 'platinum',
  3: 'gold',
  4: 'silver'
});

function cloneJson(value) {
  if (value === undefined) return undefined;
  const text = JSON.stringify(value);
  if (text === undefined) throw new TypeError('NON_JSON_VALUE');
  return JSON.parse(text);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalizeAssets(assets) {
  const source = assets && typeof assets === 'object' && !Array.isArray(assets) ? assets : {};
  const availability = {};
  for (const key of ASSET_KEYS) availability[key] = source[key] === true ? 'available' : 'fallback';
  return availability;
}

function stageEffects({ reducedMotion, lowPerf }) {
  const motionEnabled = reducedMotion !== true && lowPerf !== true;
  return {
    motion: motionEnabled ? 'enabled' : 'instant',
    particles: motionEnabled ? 'enabled' : 'disabled'
  };
}

export function projectResultRankPresentation(formalRank) {
  if (!Number.isSafeInteger(formalRank) || formalRank < 1 || formalRank > 4) {
    return deepFreeze({
      ok: false,
      reason: 'FORMAL_RANK_INVALID',
      formalRank: null,
      visibleLabel: null,
      rankColorRole: null
    });
  }
  return deepFreeze({
    ok: true,
    reason: 'OK',
    formalRank,
    visibleLabel: formalRank === 1 ? '1位' : '勝利',
    rankColorRole: RANK_COLOR_ROLES[formalRank] ?? null
  });
}

function projectRankingPresentation(finalizedResult) {
  if (!Array.isArray(finalizedResult?.ranking)) return [];
  return finalizedResult.ranking.map((entry, index) => deepFreeze({
    sourceIndex: index,
    playerId: nonEmptyString(entry?.playerId) ? entry.playerId : null,
    ...projectResultRankPresentation(entry?.rank)
  }));
}

function normalizeBase({ presentationId, finalizedResult, reducedMotion = false, lowPerf = false, assets = null }) {
  if (!nonEmptyString(presentationId)) throw new TypeError('PRESENTATION_ID_REQUIRED');
  if (!finalizedResult || typeof finalizedResult !== 'object' || Array.isArray(finalizedResult)) {
    throw new TypeError('FINALIZED_RESULT_REQUIRED');
  }
  return {
    schema: SCHEMA,
    presentationId,
    stage: 'enter',
    sequence: 0,
    seenEventIds: [],
    finalizedResult: cloneJson(finalizedResult),
    accessibility: {
      reducedMotion: reducedMotion === true,
      lowPerf: lowPerf === true
    },
    effects: stageEffects({ reducedMotion, lowPerf }),
    assets: normalizeAssets(assets)
  };
}

export function createResultPresentation(input) {
  return deepFreeze(normalizeBase(input || {}));
}

function rejection(state, reason) {
  return deepFreeze({ accepted: false, duplicate: false, reason, state });
}

export function applyResultPresentationEvent(state, event) {
  if (!state || state.schema !== SCHEMA || !STAGES.includes(state.stage)) {
    return rejection(state, 'STATE_INVALID');
  }
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    return rejection(state, 'EVENT_INVALID');
  }
  if (!nonEmptyString(event.eventId)) return rejection(state, 'EVENT_ID_REQUIRED');
  if (event.presentationId !== state.presentationId) return rejection(state, 'PRESENTATION_ID_MISMATCH');
  if (state.seenEventIds.includes(event.eventId)) {
    return deepFreeze({ accepted: true, duplicate: true, reason: 'DUPLICATE_EVENT', state });
  }
  if (!Number.isSafeInteger(event.sequence) || event.sequence < 1) return rejection(state, 'SEQUENCE_INVALID');
  const expected = state.sequence + 1;
  if (event.sequence < expected) return rejection(state, 'STALE_EVENT');
  if (event.sequence > expected) return rejection(state, 'SEQUENCE_GAP');

  const type = event.type;
  let nextStage = null;
  if (type === 'SKIP' && state.stage !== 'exit') {
    nextStage = 'settled';
  } else if (state.stage === 'enter' && type === 'REVEAL') {
    nextStage = 'reveal';
  } else if (state.stage === 'reveal' && type === 'SETTLE') {
    nextStage = 'settled';
  } else if (state.stage === 'settled' && type === 'EXIT') {
    nextStage = 'exit';
  } else {
    return rejection(state, 'STAGE_MISMATCH');
  }

  const next = deepFreeze({
    ...cloneJson(state),
    stage: nextStage,
    sequence: event.sequence,
    seenEventIds: [...state.seenEventIds, event.eventId]
  });
  return deepFreeze({ accepted: true, duplicate: false, reason: 'OK', state: next });
}

export function applyResultPresentationInput(state, input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return applyResultPresentationEvent(state, input);
  }
  return applyResultPresentationEvent(state, {
    presentationId: state?.presentationId,
    sequence: Number.isSafeInteger(state?.sequence) ? state.sequence + 1 : null,
    eventId: input.eventId,
    type: input.type
  });
}

export function projectResultPresentation(state) {
  if (!state || state.schema !== SCHEMA || !STAGES.includes(state.stage)) {
    return deepFreeze({ ok: false, reason: 'STATE_INVALID' });
  }
  return deepFreeze({
    ok: true,
    stage: state.stage,
    finalizedResult: cloneJson(state.finalizedResult),
    rankingPresentation: projectRankingPresentation(state.finalizedResult),
    effects: cloneJson(state.effects),
    assets: cloneJson(state.assets)
  });
}

export const RESULT_PRESENTATION_CORE = Object.freeze({
  schema: SCHEMA,
  stages: STAGES,
  assetKeys: ASSET_KEYS,
  rankColorRoles: RANK_COLOR_ROLES
});
