export const NEW_BASE_HAND3_UNIFORM_ASSIGNMENT_POLICY_SCHEMA =
  'gameroad.new-base-hand3-uniform-assignment-policy.v1';

export const NEW_BASE_HAND3_UNIFORM_PERMUTATION_COUNT = 6;

const JANKEN_HAND_ORDER = Object.freeze(['ROCK', 'SCISSORS', 'PAPER']);
const PERMUTATIONS = Object.freeze([
  Object.freeze([0, 1, 2]),
  Object.freeze([0, 2, 1]),
  Object.freeze([1, 0, 2]),
  Object.freeze([1, 2, 0]),
  Object.freeze([2, 0, 1]),
  Object.freeze([2, 1, 0]),
]);
const UINT32_RANGE = 0x1_0000_0000;
const UINT32_MAX = 0xffff_ffff;
const UNIFORM_ACCEPT_LIMIT = UINT32_RANGE - (UINT32_RANGE % NEW_BASE_HAND3_UNIFORM_PERMUTATION_COUNT);
const MAX_REJECTION_ATTEMPTS = 64;

function requireCanonicalString(value, label) {
  if (typeof value !== 'string' || value.trim() !== value || value.length === 0) {
    throw new TypeError(`${label} must be a non-empty canonical string`);
  }
  return value;
}

function canonicalPhysicalCardIds(handCardIds) {
  if (!Array.isArray(handCardIds) || handCardIds.length !== 3) {
    throw new RangeError('handCardIds must contain exactly 3 physical card ids');
  }
  const ids = handCardIds.map((cardId, index) => requireCanonicalString(
    cardId,
    `handCardIds[${index}]`,
  ));
  if (new Set(ids).size !== 3) {
    throw new RangeError('handCardIds must contain 3 distinct physical card ids');
  }

  // Canonical identity order is used only to enumerate all six permutations.
  // Every permutation is equiprobable, so card id, native suit, printed number,
  // and player-facing hand order receive no weighting or slot privilege.
  return Object.freeze([...ids].sort((left, right) => (
    left < right ? -1 : left > right ? 1 : 0
  )));
}

function requirePermutationIndex(value) {
  if (!Number.isSafeInteger(value) || value < 0 || value >= NEW_BASE_HAND3_UNIFORM_PERMUTATION_COUNT) {
    throw new RangeError('permutationIndex must be an integer in [0, 5]');
  }
  return value;
}

/**
 * Converts one authoritative uniform permutation index into the exact
 * ROCK/SCISSORS/PAPER -> physical-card mapping for the current three-card hand.
 *
 * This function is deterministic and order-invariant: reordering the same three
 * source card ids cannot change the mapping for a given permutation index.
 */
export function resolveUniformHand3AssignmentFromPermutationIndex({
  assignmentEpochId,
  handCardIds,
  permutationIndex,
} = {}) {
  const epoch = requireCanonicalString(assignmentEpochId, 'assignmentEpochId');
  const canonicalCardIds = canonicalPhysicalCardIds(handCardIds);
  const index = requirePermutationIndex(permutationIndex);
  const permutation = PERMUTATIONS[index];
  const assignedCardIdsByJankenHand = Object.freeze(Object.fromEntries(
    JANKEN_HAND_ORDER.map((jankenHand, slotIndex) => [
      jankenHand,
      canonicalCardIds[permutation[slotIndex]],
    ]),
  ));

  return Object.freeze({
    schema: NEW_BASE_HAND3_UNIFORM_ASSIGNMENT_POLICY_SCHEMA,
    assignmentEpochId: epoch,
    permutationIndex: index,
    canonicalCardIds,
    assignedCardIdsByJankenHand,
  });
}

/**
 * Draws an exactly-uniform value in [0,5] from an authoritative uint32 source.
 * Rejection sampling removes modulo bias. The caller owns the entropy source;
 * Math.random and render-time entropy are intentionally not used here.
 */
export function drawUniformHand3PermutationIndex(readUint32) {
  if (typeof readUint32 !== 'function') {
    throw new TypeError('readUint32 must be an authoritative uint32 source');
  }

  for (let attempt = 0; attempt < MAX_REJECTION_ATTEMPTS; attempt += 1) {
    const value = readUint32();
    if (!Number.isSafeInteger(value) || value < 0 || value > UINT32_MAX) {
      throw new RangeError('readUint32 must return an integer in [0, 4294967295]');
    }
    if (value < UNIFORM_ACCEPT_LIMIT) {
      return value % NEW_BASE_HAND3_UNIFORM_PERMUTATION_COUNT;
    }
  }
  throw new RangeError('authoritative uint32 source did not yield an acceptable uniform sample');
}

/**
 * Creates the delegated current-new-base hand3 mapping once for one authoritative
 * assignment epoch. The returned mapping is meant to be passed directly to the
 * existing CURRENT_HAND3_POLICY validator/snapshot core.
 *
 * Same-turn redraw/reconnect stability remains owned by that existing immutable
 * snapshot. Callers must not invoke this function again while that snapshot is
 * still current.
 */
export function createUniformHand3Assignment({
  assignmentEpochId,
  handCardIds,
  readUint32,
} = {}) {
  const permutationIndex = drawUniformHand3PermutationIndex(readUint32);
  return resolveUniformHand3AssignmentFromPermutationIndex({
    assignmentEpochId,
    handCardIds,
    permutationIndex,
  });
}
