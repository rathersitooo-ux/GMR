const FocusStatus = Object.freeze({
  NONE: 'NONE',
  FOCUSED: 'FOCUSED',
  INVALID_FOCUS: 'INVALID_FOCUS',
});

function requireCardId(value, label) {
  if ((typeof value !== 'string' && typeof value !== 'number') || String(value).length === 0) {
    throw new TypeError(`${label} must be a non-empty string or number`);
  }
  return value;
}

function normalizeCompatibleIds(ids) {
  if (!Array.isArray(ids)) {
    throw new TypeError('compatibleRoadCardIds must be an array');
  }

  const seen = new Set();
  return ids.map((id) => {
    const normalized = requireCardId(id, 'compatible road card id');
    const key = `${typeof normalized}:${String(normalized)}`;
    if (seen.has(key)) {
      throw new TypeError(`duplicate compatible road card id: ${String(normalized)}`);
    }
    seen.add(key);
    return normalized;
  });
}

function sameCardId(left, right) {
  return typeof left === typeof right && left === right;
}

function containsCardId(ids, target) {
  return ids.some((id) => sameCardId(id, target));
}

/**
 * Pure projection for the mid-flow Road-card/path relationship.
 * Compatibility is supplied by the existing/current board+hand consumer.
 * This module does not calculate reachability, path legality, Road values,
 * or any Battle-card state.
 */
export function projectRoadMoveSwitching({
  currentPath,
  focusedRoadCardId = null,
  compatibleRoadCardIds,
}) {
  if (!Array.isArray(currentPath)) {
    throw new TypeError('currentPath must be an array');
  }

  const compatible = normalizeCompatibleIds(compatibleRoadCardIds);
  const focused = focusedRoadCardId == null
    ? null
    : requireCardId(focusedRoadCardId, 'focusedRoadCardId');

  const focusStatus = focused == null
    ? FocusStatus.NONE
    : containsCardId(compatible, focused)
      ? FocusStatus.FOCUSED
      : FocusStatus.INVALID_FOCUS;

  return Object.freeze({
    currentPath,
    focusedRoadCardId: focused,
    compatibleRoadCardIds: Object.freeze([...compatible]),
    focusStatus,
    switchableRoadCardIds: Object.freeze(
      compatible.filter((id) => focused == null || !sameCardId(id, focused)),
    ),
  });
}

/**
 * Applies only user/input-order-neutral switching transitions.
 * - Path reconciliation never auto-changes focusedRoadCardId.
 * - Explicit Road-card focus never changes currentPath.
 * - Clearing Road-card focus never changes currentPath.
 */
export function transitionRoadMoveSwitching(view, event) {
  if (!view || typeof view !== 'object') {
    throw new TypeError('view is required');
  }
  if (!event || typeof event !== 'object') {
    throw new TypeError('event is required');
  }

  switch (event.type) {
    case 'PATH_RECONCILED':
      return projectRoadMoveSwitching({
        currentPath: event.currentPath,
        focusedRoadCardId: view.focusedRoadCardId,
        compatibleRoadCardIds: event.compatibleRoadCardIds,
      });

    case 'FOCUS_ROAD_CARD': {
      const cardId = requireCardId(event.cardId, 'event.cardId');
      if (!containsCardId(view.compatibleRoadCardIds, cardId)) {
        return view;
      }
      return projectRoadMoveSwitching({
        currentPath: view.currentPath,
        focusedRoadCardId: cardId,
        compatibleRoadCardIds: view.compatibleRoadCardIds,
      });
    }

    case 'CLEAR_ROAD_FOCUS':
      return projectRoadMoveSwitching({
        currentPath: view.currentPath,
        focusedRoadCardId: null,
        compatibleRoadCardIds: view.compatibleRoadCardIds,
      });

    default:
      throw new TypeError(`unsupported road/move switch event: ${String(event.type)}`);
  }
}

export { FocusStatus as RoadMoveFocusStatus };
