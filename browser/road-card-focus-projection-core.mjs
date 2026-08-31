const SCHEMA = 'gameroad.road-card-focus-projection.v1';

export const ROAD_CARD_FOCUS_STATES = Object.freeze({
  NORMAL: 'NORMAL',
  COMPATIBLE: 'COMPATIBLE',
  FOCUSED: 'FOCUSED',
  INVALID_FOCUS: 'INVALID_FOCUS',
});

function safeCall(fn, args) {
  if (typeof fn !== 'function') return { ok: false, value: undefined };
  try {
    return { ok: true, value: fn(...args) };
  } catch {
    return { ok: false, value: undefined };
  }
}

function pathStepCount(currentPath, boardState) {
  const out = safeCall(boardState?.pathStepCountOf, [currentPath]);
  if (!out.ok || !Number.isSafeInteger(out.value) || out.value < 0) return null;
  return out.value;
}

function sameRoadCard(a, b, boardState) {
  if (a == null || b == null) return false;
  if (typeof boardState?.sameRoadCard === 'function') {
    const out = safeCall(boardState.sameRoadCard, [a, b]);
    return out.ok && out.value === true;
  }
  return a === b;
}

function compatibleNow(card, currentPath, boardState, isCompatible) {
  const out = safeCall(isCompatible, [card, currentPath, boardState]);
  return out.ok && out.value === true;
}

function reachableForFocus(card, currentPath, boardState, reachableForCard) {
  if (!card) return Object.freeze([]);
  const out = safeCall(reachableForCard, [card, currentPath, boardState]);
  if (!out.ok || !Array.isArray(out.value)) return Object.freeze([]);
  return Object.freeze([...out.value]);
}

function failed(reason, currentPath) {
  return Object.freeze({
    schema: SCHEMA,
    ok: false,
    reason,
    currentPath,
    focusedRoadCard: null,
    focusState: null,
    cardPresentations: Object.freeze([]),
    focusedReachablePositionIds: Object.freeze([]),
    autoSelectedRoadCard: null,
    pathMutation: 'none',
    interactionMode: null,
  });
}

/**
 * Presentation-only consumer for Road-card focus.
 *
 * It does not own DraftMove, Road-card decoding, movement legality, the 109 graph,
 * or submission. The caller supplies the current DraftMove values plus:
 *   - boardState.pathStepCountOf(path) -> current movement step count, including 0
 *   - isCompatible(card, path, boardState) -> shared Road/path compatibility predicate
 *   - reachableForCard(card, path, boardState) -> authoritative positions usable while focused
 *
 * Selecting a Road card first is represented only by focusedRoadCard. No CARD_FIRST
 * mode exists, the current path is never rewritten, and another compatible card is
 * never selected automatically.
 */
export function projectRoadCardFocus({
  handRoadCards = [],
  currentPath = null,
  focusedRoadCard = null,
  boardState = null,
  isCompatible,
  reachableForCard,
} = {}) {
  if (!Array.isArray(handRoadCards)) return failed('HAND_ROAD_CARDS_INVALID', currentPath);
  if (!boardState || typeof boardState !== 'object') return failed('BOARD_STATE_INVALID', currentPath);

  const steps = pathStepCount(currentPath, boardState);
  if (steps === null) return failed('PATH_STEP_COUNT_UNAVAILABLE', currentPath);

  const ownedFocus = focusedRoadCard == null
    ? null
    : handRoadCards.find(card => sameRoadCard(card, focusedRoadCard, boardState)) ?? null;

  const focusState = focusedRoadCard == null
    ? null
    : ownedFocus == null
      ? ROAD_CARD_FOCUS_STATES.INVALID_FOCUS
      : steps === 0 || compatibleNow(ownedFocus, currentPath, boardState, isCompatible)
        ? ROAD_CARD_FOCUS_STATES.FOCUSED
        : ROAD_CARD_FOCUS_STATES.INVALID_FOCUS;

  const cardPresentations = handRoadCards.map(card => {
    if (focusedRoadCard != null && sameRoadCard(card, focusedRoadCard, boardState)) {
      return Object.freeze({ card, state: focusState });
    }
    if (steps > 0 && compatibleNow(card, currentPath, boardState, isCompatible)) {
      return Object.freeze({ card, state: ROAD_CARD_FOCUS_STATES.COMPATIBLE });
    }
    return Object.freeze({ card, state: ROAD_CARD_FOCUS_STATES.NORMAL });
  });

  return Object.freeze({
    schema: SCHEMA,
    ok: true,
    reason: null,
    currentPath,
    focusedRoadCard,
    focusState,
    cardPresentations: Object.freeze(cardPresentations),
    focusedReachablePositionIds: reachableForFocus(ownedFocus, currentPath, boardState, reachableForCard),
    autoSelectedRoadCard: null,
    pathMutation: 'none',
    interactionMode: null,
  });
}
