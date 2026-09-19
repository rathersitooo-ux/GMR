import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BATTLE_CAMERA_LIVE_RUNTIME_CONTRACT,
  installDedicatedBattlePhaseWorldGuard,
  mountBattleCameraLiveRuntime,
} from '../browser/battle-camera-live-runtime.mjs';
import { BATTLE_CAMERA_MODES } from '../browser/battle-camera-control-core.mjs';

class FakeEventTarget {
  constructor() {
    this.listeners = new Map();
    this.captured = new Set();
  }

  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(listener);
  }

  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }

  setPointerCapture(pointerId) {
    this.captured.add(pointerId);
  }

  releasePointerCapture(pointerId) {
    this.captured.delete(pointerId);
  }

  emit(type, input = {}) {
    const event = {
      type,
      target: input.target ?? this,
      pointerId: input.pointerId,
      clientX: input.clientX,
      clientY: input.clientY,
      deltaY: input.deltaY,
      shiftKey: input.shiftKey === true,
      defaultPrevented: false,
      preventDefault() {
        this.defaultPrevented = true;
      },
      ...input,
    };
    for (const listener of this.listeners.get(type) ?? []) listener(event);
    return event;
  }
}

const LIMITS = Object.freeze({
  x: { min: -100, max: 100 },
  y: { min: -80, max: 80 },
  zoom: { min: 0.5, max: 2 },
  angle: { min: -30, max: 55 },
});

const CALIBRATION = Object.freeze({
  panWorldUnitsPerPixelX: 1,
  panWorldUnitsPerPixelY: 1,
  wheelZoomRate: 0.01,
  angleDegreesPerWheelDelta: 0.1,
  angleDegreesPerPixel: 0.5,
  dragThresholdPx: 2,
});

function mount(overrides = {}) {
  const worldElement = overrides.worldElement ?? new FakeEventTarget();
  const returnControlElement = overrides.returnControlElement ?? new FakeEventTarget();
  const views = [];
  const runtime = mountBattleCameraLiveRuntime({
    worldElement,
    returnControlElement,
    controlledCharacterId: 'P1:CHAR-A',
    controlledWorldPoint: { x: 10, y: 12 },
    followZoom: 1,
    followAngle: 20,
    limits: LIMITS,
    gestureCalibration: CALIBRATION,
    reducedMotion: false,
    lowPerformance: false,
    isScreenUiTarget: (target) => target?.screenUi === true,
    applyView: (state, meta) => views.push({ state, meta }),
    ...overrides,
  });
  return { runtime, worldElement, returnControlElement, views };
}

test('mount begins in controlled-character follow and leaves projection to the caller', () => {
  const { runtime, views } = mount();
  assert.equal(runtime.getState().mode, BATTLE_CAMERA_MODES.FOLLOW_CONTROLLED);
  assert.deepEqual(runtime.getState().center, { x: 10, y: 12 });
  assert.equal(views.length, 1);
  assert.equal(views[0].meta.reason, 'INITIAL_FOLLOW');
  assert.equal(views[0].meta.presentationOnly, true);
  assert.equal(views[0].meta.gameStateWrite, false);
});

test('one-pointer drag on world enters manual inspect and pans only after threshold', () => {
  const { runtime, worldElement, views } = mount();
  worldElement.emit('pointerdown', { pointerId: 1, clientX: 0, clientY: 0 });
  worldElement.emit('pointermove', { pointerId: 1, clientX: 1, clientY: 0 });
  assert.equal(runtime.getState().mode, BATTLE_CAMERA_MODES.FOLLOW_CONTROLLED);

  const drag = worldElement.emit('pointermove', { pointerId: 1, clientX: 4, clientY: 3 });
  assert.equal(runtime.getState().mode, BATTLE_CAMERA_MODES.MANUAL_INSPECT);
  assert.deepEqual(runtime.getState().center, { x: 14, y: 15 });
  assert.equal(drag.defaultPrevented, true);
  assert.equal(views.at(-1).meta.reason, 'WORLD_POINTER_PAN');
});

test('screen-space UI-owned pointer never enters the camera gesture set', () => {
  const { runtime, worldElement, views } = mount();
  const ui = { screenUi: true };
  worldElement.emit('pointerdown', { pointerId: 2, clientX: 0, clientY: 0, target: ui });
  worldElement.emit('pointermove', { pointerId: 2, clientX: 50, clientY: 50, target: ui });
  assert.equal(runtime.getState().mode, BATTLE_CAMERA_MODES.FOLLOW_CONTROLLED);
  assert.deepEqual(runtime.getState().center, { x: 10, y: 12 });
  assert.equal(views.length, 1);
});

test('desktop wheel zooms and shift-wheel changes angle through the existing router', () => {
  const { runtime, worldElement } = mount();
  const zoomEvent = worldElement.emit('wheel', { deltaY: -10 });
  assert.equal(runtime.getState().mode, BATTLE_CAMERA_MODES.MANUAL_INSPECT);
  assert.ok(runtime.getState().zoom > 1);
  assert.equal(zoomEvent.defaultPrevented, true);

  const previousAngle = runtime.getState().angle;
  const angleEvent = worldElement.emit('wheel', { deltaY: 10, shiftKey: true });
  assert.equal(runtime.getState().angle, previousAngle + 1);
  assert.equal(angleEvent.defaultPrevented, true);
});

