const SCHEMA = 'gameroad.battle-janken-invalidated-return-boundary.v1';

function requiredString(value, field) {
  if (typeof value !== 'string' || value.trim() !== value || value.length === 0) {
    throw new TypeError(`${field}_NON_EMPTY_CANONICAL_STRING_REQUIRED`);
  }
  return value;
}

function requiredArray(value, field) {
  if (!Array.isArray(value)) throw new TypeError(`${field}_ARRAY_REQUIRED`);
  return value;
}

function freezeArray(values) {
  return Object.freeze([...values]);
}

function indexHands(hands) {
  const byPlayer = new Map();
  for (const [index, entry] of requiredArray(hands, 'HANDS').entries()) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new TypeError(`HANDS_${index}_OBJECT_REQUIRED`);
    }
    const playerId = requiredString(entry.playerId, `HANDS_${index}_PLAYER_ID`);
    if (byPlayer.has(playerId)) throw new TypeError('DUPLICATE_HAND_PLAYER_ID');
    const physicalCardIds = requiredArray(entry.physicalCardIds, `HANDS_${index}_PHYSICAL_CARD_IDS`)
      .map((cardId, cardIndex) => requiredString(cardId, `HANDS_${index}_PHYSICAL_CARD_IDS_${cardIndex}`));
    if (new Set(physicalCardIds).size !== physicalCardIds.length) {
      throw new TypeError('DUPLICATE_PHYSICAL_CARD_IN_HAND');
    }
    byPlayer.set(playerId, physicalCardIds);
  }
  return byPlayer;
}

function indexReservations(reservations) {
  const byPlayer = new Map();
  const physicalOwners = new Map();
  for (const [index, entry] of requiredArray(reservations, 'RESERVATIONS').entries()) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new TypeError(`RESERVATIONS_${index}_OBJECT_REQUIRED`);
    }
    const playerId = requiredString(entry.playerId, `RESERVATIONS_${index}_PLAYER_ID`);
    const physicalCardId = requiredString(entry.physicalCardId, `RESERVATIONS_${index}_PHYSICAL_CARD_ID`);
    if (byPlayer.has(playerId)) throw new TypeError('DUPLICATE_RESERVATION_PLAYER_ID');
    if (physicalOwners.has(physicalCardId)) throw new TypeError('DUPLICATE_RESERVED_PHYSICAL_CARD_ID');
    byPlayer.set(playerId, physicalCardId);
    physicalOwners.set(physicalCardId, playerId);
  }
  return byPlayer;
}

function invalidatedPlayerIds(resolverResult) {
  if (!resolverResult || typeof resolverResult !== 'object' || Array.isArray(resolverResult)) {
    throw new TypeError('RESOLVER_RESULT_OBJECT_REQUIRED');
  }
  const ids = requiredArray(resolverResult.invalidated, 'RESOLVER_INVALIDATED')
    .map((playerId, index) => requiredString(playerId, `RESOLVER_INVALIDATED_${index}`));
  if (new Set(ids).size !== ids.length) throw new TypeError('DUPLICATE_INVALIDATED_PLAYER_ID');
  return ids;
}

/**
 * Projects the current user-fixed post-comparison disposition for INVALIDATED
 * janken cards without owning the triad resolver or authoritative game-state write.
 *
 * The caller supplies the exact physical-card reservation lineage. INVALIDATED
 * is transient: after comparison the same physical card returns from the
 * janken-reserved zone to that player's hand. Already-authoritative movement is
 * deliberately outside this projection and is never rolled back here.
 */
export function projectInvalidatedJankenReturnToHand({
  resolverResult,
  reservations,
  hands,
} = {}) {
  const invalidated = invalidatedPlayerIds(resolverResult);
  const reservationByPlayer = indexReservations(reservations);
  const handByPlayer = indexHands(hands);

  const nextHandByPlayer = new Map();
  for (const [playerId, cards] of handByPlayer.entries()) nextHandByPlayer.set(playerId, [...cards]);

  const returns = [];
  for (const playerId of invalidated) {
    if (!handByPlayer.has(playerId)) throw new TypeError('INVALIDATED_PLAYER_HAND_REQUIRED');
    const physicalCardId = reservationByPlayer.get(playerId);
    if (!physicalCardId) throw new TypeError('INVALIDATED_PLAYER_RESERVATION_REQUIRED');
    const nextHand = nextHandByPlayer.get(playerId);
    if (nextHand.includes(physicalCardId)) {
      throw new TypeError('RESERVED_PHYSICAL_CARD_ALREADY_IN_HAND');
    }
    nextHand.push(physicalCardId);
    returns.push(Object.freeze({
      playerId,
      physicalCardId,
      fromZone: 'JANKEN_RESERVED',
      toZone: 'HAND',
      reason: 'INVALIDATED_COMPARISON_RESOLVED',
    }));
  }

  const nextHands = hands.map((entry) => Object.freeze({
    playerId: entry.playerId,
    physicalCardIds: freezeArray(nextHandByPlayer.get(entry.playerId)),
  }));

  return Object.freeze({
    schema: SCHEMA,
    invalidatedState: 'TRANSIENT_COMPARISON_RESULT_ONLY',
    returns: freezeArray(returns),
    nextHands: freezeArray(nextHands),
    movementRollback: false,
    resolverOwnedHere: false,
    gameStateWrite: false,
  });
}

export const BATTLE_JANKEN_INVALIDATED_RETURN_CONTRACT = Object.freeze({
  schema: SCHEMA,
  invalidatedState: 'TRANSIENT_COMPARISON_RESULT_ONLY',
  defaultDisposition: 'RETURN_SAME_PHYSICAL_CARD_TO_HAND_AFTER_COMPARISON',
  physicalCardLineageAuthority: 'CALLER',
  resolverAuthority: 'EXISTING_TRIAD_RESOLVER',
  movementRollback: false,
  gameStateWrite: false,
});
