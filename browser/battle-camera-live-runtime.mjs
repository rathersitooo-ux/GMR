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

const LIVE_SCHEMA = 'gameroad.battle-camera-live-runtime.v1';

function finiteNumber(value, name) {
  if (!Number.isFinite(value)) throw new TypeError(`${name} must be a finite number`);
  return value;
}

function nonNegativeNumber(value, name) {
  const number = finiteNumber(value, name);
  if (number < 0) throw new RangeError(`${name} must be >= 0`);
  return number;
}

function requireEventTarget(value, name) {
  if (!value || typeof value.addEventListener !== 'function' || typeof value.removeEventListener !== 'function') {
    throw new TypeError(`${name} must support addEventListener/removeEventListener`);
  }
  return value;
}

function normalizeGestureCalibration(value) {
  if (!value || typeof value !== 'object') {
    throw new TypeError('gestureCalibration is required; live camera sensitivity is caller-owned');
  }
  return Object.freeze({
    panWorldUnitsPerPixelX: finiteNumber(value.panWorldUnitsPerPixelX, 'gestureCalibration.panWorldUnitsPerPixelX'),
    panWorldUnitsPerPixelY: finiteNumber(value.panWorldUnitsPerPixelY, 'gestureCalibration.panWorldUnitsPerPixelY'),
    wheelZoomRate: nonNegativeNumber(value.wheelZoomRate, 'gestureCalibration.wheelZoomRate'),
    angleDegreesPerWheelDelta: finiteNumber(value.angleDegreesPerWheelDelta, 'gestureCalibration.angleDegreesPerWheelDelta'),
    angleDegreesPerPixel: finiteNumber(value.angleDegreesPerPixel, 'gestureCalibration.angleDegreesPerPixel'),
    dragThresholdPx: nonNegativeNumber(value.dragThresholdPx, 'gestureCalibration.dragThresholdPx'),
  });
}

