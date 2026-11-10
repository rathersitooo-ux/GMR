import {
  BATTLE_2V2_CONTROL_MODES,
  isCurrent2v2ControlEnvelope,
  project2v2SeatControl,
} from './battle-2v2-reconnect-core.mjs';
import {
  BATTLE_RECOVERY_LOCAL_STAGE,
  BATTLE_RECOVERY_STATUS,
  isBattleRecoveryPresentation,
  projectBattleRecoveryPresentation,
} from './battle-recovery-presentation-core.mjs';
import {
  BATTLE_JANKEN_FOCUS_AUTHORITY_CONTEXT_SCHEMA,
} from './battle-janken-focus-authority-context.mjs';

export const BATTLE_RECOVERY_LIVE_ADAPTER_SCHEMA =
  'gameroad.battle-recovery-live-adapter.v1';
export const BATTLE_JANKEN_RECOVERY_CONTINUITY_SCHEMA =
  'gameroad.battle-janken-recovery-continuity.v1';

export const BATTLE_JANKEN_RECOVERY_TRIGGER = Object.freeze({
  RECONNECT_RESTORED: 'RECONNECT_RESTORED',
  STALE_INPUT_REJECTED: 'STALE_INPUT_REJECTED',
  VERSION_MISMATCH: 'VERSION_MISMATCH',
});

const VALID_LOCAL_STAGES = new Set(Object.values(BATTLE_RECOVERY_LOCAL_STAGE));
const VALID_ENVELOPE_MODES = new Set([
  BATTLE_2V2_CONTROL_MODES.SELF,
  BATTLE_2V2_CONTROL_MODES.TEMPORARY_PARTNER,
  BATTLE_2V2_CONTROL_MODES.PERMANENT_PARTNER,
]);
const VALID_JANKEN_RECOVERY_TRIGGERS = new Set(Object.values(BATTLE_JANKEN_RECOVERY_TRIGGER));
const JANKEN_HAND_ORDER = Object.freeze(['ROCK', 'SCISSORS', 'PAPER']);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function canonicalIdentity(value) {
  return typeof value === 'string' && value.length > 0 && value === value.trim();
}

function exactBoolean(value) {
  return typeof value === 'boolean';
}

function publicSeat(seat) {
  if (!seat) return null;
  return deepFreeze({
    seatId: seat.seatId,
    playerId: seat.playerId,
    teamId: seat.teamId,
    connected: seat.connected,
    controlMode: seat.controlMode,
    controlGeneration: seat.controlGeneration,
  });
}

function failure(reason, seat = null) {
  return deepFreeze({
    schema: BATTLE_RECOVERY_LIVE_ADAPTER_SCHEMA,
    ok: false,
    reason,
    status: null,
    runtimeInput: null,
    presentation: null,
    seat: publicSeat(seat),
    gameplayAuthority: false,
    networkAuthority: false,
    controlAuthority: false,
    legalityAuthority: false,
    resultAuthority: false,
    gameStateWrite: false,
    timeoutAuthority: false,
    retryPolicyAuthority: false,
  });
}

function validRejectedEnvelope(envelope, localSeatId) {
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) return false;
  if (!canonicalIdentity(envelope.seatId) || envelope.seatId !== localSeatId) return false;
  if (!VALID_ENVELOPE_MODES.has(envelope.controlMode)) return false;
  return Number.isSafeInteger(envelope.controlGeneration) && envelope.controlGeneration >= 0;
}

function resolveLocalSeat(reconnectState, localSeatId, localPlayerId) {
  let view;
  try {
    view = project2v2SeatControl(reconnectState);
  } catch {
    return { ok: false, reason: 'RECONNECT_STATE_INVALID', seat: null };
  }

  const seat = view.seats.find((candidate) => candidate.seatId === localSeatId) ?? null;
  if (!seat) return { ok: false, reason: 'LOCAL_SEAT_UNKNOWN', seat: null };
  if (seat.playerId !== localPlayerId) {
    return { ok: false, reason: 'LOCAL_PLAYER_SEAT_MISMATCH', seat };
  }
  return { ok: true, seat };
}

