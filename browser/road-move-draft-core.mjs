const FOCUS_STATE = Object.freeze({
  NONE: 'NONE',
  FOCUSED: 'FOCUSED',
  INVALID_FOCUS: 'INVALID_FOCUS',
});

const DERIVED_FIELDS = new Set([
  'compatibleRoadCards', 'validity', 'focusState', 'softFocusRoadCard',
  'switchRoadCards', 'strongReachablePositions', 'expandableReachablePositions',
  'decisionRoadCard', 'canDecide', 'requiresRoadCardChoice',
]);

function safeCall(fn, args, receiver = null) {
  if (typeof fn !== 'function') return { ok: false, value: undefined };
  try { return { ok: true, value: fn.apply(receiver, args) }; }
  catch { return { ok: false, value: undefined }; }
}

function freezeList(value, label) {
  if (!Array.isArray(value)) throw new TypeError(`${label}_INVALID`);
  return Object.freeze([...value]);
}

function roadValueOf(card, boardState) {
  const out = safeCall(boardState?.roadValueOf, [card], boardState);
  return out.ok && Number.isSafeInteger(out.value) && out.value >= 1 && out.value <= 6
    ? out.value
    : null;
}

function pathStepCountOf(path, boardState) {
  const out = safeCall(boardState?.pathStepCountOf, [path], boardState);
  return out.ok && Number.isSafeInteger(out.value) && out.value >= 0 ? out.value : null;
}

function predicate(fn, path, boardState) {
  const out = safeCall(fn, [path], boardState);
  return out.ok && out.value === true;
}

function sameRoadCard(left, right, boardState) {
  if (left == null || right == null) return false;
  const out = safeCall(boardState?.sameRoadCard, [left, right], boardState);
  return out.ok ? out.value === true : left === right;
}

function ownedRoadCard(card, handRoadCards, boardState) {
  return handRoadCards.find(candidate => sameRoadCard(candidate, card, boardState)) ?? null;
}

function uniqueTargets(values, targetKeyOf) {
  const out = [];
  const seen = new Set();
  for (const value of values) {
    const key = safeCall(targetKeyOf, [value]);
    if (!key.ok || key.value == null || seen.has(key.value)) continue;
    seen.add(key.value);
    out.push(value);
  }
  return Object.freeze(out);
}

function reachableFor(card, path, boardState, reachableForCard) {
  const out = safeCall(reachableForCard, [card, path, boardState]);
  return out.ok && Array.isArray(out.value) ? out.value : [];
}

