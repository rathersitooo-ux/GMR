import test from 'node:test';
import assert from 'node:assert/strict';

import { D06_COLLISION_KIND } from '../browser/auto-rank-d06-collision-contract.mjs';
import {
  MOVEMENT_REVALIDATION_STATUS,
  buildD06ParticipantRetryDirective,
  revalidateMovementForD06
} from '../browser/shared-movement-revalidation-retry-core.mjs';

const assertWholeMoveFailure = (failure, collisionKind) => {
  assert.deepEqual(failure, {
    ruleId: 'D06',
    applyReservation: false,
    keepStartPosition: true,
    honeyDelta: 0,
    manaDelta: 0,
    repairOwnReservation: true,
    repairOwnReady: true,
    preserveOtherLegalReservations: true,
    collisionKind
  });
};

test('revalidation composes existing D06 swap failure without adding priority policy', () => {
  const actual = revalidateMovementForD06(['A', 'B'], [['B', 'A']]);
  assert.equal(actual.valid, true);
  assert.equal(actual.status, MOVEMENT_REVALIDATION_STATUS.D06_BLOCKED);
  assert.equal(actual.blocked, true);
  assert.equal(actual.conflicts.length, 1);
  assert.equal(actual.conflicts[0].againstIndex, 0);
  assertWholeMoveFailure(actual.conflicts[0].failure, D06_COLLISION_KIND.SWAP);
  assert.equal('winner' in actual, false);
  assert.equal('priority' in actual, false);
  assert.equal('wait' in actual, false);
});

test('crossing and reverse-edge both inherit the same whole-move failure semantics', () => {
  const crossing = revalidateMovementForD06(
    ['S:P2:L', 'C:-1:1', 'C:0:1', 'C:1:1', 'S:P2:R'],
    [['S:P2:R', 'C:-1:1', 'C:-1:0', 'C:-1:-1']]
  );
  assertWholeMoveFailure(crossing.conflicts[0].failure, D06_COLLISION_KIND.CROSSING);

  const reverse = revalidateMovementForD06(
    ['A', 'X', 'Y', 'C'],
    [['D', 'Z', 'Y', 'X', 'E']]
  );
  assertWholeMoveFailure(reverse.conflicts[0].failure, D06_COLLISION_KIND.REVERSE_EDGE);
});

test('simple noncollision and shared endpoint stay clear; standing occupancy is not invented', () => {
  const simple = revalidateMovementForD06(['A', 'B', 'C'], [['D', 'E', 'F']]);
  assert.deepEqual(simple, {
    valid: true,
    status: MOVEMENT_REVALIDATION_STATUS.CLEAR,
    blocked: false,
    conflicts: []
  });

  const sharedEndpoint = revalidateMovementForD06(['A', 'B'], [['C', 'B']]);
  assert.equal(sharedEndpoint.status, MOVEMENT_REVALIDATION_STATUS.CLEAR);
  assert.equal(sharedEndpoint.blocked, false);
});

test('multiple prior paths are checked without choosing a winner or mutating their order', () => {
  const prior = [
    ['B', 'A'],
    ['D', 'E', 'F'],
    ['X', 'A', 'B', 'Y']
  ];
  const snapshot = structuredClone(prior);
  const actual = revalidateMovementForD06(['A', 'B'], prior);
  assert.equal(actual.blocked, true);
  assert.ok(actual.conflicts.length >= 1);
  assert.deepEqual(prior, snapshot);
  assert.equal('winner' in actual, false);
  assert.equal('priority' in actual, false);
});

test('invalid pair input fails closed without guessing a D06 collision', () => {
  const actual = revalidateMovementForD06(['A'], [['B', 'C']]);
  assert.equal(actual.valid, false);
  assert.equal(actual.status, MOVEMENT_REVALIDATION_STATUS.INVALID_INPUT);
  assert.equal(actual.blocked, false);
  assert.deepEqual(actual.conflicts, []);
});

test('retry directive reuses the frozen D06 failure and caller-supplied identity/revision', () => {
  const actual = buildD06ParticipantRetryDirective({
    participantId: 'P3',
    collisionKind: D06_COLLISION_KIND.REVERSE_EDGE,
    nextReservationRevision: 12
  });
  assert.equal(actual.participantId, 'P3');
  assert.equal(actual.nextReservationRevision, 12);
  assertWholeMoveFailure(actual.failure, D06_COLLISION_KIND.REVERSE_EDGE);
  assert.equal(Object.isFrozen(actual), true);
  assert.equal(Object.isFrozen(actual.failure), true);
});

test('retry directive never invents missing identity, revision, or collision semantics', () => {
  assert.equal(buildD06ParticipantRetryDirective({
    collisionKind: D06_COLLISION_KIND.CROSSING,
    nextReservationRevision: 2
  }), null);
  assert.equal(buildD06ParticipantRetryDirective({
    participantId: 'P1',
    collisionKind: D06_COLLISION_KIND.CROSSING
  }), null);
  assert.equal(buildD06ParticipantRetryDirective({
    participantId: 'P1',
    collisionKind: 'SAME_CELL',
    nextReservationRevision: 2
  }), null);
});
