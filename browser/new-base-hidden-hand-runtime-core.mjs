const SCHEMA = 'gameroad.new-base.hidden-hand-runtime.v2';

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function assertRuntime(runtime) {
  if (!runtime || typeof runtime !== 'object' || Array.isArray(runtime) || runtime.schema !== SCHEMA) {
    throw new TypeError('HIDDEN_HAND_RUNTIME_INVALID');
  }
  if (!nonEmptyString(runtime.reservedCardId)) throw new TypeError('HIDDEN_HAND_RESERVED_CARD_ID_INVALID');
  if (typeof runtime.hiddenPrivilegeAvailable !== 'boolean') throw new TypeError('HIDDEN_HAND_PRIVILEGE_STATE_INVALID');
  if (runtime.source !== 'match-start-snapshot') throw new TypeError('HIDDEN_HAND_RUNTIME_SOURCE_INVALID');
  return runtime;
}

/**
 * Converts the already-authoritative match-start snapshot into the minimal
 * owner-side hidden-Road runtime state. This is identity/privilege state only:
 * it does not choose the card, stage it, decide legality, or resolve combat.
 */
export function createNewBaseHiddenHandRuntime(matchStartSnapshot) {
  const deck = matchStartSnapshot?.deck;
  if (!deck || typeof deck !== 'object' || Array.isArray(deck)) {
    throw new TypeError('HIDDEN_HAND_MATCH_START_DECK_REQUIRED');
  }
  const ids = deck.hiddenHandCardIds;
  if (!Array.isArray(ids) || ids.length !== 1 || !nonEmptyString(ids[0])) {
    throw new TypeError('HIDDEN_HAND_MATCH_START_REGISTRATION_REQUIRED');
  }
  const reservedCardId = ids[0].trim();
  if (!Array.isArray(deck.main) || !deck.main.includes(reservedCardId)) {
    throw new TypeError('HIDDEN_HAND_RESERVED_CARD_NOT_IN_MAIN_DECK');
  }
  return deepFreeze({
    schema: SCHEMA,
    source: 'match-start-snapshot',
    reservedCardId,
    hiddenPrivilegeAvailable: true,
  });
}

export function projectNewBaseHiddenHandAddContext(runtime) {
  const current = assertRuntime(runtime);
  return deepFreeze({
    reservedCardId: current.reservedCardId,
    hiddenPrivilegeAvailable: current.hiddenPrivilegeAvailable,
  });
}

/**
 * The caller must supply evidence that the same reserved Road became an
 * authoritative legal Road commit. Button press/staging is intentionally not
 * accepted as consumption evidence.
 */
export function consumeNewBaseHiddenHandPrivilege(runtime, {
  cardId,
  authoritativeLegalRoadCommit = false,
} = {}) {
  const current = assertRuntime(runtime);
  const exactCardId = nonEmptyString(cardId) ? cardId.trim() : null;
  if (current.hiddenPrivilegeAvailable !== true) {
    return deepFreeze({ accepted: false, reason: 'already-consumed', runtime: current });
  }
  if (authoritativeLegalRoadCommit !== true) {
    return deepFreeze({ accepted: false, reason: 'authoritative-road-commit-required', runtime: current });
  }
  if (exactCardId !== current.reservedCardId) {
    return deepFreeze({ accepted: false, reason: 'reserved-card-mismatch', runtime: current });
  }
  const next = deepFreeze({ ...current, hiddenPrivilegeAvailable: false });
  return deepFreeze({ accepted: true, reason: 'authoritative-hidden-road-commit', runtime: next });
}

export const NEW_BASE_HIDDEN_HAND_RUNTIME = Object.freeze({ schema: SCHEMA });
