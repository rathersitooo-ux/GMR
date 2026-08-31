const SCHEMA = 'gameroad.road-card-soft-focus-projection.v1';

function normalizeCardId(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${label}_REQUIRED`);
  }
  return value;
}

function normalizeCompatibleRoadCardIds(values) {
  if (!Array.isArray(values)) throw new TypeError('COMPATIBLE_ROAD_CARD_IDS_REQUIRED');
  const normalized = values.map((value, index) => normalizeCardId(value, `COMPATIBLE_ROAD_CARD_ID_${index}`));
  if (new Set(normalized).size !== normalized.length) {
    throw new TypeError('COMPATIBLE_ROAD_CARD_IDS_DUPLICATE');
  }
  return Object.freeze([...normalized]);
}

function normalizeFocusedRoadCardId(value) {
  if (value === null || value === undefined) return null;
  return normalizeCardId(value, 'FOCUSED_ROAD_CARD_ID');
}

function freezeProjection(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freezeProjection(child);
  }
  return value;
}

/**
 * Presentation-only projection for the "one compatible Road card remains" case.
 *
 * This function deliberately does not own compatibility, DraftMove, selection,
 * submission, or Battle-card state. Its inputs are derived elsewhere from the
 * current path/hand/board. A sole compatible card may receive visual soft focus,
 * but explicit focus is never rewritten and no formal action is emitted.
 */
export function projectRoadCardSoftFocus({
  compatibleRoadCardIds = [],
  focusedRoadCardId = null,
} = {}) {
  const compatible = normalizeCompatibleRoadCardIds(compatibleRoadCardIds);
  const focused = normalizeFocusedRoadCardId(focusedRoadCardId);
  const soleCompatibleRoadCardId = compatible.length === 1 ? compatible[0] : null;
  const focusedIsCompatible = focused !== null && compatible.includes(focused);
  const softFocusRoadCardId = soleCompatibleRoadCardId !== null && !focusedIsCompatible
    ? soleCompatibleRoadCardId
    : null;

  return freezeProjection({
    schema: SCHEMA,
    compatibleRoadCardIds: compatible,
    focusedRoadCardId: focused,
    soleCompatibleRoadCardId,
    softFocusRoadCardId,
    presentation: softFocusRoadCardId === null
      ? null
      : {
          roadCardId: softFocusRoadCardId,
          state: 'SOLE_COMPATIBLE_SOFT_FOCUS',
          strongerCandidateEmphasis: true,
          commitsSelection: false,
        },
    selectionEffect: 'NONE',
    submitEffect: 'NONE',
  });
}

export const ROAD_CARD_SOFT_FOCUS_PROJECTION_SCHEMA = SCHEMA;
