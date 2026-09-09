import test from 'node:test';
import assert from 'node:assert/strict';

import { createNewBaseGoalTerminalState } from '../browser/new-base-goal-result-core.mjs';
import {
  BATTLE_GOAL_ARRIVAL_LIVE_INTEGRATION,
  mountBattleGoalArrivalLiveIntegration
} from '../browser/battle-goal-arrival-live-integration.mjs';

class FakeHost {
  constructor() {
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    const set = this.listeners.get(type) || new Set();
    set.add(listener);
    this.listeners.set(type, set);
  }

  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }

  emit(type, detail) {
    for (const listener of this.listeners.get(type) || []) listener({ type, detail });
  }
}

function goalEvent(overrides = {}) {
  return {
    eventId: 'goal-event-1',
    type: 'GOAL_REACHED',
    authoritative: true,
    matchId: 'match-1',
    resultId: 'result-1',
    actorId: 'player-1',
    goalId: 'goal-p1-l2',
    winnerIds: ['player-1', 'player-3'],
    ...overrides
  };
}

function resultOptions(id = 'goal-result-presentation-1') {
  return { resultPresentation: { presentationId: id } };
}

function makeHarness({ refusePlayback = false } = {}) {
  const host = new FakeHost();
  const played = [];
  const resultCalls = [];
  let runtimeDestroyCount = 0;
  const runtime = {
    mounted: true,
    play(plan) {
      played.push(plan);
      if (refusePlayback) return { started: false, reason: 'TEST_RUNTIME_REFUSED' };
      return { started: true, eventId: plan.eventId };
    },
    destroy() {
      runtimeDestroyCount += 1;
      return true;
    }
  };
  const integration = mountBattleGoalArrivalLiveIntegration({
    host,
    arrivalRuntime: runtime,
    presentResult(presentation, meta) {
      resultCalls.push({ presentation, meta });
    }
  });
  return { host, played, resultCalls, runtime, integration, getRuntimeDestroyCount: () => runtimeDestroyCount };
}

test('contract keeps terminal state caller-owned and progression nonterminal', () => {
  assert.equal(BATTLE_GOAL_ARRIVAL_LIVE_INTEGRATION.terminalStateOwnership, 'CALLER');
  assert.equal(BATTLE_GOAL_ARRIVAL_LIVE_INTEGRATION.strongEffectGate, 'FIRST_ACCEPTED_AUTHORITATIVE_GOAL_REACHED_ONLY');
  assert.equal(BATTLE_GOAL_ARRIVAL_LIVE_INTEGRATION.progressionIsTerminal, false);
  assert.equal(BATTLE_GOAL_ARRIVAL_LIVE_INTEGRATION.gameplayAuthority, false);
  assert.equal(BATTLE_GOAL_ARRIVAL_LIVE_INTEGRATION.gameStateWrite, false);
  assert.equal(BATTLE_GOAL_ARRIVAL_LIVE_INTEGRATION.resultAuthority, false);
  assert.equal(BATTLE_GOAL_ARRIVAL_LIVE_INTEGRATION.terminalAuthority, false);
});

test('ROAD/7-card completion cannot start the strong GOAL arrival effect', () => {
  const { integration, played, resultCalls } = makeHarness();
  const state = createNewBaseGoalTerminalState({ matchId: 'match-1' });
  const result = integration.consumeAndPresent(state, {
    eventId: 'road-complete-1',
    type: 'ROAD_COMPLETED',
    authoritative: true,
    matchId: 'match-1'
  }, resultOptions());

  assert.equal(result.accepted, false);
  assert.equal(result.reason, 'GOAL_REACHED_REQUIRED');
  assert.equal(result.presentationStarted, false);
  assert.equal(played.length, 0);
  assert.equal(resultCalls.length, 0);
  assert.equal(state.status, 'ACTIVE');
});

test('non-authoritative GOAL_REACHED cannot start the strong effect', () => {
  const { integration, played, resultCalls } = makeHarness();
  const state = createNewBaseGoalTerminalState({ matchId: 'match-1' });
  const result = integration.consumeAndPresent(
    state,
    goalEvent({ authoritative: false }),
    resultOptions()
  );

  assert.equal(result.accepted, false);
  assert.equal(result.reason, 'AUTHORITATIVE_FACT_REQUIRED');
  assert.equal(result.presentationStarted, false);
  assert.equal(played.length, 0);
  assert.equal(resultCalls.length, 0);
});

