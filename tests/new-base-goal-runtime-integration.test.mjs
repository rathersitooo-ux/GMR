import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyNewBaseGoalRuntimeFact,
  createNewBaseGoalRuntime,
  NEW_BASE_GOAL_RUNTIME_INTEGRATION
} from '../browser/new-base-goal-runtime-integration.mjs';

function goalFact(overrides = {}) {
  return {
    type: 'GOAL_REACHED',
    authoritative: true,
    eventId: 'goal-event-1',
    resultId: 'result-1',
    matchId: 'match-1',
    actorId: 'p1',
    goalId: 'goal-a',
    winnerIds: ['p1', 'p2'],
    victoryColumnComplete: true,
    ...overrides
  };
}

test('GOAL cannot end the match before the victory-column prerequisite', () => {
  const runtime = createNewBaseGoalRuntime({ matchId: 'match-1' });
  const result = applyNewBaseGoalRuntimeFact(
    runtime,
    goalFact({ victoryColumnComplete: false })
  );

  assert.equal(result.accepted, false);
  assert.equal(result.reason, 'VICTORY_COLUMN_REQUIRED_BEFORE_GOAL');
  assert.equal(runtime.terminal.status, 'ACTIVE');
});

test('authoritative GOAL after victory-column completion finalizes the existing result core', () => {
  const runtime = createNewBaseGoalRuntime({ matchId: 'match-1' });
  const result = applyNewBaseGoalRuntimeFact(runtime, goalFact());

  assert.equal(result.accepted, true);
  assert.equal(result.reason, 'GOAL_ACCEPTED');
  assert.equal(result.runtime.terminal.status, 'ENDED');
  assert.equal(result.finalizedResult.terminalReason, 'GOAL_REACHED');
  assert.deepEqual(result.finalizedResult.winnerIds, ['p1', 'p2']);
});

test('victory-column completion alone remains non-terminal', () => {
  const runtime = createNewBaseGoalRuntime({ matchId: 'match-1' });
  const result = applyNewBaseGoalRuntimeFact(runtime, {
    type: 'VICTORY_COLUMN_COMPLETED',
    authoritative: true,
    matchId: 'match-1'
  });

  assert.equal(result.accepted, true);
  assert.equal(result.reason, 'VICTORY_COLUMN_RECORDED');
  assert.equal(result.runtime.terminal.status, 'ACTIVE');
});

test('runtime adapter does not invent rank, reward, or tie semantics', () => {
  const runtime = createNewBaseGoalRuntime({ matchId: 'match-1' });
  const result = applyNewBaseGoalRuntimeFact(runtime, goalFact());

  assert.equal(Object.hasOwn(result.finalizedResult, 'ranking'), false);
  assert.equal(Object.hasOwn(result.finalizedResult, 'rewards'), false);
  assert.equal(Object.hasOwn(result.finalizedResult, 'tieBreak'), false);
});

test('cross-match and non-authoritative facts fail closed', () => {
  const runtime = createNewBaseGoalRuntime({ matchId: 'match-1' });

  assert.equal(
    applyNewBaseGoalRuntimeFact(runtime, goalFact({ authoritative: false })).reason,
    'AUTHORITATIVE_FACT_REQUIRED'
  );
  assert.equal(
    applyNewBaseGoalRuntimeFact(runtime, goalFact({ matchId: 'match-other' })).reason,
    'MATCH_ID_MISMATCH'
  );
});

test('integration contract exposes the Human-authored prerequisite explicitly', () => {
  assert.equal(
    NEW_BASE_GOAL_RUNTIME_INTEGRATION.prerequisite,
    'VICTORY_COLUMN_COMPLETE_BEFORE_GOAL'
  );
});
