import { createTeamPingChannel } from './battle-team-ping-core.mjs';

export const BATTLE_TEAM_PING_LIVE_ADAPTER_SCHEMA = 'gameroad.battle-team-ping-live-adapter.v1';
export const BATTLE_TEAM_PING_LIVE_EVENT_SCHEMA = 'gameroad.battle-team-ping-live-event.v1';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function requireFunction(name, value) {
  if (typeof value !== 'function') throw new TypeError(`${name}_REQUIRED`);
  return value;
}

function callFailSoft(callback, payload) {
  if (typeof callback !== 'function') return Object.freeze({ attempted: false, accepted: false, error: null });
  try {
    const result = callback(payload);
    return Object.freeze({ attempted: true, accepted: result !== false, error: null });
  } catch (error) {
    return Object.freeze({
      attempted: true,
      accepted: false,
      error: typeof error?.message === 'string' && error.message ? error.message : 'CALLBACK_FAILED',
    });
  }
}

function presentationReceiptKey(viewerId, teamId, sequence) {
  return `${viewerId}\u0000${teamId}\u0000${sequence}`;
}

export function createBattleTeamPingLiveAdapter({
  resolveTeamId,
  resolvePublicTarget,
  canReadTeam,
  admissionPolicy,
  dispatchPing,
  presentPing = null,
} = {}) {
  requireFunction('RESOLVE_TEAM_ID', resolveTeamId);
  requireFunction('RESOLVE_PUBLIC_TARGET', resolvePublicTarget);
  requireFunction('CAN_READ_TEAM', canReadTeam);
  requireFunction('ADMISSION_POLICY', admissionPolicy);
  requireFunction('DISPATCH_PING', dispatchPing);
  if (presentPing != null) requireFunction('PRESENT_PING', presentPing);

  const channel = createTeamPingChannel({
    resolveTeamId,
    resolvePublicTarget,
    canReadTeam,
    admissionPolicy,
  });
  const presentationReceipts = new Set();

  function submit(actorId, message) {
    const result = channel.submit(actorId, message);
    if (!result?.ok) {
      return deepFreeze({
        schema: BATTLE_TEAM_PING_LIVE_ADAPTER_SCHEMA,
        ...result,
        transport: Object.freeze({ attempted: false, accepted: false, error: null }),
        event: null,
      });
    }

    if (result.notify !== true) {
      return deepFreeze({
        schema: BATTLE_TEAM_PING_LIVE_ADAPTER_SCHEMA,
        ...result,
        transport: Object.freeze({ attempted: false, accepted: false, error: null }),
        event: null,
      });
    }

    const event = deepFreeze({
      schema: BATTLE_TEAM_PING_LIVE_EVENT_SCHEMA,
      actorId,
      ping: result.ping,
    });
    const transport = callFailSoft(dispatchPing, event);
    return deepFreeze({
      schema: BATTLE_TEAM_PING_LIVE_ADAPTER_SCHEMA,
      ...result,
      transport,
      event,
    });
  }

  function readForViewer(viewerId, teamId, { present = false } = {}) {
    const result = channel.readForViewer(viewerId, teamId);
    if (!result?.ok || present !== true || typeof presentPing !== 'function') {
      return deepFreeze({
        schema: BATTLE_TEAM_PING_LIVE_ADAPTER_SCHEMA,
        ...result,
        presentedCount: 0,
        presentationFailures: Object.freeze([]),
      });
    }

    let presentedCount = 0;
    const failures = [];
    for (const ping of result.pings) {
      const key = presentationReceiptKey(viewerId, teamId, ping.sequence);
      if (presentationReceipts.has(key)) continue;
      presentationReceipts.add(key);
      const receipt = callFailSoft(presentPing, deepFreeze({ viewerId, teamId, ping }));
      if (receipt.accepted) presentedCount += 1;
      else failures.push(Object.freeze({ sequence: ping.sequence, error: receipt.error }));
    }

    return deepFreeze({
      schema: BATTLE_TEAM_PING_LIVE_ADAPTER_SCHEMA,
      ...result,
      presentedCount,
      presentationFailures: Object.freeze(failures),
    });
  }

  function clearPresentationReceipts(viewerId = null, teamId = null) {
    const viewer = typeof viewerId === 'string' ? viewerId : null;
    const team = typeof teamId === 'string' ? teamId : null;
    let cleared = 0;
    for (const key of [...presentationReceipts]) {
      const [keyViewer, keyTeam] = key.split('\u0000');
      if (viewer && keyViewer !== viewer) continue;
      if (team && keyTeam !== team) continue;
      presentationReceipts.delete(key);
      cleared += 1;
    }
    return cleared;
  }

  return Object.freeze({
    schema: BATTLE_TEAM_PING_LIVE_ADAPTER_SCHEMA,
    submit,
    readForViewer,
    clearPresentationReceipts,
  });
}
