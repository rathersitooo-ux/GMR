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

export const PURSUIT_SECRET_ROUND_SCHEMA = 'gameroad.pursuit-secret-round.v1';
export const PURSUIT_COMMITMENT_DOMAIN = 'gameroad:pursuit-secret-commit:v1';

function requireRoundId(roundId) {
  if (typeof roundId !== 'string' || roundId.length === 0) fail('roundId must be a non-empty string');
  return roundId;
}

function requireRevision(revision) {
  if (!Number.isSafeInteger(revision) || revision < 0) fail('revision must be a non-negative safe integer');
  return revision;
}

function requireCardId(cardId) {
  if (typeof cardId !== 'string' || cardId.length === 0) fail('cardId must be a non-empty authoritative physical-card identity');
  return cardId;
}

function requireNonce(nonce) {
  if (typeof nonce !== 'string' || nonce.length === 0) fail('nonce must be a non-empty externally supplied string');
  return nonce;
}

function requireCommitment(commitment) {
  if (typeof commitment !== 'string' || commitment.length === 0) fail('commitment must be a non-empty opaque string');
  return commitment;
}

function requireCommitHand(hand) {
  const safe = requireHand(hand);
  if (safe === PURSUIT_NO_HAND) fail('no-hand cannot enter the secret pursuit commitment barrier');
  return safe;
}

function normalizeParticipantIds(participantIds) {
  if (!Array.isArray(participantIds)) fail('participantIds must be an array');
  if (participantIds.length < 2 || participantIds.length > 4) {
    fail('participantIds must contain between 2 and 4 pursuit participants');
  }
  const normalized = participantIds.map(requirePlayerId).sort(compareText);
  for (let index = 1; index < normalized.length; index += 1) {
    if (normalized[index] === normalized[index - 1]) fail(`duplicate participantId: ${normalized[index]}`);
  }
  return normalized;
}

function freezeCommitments(commitments) {
  return Object.freeze(commitments.map((entry) => Object.freeze({
    playerId: entry.playerId,
    commitment: entry.commitment,
  })));
}

function makeSecretRound({ roundId, revision, participantIds, commitments, closed }) {
  return Object.freeze({
    schema: PURSUIT_SECRET_ROUND_SCHEMA,
    roundId,
    revision,
    participantIds: Object.freeze([...participantIds]),
    commitments: freezeCommitments(commitments),
    closed,
  });
}

function normalizeSecretRound(round) {
  if (!round || typeof round !== 'object' || Array.isArray(round)) fail('secret round must be an object');
  if (round.schema !== PURSUIT_SECRET_ROUND_SCHEMA) fail('unsupported secret round schema');

  const roundId = requireRoundId(round.roundId);
  const revision = requireRevision(round.revision);
  const participantIds = normalizeParticipantIds(round.participantIds);
  if (JSON.stringify(participantIds) !== JSON.stringify(round.participantIds)) {
    fail('participantIds must use canonical sorted order');
  }
  if (!Array.isArray(round.commitments)) fail('round.commitments must be an array');
  if (typeof round.closed !== 'boolean') fail('round.closed must be boolean');

  const expected = new Set(participantIds);
  const commitments = [];
  const seen = new Set();
  for (const entry of round.commitments) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) fail('commitment entry must be an object');
    const playerId = requirePlayerId(entry.playerId);
    const commitment = requireCommitment(entry.commitment);
    if (!expected.has(playerId)) fail(`commitment supplied for nonparticipant: ${playerId}`);
    if (seen.has(playerId)) fail(`duplicate commitment for playerId: ${playerId}`);
    seen.add(playerId);
    commitments.push({ playerId, commitment });
  }
  commitments.sort((a, b) => compareText(a.playerId, b.playerId));
  if (JSON.stringify(commitments) !== JSON.stringify(round.commitments)) {
    fail('commitments must use canonical participant order');
  }
  if (commitments.length > participantIds.length) fail('too many commitments');
  if (round.closed && commitments.length !== participantIds.length) {
    fail('closed secret round must retain every participant commitment');
  }

  return { roundId, revision, participantIds, commitments, closed: round.closed };
}

