function freezeList(value, name) {
  if (!Array.isArray(value)) throw new TypeError(`${name} must be an array`);
  return Object.freeze([...value]);
}

/**
 * Pure projection for the current Road-card/path pairing.
 *
 * This module deliberately owns no compatibility rules and no input-order mode.
 * The caller injects the shared compatibleRoadCards(hand, path, boardState)
 * derivation. Because there is no retained candidate history, every call
 * reflects only the current hand/path/board inputs.
 */
export function projectRoadPathCandidates({
  currentPath,
  handRoadCards,
  boardState = null,
  boardVersion = null,
  focusedRoadCard = null,
  deriveCompatibleRoadCards,
} = {}) {
  const path = freezeList(currentPath, 'currentPath');
  if (path.length < 1) throw new RangeError('currentPath must include its start position');
  const hand = freezeList(handRoadCards, 'handRoadCards');
  if (typeof deriveCompatibleRoadCards !== 'function') {
    throw new TypeError('deriveCompatibleRoadCards must be a function');
  }

  const derived = deriveCompatibleRoadCards(hand, path, boardState);
  const compatibleRoadCards = freezeList(derived, 'deriveCompatibleRoadCards result');

  return Object.freeze({
    currentPath: path,
    focusedRoadCard,
    compatibleRoadCards,
    boardVersion,
  });
}

/**
 * Replace only the tentative path and its derived Road candidates.
 * Unknown DraftMove fields are preserved verbatim, including focus and any
 * unrelated Battle data. No candidate is promoted into a formal selection.
 */
export function reconcileRoadPathChange({
  draftMove,
  nextPath,
  handRoadCards,
  boardState = null,
  boardVersion,
  deriveCompatibleRoadCards,
} = {}) {
  if (!draftMove || typeof draftMove !== 'object' || Array.isArray(draftMove)) {
    throw new TypeError('draftMove must be an object');
  }

  const resolvedBoardVersion = boardVersion === undefined
    ? (draftMove.boardVersion ?? null)
    : boardVersion;

  const projection = projectRoadPathCandidates({
    currentPath: nextPath,
    handRoadCards,
    boardState,
    boardVersion: resolvedBoardVersion,
    focusedRoadCard: draftMove.focusedRoadCard ?? null,
    deriveCompatibleRoadCards,
  });

  return Object.freeze({
    ...draftMove,
    currentPath: projection.currentPath,
    compatibleRoadCards: projection.compatibleRoadCards,
    boardVersion: projection.boardVersion,
  });
}
