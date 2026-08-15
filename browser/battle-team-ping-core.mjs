const PING_SCHEMA = 'GAMEROAD_BATTLE_TEAM_PING_V1';

export const TEAM_PING_INTENTS = Object.freeze([
  'ATTENTION',
  'ATTACK_INTENT',
  'DEFEND_INTENT',
  'HELP',
  'WAIT',
  'ACK'
]);

const INTENT_SET = new Set(TEAM_PING_INTENTS);
const MESSAGE_KEYS = new Set(['intent', 'target']);

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

function validateMessageShape(message) {
  if (!message || typeof message !== 'object' || Array.isArray(message)) {
    throw new TypeError('MESSAGE_INVALID');
  }
  for (const key of Object.keys(message)) {
    if (!MESSAGE_KEYS.has(key)) throw new TypeError(`MESSAGE_FIELD_FORBIDDEN:${key}`);
  }
  if (!INTENT_SET.has(message.intent)) throw new TypeError('INTENT_INVALID');
}

function normalizePublicTarget(resolved) {
  if (!resolved || typeof resolved !== 'object' || Array.isArray(resolved)) {
    throw new TypeError('PUBLIC_TARGET_REQUIRED');
  }
  if (!nonEmptyString(resolved.kind) || !nonEmptyString(resolved.id)) {
    throw new TypeError('PUBLIC_TARGET_INVALID');
  }
  return deepFreeze({ kind: resolved.kind, id: resolved.id });
}

function targetKey(targetRef) {
  return targetRef ? `${targetRef.kind}\u0000${targetRef.id}` : '@TEAM';
}

function slotKey(senderId, targetRef) {
  return `${senderId}\u0000${targetKey(targetRef)}`;
}

export function createTeamPingChannel({
  resolveTeamId,
  resolvePublicTarget,
  canReadTeam,
  admissionPolicy
} = {}) {
  for (const [name, value] of Object.entries({
    resolveTeamId,
    resolvePublicTarget,
    canReadTeam,
    admissionPolicy
  })) {
    if (typeof value !== 'function') throw new TypeError(`${name.toUpperCase()}_REQUIRED`);
  }

  let nextSequence = 1;
  const latestByTeam = new Map();

  function submit(actorId, message) {
    if (!nonEmptyString(actorId)) return deepFreeze({ ok: false, reason: 'ACTOR_INVALID' });

    try {
      validateMessageShape(message);
    } catch (error) {
      return deepFreeze({ ok: false, reason: error.message });
    }

    const teamId = resolveTeamId(actorId);
    if (!nonEmptyString(teamId)) return deepFreeze({ ok: false, reason: 'TEAM_UNRESOLVED' });

    let targetRef = null;
    if (message.target != null) {
      try {
        const resolved = resolvePublicTarget({
          actorId,
          teamId,
          target: cloneJson(message.target)
        });
        targetRef = normalizePublicTarget(resolved);
      } catch {
        return deepFreeze({ ok: false, reason: 'TARGET_NOT_PUBLIC' });
      }
    }

    const admission = admissionPolicy({
      actorId,
      teamId,
      intent: message.intent,
      targetRef: cloneJson(targetRef)
    });
    if (admission !== true) return deepFreeze({ ok: false, reason: 'ADMISSION_DENIED' });

    let teamState = latestByTeam.get(teamId);
    if (!teamState) {
      teamState = new Map();
      latestByTeam.set(teamId, teamState);
    }

    const key = slotKey(actorId, targetRef);
    const previous = teamState.get(key) || null;
    if (previous && previous.intent === message.intent) {
      return deepFreeze({ ok: true, status: 'folded', notify: false, ping: cloneJson(previous) });
    }

    const ping = deepFreeze({
      schema: PING_SCHEMA,
      sequence: nextSequence,
      teamId,
      senderId: actorId,
      intent: message.intent,
      targetRef: cloneJson(targetRef)
    });
    nextSequence += 1;
    teamState.set(key, ping);

    return deepFreeze({
      ok: true,
      status: previous ? 'replaced' : 'accepted',
      notify: true,
      ping: cloneJson(ping)
    });
  }

  function readForViewer(viewerId, teamId) {
    if (!nonEmptyString(viewerId) || !nonEmptyString(teamId)) {
      return deepFreeze({ ok: false, reason: 'VIEWER_OR_TEAM_INVALID', pings: [] });
    }
    if (canReadTeam(viewerId, teamId) !== true) {
      return deepFreeze({ ok: false, reason: 'TEAM_ACCESS_DENIED', pings: [] });
    }

    const teamState = latestByTeam.get(teamId);
    const pings = teamState
      ? [...teamState.values()].sort((a, b) => a.sequence - b.sequence).map(cloneJson)
      : [];
    return deepFreeze({ ok: true, pings });
  }

  return deepFreeze({ submit, readForViewer });
}

export const BATTLE_TEAM_PING_CORE = Object.freeze({
  schema: PING_SCHEMA,
  intents: TEAM_PING_INTENTS
});
