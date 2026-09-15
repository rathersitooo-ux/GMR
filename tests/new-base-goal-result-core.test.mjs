import test from 'node:test';
import assert from 'node:assert/strict';

import {
  NEW_BASE_GOAL_RESULT_CORE,
  applyAuthoritativeNewBaseGoalArrival,
  createNewBaseGoalResultPresentation,
  createNewBaseGoalTerminalState
} from '../browser/new-base-goal-result-core.mjs';
import {
  createNewBaseGoalPathLayout,
  projectNewBaseGoalPathConnections
} from '../browser/new-base-goal-path-core.mjs';
import { shouldForwardLegacySevenRoadWin } from '../browser/new-base-legacy-seven-win-gate-core.mjs';
import { compatible } from '../browser/road-move-compatibility-core.mjs';
import { projectResultPresentation } from '../browser/result-presentation-core.mjs';

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

test('authoritative GOAL_REACHED finalizes the new-base match exactly once', () => {
  const initial = createNewBaseGoalTerminalState({ matchId: 'match-1' });
  const accepted = applyAuthoritativeNewBaseGoalArrival(initial, goalEvent());

  assert.equal(accepted.accepted, true);
  assert.equal(accepted.duplicate, false);
  assert.equal(accepted.reason, 'GOAL_ACCEPTED');
  assert.equal(accepted.state.status, 'ENDED');
  assert.deepEqual(accepted.state.finalizedResult, {
    schema: NEW_BASE_GOAL_RESULT_CORE.resultSchema,
    resultId: 'result-1',
    matchId: 'match-1',
    terminalReason: 'GOAL_REACHED',
    winnerIds: ['p1', 'p2'],
    goalArrival: {
      eventId: 'goal-event-1',
      actorId: 'p1',
      goalId: 'goal-a'
    }
  });

  const duplicate = applyAuthoritativeNewBaseGoalArrival(accepted.state, goalEvent());
  assert.equal(duplicate.accepted, true);
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.reason, 'DUPLICATE_EVENT');
  assert.strictEqual(duplicate.state, accepted.state);

  const later = applyAuthoritativeNewBaseGoalArrival(
    accepted.state,
    goalEvent({ eventId: 'goal-event-2', resultId: 'result-2' })
  );
  assert.equal(later.accepted, false);
  assert.equal(later.reason, 'MATCH_ALREADY_ENDED');
  assert.strictEqual(later.state, accepted.state);
});

test('ROAD completion, including a seven-card claim, cannot terminate this core', () => {
  const initial = createNewBaseGoalTerminalState({ matchId: 'match-1' });
  const rejected = applyAuthoritativeNewBaseGoalArrival(initial, {
    ...goalEvent(),
    type: 'ROAD_COMPLETED',
    roadCardCount: 7,
    roadComplete: true
  });

  assert.equal(rejected.accepted, false);
  assert.equal(rejected.reason, 'GOAL_REACHED_REQUIRED');
  assert.equal(rejected.state.status, 'ACTIVE');
  assert.equal(rejected.state.finalizedResult, null);
});

