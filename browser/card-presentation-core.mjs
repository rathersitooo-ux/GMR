const SCHEMA = 'gameroad.card-presentation.v1';
const PRESENTATION_KINDS = Object.freeze(['scan', 'summon', 'finisher', 'vfx', 'sfx']);
const VISIBILITY_SCOPES = Object.freeze(['public', 'owner']);

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
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

export function createCardPresentationSession({ sessionId } = {}) {
  if (!nonEmptyString(sessionId)) throw new TypeError('SESSION_ID_REQUIRED');
  return deepFreeze({
    schema: SCHEMA,
    sessionId,
    seenEventIds: [],
  });
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

export const CARD_PRESENTATION_CORE = Object.freeze({
  schema: SCHEMA,
  presentationKinds: PRESENTATION_KINDS,
  visibilityScopes: VISIBILITY_SCOPES,
});
