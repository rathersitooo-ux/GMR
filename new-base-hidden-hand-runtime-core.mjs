import { DECK_HIDDEN_HAND_REGISTRATION_SCHEMA } from './deck-hidden-hand-registration-core.mjs';

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

function assertRegistrationSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    throw new TypeError('HIDDEN_HAND_REGISTRATION_SNAPSHOT_REQUIRED');
  }
  if (snapshot.schema !== DECK_HIDDEN_HAND_REGISTRATION_SCHEMA) {
    throw new TypeError('HIDDEN_HAND_REGISTRATION_SNAPSHOT_SCHEMA_UNSUPPORTED');
  }
  if (!nonEmptyString(snapshot.cardId)) {
    throw new TypeError('HIDDEN_HAND_REGISTRATION_CARD_ID_INVALID');
  }
  if (!Array.isArray(snapshot.sourceMainCardIds) ||
      snapshot.sourceMainCardIds.some((cardId) => !nonEmptyString(cardId))) {
    throw new TypeError('HIDDEN_HAND_REGISTRATION_SOURCE_MAIN_INVALID');
  }
  if (!snapshot.sourceMainCardIds.includes(snapshot.cardId)) {
    throw new TypeError('HIDDEN_HAND_REGISTRATION_CARD_NOT_IN_SOURCE_MAIN');
  }
  return snapshot;
}

function assertRuntime(runtime) {
  if (!runtime || typeof runtime !== 'object' || Array.isArray(runtime) || runtime.schema !== SCHEMA) {
    throw new TypeError('HIDDEN_HAND_RUNTIME_INVALID');
  }
  if (!nonEmptyString(runtime.reservedCardId)) throw new TypeError('HIDDEN_HAND_RESERVED_CARD_ID_INVALID');
  if (typeof runtime.hiddenPrivilegeAvailable !== 'boolean') throw new TypeError('HIDDEN_HAND_PRIVILEGE_STATE_INVALID');
  if (runtime.source !== 'deck-hidden-hand-registration-snapshot') throw new TypeError('HIDDEN_HAND_RUNTIME_SOURCE_INVALID');
  return runtime;
}

export function createNewBaseHiddenHandRuntime(registrationSnapshot) {
  const snapshot = assertRegistrationSnapshot(registrationSnapshot);
  return deepFreeze({
    schema: SCHEMA,
    source: 'deck-hidden-hand-registration-snapshot',
    reservedCardId: snapshot.cardId.trim(),
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
 * Staging/button press is never consumption evidence. The caller must supply
 * an authoritative accepted legal Road commit for the same reserved card.
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
