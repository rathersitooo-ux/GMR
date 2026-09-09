import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BATTLE_CAMERA_INPUT_KINDS,
  BATTLE_CAMERA_INPUT_SOURCES,
} from '../browser/battle-camera-input-router.mjs';
import {
  BATTLE_CAMERA_MODES,
  createBattleCameraControlState,
} from '../browser/battle-camera-control-core.mjs';
import {
  BATTLE_CAMERA_PRESENTATION_RUNTIME_CONTRACT,
  createBattleCameraPresentationRuntime,
} from '../browser/battle-camera-presentation-runtime.mjs';

const LIMITS = Object.freeze({
  x: { min: -100, max: 100 },
  y: { min: -60, max: 60 },
  zoom: { min: 0.5, max: 2 },
  angle: { min: -35, max: 55 },
});

function cameraState(overrides = {}) {
  return createBattleCameraControlState({
    controlledCharacterId: 'P1:CHAR-A',
    controlledWorldPoint: { x: 10, y: 12 },
    followZoom: 1,
    followAngle: 20,
    limits: LIMITS,
    ...overrides,
  });
}

function harness(overrides = {}) {
  const renders = [];
  const runtime = createBattleCameraPresentationRuntime({
    initialState: cameraState(),
    renderWorldCamera: (projection) => renders.push(projection),
    ...overrides,
  });
  return { runtime, renders };
}

test('projects caller-owned follow camera state without adding gameplay authority', () => {
  const { runtime, renders } = harness();
  const result = runtime.render();

  assert.equal(result.ok, true);
  assert.equal(result.rendered, true);
  assert.equal(renders.length, 1);
  assert.equal(renders[0].mode, BATTLE_CAMERA_MODES.FOLLOW_CONTROLLED);
  assert.deepEqual(renders[0].worldTransform.center, { x: 10, y: 12 });
  assert.equal(renders[0].worldTransform.zoom, 1);
  assert.equal(renders[0].worldTransform.angle, 20);
  assert.equal(renders[0].screenSpaceUiAffected, false);
  assert.equal(renders[0].gameStateWrite, false);
});

test('world pan enters manual inspect through the existing input router and renders once', () => {
  const { runtime, renders } = harness();
  const result = runtime.routeInput({
    kind: BATTLE_CAMERA_INPUT_KINDS.PAN,
    source: BATTLE_CAMERA_INPUT_SOURCES.WORLD,
    dx: 15,
    dy: -8,
  });

  assert.equal(result.ok, true);
  assert.equal(result.applied, true);
  assert.equal(result.rendered, true);
  assert.equal(result.state.mode, BATTLE_CAMERA_MODES.MANUAL_INSPECT);
  assert.deepEqual(result.state.center, { x: 25, y: 4 });
  assert.equal(runtime.getRevision(), 1);
  assert.equal(renders.length, 1);
});

test('screen-space and UI-owned gestures do not move or rerender the world camera', () => {
  const { runtime, renders } = harness();
  const initial = runtime.getState();

  const screenUi = runtime.routeInput({
    kind: BATTLE_CAMERA_INPUT_KINDS.PAN,
    source: BATTLE_CAMERA_INPUT_SOURCES.SCREEN_UI,
    dx: 50,
    dy: 50,
  });
  const owned = runtime.routeInput({
    kind: BATTLE_CAMERA_INPUT_KINDS.ZOOM,
    source: BATTLE_CAMERA_INPUT_SOURCES.WORLD,
    uiGestureOwned: true,
    zoom: 1.8,
  });

  assert.equal(screenUi.ok, true);
  assert.equal(screenUi.applied, false);
  assert.equal(owned.ok, true);
  assert.equal(owned.applied, false);
  assert.equal(runtime.getState(), initial);
  assert.equal(runtime.getRevision(), 0);
  assert.equal(renders.length, 0);
});

test('controlled-character sync updates the return anchor without stealing manual inspection', () => {
  const { runtime, renders } = harness();
  runtime.routeInput({
    kind: BATTLE_CAMERA_INPUT_KINDS.PAN,
    source: BATTLE_CAMERA_INPUT_SOURCES.WORLD,
    dx: 20,
    dy: 5,
  });
  const manualCenter = runtime.getState().center;

  const sync = runtime.syncControlledPoint({
    controlledCharacterId: 'P1:CHAR-A',
    controlledWorldPoint: { x: 70, y: 40 },
  });

  assert.equal(sync.ok, true);
  assert.equal(sync.applied, true);
  assert.equal(sync.state.mode, BATTLE_CAMERA_MODES.MANUAL_INSPECT);
  assert.deepEqual(sync.state.center, manualCenter);
  assert.deepEqual(sync.state.controlledWorldPoint, { x: 70, y: 40 });
  assert.equal(renders.length, 2);
});

