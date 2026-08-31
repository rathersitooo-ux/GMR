const SCHEMA = 'gameroad.battle-road-move-draft.v1';
const ROAD_MIN = 1;
const ROAD_MAX = 6;

function exactToken(value) {
  if (typeof value !== 'string') return null;
  if (!value || value.trim() !== value || value.length > 160) return null;
  return value;
}

function normalizePath(currentPath) {
  if (!Array.isArray(currentPath)) return null;
  const out = [];
  for (const raw of currentPath) {
    const id = exactToken(raw);
    if (!id) return null;
    out.push(id);
  }
  return Object.freeze(out);
}

function normalizeRoadCard(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const id = exactToken(raw.id);
  const roadValue = raw.roadValue;
  if (!id || !Number.isInteger(roadValue) || roadValue < ROAD_MIN || roadValue > ROAD_MAX) return null;
  return Object.freeze({ id, roadValue });
}

function normalizeRoadHand(handRoadCards) {
  if (!Array.isArray(handRoadCards)) return null;
  const out = [];
  const seen = new Set();
  for (const raw of handRoadCards) {
    const card = normalizeRoadCard(raw);
    if (!card || seen.has(card.id)) return null;
    seen.add(card.id);
    out.push(card);
  }
  return Object.freeze(out);
}

function normalizeBoardState(boardState) {
  if (!boardState || typeof boardState !== 'object' || Array.isArray(boardState)) return null;
  if (typeof boardState.pathLegal !== 'boolean' || typeof boardState.pathStoppable !== 'boolean') return null;

  const hasBoardVersion = boardState.boardVersion != null;
  const hasCurrentVersion = boardState.currentBoardVersion != null;
  if (hasBoardVersion !== hasCurrentVersion) return null;

  let boardVersion = null;
  let currentBoardVersion = null;
  if (hasBoardVersion) {
    boardVersion = exactToken(boardState.boardVersion);
    currentBoardVersion = exactToken(boardState.currentBoardVersion);
    if (!boardVersion || !currentBoardVersion) return null;
  }

  return Object.freeze({
    pathLegal: boardState.pathLegal,
    pathStoppable: boardState.pathStoppable,
    boardVersion,
    currentBoardVersion,
  });
}

function stepCountFromPath(currentPath) {
  return Math.max(0, currentPath.length - 1);
}

function boardStateAllowsPath(boardState) {
  if (boardState.boardVersion != null && boardState.boardVersion !== boardState.currentBoardVersion) return false;
  return boardState.pathLegal && boardState.pathStoppable;
}

/**
 * Shared legality predicate for a normal Road 1-6 card against the current draft path.
 *
 * Board topology, adjacency, reachability, stoppability and special abilities remain owned by
 * the authoritative board/rules layer. This helper only consumes the authoritative path flags
 * and applies the normal Road value as an upper bound. It never chooses or commits a card.
 */
export function compatibleRoadCard(card, currentPath, boardState) {
  const normalizedCard = normalizeRoadCard(card);
  const normalizedPath = normalizePath(currentPath);
  const normalizedBoard = normalizeBoardState(boardState);
  if (!normalizedCard || !normalizedPath || !normalizedBoard) return false;
  if (!boardStateAllowsPath(normalizedBoard)) return false;
  return stepCountFromPath(normalizedPath) <= normalizedCard.roadValue;
}

function failed(reason) {
  return Object.freeze({
    schema: SCHEMA,
    ok: false,
    clear: true,
    reason,
    currentPath: Object.freeze([]),
    stepCount: 0,
    focusedRoadCardId: null,
    focusCompatible: false,
    compatibleRoadCards: Object.freeze([]),
    compatibleRoadCardIds: Object.freeze([]),
    committedRoadCardId: null,
    autoSelect: false,
    autoSubmit: false,
  });
}

/**
 * Builds the road-card side of one DraftMove from current inputs, independent of input order.
 * `compatibleRoadCards` is derived every call from hand + currentPath + authoritative board flags;
 * it is not a persisted source of truth.
 */
export function projectDraftMoveRoadCards({
  currentPath = [],
  focusedRoadCardId = null,
  handRoadCards = [],
  boardState = null,
} = {}) {
  const path = normalizePath(currentPath);
  if (!path) return failed('INVALID_PATH');

  const hand = normalizeRoadHand(handRoadCards);
  if (!hand) return failed('INVALID_ROAD_HAND');

  const board = normalizeBoardState(boardState);
  if (!board) return failed('INVALID_BOARD_STATE');
  if (board.boardVersion != null && board.boardVersion !== board.currentBoardVersion) return failed('STALE_BOARD_STATE');
  if (!board.pathLegal) return failed('ILLEGAL_PATH');
  if (!board.pathStoppable) return failed('UNSTOPPABLE_PATH');

  const focusId = focusedRoadCardId == null ? null : exactToken(focusedRoadCardId);
  if (focusedRoadCardId != null && !focusId) return failed('INVALID_FOCUS');
  if (focusId != null && !hand.some((card) => card.id === focusId)) return failed('FOCUS_NOT_IN_HAND');

  const compatibleRoadCards = Object.freeze(
    hand.filter((card) => compatibleRoadCard(card, path, board)),
  );
  const compatibleRoadCardIds = Object.freeze(compatibleRoadCards.map((card) => card.id));
  const focusCompatible = focusId != null && compatibleRoadCardIds.includes(focusId);

  return Object.freeze({
    schema: SCHEMA,
    ok: true,
    clear: false,
    reason: null,
    currentPath: path,
    stepCount: stepCountFromPath(path),
    focusedRoadCardId: focusId,
    focusCompatible,
    compatibleRoadCards,
    compatibleRoadCardIds,
    committedRoadCardId: null,
    autoSelect: false,
    autoSubmit: false,
  });
}
