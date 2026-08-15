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
