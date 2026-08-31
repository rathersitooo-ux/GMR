import {
  advanceContinuousPublicBroadcastFollow,
  readContinuousPublicBroadcastFollowStatus,
} from './battle-replay-public-commentary-core.mjs';

const AUTHORIZED_PRESENCE_SCHEMA = 'GAMEROAD_REPLAY_AUTHORIZED_SPECTATOR_PRESENCE_V1';
const ADAPTER_RESULT_SCHEMA = 'GAMEROAD_REPLAY_SPECTATOR_FOLLOW_ADAPTER_RESULT_V1';
const ATTACH_INTENT_SCHEMA = 'GAMEROAD_REPLAY_SPECTATOR_ATTACH_INTENT_V1';
const CONSUMER_RESULT_SCHEMA = 'GAMEROAD_REPLAY_SPECTATOR_PUBLIC_CONSUMER_RESULT_V1';
const PUBLIC_REPLAY_SCHEMA = 'GAMEROAD_BATTLE_REPLAY_V1';
const PRESENCE_LIFECYCLES = new Set(['WAITING', 'LIVE', 'ENDED', 'OFFLINE', 'DENIED']);
const ALLOWED_PRESENCE_KEYS = new Set([
  'schema',
  'targetUserId',
  'lifecycle',
  'viewerAuthorized',
  'spectatable',
  'matchId',
  'publicAttachRef',
]);

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function deepFreeze(value) {
  if (Array.isArray(value)) {
    for (const item of value) deepFreeze(item);
    return Object.freeze(value);
  }
  if (isPlainObject(value)) {
    for (const item of Object.values(value)) deepFreeze(item);
    return Object.freeze(value);
  }
  return value;
}

function nonEmptyString(value, code) {
  if (typeof value !== 'string' || value.trim() === '') throw new TypeError(code);
  return value.trim();
}

function optionalBoolean(value, code) {
  if (value === undefined) return false;
  if (typeof value !== 'boolean') throw new TypeError(code);
  return value;
}

function normalizeAuthorizedPresence(snapshot) {
  if (!isPlainObject(snapshot)) throw new TypeError('AUTHORIZED_PRESENCE_INVALID');
  for (const key of Object.keys(snapshot)) {
    if (!ALLOWED_PRESENCE_KEYS.has(key)) {
      throw new TypeError(`AUTHORIZED_PRESENCE_UNEXPECTED_FIELD:${key}`);
    }
  }
  if (snapshot.schema !== AUTHORIZED_PRESENCE_SCHEMA) {
    throw new TypeError('AUTHORIZED_PRESENCE_SCHEMA_INVALID');
  }

  const targetUserId = nonEmptyString(snapshot.targetUserId, 'AUTHORIZED_PRESENCE_TARGET_INVALID');
  const lifecycle = nonEmptyString(snapshot.lifecycle, 'AUTHORIZED_PRESENCE_LIFECYCLE_INVALID');
  if (!PRESENCE_LIFECYCLES.has(lifecycle)) {
    throw new TypeError('AUTHORIZED_PRESENCE_LIFECYCLE_INVALID');
  }

  const viewerAuthorized = optionalBoolean(snapshot.viewerAuthorized, 'AUTHORIZED_PRESENCE_VIEWER_AUTH_INVALID');
  const spectatable = optionalBoolean(snapshot.spectatable, 'AUTHORIZED_PRESENCE_SPECTATABLE_INVALID');
  const matchId = snapshot.matchId === undefined || snapshot.matchId === null
    ? null
    : nonEmptyString(snapshot.matchId, 'AUTHORIZED_PRESENCE_MATCH_INVALID');
  const publicAttachRef = snapshot.publicAttachRef === undefined || snapshot.publicAttachRef === null
    ? null
    : nonEmptyString(snapshot.publicAttachRef, 'AUTHORIZED_PRESENCE_ATTACH_REF_INVALID');

  if (lifecycle === 'LIVE' && viewerAuthorized === true && spectatable === true) {
    if (matchId === null) throw new TypeError('AUTHORIZED_PRESENCE_LIVE_MATCH_REQUIRED');
    if (publicAttachRef === null) throw new TypeError('AUTHORIZED_PRESENCE_PUBLIC_ATTACH_REF_REQUIRED');
  } else if (lifecycle === 'ENDED') {
    if (viewerAuthorized !== true) throw new TypeError('AUTHORIZED_PRESENCE_ENDED_AUTH_REQUIRED');
    if (matchId === null) throw new TypeError('AUTHORIZED_PRESENCE_ENDED_MATCH_REQUIRED');
    if (publicAttachRef !== null) throw new TypeError('AUTHORIZED_PRESENCE_ENDED_ATTACH_REF_FORBIDDEN');
  } else if (matchId !== null || publicAttachRef !== null) {
    throw new TypeError('AUTHORIZED_PRESENCE_NONPUBLIC_IDENTITY_FORBIDDEN');
  }

  return deepFreeze({
    schema: AUTHORIZED_PRESENCE_SCHEMA,
    targetUserId,
    lifecycle,
    viewerAuthorized,
    spectatable,
    matchId,
    publicAttachRef,
  });
}