/**
 * Translate existing 2v2 control authority plus explicit caller facts into the
 * already-established Battle recovery presentation vocabulary.
 *
 * This adapter owns no reconnect state. It never starts a reconnect, computes a
 * grace period, changes control ownership, retries transport, or decides Battle
 * legality. RECONNECTING exists only when the caller explicitly says a reconnect
 * attempt is in flight while the authoritative local seat is temporary_partner.
 * STALE_INPUT_REJECTED exists only for an explicit control-envelope rejection
 * whose well-formed local envelope is proven non-current by the existing 2v2
 * control-generation guard.
 */
export function resolveBattleRecoveryFrom2v2Authority(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return failure('INPUT_INVALID');
  }

  const {
    reconnectState,
    localSeatId,
    localPlayerId,
    reconnectInFlight = false,
    controlEnvelopeRejected = false,
    rejectedControlEnvelope = null,
    localStage = BATTLE_RECOVERY_LOCAL_STAGE.NONE,
    reducedMotion = false,
    lowPerformance = false,
  } = input;

  if (!canonicalIdentity(localSeatId)) return failure('LOCAL_SEAT_ID_INVALID');
  if (!canonicalIdentity(localPlayerId)) return failure('LOCAL_PLAYER_ID_INVALID');
  if (!exactBoolean(reconnectInFlight)) return failure('RECONNECT_IN_FLIGHT_INVALID');
  if (!exactBoolean(controlEnvelopeRejected)) return failure('CONTROL_ENVELOPE_REJECTED_INVALID');
  if (!exactBoolean(reducedMotion)) return failure('REDUCED_MOTION_INVALID');
  if (!exactBoolean(lowPerformance)) return failure('LOW_PERFORMANCE_INVALID');
  if (!VALID_LOCAL_STAGES.has(localStage)) return failure('LOCAL_STAGE_INVALID');

  const local = resolveLocalSeat(reconnectState, localSeatId, localPlayerId);
  if (!local.ok) return failure(local.reason, local.seat);
  const seat = local.seat;

  let status = null;
  if (controlEnvelopeRejected) {
    if (!validRejectedEnvelope(rejectedControlEnvelope, localSeatId)) {
      return failure('REJECTED_CONTROL_ENVELOPE_INVALID', seat);
    }
    if (isCurrent2v2ControlEnvelope(reconnectState, rejectedControlEnvelope)) {
      return failure('REJECTED_CONTROL_ENVELOPE_IS_CURRENT', seat);
    }
    status = BATTLE_RECOVERY_STATUS.STALE_INPUT_REJECTED;
  } else {
    if (rejectedControlEnvelope !== null) {
      return failure('REJECTED_CONTROL_ENVELOPE_WITHOUT_REJECTION', seat);
    }

    if (seat.controlMode === BATTLE_2V2_CONTROL_MODES.SELF) {
      if (reconnectInFlight) return failure('RECONNECT_IN_FLIGHT_CONTROL_MISMATCH', seat);
      status = BATTLE_RECOVERY_STATUS.READY;
    } else if (seat.controlMode === BATTLE_2V2_CONTROL_MODES.TEMPORARY_PARTNER) {
      status = reconnectInFlight
        ? BATTLE_RECOVERY_STATUS.RECONNECTING
        : BATTLE_RECOVERY_STATUS.WAITING;
    } else if (seat.controlMode === BATTLE_2V2_CONTROL_MODES.PERMANENT_PARTNER) {
      return failure('PERMANENT_PARTNER_RECOVERY_STATUS_UNRESOLVED', seat);
    } else {
      return failure('CONTROL_MODE_RECOVERY_STATUS_UNRESOLVED', seat);
    }
  }

  const presentation = projectBattleRecoveryPresentation({
    status,
    localStage,
    reducedMotion,
    lowPerformance,
  });
  if (!isBattleRecoveryPresentation(presentation)) {
    return failure('RECOVERY_PRESENTATION_REJECTED', seat);
  }

  return deepFreeze({
    schema: BATTLE_RECOVERY_LIVE_ADAPTER_SCHEMA,
    ok: true,
    reason: 'OK',
    status,
    localStage,
    seat: publicSeat(seat),
    runtimeInput: {
      status,
      localStage,
      reducedMotion,
      lowPerformance,
    },
    presentation,
    gameplayAuthority: false,
    networkAuthority: false,
    controlAuthority: false,
    legalityAuthority: false,
    resultAuthority: false,
    gameStateWrite: false,
    timeoutAuthority: false,
    retryPolicyAuthority: false,
  });
}

