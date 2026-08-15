const HAND_ORDER = Object.freeze(['club', 'diamond', 'spade']);
const VALID_HANDS = new Set(HAND_ORDER);
const BEATS = Object.freeze({ club: 'diamond', diamond: 'spade', spade: 'club' });

export const PURSUIT_HANDS = HAND_ORDER;
export const PURSUIT_NO_HAND = 'none';
export const PURSUIT_MODE_NORMAL = 'normal';
export const PURSUIT_MODE_FINISHER = 'finisher';

function fail(message) {
  throw new TypeError(message);
}

function requirePlayerId(playerId) {
  if (typeof playerId !== 'string' || playerId.length === 0) fail('playerId must be a non-empty string');
  return playerId;
}

function requireHand(hand) {
  if (hand === PURSUIT_NO_HAND) return hand;
  if (!VALID_HANDS.has(hand)) fail(`unsupported pursuit hand: ${String(hand)}`);
  return hand;
}

function compareText(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function normalizeSelections(selections) {
  if (!Array.isArray(selections)) fail('selections must be an array');
  const seen = new Set();
  return selections.map((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) fail('selection must be an object');
    const playerId = requirePlayerId(entry.playerId);
    if (seen.has(playerId)) fail(`duplicate playerId: ${playerId}`);
    seen.add(playerId);
    return { playerId, hand: requireHand(entry.hand) };
  });
}

/**
 * Resolves the adopted club/diamond/spade pursuit winner set from a complete
 * reveal snapshot. The caller owns private commitment/reveal timing; this
 * function is deliberately stateless so network arrival order cannot select a
 * winner. `none` means the player did not participate and is excluded.
 */
export function resolvePursuitTriad(selections) {
  const normalized = normalizeSelections(selections);
  const active = normalized.filter((entry) => entry.hand !== PURSUIT_NO_HAND);
  const handSet = new Set(active.map((entry) => entry.hand));
  const uniqueHands = HAND_ORDER.filter((hand) => handSet.has(hand));

  let winningHand = null;
  if (uniqueHands.length === 1) {
    winningHand = uniqueHands[0];
  } else if (uniqueHands.length === 2) {
    const [a, b] = uniqueHands;
    winningHand = BEATS[a] === b ? a : b;
  } else if (uniqueHands.length !== 0 && uniqueHands.length !== 3) {
    fail('unexpected pursuit hand cardinality');
  }

  const participants = active.map((entry) => entry.playerId).sort(compareText);
  const nonParticipants = normalized
    .filter((entry) => entry.hand === PURSUIT_NO_HAND)
    .map((entry) => entry.playerId)
    .sort(compareText);
  const winners = winningHand === null
    ? []
    : active.filter((entry) => entry.hand === winningHand).map((entry) => entry.playerId).sort(compareText);

  return Object.freeze({
    participants: Object.freeze(participants),
    nonParticipants: Object.freeze(nonParticipants),
    uniqueHands: Object.freeze(uniqueHands),
    winningHand,
    winners: Object.freeze(winners),
  });
}

function requirePursuitValue(value) {
  // CURRENT pursuit candidates are the seven physical vanilla mana cards 1..7.
  if (!Number.isSafeInteger(value) || value < 1 || value > 7) {
    fail('pursuit card value must be an integer from 1 through 7');
  }
  return value;
}

function requireMode(mode) {
  if (mode !== PURSUIT_MODE_NORMAL && mode !== PURSUIT_MODE_FINISHER) {
    fail(`unsupported pursuit mode: ${String(mode)}`);
  }
  return mode;
}

export function resolvePursuitCard({ won, value, mode = PURSUIT_MODE_NORMAL } = {}) {
  if (typeof won !== 'boolean') fail('won must be boolean');
  const safeValue = requirePursuitValue(value);
  const safeMode = requireMode(mode);
  return Object.freeze({
    battleAddend: won ? safeValue * (safeMode === PURSUIT_MODE_FINISHER ? 2 : 1) : 0,
    disposition: won ? 'battle' : 'subdeck',
  });
}

/**
 * Resolves the complete adopted pursuit round. Finisher eligibility is NOT
 * decided here: `mode=finisher` must already have been authorized by the
 * upstream card authority. Dark/Heart are rejected by the hand validator.
 */
export function resolvePursuitRound({ selections, cards } = {}) {
  const triad = resolvePursuitTriad(selections);
  if (!Array.isArray(cards)) fail('cards must be an array');

  const cardByPlayer = new Map();
  for (const card of cards) {
    if (!card || typeof card !== 'object' || Array.isArray(card)) fail('card entry must be an object');
    const playerId = requirePlayerId(card.playerId);
    if (cardByPlayer.has(playerId)) fail(`duplicate pursuit card for playerId: ${playerId}`);
    cardByPlayer.set(playerId, {
      value: requirePursuitValue(card.value),
      mode: requireMode(card.mode ?? PURSUIT_MODE_NORMAL),
    });
  }

  const expected = new Set(triad.participants);
  if (cardByPlayer.size !== expected.size) fail('cards must match participating players exactly');
  for (const playerId of cardByPlayer.keys()) {
    if (!expected.has(playerId)) fail(`card supplied for non-participant: ${playerId}`);
  }

  const handByPlayer = new Map(
    normalizeSelections(selections)
      .filter((entry) => entry.hand !== PURSUIT_NO_HAND)
      .map((entry) => [entry.playerId, entry.hand]),
  );
  const winnerSet = new Set(triad.winners);
  const outcomes = triad.participants.map((playerId) => {
    const card = cardByPlayer.get(playerId);
    const won = winnerSet.has(playerId);
    const resolved = resolvePursuitCard({ won, value: card.value, mode: card.mode });
    return Object.freeze({
      playerId,
      hand: handByPlayer.get(playerId),
      won,
      value: card.value,
      mode: card.mode,
      battleAddend: resolved.battleAddend,
      disposition: resolved.disposition,
    });
  });

  return Object.freeze({ triad, outcomes: Object.freeze(outcomes) });
}

export function removePursuitPhysicalMana({ physicalManaCount, availableMana } = {}) {
  if (!Number.isSafeInteger(physicalManaCount) || physicalManaCount < 1 || physicalManaCount > 7) {
    fail('physicalManaCount must be an integer from 1 through 7');
  }
  if (!Number.isSafeInteger(availableMana) || availableMana < 0 || availableMana > physicalManaCount) {
    fail('availableMana must be an integer within the current physical mana maximum');
  }
  const nextPhysicalManaCount = physicalManaCount - 1;
  return Object.freeze({
    physicalManaCount: nextPhysicalManaCount,
    maximumMana: nextPhysicalManaCount,
    availableMana: Math.min(availableMana, nextPhysicalManaCount),
  });
}

/** Honey only wakes sleeping physical mana. It never recreates a removed card. */
export function applyHoneyWake({ physicalManaCount, availableMana, wakeCount } = {}) {
  if (!Number.isSafeInteger(physicalManaCount) || physicalManaCount < 0 || physicalManaCount > 7) {
    fail('physicalManaCount must be an integer from 0 through 7');
  }
  if (!Number.isSafeInteger(availableMana) || availableMana < 0 || availableMana > physicalManaCount) {
    fail('availableMana must be within the physical mana maximum');
  }
  if (!Number.isSafeInteger(wakeCount) || wakeCount < 0) fail('wakeCount must be a non-negative integer');
  return Object.freeze({
    physicalManaCount,
    maximumMana: physicalManaCount,
    availableMana: Math.min(physicalManaCount, availableMana + wakeCount),
  });
}
