export const ROAD_CARD_STATE = Object.freeze({
  NORMAL: 'NORMAL',
  COMPATIBLE: 'COMPATIBLE',
  FOCUSED: 'FOCUSED',
  INVALID_FOCUS: 'INVALID_FOCUS',
});

const ALLOWED_DRAFT_FIELDS = new Set(['currentPath', 'focusedRoadCard', 'boardVersion']);
const MIN_ROAD_VALUE = 1;
const MAX_ROAD_VALUE = 6;

function safeCall(fn, args, receiver = null) {
  if (typeof fn !== 'function') return { ok: false, value: undefined };
  try {
    return { ok: true, value: fn.apply(receiver, args) };
  } catch {
    return { ok: false, value: undefined };
  }
}

function freezeList(value, label) {
  if (!Array.isArray(value)) throw new TypeError(`${label}_INVALID`);
  return Object.freeze([...value]);
}

function assertDraftFields(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label}_INVALID`);
  for (const key of Object.keys(value)) {
    if (!ALLOWED_DRAFT_FIELDS.has(key)) throw new TypeError(`DRAFT_MOVE_FIELD_FORBIDDEN:${key}`);
  }
}

function normalizeContext(context = {}) {
  if (!context || typeof context !== 'object' || Array.isArray(context)) throw new TypeError('DRAFT_MOVE_CONTEXT_INVALID');
  if (!Array.isArray(context.handRoadCards)) throw new TypeError('HAND_ROAD_CARDS_INVALID');
  if (!context.boardState || typeof context.boardState !== 'object') throw new TypeError('BOARD_STATE_INVALID');
  return {
    handRoadCards: Object.freeze([...context.handRoadCards]),
    boardState: context.boardState,
    reachableForCard: typeof context.reachableForCard === 'function' ? context.reachableForCard : null,
    targetKeyOf: typeof context.targetKeyOf === 'function' ? context.targetKeyOf : target => target,
    reducedMotion: context.reducedMotion === true,
    lowPerf: context.lowPerf === true,
  };
}

function roadValueOf(card, boardState) {
  const out = safeCall(boardState?.roadValueOf, [card], boardState);
  return out.ok && Number.isSafeInteger(out.value) && out.value >= MIN_ROAD_VALUE && out.value <= MAX_ROAD_VALUE
    ? out.value
    : null;
}

function pathFacts(path, boardState) {
  const stepOut = typeof boardState?.pathStepCountOf === 'function'
    ? safeCall(boardState.pathStepCountOf, [path], boardState)
    : { ok: true, value: path.length - 1 };
  const stepCount = stepOut.ok && Number.isSafeInteger(stepOut.value) && stepOut.value >= 0 ? stepOut.value : null;
  const legal = safeCall(boardState?.isPathLegal, [path], boardState);
  const stoppable = safeCall(boardState?.isPathStoppable, [path], boardState);
  return Object.freeze({
    stepCount,
    pathLegal: legal.ok && legal.value === true,
    pathStoppable: stoppable.ok && stoppable.value === true,
  });
}

function cardKeyOf(card, boardState) {
  if (typeof boardState?.cardKeyOf === 'function') {
    const out = safeCall(boardState.cardKeyOf, [card], boardState);
    if (out.ok && (typeof out.value === 'string' || typeof out.value === 'number')) return `${typeof out.value}:${String(out.value)}`;
  }
  if (card && typeof card === 'object' && (typeof card.id === 'string' || typeof card.id === 'number')) {
    return `id:${String(card.id)}`;
  }
  if (typeof card === 'string' || typeof card === 'number') return `${typeof card}:${String(card)}`;
  return null;
}

function sameRoadCard(left, right, boardState) {
  if (left == null || right == null) return false;
  if (typeof boardState?.sameRoadCard === 'function') {
    const out = safeCall(boardState.sameRoadCard, [left, right], boardState);
    if (out.ok) return out.value === true;
  }
  const a = cardKeyOf(left, boardState);
  const b = cardKeyOf(right, boardState);
  return a !== null && b !== null && a === b;
}

function includesRoadCard(cards, target, boardState) {
  return cards.some(card => sameRoadCard(card, target, boardState));
}

export function compatible(card, path, boardState) {
  if (!Array.isArray(path) || path.length < 1 || !boardState || typeof boardState !== 'object') return false;
  const roadValue = roadValueOf(card, boardState);
  if (roadValue === null) return false;
  const facts = pathFacts(path, boardState);
  if (facts.stepCount === null || facts.stepCount > roadValue) return false;
  return facts.pathLegal && facts.pathStoppable;
}

export function compatibleRoadCards(handRoadCards, path, boardState) {
  if (!Array.isArray(handRoadCards)) return Object.freeze([]);
  return Object.freeze(handRoadCards.filter(card => compatible(card, path, boardState)));
}

function presentationFor(state, { softFocus = false, reducedMotion = false, lowPerf = false } = {}) {
  const base = {
    [ROAD_CARD_STATE.NORMAL]: { lift: 0, outline: 0, brightness: 1, scale: 1 },
    [ROAD_CARD_STATE.COMPATIBLE]: { lift: 8, outline: 2, brightness: 1.08, scale: 1.03 },
    [ROAD_CARD_STATE.FOCUSED]: { lift: 14, outline: 3, brightness: 1.16, scale: 1.06 },
    [ROAD_CARD_STATE.INVALID_FOCUS]: { lift: 4, outline: 3, brightness: 0.9, scale: 1.01 },
  }[state];
  const adjusted = softFocus && state === ROAD_CARD_STATE.COMPATIBLE
    ? { lift: 11, outline: 3, brightness: 1.12, scale: 1.045 }
    : base;
  return Object.freeze({
    ...adjusted,
    animate: !(reducedMotion || lowPerf),
    colorIndependent: true,
  });
}

function currentBoardVersion(boardState) {
  if (typeof boardState?.currentBoardVersionOf === 'function') {
    const out = safeCall(boardState.currentBoardVersionOf, [], boardState);
    return out.ok ? { available: true, value: out.value } : { available: false, value: null };
  }
  if (Object.prototype.hasOwnProperty.call(boardState ?? {}, 'currentBoardVersion')) {
    return { available: true, value: boardState.currentBoardVersion };
  }
  return { available: false, value: null };
}

function uniqueTargets(cards, context, path) {
  if (!context.reachableForCard) return Object.freeze([]);
  const seen = new Set();
  const out = [];
  for (const card of cards) {
    const result = safeCall(context.reachableForCard, [card, path, context.boardState]);
    if (!result.ok || !Array.isArray(result.value)) continue;
    for (const target of result.value) {
      const keyResult = safeCall(context.targetKeyOf, [target]);
      if (!keyResult.ok || keyResult.value == null) continue;
      const key = `${typeof keyResult.value}:${String(keyResult.value)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(target);
    }
  }
  return Object.freeze(out);
}

