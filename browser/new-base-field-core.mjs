const SCHEMA = 'gameroad.new-base-field.v1';

function exactToken(value) {
  if (typeof value !== 'string') return null;
  if (!value || value.trim() !== value || value.length > 160) return null;
  return value;
}

function failed(reason) {
  return Object.freeze({
    schema: SCHEMA,
    ok: false,
    reason,
    fieldPositionIds: Object.freeze([]),
    adjacencyByPosition: Object.freeze({}),
  });
}

function normalizeFieldPositionIds(values) {
  if (!Array.isArray(values)) throw new Error('INVALID_FIELD_POSITION_LIST');
  if (values.length === 0) throw new Error('NO_FIELD_POSITIONS');

  const seen = new Set();
  const out = [];
  for (const raw of values) {
    const id = exactToken(raw);
    if (!id) throw new Error('INVALID_FIELD_POSITION_ID');
    if (seen.has(id)) throw new Error('DUPLICATE_FIELD_POSITION_ID');
    seen.add(id);
    out.push(id);
  }
  return Object.freeze(out);
}

function normalizeInternalAdjacency(raw, fieldPositionIds) {
  if (raw == null) raw = {};
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('INVALID_FIELD_ADJACENCY');
  }

  const validSet = new Set(fieldPositionIds);
  for (const rawId of Object.keys(raw)) {
    const id = exactToken(rawId);
    if (!id || !validSet.has(id)) throw new Error('UNKNOWN_FIELD_POSITION_ID');
    if (!Array.isArray(raw[rawId])) throw new Error('INVALID_FIELD_ADJACENCY');
  }

  const out = {};
  for (const id of fieldPositionIds) {
    const rawNeighbors = Object.prototype.hasOwnProperty.call(raw, id) ? raw[id] : [];
    const neighbors = [];
    const seenNeighbors = new Set();

    for (const rawNeighbor of rawNeighbors) {
      const neighborId = exactToken(rawNeighbor);
      if (!neighborId || !validSet.has(neighborId)) {
        throw new Error('UNKNOWN_FIELD_POSITION_ID');
      }
      if (seenNeighbors.has(neighborId)) {
        throw new Error('DUPLICATE_FIELD_ADJACENCY_TARGET');
      }
      seenNeighbors.add(neighborId);
      neighbors.push(neighborId);
    }

    out[id] = Object.freeze(neighbors);
  }

  return Object.freeze(out);
}

/**
 * Builds only the new-base FIELD structural producer.
 *
 * Caller authority owns the opaque FIELD position IDs and FIELD-internal adjacency.
 * This module intentionally does not create IDs, coordinates, a grid, reverse edges,
 * cross-zone FIELD->ROAD edges, movement legality/costs, dice budget, reservations,
 * collision outcomes, Honey effects, ownership, ROAD progression, GOAL, or victory.
 */
export function createNewBaseField({
  fieldPositionIds,
  adjacencyByPosition = null,
} = {}) {
  try {
    const normalizedFieldPositionIds = normalizeFieldPositionIds(fieldPositionIds);
    const normalizedAdjacency = normalizeInternalAdjacency(
      adjacencyByPosition,
      normalizedFieldPositionIds,
    );

    return Object.freeze({
      schema: SCHEMA,
      ok: true,
      reason: null,
      fieldPositionIds: normalizedFieldPositionIds,
      adjacencyByPosition: normalizedAdjacency,
    });
  } catch (error) {
    const known = new Set([
      'INVALID_FIELD_POSITION_LIST',
      'NO_FIELD_POSITIONS',
      'INVALID_FIELD_POSITION_ID',
      'DUPLICATE_FIELD_POSITION_ID',
      'INVALID_FIELD_ADJACENCY',
      'UNKNOWN_FIELD_POSITION_ID',
      'DUPLICATE_FIELD_ADJACENCY_TARGET',
    ]);
    return failed(known.has(error?.message) ? error.message : 'INVALID_FIELD_INPUT');
  }
}
