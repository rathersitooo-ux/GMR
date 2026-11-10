import { createRoundStartJankenSlotAssignment } from './new-base-round-start-janken-slot-assignment-core.mjs';

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

function drawUniformIndex(size, readUint32) {
  const limit = UINT32_RANGE - (UINT32_RANGE % size);
  for (let n=0;n<MAX_REJECTION_ATTEMPTS;n++) {
    const value=readUint32();
    if (!Number.isSafeInteger(value)||value<0||value>UINT32_MAX) throw new RangeError('readUint32 must return uint32');
    if(value<limit)return value%size;
  }
  throw new RangeError('uniform sample unavailable');
}

/** Initial-seven compatibility entry; the post-draw receipt owns the result. */
export function ensureOpeningJankenAssignment(options={}) {
  const receipt=options.currentSnapshot?.openingSelection;
  if(receipt?.selectionEpochId!==options.selectionEpochId && options.hand?.length!==7)throw new RangeError('opening hand must contain exactly 7 physical cards');
  return ensureDrawAssignment({...options,receiptKind:'openingSelection'});
}

/** Called once by the existing match authority AFTER its draw/refill completes. */
export function ensurePostDrawJankenAssignment(options={}) {
  return ensureDrawAssignment({...options,receiptKind:'postDrawSelection'});
}

function ensureDrawAssignment({selectionEpochId,roundId,hand,currentSnapshot=null,readUint32,receiptKind}) {
  const epoch=requireCanonicalString(selectionEpochId,'selectionEpochId');
  requireCanonicalString(roundId,'roundId');
  const receipt=currentSnapshot?.[receiptKind];
  if(receipt?.selectionEpochId===epoch) {
    if(currentSnapshot.roundId!==roundId)throw new RangeError('assignment round identity mismatch');
    if(Object.isFrozen(currentSnapshot))return currentSnapshot;
    return drawSnapshot(roundId,receipt.sourceCards,receipt.selectedCardIds,receipt.permutationIndex,epoch,receiptKind);
  }
  if(!Array.isArray(hand)||hand.length<3)throw new RangeError('post-draw hand must contain at least 3 physical cards');
  const cards=hand.map((c,i)=>Object.freeze({id:requireCanonicalString(c?.id,`hand[${i}].id`),suit:requireCanonicalString(c?.suit,`hand[${i}].suit`)}));
  if(new Set(cards.map(c=>c.id)).size!==cards.length)throw new RangeError('physical card ids must be distinct');
  if(typeof readUint32!=='function')throw new TypeError('authoritative readUint32 required');
  const pool=[...cards];
  for(let i=0;i<3;i++) {
    const j=i+drawUniformIndex(pool.length-i,readUint32);
    [pool[i],pool[j]]=[pool[j],pool[i]];
  }
  return drawSnapshot(roundId,cards,pool.slice(0,3).map(c=>c.id),drawUniformHand3PermutationIndex(readUint32),epoch,receiptKind);
}

function drawSnapshot(roundId,sourceCards,selectedCardIds,permutationIndex,selectionEpochId,receiptKind) {
  if(!Array.isArray(sourceCards)||sourceCards.length<3||new Set(sourceCards.map(c=>c.id)).size!==sourceCards.length)throw new RangeError('saved source must have at least 3 distinct cards');
  if(receiptKind==='openingSelection'&&sourceCards.length!==7)throw new RangeError('saved opening source must have 7 distinct cards');
  const selected=new Set(selectedCardIds);
  if(selected.size!==3||selectedCardIds.length!==3||[...selected].some(id=>!sourceCards.some(c=>c.id===id)))throw new RangeError('saved selection must contain three source identities');
  const mapping=resolveUniformHand3AssignmentFromPermutationIndex({assignmentEpochId:selectionEpochId,handCardIds:selectedCardIds,permutationIndex});
  const base=createRoundStartJankenSlotAssignment({roundId,hand:sourceCards.filter(c=>selected.has(c.id)),assignmentMode:'CURRENT_HAND3_POLICY',assignedCardIdsByJankenHand:mapping.assignedCardIdsByJankenHand});
  const source=Object.freeze(sourceCards.map(c=>Object.freeze({id:c.id,suit:c.suit})));
  return Object.freeze({...base,assignmentEpochId:selectionEpochId,
    sourceHandCardIds:Object.freeze(source.map(c=>c.id)),
    ordinaryHandCardIds:Object.freeze(source.filter(c=>!selected.has(c.id)).map(c=>c.id)),
    [receiptKind]:Object.freeze({selectionEpochId,sourceCards:source,selectedCardIds:Object.freeze([...selectedCardIds]),permutationIndex}),
  });
}