function deriveDraft(canonical, rawContext) {
  const context = normalizeContext(rawContext);
  const path = freezeList(canonical.currentPath, 'CURRENT_PATH');
  if (path.length < 1) throw new RangeError('CURRENT_PATH_REQUIRES_START');
  const focusedRoadCard = canonical.focusedRoadCard ?? null;
  const compatibleCards = compatibleRoadCards(context.handRoadCards, path, context.boardState);
  const focusCompatible = focusedRoadCard == null ? false : includesRoadCard(compatibleCards, focusedRoadCard, context.boardState);
  const focusState = focusedRoadCard == null
    ? null
    : focusCompatible
      ? ROAD_CARD_STATE.FOCUSED
      : ROAD_CARD_STATE.INVALID_FOCUS;
  const soleCompatibleRoadCard = compatibleCards.length === 1 ? compatibleCards[0] : null;
  const softFocusRoadCard = focusState === ROAD_CARD_STATE.FOCUSED ? null : soleCompatibleRoadCard;
  const facts = pathFacts(path, context.boardState);
  const version = currentBoardVersion(context.boardState);
  const boardVersionMatches = version.available ? Object.is(canonical.boardVersion ?? null, version.value) : null;
  const resolvedRoadCard = focusState === ROAD_CARD_STATE.FOCUSED
    ? compatibleCards.find(card => sameRoadCard(card, focusedRoadCard, context.boardState)) ?? null
    : soleCompatibleRoadCard;
  const canConfirm = facts.stepCount !== null
    && facts.stepCount > 0
    && facts.pathLegal
    && facts.pathStoppable
    && resolvedRoadCard !== null;

  const cardStates = Object.freeze(context.handRoadCards.map(card => {
    const isFocused = focusedRoadCard != null && sameRoadCard(card, focusedRoadCard, context.boardState);
    const isCompatible = includesRoadCard(compatibleCards, card, context.boardState);
    const state = isFocused
      ? (isCompatible ? ROAD_CARD_STATE.FOCUSED : ROAD_CARD_STATE.INVALID_FOCUS)
      : (isCompatible ? ROAD_CARD_STATE.COMPATIBLE : ROAD_CARD_STATE.NORMAL);
    const isSoftFocus = softFocusRoadCard != null && sameRoadCard(card, softFocusRoadCard, context.boardState);
    return Object.freeze({
      card,
      state,
      softFocus: isSoftFocus,
      selectable: isCompatible,
      presentation: presentationFor(state, { softFocus: isSoftFocus, reducedMotion: context.reducedMotion, lowPerf: context.lowPerf }),
    });
  }));

  const strongCards = focusState === ROAD_CARD_STATE.FOCUSED && focusedRoadCard != null ? [focusedRoadCard] : [];
  const expansionCards = focusState === ROAD_CARD_STATE.FOCUSED
    ? compatibleCards.filter(card => !sameRoadCard(card, focusedRoadCard, context.boardState))
    : [...compatibleCards];
  const strongReachablePositionIds = uniqueTargets(strongCards, context, path);
  const strongKeys = new Set(strongReachablePositionIds.map(target => {
    const out = safeCall(context.targetKeyOf, [target]);
    return out.ok ? `${typeof out.value}:${String(out.value)}` : null;
  }).filter(Boolean));
  const expandableReachablePositionIds = Object.freeze(uniqueTargets(expansionCards, context, path).filter(target => {
    const out = safeCall(context.targetKeyOf, [target]);
    if (!out.ok || out.value == null) return false;
    return !strongKeys.has(`${typeof out.value}:${String(out.value)}`);
  }));

  return Object.freeze({
    currentPath: path,
    focusedRoadCard,
    compatibleRoadCards: compatibleCards,
    boardVersion: canonical.boardVersion ?? null,
    validity: Object.freeze({
      stepCount: facts.stepCount,
      pathLegal: facts.pathLegal,
      pathStoppable: facts.pathStoppable,
      hasCompatibleRoadCard: compatibleCards.length > 0,
      focusState,
      boardVersionMatches,
      requiresExplicitChoice: compatibleCards.length > 1 && focusState !== ROAD_CARD_STATE.FOCUSED,
      canConfirm: Boolean(canConfirm),
    }),
    soleCompatibleRoadCard,
    softFocusRoadCard,
    autoSelectedRoadCard: null,
    cardStates,
    strongReachablePositionIds,
    expandableReachablePositionIds,
  });
}