test('one action returns to the latest controlled character point and follow framing', () => {
  const { runtime } = harness();
  runtime.routeInput({
    kind: BATTLE_CAMERA_INPUT_KINDS.PAN,
    source: BATTLE_CAMERA_INPUT_SOURCES.WORLD,
    dx: 30,
    dy: 10,
  });
  runtime.routeInput({
    kind: BATTLE_CAMERA_INPUT_KINDS.ZOOM,
    source: BATTLE_CAMERA_INPUT_SOURCES.WORLD,
    zoom: 1.7,
  });
  runtime.routeInput({
    kind: BATTLE_CAMERA_INPUT_KINDS.ANGLE,
    source: BATTLE_CAMERA_INPUT_SOURCES.WORLD,
    angle: 45,
  });
  runtime.syncControlledPoint({
    controlledCharacterId: 'P1:CHAR-A',
    controlledWorldPoint: { x: 80, y: 50 },
  });

  const returned = runtime.returnToControlled();
  assert.equal(returned.ok, true);
  assert.equal(returned.state.mode, BATTLE_CAMERA_MODES.FOLLOW_CONTROLLED);
  assert.deepEqual(returned.state.center, { x: 80, y: 50 });
  assert.equal(returned.state.zoom, 1);
  assert.equal(returned.state.angle, 20);
});

test('malformed input fails soft and leaves the current camera state untouched', () => {
  const { runtime, renders } = harness();
  const before = runtime.getState();
  const result = runtime.routeInput({
    kind: BATTLE_CAMERA_INPUT_KINDS.PAN,
    source: BATTLE_CAMERA_INPUT_SOURCES.WORLD,
    dx: Number.NaN,
    dy: 1,
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'INVALID_CAMERA_INPUT');
  assert.equal(runtime.getState(), before);
  assert.equal(runtime.getRevision(), 0);
  assert.equal(renders.length, 0);
});

test('renderer failure is contained after state projection without creating authority side effects', () => {
  const runtime = createBattleCameraPresentationRuntime({
    initialState: cameraState(),
    renderWorldCamera: () => { throw new Error('renderer offline'); },
  });

  const result = runtime.routeInput({
    kind: BATTLE_CAMERA_INPUT_KINDS.PAN,
    source: BATTLE_CAMERA_INPUT_SOURCES.WORLD,
    dx: 5,
    dy: 0,
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'RENDER_FAILED');
  assert.equal(result.applied, true);
  assert.equal(runtime.getState().mode, BATTLE_CAMERA_MODES.MANUAL_INSPECT);
  assert.equal(runtime.getState().gameStateWrite, false);
});

test('published runtime contract keeps DOM ownership and gameplay authority outside this component', () => {
  assert.equal(BATTLE_CAMERA_PRESENTATION_RUNTIME_CONTRACT.composesCameraControlCore, true);
  assert.equal(BATTLE_CAMERA_PRESENTATION_RUNTIME_CONTRACT.composesCameraInputRouter, true);
  assert.equal(BATTLE_CAMERA_PRESENTATION_RUNTIME_CONTRACT.rendererInjectedByCaller, true);
  assert.equal(BATTLE_CAMERA_PRESENTATION_RUNTIME_CONTRACT.domListenerOwnership, false);
  assert.equal(BATTLE_CAMERA_PRESENTATION_RUNTIME_CONTRACT.pointerCaptureOwnership, false);
  assert.equal(BATTLE_CAMERA_PRESENTATION_RUNTIME_CONTRACT.gestureSensitivityOwnership, false);
  assert.equal(BATTLE_CAMERA_PRESENTATION_RUNTIME_CONTRACT.worldObjectRelayout, false);
  assert.equal(BATTLE_CAMERA_PRESENTATION_RUNTIME_CONTRACT.screenSpaceUiAffected, false);
  assert.equal(BATTLE_CAMERA_PRESENTATION_RUNTIME_CONTRACT.gameplayAuthority, false);
  assert.equal(BATTLE_CAMERA_PRESENTATION_RUNTIME_CONTRACT.movementAuthority, false);
  assert.equal(BATTLE_CAMERA_PRESENTATION_RUNTIME_CONTRACT.targetAuthority, false);
  assert.equal(BATTLE_CAMERA_PRESENTATION_RUNTIME_CONTRACT.legalityAuthority, false);
  assert.equal(BATTLE_CAMERA_PRESENTATION_RUNTIME_CONTRACT.resultAuthority, false);
  assert.equal(BATTLE_CAMERA_PRESENTATION_RUNTIME_CONTRACT.gameStateWrite, false);
  assert.equal(BATTLE_CAMERA_PRESENTATION_RUNTIME_CONTRACT.liveHtmlMountIncluded, false);
});
