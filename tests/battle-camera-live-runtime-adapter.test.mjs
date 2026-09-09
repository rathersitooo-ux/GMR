import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BATTLE_CAMERA_MODES,
} from '../browser/battle-camera-control-core.mjs';
import {
  BATTLE_CAMERA_INPUT_KINDS,
  BATTLE_CAMERA_INPUT_SOURCES,
} from '../browser/battle-camera-input-router.mjs';
import {
  BATTLE_CAMERA_LIVE_RUNTIME_ADAPTER_CONTRACT,
  createBattleCameraLiveRuntimeAdapter,
} from '../browser/battle-camera-live-runtime-adapter.mjs';

function limits() {
  return {
    x: { min: -12, max: 12 },
    y: { min: -12, max: 12 },
    zoom: { min: 8, max: 28 },
    angle: { min: -1, max: 1 },
  };
}

function mount(overrides = {}) {
  const publications = [];
  const adapter = createBattleCameraLiveRuntimeAdapter({
    controlledCharacterId: 'P1',
    controlledWorldPoint: { x: 2, y: 3 },
    followZoom: 18,
    followAngle: 0,
    limits: limits(),
    applyCameraState(state, meta) {
      publications.push({ state, meta });
    },
    ...overrides,
  });
  return { adapter, publications };
}

test('requires caller-owned camera publisher and numeric limits', () => {
  assert.throws(() => createBattleCameraLiveRuntimeAdapter({}), /applyCameraState/);
  assert.throws(() => createBattleCameraLiveRuntimeAdapter({
    controlledCharacterId: 'P1',
    controlledWorldPoint: { x: 0, y: 0 },
    followZoom: 18,
    followAngle: 0,
    applyCameraState() {},
  }), /limits/);
});

test('publishes initial caller-requested follow view without writing game state', () => {
  const { adapter, publications } = mount();
  const result = adapter.publishCurrent();

  assert.equal(result.ok, true);
  assert.equal(result.published, true);
  assert.equal(publications.length, 1);
  assert.equal(publications[0].state.mode, BATTLE_CAMERA_MODES.FOLLOW_CONTROLLED);
  assert.deepEqual(publications[0].state.center, { x: 2, y: 3 });
  assert.equal(publications[0].meta.visualOnly, true);
  assert.equal(publications[0].meta.screenSpaceUiAffected, false);
  assert.equal(publications[0].meta.gameStateWrite, false);
});

test('WORLD pan enters manual inspect and publishes the resulting camera state', () => {
  const { adapter, publications } = mount();
  const result = adapter.handleInput({
    kind: BATTLE_CAMERA_INPUT_KINDS.PAN,
    source: BATTLE_CAMERA_INPUT_SOURCES.WORLD,
    dx: 4,
    dy: -2,
  });

  assert.equal(result.ok, true);
  assert.equal(result.published, true);
  assert.equal(result.state.mode, BATTLE_CAMERA_MODES.MANUAL_INSPECT);
  assert.deepEqual(result.state.center, { x: 6, y: 1 });
  assert.deepEqual(result.commandsApplied, ['BEGIN_MANUAL_INSPECT', 'PAN']);
  assert.equal(publications.length, 1);
});

test('SCREEN_UI and ui-owned gestures cannot move or publish the camera', () => {
  const { adapter, publications } = mount();
  const before = adapter.getState();

  const screen = adapter.handleInput({
    kind: BATTLE_CAMERA_INPUT_KINDS.PAN,
    source: BATTLE_CAMERA_INPUT_SOURCES.SCREEN_UI,
    dx: 8,
    dy: 8,
  });
  const owned = adapter.handleInput({
    kind: BATTLE_CAMERA_INPUT_KINDS.PAN,
    source: BATTLE_CAMERA_INPUT_SOURCES.WORLD,
    uiGestureOwned: true,
    dx: 8,
    dy: 8,
  });

  assert.equal(screen.ok, true);
  assert.equal(screen.applied, false);
  assert.equal(screen.published, false);
  assert.equal(owned.ok, true);
  assert.equal(owned.applied, false);
  assert.equal(owned.published, false);
  assert.equal(adapter.getState(), before);
  assert.equal(publications.length, 0);
});

