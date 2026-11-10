const CAMERA_SCHEMA = 'gameroad.battle-camera-control.v1';

export const BATTLE_CAMERA_MODES = Object.freeze({
  FOLLOW_CONTROLLED: 'FOLLOW_CONTROLLED',
  MANUAL_INSPECT: 'MANUAL_INSPECT',
});

export const BATTLE_CAMERA_COMMANDS = Object.freeze({
  BEGIN_MANUAL_INSPECT: 'BEGIN_MANUAL_INSPECT',
  PAN: 'PAN',
  SET_ZOOM: 'SET_ZOOM',
  SET_ANGLE: 'SET_ANGLE',
  SYNC_CONTROLLED_POINT: 'SYNC_CONTROLLED_POINT',
  RETURN_TO_CONTROLLED: 'RETURN_TO_CONTROLLED',
});

function finiteNumber(value, name) {
  if (!Number.isFinite(value)) throw new TypeError(`${name} must be a finite number`);
  return value;
}

function point(value, name) {
  if (!value || typeof value !== 'object') throw new TypeError(`${name} must be an object`);
  return Object.freeze({
    x: finiteNumber(value.x, `${name}.x`),
    y: finiteNumber(value.y, `${name}.y`),
  });
}

function orderedRange(value, name) {
  if (!value || typeof value !== 'object') throw new TypeError(`${name} must be an object`);
  const min = finiteNumber(value.min, `${name}.min`);
  const max = finiteNumber(value.max, `${name}.max`);
  if (min > max) throw new RangeError(`${name}.min must be <= ${name}.max`);
  return Object.freeze({ min, max });
}

function normalizeLimits(limits) {
  if (!limits || typeof limits !== 'object') {
    throw new TypeError('limits are required; camera numeric limits are caller-owned');
  }
  return Object.freeze({
    x: orderedRange(limits.x, 'limits.x'),
    y: orderedRange(limits.y, 'limits.y'),
    zoom: orderedRange(limits.zoom, 'limits.zoom'),
    angle: orderedRange(limits.angle, 'limits.angle'),
  });
}

function clamp(value, range) {
  return Math.min(range.max, Math.max(range.min, value));
}

