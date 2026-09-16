export const BATTLE_HIDDEN_HAND_SCHEMA = 'gameroad.battle-hidden-hand-core.v1';

export const BATTLE_HIDDEN_HAND_STATUS = Object.freeze({
  RESERVED: 'RESERVED',
  CONSUMED: 'CONSUMED',
});

export const BATTLE_HIDDEN_HAND_ROAD_SOURCE = Object.freeze({
  ORDINARY_HAND: 'ORDINARY_HAND',
  HIDDEN_HAND: 'HIDDEN_HAND',
});

function canonicalIdentity(value, name) {
  if (typeof value !== 'string' || value.length === 0 || value !== value.trim()) {
    throw new TypeError(`${name}_CANONICAL_IDENTITY_REQUIRED`);
  }
  return value;
}

function requiredFunction(value, name) {
  if (typeof value !== 'function') throw new TypeError(`${name}_FUNCTION_REQUIRED`);
  return value;
}

function freezeArray(values) {
  return Object.freeze([...values]);
}

function freezeState(value) {
  return Object.freeze(value);
}

function validateState(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    throw new TypeError('HIDDEN_HAND_STATE_REQUIRED');
  }
  if (state.schema !== BATTLE_HIDDEN_HAND_SCHEMA) {
    throw new TypeError('HIDDEN_HAND_STATE_SCHEMA_INVALID');
  }
  canonicalIdentity(state.ownerPlayerId, 'OWNER_PLAYER_ID');
  canonicalIdentity(state.reservedCardIdentity, 'RESERVED_CARD_IDENTITY');
  if (state.reservedCard == null || typeof state.reservedCard !== 'object') {
    throw new TypeError('RESERVED_PHYSICAL_CARD_REQUIRED');
  }
  if (!Object.values(BATTLE_HIDDEN_HAND_STATUS).includes(state.status)) {
    throw new TypeError('HIDDEN_HAND_STATUS_INVALID');
  }
  if (typeof state.reservationActive !== 'boolean'
    || typeof state.privilegeAvailable !== 'boolean'
    || typeof state.privilegeConsumed !== 'boolean') {
    throw new TypeError('HIDDEN_HAND_PRIVILEGE_FLAGS_INVALID');
  }
  if (state.status === BATTLE_HIDDEN_HAND_STATUS.RESERVED) {
    if (!state.reservationActive || !state.privilegeAvailable || state.privilegeConsumed) {
      throw new TypeError('HIDDEN_HAND_RESERVED_STATE_INCONSISTENT');
    }
  }
  if (state.status === BATTLE_HIDDEN_HAND_STATUS.CONSUMED) {
    if (state.reservationActive || state.privilegeAvailable || !state.privilegeConsumed) {
      throw new TypeError('HIDDEN_HAND_CONSUMED_STATE_INCONSISTENT');
    }
  }
  return state;
}

/**
 * Split one caller-selected physical ROAD card out of the caller-supplied normal
 * deck snapshot and establish the Hidden Hand reservation.
 *
 * Selection policy is deliberately outside this core. The caller supplies the
 * exact physical identity and the existing card-class predicate. The core never
 * chooses a card, infers ROAD-ness from card data, shuffles, draws, or writes a
 * deck/game state.
 */
export function allocateBattleHiddenHandReservation({
  ownerPlayerId,
  normalDeckCards,
  reservedCardIdentity,
  identityOf,
  isRoadCard,
} = {}) {
  canonicalIdentity(ownerPlayerId, 'OWNER_PLAYER_ID');
  canonicalIdentity(reservedCardIdentity, 'RESERVED_CARD_IDENTITY');
  if (!Array.isArray(normalDeckCards)) throw new TypeError('NORMAL_DECK_ARRAY_REQUIRED');
  requiredFunction(identityOf, 'IDENTITY_OF');
  requiredFunction(isRoadCard, 'IS_ROAD_CARD');

  let reservedCard = null;
  let reservedIndex = -1;
  let matches = 0;

  normalDeckCards.forEach((card, index) => {
    const identity = canonicalIdentity(identityOf(card), 'PHYSICAL_CARD_IDENTITY');
    if (identity === reservedCardIdentity) {
      matches += 1;
      reservedCard = card;
      reservedIndex = index;
    }
  });

  if (matches !== 1) throw new TypeError('EXACT_ONE_RESERVED_PHYSICAL_CARD_REQUIRED');
  if (isRoadCard(reservedCard) !== true) throw new TypeError('RESERVED_CARD_MUST_BE_ROAD');

  const remainingNormalDeckCards = normalDeckCards.filter((_, index) => index !== reservedIndex);
  const state = freezeState({
    schema: BATTLE_HIDDEN_HAND_SCHEMA,
    ownerPlayerId,
    status: BATTLE_HIDDEN_HAND_STATUS.RESERVED,
    reservedCardIdentity,
    reservedCard,
    reservationActive: true,
    privilegeAvailable: true,
    privilegeConsumed: false,
    ownerOnlyWhileReserved: true,
    cardClass: 'ROAD',
  });

  return Object.freeze({
    schema: BATTLE_HIDDEN_HAND_SCHEMA,
    state,
    reservedCard,
    remainingNormalDeckCards: freezeArray(remainingNormalDeckCards),
    selectionAuthority: false,
    deckAuthority: false,
    gameStateWrite: false,
  });
}

