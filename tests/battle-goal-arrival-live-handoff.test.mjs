import test from 'node:test';
import assert from 'node:assert/strict';

import { createNewBaseGoalTerminalState } from '../browser/new-base-goal-result-core.mjs';
import { mountBattleGoalArrivalLiveIntegration } from '../browser/battle-goal-arrival-live-integration.mjs';

/**
 * Regression for the live call site (GAMEROAD.html grGoalArrivalWinners):
 * it mounted the integration with an empty presentResult and destroyed it in
 * the same tick, before the async arrival runtime could emit
 * gameroad:goal-arrival-complete. The built Result presentation was dropped
 * twice over, and the arrival overlay was cleared before it could finish.
 * The fix at the call site is: give presentResult a real receiver, and only
 * destroy after the completion event (or at once when nothing started).
 */

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
    for (const listener of [...(this.listeners.get(type) || [])]) listener({ type, detail });
  }
}

function goalEvent(overrides = {}) {
  return {
    eventId: 'goal-event-handoff-1',
    type: 'GOAL_REACHED',
    authoritative: true,
    matchId: 'match-1',
    resultId: 'result-1',
    actorId: 'player-1',
    goalId: 'goal-p1-l2',
    winnerIds: ['player-1'],
    ...overrides
  };
}

function makeHarness() {
  const host = new FakeHost();
  const played = [];
  const resultCalls = [];
  const runtime = {
    mounted: true,
    play(plan) {
      played.push(plan);
      return { started: true, eventId: plan.eventId };
    },
    destroy() {
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
  return { host, played, resultCalls, integration };
}

function complete(host, event) {
  host.emit('gameroad:goal-arrival-complete', {
    eventId: event.eventId,
    resultId: event.resultId,
    matchId: event.matchId,
    goalId: event.goalId,
    resultHandoff: true
  });
}

test('live call-site order (destroy right after consume) drops the Result handoff', () => {
  const { host, integration, resultCalls } = makeHarness();
  const state = createNewBaseGoalTerminalState({ matchId: 'match-1' });
  const event = goalEvent();

  // Exact live sequence before the fix: consume, then destroy in the same tick.
  const outcome = integration.consumeAndPresent(state, event, {
    resultPresentation: { presentationId: event.resultId }
  });
  assert.equal(outcome.accepted, true);
  assert.equal(outcome.presentationStarted, true);
  assert.equal(integration.destroy(), true);

  complete(host, event);

  assert.equal(resultCalls.length, 0, 'destroyed integration must not deliver the Result');
});

test('deferring destroy until after arrival completion delivers the Result once', () => {
  const { host, integration, resultCalls } = makeHarness();
  const state = createNewBaseGoalTerminalState({ matchId: 'match-1' });
  const event = goalEvent();

  const outcome = integration.consumeAndPresent(state, event, {
    resultPresentation: { presentationId: event.resultId }
  });
  assert.equal(outcome.accepted, true);
  assert.equal(outcome.presentationStarted, true);
  assert.equal(resultCalls.length, 0, 'Result stays deferred while arrival is playing');

  // Fixed call-site order: wait for the completion event, then destroy.
  complete(host, event);
  assert.equal(resultCalls.length, 1);
  assert.equal(resultCalls[0].presentation.finalizedResult.resultId, event.resultId);
  assert.equal(resultCalls[0].presentation.finalizedResult.winnerIds[0], 'player-1');
  assert.equal(resultCalls[0].meta.eventId, event.eventId);

  assert.equal(integration.destroy(), true);
  complete(host, event);
  assert.equal(resultCalls.length, 1, 'completion after destroy must not redeliver');
});

test('when arrival never starts, destroying at once is still safe', () => {
  const host = new FakeHost();
  const resultCalls = [];
  const runtime = {
    mounted: true,
    play() {
      return { started: false, reason: 'TEST_RUNTIME_REFUSED' };
    },
    destroy() {
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
  const state = createNewBaseGoalTerminalState({ matchId: 'match-1' });
  const event = goalEvent();

  const outcome = integration.consumeAndPresent(state, event, {
    resultPresentation: { presentationId: event.resultId }
  });
  assert.equal(outcome.accepted, true);
  assert.equal(outcome.presentationStarted, false);

  assert.equal(integration.destroy(), true);
  complete(host, event);
  assert.equal(resultCalls.length, 0);
});
