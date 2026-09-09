import test from 'node:test';
import assert from 'node:assert/strict';

import { consumeAuthoritativeNewBaseGoalArrival } from '../browser/new-base-goal-arrival-consumer.mjs';
import { createNewBaseGoalTerminalState } from '../browser/new-base-goal-result-core.mjs';
import { projectResultPresentation } from '../browser/result-presentation-core.mjs';

function goalEvent(overrides = {}) {
  return {
    type: 'GOAL_REACHED',
    authoritative: true,
    eventId: 'goal-consumer-1',
    resultId: 'result-consumer-1',
    matchId: 'match-consumer-1',
    actorId: 'p3',
    goalId: 'goal-c',
    winnerIds: ['p3', 'p4'],
    ...overrides
  };
}

function options() {
  return {
    arrivalPresentation: { lowPerf: false },
    resultPresentation: {
      presentationId: 'result-view-consumer-1',
      reducedMotion: true,
      assets: { character: true }
    }
  };
}

test('consumer composes existing GOAL authority -> arrival beat -> existing Result presentation', () => {
  const initial = createNewBaseGoalTerminalState({ matchId: 'match-consumer-1' });
  const consumed = consumeAuthoritativeNewBaseGoalArrival(initial, goalEvent(), options());

  assert.equal(consumed.accepted, true);
  assert.equal(consumed.duplicate, false);
  assert.equal(consumed.presentationReason, 'GOAL_ARRIVAL_THEN_RESULT');
  assert.equal(consumed.arrivalPresentation.eventId, 'goal-consumer-1');
  assert.equal(consumed.arrivalPresentation.goalId, 'goal-c');
  assert.equal(consumed.arrivalPresentation.resultHandoff, true);

  const result = projectResultPresentation(consumed.resultPresentation);
  assert.equal(result.ok, true);
  assert.deepEqual(result.finalizedResult, consumed.state.finalizedResult);
});

test('exact duplicate is authority-idempotent and never replays arrival or Result presentation', () => {
  const initial = createNewBaseGoalTerminalState({ matchId: 'match-consumer-1' });
  const first = consumeAuthoritativeNewBaseGoalArrival(initial, goalEvent(), options());
  const duplicate = consumeAuthoritativeNewBaseGoalArrival(first.state, goalEvent(), options());

  assert.equal(duplicate.accepted, true);
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.presentationReason, 'DUPLICATE_PRESENTATION_SUPPRESSED');
  assert.equal(duplicate.arrivalPresentation, null);
  assert.equal(duplicate.resultPresentation, null);
});

test('non-authoritative and seven-card ROAD facts cannot enter the GOAL presentation chain', () => {
  const initial = createNewBaseGoalTerminalState({ matchId: 'match-consumer-1' });
  const untrusted = consumeAuthoritativeNewBaseGoalArrival(
    initial,
    goalEvent({ authoritative: false }),
    options()
  );
  assert.equal(untrusted.accepted, false);
  assert.equal(untrusted.arrivalPresentation, null);
  assert.equal(untrusted.resultPresentation, null);

  const roadOnly = consumeAuthoritativeNewBaseGoalArrival(initial, {
    ...goalEvent(),
    type: 'ROAD_COMPLETED',
    roadCardCount: 7,
    roadComplete: true
  }, options());
  assert.equal(roadOnly.accepted, false);
  assert.equal(roadOnly.reason, 'GOAL_REACHED_REQUIRED');
  assert.equal(roadOnly.arrivalPresentation, null);
  assert.equal(roadOnly.resultPresentation, null);
});