test('the numeral seven stays domain-local across Road movement, straight progression, and terminal GOAL', () => {
  const movementState = {
    roadValueOf(card) {
      return card?.kind === 'road' ? card.value : null;
    },
    pathStepCountOf(path) {
      return path?.steps;
    },
    isPathLegal() {
      return true;
    },
    isPathStoppable() {
      return true;
    }
  };

  assert.equal(compatible({ id: 'road-6', kind: 'road', value: 6 }, { steps: 6 }, movementState), true);
  assert.equal(compatible({ id: 'road-7', kind: 'road', value: 7 }, { steps: 1 }, movementState), false);

  const participantIds = ['p1', 'p2', 'p3', 'p4'];
  const layout = createNewBaseGoalPathLayout({
    participantIds,
    horizontalCellCount: 12,
    shieldLinkedLaneColumnsByParticipant: {
      p1: [0, 1, 2],
      p2: [3, 4, 5],
      p3: [6, 7, 8],
      p4: [9, 10, 11]
    }
  });
  const straightCardIdsByColumn = Array.from({ length: 12 }, () => []);
  straightCardIdsByColumn[0] = Array.from({ length: 7 }, (_, index) => `p1-l0-${index + 1}`);
  const goalPath = projectNewBaseGoalPathConnections(layout, { straightCardIdsByColumn });

  assert.equal(goalPath.ok, true);
  assert.equal(goalPath.connectedGoalPaths.length, 1);
  assert.equal(goalPath.connectedGoalPaths[0].straightCardCount, 7);
  assert.equal(goalPath.connectedGoalPaths[0].connectedToGoal, true);
  assert.equal(goalPath.terminalWin, false);
  assert.equal(
    shouldForwardLegacySevenRoadWin({ rulesetIsNewBase: true, legacySevenRoadWin: true }),
    false
  );

  const initial = createNewBaseGoalTerminalState({ matchId: 'match-1' });
  const premature = applyAuthoritativeNewBaseGoalArrival(initial, {
    ...goalEvent(),
    type: 'ROAD_COMPLETED',
    roadCardCount: 7,
    roadComplete: true
  });
  assert.equal(premature.accepted, false);
  assert.equal(premature.reason, 'GOAL_REACHED_REQUIRED');
  assert.equal(premature.state.status, 'ACTIVE');

  const reached = applyAuthoritativeNewBaseGoalArrival(premature.state, goalEvent());
  assert.equal(reached.accepted, true);
  assert.equal(reached.reason, 'GOAL_ACCEPTED');
  assert.equal(reached.state.status, 'ENDED');
  assert.equal(reached.state.finalizedResult.terminalReason, 'GOAL_REACHED');
});

test('non-authoritative or cross-match GOAL facts fail closed', () => {
  const initial = createNewBaseGoalTerminalState({ matchId: 'match-1' });

  const untrusted = applyAuthoritativeNewBaseGoalArrival(
    initial,
    goalEvent({ authoritative: false })
  );
  assert.equal(untrusted.accepted, false);
  assert.equal(untrusted.reason, 'AUTHORITATIVE_FACT_REQUIRED');

  const wrongMatch = applyAuthoritativeNewBaseGoalArrival(
    initial,
    goalEvent({ matchId: 'match-other' })
  );
  assert.equal(wrongMatch.accepted, false);
  assert.equal(wrongMatch.reason, 'MATCH_ID_MISMATCH');
});

test('winner identity is caller-authoritative and no team, rank, or reward fields are invented', () => {
  const initial = createNewBaseGoalTerminalState({ matchId: 'match-1' });
  const accepted = applyAuthoritativeNewBaseGoalArrival(
    initial,
    goalEvent({ actorId: 'p4', winnerIds: ['p4', 'p3'] })
  );
  const result = accepted.state.finalizedResult;

  assert.deepEqual(result.winnerIds, ['p4', 'p3']);
  assert.equal(Object.hasOwn(result, 'teamId'), false);
  assert.equal(Object.hasOwn(result, 'ranking'), false);
  assert.equal(Object.hasOwn(result, 'rewards'), false);
  assert.equal(Object.hasOwn(result, 'roadCardCount'), false);
});

test('finalized GOAL result is handed unchanged to the existing Result presentation core', () => {
  const initial = createNewBaseGoalTerminalState({ matchId: 'match-1' });
  const accepted = applyAuthoritativeNewBaseGoalArrival(initial, goalEvent());

  const presentation = createNewBaseGoalResultPresentation(accepted.state, {
    presentationId: 'result-view-1',
    reducedMotion: true,
    assets: { character: true }
  });
  const projected = projectResultPresentation(presentation);

  assert.equal(projected.ok, true);
  assert.equal(projected.stage, 'enter');
  assert.deepEqual(projected.finalizedResult, accepted.state.finalizedResult);
});

test('invalid winner identities are rejected rather than inferred', () => {
  const initial = createNewBaseGoalTerminalState({ matchId: 'match-1' });

  const missing = applyAuthoritativeNewBaseGoalArrival(initial, goalEvent({ winnerIds: [] }));
  assert.equal(missing.accepted, false);
  assert.equal(missing.reason, 'WINNER_IDS_REQUIRED');

  const duplicated = applyAuthoritativeNewBaseGoalArrival(
    initial,
    goalEvent({ winnerIds: ['p1', 'p1'] })
  );
  assert.equal(duplicated.accepted, false);
  assert.equal(duplicated.reason, 'WINNER_IDS_REQUIRED');
});
