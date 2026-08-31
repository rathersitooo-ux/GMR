const SCHEMA = 'gameroad.road-elastic-focus-projection.v1';
const FOCUSED = 'FOCUSED';
const INVALID_FOCUS = 'INVALID_FOCUS';

function safeCall(fn, args) {
  if (typeof fn !== 'function') return { ok: false, value: undefined };
  try {
    return { ok: true, value: fn(...args) };
  } catch {
    return { ok: false, value: undefined };
  }
}

function sameRoadCard(a, b, boardState) {
  if (a == null || b == null) return false;
  if (typeof boardState?.sameRoadCard === 'function') {
    const out = safeCall(boardState.sameRoadCard, [a, b]);
    return out.ok && out.value === true;
  }
  return a === b;
}

function roadValue(card, boardState) {
  const out = safeCall(boardState?.roadValueOf, [card]);
  if (!out.ok || !Number.isSafeInteger(out.value) || out.value < 1 || out.value > 6) return null;
  return out.value;
}

function reachable(card, currentPath, boardState, reachableForCard) {
  const out = safeCall(reachableForCard, [card, currentPath, boardState]);
  if (!out.ok || !Array.isArray(out.value)) return Object.freeze([]);
  return Object.freeze([...out.value]);
}

function uniqueTargets(targets, targetKeyOf) {
  const out = [];
  const seen = new Set();
  for (const target of targets) {
    const keyResult = safeCall(targetKeyOf, [target]);
    if (!keyResult.ok) continue;
    const key = keyResult.value;
    if (key == null || seen.has(key)) continue;
    seen.add(key);
    out.push(target);
  }
  return out;
}

function failed(reason, currentPath, focusedRoadCard) {
  return Object.freeze({
    schema: SCHEMA,
    ok: false,
    reason,
    currentPath,
    focusedRoadCard,
    focusState: null,
    strongReachablePositionIds: Object.freeze([]),
    expandableReachablePositionIds: Object.freeze([]),
    extensionRoadCards: Object.freeze([]),
    switchRoadCards: Object.freeze([]),
    preserveCurrentPath: true,
    pathMutation: 'none',
    focusAutoCleared: false,
    autoSelectedRoadCard: null,
    formalSelectionChanged: false,
    interactionMode: null,
  });
}

/**
 * Elastic Focus is a presentation projection over the shared draft state.
 *
 * The caller supplies already-derived compatibleRoadCards for currentPath and
 * the existing board reachability projection. This module does not own card/path
 * compatibility, the 109 graph, DraftMove, movement legality, or submission.
 *
 * While a focused card is valid, its reachable positions are the strong range.
 * Higher Road cards in hand may contribute only the extra reachable positions as
 * a weak/expandable range. If the focused card later becomes insufficient, the
 * path is preserved, focus stays INVALID_FOCUS until the user changes/clears it,
 * and compatible switch candidates are exposed without automatic selection.
 */
export function projectElasticFocus({
  handRoadCards = [],
  compatibleRoadCards = [],
  currentPath = null,
  focusedRoadCard = null,
  focusState = null,
  boardState = null,
  reachableForCard,
  targetKeyOf = target => target,
} = {}) {
  if (!Array.isArray(handRoadCards)) return failed('HAND_ROAD_CARDS_INVALID', currentPath, focusedRoadCard);
  if (!Array.isArray(compatibleRoadCards)) return failed('COMPATIBLE_ROAD_CARDS_INVALID', currentPath, focusedRoadCard);
  if (!boardState || typeof boardState !== 'object') return failed('BOARD_STATE_INVALID', currentPath, focusedRoadCard);
  if (typeof reachableForCard !== 'function') return failed('REACHABLE_PROJECTION_UNAVAILABLE', currentPath, focusedRoadCard);
  if (typeof targetKeyOf !== 'function') return failed('TARGET_KEY_UNAVAILABLE', currentPath, focusedRoadCard);
  if (focusState !== null && focusState !== FOCUSED && focusState !== INVALID_FOCUS) {
    return failed('FOCUS_STATE_INVALID', currentPath, focusedRoadCard);
  }

  const ownedFocus = focusedRoadCard == null
    ? null
    : handRoadCards.find(card => sameRoadCard(card, focusedRoadCard, boardState)) ?? null;

  const effectiveFocusState = focusedRoadCard == null
    ? null
    : ownedFocus == null
      ? INVALID_FOCUS
      : focusState;

  if (focusedRoadCard != null && effectiveFocusState == null) {
    return failed('FOCUS_STATE_REQUIRED', currentPath, focusedRoadCard);
  }

  const switchRoadCards = compatibleRoadCards.filter(card => !sameRoadCard(card, focusedRoadCard, boardState));

  let extensionRoadCards = [];
  let strongReachablePositionIds = [];

  if (effectiveFocusState === FOCUSED && ownedFocus != null) {
    const focusedValue = roadValue(ownedFocus, boardState);
    if (focusedValue === null) return failed('FOCUSED_ROAD_VALUE_UNAVAILABLE', currentPath, focusedRoadCard);

    strongReachablePositionIds = reachable(ownedFocus, currentPath, boardState, reachableForCard);
    extensionRoadCards = handRoadCards.filter(card => {
      if (sameRoadCard(card, ownedFocus, boardState)) return false;
      const value = roadValue(card, boardState);
      if (value === null || value <= focusedValue) return false;
      return reachable(card, currentPath, boardState, reachableForCard).length > 0;
    });
  } else if (effectiveFocusState === INVALID_FOCUS) {
    extensionRoadCards = [...switchRoadCards];
  }

  const strong = uniqueTargets(strongReachablePositionIds, targetKeyOf);
  const strongKeys = new Set(strong.map(target => safeCall(targetKeyOf, [target])).filter(out => out.ok).map(out => out.value));

  const expandableRaw = [];
  for (const card of extensionRoadCards) {
    expandableRaw.push(...reachable(card, currentPath, boardState, reachableForCard));
  }
  const expandable = uniqueTargets(expandableRaw, targetKeyOf).filter(target => {
    const key = safeCall(targetKeyOf, [target]);
    return key.ok && !strongKeys.has(key.value);
  });

  return Object.freeze({
    schema: SCHEMA,
    ok: true,
    reason: null,
    currentPath,
    focusedRoadCard,
    focusState: effectiveFocusState,
    strongReachablePositionIds: Object.freeze(strong),
    expandableReachablePositionIds: Object.freeze(expandable),
    extensionRoadCards: Object.freeze(extensionRoadCards),
    switchRoadCards: Object.freeze(switchRoadCards),
    preserveCurrentPath: true,
    pathMutation: 'none',
    focusAutoCleared: false,
    autoSelectedRoadCard: null,
    formalSelectionChanged: false,
    interactionMode: null,
  });
}
