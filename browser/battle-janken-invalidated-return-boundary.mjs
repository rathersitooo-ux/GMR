export const BATTLE_JANKEN_INVALIDATED_RETURN_SCHEMA = 'gameroad.battle-janken-invalidated-return-boundary.v1';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function canonicalId(value) {
  if (typeof value !== 'string' || value.length === 0 || value.trim() !== value) return null;
  return value;
}

function canonicalIdentity(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const playerId = canonicalId(value.playerId);
  const cardId = canonicalId(value.cardId);
  return playerId && cardId ? Object.freeze({ playerId, cardId }) : null;
}

function canonicalDistinctIds(value) {
  if (!Array.isArray(value)) return null;
  const ids = [];
  const seen = new Set();
  for (const candidate of value) {
    const id = canonicalId(candidate);
    if (!id || seen.has(id)) return null;
    seen.add(id);
    ids.push(id);
  }
  return Object.freeze(ids);
}

function baseResult({ playerId = null, cardId = null, reason }) {
  return {
    schema: BATTLE_JANKEN_INVALIDATED_RETURN_SCHEMA,
    playerId,
    cardId,
    reason,
    samePhysicalCard: cardId !== null,
    movementRollback: false,
    resolverWrite: false,
    turnOrderWrite: false,
  };
}

function denied(reason, identity = null) {
  return deepFreeze({
    ...baseResult({
      playerId: identity?.playerId ?? null,
      cardId: identity?.cardId ?? null,
      reason,
    }),
    ok: false,
    eligible: false,
    returned: false,
  });
}

/**
 * Projects whether one exact physical janken card may return to one exact
 * player's hand after the authoritative processing-order resolver has already
 * invalidated that player.
 *
 * This boundary deliberately does not resolve janken, invent card identity,
 * roll back board movement, select targets, or mutate hand/game state. The
 * caller must supply both the exact selection lineage and the resolver result.
 */
export function projectBattleJankenInvalidatedReturn({
  resolverResult,
  request,
  selection,
  handCardIds = [],
  returnedCardIds = [],
} = {}) {
  const identity = canonicalIdentity(request);
  if (!identity) return denied('INVALID_RETURN_IDENTITY');

  const lineage = canonicalIdentity(selection);
  if (!lineage) return denied('INVALID_SELECTION_LINEAGE', identity);
  if (lineage.playerId !== identity.playerId || lineage.cardId !== identity.cardId) {
    return denied('SELECTION_LINEAGE_MISMATCH', identity);
  }

  if (!resolverResult || typeof resolverResult !== 'object' || Array.isArray(resolverResult)) {
    return denied('INVALID_RESOLVER_RESULT', identity);
  }
  const invalidatedPlayerIds = canonicalDistinctIds(resolverResult.invalidated);
  if (!invalidatedPlayerIds) return denied('INVALID_RESOLVER_RESULT', identity);
  if (!invalidatedPlayerIds.includes(identity.playerId)) {
    return denied('PLAYER_NOT_INVALIDATED', identity);
  }

  const currentHandCardIds = canonicalDistinctIds(handCardIds);
  if (!currentHandCardIds) return denied('INVALID_HAND_MEMBERSHIP', identity);
  const priorReturnedCardIds = canonicalDistinctIds(returnedCardIds);
  if (!priorReturnedCardIds) return denied('INVALID_RETURN_HISTORY', identity);

  if (currentHandCardIds.includes(identity.cardId)) {
    return denied('CARD_ALREADY_IN_HAND', identity);
  }
  if (priorReturnedCardIds.includes(identity.cardId)) {
    return denied('CARD_ALREADY_RETURNED', identity);
  }

  return deepFreeze({
    ...baseResult({
      playerId: identity.playerId,
      cardId: identity.cardId,
      reason: 'AUTHORITATIVE_INVALIDATED_RETURN_ALLOWED',
    }),
    ok: true,
    eligible: true,
    returned: false,
    action: 'RETURN_SAME_PHYSICAL_CARD_TO_HAND',
    invalidatedPlayerIds,
  });
}

/**
 * Creates a thin fail-closed executor around the pure projection above.
 * `returnCardToHand` is the existing caller-owned hand authority. A successful
 * physical card identity is delegated at most once for the lifetime of this
 * boundary instance, even when caller readback is temporarily stale.
 */
export function createBattleJankenInvalidatedReturnBoundary({
  readContext,
  returnCardToHand,
} = {}) {
  if (typeof readContext !== 'function') throw new TypeError('readContext must be a function');
  if (typeof returnCardToHand !== 'function') throw new TypeError('returnCardToHand must be a function');

  const completedKeys = new Set();
  const inFlightKeys = new Set();

  async function returnInvalidated(request) {
    const identity = canonicalIdentity(request);
    if (!identity) return denied('INVALID_RETURN_IDENTITY');
    const key = `${identity.playerId}\u0000${identity.cardId}`;

    if (completedKeys.has(key)) return denied('BOUNDARY_ALREADY_RETURNED', identity);
    if (inFlightKeys.has(key)) return denied('RETURN_IN_FLIGHT', identity);
    inFlightKeys.add(key);

    try {
      let context;
      try {
        context = await readContext(Object.freeze({ ...identity }));
      } catch {
        return denied('AUTHORITY_READ_ERROR', identity);
      }
      if (!context || typeof context !== 'object' || Array.isArray(context)) {
        return denied('INVALID_AUTHORITY_CONTEXT', identity);
      }

      const projection = projectBattleJankenInvalidatedReturn({
        resolverResult: context.resolverResult,
        request: identity,
        selection: context.selection,
        handCardIds: context.handCardIds,
        returnedCardIds: context.returnedCardIds,
      });
      if (!projection.eligible) return projection;

      const delegation = deepFreeze({
        schema: BATTLE_JANKEN_INVALIDATED_RETURN_SCHEMA,
        playerId: identity.playerId,
        cardId: identity.cardId,
        reason: 'JANKEN_INVALIDATED',
        samePhysicalCard: true,
        movementRollback: false,
      });

      let accepted;
      try {
        accepted = await returnCardToHand(delegation);
      } catch {
        return denied('RETURN_AUTHORITY_ERROR', identity);
      }
      if (accepted !== true) return denied('RETURN_AUTHORITY_REJECTED', identity);

      completedKeys.add(key);
      return deepFreeze({
        ...baseResult({
          playerId: identity.playerId,
          cardId: identity.cardId,
          reason: 'RETURNED_BY_EXISTING_HAND_AUTHORITY',
        }),
        ok: true,
        eligible: true,
        returned: true,
        action: 'RETURN_SAME_PHYSICAL_CARD_TO_HAND',
      });
    } finally {
      inFlightKeys.delete(key);
    }
  }

  return Object.freeze({
    schema: BATTLE_JANKEN_INVALIDATED_RETURN_SCHEMA,
    returnInvalidated,
  });
}
