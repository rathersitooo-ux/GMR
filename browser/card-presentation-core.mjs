const SCHEMA = 'gameroad.card-presentation.v1';
const PRESENTATION_KINDS = Object.freeze(['scan', 'summon', 'finisher', 'vfx', 'sfx', 'fusion']);
const VISIBILITY_SCOPES = Object.freeze(['public', 'owner']);
const OUTFIT_FUSION_SLOTS = Object.freeze(['shoes', 'coord', 'accessory']);

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function plainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function cloneJson(value) {
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

function assertState(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return false;
  if (state.schema !== SCHEMA || !nonEmptyString(state.sessionId)) return false;
  if (!Array.isArray(state.seenEventIds)) return false;
  if (state.seenEventIds.some(id => !nonEmptyString(id))) return false;
  return new Set(state.seenEventIds).size === state.seenEventIds.length;
}

function normalizeAsset(asset) {
  if (!asset || typeof asset !== 'object' || Array.isArray(asset)) {
    return deepFreeze({ source: 'fallback' });
  }
  if (asset.status === 'formal' && nonEmptyString(asset.assetId)) {
    return deepFreeze({ source: 'formal', assetId: asset.assetId });
  }
  return deepFreeze({ source: 'fallback' });
}

function normalizePreferences(preferences) {
  const source = preferences && typeof preferences === 'object' && !Array.isArray(preferences)
    ? preferences
    : {};
  return deepFreeze({
    reducedMotion: source.reducedMotion === true,
    lowPerf: source.lowPerf === true,
    animationEnabled: source.animationEnabled !== false,
    audioEnabled: source.audioEnabled !== false,
  });
}

function reject(state, reason) {
  return deepFreeze({ accepted: false, duplicate: false, reason, state });
}

function normalizeOutfitFusionSet(set) {
  if (!plainObject(set) || !nonEmptyString(set.setId) || !Array.isArray(set.pieces) || set.pieces.length !== 3) {
    return null;
  }

  const pieces = [];
  for (const piece of set.pieces) {
    if (!plainObject(piece) || !nonEmptyString(piece.cardId) || !OUTFIT_FUSION_SLOTS.includes(piece.slotType)) {
      return null;
    }
    pieces.push({ cardId: piece.cardId, slotType: piece.slotType });
  }

  if (new Set(pieces.map(piece => piece.cardId)).size !== 3) return null;
  if (new Set(pieces.map(piece => piece.slotType)).size !== 3) return null;

  const bySlot = new Map(pieces.map(piece => [piece.slotType, piece]));
  return deepFreeze({
    setId: set.setId,
    pieces: OUTFIT_FUSION_SLOTS.map(slotType => ({
      cardId: bySlot.get(slotType).cardId,
      slotType,
    })),
  });
}

function normalizeOwnedCardIds(ownedCardIds) {
  if (!Array.isArray(ownedCardIds) || ownedCardIds.some(id => !nonEmptyString(id))) return null;
  return [...new Set(ownedCardIds)];
}

function fusionReject(state, reason, fusion = null) {
  return deepFreeze({
    accepted: false,
    duplicate: false,
    reason,
    state,
    fusion,
    presentation: null,
  });
}

export function createCardPresentationSession({ sessionId } = {}) {
  if (!nonEmptyString(sessionId)) throw new TypeError('SESSION_ID_REQUIRED');
  return deepFreeze({
    schema: SCHEMA,
    sessionId,
    seenEventIds: [],
  });
}

export function deriveOutfitFusionState({ set, ownedCardIds } = {}) {
  const normalizedSet = normalizeOutfitFusionSet(set);
  if (!normalizedSet) {
    return deepFreeze({ valid: false, reason: 'FUSION_SET_INVALID' });
  }

  const normalizedOwnedCardIds = normalizeOwnedCardIds(ownedCardIds);
  if (!normalizedOwnedCardIds) {
    return deepFreeze({ valid: false, reason: 'OWNERSHIP_INVALID' });
  }

  const owned = new Set(normalizedOwnedCardIds);
  const ownedPieces = normalizedSet.pieces.filter(piece => owned.has(piece.cardId));
  const ownedPieceCardIds = ownedPieces.map(piece => piece.cardId);
  const ownedSlots = ownedPieces.map(piece => piece.slotType);
  const missingSlots = OUTFIT_FUSION_SLOTS.filter(slotType => !ownedSlots.includes(slotType));

  return deepFreeze({
    valid: true,
    reason: 'OK',
    setId: normalizedSet.setId,
    componentCardIds: normalizedSet.pieces.map(piece => piece.cardId),
    ownedPieceCardIds,
    ownedSlots,
    missingSlots,
    complete: missingSlots.length === 0,
  });
}

export function resolveOpponentCardSkin({
  viewerPreference,
  opponentEquippedSkin,
  defaultSkin,
} = {}) {
  if (viewerPreference !== undefined && viewerPreference !== null) {
    return deepFreeze({ source: 'viewer_preference', skin: cloneJson(viewerPreference) });
  }
  if (opponentEquippedSkin !== undefined && opponentEquippedSkin !== null) {
    return deepFreeze({ source: 'opponent_equipped', skin: cloneJson(opponentEquippedSkin) });
  }
  if (defaultSkin !== undefined && defaultSkin !== null) {
    return deepFreeze({ source: 'default', skin: cloneJson(defaultSkin) });
  }
  return deepFreeze({ source: 'default', skin: null });
}

export function applyCardPresentationEvent(state, event, preferences = {}) {
  if (!assertState(state)) return reject(state, 'STATE_INVALID');
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    return reject(state, 'EVENT_INVALID');
  }
  if (!nonEmptyString(event.sessionId) || event.sessionId !== state.sessionId) {
    return reject(state, 'SESSION_MISMATCH');
  }
  if (!nonEmptyString(event.eventId)) return reject(state, 'EVENT_ID_REQUIRED');
  if (state.seenEventIds.includes(event.eventId)) {
    return deepFreeze({ accepted: true, duplicate: true, reason: 'DUPLICATE_EVENT', state, plan: null });
  }
  if (event.authorized !== true) return reject(state, 'NOT_AUTHORIZED');
  if (!VISIBILITY_SCOPES.includes(event.visibility)) return reject(state, 'VISIBILITY_INVALID');
  if (event.visibility === 'owner' && event.ownerAuthorized !== true) {
    return reject(state, 'OWNER_SCOPE_NOT_AUTHORIZED');
  }
  if (!PRESENTATION_KINDS.includes(event.kind)) return reject(state, 'KIND_INVALID');

  const prefs = normalizePreferences(preferences);
  const visualAsset = normalizeAsset(event.assets?.visual);
  const audioAsset = normalizeAsset(event.assets?.audio);
  const motionAllowed = prefs.animationEnabled && !prefs.reducedMotion && !prefs.lowPerf;

  const visual = visualAsset.source === 'formal'
    ? { source: 'formal', assetId: visualAsset.assetId, motion: motionAllowed ? 'allowed' : 'static_only' }
    : { source: 'fallback', motion: motionAllowed ? 'allowed' : 'static_only' };

  const audio = prefs.audioEnabled && audioAsset.source === 'formal'
    ? { source: 'formal', assetId: audioAsset.assetId }
    : { source: 'silent' };

  const nextState = deepFreeze({
    ...cloneJson(state),
    seenEventIds: [...state.seenEventIds, event.eventId],
  });

  const plan = deepFreeze({
    schema: SCHEMA,
    sessionId: state.sessionId,
    eventId: event.eventId,
    kind: event.kind,
    visibility: event.visibility,
    presentationOnly: true,
    visual,
    audio,
    accessibility: {
      reducedMotion: prefs.reducedMotion,
      lowPerf: prefs.lowPerf,
    },
  });

  return deepFreeze({ accepted: true, duplicate: false, reason: 'OK', state: nextState, plan });
}