test('caller-normalized touch and desktop WORLD inputs are modality-neutral', () => {
  const touch = mount();
  const desktop = mount();

  const normalizedPan = {
    kind: BATTLE_CAMERA_INPUT_KINDS.PAN,
    source: BATTLE_CAMERA_INPUT_SOURCES.WORLD,
    dx: -3,
    dy: 5,
  };

  const touchResult = touch.adapter.handleInput({ ...normalizedPan, inputDevice: 'touch' });
  const desktopResult = desktop.adapter.handleInput({ ...normalizedPan, inputDevice: 'desktop' });

  assert.deepEqual(touchResult.state.center, desktopResult.state.center);
  assert.equal(touchResult.state.mode, BATTLE_CAMERA_MODES.MANUAL_INSPECT);
  assert.equal(desktopResult.state.mode, BATTLE_CAMERA_MODES.MANUAL_INSPECT);
  assert.equal(touch.publications.length, 1);
  assert.equal(desktop.publications.length, 1);
});

test('manual zoom and angle use caller-owned clamp ranges', () => {
  const { adapter } = mount();

  adapter.handleInput({
    kind: BATTLE_CAMERA_INPUT_KINDS.ZOOM,
    source: BATTLE_CAMERA_INPUT_SOURCES.WORLD,
    zoom: 999,
  });
  const angle = adapter.handleInput({
    kind: BATTLE_CAMERA_INPUT_KINDS.ANGLE,
    source: BATTLE_CAMERA_INPUT_SOURCES.WORLD,
    angle: -999,
  });

  assert.equal(angle.state.zoom, 28);
  assert.equal(angle.state.angle, -1);
});

test('controlled point follows in FOLLOW mode but does not steal a manual inspected view', () => {
  const { adapter, publications } = mount();

  const followSync = adapter.syncControlledPoint({
    controlledCharacterId: 'P1',
    controlledWorldPoint: { x: 7, y: -4 },
  });
  assert.equal(followSync.published, true);
  assert.deepEqual(followSync.state.center, { x: 7, y: -4 });

  adapter.handleInput({
    kind: BATTLE_CAMERA_INPUT_KINDS.PAN,
    source: BATTLE_CAMERA_INPUT_SOURCES.WORLD,
    dx: 2,
    dy: 2,
  });
  const manualCenter = adapter.getState().center;
  const countBeforeManualSync = publications.length;

  const manualSync = adapter.syncControlledPoint({
    controlledCharacterId: 'P1',
    controlledWorldPoint: { x: -5, y: 6 },
  });

  assert.equal(manualSync.ok, true);
  assert.equal(manualSync.published, false);
  assert.deepEqual(manualSync.state.center, manualCenter);
  assert.deepEqual(manualSync.state.controlledWorldPoint, { x: -5, y: 6 });
  assert.equal(publications.length, countBeforeManualSync);
});

