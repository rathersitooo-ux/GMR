import {
  applyBattleCameraCommand,
  BATTLE_CAMERA_COMMANDS,
} from './battle-camera-control-core.mjs';
import {
  BATTLE_CAMERA_INPUT_KINDS,
  BATTLE_CAMERA_INPUT_SOURCES,
  routeBattleCameraInput,
} from './battle-camera-input-router.mjs';

const RUNTIME_SCHEMA = 'gameroad.battle-camera-presentation-runtime.v1';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function finitePoint(value, name) {
  if (!value || typeof value !== 'object') throw new TypeError(`${name} must be an object`);
  if (!Number.isFinite(value.x) || !Number.isFinite(value.y)) {
    throw new TypeError(`${name} must contain finite x/y`);
  }
  return Object.freeze({ x: value.x, y: value.y });
}

function projectState(state, revision) {
  if (!state || typeof state !== 'object') throw new TypeError('camera state is required');
  if (!Number.isFinite(state.zoom) || !Number.isFinite(state.angle)) {
    throw new TypeError('camera state must contain finite zoom/angle');
  }

  return deepFreeze({
    schema: RUNTIME_SCHEMA,
    revision,
    mode: state.mode,
    controlledCharacterId: state.controlledCharacterId,
    controlledWorldPoint: finitePoint(state.controlledWorldPoint, 'controlledWorldPoint'),
    worldTransform: Object.freeze({
      center: finitePoint(state.center, 'center'),
      zoom: state.zoom,
      angle: state.angle,
    }),
    reducedMotion: Boolean(state.reducedMotion),
    lowPerformance: Boolean(state.lowPerformance),
    screenSpaceUiAffected: false,
    gameplayAuthority: false,
    movementAuthority: false,
    targetAuthority: false,
    legalityAuthority: false,
    resultAuthority: false,
    gameStateWrite: false,
  });
}

function failure(state, revision, reason, error = null) {
  return deepFreeze({
    ok: false,
    applied: false,
    rendered: false,
    reason,
    errorName: error?.name ?? null,
    state,
    revision,
  });
}

export function createBattleCameraPresentationRuntime({
  initialState,
  renderWorldCamera,
} = {}) {
  if (typeof renderWorldCamera !== 'function') {
    throw new TypeError('renderWorldCamera must be a function');
  }

  let state = initialState;
  let revision = 0;
  projectState(state, revision);

  function render(reason = 'EXPLICIT_RENDER') {
    let projection;
    try {
      projection = projectState(state, revision);
    } catch (error) {
      return failure(state, revision, 'INVALID_CAMERA_STATE', error);
    }

    try {
      renderWorldCamera(projection);
      return deepFreeze({
        ok: true,
        applied: false,
        rendered: true,
        reason,
        state,
        projection,
        revision,
      });
    } catch (error) {
      return deepFreeze({
        ok: false,
        applied: false,
        rendered: false,
        reason: 'RENDER_FAILED',
        errorName: error?.name ?? 'Error',
        state,
        projection,
        revision,
      });
    }
  }

  function applyOutcome(outcome, renderReason) {
    if (!outcome || outcome.ok !== true) {
      return deepFreeze({
        ok: false,
        applied: false,
        rendered: false,
        reason: outcome?.reason ?? 'CAMERA_OPERATION_FAILED',
        state,
        revision,
      });
    }

    const nextState = outcome.state ?? state;
    const changed = nextState !== state && (outcome.changed === true || outcome.applied === true);
    state = nextState;
    if (changed) revision += 1;

    if (!changed) {
      return deepFreeze({
        ok: true,
        applied: false,
        rendered: false,
        reason: outcome.reason,
        state,
        revision,
      });
    }

    const rendered = render(renderReason);
    return deepFreeze({
      ok: rendered.ok,
      applied: true,
      rendered: rendered.rendered,
      reason: rendered.ok ? outcome.reason : rendered.reason,
      operationReason: outcome.reason,
      errorName: rendered.errorName ?? null,
      state,
      projection: rendered.projection ?? null,
      revision,
    });
  }

  function routeInput(input) {
    try {
      return applyOutcome(routeBattleCameraInput(state, input), 'CAMERA_INPUT_APPLIED');
    } catch (error) {
      return failure(state, revision, 'INVALID_CAMERA_INPUT', error);
    }
  }

  function syncControlledPoint({ controlledCharacterId, controlledWorldPoint } = {}) {
    try {
      return applyOutcome(applyBattleCameraCommand(state, {
        type: BATTLE_CAMERA_COMMANDS.SYNC_CONTROLLED_POINT,
        controlledCharacterId,
        controlledWorldPoint,
      }), 'CONTROLLED_POINT_SYNCED');
    } catch (error) {
      return failure(state, revision, 'INVALID_CONTROLLED_POINT_SYNC', error);
    }
  }

  function returnToControlled() {
    return routeInput({
      kind: BATTLE_CAMERA_INPUT_KINDS.RETURN_TO_CONTROLLED,
      source: BATTLE_CAMERA_INPUT_SOURCES.CAMERA_CONTROL,
    });
  }

  return Object.freeze({
    getState: () => state,
    getRevision: () => revision,
    getProjection: () => projectState(state, revision),
    render,
    routeInput,
    syncControlledPoint,
    returnToControlled,
  });
}

export const BATTLE_CAMERA_PRESENTATION_RUNTIME_CONTRACT = Object.freeze({
  schema: RUNTIME_SCHEMA,
  composesCameraControlCore: true,
  composesCameraInputRouter: true,
  rendererInjectedByCaller: true,
  domListenerOwnership: false,
  pointerCaptureOwnership: false,
  gestureSensitivityOwnership: false,
  numericCameraLimitsOwnedByCaller: true,
  controlledPositionOwnedByCaller: true,
  manualInspectionDoesNotStealOnControlledSync: true,
  oneActionReturn: true,
  worldObjectRelayout: false,
  screenSpaceUiAffected: false,
  gameplayAuthority: false,
  movementAuthority: false,
  targetAuthority: false,
  legalityAuthority: false,
  resultAuthority: false,
  gameStateWrite: false,
  liveHtmlMountIncluded: false,
});
