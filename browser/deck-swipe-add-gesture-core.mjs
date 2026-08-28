export const DECK_SWIPE_ADD_OUTCOMES = Object.freeze({
  ADD: 'SWIPE_RIGHT_ADD',
  TAP: 'TAP',
  CANCEL: 'CANCEL'
});

export const DEFAULT_DECK_SWIPE_ADD_CONFIG = Object.freeze({
  minSwipeDistancePx: 44,
  axisDominanceRatio: 1.2,
  tapSlopPx: 10
});

function finiteNumber(value, name) {
  if (!Number.isFinite(value)) throw new TypeError(`${name}_INVALID`);
  return value;
}

function positiveNumber(value, name) {
  finiteNumber(value, name);
  if (value <= 0) throw new RangeError(`${name}_INVALID`);
  return value;
}

function normalizeConfig(config = {}) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new TypeError('CONFIG_INVALID');
  }

  const normalized = {
    minSwipeDistancePx: config.minSwipeDistancePx ?? DEFAULT_DECK_SWIPE_ADD_CONFIG.minSwipeDistancePx,
    axisDominanceRatio: config.axisDominanceRatio ?? DEFAULT_DECK_SWIPE_ADD_CONFIG.axisDominanceRatio,
    tapSlopPx: config.tapSlopPx ?? DEFAULT_DECK_SWIPE_ADD_CONFIG.tapSlopPx
  };

  positiveNumber(normalized.minSwipeDistancePx, 'MIN_SWIPE_DISTANCE_PX');
  positiveNumber(normalized.axisDominanceRatio, 'AXIS_DOMINANCE_RATIO');
  finiteNumber(normalized.tapSlopPx, 'TAP_SLOP_PX');
  if (normalized.tapSlopPx < 0) throw new RangeError('TAP_SLOP_PX_INVALID');
  if (normalized.tapSlopPx >= normalized.minSwipeDistancePx) {
    throw new RangeError('TAP_SLOP_MUST_BE_BELOW_SWIPE_DISTANCE');
  }

  return Object.freeze(normalized);
}

function normalizePoint(point) {
  if (!point || typeof point !== 'object' || Array.isArray(point)) {
    throw new TypeError('POINT_INVALID');
  }
  if (point.pointerId === undefined || point.pointerId === null) {
    throw new TypeError('POINTER_ID_REQUIRED');
  }
  return Object.freeze({
    pointerId: point.pointerId,
    x: finiteNumber(point.x, 'X'),
    y: finiteNumber(point.y, 'Y')
  });
}

function freezeResult(result) {
  return Object.freeze(result);
}

function delta(start, end) {
  return Object.freeze({
    dx: end.x - start.x,
    dy: end.y - start.y
  });
}

export function classifyDeckSwipeAddGesture({ start, end }, config = {}) {
  const normalizedConfig = normalizeConfig(config);
  const normalizedStart = normalizePoint(start);
  const normalizedEnd = normalizePoint(end);

  if (normalizedStart.pointerId !== normalizedEnd.pointerId) {
    return freezeResult({
      outcome: DECK_SWIPE_ADD_OUTCOMES.CANCEL,
      reason: 'POINTER_MISMATCH',
      dx: 0,
      dy: 0
    });
  }

  const { dx, dy } = delta(normalizedStart, normalizedEnd);
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);
  const maxTravel = Math.max(absDx, absDy);

  if (maxTravel <= normalizedConfig.tapSlopPx) {
    return freezeResult({
      outcome: DECK_SWIPE_ADD_OUTCOMES.TAP,
      reason: 'TAP_SLOP',
      dx,
      dy
    });
  }

  if (dx <= 0) {
    return freezeResult({
      outcome: DECK_SWIPE_ADD_OUTCOMES.CANCEL,
      reason: 'DIRECTION_REJECTED',
      dx,
      dy
    });
  }

  if (dx < normalizedConfig.minSwipeDistancePx) {
    return freezeResult({
      outcome: DECK_SWIPE_ADD_OUTCOMES.CANCEL,
      reason: 'DISTANCE_NOT_MET',
      dx,
      dy
    });
  }

  if (absDx < absDy * normalizedConfig.axisDominanceRatio) {
    return freezeResult({
      outcome: DECK_SWIPE_ADD_OUTCOMES.CANCEL,
      reason: 'AXIS_REJECTED',
      dx,
      dy
    });
  }

  return freezeResult({
    outcome: DECK_SWIPE_ADD_OUTCOMES.ADD,
    reason: 'RIGHT_SWIPE_ACCEPTED',
    dx,
    dy
  });
}

export function createDeckSwipeAddGestureTracker(config = {}) {
  const normalizedConfig = normalizeConfig(config);
  let active = null;

  function begin(point) {
    const normalized = normalizePoint(point);
    if (active) {
      return freezeResult({
        accepted: false,
        reason: 'GESTURE_ALREADY_ACTIVE',
        pointerId: normalized.pointerId
      });
    }

    active = normalized;
    return freezeResult({
      accepted: true,
      reason: 'TRACKING_STARTED',
      pointerId: normalized.pointerId,
      dx: 0,
      dy: 0,
      progress: 0
    });
  }

  function move(point) {
    const normalized = normalizePoint(point);
    if (!active) {
      return freezeResult({ accepted: false, reason: 'NO_ACTIVE_GESTURE' });
    }
    if (normalized.pointerId !== active.pointerId) {
      return freezeResult({ accepted: false, reason: 'POINTER_MISMATCH' });
    }

    const { dx, dy } = delta(active, normalized);
    return freezeResult({
      accepted: true,
      reason: 'TRACKING',
      pointerId: active.pointerId,
      dx,
      dy,
      progress: Math.min(1, Math.max(0, dx) / normalizedConfig.minSwipeDistancePx)
    });
  }

  function finish(point) {
    const normalized = normalizePoint(point);
    if (!active) {
      return freezeResult({
        outcome: DECK_SWIPE_ADD_OUTCOMES.CANCEL,
        reason: 'NO_ACTIVE_GESTURE',
        dx: 0,
        dy: 0
      });
    }
    if (normalized.pointerId !== active.pointerId) {
      return freezeResult({
        outcome: DECK_SWIPE_ADD_OUTCOMES.CANCEL,
        reason: 'POINTER_MISMATCH',
        dx: 0,
        dy: 0
      });
    }

    const start = active;
    active = null;
    return classifyDeckSwipeAddGesture({ start, end: normalized }, normalizedConfig);
  }

  function cancel(pointerId = active?.pointerId) {
    if (!active) {
      return freezeResult({
        outcome: DECK_SWIPE_ADD_OUTCOMES.CANCEL,
        reason: 'NO_ACTIVE_GESTURE',
        dx: 0,
        dy: 0
      });
    }
    if (pointerId !== active.pointerId) {
      return freezeResult({
        outcome: DECK_SWIPE_ADD_OUTCOMES.CANCEL,
        reason: 'POINTER_MISMATCH',
        dx: 0,
        dy: 0
      });
    }

    active = null;
    return freezeResult({
      outcome: DECK_SWIPE_ADD_OUTCOMES.CANCEL,
      reason: 'POINTER_CANCELLED',
      dx: 0,
      dy: 0
    });
  }

  function getState() {
    return active
      ? freezeResult({ active: true, pointerId: active.pointerId, x: active.x, y: active.y })
      : freezeResult({ active: false });
  }

  return Object.freeze({ begin, move, finish, cancel, getState, config: normalizedConfig });
}
