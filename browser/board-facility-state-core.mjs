const SCHEMA = 'gameroad.board-facility-state.v1';

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function requireString(value, label) {
  if (!nonEmptyString(value)) throw new TypeError(`${label.toUpperCase()}_REQUIRED`);
  return value;
}

function requireAmount(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${label.toUpperCase()}_INVALID`);
  }
  return value;
}

function requireRound(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw new TypeError('ROUND_INVALID');
  return value;
}

function deepClone(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(deepClone);
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, deepClone(child)]));
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function cloneCard(card) {
  return { id: card.id, ownerId: card.ownerId };
}

function normalizeCard(card) {
  if (!card || typeof card !== 'object' || Array.isArray(card)) throw new TypeError('CARD_INVALID');
  return {
    id: requireString(card.id, 'cardId'),
    ownerId: requireString(card.ownerId, 'ownerId'),
  };
}

function cloneState(raw) {
  return {
    ...raw,
    permanent: deepClone(raw.permanent),
    availableCards: raw.availableCards.map(cloneCard),
    reservations: { ...raw.reservations },
    shopProducts: Object.fromEntries(Object.entries(raw.shopProducts).map(([id, product]) => [id, {
      cost: product.cost,
      grantCard: cloneCard(product.grantCard),
    }])),
    processedRequestIds: [...raw.processedRequestIds],
    processedBattleIds: [...raw.processedBattleIds],
    processedSettlementIds: [...raw.processedSettlementIds],
    pendingReturns: raw.pendingReturns.map(entry => ({ ...entry, card: cloneCard(entry.card) })),
    arenaPending: raw.arenaPending ? { ...raw.arenaPending, card: cloneCard(raw.arenaPending.card) } : null,
    arenaSettlement: raw.arenaSettlement ? { ...raw.arenaSettlement, card: cloneCard(raw.arenaSettlement.card) } : null,
  };
}

function freezeState(raw) {
  return deepFreeze(cloneState(raw));
}

function allRegionCards(state) {
  const cards = [];
  for (const card of state.availableCards) cards.push(['available', card]);
  for (const entry of state.pendingReturns) cards.push(['pending_return', entry.card]);
  if (state.arenaPending) cards.push(['arena_pending', state.arenaPending.card]);
  if (state.arenaSettlement) cards.push(['arena_settlement', state.arenaSettlement.card]);
  return cards;
}

function assertUniqueCardRegions(state) {
  const seen = new Map();
  for (const [region, card] of allRegionCards(state)) {
    const prior = seen.get(card.id);
    if (prior) throw new TypeError(`CARD_REGION_CONFLICT:${card.id}:${prior}:${region}`);
    seen.set(card.id, region);
  }
}

function assertUniqueStrings(values, label) {
  if (!Array.isArray(values) || values.some(value => !nonEmptyString(value)) || new Set(values).size !== values.length) {
    throw new TypeError(`${label}_INVALID`);
  }
}

function assertState(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) throw new TypeError('STATE_REQUIRED');
  if (state.schema !== SCHEMA) throw new TypeError('STATE_SCHEMA_UNSUPPORTED');
  requireString(state.playerId, 'playerId');
  requireRound(state.round);
  requireAmount(state.honey, 'honey');
  if (typeof state.matchActive !== 'boolean') throw new TypeError('MATCH_ACTIVE_INVALID');
  if (!state.permanent || typeof state.permanent !== 'object' || Array.isArray(state.permanent)) {
    throw new TypeError('PERMANENT_INVALID');
  }
  if (!Array.isArray(state.availableCards)) throw new TypeError('AVAILABLE_CARDS_INVALID');
  state.availableCards.forEach(normalizeCard);
  if (!state.reservations || typeof state.reservations !== 'object' || Array.isArray(state.reservations)) {
    throw new TypeError('RESERVATIONS_INVALID');
  }
  for (const [cardId, purpose] of Object.entries(state.reservations)) {
    requireString(cardId, 'reservationCardId');
    requireString(purpose, 'reservationPurpose');
  }
  requireString(state.shopCatalogRevision, 'shopCatalogRevision');
  requireString(state.arenaCatalogRevision, 'arenaCatalogRevision');
  if (!state.shopProducts || typeof state.shopProducts !== 'object' || Array.isArray(state.shopProducts)) {
    throw new TypeError('SHOP_PRODUCTS_INVALID');
  }
  for (const [productId, product] of Object.entries(state.shopProducts)) {
    requireString(productId, 'productId');
    if (!product || typeof product !== 'object' || Array.isArray(product)) throw new TypeError('SHOP_PRODUCT_INVALID');
    requireAmount(product.cost, 'productCost');
    normalizeCard(product.grantCard);
  }
  assertUniqueStrings(state.processedRequestIds, 'PROCESSED_REQUEST_IDS');
  assertUniqueStrings(state.processedBattleIds, 'PROCESSED_BATTLE_IDS');
  assertUniqueStrings(state.processedSettlementIds, 'PROCESSED_SETTLEMENT_IDS');
  if (!Array.isArray(state.pendingReturns)) throw new TypeError('PENDING_RETURNS_INVALID');
  for (const entry of state.pendingReturns) {
    if (!entry || typeof entry !== 'object') throw new TypeError('PENDING_RETURN_INVALID');
    if (entry.source !== 'shop') throw new TypeError('PENDING_RETURN_SOURCE_INVALID');
    normalizeCard(entry.card);
    requireRound(entry.eligibleRound);
  }
  if (state.arenaPending) {
    requireString(state.arenaPending.requestId, 'requestId');
    requireString(state.arenaPending.opponentRef, 'opponentRef');
    requireAmount(state.arenaPending.cost, 'arenaCost');
    normalizeCard(state.arenaPending.card);
    requireRound(state.arenaPending.depositedRound);
    if (!['deposited', 'prepared'].includes(state.arenaPending.stage)) throw new TypeError('ARENA_STAGE_INVALID');
    if (state.arenaPending.stage === 'prepared') requireString(state.arenaPending.battleId, 'battleId');
  }
  if (state.arenaSettlement) {
    requireString(state.arenaSettlement.battleId, 'battleId');
    normalizeCard(state.arenaSettlement.card);
    if (!['win', 'draw'].includes(state.arenaSettlement.outcome)) throw new TypeError('ARENA_OUTCOME_INVALID');
    requireRound(state.arenaSettlement.eligibleRound);
    if (state.arenaSettlement.outcome === 'win') requireString(state.arenaSettlement.rewardRef, 'rewardRef');
    if (state.arenaSettlement.outcome === 'draw' && state.arenaSettlement.rewardRef !== null) {
      throw new TypeError('DRAW_REWARD_FORBIDDEN');
    }
  }
  assertUniqueCardRegions(state);
  return state;
}

function decision(state, status, reason, effects = null) {
  return deepFreeze({ state, status, reason, effects: effects ? deepClone(effects) : null });
}

function cardExistsAnywhere(state, cardId) {
  return allRegionCards(state).some(([, card]) => card.id === cardId);
}

function exactRevision(actual, expected) {
  return Object.is(actual, expected);
}

function addProcessed(values, id) {
  return [...values, id];
}

function unresolvedArena(state) {
  return Boolean(state.arenaPending || state.arenaSettlement);
}

export function createBoardFacilityState({
  playerId,
  round,
  honey,
  matchActive = true,
  permanent = {},
  cards = [],
  reservations = {},
  shopCatalogRevision,
  shopProducts = {},
  arenaCatalogRevision,
} = {}) {
  requireString(playerId, 'playerId');
  requireRound(round);
  requireAmount(honey, 'honey');
  requireString(shopCatalogRevision, 'shopCatalogRevision');
  requireString(arenaCatalogRevision, 'arenaCatalogRevision');

  const normalizedProducts = {};
  for (const [productId, product] of Object.entries(shopProducts)) {
    requireString(productId, 'productId');
    normalizedProducts[productId] = {
      cost: requireAmount(product?.cost, 'productCost'),
      grantCard: normalizeCard(product?.grantCard),
    };
  }

  const state = {
    schema: SCHEMA,
    playerId,
    round,
    honey,
    matchActive,
    permanent: deepClone(permanent),
    availableCards: cards.map(normalizeCard),
    reservations: { ...reservations },
    shopCatalogRevision,
    shopProducts: normalizedProducts,
    arenaCatalogRevision,
    processedRequestIds: [],
    processedBattleIds: [],
    processedSettlementIds: [],
    pendingReturns: [],
    arenaPending: null,
    arenaSettlement: null,
  };
  return freezeState(assertState(state));
}

export function purchaseShopProduct(state, { requestId, catalogRevision, productId } = {}) {
  assertState(state);
  requireString(requestId, 'requestId');
  requireString(productId, 'productId');
  if (state.processedRequestIds.includes(requestId)) return decision(state, 'duplicate', 'REQUEST_ALREADY_APPLIED');
  if (!state.matchActive) return decision(state, 'rejected', 'MATCH_ENDED');
  if (!exactRevision(catalogRevision, state.shopCatalogRevision)) return decision(state, 'rejected', 'SHOP_CATALOG_REVISION_MISMATCH');

  const product = state.shopProducts[productId];
  if (!product) return decision(state, 'rejected', 'PRODUCT_NOT_REGISTERED');
  if (state.honey < product.cost) return decision(state, 'rejected', 'INSUFFICIENT_HONEY');
  if (cardExistsAnywhere(state, product.grantCard.id)) return decision(state, 'rejected', 'GRANT_CARD_ALREADY_EXISTS');

  const next = freezeState(assertState({
    ...cloneState(state),
    honey: state.honey - product.cost,
    processedRequestIds: addProcessed(state.processedRequestIds, requestId),
    pendingReturns: [...state.pendingReturns, {
      source: 'shop',
      card: cloneCard(product.grantCard),
      eligibleRound: state.round + 1,
    }],
  }));
  return decision(next, 'accepted', 'PURCHASE_COMMITTED');
}

export function beginFacilityRound(state, { round } = {}) {
  assertState(state);
  requireRound(round);
  if (round <= state.round) return decision(state, 'ignored', 'ROUND_NOT_ADVANCED');

  const releasable = state.pendingReturns.filter(entry => entry.eligibleRound <= round);
  const waiting = state.pendingReturns.filter(entry => entry.eligibleRound > round);
  const next = freezeState(assertState({
    ...cloneState(state),
    round,
    pendingReturns: waiting,
    availableCards: [...state.availableCards, ...releasable.map(entry => cloneCard(entry.card))],
  }));
  return decision(next, 'accepted', 'ROUND_ADVANCED', {
    releasedCardIds: releasable.map(entry => entry.card.id),
  });
}

export function depositArenaCard(state, {
  requestId,
  catalogRevision,
  opponentRef,
  cardId,
  cost,
} = {}) {
  assertState(state);
  requireString(requestId, 'requestId');
  requireString(opponentRef, 'opponentRef');
  requireString(cardId, 'cardId');
  requireAmount(cost, 'arenaCost');
  if (state.processedRequestIds.includes(requestId)) return decision(state, 'duplicate', 'REQUEST_ALREADY_APPLIED');
  if (!state.matchActive) return decision(state, 'rejected', 'MATCH_ENDED');
  if (!exactRevision(catalogRevision, state.arenaCatalogRevision)) return decision(state, 'rejected', 'ARENA_CATALOG_REVISION_MISMATCH');
  if (unresolvedArena(state)) return decision(state, 'rejected', 'ARENA_ALREADY_UNRESOLVED');

  const card = state.availableCards.find(entry => entry.id === cardId);
  if (!card) return decision(state, 'rejected', 'CARD_NOT_AVAILABLE');
  if (card.ownerId !== state.playerId) return decision(state, 'rejected', 'CARD_NOT_OWNED');
  const reservation = state.reservations[cardId];
  if (reservation && reservation !== 'arena') return decision(state, 'rejected', 'CARD_RESERVED_ELSEWHERE');
  if (state.honey < cost) return decision(state, 'rejected', 'INSUFFICIENT_HONEY');

  const next = freezeState(assertState({
    ...cloneState(state),
    honey: state.honey - cost,
    availableCards: state.availableCards.filter(entry => entry.id !== cardId),
    processedRequestIds: addProcessed(state.processedRequestIds, requestId),
    arenaPending: {
      requestId,
      opponentRef,
      cost,
      card: cloneCard(card),
      depositedRound: state.round,
      stage: 'deposited',
      battleId: null,
    },
  }));
  return decision(next, 'accepted', 'ARENA_DEPOSIT_COMMITTED');
}

export function prepareArenaBattle(state, { requestId, battleId, success } = {}) {
  assertState(state);
  requireString(requestId, 'requestId');
  if (!state.arenaPending) return decision(state, 'ignored', 'NO_ARENA_DEPOSIT');
  if (state.arenaPending.requestId !== requestId) return decision(state, 'ignored', 'REQUEST_ID_MISMATCH');
  if (state.arenaPending.stage !== 'deposited') return decision(state, 'ignored', 'ARENA_ALREADY_PREPARED');

  if (success !== true) {
    const pending = state.arenaPending;
    const next = freezeState(assertState({
      ...cloneState(state),
      honey: state.honey + pending.cost,
      availableCards: [...state.availableCards, cloneCard(pending.card)],
      arenaPending: null,
    }));
    return decision(next, 'failed', 'BATTLE_PREPARATION_FAILED_ROLLED_BACK');
  }

  requireString(battleId, 'battleId');
  if (state.processedBattleIds.includes(battleId)) return decision(state, 'duplicate', 'BATTLE_ALREADY_APPLIED');
  const next = freezeState(assertState({
    ...cloneState(state),
    arenaPending: { ...state.arenaPending, stage: 'prepared', battleId },
  }));
  return decision(next, 'accepted', 'BATTLE_PREPARED');
}

export function resolveArenaBattle(state, { battleId, outcome, rewardRef = null } = {}) {
  assertState(state);
  requireString(battleId, 'battleId');
  if (state.processedBattleIds.includes(battleId)) return decision(state, 'duplicate', 'BATTLE_ALREADY_APPLIED');
  if (!state.arenaPending || state.arenaPending.stage !== 'prepared') return decision(state, 'ignored', 'NO_PREPARED_ARENA_BATTLE');
  if (state.arenaPending.battleId !== battleId) return decision(state, 'ignored', 'BATTLE_ID_MISMATCH');
  if (!['win', 'draw'].includes(outcome)) throw new TypeError('OUTCOME_INVALID');
  if (outcome === 'win') requireString(rewardRef, 'rewardRef');
  if (outcome !== 'win' && rewardRef !== null) throw new TypeError('REWARD_REF_FORBIDDEN');

  const pending = state.arenaPending;
  const common = {
    ...cloneState(state),
    processedBattleIds: addProcessed(state.processedBattleIds, battleId),
    arenaPending: null,
  };

  const next = freezeState(assertState({
    ...common,
    arenaSettlement: {
      battleId,
      card: cloneCard(pending.card),
      outcome,
      rewardRef: outcome === 'win' ? rewardRef : null,
      eligibleRound: state.round + 1,
    },
  }));
  return decision(next, 'accepted', outcome === 'win' ? 'ARENA_WIN_WAITING_NEXT_ROUND' : 'ARENA_DRAW_WAITING_NEXT_ROUND');
}

export function settleArena(state, { settlementId } = {}) {
  assertState(state);
  requireString(settlementId, 'settlementId');
  if (state.processedSettlementIds.includes(settlementId)) return decision(state, 'duplicate', 'SETTLEMENT_ALREADY_APPLIED');
  if (!state.arenaSettlement) return decision(state, 'ignored', 'NO_ARENA_SETTLEMENT');
  if (state.round < state.arenaSettlement.eligibleRound) return decision(state, 'rejected', 'SETTLEMENT_TOO_EARLY');

  const settlement = state.arenaSettlement;
  const next = freezeState(assertState({
    ...cloneState(state),
    availableCards: [...state.availableCards, cloneCard(settlement.card)],
    processedSettlementIds: addProcessed(state.processedSettlementIds, settlementId),
    arenaSettlement: null,
  }));
  return decision(next, 'accepted', 'ARENA_SETTLED', {
    returnedCardId: settlement.card.id,
    rewardRef: settlement.outcome === 'win' ? settlement.rewardRef : null,
  });
}

export function endFacilityMatch(state) {
  assertState(state);
  if (!state.matchActive) return decision(state, 'ignored', 'MATCH_ALREADY_ENDED');
  const next = freezeState(assertState({
    ...cloneState(state),
    matchActive: false,
    pendingReturns: [],
    arenaPending: null,
    arenaSettlement: null,
  }));
  return decision(next, 'accepted', 'MATCH_ENDED_TRANSIENT_FACILITY_STATE_CLEARED');
}

export const BOARD_FACILITY_STATE_CORE = Object.freeze({ schema: SCHEMA });
