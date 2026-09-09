import {
  applyBattleCameraCommand,
  BATTLE_CAMERA_COMMANDS,
  BATTLE_CAMERA_MODES,
} from './battle-camera-control-core.mjs';

const INPUT_SCHEMA = 'gameroad.battle-camera-input-router.v1';

export const BATTLE_CAMERA_INPUT_KINDS = Object.freeze({
  PAN: 'PAN',
  ZOOM: 'ZOOM',
  ANGLE: 'ANGLE',
  RETURN_TO_CONTROLLED: 'RETURN_TO_CONTROLLED',
});

export const BATTLE_CAMERA_INPUT_SOURCES = Object.freeze({
  WORLD: 'WORLD',
  CAMERA_CONTROL: 'CAMERA_CONTROL',
  SCREEN_UI: 'SCREEN_UI',
});

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function ignored(state, reason) {
  return deepFreeze({
    ok: true,
    applied: false,
    reason,
    state,
    commandsApplied: Object.freeze([]),
  });
}

function failed(state, reason) {
  return deepFreeze({
    ok: false,
    applied: false,
    reason,
    state,
    commandsApplied: Object.freeze([]),
  });
}

function applySequence(state, commands) {
  let current = state;
  const commandsApplied = [];

  for (const command of commands) {
    const result = applyBattleCameraCommand(current, command);
    if (!result.ok) {
      return deepFreeze({
        ok: false,
        applied: commandsApplied.length > 0,
        reason: result.reason,
        state: result.state ?? current,
        commandsApplied: Object.freeze(commandsApplied),
      });
    }
    current = result.state;
    commandsApplied.push(command.type);
  }

  return deepFreeze({
    ok: true,
    applied: commandsApplied.length > 0,
    reason: 'CAMERA_INPUT_ROUTED',
    state: current,
    commandsApplied: Object.freeze(commandsApplied),
  });
}

function manualSequence(state, command) {
  const commands = [];
  if (state.mode !== BATTLE_CAMERA_MODES.MANUAL_INSPECT) {
    commands.push({ type: BATTLE_CAMERA_COMMANDS.BEGIN_MANUAL_INSPECT });
  }
  commands.push(command);
  return commands;
}

export function routeBattleCameraInput(state, input) {
  if (!state || typeof state !== 'object') return failed(state ?? null, 'INVALID_CAMERA_STATE');
  if (!input || typeof input !== 'object') return failed(state, 'INVALID_CAMERA_INPUT');

  if (input.uiGestureOwned === true) {
    return ignored(state, 'SCREEN_UI_GESTURE_OWNS_INPUT');
  }

  if (input.source === BATTLE_CAMERA_INPUT_SOURCES.SCREEN_UI) {
    return ignored(state, 'SCREEN_UI_SOURCE_BLOCKED_FROM_CAMERA');
  }

  switch (input.kind) {
    case BATTLE_CAMERA_INPUT_KINDS.PAN:
      if (input.source !== BATTLE_CAMERA_INPUT_SOURCES.WORLD) {
        return ignored(state, 'PAN_REQUIRES_WORLD_SOURCE');
      }
      return applySequence(state, manualSequence(state, {
        type: BATTLE_CAMERA_COMMANDS.PAN,
        dx: input.dx,
        dy: input.dy,
      }));

    case BATTLE_CAMERA_INPUT_KINDS.ZOOM:
      if (input.source !== BATTLE_CAMERA_INPUT_SOURCES.WORLD) {
        return ignored(state, 'ZOOM_REQUIRES_WORLD_SOURCE');
      }
      return applySequence(state, manualSequence(state, {
        type: BATTLE_CAMERA_COMMANDS.SET_ZOOM,
        zoom: input.zoom,
      }));

    case BATTLE_CAMERA_INPUT_KINDS.ANGLE:
      if (input.source !== BATTLE_CAMERA_INPUT_SOURCES.WORLD) {
        return ignored(state, 'ANGLE_REQUIRES_WORLD_SOURCE');
      }
      return applySequence(state, manualSequence(state, {
        type: BATTLE_CAMERA_COMMANDS.SET_ANGLE,
        angle: input.angle,
      }));

    case BATTLE_CAMERA_INPUT_KINDS.RETURN_TO_CONTROLLED:
      if (input.source !== BATTLE_CAMERA_INPUT_SOURCES.CAMERA_CONTROL) {
        return ignored(state, 'RETURN_REQUIRES_CAMERA_CONTROL_SOURCE');
      }
      return applySequence(state, [{ type: BATTLE_CAMERA_COMMANDS.RETURN_TO_CONTROLLED }]);

    default:
      return failed(state, 'UNSUPPORTED_CAMERA_INPUT');
  }
}

export const BATTLE_CAMERA_INPUT_ROUTER_CONTRACT = Object.freeze({
  schema: INPUT_SCHEMA,
  callerNormalizesGestures: true,
  gestureSensitivityOwned: false,
  domListenerOwnership: false,
  pointerCaptureOwnership: false,
  worldInputCanStartManualInspect: true,
  screenUiInputIgnoredByCamera: true,
  cameraReturnControlAllowed: true,
  gameplayAuthority: false,
  movementAuthority: false,
  targetAuthority: false,
  legalityAuthority: false,
  resultAuthority: false,
  gameStateWrite: false,
  liveRuntimeWiringIncluded: false,
});
