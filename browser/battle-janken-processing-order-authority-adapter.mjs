import { resolveCyclicTriadByProcessingOrder } from './triad-resolver-core.mjs';

const BATTLE_JANKEN_PROCESSING_ORDER_AUTHORITY_SCHEMA = 'gameroad.battle-janken-processing-order-authority.v1';
const JANKEN_HAND_ORDER = Object.freeze(['ROCK', 'SCISSORS', 'PAPER']);
const JANKEN_BEATS = Object.freeze({
  ROCK: 'SCISSORS',
  SCISSORS: 'PAPER',
  PAPER: 'ROCK',
});
const JANKEN_CONFIG = Object.freeze({
  handOrder: JANKEN_HAND_ORDER,
  beats: JANKEN_BEATS,
});
const JANKEN_HANDS = new Set(JANKEN_HAND_ORDER);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function fail(message) {
  throw new TypeError(message);
}

function requireToken(value, field) {
  if (typeof value !== 'string' || value.trim() === '') fail(`${field} must be a non-empty string`);
  return value.trim();
}

function requirePrintedNumber(card, index) {
  const hasPrintedNumber = card.printedNumber != null;
  const hasDisplayNumber = card.displayNumber != null;
  if (!hasPrintedNumber && !hasDisplayNumber) {
    fail(`publicCards[${index}] requires printedNumber or displayNumber`);
  }

  const printedNumber = hasPrintedNumber ? card.printedNumber : card.displayNumber;
  if (!Number.isSafeInteger(printedNumber)) {
    fail(`publicCards[${index}] printed number must be a safe integer`);
  }
  if (hasPrintedNumber && hasDisplayNumber && card.displayNumber !== printedNumber) {
    fail(`publicCards[${index}] printedNumber and displayNumber must match`);
  }
  return printedNumber;
}

function normalizePublicCards(publicCards) {
  if (!Array.isArray(publicCards) || publicCards.length !== 4) {
    fail('publicCards must contain exactly four accepted public cards');
  }

  const playerIds = new Set();
  const cardIds = new Set();
  return publicCards.map((raw, index) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      fail(`publicCards[${index}] must be an object`);
    }
    const playerId = requireToken(raw.playerId, `publicCards[${index}].playerId`);
    const cardId = requireToken(raw.cardId, `publicCards[${index}].cardId`);
    if (playerIds.has(playerId)) fail(`duplicate public card playerId: ${playerId}`);
    if (cardIds.has(cardId)) fail(`duplicate public card cardId: ${cardId}`);
    playerIds.add(playerId);
    cardIds.add(cardId);

    const hand = requireToken(raw.hand, `publicCards[${index}].hand`);
    if (!JANKEN_HANDS.has(hand)) {
      fail(`publicCards[${index}].hand must be ROCK, SCISSORS, or PAPER`);
    }
    const printedNumber = requirePrintedNumber(raw, index);

    return deepFreeze({
      playerId,
      cardId,
      printedNumber,
      displayNumber: printedNumber,
      hand,
    });
  });
}

function duplicatePrintedNumbers(cards) {
  const counts = new Map();
  for (const card of cards) counts.set(card.printedNumber, (counts.get(card.printedNumber) ?? 0) + 1);
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([printedNumber]) => printedNumber)
    .sort((left, right) => left - right);
}

/**
 * Consume an exact, durable caller-authoritative random tie draw.
 * Randomness, persistence, replay identity and reconnect consistency belong to
 * the existing match authority. This read-only adapter never draws again.
 */
function resolvePersistedEqualNumberOrder(cards, tiedPrintedNumbers, receipt) {
  if (tiedPrintedNumbers.length === 0) {
    if (receipt !== null) fail('persisted equal-number order without tied cards');
    return { orderedCards: [...cards].sort((a, b) => a.printedNumber - b.printedNumber), persistedReceipt: null };
  }
  if (receipt === null) return null;
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) {
    fail('persisted equal-number order must be a caller-authoritative object');
  }
  const decisionId = requireToken(receipt.decisionId, 'persistedEqualNumberOrder.decisionId');
  if (decisionId !== receipt.decisionId) fail('persisted equal-number decisionId must be canonical');
  const tied = cards.filter((card) => tiedPrintedNumbers.includes(card.printedNumber));
  const ids = receipt.orderedTiedPlayerIds;
  if (!Array.isArray(ids) || ids.length !== tied.length) {
    fail('persisted equal-number order must include exactly every tied card');
  }
  const byPlayer = new Map(tied.map((card) => [card.playerId, card]));
  const seen = new Set();
  let previousNumber = -Infinity;
  for (const id of ids) {
    const card = byPlayer.get(id);
    if (!card || seen.has(id)) fail('persisted equal-number order has wrong/duplicate player');
    if (card.printedNumber < previousNumber) {
      fail('persisted equal-number order cannot change distinct-number priority');
    }
    previousNumber = card.printedNumber;
    seen.add(id);
  }
  const index = new Map(ids.map((id, position) => [id, position]));
  const orderedCards = [...cards].sort((a, b) => (
    a.printedNumber - b.printedNumber
    || (index.get(a.playerId) ?? 0) - (index.get(b.playerId) ?? 0)
  ));
  return {
    orderedCards,
    persistedReceipt: deepFreeze({ decisionId, orderedTiedPlayerIds: [...ids] }),
  };
}