/**
 * Optional composition seam for the already-merged recovery runtime surface.
 * The supplied runtime remains caller-owned; this function only forwards a
 * successfully resolved runtimeInput to runtime.sync().
 */
export function syncBattleRecoveryRuntimeFrom2v2Authority(runtime, input = {}) {
  if (!runtime || typeof runtime.sync !== 'function') {
    throw new TypeError('BATTLE_RECOVERY_RUNTIME_SYNC_REQUIRED');
  }
  const resolved = resolveBattleRecoveryFrom2v2Authority(input);
  if (!resolved.ok) return resolved;

  const projection = runtime.sync(resolved.runtimeInput);
  if (!isBattleRecoveryPresentation(projection)) {
    return failure('RUNTIME_RECOVERY_PRESENTATION_REJECTED', resolved.seat);
  }

  return deepFreeze({
    ...resolved,
    presentation: projection,
  });
}

function jankenContinuityFailure(reason) {
  return deepFreeze({
    schema: BATTLE_JANKEN_RECOVERY_CONTINUITY_SCHEMA,
    ok: false,
    reason,
    recoveryTrigger: null,
    generationId: null,
    authoritativeContext: null,
    assignment: null,
    packages: null,
    localFocusState: null,
    localStagedPackage: null,
    clearedLocalFocus: false,
    clearedStagedPackage: false,
    previousGenerationId: null,
    generationMismatch: false,
    handAssignmentReroll: false,
    compoundPackageRecompute: false,
    legalityRecompute: false,
    routeRecompute: false,
    committedRollback: false,
    gameplayAuthority: false,
    gameStateWrite: false,
  });
}

function validAuthoritativeJankenContext(context) {
  if (!context || typeof context !== 'object' || Array.isArray(context)) return false;
  if (context.schema !== BATTLE_JANKEN_FOCUS_AUTHORITY_CONTEXT_SCHEMA) return false;
  if (!canonicalIdentity(context.generationId)) return false;
  if (!Object.isFrozen(context)) return false;
  if (!context.assignment || typeof context.assignment !== 'object' || Array.isArray(context.assignment)) return false;
  if (!Object.isFrozen(context.assignment)) return false;
  if (context.assignment.roundId !== context.generationId) return false;
  if (!Array.isArray(context.assignment.slots) || context.assignment.slots.length !== JANKEN_HAND_ORDER.length) return false;
  if (!Array.isArray(context.packages) || context.packages.length !== JANKEN_HAND_ORDER.length) return false;
  if (!Object.isFrozen(context.packages)) return false;

  const assignmentByHand = new Map();
  for (const slot of context.assignment.slots) {
    if (!slot || typeof slot !== 'object' || Array.isArray(slot)) return false;
    if (!JANKEN_HAND_ORDER.includes(slot.jankenHand) || assignmentByHand.has(slot.jankenHand)) return false;
    if (!canonicalIdentity(slot.cardId)) return false;
    assignmentByHand.set(slot.jankenHand, slot.cardId);
  }
  if (!JANKEN_HAND_ORDER.every((hand) => assignmentByHand.has(hand))) return false;

  const packageHands = new Set();
  for (const pkg of context.packages) {
    if (!pkg || typeof pkg !== 'object' || Array.isArray(pkg)) return false;
    if (!JANKEN_HAND_ORDER.includes(pkg.jankenHand) || packageHands.has(pkg.jankenHand)) return false;
    if (!canonicalIdentity(pkg.cardId) || assignmentByHand.get(pkg.jankenHand) !== pkg.cardId) return false;
    packageHands.add(pkg.jankenHand);
  }
  return JANKEN_HAND_ORDER.every((hand) => packageHands.has(hand));
}

/**
 * Project the local JANKEN recovery boundary from one already-authoritative
 * Focus context. This function deliberately does not call syncRoundStart(), an
 * assignment policy, a candidate reader, or a commit path. The exact immutable
 * Hand3 assignment and compound packages are returned by reference; only stale
 * client-local focus/staging is discarded.
 *
 * recoveryTrigger is caller-explicit because reconnect/version authority lives
 * outside this adapter. All triggers clear local focus/package, including a
 * restored reconnect in the same generation: a reconnect must re-project from
 * authority rather than resurrect client-local staging.
 */
