import { createResultPresentation } from './result-presentation-core.mjs';

const STATE_SCHEMA = 'GAMEROAD_NEW_BASE_GOAL_TERMINAL_V1';
const RESULT_SCHEMA = 'GAMEROAD_NEW_BASE_MATCH_RESULT_V1';

function cloneJson(value) {
  if (value === undefined) return undefined;
  const text = JSON.stringify(value);
  if (text === undefined) throw new TypeError('NON_JSON_VALUE');
  return JSON.parse(text);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function uniqueNonEmptyStrings(values) {
  if (!Array.isArray(values) || values.length === 0) return false;
  const normalized = values.map((value) => (typeof value === 'string' ? value.trim() : ''));
  return normalized.every(Boolean) && new Set(normalized).size === normalized.length;
}

function validState(state) {
  return Boolean(
    state
      && typeof state === 'object'
      && !Array.isArray(state)
      && state.schema === STATE_SCHEMA
      && nonEmptyString(state.matchId)
      && (state.status === 'ACTIVE' || state.status === 'ENDED')
  );
}

function rejection(state, reason) {
  return deepFreeze({ accepted: false, duplicate: false, reason, state });
}

export function createNewBaseGoalTerminalState({ matchId } = {}) {
  if (!nonEmptyString(matchId)) throw new TypeError('MATCH_ID_REQUIRED');
  return deepFreeze({
    schema: STATE_SCHEMA,
    matchId: matchId.trim(),
    status: 'ACTIVE',
    acceptedGoalEventId: null,
    finalizedResult: null
  });
}

export function applyAuthoritativeNewBaseGoalArrival(state, event) {
  if (!validState(state)) return rejection(state, 'STATE_INVALID');
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    return rejection(state, 'EVENT_INVALID');
  }
  if (!nonEmptyString(event.eventId)) return rejection(state, 'EVENT_ID_REQUIRED');

  if (state.status === 'ENDED') {
    if (event.eventId.trim() === state.acceptedGoalEventId) {
      return deepFreeze({
        accepted: true,
        duplicate: true,
        reason: 'DUPLICATE_EVENT',
        state
      });
    }
    return rejection(state, 'MATCH_ALREADY_ENDED');
  }

  if (event.type !== 'GOAL_REACHED') return rejection(state, 'GOAL_REACHED_REQUIRED');
  if (event.authoritative !== true) return rejection(state, 'AUTHORITATIVE_FACT_REQUIRED');
  if (!nonEmptyString(event.matchId) || event.matchId.trim() !== state.matchId) {
    return rejection(state, 'MATCH_ID_MISMATCH');
  }
  if (!nonEmptyString(event.resultId)) return rejection(state, 'RESULT_ID_REQUIRED');
  if (!nonEmptyString(event.actorId)) return rejection(state, 'ACTOR_ID_REQUIRED');
  if (!nonEmptyString(event.goalId)) return rejection(state, 'GOAL_ID_REQUIRED');
  if (!uniqueNonEmptyStrings(event.winnerIds)) return rejection(state, 'WINNER_IDS_REQUIRED');

  const finalizedResult = deepFreeze({
    schema: RESULT_SCHEMA,
    resultId: event.resultId.trim(),
    matchId: state.matchId,
    terminalReason: 'GOAL_REACHED',
    winnerIds: event.winnerIds.map((value) => value.trim()),
    goalArrival: {
      eventId: event.eventId.trim(),
      actorId: event.actorId.trim(),
      goalId: event.goalId.trim()
    }
  });

  const nextState = deepFreeze({
    schema: STATE_SCHEMA,
    matchId: state.matchId,
    status: 'ENDED',
    acceptedGoalEventId: event.eventId.trim(),
    finalizedResult
  });

  return deepFreeze({
    accepted: true,
    duplicate: false,
    reason: 'GOAL_ACCEPTED',
    state: nextState
  });
}

export function createNewBaseGoalResultPresentation(state, input = {}) {
  if (!validState(state) || state.status !== 'ENDED' || !state.finalizedResult) {
    throw new TypeError('FINALIZED_GOAL_RESULT_REQUIRED');
  }
  const options = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  return createResultPresentation({
    ...cloneJson(options),
    finalizedResult: cloneJson(state.finalizedResult)
  });
}

export const NEW_BASE_GOAL_RESULT_CORE = Object.freeze({
  stateSchema: STATE_SCHEMA,
  resultSchema: RESULT_SCHEMA,
  terminalEventType: 'GOAL_REACHED'
});