/**
 * Resolve one Road-source choice without creating a second hand/deck engine.
 * Hidden Hand and ordinary hand are mutually exclusive sources for one choice.
 * The exact reserved physical-card object is returned when Hidden Hand is used.
 */
export function resolveBattleHiddenHandRoadChoice({
  state,
  source,
  ordinaryCard = null,
  ordinaryCardIdentity = null,
} = {}) {
  const current = validateState(state);
  if (!Object.values(BATTLE_HIDDEN_HAND_ROAD_SOURCE).includes(source)) {
    throw new TypeError('ROAD_SOURCE_INVALID');
  }

  if (source === BATTLE_HIDDEN_HAND_ROAD_SOURCE.HIDDEN_HAND) {
    if (ordinaryCard !== null || ordinaryCardIdentity !== null) {
      throw new TypeError('ROAD_SOURCE_MUST_NOT_MIX_ORDINARY_AND_HIDDEN');
    }
    if (!current.reservationActive || !current.privilegeAvailable) {
      return Object.freeze({
        schema: BATTLE_HIDDEN_HAND_SCHEMA,
        ok: false,
        reason: 'HIDDEN_HAND_PRIVILEGE_UNAVAILABLE',
        source,
        card: null,
        physicalCardIdentity: null,
        consumesPrivilegeNow: false,
        gameStateWrite: false,
      });
    }
    return Object.freeze({
      schema: BATTLE_HIDDEN_HAND_SCHEMA,
      ok: true,
      reason: 'OK',
      source,
      card: current.reservedCard,
      physicalCardIdentity: current.reservedCardIdentity,
      consumesPrivilegeNow: false,
      gameStateWrite: false,
    });
  }

  if (ordinaryCard == null || typeof ordinaryCard !== 'object') {
    throw new TypeError('ORDINARY_ROAD_CARD_REQUIRED');
  }
  const identity = canonicalIdentity(ordinaryCardIdentity, 'ORDINARY_CARD_IDENTITY');
  if (identity === current.reservedCardIdentity) {
    throw new TypeError('RESERVED_PHYSICAL_CARD_CANNOT_BE_ORDINARY_SOURCE');
  }

  return Object.freeze({
    schema: BATTLE_HIDDEN_HAND_SCHEMA,
    ok: true,
    reason: 'OK',
    source,
    card: ordinaryCard,
    physicalCardIdentity: identity,
    consumesPrivilegeNow: false,
    gameStateWrite: false,
  });
}

/**
 * Consume the privilege only after the existing gameplay authority explicitly
 * confirms a legal Road commit of the exact reserved physical identity.
 * Staging, preview, invalid attempts, cancellation, and commits of other cards
 * cannot consume the privilege here.
 */
