export const D06_COLLISION_KIND = Object.freeze({
  CROSSING: 'CROSSING',
  SWAP: 'SWAP',
  REVERSE_EDGE: 'REVERSE_EDGE'
});

export const D06_NORMALIZED_EVENT_KIND = Object.freeze({
  PATH_CROSSING_NODE: 'PATH_CROSSING_NODE',
  POSITION_SWAP: 'POSITION_SWAP',
  REVERSE_EDGE_PASSAGE: 'REVERSE_EDGE_PASSAGE'
});

const D06_KINDS = new Set(Object.values(D06_COLLISION_KIND));

const D06_NORMALIZED_EVENT_TO_COLLISION_KIND = new Map([
  [D06_NORMALIZED_EVENT_KIND.PATH_CROSSING_NODE, D06_COLLISION_KIND.CROSSING],
  [D06_NORMALIZED_EVENT_KIND.POSITION_SWAP, D06_COLLISION_KIND.SWAP],
  [D06_NORMALIZED_EVENT_KIND.REVERSE_EDGE_PASSAGE, D06_COLLISION_KIND.REVERSE_EDGE]
]);

const D06_FAILURE_BASE = Object.freeze({
  ruleId: 'D06',
  applyReservation: false,
  keepStartPosition: true,
  honeyDelta: 0,
  manaDelta: 0,
  repairOwnReservation: true,
  repairOwnReady: true,
  preserveOtherLegalReservations: true
});

/**
 * Translate a detector-proven path-history collision into the frozen D06
 * reservation-failure contract. This module deliberately does not choose
 * winners, seat priority, RNG, fairness thresholds, movement distance, or a
 * retry policy; those remain owned by their formal runtime authorities.
 *
 * @param {string} collisionKind
 * @returns {Readonly<object>|null}
 */
export function toD06ReservationFailure(collisionKind) {
  if (!D06_KINDS.has(collisionKind)) {
    return null;
  }

  return Object.freeze({
    ...D06_FAILURE_BASE,
    collisionKind
  });
}

/**
 * Accept the normalized H02 detector vocabulary already fixed by CURRENT and
 * translate it into the existing D06 reservation-failure contract. Labels
 * outside the three adopted H02 classes fail closed rather than being guessed
 * into D06.
 *
 * @param {string} normalizedEventKind
 * @returns {Readonly<object>|null}
 */
export function toD06ReservationFailureFromNormalizedEvent(normalizedEventKind) {
  const collisionKind = D06_NORMALIZED_EVENT_TO_COLLISION_KIND.get(normalizedEventKind);
  return collisionKind ? toD06ReservationFailure(collisionKind) : null;
}
