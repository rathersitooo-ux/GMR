const SCHEMA = 'GAMEROAD_BATTLE_RECOVERY_PRESENTATION_V1';

export const BATTLE_RECOVERY_STATUS = Object.freeze({
  READY: 'READY',
  WAITING: 'WAITING',
  RECONNECTING: 'RECONNECTING',
  STALE_INPUT_REJECTED: 'STALE_INPUT_REJECTED',
});

export const BATTLE_RECOVERY_LOCAL_STAGE = Object.freeze({
  NONE: 'NONE',
  UNCOMMITTED: 'UNCOMMITTED',
  COMMITTED: 'COMMITTED',
});

const VALID_STATUS = new Set(Object.values(BATTLE_RECOVERY_STATUS));
const VALID_LOCAL_STAGE = new Set(Object.values(BATTLE_RECOVERY_LOCAL_STAGE));

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function requireEnum(value, allowed, name) {
  if (!allowed.has(value)) throw new RangeError(`${name} is not supported`);
  return value;
}

function requireBoolean(value, name) {
  if (typeof value !== 'boolean') throw new TypeError(`${name} must be boolean`);
  return value;
}

function motionMode({ reducedMotion, lowPerformance }) {
  if (lowPerformance) return 'LOW_PERF_STATIC';
  if (reducedMotion) return 'REDUCED_STATIC';
  return 'FULL';
}

function statusCopy(status) {
  switch (status) {
    case BATTLE_RECOVERY_STATUS.READY:
      return Object.freeze({ label: '', detail: '', visible: false });
    case BATTLE_RECOVERY_STATUS.WAITING:
      return Object.freeze({ label: '待機中', detail: '現在の状態を待っています', visible: true });
    case BATTLE_RECOVERY_STATUS.RECONNECTING:
      return Object.freeze({ label: '再接続中', detail: '対戦状態を同期しています', visible: true });
    case BATTLE_RECOVERY_STATUS.STALE_INPUT_REJECTED:
      return Object.freeze({ label: '状態が更新されました', detail: '最新の対戦状態に戻ります', visible: true });
    default:
      throw new RangeError('status is not supported');
  }
}

function visualCue(status, mode) {
  if (status === BATTLE_RECOVERY_STATUS.READY) return 'NONE';
  if (mode !== 'FULL') return 'STATIC_STATUS';
  if (status === BATTLE_RECOVERY_STATUS.WAITING) return 'WAITING_SOFT_PULSE';
  if (status === BATTLE_RECOVERY_STATUS.RECONNECTING) return 'RECONNECT_SYNC_SWEEP';
  return 'STALE_REFRESH_SNAP';
}

/**
 * Projects caller-authoritative Battle recovery facts into a compact UI plan.
 *
 * This core deliberately does not infer whether an input is stale, whether a
 * reconnect is allowed, how long a grace window lasts, who controls a seat,
 * or whether a Battle action/result is legal. Those facts stay with the
 * existing Battle/network authorities. In particular, 2v2 callers can use the
 * existing reconnect core's controlGeneration/envelope guard upstream and pass
 * only the resulting status here.
 */
export function projectBattleRecoveryPresentation({
  status,
  localStage = BATTLE_RECOVERY_LOCAL_STAGE.NONE,
  reducedMotion = false,
  lowPerformance = false,
} = {}) {
  const canonicalStatus = requireEnum(status, VALID_STATUS, 'status');
  const canonicalLocalStage = requireEnum(localStage, VALID_LOCAL_STAGE, 'localStage');
  requireBoolean(reducedMotion, 'reducedMotion');
  requireBoolean(lowPerformance, 'lowPerformance');

  const mode = motionMode({ reducedMotion, lowPerformance });
  const copy = statusCopy(canonicalStatus);
  const recovering = canonicalStatus !== BATTLE_RECOVERY_STATUS.READY;
  const staleRejected = canonicalStatus === BATTLE_RECOVERY_STATUS.STALE_INPUT_REJECTED;

  return deepFreeze({
    schema: SCHEMA,
    status: canonicalStatus,
    visible: copy.visible,
    label: copy.label,
    detail: copy.detail,
    presentationMode: 'COMPACT_NONBLOCKING_STATUS',
    visualCue: visualCue(canonicalStatus, mode),
    motionMode: mode,

    // Input is fail-closed until the caller supplies READY again.
    canCommitLocalInput: !recovering,
    inputLockRequired: recovering,
    requiresAuthoritativeRefresh:
      canonicalStatus === BATTLE_RECOVERY_STATUS.RECONNECTING || staleRejected,

    // A stale rejection may clear only a local draft that the caller marks as
    // not authoritatively committed. Committed actions are never rolled back.
    clearUncommittedLocalStage:
      staleRejected && canonicalLocalStage === BATTLE_RECOVERY_LOCAL_STAGE.UNCOMMITTED,
    localStage: canonicalLocalStage,
    rollbackAuthoritativeCommit: false,

    // The status layer must never obscure or replace the board state authority.
    blocksBoard: false,
    gameplayAuthority: false,
    networkAuthority: false,
    controlAuthority: false,
    legalityAuthority: false,
    resultAuthority: false,
    gameStateWrite: false,
    secretExpansion: false,
    timeoutAuthority: false,
    retryPolicyAuthority: false,
  });
}

export function isBattleRecoveryPresentation(value) {
  return Boolean(
    value
      && typeof value === 'object'
      && !Array.isArray(value)
      && value.schema === SCHEMA
      && VALID_STATUS.has(value.status)
      && VALID_LOCAL_STAGE.has(value.localStage)
      && typeof value.canCommitLocalInput === 'boolean'
      && typeof value.inputLockRequired === 'boolean'
      && value.gameplayAuthority === false
      && value.networkAuthority === false
      && value.controlAuthority === false
      && value.legalityAuthority === false
      && value.resultAuthority === false
      && value.gameStateWrite === false
      && value.secretExpansion === false
  );
}

export const BATTLE_RECOVERY_PRESENTATION_CONTRACT = deepFreeze({
  schema: SCHEMA,
  statuses: BATTLE_RECOVERY_STATUS,
  localStages: BATTLE_RECOVERY_LOCAL_STAGE,
  staleDecisionAuthority: 'CALLER',
  reconnectDecisionAuthority: 'CALLER',
  waitingDecisionAuthority: 'CALLER',
  controlEnvelopeAuthority: 'EXISTING_MODE_SPECIFIC_AUTHORITY',
  clearsOnlyUncommittedLocalStage: true,
  rollsBackAuthoritativeCommit: false,
  computesTimeoutOrGrace: false,
  computesRetryPolicy: false,
  computesControlOwner: false,
  computesLegality: false,
  computesResult: false,
  writesGameState: false,
  expandsSecrets: false,
});
