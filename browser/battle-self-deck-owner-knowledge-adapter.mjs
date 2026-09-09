import { BATTLE_SELF_DECK_INSPECT_CORE } from './battle-self-deck-inspect-core.mjs';

export const BATTLE_SELF_DECK_OWNER_KNOWLEDGE_ADAPTER_SCHEMA =
  'gameroad.battle-self-deck-owner-knowledge-adapter.v1';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function validCanonicalString(value) {
  return typeof value === 'string' && value.length > 0 && value.trim() === value;
}

function unavailable(reason) {
  return deepFreeze({ ok: false, status: 'unavailable', reason });
}

function canonicalRemainingDeck(deck) {
  if (!Array.isArray(deck)) return unavailable('REMAINING_DECK_UNAVAILABLE');
  if (!deck.every(validCanonicalString)) return unavailable('REMAINING_DECK_INVALID');
  return deepFreeze({
    ok: true,
    status: 'ready',
    cardIds: [...deck].sort()
  });
}

function readLocalOwner(match) {
  if (!Array.isArray(match?.players)) return unavailable('PLAYERS_UNAVAILABLE');
  const localHumans = match.players.filter(player => player?.human === true);
  if (localHumans.length !== 1) return unavailable('LOCAL_OWNER_AMBIGUOUS');
  const owner = localHumans[0];
  if (!validCanonicalString(owner?.id)) return unavailable('OWNER_PLAYER_ID_INVALID');
  // Do not freeze/clone the live gameplay object here. The caller only reads it,
  // then copies the allowed owner-self data into a separate frozen projection.
  return { ok: true, status: 'ready', owner };
}

/**
 * Converts the existing live local player's remaining deck authority into the
 * caller-authorized viewerKnowledge shape already consumed by the Battle
 * remaining-deck presentation bridge.
 *
 * Security boundary:
 * - only the one local human owner can be projected;
 * - the authenticated viewer id must equal that owner id;
 * - opponent decks are never read into the result;
 * - the gameplay deck order is erased before identities leave this adapter;
 * - this adapter creates no second deck state and performs no game-state write.
 */
export function createOwnerSelfRemainingDeckPresentationInput({
  state,
  viewer,
  revision
} = {}) {
  const match = state?.match;
  if (!match || typeof match !== 'object' || Array.isArray(match)) {
    return unavailable('MATCH_UNAVAILABLE');
  }
  if (!validCanonicalString(match.id)) return unavailable('MATCH_ID_INVALID');
  if (!Number.isSafeInteger(revision) || revision < 0) {
    return unavailable('REVISION_INVALID');
  }

  const localOwner = readLocalOwner(match);
  if (!localOwner.ok) return localOwner;
  const owner = localOwner.owner;

  if (viewer?.authenticated !== true || !validCanonicalString(viewer?.id)) {
    return unavailable('VIEWER_AUTHENTICATION_REQUIRED');
  }
  if (viewer.id !== owner.id) return unavailable('VIEWER_NOT_LOCAL_OWNER');

  const remaining = canonicalRemainingDeck(owner.deck);
  if (!remaining.ok) return remaining;

  const events = remaining.cardIds.map((cardId, sequence) => ({
    cardId,
    kind: 'INITIAL_KNOWN',
    sequence
  }));
  const viewerKnowledge = {
    schema: BATTLE_SELF_DECK_INSPECT_CORE.viewerKnowledgeSchema,
    matchId: match.id,
    revision,
    viewerId: owner.id,
    events
  };
  const presentationInput = {
    matchId: match.id,
    ownerPlayerId: owner.id,
    remainingCount: remaining.cardIds.length,
    revision,
    viewer: {
      authenticated: true,
      id: owner.id
    },
    viewerKnowledge
  };

  return deepFreeze({
    ok: true,
    status: 'ready',
    schema: BATTLE_SELF_DECK_OWNER_KNOWLEDGE_ADAPTER_SCHEMA,
    authority: 'EXISTING_LOCAL_OWNER_MATCH_PLAYER_DECK',
    orderHidden: true,
    opponentDeckRead: false,
    gameStateWrite: false,
    presentationInput
  });
}

export const BATTLE_SELF_DECK_OWNER_KNOWLEDGE_ADAPTER = deepFreeze({
  schema: BATTLE_SELF_DECK_OWNER_KNOWLEDGE_ADAPTER_SCHEMA,
  sourceAuthority: 'state.match.players[].deck',
  localOwnerSelector: 'exactly_one_player_with_human_true',
  viewerPolicy: 'authenticated_viewer_id_must_equal_local_owner_id',
  projectionTarget: 'projectLiveBattleRemainingDeckPresentation',
  orderHidden: true,
  opponentDeckRead: false,
  gameStateWrite: false
});
