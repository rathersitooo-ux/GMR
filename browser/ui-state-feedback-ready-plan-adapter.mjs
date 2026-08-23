import {
  createUIFeedbackState,
  applyUIFeedbackEvent,
  consumeUIIntent,
  projectUIFeedback,
} from './ui-state-feedback-core.mjs';

export const READY_PLAN_FEEDBACK_ADAPTER_SCHEMA = 'gameroad.ui-state-feedback.ready-plan-adapter.v1';
export const READY_PLAN_FEEDBACK_BINDING_SCHEMA = 'gameroad.ui-state-feedback.ready-plan-binding.v1';

const INTERACTION_EVENTS = new Set(['POINTER_DOWN', 'POINTER_MOVE', 'POINTER_UP', 'TICK', 'SECONDARY', 'KEY_ACTIVATE']);

function requireEvent(event) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) throw new Error('event must be an object');
  if (typeof event.type !== 'string' || event.type.trim() === '') throw new Error('event.type must be a non-empty string');
  return event;
}

function validateOperationToken(token) {
  if (typeof token !== 'string' || token.trim() === '') {
    throw new Error('operationToken is required for ready-plan commit');
  }
  return token;
}

function requireOperationToken(event) {
  if (typeof event.operationToken === 'string') return validateOperationToken(event.operationToken);
  if (typeof event.operationTokenFactory === 'function') return validateOperationToken(event.operationTokenFactory());
  throw new Error('operationToken is required for ready-plan commit');
}

function result(state, intent = null, command = null, commitResult = undefined) {
  return Object.freeze({
    schema: READY_PLAN_FEEDBACK_ADAPTER_SCHEMA,
    state,
    feedback: projectUIFeedback(state),
    intent,
    command,
    commitResult,
  });
}

function beginCommit(state, event, source) {
  const token = requireOperationToken(event);
  const pendingState = applyUIFeedbackEvent(state, {
    type: 'BEGIN_PENDING',
    token,
    reason: event.reason || 'ready_plan_commit_pending',
  });
  return {
    state: pendingState,
    command: Object.freeze({type: 'commit', operationToken: token, source}),
  };
}

export function createReadyPlanFeedbackAdapter({
  config,
  commit,
  role = 'ready_plan',
  reason = 'ready_plan_ready',
  reducedMotion = false,
  lowPerf = false,
  disabled = false,
} = {}) {
  if (typeof commit !== 'function') throw new Error('commit callback is required');

  let state = createUIFeedbackState({config, role, reason, reducedMotion, lowPerf});
  if (disabled) state = applyUIFeedbackEvent(state, {type: 'DISABLE', reason: 'ready_plan_disabled'});

  const getState = () => state;
  const getFeedback = () => projectUIFeedback(state);

  function dispatch(rawEvent) {
    const event = requireEvent(rawEvent);

    if (state.feedback === 'pending' && INTERACTION_EVENTS.has(event.type)) {
      return result(state);
    }
    if (state.feedback === 'disabled' && event.type === 'KEY_ACTIVATE') {
      return result(state);
    }

    if (event.type === 'KEY_ACTIVATE') {
      const nextCommit = beginCommit(state, event, 'keyboard');
      state = nextCommit.state;
      const commitResult = commit(nextCommit.command);
      return result(state, 'primary', nextCommit.command, commitResult);
    }

    const nextState = applyUIFeedbackEvent(state, event);
    const consumed = consumeUIIntent(nextState);
    let settledState = consumed.state;
    const intent = consumed.intent;

    if (intent === 'primary') {
      const nextCommit = beginCommit(settledState, event, 'pointer_release');
      settledState = nextCommit.state;
      state = settledState;
      const commitResult = commit(nextCommit.command);
      return result(state, intent, nextCommit.command, commitResult);
    }

    state = settledState;
    return result(state, intent);
  }

  return Object.freeze({
    schema: READY_PLAN_FEEDBACK_ADAPTER_SCHEMA,
    dispatch,
    getState,
    getFeedback,
  });
}

