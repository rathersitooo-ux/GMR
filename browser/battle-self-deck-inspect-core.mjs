const SCHEMA = 'GAMEROAD_BATTLE_SELF_DECK_INSPECT_V1';
const SNAPSHOT_KEYS = Object.freeze([
  'cardCounts',
  'matchId',
  'ownerPlayerId',
  'revision',
  'schema',
  'total'
]);
const COUNT_KEYS = Object.freeze(['cardId', 'count']);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function cloneJson(value) {
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new TypeError('NON_JSON_VALUE');
  return JSON.parse(encoded);
}

function validCanonicalString(value) {
  return typeof value === 'string' && value.length > 0 && value.trim() === value;
}

function sameExactKeys(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function compareCardIds(left, right) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function fail(reason) {
  return deepFreeze({ ok: false, status: 'unavailable', reason });
}

function normalizeCounts(remainingCardIds) {
  if (!Array.isArray(remainingCardIds)) throw new TypeError('REMAINING_CARD_IDS_REQUIRED');

  const counts = new Map();
  for (const cardId of remainingCardIds) {
    if (!validCanonicalString(cardId)) throw new TypeError('CARD_ID_INVALID');
    counts.set(cardId, (counts.get(cardId) || 0) + 1);
  }

  return [...counts.entries()]
    .sort(([left], [right]) => compareCardIds(left, right))
    .map(([cardId, count]) => ({ cardId, count }));
}

export function createAuthoritativeRemainingDeckSnapshot({
  matchId,
  ownerPlayerId,
  revision,
  remainingCardIds
}) {
  if (!validCanonicalString(matchId)) throw new TypeError('MATCH_ID_REQUIRED');
  if (!validCanonicalString(ownerPlayerId)) throw new TypeError('OWNER_PLAYER_ID_REQUIRED');
  if (!Number.isSafeInteger(revision) || revision < 0) throw new TypeError('REVISION_INVALID');

  const cardCounts = normalizeCounts(remainingCardIds);
  const snapshot = {
    schema: SCHEMA,
    matchId,
    ownerPlayerId,
    revision,
    total: remainingCardIds.length,
    cardCounts
  };
  return deepFreeze(snapshot);
}

export function validateAuthoritativeRemainingDeckSnapshot(snapshot) {
  if (!sameExactKeys(snapshot, SNAPSHOT_KEYS)) return fail('SNAPSHOT_SHAPE_INVALID');
  if (snapshot.schema !== SCHEMA) return fail('SCHEMA_UNKNOWN');
  if (!validCanonicalString(snapshot.matchId)) return fail('MATCH_ID_INVALID');
  if (!validCanonicalString(snapshot.ownerPlayerId)) return fail('OWNER_PLAYER_ID_INVALID');
  if (!Number.isSafeInteger(snapshot.revision) || snapshot.revision < 0) return fail('REVISION_INVALID');
  if (!Number.isSafeInteger(snapshot.total) || snapshot.total < 0) return fail('TOTAL_INVALID');
  if (!Array.isArray(snapshot.cardCounts)) return fail('CARD_COUNTS_INVALID');

  let previousCardId = null;
  let sum = 0;
  for (const entry of snapshot.cardCounts) {
    if (!sameExactKeys(entry, COUNT_KEYS)) return fail('CARD_COUNT_SHAPE_INVALID');
    if (!validCanonicalString(entry.cardId)) return fail('CARD_ID_INVALID');
    if (!Number.isSafeInteger(entry.count) || entry.count < 1) return fail('CARD_COUNT_INVALID');
    if (previousCardId !== null && compareCardIds(previousCardId, entry.cardId) >= 0) {
      return fail('CARD_COUNTS_NOT_CANONICAL');
    }
    previousCardId = entry.cardId;
    sum += entry.count;
    if (!Number.isSafeInteger(sum)) return fail('TOTAL_INVALID');
  }

  if (sum !== snapshot.total) return fail('TOTAL_MISMATCH');
  return deepFreeze({ ok: true, status: 'ready' });
}

export function projectRemainingDeckForViewer(snapshot, { viewer = null } = {}) {
  const validation = validateAuthoritativeRemainingDeckSnapshot(snapshot);
  if (!validation.ok) return validation;

  const projection = {
    ok: true,
    status: 'ready',
    schema: SCHEMA,
    matchId: snapshot.matchId,
    ownerPlayerId: snapshot.ownerPlayerId,
    revision: snapshot.revision,
    total: snapshot.total
  };

  const viewerId = viewer?.authenticated === true && validCanonicalString(viewer?.id)
    ? viewer.id
    : null;

  if (viewerId === snapshot.ownerPlayerId) {
    projection.typeCount = snapshot.cardCounts.length;
    projection.cardCounts = cloneJson(snapshot.cardCounts);
  }

  return deepFreeze(projection);
}

export const BATTLE_SELF_DECK_INSPECT_CORE = Object.freeze({ schema: SCHEMA });