function presenceSignal(presence) {
  switch (presence.lifecycle) {
    case 'LIVE':
      if (presence.viewerAuthorized !== true || presence.spectatable !== true) {
        return { kind: 'DENIED', targetUserId: presence.targetUserId };
      }
      return {
        kind: 'MATCH_DISCOVERED',
        targetUserId: presence.targetUserId,
        viewerAuthorized: true,
        spectatable: true,
        matchId: presence.matchId,
      };
    case 'ENDED':
      return {
        kind: 'MATCH_ENDED',
        targetUserId: presence.targetUserId,
        matchId: presence.matchId,
      };
    case 'OFFLINE':
      return { kind: 'OFFLINE', targetUserId: presence.targetUserId };
    case 'DENIED':
      return { kind: 'DENIED', targetUserId: presence.targetUserId };
    case 'WAITING':
      return { kind: 'WAITING', targetUserId: presence.targetUserId };
    default:
      throw new TypeError('AUTHORIZED_PRESENCE_LIFECYCLE_INVALID');
  }
}

function spectatorAttachIntent(presence, followStatus) {
  if (
    presence.lifecycle !== 'LIVE' ||
    presence.viewerAuthorized !== true ||
    presence.spectatable !== true ||
    followStatus.status !== 'ATTACHED' ||
    followStatus.matchId !== presence.matchId
  ) {
    return null;
  }

  return deepFreeze({
    schema: ATTACH_INTENT_SCHEMA,
    presentationOnly: true,
    gameplayAuthority: false,
    gameStateWrite: false,
    automaticPrivateJoinAllowed: false,
    transportAuthority: 'CALLER_VERIFIED_PUBLIC_SPECTATOR_PRESENCE',
    targetUserId: presence.targetUserId,
    matchId: presence.matchId,
    attachSerial: followStatus.attachSerial,
    intentId: `spectator:${presence.targetUserId}:${presence.matchId}:${followStatus.attachSerial}`,
    publicAttachRef: presence.publicAttachRef,
  });
}

export function advanceAuthorizedSpectatorPresence(state, snapshot) {
  const presence = normalizeAuthorizedPresence(snapshot);
  const nextState = advanceContinuousPublicBroadcastFollow(state, presenceSignal(presence));
  const followStatus = readContinuousPublicBroadcastFollowStatus(nextState);
  const attachIntent = spectatorAttachIntent(presence, followStatus);

  return deepFreeze({
    schema: ADAPTER_RESULT_SCHEMA,
    presentationOnly: true,
    gameplayAuthority: false,
    gameStateWrite: false,
    state: nextState,
    followStatus,
    attachIntent,
  });
}

function validateAdapterResult(result) {
  if (!isPlainObject(result) ||
      result.schema !== ADAPTER_RESULT_SCHEMA ||
      result.presentationOnly !== true ||
      result.gameplayAuthority !== false ||
      result.gameStateWrite !== false ||
      !isPlainObject(result.followStatus)) {
    throw new TypeError('SPECTATOR_FOLLOW_RESULT_INVALID');
  }
  return result;
}

function validateAttachIntent(intent) {
  if (!isPlainObject(intent) ||
      intent.schema !== ATTACH_INTENT_SCHEMA ||
      intent.presentationOnly !== true ||
      intent.gameplayAuthority !== false ||
      intent.gameStateWrite !== false ||
      intent.automaticPrivateJoinAllowed !== false ||
      intent.transportAuthority !== 'CALLER_VERIFIED_PUBLIC_SPECTATOR_PRESENCE') {
    throw new TypeError('SPECTATOR_ATTACH_INTENT_INVALID');
  }
  const targetUserId = nonEmptyString(intent.targetUserId, 'SPECTATOR_ATTACH_TARGET_INVALID');
  const matchId = nonEmptyString(intent.matchId, 'SPECTATOR_ATTACH_MATCH_INVALID');
  const publicAttachRef = nonEmptyString(intent.publicAttachRef, 'SPECTATOR_ATTACH_REF_INVALID');
  if (!Number.isSafeInteger(intent.attachSerial) || intent.attachSerial < 1) {
    throw new TypeError('SPECTATOR_ATTACH_SERIAL_INVALID');
  }
  const intentId = nonEmptyString(intent.intentId, 'SPECTATOR_ATTACH_INTENT_ID_INVALID');
  if (intentId !== `spectator:${targetUserId}:${matchId}:${intent.attachSerial}`) {
    throw new TypeError('SPECTATOR_ATTACH_INTENT_ID_MISMATCH');
  }
  return { targetUserId, matchId, publicAttachRef, intentId, attachSerial: intent.attachSerial };
}

