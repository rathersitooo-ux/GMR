const SCHEMA = 'gameroad.new-base-board-graph.v1';
const ZONES = Object.freeze([
  Object.freeze({ key: 'goal', input: 'goalPositionIds', kind: 'GOAL' }),
  Object.freeze({ key: 'shield', input: 'shieldPositionIds', kind: 'SHIELD' }),
  Object.freeze({ key: 'roadSlot', input: 'roadSlotPositionIds', kind: 'ROAD_SLOT' }),
  Object.freeze({ key: 'field', input: 'fieldPositionIds', kind: 'FIELD' }),
]);

function exactToken(value) {
  if (typeof value !== 'string') return null;
  if (!value || value.trim() !== value || value.length > 160) return null;
  return value;
}

function emptyZonePositionIds() {
  return Object.freeze({
    goal: Object.freeze([]),
    shield: Object.freeze([]),
    roadSlot: Object.freeze([]),
    field: Object.freeze([]),
  });
}

function failed(reason) {
  return Object.freeze({
    schema: SCHEMA,
    ok: false,
    reason,
    revisionToken: null,
    validPositionIds: Object.freeze([]),
    zonePositionIds: emptyZonePositionIds(),
    positionKindByPosition: Object.freeze({}),
    adjacencyByPosition: Object.freeze({}),
  });
}

function normalizeZoneIds(values, seen) {
  if (!Array.isArray(values)) throw new Error('INVALID_POSITION_LIST');
  const out = [];
  for (const raw of values) {
    const id = exactToken(raw);
    if (!id) throw new Error('INVALID_POSITION_ID');
    if (seen.has(id)) throw new Error('DUPLICATE_POSITION_ID');
    seen.add(id);
    out.push(id);
  }
  return Object.freeze(out);
}

function normalizeAdjacency(raw, validPositionIds, validSet) {
  if (raw == null) raw = {};
  if (typeof raw !== 'object' || Array.isArray(raw)) throw new Error('INVALID_ADJACENCY');

  for (const rawId of Object.keys(raw)) {
    const id = exactToken(rawId);
    if (!id || !validSet.has(id)) throw new Error('UNKNOWN_POSITION_ID');
    if (!Array.isArray(raw[rawId])) throw new Error('INVALID_ADJACENCY');
  }

  const out = {};
  for (const id of validPositionIds) {
    const rawNeighbors = Object.prototype.hasOwnProperty.call(raw, id) ? raw[id] : [];
    const neighbors = [];
    const seenNeighbors = new Set();
    for (const rawNeighbor of rawNeighbors) {
      const neighborId = exactToken(rawNeighbor);
      if (!neighborId || !validSet.has(neighborId)) throw new Error('UNKNOWN_POSITION_ID');
      if (!seenNeighbors.has(neighborId)) {
        seenNeighbors.add(neighborId);
        neighbors.push(neighborId);
      }
    }
    out[id] = Object.freeze(neighbors);
  }
  return Object.freeze(out);
}

/**
 * Composes new-base board position producers into one validated graph data contract.
 *
 * This module intentionally does not:
 * - create GOAL, Shield, ROAD_SLOT, or FIELD positions;
 * - enforce zone counts or ownership/team identity;
 * - infer adjacency, reverse edges, columns, movement legality, costs, or stoppability;
 * - decide ROAD completion, GOAL opening, victory, Battle, Honey, reservation, or revalidation rules.
 *
 * `adjacencyByPosition` is therefore caller-owned graph data. A one-way entry remains one-way;
 * missing entries remain empty. Downstream movement authority may interpret or reject that data.
 */
export function composeNewBaseBoardGraph({
  goalPositionIds = [],
  shieldPositionIds = [],
  roadSlotPositionIds = [],
  fieldPositionIds = [],
  adjacencyByPosition = null,
  revisionToken = null,
} = {}) {
  const normalizedRevision = revisionToken == null ? null : exactToken(revisionToken);
  if (revisionToken != null && !normalizedRevision) return failed('INVALID_REVISION_TOKEN');

  const inputs = { goalPositionIds, shieldPositionIds, roadSlotPositionIds, fieldPositionIds };
  const seen = new Set();
  const zonePositionIds = {};
  const validPositionIds = [];
  const positionKindByPosition = {};

  try {
    for (const zone of ZONES) {
      const ids = normalizeZoneIds(inputs[zone.input], seen);
      zonePositionIds[zone.key] = ids;
      for (const id of ids) {
        validPositionIds.push(id);
        positionKindByPosition[id] = zone.kind;
      }
    }

    if (validPositionIds.length === 0) return failed('NO_POSITIONS');

    const frozenIds = Object.freeze(validPositionIds);
    const validSet = new Set(frozenIds);
    const adjacency = normalizeAdjacency(adjacencyByPosition, frozenIds, validSet);

    return Object.freeze({
      schema: SCHEMA,
      ok: true,
      reason: null,
      revisionToken: normalizedRevision,
      validPositionIds: frozenIds,
      zonePositionIds: Object.freeze(zonePositionIds),
      positionKindByPosition: Object.freeze(positionKindByPosition),
      adjacencyByPosition: adjacency,
    });
  } catch (error) {
    const known = new Set([
      'INVALID_POSITION_LIST',
      'INVALID_POSITION_ID',
      'DUPLICATE_POSITION_ID',
      'INVALID_ADJACENCY',
      'UNKNOWN_POSITION_ID',
    ]);
    return failed(known.has(error?.message) ? error.message : 'INVALID_GRAPH_INPUT');
  }
}