test('first accepted authoritative GOAL_REACHED plays arrival before Result handoff', () => {
  const { host, integration, played, resultCalls } = makeHarness();
  const state = createNewBaseGoalTerminalState({ matchId: 'match-1' });
  const event = goalEvent();
  const result = integration.consumeAndPresent(state, event, resultOptions());

  assert.equal(result.accepted, true);
  assert.equal(result.duplicate, false);
  assert.equal(result.reason, 'GOAL_ACCEPTED');
  assert.equal(result.presentationStarted, true);
  assert.equal(result.outcome.state.status, 'ENDED');
  assert.equal(result.outcome.state.finalizedResult.terminalReason, 'GOAL_REACHED');
  assert.equal(played.length, 1);
  assert.equal(played[0].eventId, event.eventId);
  assert.equal(resultCalls.length, 0, 'Result must stay deferred while arrival is playing');

  host.emit('gameroad:goal-arrival-complete', {
    eventId: event.eventId,
    resultId: event.resultId,
    matchId: event.matchId,
    goalId: event.goalId,
    resultHandoff: true
  });

  assert.equal(resultCalls.length, 1);
  assert.equal(resultCalls[0].presentation.finalizedResult.resultId, event.resultId);
  assert.equal(resultCalls[0].meta.eventId, event.eventId);
  assert.equal(resultCalls[0].meta.resultAuthority, false);
  assert.equal(resultCalls[0].meta.gameStateWrite, false);
});

test('duplicate authoritative GOAL event cannot replay arrival or Result', () => {
  const { host, integration, played, resultCalls } = makeHarness();
  const initial = createNewBaseGoalTerminalState({ matchId: 'match-1' });
  const event = goalEvent();
  const first = integration.consumeAndPresent(initial, event, resultOptions('result-view-a'));

  host.emit('gameroad:goal-arrival-complete', {
    eventId: event.eventId,
    resultId: event.resultId,
    matchId: event.matchId,
    goalId: event.goalId,
    resultHandoff: true
  });

  const duplicate = integration.consumeAndPresent(
    first.outcome.state,
    event,
    resultOptions('result-view-b')
  );

  assert.equal(first.accepted, true);
  assert.equal(duplicate.accepted, true);
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.reason, 'DUPLICATE_EVENT');
  assert.equal(duplicate.presentationStarted, false);
  assert.equal(played.length, 1);
  assert.equal(resultCalls.length, 1);
});

test('presentation refusal never rolls back an accepted terminal outcome', () => {
  const { integration, played, resultCalls } = makeHarness({ refusePlayback: true });
  const state = createNewBaseGoalTerminalState({ matchId: 'match-1' });
  const result = integration.consumeAndPresent(state, goalEvent(), resultOptions());

  assert.equal(result.accepted, true);
  assert.equal(result.outcome.state.status, 'ENDED');
  assert.equal(result.presentationStarted, false);
  assert.equal(result.playback.reason, 'TEST_RUNTIME_REFUSED');
  assert.equal(played.length, 1);
  assert.equal(resultCalls.length, 0);
});

test('destroy removes integration listener without taking ownership of caller runtime', () => {
  const { host, integration, getRuntimeDestroyCount, resultCalls } = makeHarness();
  const state = createNewBaseGoalTerminalState({ matchId: 'match-1' });
  const event = goalEvent();
  const result = integration.consumeAndPresent(state, event, resultOptions());
  assert.equal(result.presentationStarted, true);

  assert.equal(integration.destroy(), true);
  assert.equal(integration.destroy(), false);
  assert.equal(getRuntimeDestroyCount(), 0, 'caller-provided runtime remains caller-owned');

  host.emit('gameroad:goal-arrival-complete', {
    eventId: event.eventId,
    resultId: event.resultId,
    matchId: event.matchId,
    goalId: event.goalId,
    resultHandoff: true
  });
  assert.equal(resultCalls.length, 0);

  const afterDestroy = integration.consumeAndPresent(result.outcome.state, event, resultOptions());
  assert.equal(afterDestroy.accepted, false);
  assert.equal(afterDestroy.reason, 'DESTROYED');
});
