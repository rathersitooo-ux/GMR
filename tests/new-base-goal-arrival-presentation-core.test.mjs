import test from 'node:test';
import assert from 'node:assert/strict';

import {
  NEW_BASE_GOAL_ARRIVAL_PRESENTATION_CORE,
  createNewBaseGoalArrivalPresentation,
  isNewBaseGoalArrivalPresentation
} from '../browser/new-base-goal-arrival-presentation-core.mjs';
import {
  applyAuthoritativeNewBaseGoalArrival,
  createNewBaseGoalTerminalState
} from '../browser/new-base-goal-result-core.mjs';

function goalEvent(overrides = {}) {
  return {
    type: 'GOAL_REACHED',
    authoritative: true,
    eventId: 'goal-event-1',
    resultId: 'result-1',
    matchId: 'match-1',
    actorId: 'p1',
    goalId: 'goal-a',
    winnerIds: ['p1', 'p2'],
    ...overrides
  };
}

function acceptedGoal() {
  const initial = createNewBaseGoalTerminalState({ matchId: 'match-1' });
  return applyAuthoritativeNewBaseGoalArrival(initial, goalEvent());
}

test('first accepted authoritative GOAL_REACHED builds ARRIVE -> CONFIRM -> CELEBRATE -> HANDOFF', () => {
  const plan = createNewBaseGoalArrivalPresentation(acceptedGoal());

  assert.equal(isNewBaseGoalArrivalPresentation(plan), true);
  assert.equal(plan.schema, NEW_BASE_GOAL_ARRIVAL_PRESENTATION_CORE.schema);
  assert.equal(plan.authority, 'CALLER_ACCEPTED_GOAL_REACHED_ONLY');
  assert.equal(plan.eventId, 'goal-event-1');
  assert.equal(plan.actorId, 'p1');
  assert.equal(plan.goalId, 'goal-a');
  assert.deepEqual(plan.winnerIds, ['p1', 'p2']);
  assert.deepEqual(plan.stages.map((stage) => stage.id), [
    'ARRIVE',
    'CONFIRM',
    'CELEBRATE',
    'HANDOFF'
  ]);
  assert.equal(plan.resultHandoff, true);
  assert.equal(plan.timingIsGameplay, false);
});

test('rejected progression-only facts and duplicate GOAL facts never create a strong arrival plan', () => {
  const initial = createNewBaseGoalTerminalState({ matchId: 'match-1' });
  const roadOnly = applyAuthoritativeNewBaseGoalArrival(initial, {
    ...goalEvent(),
    type: 'ROAD_COMPLETED',
    roadCardCount: 7,
    roadComplete: true
  });
  assert.equal(roadOnly.accepted, false);
  assert.equal(createNewBaseGoalArrivalPresentation(roadOnly), null);

  const first = applyAuthoritativeNewBaseGoalArrival(initial, goalEvent());
  const duplicate = applyAuthoritativeNewBaseGoalArrival(first.state, goalEvent());
  assert.equal(duplicate.duplicate, true);
  assert.equal(createNewBaseGoalArrivalPresentation(duplicate), null);
});

test('reduced-motion keeps GOAL meaning while removing travel, camera and particles', () => {
  const plan = createNewBaseGoalArrivalPresentation(acceptedGoal(), { reducedMotion: true });

  assert.equal(plan.profile.id, 'REDUCED_MOTION');
  assert.equal(plan.profile.travel, false);
  assert.equal(plan.profile.cameraMotion, false);
  assert.equal(plan.profile.particles, false);
  assert.equal(plan.profile.blur, false);
  assert.equal(plan.stages[2].semantic, 'GOAL_TERMINAL_CELEBRATION');
});

test('low-performance mode uses transform-only emphasis without particles or blur', () => {
  const plan = createNewBaseGoalArrivalPresentation(acceptedGoal(), { lowPerf: true });

  assert.equal(plan.profile.id, 'LOW_PERF');
  assert.equal(plan.profile.travel, true);
  assert.equal(plan.profile.cameraMotion, false);
  assert.equal(plan.profile.particles, false);
  assert.equal(plan.profile.blur, false);
  assert.equal(plan.profile.pulse, 'TRANSFORM_ONLY');
});
