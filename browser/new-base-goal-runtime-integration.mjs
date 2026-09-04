import {
  applyAuthoritativeNewBaseGoalArrival,
  createNewBaseGoalTerminalState
} from './new-base-goal-result-core.mjs';

const RUNTIME_SCHEMA = 'GAMEROAD_NEW_BASE_GOAL_RUNTIME_V1';

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function rejection(runtime, reason) {
  return Object.freeze({ accepted: false, duplicate: false, reason, runtime });
}

export function createNewBaseGoalRuntime({ matchId } = {}) {
  if (!nonEmptyString(matchId)) throw new TypeError('MATCH_ID_REQUIRED');
  return Object.freeze({
    schema: RUNTIME_SCHEMA,
    matchId: matchId.trim(),
    terminal: createNewBaseGoalTerminalState({ matchId })
  });
}

export function applyNewBaseGoalRuntimeFact(runtime, fact) {
  if (!runtime || runtime.schema !== RUNTIME_SCHEMA || !runtime.terminal) {
    return rejection(runtime, 'RUNTIME_INVALID');
  }
  if (!fact || typeof fact !== 'object' || Array.isArray(fact)) {
    return rejection(runtime, 'FACT_INVALID');
  }
  if (fact.authoritative !== true) return rejection(runtime, 'AUTHORITATIVE_FACT_REQUIRED');
  if (!nonEmptyString(fact.matchId) || fact.matchId.trim() !== runtime.matchId) {
    return rejection(runtime, 'MATCH_ID_MISMATCH');
  }

  // Human-authored new-base rule: completing the victory column alone is not a win.
  // GOAL can terminate the match only after that prerequisite is already true.
  if (fact.type === 'VICTORY_COLUMN_COMPLETED') {
    return Object.freeze({ accepted: true, duplicate: false, reason: 'VICTORY_COLUMN_RECORDED', runtime });
  }
  if (fact.type !== 'GOAL_REACHED') return rejection(runtime, 'GOAL_REACHED_REQUIRED');
  if (fact.victoryColumnComplete !== true) {
    return rejection(runtime, 'VICTORY_COLUMN_REQUIRED_BEFORE_GOAL');
  }

  const terminalResult = applyAuthoritativeNewBaseGoalArrival(runtime.terminal, fact);
  if (!terminalResult.accepted) {
    return Object.freeze({ ...terminalResult, runtime });
  }

  const nextRuntime = Object.freeze({
    ...runtime,
    terminal: terminalResult.state
  });
  return Object.freeze({
    accepted: true,
    duplicate: terminalResult.duplicate,
    reason: terminalResult.reason,
    runtime: nextRuntime,
    finalizedResult: terminalResult.state.finalizedResult
  });
}

export const NEW_BASE_GOAL_RUNTIME_INTEGRATION = Object.freeze({
  schema: RUNTIME_SCHEMA,
  prerequisite: 'VICTORY_COLUMN_COMPLETE_BEFORE_GOAL'
});
