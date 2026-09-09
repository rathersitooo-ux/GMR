import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BATTLE_GOAL_ARRIVAL_LIVE_ADAPTER,
  mountBattleGoalArrivalLiveAdapter
} from '../browser/battle-goal-arrival-live-adapter.mjs';
import { consumeAuthoritativeNewBaseGoalArrival } from '../browser/new-base-goal-arrival-consumer.mjs';
import { createNewBaseGoalTerminalState } from '../browser/new-base-goal-result-core.mjs';

function goalEvent(overrides = {}) {
  return {
    type: 'GOAL_REACHED',
    authoritative: true,
    eventId: 'goal-live-1',
    resultId: 'result-live-1',
    matchId: 'match-live-1',
    actorId: 'p1',
    goalId: 'goal-top-p1',
    winnerIds: ['p1'],
    ...overrides
  };
}

function consume(overrides = {}) {
  return consumeAuthoritativeNewBaseGoalArrival(
    createNewBaseGoalTerminalState({ matchId: 'match-live-1' }),
    goalEvent(overrides),
    {
      arrivalPresentation: { lowPerf: false },
      resultPresentation: {
        presentationId: 'result-live-view-1',
        reducedMotion: true,
        assets: { character: true }
      }
    }
  );
}

function createHost() {
  const listeners = new Map();
  return {
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(listener);
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener);
    },
    emit(type, detail) {
      for (const listener of [...(listeners.get(type) ?? [])]) listener({ type, detail });
    }
  };
}

function completionDetail(overrides = {}) {
  return {
    eventId: 'goal-live-1',
    resultId: 'result-live-1',
    matchId: 'match-live-1',
    goalId: 'goal-top-p1',
    resultHandoff: true,
    ...overrides
  };
}

test('accepted authoritative GOAL plays arrival first and defers Result until completion', () => {
  const host = createHost();
  const played = [];
  const results = [];
  const runtime = {
    play(plan) {
      played.push(plan);
      return { started: true, eventId: plan.eventId };
    }
  };
  const adapter = mountBattleGoalArrivalLiveAdapter({
    host,
    arrivalRuntime: runtime,
    presentResult(presentation, context) {
      results.push({ presentation, context });
    }
  });

  const outcome = consume();
  const started = adapter.present(outcome);

  assert.equal(adapter.mounted, true);
  assert.equal(adapter.gameplayAuthority, false);
  assert.equal(adapter.gameStateWrite, false);
  assert.equal(started.started, true);
  assert.equal(started.resultDeferredUntil, 'gameroad:goal-arrival-complete');
  assert.equal(played.length, 1);
  assert.equal(played[0], outcome.arrivalPresentation);
  assert.equal(results.length, 0);

  host.emit('gameroad:goal-arrival-complete', completionDetail());

  assert.equal(results.length, 1);
  assert.equal(results[0].presentation, outcome.resultPresentation);
  assert.equal(results[0].context.eventId, 'goal-live-1');
  assert.equal(results[0].context.resultId, 'result-live-1');
  assert.equal(results[0].context.resultAuthority, false);
  assert.equal(results[0].context.gameStateWrite, false);
});

test('duplicate completion and duplicate present never replay Result', () => {
  const host = createHost();
  let resultCount = 0;
  const adapter = mountBattleGoalArrivalLiveAdapter({
    host,
    arrivalRuntime: { play: () => ({ started: true }) },
    presentResult: () => { resultCount += 1; }
  });
  const outcome = consume();

  assert.equal(adapter.present(outcome).started, true);
  host.emit('gameroad:goal-arrival-complete', completionDetail());
  host.emit('gameroad:goal-arrival-complete', completionDetail());

  const duplicate = adapter.present(outcome);
  assert.equal(resultCount, 1);
  assert.equal(duplicate.started, false);
  assert.equal(duplicate.reason, 'DUPLICATE_EVENT_SUPPRESSED');
});

test('rejected ROAD-completed/non-GOAL outcome cannot start the strong arrival chain', () => {
  const host = createHost();
  let playCount = 0;
  let resultCount = 0;
  const adapter = mountBattleGoalArrivalLiveAdapter({
    host,
    arrivalRuntime: { play: () => { playCount += 1; return { started: true }; } },
    presentResult: () => { resultCount += 1; }
  });
  const roadOnly = consume({
    type: 'ROAD_COMPLETED',
    roadCardCount: 7,
    roadComplete: true
  });

  const result = adapter.present(roadOnly);
  assert.equal(roadOnly.accepted, false);
  assert.equal(result.started, false);
  assert.equal(result.reason, 'ACCEPTED_GOAL_ARRIVAL_OUTCOME_REQUIRED');
  assert.equal(playCount, 0);
  assert.equal(resultCount, 0);
});

test('arrival runtime refusal clears pending handoff and never presents Result', () => {
  const host = createHost();
  let resultCount = 0;
  const adapter = mountBattleGoalArrivalLiveAdapter({
    host,
    arrivalRuntime: { play: () => ({ started: false, reason: 'PLAN_INVALID' }) },
    presentResult: () => { resultCount += 1; }
  });

  const started = adapter.present(consume());
  assert.equal(started.started, false);
  assert.equal(started.reason, 'PLAN_INVALID');

  host.emit('gameroad:goal-arrival-complete', completionDetail());
  assert.equal(resultCount, 0);
});

test('synchronous completion during play is deferred until playback acceptance is known', () => {
  const host = createHost();
  const order = [];
  const adapter = mountBattleGoalArrivalLiveAdapter({
    host,
    arrivalRuntime: {
      play() {
        order.push('play');
        host.emit('gameroad:goal-arrival-complete', completionDetail());
        order.push('accepted');
        return { started: true };
      }
    },
    presentResult: () => { order.push('result'); }
  });

  assert.equal(adapter.present(consume()).started, true);
  assert.deepEqual(order, ['play', 'accepted', 'result']);
});

test('destroy removes handoff listener without owning the arrival runtime lifecycle', () => {
  const host = createHost();
  let resultCount = 0;
  const adapter = mountBattleGoalArrivalLiveAdapter({
    host,
    arrivalRuntime: { play: () => ({ started: true }) },
    presentResult: () => { resultCount += 1; }
  });

  assert.equal(adapter.present(consume()).started, true);
  assert.equal(adapter.destroy(), true);
  assert.equal(adapter.destroy(), false);
  host.emit('gameroad:goal-arrival-complete', completionDetail());
  assert.equal(resultCount, 0);
  assert.equal(adapter.present(consume()).reason, 'DESTROYED');
});

test('contract exposes presentation-only ordering and no terminal authority', () => {
  assert.deepEqual(BATTLE_GOAL_ARRIVAL_LIVE_ADAPTER.order, [
    'GOAL_ARRIVAL_COMPLETE',
    'RESULT_PRESENTATION'
  ]);
  assert.equal(BATTLE_GOAL_ARRIVAL_LIVE_ADAPTER.gameplayAuthority, false);
  assert.equal(BATTLE_GOAL_ARRIVAL_LIVE_ADAPTER.gameStateWrite, false);
  assert.equal(BATTLE_GOAL_ARRIVAL_LIVE_ADAPTER.resultAuthority, false);
  assert.equal(BATTLE_GOAL_ARRIVAL_LIVE_ADAPTER.terminalAuthority, false);
});