test('controlled-character identity mismatch fails closed without publication', () => {
  const { adapter, publications } = mount();
  const result = adapter.syncControlledPoint({
    controlledCharacterId: 'P2',
    controlledWorldPoint: { x: 9, y: 9 },
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'CONTROLLED_CHARACTER_ID_MISMATCH');
  assert.equal(result.published, false);
  assert.equal(publications.length, 0);
  assert.deepEqual(adapter.getState().controlledWorldPoint, { x: 2, y: 3 });
});

test('one-action return restores latest controlled point and follow defaults', () => {
  const { adapter, publications } = mount();

  adapter.handleInput({
    kind: BATTLE_CAMERA_INPUT_KINDS.PAN,
    source: BATTLE_CAMERA_INPUT_SOURCES.WORLD,
    dx: 6,
    dy: 6,
  });
  adapter.handleInput({
    kind: BATTLE_CAMERA_INPUT_KINDS.ZOOM,
    source: BATTLE_CAMERA_INPUT_SOURCES.WORLD,
    zoom: 25,
  });
  adapter.syncControlledPoint({
    controlledCharacterId: 'P1',
    controlledWorldPoint: { x: -2, y: -3 },
  });

  const result = adapter.returnToControlled();

  assert.equal(result.ok, true);
  assert.equal(result.published, true);
  assert.equal(result.state.mode, BATTLE_CAMERA_MODES.FOLLOW_CONTROLLED);
  assert.deepEqual(result.state.center, { x: -2, y: -3 });
  assert.equal(result.state.zoom, 18);
  assert.equal(result.state.angle, 0);
  assert.equal(publications.at(-1).meta.reason, 'CAMERA_INPUT_ROUTED');
});

test('ReducedMotion and LowPerf preserve manual-inspect semantics', () => {
  for (const flags of [
    { reducedMotion: true, lowPerformance: false },
    { reducedMotion: false, lowPerformance: true },
    { reducedMotion: true, lowPerformance: true },
  ]) {
    const { adapter } = mount(flags);
    const result = adapter.handleInput({
      kind: BATTLE_CAMERA_INPUT_KINDS.PAN,
      source: BATTLE_CAMERA_INPUT_SOURCES.WORLD,
      dx: 1,
      dy: 1,
    });
    assert.equal(result.ok, true);
    assert.equal(result.state.mode, BATTLE_CAMERA_MODES.MANUAL_INSPECT);
    assert.deepEqual(result.state.center, { x: 3, y: 4 });
  }
});

test('contract makes component-only and zero-authority boundaries explicit', () => {
  assert.equal(BATTLE_CAMERA_LIVE_RUNTIME_ADAPTER_CONTRACT.composesControlCore, true);
  assert.equal(BATTLE_CAMERA_LIVE_RUNTIME_ADAPTER_CONTRACT.composesInputRouter, true);
  assert.equal(BATTLE_CAMERA_LIVE_RUNTIME_ADAPTER_CONTRACT.domListenerOwnership, false);
  assert.equal(BATTLE_CAMERA_LIVE_RUNTIME_ADAPTER_CONTRACT.gestureSensitivityOwnership, false);
  assert.equal(BATTLE_CAMERA_LIVE_RUNTIME_ADAPTER_CONTRACT.numericLimitsOwnership, false);
  assert.equal(BATTLE_CAMERA_LIVE_RUNTIME_ADAPTER_CONTRACT.screenSpaceUiAffected, false);
  assert.equal(BATTLE_CAMERA_LIVE_RUNTIME_ADAPTER_CONTRACT.gameplayAuthority, false);
  assert.equal(BATTLE_CAMERA_LIVE_RUNTIME_ADAPTER_CONTRACT.movementAuthority, false);
  assert.equal(BATTLE_CAMERA_LIVE_RUNTIME_ADAPTER_CONTRACT.targetAuthority, false);
  assert.equal(BATTLE_CAMERA_LIVE_RUNTIME_ADAPTER_CONTRACT.legalityAuthority, false);
  assert.equal(BATTLE_CAMERA_LIVE_RUNTIME_ADAPTER_CONTRACT.resultAuthority, false);
  assert.equal(BATTLE_CAMERA_LIVE_RUNTIME_ADAPTER_CONTRACT.gameStateWrite, false);
  assert.equal(BATTLE_CAMERA_LIVE_RUNTIME_ADAPTER_CONTRACT.domMountIncluded, false);
  assert.equal(BATTLE_CAMERA_LIVE_RUNTIME_ADAPTER_CONTRACT.publicPackageIncluded, false);
  assert.equal(BATTLE_CAMERA_LIVE_RUNTIME_ADAPTER_CONTRACT.playerVisibleMountIncluded, false);
});