export function createDraftMove(initial, context) {
  assertDraftFields(initial, 'DRAFT_MOVE');
  return deriveDraft({
    currentPath: initial.currentPath,
    focusedRoadCard: initial.focusedRoadCard ?? null,
    boardVersion: initial.boardVersion ?? null,
  }, context);
}

export function updateDraftMove(draft, patch, context) {
  if (!draft || typeof draft !== 'object' || Array.isArray(draft)) throw new TypeError('DRAFT_MOVE_INVALID');
  assertDraftFields(patch, 'DRAFT_MOVE_PATCH');
  return deriveDraft({
    currentPath: Object.prototype.hasOwnProperty.call(patch, 'currentPath') ? patch.currentPath : draft.currentPath,
    focusedRoadCard: Object.prototype.hasOwnProperty.call(patch, 'focusedRoadCard') ? (patch.focusedRoadCard ?? null) : (draft.focusedRoadCard ?? null),
    boardVersion: Object.prototype.hasOwnProperty.call(patch, 'boardVersion') ? (patch.boardVersion ?? null) : (draft.boardVersion ?? null),
  }, context);
}

export function reconcileDraftMovePath(draft, nextPath, context) {
  return updateDraftMove(draft, { currentPath: nextPath }, context);
}

export function focusRoadCard(draft, card, context) {
  const fresh = deriveDraft({ currentPath: draft.currentPath, focusedRoadCard: draft.focusedRoadCard ?? null, boardVersion: draft.boardVersion ?? null }, context);
  if (!includesRoadCard(fresh.compatibleRoadCards, card, context.boardState)) return fresh;
  return updateDraftMove(fresh, { focusedRoadCard: card }, context);
}

