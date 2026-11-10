const SCHEMA = 'gameroad.card-access-entitlement.v1';

export const CARD_ACCESS_STATUS = Object.freeze({
  OWNED: 'OWNED',
  SEASON_PASS: 'SEASON_PASS',
  FREE_TRIAL: 'FREE_TRIAL',
  LOCKED: 'LOCKED',
});

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function token(value, label = 'cardId') {
  if (typeof value !== 'string' || value.trim() === '' || value.trim() !== value) {
    throw new TypeError(`${label.toUpperCase()}_INVALID`);
  }
  return value;
}

function idSet(values, label) {
  if (values === undefined) return new Set();
  if (!Array.isArray(values)) throw new TypeError(`${label.toUpperCase()}_ARRAY_REQUIRED`);
  const out = new Set();
  for (const value of values) out.add(token(value, label));
  return out;
}

function normalizeGrant(value, label) {
  if (value === undefined) {
    return Object.freeze({ active: false, allCards: false, cardIds: new Set() });
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label.toUpperCase()}_OBJECT_REQUIRED`);
  }
  if (typeof value.active !== 'boolean') {
    throw new TypeError(`${label.toUpperCase()}_ACTIVE_BOOLEAN_REQUIRED`);
  }
  if (value.allCards !== undefined && typeof value.allCards !== 'boolean') {
    throw new TypeError(`${label.toUpperCase()}_ALLCARDS_BOOLEAN_REQUIRED`);
  }
  return Object.freeze({
    active: value.active,
    allCards: value.allCards === true,
    cardIds: idSet(value.cardIds, `${label}_cardId`),
  });
}

function normalizePolicy(policy = {}) {
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) {
    throw new TypeError('CARD_ACCESS_POLICY_OBJECT_REQUIRED');
  }
  return Object.freeze({
    ownedCardIds: idSet(policy.ownedCardIds, 'ownedCardId'),
    seasonPass: normalizeGrant(policy.seasonPass, 'season_pass'),
    freeTrial: normalizeGrant(policy.freeTrial, 'free_trial'),
  });
}

function granted(grant, cardId) {
  return grant.active === true && (grant.allCards === true || grant.cardIds.has(cardId));
}

function resolveNormalizedCardAccess(cardId, policy) {
  let status = CARD_ACCESS_STATUS.LOCKED;
  if (policy.ownedCardIds.has(cardId)) status = CARD_ACCESS_STATUS.OWNED;
  else if (granted(policy.seasonPass, cardId)) status = CARD_ACCESS_STATUS.SEASON_PASS;
  else if (granted(policy.freeTrial, cardId)) status = CARD_ACCESS_STATUS.FREE_TRIAL;

  return deepFreeze({
    schema: SCHEMA,
    cardId,
    status,
    usableForBattle: status !== CARD_ACCESS_STATUS.LOCKED,
    permanentOwnership: status === CARD_ACCESS_STATUS.OWNED,
    temporaryAccess:
      status === CARD_ACCESS_STATUS.SEASON_PASS ||
      status === CARD_ACCESS_STATUS.FREE_TRIAL,
  });
}

export function resolveCardAccess(cardIdInput, policyInput = {}) {
  const cardId = token(cardIdInput);
  return resolveNormalizedCardAccess(cardId, normalizePolicy(policyInput));
}

function deckCards(deck) {
  if (!deck || typeof deck !== 'object' || Array.isArray(deck)) {
    throw new TypeError('CARD_ACCESS_DECK_OBJECT_REQUIRED');
  }
  const zones = [];
  for (const zone of ['main', 'ex']) {
    const cards = deck[zone] ?? [];
    if (!Array.isArray(cards)) throw new TypeError(`CARD_ACCESS_DECK_${zone.toUpperCase()}_ARRAY_REQUIRED`);
    cards.forEach((cardId, index) => {
      zones.push(Object.freeze({ zone, index, cardId: token(cardId, `${zone}_cardId`) }));
    });
  }
  return zones;
}

export function evaluateDeckCardAccess(deck, policyInput = {}) {
  const policy = normalizePolicy(policyInput);
  const entries = deckCards(deck).map((entry) => {
    const access = resolveNormalizedCardAccess(entry.cardId, policy);
    return Object.freeze({
      ...entry,
      status: access.status,
      usableForBattle: access.usableForBattle,
      permanentOwnership: access.permanentOwnership,
      temporaryAccess: access.temporaryAccess,
    });
  });
  const lockedEntries = entries.filter((entry) => !entry.usableForBattle);
  const lockedCardIds = [...new Set(lockedEntries.map((entry) => entry.cardId))];

  return deepFreeze({
    schema: SCHEMA,
    ok: lockedEntries.length === 0,
    entries,
    lockedEntries,
    lockedCardIds,
    savedDeckMutationAllowed: false,
    ownershipMutationAllowed: false,
    purchaseAuthority: false,
    clockAuthority: 'CALLER',
  });
}

export const CARD_ACCESS_ENTITLEMENT_CONTRACT = Object.freeze({
  schema: SCHEMA,
  precedence: Object.freeze([
    CARD_ACCESS_STATUS.OWNED,
    CARD_ACCESS_STATUS.SEASON_PASS,
    CARD_ACCESS_STATUS.FREE_TRIAL,
    CARD_ACCESS_STATUS.LOCKED,
  ]),
  activeWindowAuthority: 'CALLER',
  seasonPassScopeAuthority: 'CALLER',
  freeTrialScopeAuthority: 'CALLER',
  ownershipMutationAllowed: false,
  purchaseAuthority: false,
  saveMutationAllowed: false,
  savedDeckMutationAllowed: false,
  matchStartGate: true,
});