export function applyOutfitFusionPresentation(state, input = {}, preferences = {}) {
  if (!assertState(state)) return fusionReject(state, 'STATE_INVALID');
  if (!plainObject(input)) return fusionReject(state, 'EVENT_INVALID');
  if (!nonEmptyString(input.eventId)) return fusionReject(state, 'EVENT_ID_REQUIRED');

  const fusion = deriveOutfitFusionState({
    set: input.set,
    ownedCardIds: input.ownedCardIds,
  });
  if (!fusion.valid) return fusionReject(state, fusion.reason);
  if (!fusion.complete) return fusionReject(state, 'FUSION_INCOMPLETE', fusion);

  const presentation = applyCardPresentationEvent(state, {
    sessionId: state.sessionId,
    eventId: input.eventId,
    authorized: input.authorized === true,
    visibility: input.visibility ?? 'owner',
    ownerAuthorized: input.ownerAuthorized === true,
    kind: 'fusion',
    assets: input.assets,
  }, preferences);

  return deepFreeze({
    accepted: presentation.accepted,
    duplicate: presentation.duplicate,
    reason: presentation.reason,
    state: presentation.state,
    fusion,
    presentation: presentation.plan,
  });
}

export const CARD_PRESENTATION_CORE = Object.freeze({
  schema: SCHEMA,
  presentationKinds: PRESENTATION_KINDS,
  visibilityScopes: VISIBILITY_SCOPES,
  outfitFusionSlots: OUTFIT_FUSION_SLOTS,
});