function projectDraft(canonical, context) {
  if (!context || typeof context !== 'object') throw new TypeError('CONTEXT_INVALID');
  if (typeof context.deriveCompatibleRoadCards !== 'function') {
    throw new TypeError('COMPATIBLE_DERIVER_REQUIRED');
  }

  const handRoadCards = freezeList(context.handRoadCards ?? [], 'HAND_ROAD_CARDS');
  const boardState = context.boardState;
  if (!boardState || typeof boardState !== 'object') throw new TypeError('BOARD_STATE_INVALID');

  const currentPath = freezeList(canonical.currentPath ?? [], 'CURRENT_PATH');
  const focusedRoadCard = canonical.focusedRoadCard ?? null;
  const boardVersion = canonical.boardVersion ?? null;
  const steps = pathStepCountOf(currentPath, boardState);
  const hasMovement = steps != null && steps > 0;
  const pathLegal = hasMovement && predicate(boardState.isPathLegal, currentPath, boardState);
  const stoppable = pathLegal && predicate(boardState.isPathStoppable, currentPath, boardState);

  const derived = safeCall(
    context.deriveCompatibleRoadCards,
    [handRoadCards, currentPath, boardState],
  );
  if (!derived.ok || !Array.isArray(derived.value)) throw new TypeError('COMPATIBLE_DERIVATION_INVALID');
  const compatibleRoadCards = Object.freeze([...derived.value]);

  const ownedFocus = focusedRoadCard == null ? null : ownedRoadCard(focusedRoadCard, handRoadCards, boardState);
  const focusCompatible = ownedFocus != null
    && compatibleRoadCards.some(card => sameRoadCard(card, ownedFocus, boardState));
  const focusState = focusedRoadCard == null
    ? FOCUS_STATE.NONE
    : (!hasMovement && ownedFocus != null) || focusCompatible
      ? FOCUS_STATE.FOCUSED
      : FOCUS_STATE.INVALID_FOCUS;

  const switchRoadCards = Object.freeze(
    compatibleRoadCards.filter(card => !sameRoadCard(card, focusedRoadCard, boardState)),
  );
  const validFocusedCard = focusState === FOCUS_STATE.FOCUSED && hasMovement ? ownedFocus : null;
  const decisionRoadCard = validFocusedCard ?? (compatibleRoadCards.length === 1 ? compatibleRoadCards[0] : null);
  const canDecide = stoppable && decisionRoadCard != null;
  const requiresRoadCardChoice = stoppable && validFocusedCard == null && compatibleRoadCards.length > 1;
  const softFocusRoadCard = focusedRoadCard == null && compatibleRoadCards.length === 1
    ? compatibleRoadCards[0]
    : null;

  let strongReachablePositions = Object.freeze([]);
  let expandableReachablePositions = Object.freeze([]);
  if (typeof context.reachableForCard === 'function') {
    const targetKeyOf = typeof context.targetKeyOf === 'function' ? context.targetKeyOf : value => value;
    let extensionRoadCards = [];
    if (focusState === FOCUS_STATE.FOCUSED && ownedFocus != null) {
      strongReachablePositions = uniqueTargets(
        reachableFor(ownedFocus, currentPath, boardState, context.reachableForCard),
        targetKeyOf,
      );
      const focusedValue = roadValueOf(ownedFocus, boardState);
      extensionRoadCards = handRoadCards.filter(card => {
        const value = roadValueOf(card, boardState);
        return value != null && focusedValue != null && value > focusedValue;
      });
    } else if (focusState === FOCUS_STATE.INVALID_FOCUS) {
      extensionRoadCards = [...switchRoadCards];
    }

    const strongKeys = new Set(strongReachablePositions.map(target => safeCall(targetKeyOf, [target]))
      .filter(result => result.ok).map(result => result.value));
    const expandable = extensionRoadCards.flatMap(card => (
      reachableFor(card, currentPath, boardState, context.reachableForCard)
    ));
    expandableReachablePositions = Object.freeze(
      uniqueTargets(expandable, targetKeyOf).filter(target => {
        const key = safeCall(targetKeyOf, [target]);
        return key.ok && !strongKeys.has(key.value);
      }),
    );
  }

  return Object.freeze({
    currentPath,
    focusedRoadCard,
    compatibleRoadCards,
    boardVersion,
    validity: Object.freeze({ hasMovement, pathLegal, stoppable }),
    focusState,
    softFocusRoadCard,
    switchRoadCards,
    strongReachablePositions,
    expandableReachablePositions,
    decisionRoadCard,
    canDecide,
    requiresRoadCardChoice,
  });
}

export function createRoadMoveDraft(initial = {}, context) {
  return projectDraft({
    currentPath: initial.currentPath ?? [],
    focusedRoadCard: initial.focusedRoadCard ?? null,
    boardVersion: initial.boardVersion ?? null,
  }, context);
}

/** Recompute from current hand/path/board. Path and Road focus never auto-rewrite each other. */
export function updateRoadMoveDraft(draft, patch = {}, context) {
  if (!draft || typeof draft !== 'object' || Array.isArray(draft)) throw new TypeError('DRAFT_INVALID');
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new TypeError('PATCH_INVALID');
  for (const key of Object.keys(patch)) {
    if (DERIVED_FIELDS.has(key)) throw new TypeError('DERIVED_FIELD_WRITE_FORBIDDEN');
    if (!['currentPath', 'focusedRoadCard', 'boardVersion'].includes(key)) throw new TypeError('PATCH_FIELD_INVALID');
  }
  return projectDraft({
    currentPath: Object.prototype.hasOwnProperty.call(patch, 'currentPath') ? patch.currentPath : draft.currentPath,
    focusedRoadCard: Object.prototype.hasOwnProperty.call(patch, 'focusedRoadCard') ? patch.focusedRoadCard : draft.focusedRoadCard,
    boardVersion: Object.prototype.hasOwnProperty.call(patch, 'boardVersion') ? patch.boardVersion : draft.boardVersion,
  }, context);
}

export const ROAD_MOVE_FOCUS_STATE = FOCUS_STATE;
