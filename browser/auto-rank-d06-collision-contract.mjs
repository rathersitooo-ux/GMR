export const D06_COLLISION_KIND = Object.freeze({
  CROSSING: 'CROSSING',
  SWAP: 'SWAP',
  REVERSE_EDGE: 'REVERSE_EDGE'
});

const D06_KINDS = new Set(Object.values(D06_COLLISION_KIND));

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
