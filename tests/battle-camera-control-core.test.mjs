import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyBattleCameraCommand,
  BATTLE_CAMERA_COMMANDS,
  BATTLE_CAMERA_CONTROL_CONTRACT,
  BATTLE_CAMERA_MODES,
  createBattleCameraControlState,
} from '../browser/battle-camera-control-core.mjs';

const LIMITS = Object.freeze({
  x: { min: -100, max: 100 },
  y: { min: -60, max: 60 },
  zoom: { min: 0.5, max: 2 },
  angle: { min: -35, max: 55 },
});

function makeState(overrides = {}) {
  return createBattleCameraControlState({
    controlledCharacterId: 'P1:CHAR-A',
    controlledWorldPoint: { x: 10, y: 12 },
    followZoom: 1,
    followAngle: 20,
    limits: LIMITS,
    ...overrides,
  });
}

test('default camera follows the controlled character instead of a whole-board overview', () => {
  const state = makeState();
  assert.equal(state.mode, BATTLE_CAMERA_MODES.FOLLOW_CONTROLLED);
  assert.deepEqual(state.center, { x: 10, y: 12 });
  assert.equal(BATTLE_CAMERA_CONTROL_CONTRACT.defaultMode, BATTLE_CAMERA_MODES.FOLLOW_CONTROLLED);
  assert.equal(BATTLE_CAMERA_CONTROL_CONTRACT.worldObjectRelayout, false);
});

test('manual inspection is an explicit mode with pan, zoom and angle changes', () => {
  let state = makeState();
  state = applyBattleCameraCommand(state, { type: BATTLE_CAMERA_COMMANDS.BEGIN_MANUAL_INSPECT }).state;
  assert.equal(state.mode, BATTLE_CAMERA_MODES.MANUAL_INSPECT);

  state = applyBattleCameraCommand(state, { type: BATTLE_CAMERA_COMMANDS.PAN, dx: 15, dy: -8 }).state;
  state = applyBattleCameraCommand(state, { type: BATTLE_CAMERA_COMMANDS.SET_ZOOM, zoom: 1.6 }).state;
  state = applyBattleCameraCommand(state, { type: BATTLE_CAMERA_COMMANDS.SET_ANGLE, angle: 35 }).state;

  assert.deepEqual(state.center, { x: 25, y: 4 });
  assert.equal(state.zoom, 1.6);
  assert.equal(state.angle, 35);
});

test('camera bounds clamp pan without inventing movement legality', () => {
  let state = makeState();
  state = applyBattleCameraCommand(state, { type: BATTLE_CAMERA_COMMANDS.BEGIN_MANUAL_INSPECT }).state;
  state = applyBattleCameraCommand(state, { type: BATTLE_CAMERA_COMMANDS.PAN, dx: 999, dy: -999 }).state;
  assert.deepEqual(state.center, { x: 100, y: -60 });
  assert.equal(state.movementAuthority, false);
  assert.equal(state.legalityAuthority, false);
});

test('zoom and angle are clamped only by caller-supplied limits', () => {
  let state = makeState();
  state = applyBattleCameraCommand(state, { type: BATTLE_CAMERA_COMMANDS.BEGIN_MANUAL_INSPECT }).state;
  state = applyBattleCameraCommand(state, { type: BATTLE_CAMERA_COMMANDS.SET_ZOOM, zoom: 99 }).state;
  state = applyBattleCameraCommand(state, { type: BATTLE_CAMERA_COMMANDS.SET_ANGLE, angle: -999 }).state;
  assert.equal(state.zoom, 2);
  assert.equal(state.angle, -35);
  assert.equal(BATTLE_CAMERA_CONTROL_CONTRACT.numericLimitsOwnedByCaller, true);
});

test('controlled-character motion updates the camera center while following', () => {
  const state = makeState();
  const result = applyBattleCameraCommand(state, {
    type: BATTLE_CAMERA_COMMANDS.SYNC_CONTROLLED_POINT,
    controlledCharacterId: 'P1:CHAR-A',
    controlledWorldPoint: { x: 30, y: 40 },
  });
  assert.equal(result.ok, true);
  assert.equal(result.reason, 'FOLLOW_POINT_SYNCED');
  assert.deepEqual(result.state.center, { x: 30, y: 40 });
});

