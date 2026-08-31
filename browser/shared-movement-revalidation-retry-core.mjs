import {
  evaluateH02PathHistoryForD06,
  toD06ReservationFailure
} from './auto-rank-d06-collision-contract.mjs';

export const MOVEMENT_REVALIDATION_STATUS = Object.freeze({
  CLEAR: 'CLEAR',
  D06_BLOCKED: 'D06_BLOCKED',
  INVALID_INPUT: 'INVALID_INPUT'
});

const EMPTY = Object.freeze([]);

/**
 * Revalidate one current mover against already-authoritative path histories.
 * Movement order/priority is intentionally external: callers supply only the
 * paths that are already relevant at this mover's just-before-resolution gate.
 * This function composes the existing D06 detector and never treats standing
 * occupancy/shared endpoints as a new collision class.
 */
export function revalidateMovementForD06(candidatePath, authoritativePriorPaths = EMPTY) {
  if (!Array.isArray(authoritativePriorPaths)) {
    return Object.freeze({
      valid: false,
      status: MOVEMENT_REVALIDATION_STATUS.INVALID_INPUT,
      blocked: false,
      conflicts: EMPTY
    });
  }

  const conflicts = [];
  for (let againstIndex = 0; againstIndex < authoritativePriorPaths.length; againstIndex += 1) {
    const evaluation = evaluateH02PathHistoryForD06(candidatePath, authoritativePriorPaths[againstIndex]);
    if (!evaluation.valid) {
      return Object.freeze({
        valid: false,
        status: MOVEMENT_REVALIDATION_STATUS.INVALID_INPUT,
        blocked: false,
        conflicts: Object.freeze(conflicts)
      });
    }
    for (const failure of evaluation.failures) {
      conflicts.push(Object.freeze({ againstIndex, failure }));
    }
  }

  const frozenConflicts = Object.freeze(conflicts);
  return Object.freeze({
    valid: true,
    status: conflicts.length
      ? MOVEMENT_REVALIDATION_STATUS.D06_BLOCKED
      : MOVEMENT_REVALIDATION_STATUS.CLEAR,
    blocked: conflicts.length > 0,
    conflicts: frozenConflicts
  });
}

/**
 * Build only the participant-local retry/repair envelope after a D06 failure.
 * The caller must supply the existing participant identity and the next
 * reservation revision; this layer invents neither a request id nor revision.
 * The frozen D06 failure contract remains the single source of side-effect
 * semantics (whole-move failure, start position kept, Honey/mana delta 0,
 * own reservation/ready repaired, other legal reservations preserved).
 */
export function buildD06ParticipantRetryDirective({
  participantId,
  collisionKind,
  nextReservationRevision
} = {}) {
  if (participantId === undefined || participantId === null) return null;
  if (nextReservationRevision === undefined || nextReservationRevision === null) return null;
  const failure = toD06ReservationFailure(collisionKind);
  if (!failure) return null;

  return Object.freeze({
    participantId,
    nextReservationRevision,
    failure
  });
}