function requireSecretSelection(selection) {
  if (!selection || typeof selection !== 'object' || Array.isArray(selection)) {
    fail('secret selection must be an object');
  }
  return {
    roundId: requireRoundId(selection.roundId),
    revision: requireRevision(selection.revision),
    playerId: requirePlayerId(selection.playerId),
    hand: requireCommitHand(selection.hand),
    cardId: requireCardId(selection.cardId),
    value: requirePursuitValue(selection.value),
    mode: requireMode(selection.mode ?? PURSUIT_MODE_NORMAL),
    nonce: requireNonce(selection.nonce),
  };
}

function requireDigestFunction(digestFn) {
  if (typeof digestFn !== 'function') fail('digestFn must be a function');
  return digestFn;
}

export function createPursuitSecretRound({ roundId, revision, participantIds } = {}) {
  return makeSecretRound({
    roundId: requireRoundId(roundId),
    revision: requireRevision(revision),
    participantIds: normalizeParticipantIds(participantIds),
    commitments: [],
    closed: false,
  });
}

export function getPursuitSecretRoundPublicState(round) {
  const safe = normalizeSecretRound(round);
  const allCommitted = safe.commitments.length === safe.participantIds.length;
  return Object.freeze({
    schema: PURSUIT_SECRET_ROUND_SCHEMA,
    roundId: safe.roundId,
    revision: safe.revision,
    participantIds: Object.freeze([...safe.participantIds]),
    commitments: freezeCommitments(safe.commitments),
    committedCount: safe.commitments.length,
    expectedCount: safe.participantIds.length,
    allCommitted,
    phase: safe.closed ? 'closed' : allCommitted ? 'reveal-ready' : 'commit',
  });
}

export function canonicalPursuitCommitmentPayload(selection = {}) {
  const safe = requireSecretSelection(selection);
  return JSON.stringify([
    PURSUIT_COMMITMENT_DOMAIN,
    safe.roundId,
    safe.revision,
    safe.playerId,
    safe.hand,
    safe.cardId,
    safe.value,
    safe.mode,
    safe.nonce,
  ]);
}

export async function createPursuitCommitment(selection = {}, digestFn) {
  const payload = canonicalPursuitCommitmentPayload(selection);
  const digest = await requireDigestFunction(digestFn)(payload);
  const commitment = requireCommitment(digest);
  if (commitment === payload) fail('digestFn must not expose the canonical secret payload as the commitment');
  return commitment;
}

export function commitPursuitSelection(round, { roundId, revision, playerId, commitment } = {}) {
  const safe = normalizeSecretRound(round);
  if (safe.closed) fail('secret pursuit round is already closed');
  if (requireRoundId(roundId) !== safe.roundId) fail('stale or mismatched roundId');
  if (requireRevision(revision) !== safe.revision) fail('stale or mismatched revision');

  const safePlayerId = requirePlayerId(playerId);
  if (!safe.participantIds.includes(safePlayerId)) fail(`unknown pursuit participant: ${safePlayerId}`);
  if (safe.commitments.some((entry) => entry.playerId === safePlayerId)) {
    fail(`duplicate commitment for playerId: ${safePlayerId}`);
  }

  const commitments = [
    ...safe.commitments,
    { playerId: safePlayerId, commitment: requireCommitment(commitment) },
  ].sort((a, b) => compareText(a.playerId, b.playerId));

  return makeSecretRound({ ...safe, commitments });
}

