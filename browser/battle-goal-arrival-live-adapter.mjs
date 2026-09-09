import { isNewBaseGoalArrivalPresentation } from './new-base-goal-arrival-presentation-core.mjs';

const ADAPTER_SCHEMA = 'GAMEROAD_BATTLE_GOAL_ARRIVAL_LIVE_ADAPTER_V1';
const COMPLETE_EVENT = 'gameroad:goal-arrival-complete';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validConsumedGoalArrival(outcome) {
  return Boolean(
    outcome
      && typeof outcome === 'object'
      && !Array.isArray(outcome)
      && outcome.accepted === true
      && outcome.duplicate !== true
      && outcome.presentationReason === 'GOAL_ARRIVAL_THEN_RESULT'
      && isNewBaseGoalArrivalPresentation(outcome.arrivalPresentation)
      && outcome.resultPresentation
      && typeof outcome.resultPresentation === 'object'
      && !Array.isArray(outcome.resultPresentation)
  );
}

function failedMount(reason) {
  return Object.freeze({
    mounted: false,
    presentationOnly: true,
    gameplayAuthority: false,
    gameStateWrite: false,
    present: () => Object.freeze({ started: false, reason }),
    destroy: () => false
  });
}

/**
 * Composes the already-authorized GOAL arrival presentation with the existing
 * Result presenter. This adapter never accepts GOAL facts, stores match state,
 * computes winners, or writes gameplay state.
 *
 * Input MUST be the accepted output of consumeAuthoritativeNewBaseGoalArrival.
 * Result presentation is deferred until the existing arrival runtime emits its
 * completion event, preserving the intended GOAL-arrival -> Result order.
 */
export function mountBattleGoalArrivalLiveAdapter({
  host,
  arrivalRuntime,
  presentResult
} = {}) {
  if (!host || typeof host.addEventListener !== 'function' || typeof host.removeEventListener !== 'function') {
    return failedMount('EVENT_HOST_REQUIRED');
  }
  if (!arrivalRuntime || typeof arrivalRuntime.play !== 'function') {
    return failedMount('ARRIVAL_RUNTIME_REQUIRED');
  }
  if (typeof presentResult !== 'function') {
    return failedMount('RESULT_PRESENTER_REQUIRED');
  }

  const pending = new Map();
  const completed = new Set();
  let destroyed = false;

  function handoff(entry, detail) {
    if (!entry || completed.has(entry.eventId)) return false;
    pending.delete(entry.eventId);
    completed.add(entry.eventId);

    if (detail?.resultHandoff !== true) return false;

    presentResult(entry.resultPresentation, deepFreeze({
      schema: ADAPTER_SCHEMA,
      eventId: entry.eventId,
      resultId: nonEmptyString(detail?.resultId) ? detail.resultId.trim() : null,
      matchId: nonEmptyString(detail?.matchId) ? detail.matchId.trim() : null,
      goalId: nonEmptyString(detail?.goalId) ? detail.goalId.trim() : null,
      presentationOnly: true,
      gameplayAuthority: false,
      gameStateWrite: false,
      resultAuthority: false
    }));
    return true;
  }

  function onArrivalComplete(event) {
    if (destroyed) return;
    const detail = event?.detail;
    const eventId = nonEmptyString(detail?.eventId) ? detail.eventId.trim() : null;
    if (!eventId) return;

    const entry = pending.get(eventId);
    if (!entry) return;

    if (entry.armed !== true) {
      entry.deferredCompletion = detail;
      return;
    }
    handoff(entry, detail);
  }

  host.addEventListener(COMPLETE_EVENT, onArrivalComplete);

  function present(outcome) {
    if (destroyed) return Object.freeze({ started: false, reason: 'DESTROYED' });
    if (!validConsumedGoalArrival(outcome)) {
      return Object.freeze({ started: false, reason: 'ACCEPTED_GOAL_ARRIVAL_OUTCOME_REQUIRED' });
    }

    const eventId = outcome.arrivalPresentation.eventId;
    if (pending.has(eventId) || completed.has(eventId)) {
      return Object.freeze({ started: false, reason: 'DUPLICATE_EVENT_SUPPRESSED', eventId });
    }

    const entry = {
      eventId,
      resultPresentation: outcome.resultPresentation,
      armed: false,
      deferredCompletion: null
    };
    pending.set(eventId, entry);

    let playback;
    try {
      playback = arrivalRuntime.play(outcome.arrivalPresentation);
    } catch {
      pending.delete(eventId);
      return Object.freeze({ started: false, reason: 'ARRIVAL_RUNTIME_ERROR', eventId });
    }

    if (playback?.started !== true) {
      pending.delete(eventId);
      return Object.freeze({
        started: false,
        reason: playback?.reason || 'ARRIVAL_RUNTIME_REFUSED',
        eventId
      });
    }

    entry.armed = true;
    if (entry.deferredCompletion) handoff(entry, entry.deferredCompletion);

    return Object.freeze({
      started: true,
      reason: 'GOAL_ARRIVAL_PLAYING_RESULT_DEFERRED',
      eventId,
      resultDeferredUntil: COMPLETE_EVENT
    });
  }

  function destroy() {
    if (destroyed) return false;
    destroyed = true;
    pending.clear();
    host.removeEventListener(COMPLETE_EVENT, onArrivalComplete);
    return true;
  }

  return Object.freeze({
    schema: ADAPTER_SCHEMA,
    mounted: true,
    presentationOnly: true,
    gameplayAuthority: false,
    gameStateWrite: false,
    resultAuthority: false,
    terminalAuthority: false,
    present,
    destroy
  });
}

export const BATTLE_GOAL_ARRIVAL_LIVE_ADAPTER = deepFreeze({
  schema: ADAPTER_SCHEMA,
  input: 'ACCEPTED_NEW_BASE_GOAL_ARRIVAL_CONSUMER_OUTCOME_ONLY',
  completionEvent: COMPLETE_EVENT,
  order: ['GOAL_ARRIVAL_COMPLETE', 'RESULT_PRESENTATION'],
  presentationOnly: true,
  gameplayAuthority: false,
  gameStateWrite: false,
  resultAuthority: false,
  terminalAuthority: false
});
