import {
  resolveTitleBootRoute,
  TITLE_BOOT_ROUTE_KINDS,
} from './title-boot-router-core.mjs';
import {
  syncBattleRecoveryRuntimeFrom2v2Authority,
} from './battle-recovery-live-adapter.mjs';

export const BATTLE_TITLE_RECOVERY_HANDOFF_SCHEMA =
  'gameroad.battle-title-recovery-handoff.v1';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function canonicalIdentity(value) {
  return typeof value === 'string' && value.length > 0 && value === value.trim();
}

function result({
  ok,
  status,
  reason,
  route = null,
  matchId = null,
  recovery = null,
  runtimeSyncInvoked = false,
}) {
  return deepFreeze({
    schema: BATTLE_TITLE_RECOVERY_HANDOFF_SCHEMA,
    ok,
    status,
    reason,
    route,
    matchId,
    recovery,
    runtimeSyncInvoked,
    gameplayAuthority: false,
    networkAuthority: false,
    reconnectAuthority: false,
    controlAuthority: false,
    legalityAuthority: false,
    resultAuthority: false,
    saveAuthority: false,
    gameStateWrite: false,
    timeoutAuthority: false,
    retryPolicyAuthority: false,
  });
}

/**
 * Compose the existing title boot decision with the existing Battle recovery
 * presentation/runtime seam.
 *
 * The route is resolved here rather than accepted as a caller-supplied object,
 * so only title-boot-router-core can establish RECOVER_MATCH. That router already
 * requires an authoritative resumable match and gives required gates priority.
 *
 * This handoff does not attach transport, reconnect a peer, mutate control,
 * persist state, decide legality, or start Battle. It only forwards existing
 * recovery facts to a caller-owned recovery runtime after the title route and
 * explicit expected match identity agree.
 */
export function handoffTitleBootRecovery({
  runtime,
  bootInput = {},
  expectedMatchId,
  recoveryInput = {},
} = {}) {
  if (!canonicalIdentity(expectedMatchId)) {
    return result({
      ok: false,
      status: 'REJECTED',
      reason: 'EXPECTED_MATCH_ID_INVALID',
    });
  }

  let route;
  try {
    route = resolveTitleBootRoute(bootInput);
  } catch {
    return result({
      ok: false,
      status: 'REJECTED',
      reason: 'TITLE_BOOT_ROUTE_RESOLUTION_FAILED',
    });
  }

  if (route?.kind !== TITLE_BOOT_ROUTE_KINDS.RECOVER_MATCH) {
    return result({
      ok: true,
      status: 'NO_RECOVERY',
      reason: 'TITLE_ROUTE_NOT_RECOVER_MATCH',
      route,
    });
  }

  const routeMatchId = route?.match?.matchId;
  if (!canonicalIdentity(routeMatchId)) {
    return result({
      ok: false,
      status: 'REJECTED',
      reason: 'RECOVERY_ROUTE_MATCH_ID_INVALID',
      route,
    });
  }
  if (routeMatchId !== expectedMatchId) {
    return result({
      ok: false,
      status: 'REJECTED',
      reason: 'RECOVERY_MATCH_ID_MISMATCH',
      route,
      matchId: routeMatchId,
    });
  }

  if (!runtime || typeof runtime.sync !== 'function') {
    return result({
      ok: false,
      status: 'REJECTED',
      reason: 'BATTLE_RECOVERY_RUNTIME_SYNC_REQUIRED',
      route,
      matchId: routeMatchId,
    });
  }

  let runtimeSyncInvoked = false;
  const trackedRuntime = {
    sync(input) {
      runtimeSyncInvoked = true;
      return runtime.sync(input);
    },
  };

  let recovery;
  try {
    recovery = syncBattleRecoveryRuntimeFrom2v2Authority(trackedRuntime, recoveryInput);
  } catch {
    return result({
      ok: false,
      status: 'REJECTED',
      reason: 'BATTLE_RECOVERY_RUNTIME_SYNC_FAILED',
      route,
      matchId: routeMatchId,
      runtimeSyncInvoked,
    });
  }

  if (!recovery?.ok) {
    return result({
      ok: false,
      status: 'RECOVERY_REJECTED',
      reason: recovery?.reason || 'BATTLE_RECOVERY_REJECTED',
      route,
      matchId: routeMatchId,
      recovery,
      runtimeSyncInvoked,
    });
  }

  return result({
    ok: true,
    status: 'RECOVERY_SYNCED',
    reason: 'OK',
    route,
    matchId: routeMatchId,
    recovery,
    runtimeSyncInvoked,
  });
}

export const BATTLE_TITLE_RECOVERY_HANDOFF_CONTRACT = deepFreeze({
  schema: BATTLE_TITLE_RECOVERY_HANDOFF_SCHEMA,
  routeAuthority: 'EXISTING_TITLE_BOOT_ROUTER_ONLY',
  eligibleRouteKind: TITLE_BOOT_ROUTE_KINDS.RECOVER_MATCH,
  matchIdentityGate: 'EXPLICIT_EXPECTED_MATCH_ID_MUST_EQUAL_RESOLVED_ROUTE_MATCH_ID',
  recoveryAuthority: 'EXISTING_BATTLE_RECOVERY_LIVE_ADAPTER_ONLY',
  recoveryRuntimeAuthority: 'CALLER_OWNED_EXISTING_RUNTIME_ONLY',
  requiredGatePriorityPreserved: true,
  safeCurrentResumePriorityPreserved: true,
  startsBattle: false,
  startsReconnect: false,
  attachesTransport: false,
  computesTimeoutOrGrace: false,
  computesRetryPolicy: false,
  computesControlOwner: false,
  computesLegality: false,
  computesResult: false,
  writesSave: false,
  writesGameState: false,
});
