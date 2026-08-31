import {
  createUIFeedbackState,
  applyUIFeedbackEvent,
  consumeUIIntent,
  projectUIFeedback,
  MATERIAL_FEEDBACK_MATERIALS,
  MATERIAL_FEEDBACK_PHASES,
  projectMaterialFeedback,
  materialFeedbackCssVars,
} from './ui-state-feedback-core.mjs';

export const READY_PLAN_FEEDBACK_ADAPTER_SCHEMA = 'gameroad.ui-state-feedback.ready-plan-adapter.v1';
export const READY_PLAN_FEEDBACK_BINDING_SCHEMA = 'gameroad.ui-state-feedback.ready-plan-binding.v1';

const INTERACTION_EVENTS = new Set(['POINTER_DOWN', 'POINTER_MOVE', 'POINTER_UP', 'TICK', 'SECONDARY', 'KEY_ACTIVATE']);

const READY_PLAN_MATERIAL = MATERIAL_FEEDBACK_MATERIALS.GUMMY;
const BATTLE_INTERACTION_STYLE_ID = 'gameroad-battle-interaction-feedback-r1';
const BATTLE_INTERACTION_STYLE = `
.battle button:not(.node):enabled:active,
.battle .handCard:enabled:active{
  filter:brightness(.80) saturate(.74);
  outline:1px solid rgba(255,255,255,.76);
  outline-offset:-2px;
}
.battle button:not(.node):focus-visible,
.battle .handCard:focus-visible,
.battle select:focus-visible{
  outline:2px solid currentColor;
  outline-offset:2px;
}
.battle button:not(.node):disabled,
.battle .handCard:disabled,
.battle select:disabled{
  cursor:not-allowed;
  opacity:.38;
  filter:grayscale(.45) brightness(.78);
}
`;
const MATERIAL_CANCEL_REASONS = new Set([
  'pointer_left_target',
  'pointer_release_outside',
  'pointer_cancelled',
  'pointer_capture_lost',
  'control_blur',
]);

function ensureBattleInteractionFeedbackStyle(target) {
  const document = target?.ownerDocument;
  if (!document || typeof document.createElement !== 'function' || !document.head || typeof document.head.appendChild !== 'function') {
    return null;
  }
  const existing = typeof document.getElementById === 'function' ? document.getElementById(BATTLE_INTERACTION_STYLE_ID) : null;
  if (existing) return existing;
  const style = document.createElement('style');
  style.id = BATTLE_INTERACTION_STYLE_ID;
  style.textContent = BATTLE_INTERACTION_STYLE;
  document.head.appendChild(style);
  return style;
}

function clamp01(value) {
  return Math.min(1, Math.max(0, Number(value)));
}

function materialPhaseForFeedback(feedback) {
  if (feedback.feedback === 'pressed') return MATERIAL_FEEDBACK_PHASES.PRESSED;
  if (feedback.feedback === 'detail') return MATERIAL_FEEDBACK_PHASES.HOLD;
  if (feedback.feedback === 'pending') return MATERIAL_FEEDBACK_PHASES.COMMITTED;
  if (feedback.feedback === 'confirmed') return MATERIAL_FEEDBACK_PHASES.SETTLED;
  if (feedback.feedback === 'failed') return MATERIAL_FEEDBACK_PHASES.CANCELLED;
  if (feedback.feedback === 'disabled') return MATERIAL_FEEDBACK_PHASES.DISABLED;
  if (feedback.feedback === 'focus') return MATERIAL_FEEDBACK_PHASES.FOCUSED;
  if (MATERIAL_CANCEL_REASONS.has(feedback.reason)) return MATERIAL_FEEDBACK_PHASES.CANCELLED;
  return MATERIAL_FEEDBACK_PHASES.NORMAL;
}

function materialContactForEvent(target, event) {
  if (typeof target.getBoundingClientRect !== 'function') return Object.freeze({x:.5,y:.5});
  const rect = target.getBoundingClientRect();
  const width = Number.isFinite(rect?.width) && rect.width > 0 ? rect.width : Number(rect?.right) - Number(rect?.left);
  const height = Number.isFinite(rect?.height) && rect.height > 0 ? rect.height : Number(rect?.bottom) - Number(rect?.top);
  if (!(width > 0) || !(height > 0)) return Object.freeze({x:.5,y:.5});
  return Object.freeze({
    x: clamp01((pointerCoordinate(event, 'clientX') - Number(rect.left)) / width),
    y: clamp01((pointerCoordinate(event, 'clientY') - Number(rect.top)) / height),
  });
}

