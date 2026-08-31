import test from 'node:test';
import assert from 'node:assert/strict';

import {
  NEW_BASE_GOAL_ROUTE_REASON,
  deriveNewBaseGoalRouteAvailability,
} from '../browser/new-base-goal-route-unlock-core.mjs';

test('incomplete ROAD keeps the caller-supplied GOAL route closed', () => {
  const goalRoute = Object.freeze({ routeId: 'goal-route-authority-owned' });
  const result = deriveNewBaseGoalRouteAvailability({
    roadComplete: false,
    goalRoute,
  });

  assert.deepEqual(result, {
    roadComplete: false,
    goalRouteOpen: false,
    availableGoalRoute: null,
    reason: NEW_BASE_GOAL_ROUTE_REASON.ROAD_INCOMPLETE,
  });
});

test('authoritative ROAD completion opens exactly the supplied GOAL route', () => {
  const goalRoute = Object.freeze({ routeId: 'goal-route-authority-owned', edges: ['opaque'] });
  const result = deriveNewBaseGoalRouteAvailability({
    roadComplete: true,
    goalRoute,
  });

  assert.equal(result.roadComplete, true);
  assert.equal(result.goalRouteOpen, true);
  assert.strictEqual(result.availableGoalRoute, goalRoute);
  assert.equal(result.reason, NEW_BASE_GOAL_ROUTE_REASON.ROAD_COMPLETE);
});

test('the gate trusts the upstream completion signal and never recounts ROAD slots', () => {
  const routeWithMisleadingMetadata = Object.freeze({
    routeId: 'opaque-route',
    roadSlotCount: 0,
    arbitraryNestedState: { claimedCount: 999 },
  });

  const opened = deriveNewBaseGoalRouteAvailability({
    roadComplete: true,
    goalRoute: routeWithMisleadingMetadata,
  });
  const closed = deriveNewBaseGoalRouteAvailability({
    roadComplete: false,
    goalRoute: Object.freeze({ routeId: 'other-route', roadSlotCount: 7 }),
  });

  assert.equal(opened.goalRouteOpen, true);
  assert.strictEqual(opened.availableGoalRoute, routeWithMisleadingMetadata);
  assert.equal(closed.goalRouteOpen, false);
  assert.equal(closed.availableGoalRoute, null);
});

test('ROAD completion does not produce winner or Result semantics', () => {
  const result = deriveNewBaseGoalRouteAvailability({
    roadComplete: true,
    goalRoute: 'goal-route-id',
  });

  assert.equal(Object.hasOwn(result, 'winner'), false);
  assert.equal(Object.hasOwn(result, 'result'), false);
  assert.equal(Object.hasOwn(result, 'resultState'), false);
  assert.equal(Object.hasOwn(result, 'movementBudget'), false);
});

test('goal route identity and ownership remain opaque caller inputs', () => {
  const goalRoute = Object.freeze({
    routeId: 'route-x',
    owner: Object.freeze({ undecidedAuthorityPayload: true }),
  });

  const result = deriveNewBaseGoalRouteAvailability({ roadComplete: true, goalRoute });

  assert.strictEqual(result.availableGoalRoute, goalRoute);
  assert.deepEqual(goalRoute, {
    routeId: 'route-x',
    owner: { undecidedAuthorityPayload: true },
  });
});

test('missing or non-boolean completion authority fails closed', () => {
  for (const roadComplete of [undefined, null, 0, 1, 'true']) {
    assert.throws(
      () => deriveNewBaseGoalRouteAvailability({ roadComplete, goalRoute: 'goal-route-id' }),
      /roadComplete must be a boolean/,
    );
  }
});

test('missing GOAL graph mapping fails closed instead of inventing one', () => {
  for (const goalRoute of [undefined, null]) {
    assert.throws(
      () => deriveNewBaseGoalRouteAvailability({ roadComplete: true, goalRoute }),
      /goalRoute must be supplied/,
    );
  }
});
