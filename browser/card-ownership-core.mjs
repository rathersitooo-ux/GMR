export const CARD_OWNERSHIP_SCHEMA = 'gameroad.card-ownership.v1';
export const CARD_CATALOG_SCHEMA = 'gameroad.card-catalog.current.v1';

const HARD_BATTLE_BLOCK_STATES = Object.freeze(new Set([
  'public_blocked',
  'defined_non_battle',
  'content_incomplete',
]));

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function normalizeStringList(value, label, { allowEmpty = true } = {}) {
  if (!Array.isArray(value)) throw new TypeError(`${label}_REQUIRED`);
  if (!allowEmpty && value.length === 0) throw new TypeError(`${label}_REQUIRED`);
  return value.map((entry) => {
    if (!nonEmptyString(entry)) throw new TypeError(`${label}_INVALID`);
    return entry;
  });
}

function normalizeCatalog(catalog) {
  if (!catalog || typeof catalog !== 'object' || Array.isArray(catalog)) {
    throw new TypeError('CATALOG_REQUIRED');
  }
  if (catalog.schema !== CARD_CATALOG_SCHEMA) throw new TypeError('CATALOG_SCHEMA_UNSUPPORTED');
  if (!Array.isArray(catalog.cards) || catalog.cards.length === 0) throw new TypeError('CATALOG_CARDS_REQUIRED');

  const byId = new Map();
  for (const raw of catalog.cards) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !nonEmptyString(raw.cardId)) {
      throw new TypeError('CATALOG_CARD_INVALID');
    }
    if (byId.has(raw.cardId)) throw new TypeError(`CATALOG_CARD_DUPLICATE:${raw.cardId}`);
    byId.set(raw.cardId, raw);
  }
  return { catalog, byId };
}

function validateKnownIds(ids, byId, label) {
  const unknown = [...new Set(ids.filter((id) => !byId.has(id)))];
  if (unknown.length) throw new RangeError(`${label}_UNKNOWN:${unknown.join(',')}`);
}

function freezeOwnershipState(raw) {
  return deepFreeze({
    schema: CARD_OWNERSHIP_SCHEMA,
    ownedCardIds: [...raw.ownedCardIds],
    appliedGrantIds: [...raw.appliedGrantIds],
  });
}

function assertOwnershipState(state, catalogInfo) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) throw new TypeError('OWNERSHIP_STATE_REQUIRED');
  if (state.schema !== CARD_OWNERSHIP_SCHEMA) throw new TypeError('OWNERSHIP_SCHEMA_UNSUPPORTED');
  const ownedCardIds = normalizeStringList(state.ownedCardIds, 'OWNED_CARD_IDS');
  const appliedGrantIds = normalizeStringList(state.appliedGrantIds, 'APPLIED_GRANT_IDS');
  if (new Set(appliedGrantIds).size !== appliedGrantIds.length) throw new TypeError('APPLIED_GRANT_IDS_DUPLICATE');
  validateKnownIds(ownedCardIds, catalogInfo.byId, 'OWNED_CARD_IDS');
  return { ownedCardIds, appliedGrantIds };
}

function countIds(ids) {
  const counts = new Map();
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  return counts;
}

function availabilityFor(card) {
  if (card.state === 'public_blocked') {
    return deepFreeze({ registered: true, publicAllowed: false, battleAllowed: false, reason: 'card-public-blocked' });
  }
  if (card.state === 'defined_non_battle') {
    return deepFreeze({ registered: true, publicAllowed: true, battleAllowed: false, reason: 'card-non-battle' });
  }
  if (card.state === 'content_incomplete') {
    return deepFreeze({ registered: true, publicAllowed: false, battleAllowed: false, reason: 'card-incomplete' });
  }
  return deepFreeze({ registered: true, publicAllowed: true, battleAllowed: true, reason: 'ok' });
}

export function createCardOwnershipState({ ownedCardIds = [], appliedGrantIds = [] } = {}, catalog) {
  const info = normalizeCatalog(catalog);
  const normalizedOwned = normalizeStringList(ownedCardIds, 'OWNED_CARD_IDS');
  const normalizedGrants = normalizeStringList(appliedGrantIds, 'APPLIED_GRANT_IDS');
  validateKnownIds(normalizedOwned, info.byId, 'OWNED_CARD_IDS');
  if (new Set(normalizedGrants).size !== normalizedGrants.length) throw new TypeError('APPLIED_GRANT_IDS_DUPLICATE');
  return freezeOwnershipState({ ownedCardIds: normalizedOwned, appliedGrantIds: normalizedGrants });
}

