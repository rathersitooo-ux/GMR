const HATE_PEER_PRESENCE_SCHEMA = 'GAMEROAD_HATE_PEER_PRESENCE_V1';

const EVENT_KINDS = Object.freeze({
  DISCONNECT: 'disconnect',
  REJOIN: 'rejoin',
  SYNC: 'sync'
});

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function exactKeys(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function validRevision(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function validateState(state) {
  if (!exactKeys(state, ['schema', 'peerId', 'sessionId', 'revision', 'connected'])) {
    throw new TypeError('STATE_SHAPE_INVALID');
  }
  if (state.schema !== HATE_PEER_PRESENCE_SCHEMA) throw new TypeError('STATE_SCHEMA_INVALID');
  if (!nonEmptyString(state.peerId)) throw new TypeError('STATE_PEER_INVALID');
  if (!nonEmptyString(state.sessionId)) throw new TypeError('STATE_SESSION_INVALID');
  if (!validRevision(state.revision)) throw new TypeError('STATE_REVISION_INVALID');
  if (typeof state.connected !== 'boolean') throw new TypeError('STATE_CONNECTION_INVALID');
}

function freezeState({ peerId, sessionId, revision, connected }) {
  return deepFreeze({
    schema: HATE_PEER_PRESENCE_SCHEMA,
    peerId,
    sessionId,
    revision,
    connected
  });
}

function fail(state, reason) {
  return deepFreeze({ ok: false, changed: false, reason, state });
}

export function createHatePeerPresenceState(snapshot) {
  if (!exactKeys(snapshot, ['peerId', 'sessionId', 'revision', 'connected'])) {
    throw new TypeError('SNAPSHOT_SHAPE_INVALID');
  }
  if (!nonEmptyString(snapshot.peerId)) throw new TypeError('SNAPSHOT_PEER_INVALID');
  if (!nonEmptyString(snapshot.sessionId)) throw new TypeError('SNAPSHOT_SESSION_INVALID');
  if (!validRevision(snapshot.revision)) throw new TypeError('SNAPSHOT_REVISION_INVALID');
  if (typeof snapshot.connected !== 'boolean') throw new TypeError('SNAPSHOT_CONNECTION_INVALID');
  return freezeState(snapshot);
}

export function applyHatePeerPresenceEvent(state, event) {
  validateState(state);
  if (!exactKeys(event, ['kind', 'peerId', 'sessionId', 'revision'])) {
    return fail(state, 'EVENT_SHAPE_INVALID');
  }
  if (!Object.values(EVENT_KINDS).includes(event.kind)) {
    return fail(state, 'EVENT_KIND_INVALID');
  }
  if (!nonEmptyString(event.peerId)) return fail(state, 'EVENT_PEER_INVALID');
  if (!nonEmptyString(event.sessionId)) return fail(state, 'EVENT_SESSION_INVALID');
  if (!validRevision(event.revision)) return fail(state, 'EVENT_REVISION_INVALID');
  if (event.peerId !== state.peerId) return fail(state, 'EVENT_PEER_MISMATCH');
  if (event.sessionId !== state.sessionId) return fail(state, 'EVENT_SESSION_MISMATCH');
  if (event.revision <= state.revision) return fail(state, 'EVENT_STALE_OR_DUPLICATE');

  const connected = event.kind === EVENT_KINDS.DISCONNECT ? false : true;
  const next = freezeState({
    peerId: state.peerId,
    sessionId: state.sessionId,
    revision: event.revision,
    connected
  });

  return deepFreeze({
    ok: true,
    changed: true,
    status: event.kind,
    state: next
  });
}

export function projectHateHumanWaitSourceEligibility(state) {
  validateState(state);
  return deepFreeze({
    schema: HATE_PEER_PRESENCE_SCHEMA,
    peerId: state.peerId,
    sessionId: state.sessionId,
    revision: state.revision,
    eligible: state.connected
  });
}

export const HATE_PEER_PRESENCE_CORE = Object.freeze({
  schema: HATE_PEER_PRESENCE_SCHEMA,
  eventKinds: EVENT_KINDS
});

const HATE1000_PRESENTATION_SCHEMA = 'GAMEROAD_HATE1000_PRESENTATION_MOTION_V1';
const HATE1000_PRESENTATION_KIND = 'hate1000_explosion';
const HATE1000_MOTION_TIMING = deepFreeze({
  durationMs: 480,
  primaryReadDeadlineMs: 120,
  markers: {
    onsetMs: 0,
    peakMs: 60,
    ringBurstEndMs: 120,
    decayEndMs: 260,
    tailEndMs: 480
  },
  singlePeak: true,
  monotonicAfterPeak: true
});

function validateHate1000PresentationState(state) {
  if (!exactKeys(state, ['schema', 'sessionId', 'seenEventIds'])) return false;
  if (state.schema !== HATE1000_PRESENTATION_SCHEMA) return false;
  if (!nonEmptyString(state.sessionId)) return false;
  if (!Array.isArray(state.seenEventIds)) return false;
  if (state.seenEventIds.some(id => !nonEmptyString(id))) return false;
  return new Set(state.seenEventIds).size === state.seenEventIds.length;
}

function normalizeHate1000MotionPreferences(preferences) {
  const source = preferences && typeof preferences === 'object' && !Array.isArray(preferences)
    ? preferences
    : {};
  return deepFreeze({
    reducedMotion: source.reducedMotion === true,
    lowPerf: source.lowPerf === true,
    animationEnabled: source.animationEnabled !== false
  });
}

function rejectHate1000Presentation(state, reason) {
  return deepFreeze({ accepted: false, duplicate: false, reason, state });
}

export function createHate1000PresentationSession({ sessionId } = {}) {
  if (!nonEmptyString(sessionId)) throw new TypeError('HATE1000_SESSION_ID_REQUIRED');
  return deepFreeze({
    schema: HATE1000_PRESENTATION_SCHEMA,
    sessionId,
    seenEventIds: []
  });
}

export function applyHate1000PresentationEvent(state, event, preferences = {}) {
  if (!validateHate1000PresentationState(state)) {
    return rejectHate1000Presentation(state, 'HATE1000_STATE_INVALID');
  }
  if (!exactKeys(event, ['sessionId', 'eventId', 'kind', 'authorized'])) {
    return rejectHate1000Presentation(state, 'HATE1000_EVENT_SHAPE_INVALID');
  }
  if (!nonEmptyString(event.sessionId) || event.sessionId !== state.sessionId) {
    return rejectHate1000Presentation(state, 'HATE1000_SESSION_MISMATCH');
  }
  if (!nonEmptyString(event.eventId)) {
    return rejectHate1000Presentation(state, 'HATE1000_EVENT_ID_REQUIRED');
  }
  if (event.kind !== HATE1000_PRESENTATION_KIND) {
    return rejectHate1000Presentation(state, 'HATE1000_KIND_INVALID');
  }
  if (event.authorized !== true) {
    return rejectHate1000Presentation(state, 'HATE1000_NOT_AUTHORIZED');
  }
  if (state.seenEventIds.includes(event.eventId)) {
    return deepFreeze({
      accepted: true,
      duplicate: true,
      reason: 'HATE1000_DUPLICATE_EVENT',
      state,
      plan: null
    });
  }

  const prefs = normalizeHate1000MotionPreferences(preferences);
  const motionAllowed = prefs.animationEnabled && !prefs.reducedMotion && !prefs.lowPerf;
  const nextState = deepFreeze({
    schema: HATE1000_PRESENTATION_SCHEMA,
    sessionId: state.sessionId,
    seenEventIds: [...state.seenEventIds, event.eventId]
  });

  const plan = deepFreeze({
    schema: HATE1000_PRESENTATION_SCHEMA,
    sessionId: state.sessionId,
    eventId: event.eventId,
    kind: HATE1000_PRESENTATION_KIND,
    presentationOnly: true,
    oneShot: true,
    layoutAuthority: false,
    assetAuthority: 'unbound_candidate',
    mode: motionAllowed ? 'motion' : 'static',
    motion: motionAllowed ? HATE1000_MOTION_TIMING : null,
    static: motionAllowed ? null : {
      retainMeaning: true,
      reason: prefs.reducedMotion ? 'reduced_motion' : prefs.lowPerf ? 'low_perf' : 'animation_disabled'
    },
    accessibility: {
      reducedMotion: prefs.reducedMotion,
      lowPerf: prefs.lowPerf
    }
  });

  return deepFreeze({
    accepted: true,
    duplicate: false,
    reason: 'HATE1000_OK',
    state: nextState,
    plan
  });
}

export const HATE1000_PRESENTATION_MOTION_CORE = deepFreeze({
  schema: HATE1000_PRESENTATION_SCHEMA,
  kind: HATE1000_PRESENTATION_KIND,
  timing: HATE1000_MOTION_TIMING
});
