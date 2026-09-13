function fail(message) {
  throw new TypeError(message);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireCardId(value, name) {
  if (typeof value !== 'string' || value.length === 0) {
    fail(`${name} cardId must be a non-empty string`);
  }
  return value;
}

function normalizeJanken(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') fail('loadJanken must be a string or null');
  return value;
}

function cloneResolvedCard(card, name) {
  if (!isRecord(card)) fail(`${name} must be an object`);
  const cardId = requireCardId(card.cardId, name);
  return Object.freeze({ ...card, cardId });
}

function normalizePlayedCards(value) {
  if (!Array.isArray(value)) fail('playedCards must be an array');
  return Object.freeze(value.map((card, index) => cloneResolvedCard(card, `playedCards[${index}]`)));
}

function resolveLoadCard(loadCard) {
  if (loadCard === undefined || loadCard === null) {
    return Object.freeze({ state: 'absent', card: null });
  }
  if (!isRecord(loadCard)) fail('loadCard must be an object or null');
  if (typeof loadCard.cardId !== 'string' || loadCard.cardId.length === 0) {
    return Object.freeze({ state: 'unresolved', card: null });
  }
  return Object.freeze({
    state: 'resolved',
    card: Object.freeze({ ...loadCard, cardId: loadCard.cardId }),
  });
}

/**
 * Pure presentation projection for the top Battle HUD card lineage.
 *
 * The caller owns all battle authority. This module never chooses a card,
 * derives identity from artwork/text/janken, commits gameplay state, or sorts
 * the already-played chain. `cardId` is the only accepted identity input.
 */
export function buildBattleLoadCardChainPresentation({
  loadCard = null,
  loadJanken = null,
  playedCards = [],
} = {}) {
  const played = normalizePlayedCards(playedCards);
  const load = resolveLoadCard(loadCard);
  const jankenHand = normalizeJanken(loadJanken);

  const playedSequence = Object.freeze(played.map((card, index) => Object.freeze({
    index,
    cardId: card.cardId,
    card,
  })));

  const sequenceEdges = Object.freeze(playedSequence.slice(0, -1).map((slot, index) => Object.freeze({
    kind: 'played-sequence',
    fromCardId: slot.cardId,
    toCardId: playedSequence[index + 1].cardId,
  })));

  const loadSlot = Object.freeze({
    identityState: load.state,
    card: load.card,
    jankenHand,
  });

  return Object.freeze({
    status: load.state === 'resolved' ? 'ready' : 'load-identity-unresolved',
    playedCards: played,
    playedSequence,
    sequenceEdges,
    loadSlot,
    commitCandidate: load.card
      ? Object.freeze({ cardId: load.card.cardId, source: 'authoritative-load-card' })
      : null,
  });
}

/**
 * Verifies the presentation-visible identity boundary at commit time.
 *
 * The accepted transition is deliberately narrow: the existing played prefix
 * stays in exactly the same order and the current authoritative Load card is
 * appended once as the next played Battle card. This function validates only
 * identity continuity; it does not decide whether a commit is legal or who won.
 */
export function verifyBattleLoadCommitTransition({ before, after } = {}) {
  if (!isRecord(before)) fail('before must be an object');
  if (!isRecord(after)) fail('after must be an object');

  const beforeView = buildBattleLoadCardChainPresentation(before);
  const afterView = buildBattleLoadCardChainPresentation(after);

  if (!beforeView.commitCandidate) {
    fail('before LOAD card identity is unresolved');
  }

  const beforeIds = beforeView.playedCards.map((card) => card.cardId);
  const afterIds = afterView.playedCards.map((card) => card.cardId);

  if (afterIds.length !== beforeIds.length + 1) {
    fail('commit must append exactly one played card');
  }

  for (let index = 0; index < beforeIds.length; index += 1) {
    if (afterIds[index] !== beforeIds[index]) {
      fail(`played card order changed before committed index ${index}`);
    }
  }

  const committedIndex = beforeIds.length;
  const committedCardId = afterIds[committedIndex];
  if (committedCardId !== beforeView.commitCandidate.cardId) {
    fail(`committed cardId does not match LOAD cardId: ${committedCardId}`);
  }

  return Object.freeze({
    cardId: committedCardId,
    previousPlayedCount: beforeIds.length,
    committedIndex,
  });
}
