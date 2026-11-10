const SCHEMA = 'gameroad.battle-cinematic-skip-intent.v1';

export const DEFAULT_WIPE_MIN_DISTANCE_PX = 72;
export const DEFAULT_WIPE_MAX_CROSS_AXIS_RATIO = 0.72;

const SOURCES = new Set(['button', 'wipe']);

function finiteNumber(value, code) {
  if (!Number.isFinite(value)) throw new TypeError(code);
  return Number(value);
}

function cleanEventId(value) {
  const id = typeof value === 'string' ? value.trim() : '';
  if (!id) throw new TypeError('BATTLE_CINEMATIC_SKIP_EVENT_ID_REQUIRED');
  return id;
}

function cleanPhase(value) {
  if (value == null) return null;
  const phase = String(value).trim();
  return phase || null;
}

function skipAllowed(allowedInputs) {
  return Array.isArray(allowedInputs)
    && allowedInputs.some(value => String(value).trim().toLowerCase() === 'skip');
}

function baseResult({ accepted, source, eventId, phase, reason }) {
  return Object.freeze({
    schema: SCHEMA,
    accepted,
    source,
    eventId,
    phase,
    reason,
    presentationOnly: true,
    gameplayAuthority: false,
    gameStateWrite: false,
    winnerCalculation: false,
    orderCalculation: false,
    targetCalculation: false,
    cardMovementCalculation: false,
    boardEffectCalculation: false,
    resultMutation: false,
    preserveAuthoritativeState: true
  });
}

export function createBattleCinematicSkipIntent({
  source,
  eventId,
  phase = null,
  allowedInputs = []
} = {}) {
  const normalizedSource = typeof source === 'string' ? source.trim().toLowerCase() : '';
  if (!SOURCES.has(normalizedSource)) {
    throw new TypeError('BATTLE_CINEMATIC_SKIP_SOURCE_INVALID');
  }

  const normalizedEventId = cleanEventId(eventId);
  const normalizedPhase = cleanPhase(phase);
  if (!skipAllowed(allowedInputs)) {
    return baseResult({
      accepted: false,
      source: normalizedSource,
      eventId: normalizedEventId,
      phase: normalizedPhase,
      reason: 'SKIP_NOT_ALLOWED'
    });
  }

  return Object.freeze({
    ...baseResult({
      accepted: true,
      source: normalizedSource,
      eventId: normalizedEventId,
      phase: normalizedPhase,
      reason: 'SKIP_ALLOWED'
    }),
    presentationCommand: 'JUMP_TO_TIMELINE_END'
  });
}

export function classifyBattleCinematicWipe({
  startX,
  startY,
  endX,
  endY,
  minDistancePx = DEFAULT_WIPE_MIN_DISTANCE_PX,
  maxCrossAxisRatio = DEFAULT_WIPE_MAX_CROSS_AXIS_RATIO
} = {}) {
  const sx = finiteNumber(startX, 'BATTLE_CINEMATIC_WIPE_START_X_REQUIRED');
  const sy = finiteNumber(startY, 'BATTLE_CINEMATIC_WIPE_START_Y_REQUIRED');
  const ex = finiteNumber(endX, 'BATTLE_CINEMATIC_WIPE_END_X_REQUIRED');
  const ey = finiteNumber(endY, 'BATTLE_CINEMATIC_WIPE_END_Y_REQUIRED');
  const minimum = finiteNumber(minDistancePx, 'BATTLE_CINEMATIC_WIPE_MIN_DISTANCE_INVALID');
  const ratioLimit = finiteNumber(maxCrossAxisRatio, 'BATTLE_CINEMATIC_WIPE_CROSS_RATIO_INVALID');

  if (minimum <= 0) throw new RangeError('BATTLE_CINEMATIC_WIPE_MIN_DISTANCE_INVALID');
  if (ratioLimit < 0) throw new RangeError('BATTLE_CINEMATIC_WIPE_CROSS_RATIO_INVALID');

  const dx = ex - sx;
  const dy = ey - sy;
  const primaryDistance = Math.abs(dx);
  const crossDistance = Math.abs(dy);
  const crossAxisRatio = primaryDistance > 0 ? crossDistance / primaryDistance : Infinity;
  const direction = dx < 0 ? 'left' : dx > 0 ? 'right' : 'none';

  let reason = 'WIPE_ACCEPTED';
  if (primaryDistance < minimum) reason = 'WIPE_TOO_SHORT';
  else if (crossAxisRatio > ratioLimit) reason = 'WIPE_TOO_VERTICAL';

  return Object.freeze({
    schema: SCHEMA,
    accepted: reason === 'WIPE_ACCEPTED',
    direction,
    dx,
    dy,
    primaryDistance,
    crossDistance,
    crossAxisRatio,
    minDistancePx: minimum,
    maxCrossAxisRatio: ratioLimit,
    reason,
    presentationOnly: true,
    gameplayAuthority: false,
    gameStateWrite: false
  });
}

export function createBattleCinematicSkipIntentFromWipe({
  gesture,
  eventId,
  phase = null,
  allowedInputs = []
} = {}) {
  if (!gesture || gesture.schema !== SCHEMA) {
    throw new TypeError('BATTLE_CINEMATIC_WIPE_GESTURE_REQUIRED');
  }

  const normalizedEventId = cleanEventId(eventId);
  const normalizedPhase = cleanPhase(phase);
  if (!gesture.accepted) {
    return baseResult({
      accepted: false,
      source: 'wipe',
      eventId: normalizedEventId,
      phase: normalizedPhase,
      reason: gesture.reason || 'WIPE_REJECTED'
    });
  }

  return createBattleCinematicSkipIntent({
    source: 'wipe',
    eventId: normalizedEventId,
    phase: normalizedPhase,
    allowedInputs
  });
}

export function routeBattleCinematicSkipIntent({
  intent,
  authoritativeState
} = {}) {
  if (!intent || intent.schema !== SCHEMA) {
    throw new TypeError('BATTLE_CINEMATIC_SKIP_INTENT_REQUIRED');
  }

  if (!intent.accepted) {
    return Object.freeze({
      consumed: false,
      presentationCommand: null,
      authoritativeState,
      authoritativeStatePreservedByReference: true,
      gameStateWrite: false
    });
  }

  return Object.freeze({
    consumed: true,
    presentationCommand: 'JUMP_TO_TIMELINE_END',
    authoritativeState,
    authoritativeStatePreservedByReference: true,
    gameStateWrite: false
  });
}

export const BATTLE_CINEMATIC_SKIP_INTENT = Object.freeze({
  schema: SCHEMA,
  presentationOnly: true,
  authority: 'NONE',
  acceptedUnderlyingInput: 'skip',
  sources: Object.freeze(['button', 'wipe']),
  wipeDirections: Object.freeze(['left', 'right']),
  wipeMinDistancePx: DEFAULT_WIPE_MIN_DISTANCE_PX,
  wipeMaxCrossAxisRatio: DEFAULT_WIPE_MAX_CROSS_AXIS_RATIO,
  command: 'JUMP_TO_TIMELINE_END',
  authoritativeStatePolicy: 'PASS_THROUGH_SAME_REFERENCE_NO_MUTATION',
  gameplayAuthority: false,
  gameStateWrite: false,
  winnerCalculation: false,
  orderCalculation: false,
  targetCalculation: false,
  cardMovementCalculation: false,
  boardEffectCalculation: false,
  resultMutation: false
});