function assertPublicReplayProjection(replay, matchId) {
  if (!isPlainObject(replay) ||
      replay.ok !== true ||
      replay.status !== 'ready' ||
      replay.schema !== PUBLIC_REPLAY_SCHEMA ||
      replay.matchId !== matchId ||
      !Array.isArray(replay.events)) {
    throw new TypeError('SPECTATOR_PUBLIC_REPLAY_INVALID');
  }
  for (const event of replay.events) {
    if (!isPlainObject(event)) throw new TypeError('SPECTATOR_PUBLIC_REPLAY_EVENT_INVALID');
    for (const key of Object.keys(event)) {
      const normalized = key.toLowerCase();
      if (normalized.includes('private') || normalized.includes('secret') ||
          normalized.includes('hidden') || normalized === 'authorityonly') {
        throw new TypeError(`SPECTATOR_PUBLIC_REPLAY_PRIVATE_FIELD:${key}`);
      }
    }
  }
  return replay;
}

export async function consumeAuthorizedSpectatorReplay(
  rawResult,
  {
    readPublicReplay,
    renderPublicReplay,
    clearPublicReplay = () => true,
  } = {},
) {
  const result = validateAdapterResult(rawResult);
  if (typeof readPublicReplay !== 'function') throw new TypeError('SPECTATOR_PUBLIC_REPLAY_READER_REQUIRED');
  if (typeof renderPublicReplay !== 'function') throw new TypeError('SPECTATOR_PUBLIC_REPLAY_RENDERER_REQUIRED');
  if (typeof clearPublicReplay !== 'function') throw new TypeError('SPECTATOR_PUBLIC_REPLAY_CLEARER_INVALID');

  if (result.attachIntent === null) {
    const cleared = await clearPublicReplay(deepFreeze({
      presentationOnly: true,
      targetUserId: result.followStatus.targetUserId ?? null,
      status: result.followStatus.status,
      waitingReason: result.followStatus.waitingReason ?? null,
    }));
    if (cleared !== true) throw new Error('SPECTATOR_PUBLIC_REPLAY_CLEAR_FAILED');
    return deepFreeze({
      schema: CONSUMER_RESULT_SCHEMA,
      presentationOnly: true,
      gameplayAuthority: false,
      gameStateWrite: false,
      status: result.followStatus.status,
      targetUserId: result.followStatus.targetUserId ?? null,
      matchId: null,
      intentId: null,
      rendered: false,
    });
  }

  const attach = validateAttachIntent(result.attachIntent);
  const request = deepFreeze({
    publicAttachRef: attach.publicAttachRef,
    targetUserId: attach.targetUserId,
    matchId: attach.matchId,
    intentId: attach.intentId,
  });
  const replay = assertPublicReplayProjection(await readPublicReplay(request), attach.matchId);
  const rendered = await renderPublicReplay(deepFreeze({
    presentationOnly: true,
    targetUserId: attach.targetUserId,
    matchId: attach.matchId,
    intentId: attach.intentId,
    attachSerial: attach.attachSerial,
    replay,
  }));
  if (rendered !== true) throw new Error('SPECTATOR_PUBLIC_REPLAY_RENDER_FAILED');

  return deepFreeze({
    schema: CONSUMER_RESULT_SCHEMA,
    presentationOnly: true,
    gameplayAuthority: false,
    gameStateWrite: false,
    status: 'ATTACHED',
    targetUserId: attach.targetUserId,
    matchId: attach.matchId,
    intentId: attach.intentId,
    rendered: true,
  });
}

export const BATTLE_REPLAY_SPECTATOR_FOLLOW_ADAPTER_CONTRACT = deepFreeze({
  inputSchema: AUTHORIZED_PRESENCE_SCHEMA,
  resultSchema: ADAPTER_RESULT_SCHEMA,
  attachIntentSchema: ATTACH_INTENT_SCHEMA,
  consumerResultSchema: CONSUMER_RESULT_SCHEMA,
  inputAuthority: 'CALLER_VERIFIED_PUBLIC_SPECTATOR_PRESENCE',
  consumerReaderAuthority: 'CALLER_SUPPLIED_PUBLIC_ATTACH_REF_RESOLVER',
  networkDiscoveryPerformed: false,
  hiddenOrSecretDiscoveryAllowed: false,
  ticketSecretAccepted: false,
  roomSecretAccepted: false,
  privateMatchIdentityRetainedWhenDenied: false,
  forcePrivateJoinAllowed: false,
  publicAttachRefRequiredForAttach: true,
  secondFollowStateStore: false,
  secondReplayStateStore: false,
  gameplayAuthority: false,
  gameStateWrite: false,
});
