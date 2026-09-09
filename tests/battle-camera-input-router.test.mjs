import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BATTLE_CAMERA_INPUT_KINDS,
  BATTLE_CAMERA_INPUT_ROUTER_CONTRACT,
  BATTLE_CAMERA_INPUT_SOURCES,
  routeBattleCameraInput,
} from '../browser/battle-camera-input-router.mjs';
import {
  BATTLE_CAMERA_COMMANDS,
  BATTLE_CAMERA_MODES,
  createBattleCameraControlState,
} from '../browser/battle-camera-control-core.mjs';

const LIMITS = Object.freeze({
  x: { min: -100, max: 100 },
  y: { min: -60, max: 60 },
  zoom: { min: 0.5, max: 2 },
  angle: { min: -35, max: 55 },
});

function makeState() {
  return createBattleCameraControlState({
    controlledCharacterId: 'P1:CHAR-A',
    controlledWorldPoint: { x: 10, y: 12 },
    followZoom: 1,
    followAngle: 20,
    limits: LIMITS,
  });
}

test('world pan enters manual inspection and routes through the merged camera core', () => {
  const result = routeBattleCameraInput(makeState(), {
    kind: BATTLE_CAMERA_INPUT_KINDS.PAN,
    source: BATTLE_CAMERA_INPUT_SOURCES.WORLD,
    dx: 12,
    dy: -5,
  });

  assert.equal(result.ok, true);
  assert.equal(result.applied, true);
  assert.equal(result.state.mode, BATTLE_CAMERA_MODES.MANUAL_INSPECT);
  assert.deepEqual(result.state.center, { x: 22, y: 7 });
  assert.deepEqual(result.commandsApplied, [
    BATTLE_CAMERA_COMMANDS.BEGIN_MANUAL_INSPECT,
    BATTLE_CAMERA_COMMANDS.PAN,
  ]);
});

test('world zoom and angle can start manual inspection without inventing sensitivity', () => {
  const zoom = routeBattleCameraInput(makeState(), {
    kind: BATTLE_CAMERA_INPUT_KINDS.ZOOM,
    source: BATTLE_CAMERA_INPUT_SOURCES.WORLD,
    zoom: 1.5,
  });
  assert.equal(zoom.state.mode, BATTLE_CAMERA_MODES.MANUAL_INSPECT);
  assert.equal(zoom.state.zoom, 1.5);

  const angle = routeBattleCameraInput(makeState(), {
    kind: BATTLE_CAMERA_INPUT_KINDS.ANGLE,
    source: BATTLE_CAMERA_INPUT_SOURCES.WORLD,
    angle: 40,
  });
  assert.equal(angle.state.mode, BATTLE_CAMERA_MODES.MANUAL_INSPECT);
  assert.equal(angle.state.angle, 40);
  assert.equal(BATTLE_CAMERA_INPUT_ROUTER_CONTRACT.gestureSensitivityOwned, false);
});

test('screen-space UI gestures never reach camera commands', () => {
  const original = makeState();
  const result = routeBattleCameraInput(original, {
    kind: BATTLE_CAMERA_INPUT_KINDS.PAN,
    source: BATTLE_CAMERA_INPUT_SOURCES.SCREEN_UI,
    dx: 99,
    dy: 99,
  });
  assert.equal(result.ok, true);
  assert.equal(result.applied, false);
  assert.equal(result.reason, 'SCREEN_UI_SOURCE_BLOCKED_FROM_CAMERA');
  assert.equal(result.state, original);
  assert.deepEqual(result.commandsApplied, []);
});

test('caller-declared UI ownership wins even when pointer started over a world-looking region', () => {
  const original = makeState();
  const result = routeBattleCameraInput(original, {
    kind: BATTLE_CAMERA_INPUT_KINDS.ZOOM,
    source: BATTLE_CAMERA_INPUT_SOURCES.WORLD,
    uiGestureOwned: true,
    zoom: 1.8,
  });
  assert.equal(result.applied, false);
  assert.equal(result.reason, 'SCREEN_UI_GESTURE_OWNS_INPUT');
  assert.equal(result.state, original);
});

