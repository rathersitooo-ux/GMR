import {
  applyUIFeedbackEvent,
  consumeUIIntent,
  createUIFeedbackState,
  projectUIFeedback,
} from './ui-state-feedback-core.mjs';

const ACTIVATION_KEYS = new Set(['Enter', ' ', 'Spacebar']);

function nonEmpty(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function requireObject(value, label) {
  if (!value || typeof value !== 'object') throw new Error(`${label} must be an object`);
  return value;
}

function result(state, {intent = null, committed = false, commitResult} = {}) {
  const output = {
    projection: projectUIFeedback(state),
    intent,
    committed,
  };
  if (committed) output.commitResult = commitResult;
  return Object.freeze(output);
}

export function createReadyPlanFeedbackAdapter({
  config,
  commit,
  role = 'battle_ready_plan',
  reason = 'ready',
  reducedMotion = false,
  lowPerf = false,
} = {}) {
  if (typeof commit !== 'function') throw new Error('commit must be a function');

  let state = createUIFeedbackState({
    config,
    role,
    reason,
    reducedMotion,
    lowPerf,
  });

  function set(event) {
    state = applyUIFeedbackEvent(state, event);
    return state;
  }

  function beginPrimary(token, source) {
    nonEmpty(token, 'token');
    const projection = projectUIFeedback(state);
    if (projection.pending || projection.feedback === 'disabled') {
      return result(state);
    }
    set({type: 'BEGIN_PENDING', token, reason: 'commit_pending'});
    const commitResult = commit(Object.freeze({token, source, intent: 'primary'}));
    return result(state, {intent: 'primary', committed: true, commitResult});
  }

  function consumeAfterPointer(token) {
    const consumed = consumeUIIntent(state);
    state = consumed.state;
    if (consumed.intent !== 'primary') {
      return result(state, {intent: consumed.intent});
    }
    return beginPrimary(token, 'pointer');
  }

  return Object.freeze({
    projection() {
      return projectUIFeedback(state);
    },

    pointerDown(event) {
      const e = requireObject(event, 'pointerDown event');
      set({type: 'POINTER_DOWN', x: e.x, y: e.y, atMs: e.atMs});
      return result(state);
    },

    pointerMove(event) {
      const e = requireObject(event, 'pointerMove event');
      if (!state.pointer) return result(state);
      set({type: 'POINTER_MOVE', x: e.x, y: e.y});
      return result(state, {intent: state.intent});
    },

    tick(event) {
      const e = requireObject(event, 'tick event');
      set({type: 'TICK', atMs: e.atMs});
      return result(state, {intent: state.intent});
    },

    pointerUp({token} = {}) {
      if (!state.pointer) return result(state);
      set({type: 'POINTER_UP'});
      return consumeAfterPointer(token);
    },

    secondary() {
      set({type: 'SECONDARY'});
      const consumed = consumeUIIntent(state);
      state = consumed.state;
      return result(state, {intent: consumed.intent});
    },

    keyActivate({key, token} = {}) {
      if (!ACTIVATION_KEYS.has(key)) return result(state);
      return beginPrimary(token, 'keyboard');
    },

    syncDisabled(disabled, reasonText = disabled ? 'unavailable' : 'ready') {
      if (disabled) {
        if (state.feedback !== 'pending' && state.feedback !== 'disabled') {
          set({type: 'DISABLE', reason: nonEmpty(reasonText, 'reason')});
        }
      } else if (state.feedback === 'disabled') {
        set({type: 'ENABLE', reason: nonEmpty(reasonText, 'reason')});
      }
      return result(state);
    },

    focus(reasonText = 'focused') {
      set({type: 'FOCUS', reason: nonEmpty(reasonText, 'reason')});
      return result(state);
    },

    blur(reasonText = 'ready') {
      set({type: 'BLUR', reason: nonEmpty(reasonText, 'reason')});
      return result(state);
    },

    acknowledgeConfirmed({token, reason: reasonText = 'confirmed'} = {}) {
      set({type: 'ACK_CONFIRMED', token, reason: nonEmpty(reasonText, 'reason')});
      return result(state);
    },

    acknowledgeFailed({token, reason: reasonText = 'failed'} = {}) {
      set({type: 'ACK_FAILED', token, reason: nonEmpty(reasonText, 'reason')});
      return result(state);
    },

    reset(reasonText = 'ready') {
      set({type: 'RESET_FEEDBACK', reason: nonEmpty(reasonText, 'reason')});
      return result(state);
    },
  });
}
