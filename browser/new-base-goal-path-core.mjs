const GOAL_PATH_SCHEMA = 'GAMEROAD_NEW_BASE_GOAL_PATH_V1';

const PLAYER_COUNT = 4;
const SHIELD_LINKED_LANES_PER_PLAYER = 3;
const STRAIGHT_CARD_TARGET = 7;
const MIN_HORIZONTAL_CELLS = PLAYER_COUNT * SHIELD_LINKED_LANES_PER_PLAYER;

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function uniqueNonEmptyStrings(values, expectedLength) {
  if (!Array.isArray(values) || values.length !== expectedLength) return null;
  const normalized = values.map((value) => (nonEmptyString(value) ? value.trim() : null));
  if (normalized.some((value) => value === null)) return null;
  if (new Set(normalized).size !== normalized.length) return null;
  return normalized;
}

function safeColumnIndex(value, horizontalCellCount) {
  return Number.isSafeInteger(value) && value >= 0 && value < horizontalCellCount ? value : null;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function normalizeLaneColumns(participantIds, horizontalCellCount, source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return null;

  const normalized = {};
  const allColumns = [];
  for (const participantId of participantIds) {
    const laneColumns = source[participantId];
    if (!Array.isArray(laneColumns) || laneColumns.length !== SHIELD_LINKED_LANES_PER_PLAYER) return null;
    const columns = laneColumns.map((value) => safeColumnIndex(value, horizontalCellCount));
    if (columns.some((value) => value === null)) return null;
    if (new Set(columns).size !== SHIELD_LINKED_LANES_PER_PLAYER) return null;
    normalized[participantId] = columns;
    allColumns.push(...columns);
  }

  if (new Set(allColumns).size !== MIN_HORIZONTAL_CELLS) return null;
  return normalized;
}

export function createNewBaseGoalPathLayout({
  participantIds,
  horizontalCellCount,
  shieldLinkedLaneColumnsByParticipant,
} = {}) {
  const participants = uniqueNonEmptyStrings(participantIds, PLAYER_COUNT);
  if (!participants) throw new TypeError('FOUR_UNIQUE_PARTICIPANTS_REQUIRED');
  if (!Number.isSafeInteger(horizontalCellCount) || horizontalCellCount < MIN_HORIZONTAL_CELLS) {
    throw new TypeError('MINIMUM_TWELVE_HORIZONTAL_CELLS_REQUIRED');
  }

  const laneColumns = normalizeLaneColumns(
    participants,
    horizontalCellCount,
    shieldLinkedLaneColumnsByParticipant,
  );
  if (!laneColumns) throw new TypeError('THREE_UNIQUE_SHIELD_LINKED_LANES_PER_PLAYER_REQUIRED');

  return deepFreeze({
    schema: GOAL_PATH_SCHEMA,
    participantIds: participants,
    horizontalCellCount,
    minimumHorizontalCellCount: MIN_HORIZONTAL_CELLS,
    shieldLinkedLanesPerPlayer: SHIELD_LINKED_LANES_PER_PLAYER,
    straightCardTarget: STRAIGHT_CARD_TARGET,
    shieldLinkedLaneColumnsByParticipant: laneColumns,
    topRowGoalColumnIndices: Array.from({ length: horizontalCellCount }, (_, index) => index),
  });
}

function validLayout(layout) {
  if (!layout || typeof layout !== 'object' || Array.isArray(layout)) return false;
  if (layout.schema !== GOAL_PATH_SCHEMA) return false;
  const participants = uniqueNonEmptyStrings(layout.participantIds, PLAYER_COUNT);
  if (!participants) return false;
  if (!Number.isSafeInteger(layout.horizontalCellCount) || layout.horizontalCellCount < MIN_HORIZONTAL_CELLS) {
    return false;
  }
  if (layout.minimumHorizontalCellCount !== MIN_HORIZONTAL_CELLS) return false;
  if (layout.shieldLinkedLanesPerPlayer !== SHIELD_LINKED_LANES_PER_PLAYER) return false;
  if (layout.straightCardTarget !== STRAIGHT_CARD_TARGET) return false;
  if (!normalizeLaneColumns(participants, layout.horizontalCellCount, layout.shieldLinkedLaneColumnsByParticipant)) {
    return false;
  }
  if (!Array.isArray(layout.topRowGoalColumnIndices)
      || layout.topRowGoalColumnIndices.length !== layout.horizontalCellCount
      || layout.topRowGoalColumnIndices.some((value, index) => value !== index)) {
    return false;
  }
  return true;
}

function normalizeStraightColumns(layout, straightCardIdsByColumn) {
  if (!Array.isArray(straightCardIdsByColumn)
      || straightCardIdsByColumn.length !== layout.horizontalCellCount) {
    return null;
  }

  const normalized = [];
  for (const column of straightCardIdsByColumn) {
    if (!Array.isArray(column) || column.length > STRAIGHT_CARD_TARGET) return null;
    const cardIds = column.map((value) => (nonEmptyString(value) ? value.trim() : null));
    if (cardIds.some((value) => value === null)) return null;
    normalized.push(cardIds);
  }
  return normalized;
}

export function projectNewBaseGoalPathConnections(layout, { straightCardIdsByColumn } = {}) {
  if (!validLayout(layout)) {
    return deepFreeze({ ok: false, reason: 'LAYOUT_INVALID', connectedGoalPaths: [] });
  }

  const straightColumns = normalizeStraightColumns(layout, straightCardIdsByColumn);
  if (!straightColumns) {
    return deepFreeze({ ok: false, reason: 'STRAIGHT_COLUMN_SNAPSHOT_INVALID', connectedGoalPaths: [] });
  }

  const laneStates = [];
  const connectedGoalPaths = [];
  for (const participantId of layout.participantIds) {
    const laneColumns = layout.shieldLinkedLaneColumnsByParticipant[participantId];
    laneColumns.forEach((columnIndex, laneIndex) => {
      const straightCardCount = straightColumns[columnIndex].length;
      const connectedToGoal = straightCardCount === STRAIGHT_CARD_TARGET;
      const laneState = deepFreeze({
        participantId,
        laneIndex,
        columnIndex,
        straightCardCount,
        connectedToGoal,
        goalRowColumnIndex: columnIndex,
      });
      laneStates.push(laneState);
      if (connectedToGoal) connectedGoalPaths.push(laneState);
    });
  }

  return deepFreeze({
    ok: true,
    reason: 'GOAL_PATHS_PROJECTED',
    terminalWin: false,
    horizontalCellCount: layout.horizontalCellCount,
    minimumHorizontalCellCount: MIN_HORIZONTAL_CELLS,
    topRowGoalColumnIndices: [...layout.topRowGoalColumnIndices],
    laneStates,
    connectedGoalPaths,
  });
}

export const NEW_BASE_GOAL_PATH_CORE = Object.freeze({
  schema: GOAL_PATH_SCHEMA,
  playerCount: PLAYER_COUNT,
  shieldLinkedLanesPerPlayer: SHIELD_LINKED_LANES_PER_PLAYER,
  straightCardTarget: STRAIGHT_CARD_TARGET,
  minimumHorizontalCellCount: MIN_HORIZONTAL_CELLS,
  topmostRowAllGoal: true,
  sevenStraightTerminalWin: false,
  sevenStraightEffect: 'CONNECT_PATH_TO_GOAL',
});