test('two-pointer gesture pinches zoom and changes angle without inventing another camera engine', () => {
  const { runtime, worldElement } = mount();
  worldElement.emit('pointerdown', { pointerId: 1, clientX: 0, clientY: 0 });
  worldElement.emit('pointerdown', { pointerId: 2, clientX: 10, clientY: 0 });
  worldElement.emit('pointermove', { pointerId: 2, clientX: 20, clientY: 0 });
  assert.equal(runtime.getState().mode, BATTLE_CAMERA_MODES.MANUAL_INSPECT);
  assert.equal(runtime.getState().zoom, 2);

  const previousAngle = runtime.getState().angle;
  worldElement.emit('pointermove', { pointerId: 1, clientX: 0, clientY: 4 });
  assert.ok(runtime.getState().angle > previousAngle);
});

test('manual inspect follows neither controlled-point movement nor screen state until explicit return', () => {
  const { runtime, worldElement, returnControlElement } = mount();
  worldElement.emit('pointerdown', { pointerId: 1, clientX: 0, clientY: 0 });
  worldElement.emit('pointermove', { pointerId: 1, clientX: 12, clientY: 5 });
  const manualCenter = runtime.getState().center;

  runtime.syncControlledPoint({ x: 50, y: 40 });
  assert.equal(runtime.getState().mode, BATTLE_CAMERA_MODES.MANUAL_INSPECT);
  assert.deepEqual(runtime.getState().center, manualCenter);
  assert.deepEqual(runtime.getState().controlledWorldPoint, { x: 50, y: 40 });

  const click = returnControlElement.emit('click');
  assert.equal(runtime.getState().mode, BATTLE_CAMERA_MODES.FOLLOW_CONTROLLED);
  assert.deepEqual(runtime.getState().center, { x: 50, y: 40 });
  assert.equal(runtime.getState().zoom, 1);
  assert.equal(runtime.getState().angle, 20);
  assert.equal(click.defaultPrevented, true);
});

test('follow mode syncs controlled point and reduced-motion changes animation metadata, not manual capability', () => {
  const views = [];
  const { runtime, worldElement } = mount({
    reducedMotion: true,
    applyView: (state, meta) => views.push({ state, meta }),
  });
  runtime.syncControlledPoint({ x: 20, y: 22 });
  assert.deepEqual(runtime.getState().center, { x: 20, y: 22 });
  assert.equal(views.at(-1).meta.animate, false);

  worldElement.emit('wheel', { deltaY: -5 });
  assert.equal(runtime.getState().manualInspectionAvailable, true);
  assert.equal(runtime.getState().mode, BATTLE_CAMERA_MODES.MANUAL_INSPECT);
});

test('destroy removes listeners and pointer capture without touching gameplay state', () => {
  const { runtime, worldElement, returnControlElement } = mount();
  worldElement.emit('pointerdown', { pointerId: 7, clientX: 0, clientY: 0 });
  assert.equal(worldElement.captured.has(7), true);
  assert.equal(runtime.destroy(), true);
  assert.equal(runtime.destroy(), false);
  assert.equal(worldElement.listeners.get('pointermove')?.size ?? 0, 0);
  assert.equal(returnControlElement.listeners.get('click')?.size ?? 0, 0);
});

test('live runtime contract keeps game authority zero and requires caller-owned calibration/projection', () => {
  assert.equal(BATTLE_CAMERA_LIVE_RUNTIME_CONTRACT.composesExistingCameraControlCore, true);
  assert.equal(BATTLE_CAMERA_LIVE_RUNTIME_CONTRACT.composesExistingInputRouter, true);
  assert.equal(BATTLE_CAMERA_LIVE_RUNTIME_CONTRACT.gestureCalibrationOwnedByCaller, true);
  assert.equal(BATTLE_CAMERA_LIVE_RUNTIME_CONTRACT.worldProjectionOwnedByCaller, true);
  assert.equal(BATTLE_CAMERA_LIVE_RUNTIME_CONTRACT.screenSpaceUiAffected, false);
  assert.equal(BATTLE_CAMERA_LIVE_RUNTIME_CONTRACT.worldObjectRelayout, false);
  assert.equal(BATTLE_CAMERA_LIVE_RUNTIME_CONTRACT.gameplayAuthority, false);
  assert.equal(BATTLE_CAMERA_LIVE_RUNTIME_CONTRACT.movementAuthority, false);
  assert.equal(BATTLE_CAMERA_LIVE_RUNTIME_CONTRACT.targetAuthority, false);
  assert.equal(BATTLE_CAMERA_LIVE_RUNTIME_CONTRACT.legalityAuthority, false);
  assert.equal(BATTLE_CAMERA_LIVE_RUNTIME_CONTRACT.gameStateWrite, false);
  assert.equal(BATTLE_CAMERA_LIVE_RUNTIME_CONTRACT.htmlMountIncluded, false);
});

