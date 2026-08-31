const SCHEMA = 'gameroad.new-base.hidden-hand-runtime.v1';

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function assertMatchStartSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    throw new TypeError('HIDDEN_HAND_MATCH_START_SNAPSHOT_REQUIRED');
  }
  if (!snapshot.deck || typeof snapshot.deck !== 'object' || Array.isArray(snapshot.deck)) {
    throw new TypeError('HIDDEN_HAND_MATCH_START_DECK_REQUIRED');
  }
  if (!Object.prototype.hasOwnProperty.call(snapshot.deck, 'hiddenHandCardIds')) {
    throw new TypeError('HIDDEN_HAND_REGISTRATION_MISSING');
  }
  if (!Array.isArray(snapshot.deck.hiddenHandCardIds)) {
    throw new TypeError('HIDDEN_HAND_REGISTRATION_INVALID');
  }
  if (snapshot.deck.hiddenHandCardIds.some((cardId) => !nonEmptyString(cardId))) {
    throw new TypeError('HIDDEN_HAND_CARD_ID_INVALID');
  }
  return snapshot;
}

/**
 * Projects the deck-registered hidden-hand identities from the immutable
 * match-start snapshot into new-base runtime state.
 *
 * This core intentionally owns no activation, usage-count, matchup, effect,
 * replacement, native-suit, janken-slot, or Pursuit behavior.
 */
export function createNewBaseHiddenHandRuntime(matchStartSnapshot) {
  const snapshot = assertMatchStartSnapshot(matchStartSnapshot);
  const registeredCardIds = Object.freeze([...snapshot.deck.hiddenHandCardIds]);

  return Object.freeze({
    schema: SCHEMA,
    source: 'match-start-snapshot',
    registeredCardIds,
  });
}

export function readNewBaseHiddenHandCardIds(runtime) {
  if (!runtime || typeof runtime !== 'object' || runtime.schema !== SCHEMA) {
    throw new TypeError('HIDDEN_HAND_RUNTIME_INVALID');
  }
  if (!Array.isArray(runtime.registeredCardIds) ||
      runtime.registeredCardIds.some((cardId) => !nonEmptyString(cardId))) {
    throw new TypeError('HIDDEN_HAND_RUNTIME_REGISTRATION_INVALID');
  }
  return runtime.registeredCardIds;
}

export const NEW_BASE_HIDDEN_HAND_RUNTIME = Object.freeze({ schema: SCHEMA });
