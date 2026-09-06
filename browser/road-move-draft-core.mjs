import { compatibleRoadCards as deriveCompatibleRoadCards } from './road-move-compatibility-core.mjs';

const MIN_ROAD_VALUE = 1;
const MAX_ROAD_VALUE = 6;

export const ROAD_MOVE_CARD_PRESENTATION_STATE = Object.freeze({
  NORMAL: 'NORMAL',
  COMPATIBLE: 'COMPATIBLE',
  FOCUSED: 'FOCUSED',
  INVALID_FOCUS: 'INVALID_FOCUS',
});

export const ROAD_MOVE_DRAFT_VALIDITY = Object.freeze({
  UNASSESSED: 'UNASSESSED',
  VALID: 'VALID',
  INVALID: 'INVALID',
});

export const ROAD_MOVE_FOCUS_STATE = Object.freeze({
  NONE: 'NONE',
  FOCUSED: 'FOCUSED',
  INVALID_FOCUS: 'INVALID_FOCUS',
});

function normalizeValidity(value) {
  return Object.values(ROAD_MOVE_DRAFT_VALIDITY).includes(value)
    ? value
    : ROAD_MOVE_DRAFT_VALIDITY.UNASSESSED;
}

function requireDraft(draft) {
  if (!draft || typeof draft !== 'object' || Array.isArray(draft)) {
    throw new TypeError('draft must be a Road move draft object');
  }
  return draft;
}

function safeCall(fn, args, receiver) {
  if (typeof fn !== 'function') return { ok: false, value: undefined };
  try {
    return { ok: true, value: fn.apply(receiver, args) };
  } catch {
    return { ok: false, value: undefined };
  }
}

function safeIdentity(cardIdentityOf, card) {
  if (typeof cardIdentityOf !== 'function') return null;
  try {
    const value = cardIdentityOf(card);
    return value == null ? null : value;
  } catch {
    return null;
  }
}

function sameRoadCard(left, right, cardIdentityOf) {
  if (left === right) return left != null;
  if (left == null || right == null) return false;
  const leftIdentity = safeIdentity(cardIdentityOf, left);
  const rightIdentity = safeIdentity(cardIdentityOf, right);
  return leftIdentity !== null && rightIdentity !== null && Object.is(leftIdentity, rightIdentity);
}

function findSameCard(cards, target, cardIdentityOf) {
  if (target == null) return null;
  return cards.find((card) => sameRoadCard(card, target, cardIdentityOf)) ?? null;
}

function readRoadValue(card, boardState) {
  const result = safeCall(boardState?.roadValueOf, [card], boardState);
  if (!result.ok) return null;
  const value = result.value;
  if (!Number.isSafeInteger(value) || value < MIN_ROAD_VALUE || value > MAX_ROAD_VALUE) return null;
  return value;
}

