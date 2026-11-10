import { consumeAuthoritativeNewBaseGoalArrival } from './new-base-goal-arrival-consumer.mjs';
import { mountNewBaseGoalArrivalRuntime } from './new-base-goal-arrival-runtime-mount.mjs';
import { mountBattleGoalArrivalLiveAdapter } from './battle-goal-arrival-live-adapter.mjs';

const INTEGRATION_SCHEMA = 'GAMEROAD_BATTLE_GOAL_ARRIVAL_LIVE_INTEGRATION_V1';

function frozenResult(value) {
  return Object.freeze(value);
}

function failedMount(reason) {
  const consumeAndPresent = () => frozenResult({
    accepted: false,
    duplicate: false,
    reason,
    outcome: null,
    presentationStarted: false,
    playback: frozenResult({ started: false, reason })
  });
  return Object.freeze({
    schema: INTEGRATION_SCHEMA,
    mounted: false,
    presentationOnly: true,
    gameplayAuthority: false,
    gameStateWrite: false,
    terminalAuthority: false,
    terminalStateOwnership: 'CALLER',
    consumeAndPresent,
    presentConsumedOutcome: () => frozenResult({ started: false, reason }),
    destroy: () => false
  });
}

/**
 * Mounts the already-merged WorkUnit31 presentation chain behind one live-use
 * surface. The caller continues to own the terminal state and decides whether
 * to adopt outcome.state into its existing authoritative state flow.
 *
 * This integration deliberately does not infer GOAL reach, winners, result
 * semantics, movement, or legality. Strong presentation can only start after
 * consumeAuthoritativeNewBaseGoalArrival accepts the first authoritative
 * GOAL_REACHED event.
 */
export function mountBattleGoalArrivalLiveIntegration({
  host,
  documentLike = host?.ownerDocument,
  resolveGoalElement = () => null,
  resolveActorElement = () => null,
  schedulerSource = globalThis,
  presentResult,
  arrivalRuntime = null
} = {}) {
  let runtime = arrivalRuntime;
  const ownsRuntime = !runtime;

  if (!runtime) {
    runtime = mountNewBaseGoalArrivalRuntime({
      host,
      documentLike,
      resolveGoalElement,
      resolveActorElement,
      schedulerSource
    });
  }

  if (!runtime || runtime.mounted === false || typeof runtime.play !== 'function') {
    if (ownsRuntime) runtime?.destroy?.();
    return failedMount('ARRIVAL_RUNTIME_UNAVAILABLE');
  }

  const liveAdapter = mountBattleGoalArrivalLiveAdapter({
    host,
    arrivalRuntime: runtime,
    presentResult
  });

  if (!liveAdapter?.mounted) {
    if (ownsRuntime) runtime.destroy?.();
    return failedMount('GOAL_ARRIVAL_LIVE_ADAPTER_UNAVAILABLE');
  }

  let destroyed = false;

  function presentConsumedOutcome(outcome) {
    if (destroyed) return frozenResult({ started: false, reason: 'DESTROYED' });
    return liveAdapter.present(outcome);
  }

  function consumeAndPresent(terminalState, event, options = {}) {
    if (destroyed) {
      return frozenResult({
        accepted: false,
        duplicate: false,
        reason: 'DESTROYED',
        outcome: null,
        presentationStarted: false,
        playback: frozenResult({ started: false, reason: 'DESTROYED' })
      });
    }

    let outcome;
    try {
      outcome = consumeAuthoritativeNewBaseGoalArrival(terminalState, event, options);
    } catch (error) {
      const errorCode = typeof error?.message === 'string' && error.message
        ? error.message
        : 'UNKNOWN_CONSUMER_ERROR';
      return frozenResult({
        accepted: false,
        duplicate: false,
        reason: 'GOAL_ARRIVAL_CONSUMER_ERROR',
        errorCode,
        outcome: null,
        presentationStarted: false,
        playback: frozenResult({ started: false, reason: 'GOAL_ARRIVAL_CONSUMER_ERROR' })
      });
    }

    let playback = frozenResult({
      started: false,
      reason: outcome?.duplicate === true
        ? 'DUPLICATE_PRESENTATION_SUPPRESSED'
        : outcome?.accepted === true
          ? 'PRESENTATION_NOT_AVAILABLE'
          : 'UNACCEPTED_PRESENTATION_SUPPRESSED'
    });

    if (
      outcome?.accepted === true
      && outcome?.duplicate !== true
      && outcome?.presentationReason === 'GOAL_ARRIVAL_THEN_RESULT'
    ) {
      playback = presentConsumedOutcome(outcome);
    }

    return frozenResult({
      accepted: outcome?.accepted === true,
      duplicate: outcome?.duplicate === true,
      reason: outcome?.reason || 'UNKNOWN',
      outcome,
      presentationStarted: playback?.started === true,
      playback
    });
  }

  function destroy() {
    if (destroyed) return false;
    destroyed = true;
    liveAdapter.destroy?.();
    if (ownsRuntime) runtime.destroy?.();
    return true;
  }

  return Object.freeze({
    schema: INTEGRATION_SCHEMA,
    mounted: true,
    presentationOnly: true,
    gameplayAuthority: false,
    gameStateWrite: false,
    resultAuthority: false,
    terminalAuthority: false,
    terminalStateOwnership: 'CALLER',
    consumeAndPresent,
    presentConsumedOutcome,
    destroy
  });
}

export const BATTLE_GOAL_ARRIVAL_LIVE_INTEGRATION = Object.freeze({
  schema: INTEGRATION_SCHEMA,
  accepts: 'CALLER_TERMINAL_STATE_PLUS_AUTHORITATIVE_EVENT_OR_ALREADY_CONSUMED_OUTCOME',
  strongEffectGate: 'FIRST_ACCEPTED_AUTHORITATIVE_GOAL_REACHED_ONLY',
  progressionIsTerminal: false,
  terminalStateOwnership: 'CALLER',
  presentationOnly: true,
  gameplayAuthority: false,
  gameStateWrite: false,
  resultAuthority: false,
  terminalAuthority: false
});
