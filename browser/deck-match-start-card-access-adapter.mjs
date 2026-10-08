import { evaluateDeckCardAccess } from './card-access-entitlement-core.mjs';
import { createDeckMatchStartSnapshot } from './deck-save-ack-core.mjs';

const SCHEMA = 'gameroad.deck-match-start-card-access-adapter.v1';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function selectionDeck(selection) {
  if (!selection || typeof selection !== 'object' || Array.isArray(selection)) {
    throw new TypeError('MATCH_START_SELECTION_REQUIRED');
  }
  const savedDeck = selection.savedDeck && typeof selection.savedDeck === 'object'
    ? selection.savedDeck
    : {};
  return {
    main: Array.isArray(savedDeck.main) ? [...savedDeck.main] : [],
    ex: Array.isArray(savedDeck.ex) ? [...savedDeck.ex] : [],
  };
}

export function createDeckMatchStartSnapshotWithCardAccess(
  selection,
  {
    validateDeck,
    accessPolicy,
  } = {},
) {
  const access = evaluateDeckCardAccess(selectionDeck(selection), accessPolicy);
  if (!access.ok) {
    throw new Error(`MATCH_START_CARD_ACCESS_DENIED:${access.lockedCardIds.join(',')}`);
  }

  return createDeckMatchStartSnapshot(selection, { validateDeck });
}

export function inspectDeckMatchStartCardAccess(selection, { accessPolicy } = {}) {
  return deepFreeze({
    schema: SCHEMA,
    access: evaluateDeckCardAccess(selectionDeck(selection), accessPolicy),
    selectionMutationAllowed: false,
    matchStateMutationAllowed: false,
  });
}

export const DECK_MATCH_START_CARD_ACCESS_ADAPTER = Object.freeze({
  schema: SCHEMA,
  existingMatchSnapshotAuthority: 'deck-save-ack-core:createDeckMatchStartSnapshot',
  entitlementAuthority: 'CALLER_SUPPLIED_POLICY',
  savedDeckMutationAllowed: false,
  ownershipMutationAllowed: false,
  matchStateMutationAllowed: false,
});