test('manual inspection does not get stolen when the controlled character moves', () => {
  let state = makeState();
  state = applyBattleCameraCommand(state, { type: BATTLE_CAMERA_COMMANDS.BEGIN_MANUAL_INSPECT }).state;
  state = applyBattleCameraCommand(state, { type: BATTLE_CAMERA_COMMANDS.PAN, dx: 40, dy: 20 }).state;
  const manualCenter = state.center;

  const result = applyBattleCameraCommand(state, {
    type: BATTLE_CAMERA_COMMANDS.SYNC_CONTROLLED_POINT,
    controlledCharacterId: 'P1:CHAR-A',
    controlledWorldPoint: { x: -25, y: -30 },
  });

  assert.equal(result.reason, 'MANUAL_INSPECT_ANCHOR_SYNCED_WITHOUT_VIEW_STEAL');
  assert.deepEqual(result.state.center, manualCenter);
  assert.deepEqual(result.state.controlledWorldPoint, { x: -25, y: -30 });
});

test('one command returns to the latest controlled-character point and follow framing', () => {
  let state = makeState();
  state = applyBattleCameraCommand(state, { type: BATTLE_CAMERA_COMMANDS.BEGIN_MANUAL_INSPECT }).state;
  state = applyBattleCameraCommand(state, { type: BATTLE_CAMERA_COMMANDS.SET_ZOOM, zoom: 1.8 }).state;
  state = applyBattleCameraCommand(state, { type: BATTLE_CAMERA_COMMANDS.SET_ANGLE, angle: 50 }).state;
  state = applyBattleCameraCommand(state, {
    type: BATTLE_CAMERA_COMMANDS.SYNC_CONTROLLED_POINT,
    controlledCharacterId: 'P1:CHAR-A',
    controlledWorldPoint: { x: -20, y: 18 },
  }).state;

  const result = applyBattleCameraCommand(state, { type: BATTLE_CAMERA_COMMANDS.RETURN_TO_CONTROLLED });
  assert.equal(result.reason, 'RETURNED_TO_CONTROLLED_CHARACTER');
  assert.equal(result.state.mode, BATTLE_CAMERA_MODES.FOLLOW_CONTROLLED);
  assert.deepEqual(result.state.center, { x: -20, y: 18 });
  assert.equal(result.state.zoom, 1);
  assert.equal(result.state.angle, 20);
});

test('pan/zoom/angle commands fail closed while in follow mode', () => {
  const state = makeState();
  assert.equal(applyBattleCameraCommand(state, { type: BATTLE_CAMERA_COMMANDS.PAN, dx: 1, dy: 1 }).changed, false);
  assert.equal(applyBattleCameraCommand(state, { type: BATTLE_CAMERA_COMMANDS.SET_ZOOM, zoom: 1.2 }).changed, false);
  assert.equal(applyBattleCameraCommand(state, { type: BATTLE_CAMERA_COMMANDS.SET_ANGLE, angle: 25 }).changed, false);
  assert.deepEqual(state.center, { x: 10, y: 12 });
});

test('mismatched controlled identity cannot move the follow anchor', () => {
  const state = makeState();
  const result = applyBattleCameraCommand(state, {
    type: BATTLE_CAMERA_COMMANDS.SYNC_CONTROLLED_POINT,
    controlledCharacterId: 'P2:CHAR-B',
    controlledWorldPoint: { x: 99, y: 44 },
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'CONTROLLED_CHARACTER_ID_MISMATCH');
  assert.deepEqual(result.state.center, { x: 10, y: 12 });
});

test('ReducedMotion and LowPerf preserve camera semantics and never become game authority', () => {
  const state = makeState({ reducedMotion: true, lowPerformance: true });
  assert.equal(state.reducedMotion, true);
  assert.equal(state.lowPerformance, true);
  assert.equal(state.manualInspectionAvailable, true);
  assert.equal(state.oneActionReturnAvailable, true);
  assert.equal(state.screenSpaceUiAffected, false);
  assert.equal(state.gameplayAuthority, false);
  assert.equal(state.movementAuthority, false);
  assert.equal(state.targetAuthority, false);
  assert.equal(state.legalityAuthority, false);
  assert.equal(state.resultAuthority, false);
  assert.equal(state.gameStateWrite, false);
});