function requireBindingTarget(target) {
  if (!target || typeof target.addEventListener !== 'function' || typeof target.removeEventListener !== 'function') {
    throw new Error('target must support addEventListener/removeEventListener');
  }
  return target;
}

function requireBindingAdapter(adapter) {
  if (!adapter || typeof adapter.dispatch !== 'function' || typeof adapter.getFeedback !== 'function') {
    throw new Error('adapter must expose dispatch/getFeedback');
  }
  return adapter;
}

function pointerIdOf(event) {
  return Number.isInteger(event?.pointerId) ? event.pointerId : 0;
}

function pointerCoordinate(event, key) {
  const value = event?.[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${key} must be finite`);
  return value;
}

function pointerPointInsideTarget(target, event) {
  const x = pointerCoordinate(event, 'clientX');
  const y = pointerCoordinate(event, 'clientY');
  if (typeof target.getBoundingClientRect !== 'function') return true;
  const rect = target.getBoundingClientRect();
  const edges = [rect?.left, rect?.top, rect?.right, rect?.bottom];
  if (!edges.every((value) => typeof value === 'number' && Number.isFinite(value))) return false;
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

function capturePointerIfSupported(target, pointerId) {
  if (typeof target.setPointerCapture !== 'function') return false;
  try {
    target.setPointerCapture(pointerId);
    return true;
  } catch (error) {
    if (error?.name === 'NotFoundError') return false;
    throw error;
  }
}

function releasePointerCaptureIfHeld(target, pointerId) {
  if (pointerId === null || typeof target.releasePointerCapture !== 'function') return false;
  if (typeof target.hasPointerCapture === 'function' && !target.hasPointerCapture(pointerId)) return false;
  try {
    target.releasePointerCapture(pointerId);
    return true;
  } catch (error) {
    if (error?.name === 'NotFoundError') return false;
    throw error;
  }
}

export function bindReadyPlanFeedbackControl({
  target,
  adapter,
  operationTokenFactory,
  render = () => {},
  now = () => Date.now(),
  tickMs = 50,
  schedule = (fn, ms) => setInterval(fn, ms),
  cancelSchedule = (handle) => clearInterval(handle),
} = {}) {
  requireBindingTarget(target);
  requireBindingAdapter(adapter);
  if (typeof operationTokenFactory !== 'function') throw new Error('operationTokenFactory is required');
  if (typeof render !== 'function') throw new Error('render must be a function');
  if (typeof now !== 'function') throw new Error('now must be a function');
  if (typeof schedule !== 'function' || typeof cancelSchedule !== 'function') throw new Error('schedule/cancelSchedule must be functions');
  if (typeof tickMs !== 'number' || !Number.isFinite(tickMs) || tickMs <= 0) throw new Error('tickMs must be a positive finite number');

  let activePointerId = null;
  let tickHandle = null;
  let destroyed = false;

  const publish = (out) => {
    render(out.feedback, out);
    return out;
  };
  const dispatch = (event) => publish(adapter.dispatch(event));
  const stopTick = () => {
    if (tickHandle === null) return;
    cancelSchedule(tickHandle);
    tickHandle = null;
  };
  const startTick = () => {
    stopTick();
    tickHandle = schedule(() => {
      if (destroyed || activePointerId === null) return;
      const out = dispatch({type: 'TICK', atMs: now()});
      if (out.intent === 'detail') stopTick();
    }, tickMs);
  };
  const matchesActivePointer = (event) => activePointerId !== null && pointerIdOf(event) === activePointerId;
  const cancelActivePointer = (reason) => {
    if (activePointerId === null) return false;
    const pointerId = activePointerId;
    activePointerId = null;
    stopTick();
    try {
      dispatch({type: 'BLUR', reason});
    } finally {
      releasePointerCaptureIfHeld(target, pointerId);
    }
    return true;
  };

  const onPointerDown = (event) => {
    if (destroyed || activePointerId !== null) return;
    if (typeof event?.button === 'number' && event.button !== 0) return;
    const pointerId = pointerIdOf(event);
    capturePointerIfSupported(target, pointerId);
    activePointerId = pointerId;
    dispatch({
      type: 'POINTER_DOWN',
      x: pointerCoordinate(event, 'clientX'),
      y: pointerCoordinate(event, 'clientY'),
      atMs: now(),
    });
    startTick();
  };
  const onPointerMove = (event) => {
    if (destroyed || !matchesActivePointer(event)) return;
    const out = dispatch({
      type: 'POINTER_MOVE',
      x: pointerCoordinate(event, 'clientX'),
      y: pointerCoordinate(event, 'clientY'),
    });
    if (out.intent === 'swipe_right') {
      stopTick();
      return;
    }
    if (!pointerPointInsideTarget(target, event)) {
      cancelActivePointer('pointer_left_target');
    }
  };
  const onPointerUp = (event) => {
    if (destroyed || !matchesActivePointer(event)) return;
    if (!pointerPointInsideTarget(target, event)) {
      cancelActivePointer('pointer_release_outside');
      return;
    }
    const pointerId = activePointerId;
    activePointerId = null;
    stopTick();
    try {
      dispatch({type: 'POINTER_UP', operationTokenFactory});
    } finally {
      releasePointerCaptureIfHeld(target, pointerId);
    }
  };
  const onPointerCancel = (event) => {
    if (destroyed || !matchesActivePointer(event)) return;
    const pointerId = activePointerId;
    activePointerId = null;
    stopTick();
    try {
      dispatch({type: 'BLUR', reason: 'pointer_cancelled'});
    } finally {
      releasePointerCaptureIfHeld(target, pointerId);
    }
  };
  const onLostPointerCapture = (event) => {
    if (destroyed || !matchesActivePointer(event)) return;
    activePointerId = null;
    stopTick();
    dispatch({type: 'BLUR', reason: 'pointer_capture_lost'});
  };
  const onKeyDown = (event) => {
    if (destroyed || (event?.key !== 'Enter' && event?.key !== ' ')) return;
    if (typeof event.preventDefault === 'function') event.preventDefault();
    if (event?.repeat === true) return;
    dispatch({type: 'KEY_ACTIVATE', operationTokenFactory});
  };
  const onContextMenu = (event) => {
    if (destroyed) return;
    if (typeof event.preventDefault === 'function') event.preventDefault();
    dispatch({type: 'SECONDARY'});
  };
  const onBlur = () => {
    if (destroyed) return;
    const pointerId = activePointerId;
    activePointerId = null;
    stopTick();
    try {
      dispatch({type: 'BLUR', reason: 'control_blur'});
    } finally {
      releasePointerCaptureIfHeld(target, pointerId);
    }
  };

  const listeners = [
    ['pointerdown', onPointerDown],
    ['pointermove', onPointerMove],
    ['pointerup', onPointerUp],
    ['pointercancel', onPointerCancel],
    ['lostpointercapture', onLostPointerCapture],
    ['keydown', onKeyDown],
    ['contextmenu', onContextMenu],
    ['blur', onBlur],
  ];
  for (const [type, handler] of listeners) target.addEventListener(type, handler);
  render(adapter.getFeedback(), null);

  const acknowledge = ({operationToken, accepted, reason} = {}) => {
    if (destroyed) throw new Error('binding is destroyed');
    if (typeof accepted !== 'boolean') throw new Error('accepted must be boolean');
    return dispatch({
      type: accepted ? 'ACK_CONFIRMED' : 'ACK_FAILED',
      token: validateOperationToken(operationToken),
      reason,
    });
  };

  const destroy = () => {
    if (destroyed) return false;
    const pointerId = activePointerId;
    destroyed = true;
    activePointerId = null;
    stopTick();
    releasePointerCaptureIfHeld(target, pointerId);
    for (const [type, handler] of listeners) target.removeEventListener(type, handler);
    return true;
  };

  return Object.freeze({
    schema: READY_PLAN_FEEDBACK_BINDING_SCHEMA,
    acknowledge,
    destroy,
  });
}