export function projectCardOwnership(catalog, state) {
  const info = normalizeCatalog(catalog);
  const normalized = assertOwnershipState(state, info);
  const counts = countIds(normalized.ownedCardIds);
  const cards = info.catalog.cards.map((raw) => {
    const ownedCount = counts.get(raw.cardId) ?? 0;
    return deepFreeze({
      ...cloneJson(raw),
      owned: ownedCount > 0,
      ownership: ownedCount > 0 ? 'owned' : 'unowned',
      ownedCount,
      availability: availabilityFor(raw),
    });
  });
  return deepFreeze({
    schema: CARD_OWNERSHIP_SCHEMA,
    catalogSchema: info.catalog.schema,
    totalCards: cards.length,
    ownedDistinctCount: cards.filter((card) => card.owned).length,
    unownedDistinctCount: cards.filter((card) => !card.owned).length,
    ownedCopyCount: normalized.ownedCardIds.length,
    cards,
  });
}

export function getOwnedCardCount(state, cardId, catalog) {
  if (!nonEmptyString(cardId)) throw new TypeError('CARD_ID_REQUIRED');
  const info = normalizeCatalog(catalog);
  const normalized = assertOwnershipState(state, info);
  if (!info.byId.has(cardId)) throw new RangeError(`CARD_UNKNOWN:${cardId}`);
  return normalized.ownedCardIds.reduce((count, id) => count + (id === cardId ? 1 : 0), 0);
}

export function getCardAvailability(catalog, cardId) {
  if (!nonEmptyString(cardId)) throw new TypeError('CARD_ID_REQUIRED');
  const info = normalizeCatalog(catalog);
  const card = info.byId.get(cardId);
  if (!card) throw new RangeError(`CARD_UNKNOWN:${cardId}`);
  return availabilityFor(card);
}

export function applyConfirmedOwnershipGrant(state, grant = {}, catalog) {
  const info = normalizeCatalog(catalog);
  const normalized = assertOwnershipState(state, info);
  if (!nonEmptyString(grant.grantId)) throw new TypeError('GRANT_ID_REQUIRED');

  if (normalized.appliedGrantIds.includes(grant.grantId)) {
    return deepFreeze({
      accepted: true,
      duplicate: true,
      reason: 'GRANT_ALREADY_APPLIED',
      state,
      awardedCardIds: [],
    });
  }

  if (grant.confirmed !== true) {
    return deepFreeze({
      accepted: false,
      duplicate: false,
      reason: 'GRANT_NOT_CONFIRMED',
      state,
      awardedCardIds: [],
    });
  }

  const cardIds = normalizeStringList(grant.cardIds, 'GRANT_CARD_IDS', { allowEmpty: false });
  const unknown = [...new Set(cardIds.filter((id) => !info.byId.has(id)))];
  if (unknown.length) {
    return deepFreeze({
      accepted: false,
      duplicate: false,
      reason: 'GRANT_CARD_UNKNOWN',
      unknownCardIds: unknown,
      state,
      awardedCardIds: [],
    });
  }

  const next = freezeOwnershipState({
    ownedCardIds: [...normalized.ownedCardIds, ...cardIds],
    appliedGrantIds: [...normalized.appliedGrantIds, grant.grantId],
  });
  return deepFreeze({
    accepted: true,
    duplicate: false,
    reason: 'GRANT_APPLIED',
    state: next,
    awardedCardIds: [...cardIds],
  });
}

export function createOwnedCardDeckGuard(state, catalog) {
  const info = normalizeCatalog(catalog);
  const normalized = assertOwnershipState(state, info);
  const counts = countIds(normalized.ownedCardIds);

  return ({ cardId } = {}) => {
    if (!nonEmptyString(cardId)) return Object.freeze({ ok: false, reason: 'card-id-invalid' });
    const card = info.byId.get(cardId);
    if (!card) return Object.freeze({ ok: false, reason: 'card-unknown' });

    const availability = availabilityFor(card);
    if (!availability.battleAllowed) {
      return Object.freeze({ ok: false, reason: availability.reason });
    }
    if ((counts.get(cardId) ?? 0) <= 0) {
      return Object.freeze({ ok: false, reason: 'card-unowned' });
    }
    return Object.freeze({ ok: true, reason: 'ok' });
  };
}

export const CARD_OWNERSHIP_POLICY = deepFreeze({
  createsSaveAuthority: false,
  createsGrantAuthority: false,
  hardBattleBlockStates: [...HARD_BATTLE_BLOCK_STATES],
  authoritativeInput: 'ownedCardIds',
});
