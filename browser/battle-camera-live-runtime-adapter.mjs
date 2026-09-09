import {
  applyBattleCameraCommand,
  BATTLE_CAMERA_COMMANDS,
  BATTLE_CAMERA_MODES,
  createBattleCameraControlState,
} from './battle-camera-control-core.mjs';
import {
  BATTLE_CAMERA_INPUT_KINDS,
  BATTLE_CAMERA_INPUT_SOURCES,
  routeBattleCameraInput,
} from './battle-camera-input-router.mjs';

const LIVE_ADAPTER_SCHEMA = 'gameroad.battle-camera-live-runtime-adapter.v1';

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) freeze(child);
  return value;
}

function response({ ok, applied, published, reason, state, commandsApplied = [] }) {
  return freeze({
    ok: Boolean(ok),
    applied: Boolean(applied),
    published: Boolean(published),
    reason,
    state,
    commandsApplied: Object.freeze([...commandsApplied]),
  });
}

export function createBattleCameraLiveRuntimeAdapter({
  controlledCharacterId,
  controlledWorldPoint,
  followZoom,
  followAngle,
  limits,
  reducedMotion = false,
  lowPerformance = false,
  applyCameraState,
} = {}) {
  if (typeof applyCameraState !== 'function') {
    throw new TypeError('applyCameraState callback is required');
  }

  let state = createBattleCameraControlState({
    controlledCharacterId,
    controlledWorldPoint,
    followZoom,
    followAngle,
    limits,
    reducedMotion,
    lowPerformance,
  });

  let publishSequence = 0;

  function publish(reason) {
    publishSequence += 1;
    applyCameraState(state, freeze({
      schema: LIVE_ADAPTER_SCHEMA,
      reason,
      publishSequence,
      mode: state.mode,
      visualOnly: true,
      screenSpaceUiAffected: false,
      gameStateWrite: false,
    }));
    return true;
  }

  function publishCurrent(reason = 'CAMERA_MOUNT_SYNC') {
    publish(reason);
    return response({
      ok: true,
      applied: false,
      published: true,
      reason,
      state,
    });
  }

  function handleInput(input) {
    const routed = routeBattleCameraInput(state, input);
    if (!routed.ok) {
      return response({
        ok: false,
        applied: routed.applied,
        published: false,
        reason: routed.reason,
        state: routed.state ?? state,
        commandsApplied: routed.commandsApplied,
      });
    }

    state = routed.state;
    const shouldPublish = routed.applied && routed.commandsApplied.length > 0;
    if (shouldPublish) publish(routed.reason);

    return response({
      ok: true,
      applied: routed.applied,
      published: shouldPublish,
      reason: routed.reason,
      state,
      commandsApplied: routed.commandsApplied,
    });
  }

  function syncControlledPoint({
    controlledCharacterId: nextControlledCharacterId = state.controlledCharacterId,
    controlledWorldPoint: nextControlledWorldPoint,
  } = {}) {
    const beforeMode = state.mode;
    const result = applyBattleCameraCommand(state, {
      type: BATTLE_CAMERA_COMMANDS.SYNC_CONTROLLED_POINT,
      controlledCharacterId: nextControlledCharacterId,
      controlledWorldPoint: nextControlledWorldPoint,
    });

    if (!result.ok) {
      return response({
        ok: false,
        applied: false,
        published: false,
        reason: result.reason,
        state,
      });
    }

    state = result.state;
    const viewChanged = result.changed && beforeMode === BATTLE_CAMERA_MODES.FOLLOW_CONTROLLED;
    if (viewChanged) publish(result.reason);

    return response({
      ok: true,
      applied: result.changed,
      published: viewChanged,
      reason: result.reason,
      state,
      commandsApplied: [BATTLE_CAMERA_COMMANDS.SYNC_CONTROLLED_POINT],
    });
  }

  function returnToControlled() {
    return handleInput({
      kind: BATTLE_CAMERA_INPUT_KINDS.RETURN_TO_CONTROLLED,
      source: BATTLE_CAMERA_INPUT_SOURCES.CAMERA_CONTROL,
    });
  }

  return freeze({
    schema: LIVE_ADAPTER_SCHEMA,
    getState: () => state,
    publishCurrent,
    handleInput,
    syncControlledPoint,
    returnToControlled,
  });
}

export const BATTLE_CAMERA_LIVE_RUNTIME_ADAPTER_CONTRACT = freeze({
  schema: LIVE_ADAPTER_SCHEMA,
  composesControlCore: true,
  composesInputRouter: true,
  normalizedInputOnly: true,
  domListenerOwnership: false,
  pointerCaptureOwnership: false,
  gestureSensitivityOwnership: false,
  numericLimitsOwnership: false,
  fieldGeometryOwnership: false,
  callerAppliesCameraState: true,
  worldInputSupported: true,
  screenUiInputIgnoredByRouter: true,
  oneActionReturn: true,
  controlledPointSync: true,
  reducedMotionPreservesManualInspect: true,
  lowPerformancePreservesSemantics: true,
  screenSpaceUiAffected: false,
  gameplayAuthority: false,
  movementAuthority: false,
  targetAuthority: false,
  legalityAuthority: false,
  resultAuthority: false,
  gameStateWrite: false,
  domMountIncluded: false,
  publicPackageIncluded: false,
  playerVisibleMountIncluded: false,
});