function clampPoint(value, limits) {
  return Object.freeze({
    x: clamp(value.x, limits.x),
    y: clamp(value.y, limits.y),
  });
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function snapshot(state, patch = {}) {
  return deepFreeze({ ...state, ...patch });
}

function result(state, reason, changed) {
  return deepFreeze({ ok: true, reason, changed, state });
}

export function createBattleCameraControlState({
  controlledCharacterId,
  controlledWorldPoint,
  followZoom,
  followAngle,
  limits,
  reducedMotion = false,
  lowPerformance = false,
} = {}) {
  if (typeof controlledCharacterId !== 'string' || controlledCharacterId.length === 0) {
    throw new TypeError('controlledCharacterId is required');
  }

  const normalizedLimits = normalizeLimits(limits);
  const controlledPoint = clampPoint(point(controlledWorldPoint, 'controlledWorldPoint'), normalizedLimits);
  const normalizedFollowZoom = clamp(finiteNumber(followZoom, 'followZoom'), normalizedLimits.zoom);
  const normalizedFollowAngle = clamp(finiteNumber(followAngle, 'followAngle'), normalizedLimits.angle);

  return deepFreeze({
    schema: CAMERA_SCHEMA,
    mode: BATTLE_CAMERA_MODES.FOLLOW_CONTROLLED,
    controlledCharacterId,
    controlledWorldPoint: controlledPoint,
    center: controlledPoint,
    zoom: normalizedFollowZoom,
    angle: normalizedFollowAngle,
    followDefaults: Object.freeze({
      zoom: normalizedFollowZoom,
      angle: normalizedFollowAngle,
    }),
    limits: normalizedLimits,
    reducedMotion: Boolean(reducedMotion),
    lowPerformance: Boolean(lowPerformance),
    manualInspectionAvailable: true,
    oneActionReturnAvailable: true,
    screenSpaceUiAffected: false,
    gameplayAuthority: false,
    movementAuthority: false,
    targetAuthority: false,
    legalityAuthority: false,
    resultAuthority: false,
    gameStateWrite: false,
  });
}

export function applyBattleCameraCommand(state, command) {
  if (!state || state.schema !== CAMERA_SCHEMA) {
    return deepFreeze({ ok: false, reason: 'INVALID_CAMERA_STATE', changed: false, state: null });
  }
  if (!command || typeof command !== 'object') {
    return deepFreeze({ ok: false, reason: 'INVALID_CAMERA_COMMAND', changed: false, state });
  }

  switch (command.type) {
    case BATTLE_CAMERA_COMMANDS.BEGIN_MANUAL_INSPECT: {
      if (state.mode === BATTLE_CAMERA_MODES.MANUAL_INSPECT) {
        return result(state, 'ALREADY_MANUAL_INSPECT', false);
      }
      return result(snapshot(state, { mode: BATTLE_CAMERA_MODES.MANUAL_INSPECT }), 'MANUAL_INSPECT_STARTED', true);
    }

    case BATTLE_CAMERA_COMMANDS.PAN: {
      if (state.mode !== BATTLE_CAMERA_MODES.MANUAL_INSPECT) {
        return result(state, 'PAN_REQUIRES_MANUAL_INSPECT', false);
      }
      const dx = finiteNumber(command.dx, 'command.dx');
      const dy = finiteNumber(command.dy, 'command.dy');
      const center = clampPoint({ x: state.center.x + dx, y: state.center.y + dy }, state.limits);
      return result(snapshot(state, { center }), 'CAMERA_PANNED', center.x !== state.center.x || center.y !== state.center.y);
    }

    case BATTLE_CAMERA_COMMANDS.SET_ZOOM: {
      if (state.mode !== BATTLE_CAMERA_MODES.MANUAL_INSPECT) {
        return result(state, 'ZOOM_REQUIRES_MANUAL_INSPECT', false);
      }
      const zoom = clamp(finiteNumber(command.zoom, 'command.zoom'), state.limits.zoom);
      return result(snapshot(state, { zoom }), 'CAMERA_ZOOM_SET', zoom !== state.zoom);
    }

    case BATTLE_CAMERA_COMMANDS.SET_ANGLE: {
      if (state.mode !== BATTLE_CAMERA_MODES.MANUAL_INSPECT) {
        return result(state, 'ANGLE_REQUIRES_MANUAL_INSPECT', false);
      }
      const angle = clamp(finiteNumber(command.angle, 'command.angle'), state.limits.angle);
      return result(snapshot(state, { angle }), 'CAMERA_ANGLE_SET', angle !== state.angle);
    }

    case BATTLE_CAMERA_COMMANDS.SYNC_CONTROLLED_POINT: {
      if (command.controlledCharacterId !== state.controlledCharacterId) {
        return deepFreeze({ ok: false, reason: 'CONTROLLED_CHARACTER_ID_MISMATCH', changed: false, state });
      }
      const controlledWorldPoint = clampPoint(point(command.controlledWorldPoint, 'command.controlledWorldPoint'), state.limits);
      if (state.mode === BATTLE_CAMERA_MODES.FOLLOW_CONTROLLED) {
        return result(
          snapshot(state, { controlledWorldPoint, center: controlledWorldPoint }),
          'FOLLOW_POINT_SYNCED',
          controlledWorldPoint.x !== state.controlledWorldPoint.x || controlledWorldPoint.y !== state.controlledWorldPoint.y,
        );
      }
      return result(
        snapshot(state, { controlledWorldPoint }),
        'MANUAL_INSPECT_ANCHOR_SYNCED_WITHOUT_VIEW_STEAL',
        controlledWorldPoint.x !== state.controlledWorldPoint.x || controlledWorldPoint.y !== state.controlledWorldPoint.y,
      );
    }

    case BATTLE_CAMERA_COMMANDS.RETURN_TO_CONTROLLED: {
      const next = snapshot(state, {
        mode: BATTLE_CAMERA_MODES.FOLLOW_CONTROLLED,
        center: state.controlledWorldPoint,
        zoom: state.followDefaults.zoom,
        angle: state.followDefaults.angle,
      });
      const changed = state.mode !== BATTLE_CAMERA_MODES.FOLLOW_CONTROLLED
        || state.center.x !== next.center.x
        || state.center.y !== next.center.y
        || state.zoom !== next.zoom
        || state.angle !== next.angle;
      return result(next, 'RETURNED_TO_CONTROLLED_CHARACTER', changed);
    }

    default:
      return deepFreeze({ ok: false, reason: 'UNSUPPORTED_CAMERA_COMMAND', changed: false, state });
  }
}

export const BATTLE_CAMERA_CONTROL_CONTRACT = Object.freeze({
  schema: CAMERA_SCHEMA,
  defaultMode: BATTLE_CAMERA_MODES.FOLLOW_CONTROLLED,
  manualInspection: Object.freeze({ pan: true, zoom: true, angleChange: true }),
  oneActionReturn: true,
  numericLimitsOwnedByCaller: true,
  worldObjectRelayout: false,
  screenSpaceUiAffected: false,
  autoEventCutOwned: false,
  gameplayAuthority: false,
  movementAuthority: false,
  targetAuthority: false,
  legalityAuthority: false,
  resultAuthority: false,
  gameStateWrite: false,
  liveRuntimeWiringIncluded: false,
});