export async function finalizePursuitSecretRound(round, reveals, digestFn) {
  const safe = normalizeSecretRound(round);
  if (safe.closed) fail('secret pursuit round is already closed');
  if (safe.commitments.length !== safe.participantIds.length) {
    fail('reveal blocked until every expected participant has committed');
  }
  if (!Array.isArray(reveals)) fail('reveals must be an array');
  if (reveals.length !== safe.participantIds.length) {
    fail('reveals must contain every expected participant exactly once');
  }

  const expected = new Set(safe.participantIds);
  const revealByPlayer = new Map();
  for (const reveal of reveals) {
    const normalized = requireSecretSelection(reveal);
    if (normalized.roundId !== safe.roundId) fail('stale or mismatched reveal roundId');
    if (normalized.revision !== safe.revision) fail('stale or mismatched reveal revision');
    if (!expected.has(normalized.playerId)) fail(`reveal supplied for nonparticipant: ${normalized.playerId}`);
    if (revealByPlayer.has(normalized.playerId)) fail(`duplicate reveal for playerId: ${normalized.playerId}`);
    revealByPlayer.set(normalized.playerId, normalized);
  }

  const commitmentByPlayer = new Map(safe.commitments.map((entry) => [entry.playerId, entry.commitment]));
  for (const playerId of safe.participantIds) {
    const reveal = revealByPlayer.get(playerId);
    if (!reveal) fail(`missing reveal for playerId: ${playerId}`);
    const actual = await createPursuitCommitment(reveal, digestFn);
    if (actual !== commitmentByPlayer.get(playerId)) fail(`commitment mismatch for playerId: ${playerId}`);
  }

  const selections = safe.participantIds.map((playerId) => {
    const reveal = revealByPlayer.get(playerId);
    return Object.freeze({ playerId, hand: reveal.hand });
  });
  const cards = safe.participantIds.map((playerId) => {
    const reveal = revealByPlayer.get(playerId);
    return Object.freeze({
      playerId,
      cardId: reveal.cardId,
      value: reveal.value,
      mode: reveal.mode,
    });
  });
  const snapshot = Object.freeze({
    selections: Object.freeze(selections),
    cards: Object.freeze(cards),
  });
  const closedRound = makeSecretRound({ ...safe, closed: true });

  return Object.freeze({ round: closedRound, snapshot });
}


export const PURSUIT_SECRET_ROUND_SNAPSHOT_SCHEMA = 'gameroad.pursuit-secret-round-snapshot.v1';

function requireExactObjectKeys(value, expectedKeys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object`);
  const actual = Object.keys(value).sort(compareText);
  const expected = [...expectedKeys].sort(compareText);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(`${label} contains unsupported or missing fields`);
  }
}

export function exportPursuitSecretRoundSnapshot(round) {
  const safe = normalizeSecretRound(round);
  return Object.freeze({
    schema: PURSUIT_SECRET_ROUND_SNAPSHOT_SCHEMA,
    round: makeSecretRound(safe),
  });
}

export function restorePursuitSecretRoundSnapshot(
  snapshot,
  { roundId, revision, participantIds } = {},
) {
  requireExactObjectKeys(snapshot, ['schema', 'round'], 'secret round snapshot');
  if (snapshot.schema !== PURSUIT_SECRET_ROUND_SNAPSHOT_SCHEMA) {
    fail('unsupported secret round snapshot schema');
  }
  requireExactObjectKeys(
    snapshot.round,
    ['schema', 'roundId', 'revision', 'participantIds', 'commitments', 'closed'],
    'secret round snapshot round',
  );

  const safe = normalizeSecretRound(snapshot.round);
  const expectedRoundId = requireRoundId(roundId);
  const expectedRevision = requireRevision(revision);
  const expectedParticipantIds = normalizeParticipantIds(participantIds);

  if (safe.roundId !== expectedRoundId) fail('snapshot roundId does not match expected round');
  if (safe.revision !== expectedRevision) fail('snapshot revision does not match expected revision');
  if (JSON.stringify(safe.participantIds) !== JSON.stringify(expectedParticipantIds)) {
    fail('snapshot participantIds do not match expected participants');
  }

  return makeSecretRound(safe);
}
