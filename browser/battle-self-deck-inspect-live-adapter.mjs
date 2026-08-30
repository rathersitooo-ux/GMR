import {
  createAuthoritativeRemainingDeckSnapshot,
  projectRemainingDeckForViewer
} from './battle-self-deck-inspect-core.mjs';

const SCHEMA = 'GAMEROAD_BATTLE_SELF_DECK_INSPECT_LIVE_ADAPTER_V1';
const HIDDEN_CARD_IDS = new Set(['__HIDDEN__', '__PUBLIC_COUNT__']);

function fail(reason) {
  return Object.freeze({ ok: false, status: 'unavailable', reason });
}

function canonicalString(value) {
  return typeof value === 'string' && value.length > 0 && value.trim() === value;
}

function localHumanPlayer(match) {
  if (!Array.isArray(match?.players)) return null;
  const players = match.players.filter(player => player?.human === true);
  return players.length === 1 ? players[0] : null;
}

export function projectSelfRemainingDeckFromLiveMatch(match, { viewer = null } = {}) {
  if (!match || typeof match !== 'object' || Array.isArray(match)) return fail('MATCH_REQUIRED');
  if (match.busy === true || match.phase === 'resolve') return fail('MATCH_MUTATING');
  if (!canonicalString(match.id)) return fail('MATCH_ID_INVALID');
  if (!Number.isSafeInteger(match.resolutionSeq) || match.resolutionSeq < 0) {
    return fail('RESOLUTION_SEQ_INVALID');
  }

  const owner = localHumanPlayer(match);
  if (!owner) return fail('HUMAN_OWNER_NOT_UNIQUE');
  if (!canonicalString(owner.id)) return fail('OWNER_PLAYER_ID_INVALID');
  if (!Array.isArray(owner.deck)) return fail('AUTHORITATIVE_DECK_UNAVAILABLE');
  if (owner.deck.some(cardId => HIDDEN_CARD_IDS.has(cardId))) {
    return fail('AUTHORITATIVE_DECK_UNAVAILABLE');
  }

  try {
    const snapshot = createAuthoritativeRemainingDeckSnapshot({
      matchId: match.id,
      ownerPlayerId: owner.id,
      revision: match.resolutionSeq,
      remainingCardIds: owner.deck
    });
    return projectRemainingDeckForViewer(snapshot, { viewer });
  } catch {
    return fail('AUTHORITATIVE_DECK_INVALID');
  }
}

export const BATTLE_SELF_DECK_INSPECT_LIVE_ADAPTER = Object.freeze({ schema: SCHEMA });
