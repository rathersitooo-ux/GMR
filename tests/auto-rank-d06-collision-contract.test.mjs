import test from 'node:test';
import assert from 'node:assert/strict';

import {
  D06_COLLISION_KIND,
  D06_NORMALIZED_EVENT_KIND,
  toD06ReservationFailure,
  toD06ReservationFailureFromNormalizedEvent
} from '../browser/auto-rank-d06-collision-contract.mjs';

const expectedBase = {
  ruleId: 'D06',
  applyReservation: false,
  keepStartPosition: true,
  honeyDelta: 0,
  manaDelta: 0,
  repairOwnReservation: true,
  repairOwnReady: true,
  preserveOtherLegalReservations: true
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
