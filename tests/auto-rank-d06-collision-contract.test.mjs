import test from 'node:test';
import assert from 'node:assert/strict';

import {
  D06_COLLISION_KIND,
  D06_NORMALIZED_EVENT_KIND,
  classifyH02PathHistory,
  evaluateH02PathHistoryForD06,
  toD06ReservationFailure,
  toD06ReservationFailureFromNormalizedEvent
} from '../browser/auto-rank-d06-collision-contract.mjs';

const expectedBase = {
  ruleId: 'D06', applyReservation: false, keepStartPosition: true,
  honeyDelta: 0, manaDelta: 0, repairOwnReservation: true,
  repairOwnReady: true, preserveOtherLegalReservations: true
};

test('all frozen D06 collision kinds map to the same reservation-failure semantics', () => {
  for (const collisionKind of Object.values(D06_COLLISION_KIND)) {
    const actual = toD06ReservationFailure(collisionKind);
    assert.deepEqual(actual, { ...expectedBase, collisionKind });
    assert.equal(Object.isFrozen(actual), true);
  }
});

test('mapping is deterministic across repeated evaluation', () => {
  const first = toD06ReservationFailure(D06_COLLISION_KIND.CROSSING);
  const second = toD06ReservationFailure(D06_COLLISION_KIND.CROSSING);
  assert.deepEqual(first, second);
  assert.notEqual(first, second);
});

test('unknown or absent detector results are not misclassified as D06', () => {
  assert.equal(toD06ReservationFailure('SAME_CELL'), null);
  assert.equal(toD06ReservationFailure(''), null);
  assert.equal(toD06ReservationFailure(undefined), null);
});

test('normalized H02 detector events map to the existing D06 collision contract', () => {
  const cases = [
    [D06_NORMALIZED_EVENT_KIND.PATH_CROSSING_NODE, D06_COLLISION_KIND.CROSSING],
    [D06_NORMALIZED_EVENT_KIND.POSITION_SWAP, D06_COLLISION_KIND.SWAP],
    [D06_NORMALIZED_EVENT_KIND.REVERSE_EDGE_PASSAGE, D06_COLLISION_KIND.REVERSE_EDGE]
  ];
  for (const [normalizedEventKind, collisionKind] of cases) {
    const actual = toD06ReservationFailureFromNormalizedEvent(normalizedEventKind);
    assert.deepEqual(actual, { ...expectedBase, collisionKind });
    assert.equal(Object.isFrozen(actual), true);
  }
});

test('non-H02 normalized labels fail closed instead of being guessed into D06', () => {
  assert.equal(toD06ReservationFailureFromNormalizedEvent('SAME_START'), null);
  assert.equal(toD06ReservationFailureFromNormalizedEvent('SHARED_ENDPOINT'), null);
  assert.equal(toD06ReservationFailureFromNormalizedEvent(''), null);
  assert.equal(toD06ReservationFailureFromNormalizedEvent(undefined), null);
});

test('direct two-node endpoint swap normalizes to POSITION_SWAP only', () => {
  const actual = classifyH02PathHistory(['A', 'B'], ['B', 'A']);
  assert.equal(actual.valid, true);
  assert.equal(actual.rawFacets.positionSwap, true);
  assert.equal(actual.rawFacets.reverseEdgePassages.length, 1);
  assert.deepEqual(actual.normalizedEvents, [D06_NORMALIZED_EVENT_KIND.POSITION_SWAP]);
});

test('reverse directed edge suppresses crossing overlap at its endpoints', () => {
  const actual = classifyH02PathHistory(['A', 'X', 'Y', 'C'], ['D', 'Z', 'Y', 'X', 'E']);
  assert.equal(actual.rawFacets.reverseEdgePassages.length, 1);
  assert.ok(actual.rawFacets.pathCrossingNodes.some(({ node }) => node === 'X' || node === 'Y'));
  assert.deepEqual(actual.normalizedEvents, [D06_NORMALIZED_EVENT_KIND.REVERSE_EDGE_PASSAGE]);
});

test('different local-neighbor pair at a shared interior node emits PATH_CROSSING_NODE', () => {
  const actual = classifyH02PathHistory(
    ['S:P2:L', 'C:-1:1', 'C:0:1', 'C:1:1', 'S:P2:R'],
    ['S:P2:R', 'C:-1:1', 'C:-1:0', 'C:-1:-1']
  );
  assert.equal(actual.rawFacets.reverseEdgePassages.length, 0);
  assert.deepEqual(actual.normalizedEvents, [D06_NORMALIZED_EVENT_KIND.PATH_CROSSING_NODE]);
});

test('same local-neighbor pair at a shared interior node is not a crossing', () => {
  const actual = classifyH02PathHistory(
    ['A', 'X', 'B', 'C'],
    ['D', 'A', 'X', 'B', 'E']
  );
  assert.equal(actual.rawFacets.pathCrossingNodes.length, 0);
  assert.deepEqual(actual.normalizedEvents, []);
});

test('same-start and shared endpoint stay outside H02 normalization', () => {
  assert.deepEqual(classifyH02PathHistory(['S', 'A', 'B'], ['S', 'C', 'D']).normalizedEvents, []);
  assert.deepEqual(classifyH02PathHistory(['A', 'B'], ['C', 'B']).normalizedEvents, []);
});

test('invalid path input fails closed without a collision guess', () => {
  const cases = [[null, ['A','B']], [['A'], ['A','B']], [['A',''], ['B','A']], [['A',2], ['B','A']]];
  for (const [first, second] of cases) {
    const actual = classifyH02PathHistory(first, second);
    assert.equal(actual.valid, false);
    assert.deepEqual(actual.normalizedEvents, []);
    assert.deepEqual(evaluateH02PathHistoryForD06(first, second).failures, []);
  }
});

test('two-path detector feeds only the frozen D06 failure contract', () => {
  const actual = evaluateH02PathHistoryForD06(
    ['C:1:0', 'C:1:-1'],
    ['S:P1:L', 'C:1:-1', 'C:1:0', 'C:1:1']
  );
  assert.equal(actual.valid, true);
  assert.deepEqual(actual.classification.normalizedEvents, [D06_NORMALIZED_EVENT_KIND.REVERSE_EDGE_PASSAGE]);
  assert.deepEqual(actual.failures, [{ ...expectedBase, collisionKind: D06_COLLISION_KIND.REVERSE_EDGE }]);
  assert.equal(Object.isFrozen(actual.failures[0]), true);
});
