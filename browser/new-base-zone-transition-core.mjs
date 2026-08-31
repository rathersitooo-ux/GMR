const SCHEMA = 'gameroad.new-base-zone-transition.v1';
const KINDS = new Set(['FIELD', 'ROAD_SLOT', 'SHIELD', 'GOAL']);
const ALLOWED_PAIRS = new Set([
  'FIELD|ROAD_SLOT',
  'ROAD_SLOT|SHIELD',
  'GOAL|SHIELD',
]);

function token(value) {
  return typeof value === 'string' && value && value.trim() === value && value.length <= 160
    ? value
    : null;
}

function pairKey(a, b) {
  return [a, b].sort().join('|');
}

function fail(reason) {
  return Object.freeze({
    schema: SCHEMA,
    ok: false,
    reason,
    adjacencyByPosition: Object.freeze({}),
    appliedTransitionCount: 0,
  });
}

/**
 * Adds only explicit cross-zone adjacency to an existing new-base graph payload.
 *
 * Caller remains authoritative for exact ids, lane/owner/team mapping, edge direction,
 * ROAD7/GOAL-open gating and which transition records are enabled. This module does not
 * pathfind, infer reverse edges, create positions, decide movement legality, or emit Result.
 */
export function composeNewBaseZoneTransitions({
  validPositionIds = [],
  positionKindByPosition = {},
  adjacencyByPosition = {},
  transitions = [],
} = {}) {
  if (!Array.isArray(validPositionIds) || !Array.isArray(transitions)) {
    return fail('INVALID_INPUT');
  }
  if (!positionKindByPosition || typeof positionKindByPosition !== 'object' || Array.isArray(positionKindByPosition)) {
    return fail('INVALID_KIND_MAP');
  }
  if (!adjacencyByPosition || typeof adjacencyByPosition !== 'object' || Array.isArray(adjacencyByPosition)) {
    return fail('INVALID_ADJACENCY');
  }

  const ids = [];
  const idSet = new Set();
  const kinds = {};
  for (const rawId of validPositionIds) {
    const id = token(rawId);
    if (!id) return fail('INVALID_POSITION_ID');
    if (idSet.has(id)) return fail('DUPLICATE_POSITION_ID');
    idSet.add(id);
    ids.push(id);
    const kind = positionKindByPosition[id];
    if (!KINDS.has(kind)) return fail('INVALID_POSITION_KIND');
    kinds[id] = kind;
  }
  for (const id of Object.keys(positionKindByPosition)) {
    if (!idSet.has(id)) return fail('UNKNOWN_POSITION_ID');
  }

  const neighbors = new Map(ids.map(id => [id, []]));
  const seenById = new Map(ids.map(id => [id, new Set()]));
  const add = (from, to) => {
    if (!seenById.get(from).has(to)) {
      seenById.get(from).add(to);
      neighbors.get(from).push(to);
    }
  };

  for (const from of Object.keys(adjacencyByPosition)) {
    if (!idSet.has(from) || !Array.isArray(adjacencyByPosition[from])) return fail('INVALID_ADJACENCY');
    for (const rawTo of adjacencyByPosition[from]) {
      const to = token(rawTo);
      if (!to || !idSet.has(to)) return fail('UNKNOWN_POSITION_ID');
      if (kinds[from] !== kinds[to]) return fail('CROSS_ZONE_EDGE_MUST_BE_EXPLICIT');
      add(from, to);
    }
  }

  let appliedTransitionCount = 0;
  for (const transition of transitions) {
    if (!transition || typeof transition !== 'object' || Array.isArray(transition)) return fail('INVALID_TRANSITION');
    const from = token(transition.from);
    const to = token(transition.to);
    if (!from || !to || !idSet.has(from) || !idSet.has(to)) return fail('UNKNOWN_POSITION_ID');
    if (from === to) return fail('INVALID_TRANSITION');
    if (typeof transition.enabled !== 'undefined' && typeof transition.enabled !== 'boolean') return fail('INVALID_TRANSITION');
    if (typeof transition.bidirectional !== 'undefined' && typeof transition.bidirectional !== 'boolean') return fail('INVALID_TRANSITION');
    if (kinds[from] === kinds[to] || !ALLOWED_PAIRS.has(pairKey(kinds[from], kinds[to]))) {
      return fail('INVALID_ZONE_TRANSITION');
    }
    if (transition.enabled === false) continue;
    add(from, to);
    if (transition.bidirectional === true) add(to, from);
    appliedTransitionCount += 1;
  }

  const adjacency = {};
  for (const id of ids) adjacency[id] = Object.freeze(neighbors.get(id));

  return Object.freeze({
    schema: SCHEMA,
    ok: true,
    reason: null,
    adjacencyByPosition: Object.freeze(adjacency),
    appliedTransitionCount,
  });
}