function distance(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function centroidY(a, b) {
  return (a.y + b.y) / 2;
}

function maybePreventDefault(event) {
  if (typeof event?.preventDefault === 'function') event.preventDefault();
}

function pointerPoint(event) {
  return {
    x: finiteNumber(event?.clientX, 'pointer.clientX'),
    y: finiteNumber(event?.clientY, 'pointer.clientY'),
  };
}

function hasPointerId(event) {
  return Number.isFinite(event?.pointerId);
}

function viewChanged(before, after) {
  return before.center.x !== after.center.x
    || before.center.y !== after.center.y
    || before.zoom !== after.zoom
    || before.angle !== after.angle
    || before.mode !== after.mode;
}

export function mountBattleCameraLiveRuntime({
  worldElement,
  returnControlElement = null,
  controlledCharacterId,
  controlledWorldPoint,
  followZoom,
  followAngle,
  limits,
  reducedMotion = false,
  lowPerformance = false,
  gestureCalibration,
  isScreenUiTarget,
  applyView,
} = {}) {
  const world = requireEventTarget(worldElement, 'worldElement');
  const returnControl = returnControlElement == null
    ? null
    : requireEventTarget(returnControlElement, 'returnControlElement');
  if (typeof isScreenUiTarget !== 'function') {
    throw new TypeError('isScreenUiTarget callback is required');
  }
  if (typeof applyView !== 'function') {
    throw new TypeError('applyView callback is required; world projection is caller-owned');
  }

  const calibration = normalizeGestureCalibration(gestureCalibration);
  let state = createBattleCameraControlState({
    controlledCharacterId,
    controlledWorldPoint,
    followZoom,
    followAngle,
    limits,
    reducedMotion,
    lowPerformance,
  });
  let destroyed = false;
  const pointers = new Map();
  let multiBaseline = null;

  function render(reason, previousState = null) {
    const animate = !(state.reducedMotion || state.lowPerformance);
    applyView(state, Object.freeze({
      schema: LIVE_SCHEMA,
      reason,
      animate,
      previousState,
      presentationOnly: true,
      gameplayAuthority: false,
      movementAuthority: false,
      targetAuthority: false,
      legalityAuthority: false,
      gameStateWrite: false,
    }));
  }

  function acceptRoute(result, reason) {
    if (!result?.ok) return result;
    const previousState = state;
    state = result.state;
    if (viewChanged(previousState, state)) render(reason, previousState);
    return result;
  }

  function routeWorldInput(input, reason) {
    return acceptRoute(routeBattleCameraInput(state, {
      ...input,
      source: BATTLE_CAMERA_INPUT_SOURCES.WORLD,
      uiGestureOwned: false,
    }), reason);
  }

  function currentPair() {
    const firstTwo = Array.from(pointers.values()).slice(0, 2);
    return firstTwo.length === 2 ? firstTwo : null;
  }

  function resetMultiBaseline() {
    const pair = currentPair();
    if (!pair) {
      multiBaseline = null;
      return;
    }
    multiBaseline = {
      distance: Math.max(0.000001, distance(pair[0], pair[1])),
      centroidY: centroidY(pair[0], pair[1]),
    };
  }

  function onPointerDown(event) {
    if (destroyed || !hasPointerId(event) || isScreenUiTarget(event.target, event) === true) return;
    const point = pointerPoint(event);
    pointers.set(event.pointerId, {
      ...point,
      startX: point.x,
      startY: point.y,
      lastX: point.x,
      lastY: point.y,
      dragging: false,
    });
    if (typeof world.setPointerCapture === 'function') {
      try { world.setPointerCapture(event.pointerId); } catch { /* browser may reject stale pointer capture */ }
    }
    if (pointers.size >= 2) resetMultiBaseline();
  }

  function onPointerMove(event) {
    if (destroyed || !hasPointerId(event)) return;
    const tracked = pointers.get(event.pointerId);
    if (!tracked) return;
    const point = pointerPoint(event);
    tracked.x = point.x;
    tracked.y = point.y;

    const pair = currentPair();
    if (pair) {
      const nextDistance = Math.max(0.000001, distance(pair[0], pair[1]));
      const nextCentroidY = centroidY(pair[0], pair[1]);
      if (!multiBaseline) resetMultiBaseline();
      const base = multiBaseline;
      if (base) {
        const pinchRatio = nextDistance / base.distance;
        if (Number.isFinite(pinchRatio) && pinchRatio > 0 && Math.abs(pinchRatio - 1) > 0.0001) {
          routeWorldInput({
            kind: BATTLE_CAMERA_INPUT_KINDS.ZOOM,
            zoom: state.zoom * pinchRatio,
          }, 'TOUCH_PINCH_ZOOM');
        }
        const angleDelta = (nextCentroidY - base.centroidY) * calibration.angleDegreesPerPixel;
        if (angleDelta !== 0) {
          routeWorldInput({
            kind: BATTLE_CAMERA_INPUT_KINDS.ANGLE,
            angle: state.angle + angleDelta,
          }, 'TOUCH_TWO_POINTER_ANGLE');
        }
      }
      multiBaseline = { distance: nextDistance, centroidY: nextCentroidY };
      tracked.lastX = point.x;
      tracked.lastY = point.y;
      maybePreventDefault(event);
      return;
    }

    const totalDistance = Math.hypot(point.x - tracked.startX, point.y - tracked.startY);
    if (!tracked.dragging && totalDistance < calibration.dragThresholdPx) {
      tracked.lastX = point.x;
      tracked.lastY = point.y;
      return;
    }

    let dxPixels;
    let dyPixels;
    if (!tracked.dragging) {
      tracked.dragging = true;
      dxPixels = point.x - tracked.startX;
      dyPixels = point.y - tracked.startY;
    } else {
      dxPixels = point.x - tracked.lastX;
      dyPixels = point.y - tracked.lastY;
    }
    tracked.lastX = point.x;
    tracked.lastY = point.y;

    if (dxPixels !== 0 || dyPixels !== 0) {
      routeWorldInput({
        kind: BATTLE_CAMERA_INPUT_KINDS.PAN,
        dx: dxPixels * calibration.panWorldUnitsPerPixelX,
        dy: dyPixels * calibration.panWorldUnitsPerPixelY,
      }, 'WORLD_POINTER_PAN');
      maybePreventDefault(event);
    }
  }

  function finishPointer(event) {
    if (!hasPointerId(event)) return;
    pointers.delete(event.pointerId);
    if (typeof world.releasePointerCapture === 'function') {
      try { world.releasePointerCapture(event.pointerId); } catch { /* pointer may already be released */ }
    }
    resetMultiBaseline();
  }

  function onWheel(event) {
    if (destroyed || isScreenUiTarget(event.target, event) === true) return;
    const deltaY = finiteNumber(event?.deltaY, 'wheel.deltaY');
    if (event?.shiftKey === true) {
      routeWorldInput({
        kind: BATTLE_CAMERA_INPUT_KINDS.ANGLE,
        angle: state.angle + deltaY * calibration.angleDegreesPerWheelDelta,
      }, 'DESKTOP_WHEEL_ANGLE');
    } else {
      routeWorldInput({
        kind: BATTLE_CAMERA_INPUT_KINDS.ZOOM,
        zoom: state.zoom * Math.exp(-deltaY * calibration.wheelZoomRate),
      }, 'DESKTOP_WHEEL_ZOOM');
    }
    maybePreventDefault(event);
  }

  function returnToControlled(event = null) {
    if (destroyed) return null;
    const result = acceptRoute(routeBattleCameraInput(state, {
      kind: BATTLE_CAMERA_INPUT_KINDS.RETURN_TO_CONTROLLED,
      source: BATTLE_CAMERA_INPUT_SOURCES.CAMERA_CONTROL,
      uiGestureOwned: false,
    }), 'RETURN_TO_CONTROLLED');
    if (result?.ok && result.applied) maybePreventDefault(event);
    return result;
  }

  function syncControlledPoint(nextControlledWorldPoint) {
    if (destroyed) return null;
    const previousState = state;
    const result = applyBattleCameraCommand(state, {
      type: BATTLE_CAMERA_COMMANDS.SYNC_CONTROLLED_POINT,
      controlledCharacterId: state.controlledCharacterId,
      controlledWorldPoint: nextControlledWorldPoint,
    });
    if (!result.ok) return result;
    state = result.state;
    if (viewChanged(previousState, state)) render('CONTROLLED_POINT_SYNC', previousState);
    return result;
  }

  function onReturnClick(event) {
    returnToControlled(event);
  }

  world.addEventListener('pointerdown', onPointerDown);
  world.addEventListener('pointermove', onPointerMove);
  world.addEventListener('pointerup', finishPointer);
  world.addEventListener('pointercancel', finishPointer);
  world.addEventListener('wheel', onWheel, { passive: false });
  if (returnControl) returnControl.addEventListener('click', onReturnClick);

  render('INITIAL_FOLLOW');

  return Object.freeze({
    schema: LIVE_SCHEMA,
    getState() {
      return state;
    },
    syncControlledPoint,
    returnToControlled,
    destroy() {
      if (destroyed) return false;
      destroyed = true;
      pointers.clear();
      multiBaseline = null;
      world.removeEventListener('pointerdown', onPointerDown);
      world.removeEventListener('pointermove', onPointerMove);
      world.removeEventListener('pointerup', finishPointer);
      world.removeEventListener('pointercancel', finishPointer);
      world.removeEventListener('wheel', onWheel, { passive: false });
      if (returnControl) returnControl.removeEventListener('click', onReturnClick);
      return true;
    },
  });
}

export const BATTLE_CAMERA_LIVE_RUNTIME_CONTRACT = Object.freeze({
  schema: LIVE_SCHEMA,
  composesExistingCameraControlCore: true,
  composesExistingInputRouter: true,
  domListenerOwnership: true,
  pointerCaptureOwnership: true,
  gestureCalibrationOwnedByCaller: true,
  worldProjectionOwnedByCaller: true,
  onePointerWorldPan: true,
  twoPointerPinchZoom: true,
  twoPointerAngleChange: true,
  desktopWheelZoom: true,
  desktopShiftWheelAngle: true,
  oneActionReturn: true,
  controlledPointSyncWithoutManualViewSteal: true,
  screenSpaceUiAffected: false,
  worldObjectRelayout: false,
  gameplayAuthority: false,
  movementAuthority: false,
  targetAuthority: false,
  legalityAuthority: false,
  resultAuthority: false,
  gameStateWrite: false,
  htmlMountIncluded: false,
});
