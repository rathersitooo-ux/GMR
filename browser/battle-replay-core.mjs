const REPLAY_SCHEMA = 'GAMEROAD_BATTLE_REPLAY_V1';
const REQUIRED_VERSION_KEYS = Object.freeze(['rules', 'content', 'state']);

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

function normalizeVersions(versions) {
  if (!versions || typeof versions !== 'object' || Array.isArray(versions)) {
    throw new TypeError('VERSIONS_REQUIRED');
  }
  const out = {};
  for (const key of REQUIRED_VERSION_KEYS) {
    if (!nonEmptyString(versions[key])) throw new TypeError(`VERSION_REQUIRED:${key}`);
    out[key] = versions[key];
  }
  return deepFreeze(out);
}

function sameVersions(left, right) {
  return REQUIRED_VERSION_KEYS.every(key => left?.[key] === right?.[key]);
}

function normalizePrivateByViewer(privateByViewer) {
  if (privateByViewer == null) return {};
  if (typeof privateByViewer !== 'object' || Array.isArray(privateByViewer)) {
    throw new TypeError('PRIVATE_BY_VIEWER_INVALID');
  }
  const out = {};
  for (const [viewerId, payload] of Object.entries(privateByViewer)) {
    if (!nonEmptyString(viewerId)) throw new TypeError('VIEWER_ID_INVALID');
    out[viewerId] = cloneJson(payload);
  }
  return out;
}

function frozenLog(raw) {
  return deepFreeze(cloneJson(raw));
}

export function createReplayLog({ matchId, versions }) {
  if (!nonEmptyString(matchId)) throw new TypeError('MATCH_ID_REQUIRED');
  return frozenLog({
    schema: REPLAY_SCHEMA,
    matchId,
    versions: normalizeVersions(versions),
    events: []
  });
}

export function appendAcceptedEvent(log, {
  kind,
  publicData = null,
  privateByViewer = null,
  authorityOnly = null
}) {
  const validation = validateReplayLog(log);
  if (!validation.ok) throw new TypeError(`LOG_INVALID:${validation.reason}`);
  if (!nonEmptyString(kind)) throw new TypeError('EVENT_KIND_REQUIRED');

  const event = {
    schema: REPLAY_SCHEMA,
    matchId: log.matchId,
    sequence: log.events.length + 1,
    versions: cloneJson(log.versions),
    kind,
    publicData: cloneJson(publicData),
    privateByViewer: normalizePrivateByViewer(privateByViewer),
    authorityOnly: cloneJson(authorityOnly)
  };

  return frozenLog({
    ...cloneJson(log),
    events: [...cloneJson(log.events), event]
  });
}

export function validateReplayLog(log) {
  if (!log || typeof log !== 'object' || Array.isArray(log)) {
    return { ok: false, status: 'unavailable', reason: 'LOG_INVALID' };
  }
  if (log.schema !== REPLAY_SCHEMA) {
    return { ok: false, status: 'unavailable', reason: 'SCHEMA_UNKNOWN' };
  }
  if (!nonEmptyString(log.matchId)) {
    return { ok: false, status: 'unavailable', reason: 'MATCH_ID_INVALID' };
  }

  let normalizedVersions;
  try {
    normalizedVersions = normalizeVersions(log.versions);
  } catch {
    return { ok: false, status: 'unavailable', reason: 'VERSION_INVALID' };
  }

  if (!Array.isArray(log.events)) {
    return { ok: false, status: 'unavailable', reason: 'EVENTS_INVALID' };
  }

  const seen = new Set();
  for (let index = 0; index < log.events.length; index += 1) {
    const event = log.events[index];
    if (!event || typeof event !== 'object' || Array.isArray(event)) {
      return { ok: false, status: 'partial', reason: 'EVENT_CORRUPT', index };
    }
    if (event.schema !== REPLAY_SCHEMA || event.matchId !== log.matchId) {
      return { ok: false, status: 'partial', reason: 'EVENT_IDENTITY_MISMATCH', index };
    }
    if (!Number.isSafeInteger(event.sequence) || event.sequence < 1) {
      return { ok: false, status: 'partial', reason: 'SEQUENCE_INVALID', index };
    }
    if (seen.has(event.sequence)) {
      return { ok: false, status: 'partial', reason: 'SEQUENCE_DUPLICATE', index };
    }
    seen.add(event.sequence);
    if (event.sequence !== index + 1) {
      return { ok: false, status: 'partial', reason: 'SEQUENCE_GAP_OR_REORDER', index };
    }
    if (!sameVersions(event.versions, normalizedVersions)) {
      return { ok: false, status: 'partial', reason: 'EVENT_VERSION_MISMATCH', index };
    }
    if (!nonEmptyString(event.kind)) {
      return { ok: false, status: 'partial', reason: 'EVENT_KIND_INVALID', index };
    }
    if (event.privateByViewer != null &&
        (typeof event.privateByViewer !== 'object' || Array.isArray(event.privateByViewer))) {
      return { ok: false, status: 'partial', reason: 'PRIVATE_BY_VIEWER_INVALID', index };
    }
  }

  return { ok: true, status: 'ready' };
}

function versionSupported(version, supported) {
  if (!supported) return false;
  if (supported instanceof Set) return supported.has(version);
  if (Array.isArray(supported)) return supported.includes(version);
  return supported === version;
}

function versionsSupported(versions, supportedVersions) {
  if (!supportedVersions || typeof supportedVersions !== 'object') return false;
  return REQUIRED_VERSION_KEYS.every(key =>
    versionSupported(versions[key], supportedVersions[key])
  );
}

function projectEvent(event, viewer) {
  const projected = {
    sequence: event.sequence,
    kind: event.kind,
    publicData: cloneJson(event.publicData)
  };

  const authenticated = viewer?.authenticated === true;
  const viewerId = authenticated && nonEmptyString(viewer?.id) ? viewer.id : null;
  if (viewerId && Object.prototype.hasOwnProperty.call(event.privateByViewer || {}, viewerId)) {
    projected.privateData = cloneJson(event.privateByViewer[viewerId]);
  }

  return deepFreeze(projected);
}

export function readReplay(log, { viewer = null, supportedVersions = null } = {}) {
  const validation = validateReplayLog(log);
  if (!validation.ok) return deepFreeze(validation);

  if (!versionsSupported(log.versions, supportedVersions)) {
    return deepFreeze({ ok: false, status: 'unavailable', reason: 'VERSION_UNSUPPORTED' });
  }

  return deepFreeze({
    ok: true,
    status: 'ready',
    schema: REPLAY_SCHEMA,
    matchId: log.matchId,
    versions: cloneJson(log.versions),
    events: log.events.map(event => projectEvent(event, viewer))
  });
}

export const BATTLE_REPLAY_CORE = Object.freeze({
  schema: REPLAY_SCHEMA,
  requiredVersionKeys: REQUIRED_VERSION_KEYS
});