function readNonNegativeStepCount(path, boardState) {
  const result = safeCall(boardState?.pathStepCountOf, [path], boardState);
  if (!result.ok) return null;
  const value = result.value;
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function freezeDraft({ currentPath, focusedRoadCard, boardVersion, validity }) {
  return Object.freeze({
    currentPath,
    focusedRoadCard: focusedRoadCard ?? null,
    boardVersion: boardVersion ?? null,
    validity: normalizeValidity(validity),
  });
}

/**
 * One order-independent, still-uncommitted movement plan.
 *
 * `compatibleRoadCards` is deliberately absent: it is always derived from the
 * current hand, path and board state. This module does not own board topology,
 * movement legality, card values, server reservation, Battle cards or submit.
 */
export function createRoadMoveDraft({
  currentPath = null,
  focusedRoadCard = null,
  boardVersion = null,
  validity = ROAD_MOVE_DRAFT_VALIDITY.UNASSESSED,
} = {}) {
  return freezeDraft({ currentPath, focusedRoadCard, boardVersion, validity });
}

/**
 * Replace only the path side of the draft. Focus is intentionally preserved so
 * a formerly valid focus can become INVALID_FOCUS without deleting the route.
 */
export function setRoadMoveDraftPath(draft, {
  currentPath,
  boardVersion = requireDraft(draft).boardVersion,
  validity = ROAD_MOVE_DRAFT_VALIDITY.UNASSESSED,
} = {}) {
  const current = requireDraft(draft);
  return freezeDraft({
    currentPath,
    focusedRoadCard: current.focusedRoadCard,
    boardVersion,
    validity,
  });
}

/** Replace only card focus. The current path is never rewritten or truncated. */
export function setRoadMoveDraftFocus(draft, focusedRoadCard) {
  const current = requireDraft(draft);
  return freezeDraft({
    currentPath: current.currentPath,
    focusedRoadCard,
    boardVersion: current.boardVersion,
    validity: current.validity,
  });
}

export function clearRoadMoveDraftFocus(draft) {
  return setRoadMoveDraftFocus(draft, null);
}

/**
 * Cancel tentative movement without touching authoritative player position.
 * The caller supplies the initial path representation owned by the board.
 */
export function cancelRoadMoveDraft(draft, {
  initialPath = null,
  boardVersion = requireDraft(draft).boardVersion,
  clearFocus = true,
} = {}) {
  const current = requireDraft(draft);
  return freezeDraft({
    currentPath: initialPath,
    focusedRoadCard: clearFocus ? null : current.focusedRoadCard,
    boardVersion,
    validity: ROAD_MOVE_DRAFT_VALIDITY.UNASSESSED,
  });
}

/**
 * Derive the current magnetic matching view from live inputs.
 *
 * `cardIdentityOf` is an optional adapter for runtimes that replace card object
 * instances between snapshots. Without it, object identity is used. No card is
 * selected merely because it is compatible. A sole candidate is exposed as a
 * soft focus and may be consumed only when the caller performs its explicit
 * decision action.
 */
export function projectRoadMoveDraft({
  draft,
  handRoadCards = [],
  boardState,
  cardIdentityOf = null,
} = {}) {
  const current = requireDraft(draft);
  const hand = Array.isArray(handRoadCards) ? handRoadCards.slice() : [];
  const compatible = deriveCompatibleRoadCards(hand, current.currentPath, boardState);
  const focusedInHand = findSameCard(hand, current.focusedRoadCard, cardIdentityOf);
  const focusedCompatible = findSameCard(compatible, current.focusedRoadCard, cardIdentityOf);
  const stepCount = readNonNegativeStepCount(current.currentPath, boardState);
  const focusIsPreMove = focusedInHand !== null
    && (current.currentPath == null || stepCount === 0);

  const cardStates = Object.freeze(hand.map((card) => {
    const isFocused = sameRoadCard(card, current.focusedRoadCard, cardIdentityOf);
    const isCompatible = findSameCard(compatible, card, cardIdentityOf) !== null;
    let state = ROAD_MOVE_CARD_PRESENTATION_STATE.NORMAL;
    if (isFocused && (isCompatible || focusIsPreMove)) state = ROAD_MOVE_CARD_PRESENTATION_STATE.FOCUSED;
    else if (isFocused) state = ROAD_MOVE_CARD_PRESENTATION_STATE.INVALID_FOCUS;
    else if (isCompatible) state = ROAD_MOVE_CARD_PRESENTATION_STATE.COMPATIBLE;
    return Object.freeze({ card, state });
  }));

  const focusState = current.focusedRoadCard == null
    ? ROAD_MOVE_FOCUS_STATE.NONE
    : focusedCompatible !== null || focusIsPreMove
      ? ROAD_MOVE_FOCUS_STATE.FOCUSED
      : ROAD_MOVE_FOCUS_STATE.INVALID_FOCUS;

  const focusedRoadValue = readRoadValue(focusedInHand, boardState);
  const heldRoadValues = hand
    .map((card) => readRoadValue(card, boardState))
    .filter((value) => value !== null);
  const maxHeldRoadValue = heldRoadValues.length > 0 ? Math.max(...heldRoadValues) : null;
  const strongRangeMax = focusState === ROAD_MOVE_FOCUS_STATE.FOCUSED ? focusedRoadValue : null;
  const extensionRangeMax = strongRangeMax !== null
    && maxHeldRoadValue !== null
    && maxHeldRoadValue > strongRangeMax
      ? maxHeldRoadValue
      : null;

  const soleCompatibleRoadCard = compatible.length === 1 ? compatible[0] : null;
  const softFocusRoadCard = focusedCompatible === null ? soleCompatibleRoadCard : null;
  const decisionRoadCard = focusedCompatible ?? soleCompatibleRoadCard;
  const confirmReady = decisionRoadCard !== null
    && current.validity !== ROAD_MOVE_DRAFT_VALIDITY.INVALID;

  return Object.freeze({
    draft: current,
    compatibleRoadCards: Object.freeze(compatible.slice()),
    cardStates,
    focusState,
    focusedRoadCardInHand: focusedInHand,
    softFocusRoadCard,
    decisionRoadCard,
    confirmReady,
    rangeHints: Object.freeze({
      focusedRoadValue,
      maxHeldRoadValue,
      strongRangeMax,
      extensionRangeMax,
    }),
  });
}