export function applyBattleHiddenHandAuthoritativeRoadCommit(state, {
  committedPhysicalCardIdentity,
  authoritativeLegalRoadCommit,
} = {}) {
  const current = validateState(state);
  const identity = canonicalIdentity(
    committedPhysicalCardIdentity,
    'COMMITTED_PHYSICAL_CARD_IDENTITY',
  );
  if (typeof authoritativeLegalRoadCommit !== 'boolean') {
    throw new TypeError('AUTHORITATIVE_LEGAL_ROAD_COMMIT_BOOLEAN_REQUIRED');
  }

  if (current.privilegeConsumed) {
    return Object.freeze({
      schema: BATTLE_HIDDEN_HAND_SCHEMA,
      state: current,
      reservedCard: current.reservedCard,
      privilegeConsumedNow: false,
      reason: 'ALREADY_CONSUMED',
      gameplayAuthority: false,
      gameStateWrite: false,
    });
  }

  if (!authoritativeLegalRoadCommit || identity !== current.reservedCardIdentity) {
    return Object.freeze({
      schema: BATTLE_HIDDEN_HAND_SCHEMA,
      state: current,
      reservedCard: current.reservedCard,
      privilegeConsumedNow: false,
      reason: authoritativeLegalRoadCommit ? 'OTHER_CARD_COMMITTED' : 'LEGAL_COMMIT_NOT_CONFIRMED',
      gameplayAuthority: false,
      gameStateWrite: false,
    });
  }

  const next = freezeState({
    ...current,
    status: BATTLE_HIDDEN_HAND_STATUS.CONSUMED,
    reservationActive: false,
    privilegeAvailable: false,
    privilegeConsumed: true,
  });

  return Object.freeze({
    schema: BATTLE_HIDDEN_HAND_SCHEMA,
    state: next,
    reservedCard: current.reservedCard,
    privilegeConsumedNow: true,
    reason: 'AUTHORITATIVE_LEGAL_RESERVED_ROAD_COMMIT',
    gameplayAuthority: false,
    gameStateWrite: false,
  });
}

/** Owner-only identity while the card remains reserved. */
export function projectBattleHiddenHandView(state, { viewerPlayerId } = {}) {
  const current = validateState(state);
  canonicalIdentity(viewerPlayerId, 'VIEWER_PLAYER_ID');
  const owner = viewerPlayerId === current.ownerPlayerId;
  const reserved = current.reservationActive;

  return Object.freeze({
    schema: BATTLE_HIDDEN_HAND_SCHEMA,
    owner,
    status: current.status,
    hasReservedCard: owner ? reserved : null,
    privilegeAvailable: owner ? current.privilegeAvailable : null,
    reservedCardIdentity: owner && reserved ? current.reservedCardIdentity : null,
    reservedCard: owner && reserved ? current.reservedCard : null,
    cardClass: owner && reserved ? 'ROAD' : null,
    identityPublic: false,
    gameStateWrite: false,
  });
}

/**
 * Reconnect/recovery never manufactures a fresh privilege. The caller's
 * authoritative state wins by identity; local optimistic state is discarded.
 */
export function reconcileBattleHiddenHandRecovery({ authoritativeState, localState = null } = {}) {
  const authoritative = validateState(authoritativeState);
  if (localState !== null) validateState(localState);
  return Object.freeze({
    schema: BATTLE_HIDDEN_HAND_SCHEMA,
    state: authoritative,
    discardedLocalState: localState !== null && localState !== authoritative,
    restoredPrivilege: false,
    gameplayAuthority: false,
    gameStateWrite: false,
  });
}

/**
 * Copies do not inherit Hidden Hand privilege: only the exact caller-authoritative
 * physical identity currently reserved by this state is eligible.
 */
export function hasBattleHiddenHandPrivilegeForPhysicalCard(state, physicalCardIdentity) {
  const current = validateState(state);
  const identity = canonicalIdentity(physicalCardIdentity, 'PHYSICAL_CARD_IDENTITY');
  return current.privilegeAvailable
    && current.reservationActive
    && identity === current.reservedCardIdentity;
}

export const BATTLE_HIDDEN_HAND_CONTRACT = Object.freeze({
  schema: BATTLE_HIDDEN_HAND_SCHEMA,
  reservedCardCount: 1,
  reservedCardClass: 'ROAD',
  reservationSource: 'CALLER_SELECTED_NORMAL_DECK_PHYSICAL_CARD',
  selectionAuthority: 'CALLER_ONLY',
  roadChoice: 'ORDINARY_HAND_OR_HIDDEN_HAND_NOT_BOTH',
  genericRoadManaCostAuthority: 'OUTSIDE_CORE_CURRENT_RULE_IS_ZERO',
  explicitAbilityCostAuthority: 'OUTSIDE_CORE_EXISTING_CARD_AUTHORITY',
  consumesPrivilegeOn: 'CALLER_CONFIRMED_AUTHORITATIVE_LEGAL_ROAD_COMMIT_OF_RESERVED_PHYSICAL_CARD',
  invalidOrUncommittedAttemptConsumes: false,
  recoveryRestoresPrivilege: false,
  copiedCardInheritsPrivilege: false,
  extraBuffs: false,
  extraRankRarityTeamRestrictions: false,
  ownerOnlyIdentityWhileReserved: true,
  choosesReservedCard: false,
  computesRoadLegality: false,
  computesManaCost: false,
  mutatesDeck: false,
  writesGameState: false,
  mutatesProductionHtml: false,
  ownsUi: false,
  ownsSave: false,
});
