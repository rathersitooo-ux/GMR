const SCHEMA = 'GAMEROAD_BATTLE_SELF_DECK_INSPECT_V1';
const VIEWER_KNOWLEDGE_SCHEMA = 'GAMEROAD_BATTLE_REMAINING_DECK_VIEWER_KNOWLEDGE_V1';
const SNAPSHOT_KEYS = Object.freeze([
  'cardCounts',
  'matchId',
  'ownerPlayerId',
  'revision',
  'schema',
  'total'
]);
const COUNT_KEYS = Object.freeze(['cardId', 'count']);
const KNOWLEDGE_KEYS = Object.freeze(['events', 'matchId', 'revision', 'schema', 'viewerId']);
const KNOWLEDGE_EVENT_KEYS = Object.freeze(['cardId', 'kind', 'sequence']);
const KNOWLEDGE_EVENT_KINDS = new Set(['INITIAL_KNOWN', 'DEPART_KNOWN', 'RETURN_KNOWN']);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
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

function baseProjection(snapshot) {
  return {
    ok: true,
    status: 'ready',
    schema: SCHEMA,
    matchId: snapshot.matchId,
    ownerPlayerId: snapshot.ownerPlayerId,
    revision: snapshot.revision,
    total: snapshot.total
  };
}

function projectAuthorizedKnowledge(snapshot, viewerKnowledge, viewerId) {
  if (!sameExactKeys(viewerKnowledge, KNOWLEDGE_KEYS)) return fail('VIEWER_KNOWLEDGE_SHAPE_INVALID');
  if (viewerKnowledge.schema !== VIEWER_KNOWLEDGE_SCHEMA) return fail('VIEWER_KNOWLEDGE_SCHEMA_UNKNOWN');
  if (!validCanonicalString(viewerKnowledge.matchId) || viewerKnowledge.matchId !== snapshot.matchId) return fail('VIEWER_KNOWLEDGE_MATCH_MISMATCH');
  if (!validCanonicalString(viewerKnowledge.viewerId) || viewerKnowledge.viewerId !== viewerId) return fail('VIEWER_KNOWLEDGE_VIEWER_MISMATCH');
  if (!Number.isSafeInteger(viewerKnowledge.revision) || viewerKnowledge.revision !== snapshot.revision) return fail('VIEWER_KNOWLEDGE_REVISION_MISMATCH');
  if (!Array.isArray(viewerKnowledge.events)) return fail('VIEWER_KNOWLEDGE_EVENTS_INVALID');

  const known = new Map();
  let previousSequence = null;
  let dynamicSeen = false;
  for (const event of viewerKnowledge.events) {
    if (!sameExactKeys(event, KNOWLEDGE_EVENT_KEYS)) return fail('VIEWER_KNOWLEDGE_EVENT_SHAPE_INVALID');
    if (!Number.isSafeInteger(event.sequence) || event.sequence < 0) return fail('VIEWER_KNOWLEDGE_EVENT_SEQUENCE_INVALID');
    if (previousSequence !== null && event.sequence <= previousSequence) return fail('VIEWER_KNOWLEDGE_EVENT_ORDER_INVALID');
    previousSequence = event.sequence;
    if (!KNOWLEDGE_EVENT_KINDS.has(event.kind)) return fail('VIEWER_KNOWLEDGE_EVENT_KIND_INVALID');
    if (!validCanonicalString(event.cardId)) return fail('VIEWER_KNOWLEDGE_CARD_ID_INVALID');

    if (event.kind === 'INITIAL_KNOWN') {
      if (dynamicSeen) return fail('VIEWER_KNOWLEDGE_INITIAL_AFTER_DYNAMIC');
      known.set(event.cardId, (known.get(event.cardId) || 0) + 1);
      continue;
    }
    dynamicSeen = true;
    if (event.kind === 'RETURN_KNOWN') {
      known.set(event.cardId, (known.get(event.cardId) || 0) + 1);
      continue;
    }
    const current = known.get(event.cardId) || 0;
    if (current > 1) known.set(event.cardId, current - 1);
    else if (current === 1) known.delete(event.cardId);
  }

  const knownCardCounts = [...known.entries()]
    .sort(([left], [right]) => compareCardIds(left, right))
    .map(([cardId, count]) => ({ cardId, count }));
  const knownCount = knownCardCounts.reduce((sum, entry) => sum + entry.count, 0);
  if (!Number.isSafeInteger(knownCount) || knownCount > snapshot.total) return fail('VIEWER_KNOWN_COUNT_EXCEEDS_TOTAL');

  return deepFreeze({
    ...baseProjection(snapshot),
    viewerKnowledgeSchema: VIEWER_KNOWLEDGE_SCHEMA,
    knownCount,
    unknownCount: snapshot.total - knownCount,
    knownTypeCount: knownCardCounts.length,
    knownCardCounts
  });
}

export function createAuthoritativeRemainingDeckSnapshot({ matchId, ownerPlayerId, revision, remainingCardIds }) {
  if (!validCanonicalString(matchId)) throw new TypeError('MATCH_ID_REQUIRED');
  if (!validCanonicalString(ownerPlayerId)) throw new TypeError('OWNER_PLAYER_ID_REQUIRED');
  if (!Number.isSafeInteger(revision) || revision < 0) throw new TypeError('REVISION_INVALID');
  const cardCounts = normalizeCounts(remainingCardIds);
  return deepFreeze({ schema: SCHEMA, matchId, ownerPlayerId, revision, total: remainingCardIds.length, cardCounts });
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
    if (previousCardId !== null && compareCardIds(previousCardId, entry.cardId) >= 0) return fail('CARD_COUNTS_NOT_CANONICAL');
    previousCardId = entry.cardId;
    sum += entry.count;
    if (!Number.isSafeInteger(sum)) return fail('TOTAL_INVALID');
  }
  if (sum !== snapshot.total) return fail('TOTAL_MISMATCH');
  return deepFreeze({ ok: true, status: 'ready' });
}

export function projectRemainingDeckForViewer(snapshot, { viewer = null, viewerKnowledge = null } = {}) {
  const validation = validateAuthoritativeRemainingDeckSnapshot(snapshot);
  if (!validation.ok) return validation;
  if (viewerKnowledge === null || viewerKnowledge === undefined) return deepFreeze(baseProjection(snapshot));
  const viewerId = viewer?.authenticated === true && validCanonicalString(viewer?.id) ? viewer.id : null;
  if (viewerId === null) return fail('VIEWER_AUTHENTICATION_REQUIRED');
  return projectAuthorizedKnowledge(snapshot, viewerKnowledge, viewerId);
}

export const BATTLE_SELF_DECK_INSPECT_CORE = deepFreeze({
  schema: SCHEMA,
  viewerKnowledgeSchema: VIEWER_KNOWLEDGE_SCHEMA,
  projectionAuthority: 'CALLER_AUTHORIZED_VIEWER_KNOWLEDGE_ONLY',
  exposesAuthoritativeCardCounts: false,
  exposesDeckOrder: false
});
