export const NEW_BASE_GOAL_ROUTE_REASON = Object.freeze({
  ROAD_INCOMPLETE: 'ROAD_INCOMPLETE',
  ROAD_COMPLETE: 'ROAD_COMPLETE',
});

function assertRoadComplete(value) {
  if (typeof value !== 'boolean') {
    throw new TypeError('roadComplete must be a boolean supplied by the authoritative ROAD completion owner');
  }
}

function assertGoalRoute(goalRoute) {
  if (goalRoute === null || goalRoute === undefined) {
    throw new TypeError('goalRoute must be supplied by the authoritative board graph owner');
  }
}

/**
 * Thin new-base policy gate between authoritative ROAD completion and a
 * caller-supplied GOAL route.
 *
 * This module deliberately does not:
 * - count ROAD_SLOT entries or decide what "ROAD complete" means;
 * - derive player/team/Shield ownership;
 * - resolve movement, path legality, winner, or Result state.
 *
 * Those responsibilities remain with their existing or dedicated owners.
 */
export function deriveNewBaseGoalRouteAvailability({ roadComplete, goalRoute } = {}) {
  assertRoadComplete(roadComplete);
  assertGoalRoute(goalRoute);

  const goalRouteOpen = roadComplete;

  return Object.freeze({
    roadComplete,
    goalRouteOpen,
    availableGoalRoute: goalRouteOpen ? goalRoute : null,
    reason: goalRouteOpen
      ? NEW_BASE_GOAL_ROUTE_REASON.ROAD_COMPLETE
      : NEW_BASE_GOAL_ROUTE_REASON.ROAD_INCOMPLETE,
  });
}
