import {
  createUIFeedbackState,
  applyUIFeedbackEvent,
  consumeUIIntent,
  projectUIFeedback,
} from './ui-state-feedback-core.mjs';

export const READY_PLAN_FEEDBACK_ADAPTER_SCHEMA = 'gameroad.ui-state-feedback.ready-plan-adapter.v1';

const INTERACTION_EVENTS = new Set(['POINTER_DOWN', 'POINTER_MOVE', 'POINTER_UP', 'TICK', 'SECONDARY', 'KEY_ACTIVATE']);

function requireEvent(event) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) throw new Error('event must be an object');
  if (typeof event.type !== 'string' || event.type.trim() === '') throw new Error('event.type must be a non-empty string');
  return event;
}

function requireOperationToken(event) {
  if (typeof event.operationToken !== 'string' || event.operationToken.trim() === '') {
    throw new Error('operationToken is required for ready-plan commit');
  }
  return event.operationToken;
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