/**
 * Builds the Battle-owned atomic public-card + processing-order resolution
 * snapshot consumed by the already-merged janken order live adapter.
 *
 * Current Battle authority owns one ordering rule here: smaller printed card
 * number resolves first. The user-approved random order within an equal-number
 * group is consumed only from a caller-persisted draw receipt. If that receipt
 * is missing, resolution remains blocked rather than resampling on a redraw.
 * The existing triad resolver remains the sole first-win-lock comparison engine.
 */
export function buildBattleJankenProcessingOrderAuthoritySnapshot({
  publicCards,
  persistedEqualNumberOrder = null,
} = {}) {
  const normalizedPublicCards = normalizePublicCards(publicCards);
  const tiedPrintedNumbers = duplicatePrintedNumbers(normalizedPublicCards);
  const tieResolution = resolvePersistedEqualNumberOrder(
    normalizedPublicCards, tiedPrintedNumbers, persistedEqualNumberOrder,
  );

  if (tiedPrintedNumbers.length > 0 && tieResolution === null) {
    return deepFreeze({
      schema: BATTLE_JANKEN_PROCESSING_ORDER_AUTHORITY_SCHEMA,
      status: 'UNRESOLVED_EQUAL_PRINTED_NUMBER',
      reason: 'EQUAL_PRINTED_NUMBER_PROCESSING_ORDER_UNRESOLVED',
      publicCards: normalizedPublicCards,
      processingOrder: null,
      resolution: null,
      tiedPrintedNumbers,
      processingOrderRule: 'PRINTED_NUMBER_ASCENDING',
      equalPrintedNumberTieBreak: false,
      gameStateWrite: false,
    });
  }

  const orderedCards = tieResolution.orderedCards;
  const resolution = resolveCyclicTriadByProcessingOrder(
    orderedCards.map((card) => ({ playerId: card.playerId, hand: card.hand })),
    JANKEN_CONFIG,
  );

  return deepFreeze({
    schema: BATTLE_JANKEN_PROCESSING_ORDER_AUTHORITY_SCHEMA,
    status: 'RESOLVED',
    reason: tiedPrintedNumbers.length > 0
      ? 'PRINTED_NUMBER_ORDER_WITH_PERSISTED_RANDOM_TIES_RESOLVED'
      : 'PRINTED_NUMBER_ORDER_RESOLVED',
    publicCards: normalizedPublicCards,
    processingOrder: [...resolution.processingOrder],
    resolution,
    tiedPrintedNumbers,
    processingOrderRule: 'PRINTED_NUMBER_ASCENDING',
    equalPrintedNumberTieBreak: tiedPrintedNumbers.length > 0,
    persistedEqualNumberOrder: tieResolution.persistedReceipt,
    gameStateWrite: false,
  });
}

export const BATTLE_JANKEN_PROCESSING_ORDER_AUTHORITY_CONTRACT = deepFreeze({
  schema: BATTLE_JANKEN_PROCESSING_ORDER_AUTHORITY_SCHEMA,
  acceptedPublicCardCount: 4,
  acceptedHands: JANKEN_HAND_ORDER,
  processingOrderAuthority: true,
  processingOrderRule: 'PRINTED_NUMBER_ASCENDING',
  equalPrintedNumberPolicy: 'EXACT_CALLER_PERSISTED_RANDOM_TIE_ORDER',
  persistedDrawRequiredForTies: true,
  randomDrawingOwnedHere: false,
  persistenceOwnedHere: false,
  jankenResolutionAuthority: 'EXISTING_TRIAD_FIRST_WIN_LOCK_RESOLVER',
  mutatesAcceptedPublicCardOrder: false,
  targetAuthority: false,
  shieldAuthority: false,
  destinationAuthority: false,
  transportAuthority: false,
  gameStateWrite: false,
  presentationAuthority: false,
});

export { BATTLE_JANKEN_PROCESSING_ORDER_AUTHORITY_SCHEMA };