test('one-action return is accepted only from the explicit camera control', () => {
  let state = routeBattleCameraInput(makeState(), {
    kind: BATTLE_CAMERA_INPUT_KINDS.PAN,
    source: BATTLE_CAMERA_INPUT_SOURCES.WORLD,
    dx: 40,
    dy: 20,
  }).state;

  const wrongSource = routeBattleCameraInput(state, {
    kind: BATTLE_CAMERA_INPUT_KINDS.RETURN_TO_CONTROLLED,
    source: BATTLE_CAMERA_INPUT_SOURCES.WORLD,
  });
  assert.equal(wrongSource.applied, false);
  assert.equal(wrongSource.state.mode, BATTLE_CAMERA_MODES.MANUAL_INSPECT);

  const returned = routeBattleCameraInput(state, {
    kind: BATTLE_CAMERA_INPUT_KINDS.RETURN_TO_CONTROLLED,
    source: BATTLE_CAMERA_INPUT_SOURCES.CAMERA_CONTROL,
  });
  assert.equal(returned.applied, true);
  assert.equal(returned.state.mode, BATTLE_CAMERA_MODES.FOLLOW_CONTROLLED);
  assert.deepEqual(returned.state.center, { x: 10, y: 12 });
  assert.deepEqual(returned.commandsApplied, [BATTLE_CAMERA_COMMANDS.RETURN_TO_CONTROLLED]);
});

test('camera return itself can still be blocked when another screen UI owns the gesture', () => {
  const original = makeState();
  const result = routeBattleCameraInput(original, {
    kind: BATTLE_CAMERA_INPUT_KINDS.RETURN_TO_CONTROLLED,
    source: BATTLE_CAMERA_INPUT_SOURCES.CAMERA_CONTROL,
    uiGestureOwned: true,
  });
  assert.equal(result.applied, false);
  assert.equal(result.reason, 'SCREEN_UI_GESTURE_OWNS_INPUT');
});

test('unsupported input fails closed and never creates a camera command', () => {
  const original = makeState();
  const result = routeBattleCameraInput(original, {
    kind: 'ROTATE_WORLD_AND_PICK_TARGET',
    source: BATTLE_CAMERA_INPUT_SOURCES.WORLD,
  });
  assert.equal(result.ok, false);
  assert.equal(result.applied, false);
  assert.equal(result.reason, 'UNSUPPORTED_CAMERA_INPUT');
  assert.equal(result.state, original);
});

test('router contract owns no DOM, pointer capture, gameplay or legality authority', () => {
  assert.equal(BATTLE_CAMERA_INPUT_ROUTER_CONTRACT.callerNormalizesGestures, true);
  assert.equal(BATTLE_CAMERA_INPUT_ROUTER_CONTRACT.domListenerOwnership, false);
  assert.equal(BATTLE_CAMERA_INPUT_ROUTER_CONTRACT.pointerCaptureOwnership, false);
  assert.equal(BATTLE_CAMERA_INPUT_ROUTER_CONTRACT.screenUiInputIgnoredByCamera, true);
  assert.equal(BATTLE_CAMERA_INPUT_ROUTER_CONTRACT.gameplayAuthority, false);
  assert.equal(BATTLE_CAMERA_INPUT_ROUTER_CONTRACT.movementAuthority, false);
  assert.equal(BATTLE_CAMERA_INPUT_ROUTER_CONTRACT.targetAuthority, false);
  assert.equal(BATTLE_CAMERA_INPUT_ROUTER_CONTRACT.legalityAuthority, false);
  assert.equal(BATTLE_CAMERA_INPUT_ROUTER_CONTRACT.resultAuthority, false);
  assert.equal(BATTLE_CAMERA_INPUT_ROUTER_CONTRACT.gameStateWrite, false);
});