test('mount fails closed when caller tries to omit numeric gesture calibration or view projection', () => {
  const worldElement = new FakeEventTarget();
  assert.throws(() => mountBattleCameraLiveRuntime({
    worldElement,
    controlledCharacterId: 'P1:CHAR-A',
    controlledWorldPoint: { x: 0, y: 0 },
    followZoom: 1,
    followAngle: 20,
    limits: LIMITS,
    isScreenUiTarget: () => false,
    applyView: () => {},
  }), /gestureCalibration is required/);

  assert.throws(() => mountBattleCameraLiveRuntime({
    worldElement,
    controlledCharacterId: 'P1:CHAR-A',
    controlledWorldPoint: { x: 0, y: 0 },
    followZoom: 1,
    followAngle: 20,
    limits: LIMITS,
    gestureCalibration: CALIBRATION,
    isScreenUiTarget: () => false,
  }), /applyView callback is required/);
});


test('dedicated Battle Phase hides the board and drawer, then restores their previous presentation', () => {
  class FakeStyle {
    constructor() { this.values = new Map(); this.priorities = new Map(); }
    getPropertyValue(name) { return this.values.get(name) ?? ''; }
    getPropertyPriority(name) { return this.priorities.get(name) ?? ''; }
    setProperty(name, value, priority = '') { this.values.set(name, value); this.priorities.set(name, priority); }
    removeProperty(name) { this.values.delete(name); this.priorities.delete(name); }
  }
  class FakeNode {
    constructor() {
      this.style = new FakeStyle();
      this.attributes = new Map();
      this.classes = new Set();
      this.inert = false;
      this.focusChild = null;
      this.classList = { contains: (name) => this.classes.has(name) };
    }
    setAttribute(name, value) { this.attributes.set(name, String(value)); }
    getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
    removeAttribute(name) { this.attributes.delete(name); }
    hasAttribute(name) { return this.attributes.has(name); }
    contains(node) { return node === this.focusChild; }
  }

  const root = new FakeNode();
  const world = new FakeNode();
  const drawer = new FakeNode();
  world.style.setProperty('visibility', 'visible');
  world.style.setProperty('pointer-events', 'auto');
  drawer.style.setProperty('visibility', 'visible');
  drawer.style.setProperty('pointer-events', 'auto');

  let blurCount = 0;
  const focus = { blur() { blurCount += 1; } };
  world.focusChild = focus;
  const document = {
    activeElement: focus,
    querySelector(selector) { return selector === 'section[data-screen="battle"]' ? root : null; },
    getElementById(id) { return id === 'battleMap' ? world : id === 'battleDrawer' ? drawer : null; },
  };

  const guard = installDedicatedBattlePhaseWorldGuard({ document });
  assert.ok(guard);
  assert.equal(guard.isActive(), false);
  assert.equal(world.style.getPropertyValue('visibility'), 'visible');

  root.classes.add('dedicatedBattlePhase');
  assert.equal(guard.sync(), true);
  assert.equal(world.style.getPropertyValue('visibility'), 'hidden');
  assert.equal(world.style.getPropertyPriority('visibility'), 'important');
  assert.equal(world.style.getPropertyValue('pointer-events'), 'none');
  assert.equal(world.getAttribute('aria-hidden'), 'true');
  assert.equal(world.inert, true);
  assert.equal(drawer.style.getPropertyValue('visibility'), 'hidden');
  assert.equal(drawer.style.getPropertyValue('pointer-events'), 'none');
  assert.equal(drawer.inert, true);
  assert.equal(blurCount, 1);

  root.classes.delete('dedicatedBattlePhase');
  assert.equal(guard.sync(), false);
  assert.equal(world.style.getPropertyValue('visibility'), 'visible');
  assert.equal(world.style.getPropertyValue('pointer-events'), 'auto');
  assert.equal(world.getAttribute('aria-hidden'), null);
  assert.equal(world.inert, false);
  assert.equal(drawer.style.getPropertyValue('visibility'), 'visible');
  assert.equal(drawer.style.getPropertyValue('pointer-events'), 'auto');
  assert.equal(drawer.inert, false);
});

test('live runtime contract declares the dedicated Battle Phase world guard without gameplay authority', () => {
  assert.equal(BATTLE_CAMERA_LIVE_RUNTIME_CONTRACT.dedicatedBattlePhaseWorldGuard, true);
  assert.equal(BATTLE_CAMERA_LIVE_RUNTIME_CONTRACT.dedicatedBattlePhaseBoardHidden, true);
  assert.equal(BATTLE_CAMERA_LIVE_RUNTIME_CONTRACT.dedicatedBattlePhaseBoardInteractionDisabled, true);
  assert.equal(BATTLE_CAMERA_LIVE_RUNTIME_CONTRACT.dedicatedBattlePhaseDrawerHidden, true);
  assert.equal(BATTLE_CAMERA_LIVE_RUNTIME_CONTRACT.gameplayAuthority, false);
  assert.equal(BATTLE_CAMERA_LIVE_RUNTIME_CONTRACT.gameStateWrite, false);
});