export function projectBattleJankenRecoveryContinuity(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return jankenContinuityFailure('INPUT_INVALID');
  }

  const {
    recoveryTrigger,
    authoritativeContext,
    localFocusState = null,
    localStagedPackage = null,
  } = input;

  if (!VALID_JANKEN_RECOVERY_TRIGGERS.has(recoveryTrigger)) {
    return jankenContinuityFailure('RECOVERY_TRIGGER_INVALID');
  }
  if (!validAuthoritativeJankenContext(authoritativeContext)) {
    return jankenContinuityFailure('AUTHORITATIVE_JANKEN_CONTEXT_INVALID');
  }
  if (localFocusState !== null
    && (!localFocusState || typeof localFocusState !== 'object' || Array.isArray(localFocusState))) {
    return jankenContinuityFailure('LOCAL_FOCUS_STATE_INVALID');
  }
  if (localStagedPackage !== null
    && (!localStagedPackage || typeof localStagedPackage !== 'object' || Array.isArray(localStagedPackage))) {
    return jankenContinuityFailure('LOCAL_STAGED_PACKAGE_INVALID');
  }

  const previousGenerationId = canonicalIdentity(localFocusState?.generationId)
    ? localFocusState.generationId
    : null;

  return deepFreeze({
    schema: BATTLE_JANKEN_RECOVERY_CONTINUITY_SCHEMA,
    ok: true,
    reason: 'OK',
    recoveryTrigger,
    generationId: authoritativeContext.generationId,
    authoritativeContext,
    assignment: authoritativeContext.assignment,
    packages: authoritativeContext.packages,
    localFocusState: null,
    localStagedPackage: null,
    clearedLocalFocus: localFocusState !== null,
    clearedStagedPackage: localStagedPackage !== null,
    previousGenerationId,
    generationMismatch: previousGenerationId !== null
      && previousGenerationId !== authoritativeContext.generationId,
    handAssignmentReroll: false,
    compoundPackageRecompute: false,
    legalityRecompute: false,
    routeRecompute: false,
    committedRollback: false,
    gameplayAuthority: false,
    gameStateWrite: false,
  });
}

export const BATTLE_RECOVERY_LIVE_ADAPTER_CONTRACT = deepFreeze({
  schema: BATTLE_RECOVERY_LIVE_ADAPTER_SCHEMA,
  reconnectStateAuthority: 'EXISTING_BATTLE_2V2_RECONNECT_CORE',
  localSeatAuthority: 'EXISTING_BATTLE_2V2_RECONNECT_CORE',
  reconnectInFlightAuthority: 'CALLER_EXPLICIT_ONLY',
  staleInputAuthority: 'CALLER_EXPLICIT_CONTROL_ENVELOPE_REJECTION_PLUS_EXISTING_CURRENT_ENVELOPE_GUARD',
  readyMapping: 'SELF_ONLY',
  waitingMapping: 'TEMPORARY_PARTNER_ONLY',
  reconnectingMapping: 'TEMPORARY_PARTNER_PLUS_CALLER_EXPLICIT_IN_FLIGHT',
  permanentPartnerMapping: 'FAIL_CLOSED_UNRESOLVED',
  uncontrolledMapping: 'FAIL_CLOSED_UNRESOLVED',
  createsReconnectState: false,
  startsReconnect: false,
  computesTimeoutOrGrace: false,
  computesRetryPolicy: false,
  computesControlOwner: false,
  computesLegality: false,
  computesResult: false,
  writesGameState: false,
  runtimeSurfaceAuthority: 'CALLER_OWNED_EXISTING_RUNTIME_ONLY',
  jankenRecoveryContextSource: 'EXISTING_BATTLE_JANKEN_FOCUS_AUTHORITY_CONTEXT',
  jankenRecoveryTriggerAuthority: 'CALLER_EXPLICIT_ONLY',
  jankenRecoveryPreservesAuthoritativeAssignmentByReference: true,
  jankenRecoveryPreservesAuthoritativePackagesByReference: true,
  jankenRecoveryClearsLocalFocus: true,
  jankenRecoveryClearsLocalStagedPackage: true,
  jankenRecoveryRerollsHand3: false,
  jankenRecoveryRecomputesCompoundPackage: false,
  jankenRecoveryRollsBackCommittedAction: false,
});