export function clearRoadFocus(draft, context) {
  return updateDraftMove(draft, { focusedRoadCard: null }, context);
}

export function undoDraftMoveStep(draft, context) {
  if (!Array.isArray(draft?.currentPath) || draft.currentPath.length < 1) throw new TypeError('DRAFT_MOVE_INVALID');
  const nextPath = draft.currentPath.length > 1 ? draft.currentPath.slice(0, -1) : [...draft.currentPath];
  return updateDraftMove(draft, { currentPath: nextPath }, context);
}

export function cancelDraftMove(draft, context) {
  if (!Array.isArray(draft?.currentPath) || draft.currentPath.length < 1) throw new TypeError('DRAFT_MOVE_INVALID');
  return updateDraftMove(draft, { currentPath: [draft.currentPath[0]], focusedRoadCard: null }, context);
}

export function confirmDraftMove(draft, context) {
  const fresh = deriveDraft({ currentPath: draft.currentPath, focusedRoadCard: draft.focusedRoadCard ?? null, boardVersion: draft.boardVersion ?? null }, context);
  const version = currentBoardVersion(context.boardState);
  if (!version.available) return Object.freeze({ ok: false, reason: 'BOARD_VERSION_UNAVAILABLE', draft: fresh });
  if (!Object.is(fresh.boardVersion, version.value)) return Object.freeze({ ok: false, reason: 'BOARD_VERSION_STALE', draft: fresh });
  if (!(fresh.validity.stepCount > 0)) return Object.freeze({ ok: false, reason: 'PATH_EMPTY', draft: fresh });
  if (!fresh.validity.pathLegal) return Object.freeze({ ok: false, reason: 'PATH_ILLEGAL', draft: fresh });
  if (!fresh.validity.pathStoppable) return Object.freeze({ ok: false, reason: 'PATH_NOT_STOPPABLE', draft: fresh });

  const explicit = fresh.validity.focusState === ROAD_CARD_STATE.FOCUSED;
  const roadCard = explicit
    ? fresh.compatibleRoadCards.find(card => sameRoadCard(card, fresh.focusedRoadCard, context.boardState)) ?? null
    : (fresh.compatibleRoadCards.length === 1 ? fresh.compatibleRoadCards[0] : null);
  if (roadCard == null) {
    return Object.freeze({
      ok: false,
      reason: fresh.compatibleRoadCards.length > 1 ? 'ROAD_CARD_CHOICE_REQUIRED' : 'NO_COMPATIBLE_ROAD_CARD',
      draft: fresh,
    });
  }
  if (!includesRoadCard(context.handRoadCards, roadCard, context.boardState)) {
    return Object.freeze({ ok: false, reason: 'ROAD_CARD_NOT_OWNED', draft: fresh });
  }
  if (!compatible(roadCard, fresh.currentPath, context.boardState)) {
    return Object.freeze({ ok: false, reason: 'ROAD_CARD_PATH_INCOMPATIBLE', draft: fresh });
  }

  return Object.freeze({
    ok: true,
    reason: null,
    roadCard,
    currentPath: fresh.currentPath,
    boardVersion: fresh.boardVersion,
    selectionSource: explicit ? 'EXPLICIT_FOCUS' : 'SOLE_COMPATIBLE_AT_CONFIRM',
    autoSelectedRoadCard: null,
    draft: fresh,
  });
}
