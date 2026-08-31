function requireRoadCardIds(value) {
  if (!Array.isArray(value)) throw new TypeError('COMPATIBLE_ROAD_CARD_IDS_REQUIRED');
  const seen = new Set();
  const ids = value.map((id) => {
    if (typeof id !== 'string' || id.trim().length === 0) {
      throw new TypeError('COMPATIBLE_ROAD_CARD_ID_INVALID');
    }
    if (seen.has(id)) throw new TypeError(`DUPLICATE_COMPATIBLE_ROAD_CARD_ID:${id}`);
    seen.add(id);
    return id;
  });
  return Object.freeze(ids);
}

function optionalRoadCardId(value) {
  if (value == null) return null;
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError('FOCUSED_ROAD_CARD_ID_INVALID');
  }
  return value;
}

export function projectRoadCardsForPathInput({
  compatibleRoadCardIds,
  focusedRoadCardId = null,
} = {}) {
  const compatibleIds = requireRoadCardIds(compatibleRoadCardIds);
  const focusedId = optionalRoadCardId(focusedRoadCardId);
  const focusedStillCompatible = focusedId == null ? null : compatibleIds.includes(focusedId);

  return Object.freeze({
    compatibleRoadCardIds: compatibleIds,
    candidateCount: compatibleIds.length,
    hasCompatibleRoadCard: compatibleIds.length > 0,
    focusedRoadCardId: focusedId,
    focusedRoadCardStillCompatible: focusedStillCompatible,
    softFocusRoadCardId: focusedId == null && compatibleIds.length === 1 ? compatibleIds[0] : null,
    requiresExplicitChoice: compatibleIds.length > 1 && focusedStillCompatible !== true,
    autoSelectedRoadCardId: null,
  });
}

export function pathInputHasCompatibleRoadCard({ compatibleRoadCardIds } = {}) {
  return requireRoadCardIds(compatibleRoadCardIds).length > 0;
}
