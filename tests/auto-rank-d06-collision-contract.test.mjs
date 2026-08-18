import test from 'node:test';
import assert from 'node:assert/strict';

import {
  D06_COLLISION_KIND,
  toD06ReservationFailure
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