function createReadyPlanMaterialPainter(target) {
  const style = target?.style;
  const dataset = target?.dataset;
  if (!style || typeof style.setProperty !== 'function' || !dataset) {
    return Object.freeze({apply:()=>null,destroy:()=>false});
  }

  const paintKeys = ['filter','boxShadow','outlineColor','outlineStyle','outlineWidth','transitionProperty','transitionDuration','transitionTimingFunction'];
  const baselinePaint = Object.fromEntries(paintKeys.map((key)=>[key, style[key] ?? '']));
  const baselineDataset = {phase: dataset.gmrMaterialPhase, material: dataset.gmrMaterial};
  const baselineVars = new Map();
  let revision = 0;
  let settleHandle = null;

  const restorePaint = () => { for (const key of paintKeys) style[key] = baselinePaint[key]; };
  const restoreDataset = () => {
    if (baselineDataset.phase === undefined) delete dataset.gmrMaterialPhase;
    else dataset.gmrMaterialPhase = baselineDataset.phase;
    if (baselineDataset.material === undefined) delete dataset.gmrMaterial;
    else dataset.gmrMaterial = baselineDataset.material;
  };
  const restoreVars = () => {
    for (const [name, value] of baselineVars) {
      if (value) style.setProperty(name, value);
      else style.removeProperty(name);
    }
  };
  const cancelSettle = () => {
    if (settleHandle === null) return;
    clearTimeout(settleHandle);
    settleHandle = null;
  };
  const applyProjection = (projection) => {
    const vars = materialFeedbackCssVars(projection);
    for (const [name, value] of Object.entries(vars)) {
      if (!baselineVars.has(name)) baselineVars.set(name, style.getPropertyValue(name));
      style.setProperty(name, value);
    }
    dataset.gmrMaterialPhase = projection.phase;
    dataset.gmrMaterial = projection.material;
    if (projection.phase === MATERIAL_FEEDBACK_PHASES.NORMAL || projection.phase === MATERIAL_FEEDBACK_PHASES.DISABLED) {
      restorePaint();
      return;
    }
    const compression = projection.surface.shadowCompression;
    const rim = projection.surface.rimTension;
    const refraction = projection.surface.refraction;
    const brightness = Math.max(.82, 1 - compression * .12 + refraction * .025);
    const saturation = Math.max(.72, 1 - compression * .18 + refraction * .04);
    const contrast = 1 + rim * .12;
    const inset = Math.max(1, Math.round(1 + compression * 5));
    const rimAlpha = Math.min(.72, .08 + rim * .5 + refraction * .12);
    style.filter = `brightness(${brightness.toFixed(3)}) saturate(${saturation.toFixed(3)}) contrast(${contrast.toFixed(3)})`;
    style.boxShadow = `inset 0 ${inset}px ${Math.max(2, inset + 2)}px rgba(0,0,0,${Math.min(.46,.1 + compression * .34).toFixed(3)}), 0 0 ${Math.max(2, Math.round(2 + rim * 8))}px rgba(255,255,255,${rimAlpha.toFixed(3)})`;
    style.outlineStyle = 'solid';
    style.outlineWidth = '1px';
    style.outlineColor = `rgba(255,255,255,${rimAlpha.toFixed(3)})`;
    style.transitionProperty = 'filter, box-shadow, outline-color';
    style.transitionDuration = `${projection.motion.durationMs}ms`;
    style.transitionTimingFunction = projection.motion.easing;
  };

  const apply = (feedback, contact={x:.5,y:.5}) => {
    cancelSettle();
    const ownRevision = ++revision;
    const phase = materialPhaseForFeedback(feedback);
    const reducedMotion = feedback.motion === 'none';
    const lowPerf = feedback.motion === 'reduced';
    const projection = projectMaterialFeedback({material:READY_PLAN_MATERIAL,phase,localX:contact.x,localY:contact.y,reducedMotion,lowPerf});
    applyProjection(projection);
    if (phase === MATERIAL_FEEDBACK_PHASES.CANCELLED || phase === MATERIAL_FEEDBACK_PHASES.SETTLED) {
      const settleAfterMs = reducedMotion ? 90 : Math.max(90, projection.motion.durationMs);
      settleHandle = setTimeout(() => {
        if (revision !== ownRevision) return;
        applyProjection(projectMaterialFeedback({material:READY_PLAN_MATERIAL,phase:MATERIAL_FEEDBACK_PHASES.NORMAL,localX:contact.x,localY:contact.y,reducedMotion,lowPerf}));
        settleHandle = null;
      }, settleAfterMs);
      settleHandle?.unref?.();
    }
    return projection;
  };

  const destroy = () => {
    cancelSettle();
    revision += 1;
    restorePaint();
    restoreVars();
    restoreDataset();
    return true;
  };
  return Object.freeze({apply,destroy});
}

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

  ensureBattleInteractionFeedbackStyle(target);

  let activePointerId = null;
  let tickHandle = null;
  let destroyed = false;

  const materialPainter = createReadyPlanMaterialPainter(target);
  let materialContact = Object.freeze({x:.5,y:.5});
  const publish = (out) => {
    render(out.feedback, out);
    materialPainter.apply(out.feedback, materialContact);
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
    materialContact = materialContactForEvent(target, event);
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
    materialContact = materialContactForEvent(target, event);
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
    materialContact = materialContactForEvent(target, event);
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
  const onFocus = () => {
    if (destroyed) return;
    dispatch({type: 'FOCUS', reason: 'control_focus'});
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
    ['focus', onFocus],
    ['blur', onBlur],
  ];
  for (const [type, handler] of listeners) target.addEventListener(type, handler);
  const initialFeedback = adapter.getFeedback();
  render(initialFeedback, null);
  materialPainter.apply(initialFeedback, materialContact);

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
    materialPainter.destroy();
    return true;
  };

  return Object.freeze({
    schema: READY_PLAN_FEEDBACK_BINDING_SCHEMA,
    acknowledge,
    destroy,
  });
}
