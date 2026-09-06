const FLANORA_MAP_SCHEMA = 'GAMEROAD_FLANORA_MAP_LAYOUT_V1';

const PLAYER_COUNT = 4;
const SHIELD_LINKED_LANES_PER_PLAYER = 3;
const MIN_HORIZONTAL_CELLS = PLAYER_COUNT * SHIELD_LINKED_LANES_PER_PLAYER;
const CLEARING_CELLS_PER_PLAYER = 5;
const CLEARING_CELL_COUNT = PLAYER_COUNT * CLEARING_CELLS_PER_PLAYER;

const ROW_INDEX = Object.freeze({
  GOAL: 0,
  ROAD_1: 1,
  ROAD_2: 2,
  ROAD_3: 3,
  ROAD_4: 4,
  ROAD_5: 5,
  ROAD_6: 6,
  SHIELD: 7,
  ROAD_7: 8,
  CLEARING_ENTRY: 9,
  CLEARING_NECK: 10,
  START: 11,
});

const VERTICAL_ORDER = Object.freeze([
  'GOAL',
  'ROAD_1',
  'ROAD_2',
  'ROAD_3',
  'ROAD_4',
  'ROAD_5',
  'ROAD_6',
  'SHIELD',
  'ROAD_7',
  'CLEARING_ENTRY',
  'CLEARING_NECK',
  'START',
]);

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalizeParticipants(participantIds) {
  if (!Array.isArray(participantIds) || participantIds.length !== PLAYER_COUNT) return null;
  const normalized = participantIds.map((value) => (nonEmptyString(value) ? value.trim() : null));
  if (normalized.some((value) => value === null)) return null;
  if (new Set(normalized).size !== PLAYER_COUNT) return null;
  return normalized;
}

function safeColumnIndex(value, horizontalCellCount) {
  return Number.isSafeInteger(value) && value >= 0 && value < horizontalCellCount ? value : null;
}

function normalizeLaneBlocks(participantIds, horizontalCellCount, source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return null;

  const normalized = {};
  const allColumns = [];
  for (const participantId of participantIds) {
    const laneColumns = source[participantId];
    if (!Array.isArray(laneColumns) || laneColumns.length !== SHIELD_LINKED_LANES_PER_PLAYER) return null;
    const columns = laneColumns
      .map((value) => safeColumnIndex(value, horizontalCellCount))
      .sort((a, b) => a - b);
    if (columns.some((value) => value === null)) return null;
    if (new Set(columns).size !== SHIELD_LINKED_LANES_PER_PLAYER) return null;
    if (columns[1] !== columns[0] + 1 || columns[2] !== columns[1] + 1) return null;
    normalized[participantId] = columns;
    allColumns.push(...columns);
  }

  if (new Set(allColumns).size !== MIN_HORIZONTAL_CELLS) return null;
  return normalized;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function cell(id, participantId, kind, rowIndex, columnIndex, laneIndex = null) {
  return {
    id,
    participantId,
    kind,
    rowIndex,
    columnIndex,
    laneIndex,
  };
}

function edge(fromCellId, toCellId, from, to) {
  return {
    fromCellId,
    toCellId,
    from: { rowIndex: from.rowIndex, columnIndex: from.columnIndex },
    to: { rowIndex: to.rowIndex, columnIndex: to.columnIndex },
  };
}

export function createFlanoraMapLayout({
  participantIds,
  horizontalCellCount,
  shieldLinkedLaneColumnsByParticipant,
} = {}) {
  const participants = normalizeParticipants(participantIds);
  if (!participants) throw new TypeError('FOUR_UNIQUE_PARTICIPANTS_REQUIRED');
  if (!Number.isSafeInteger(horizontalCellCount) || horizontalCellCount < MIN_HORIZONTAL_CELLS) {
    throw new TypeError('MINIMUM_TWELVE_HORIZONTAL_CELLS_REQUIRED');
  }

  const laneBlocks = normalizeLaneBlocks(
    participants,
    horizontalCellCount,
    shieldLinkedLaneColumnsByParticipant,
  );
  if (!laneBlocks) throw new TypeError('FOUR_CONTIGUOUS_THREE_LANE_BLOCKS_REQUIRED');

  const clearingCells = [];
  const geometryEdges = [];
  const road7EntryConnections = [];
  const startCellByParticipant = {};

  for (const participantId of participants) {
    const columns = laneBlocks[participantId];
    const entryCells = columns.map((columnIndex, laneIndex) => {
      const entry = cell(
        `${participantId}:clearing-entry:${laneIndex}`,
        participantId,
        'CLEARING_ENTRY',
        ROW_INDEX.CLEARING_ENTRY,
        columnIndex,
        laneIndex,
      );
      clearingCells.push(entry);
      road7EntryConnections.push({
        participantId,
        laneIndex,
        columnIndex,
        road7: { rowIndex: ROW_INDEX.ROAD_7, columnIndex },
        clearingEntryCellId: entry.id,
        clearingEntry: { rowIndex: entry.rowIndex, columnIndex: entry.columnIndex },
      });
      return entry;
    });

    const centerColumnIndex = columns[1];
    const neck = cell(
      `${participantId}:clearing-neck`,
      participantId,
      'CLEARING_NECK',
      ROW_INDEX.CLEARING_NECK,
      centerColumnIndex,
    );
    const start = cell(
      `${participantId}:start`,
      participantId,
      'START',
      ROW_INDEX.START,
      centerColumnIndex,
    );
    clearingCells.push(neck, start);
    startCellByParticipant[participantId] = start;

    geometryEdges.push(
      edge(entryCells[0].id, entryCells[1].id, entryCells[0], entryCells[1]),
      edge(entryCells[1].id, entryCells[2].id, entryCells[1], entryCells[2]),
      edge(entryCells[1].id, neck.id, entryCells[1], neck),
      edge(neck.id, start.id, neck, start),
    );
  }

  return deepFreeze({
    schema: FLANORA_MAP_SCHEMA,
    participantIds: participants,
    horizontalCellCount,
    minimumHorizontalCellCount: MIN_HORIZONTAL_CELLS,
    shieldLinkedLanesPerPlayer: SHIELD_LINKED_LANES_PER_PLAYER,
    shieldLinkedLaneColumnsByParticipant: laneBlocks,
    verticalOrder: [...VERTICAL_ORDER],
    rowIndex: { ...ROW_INDEX },
    clearingCellCount: CLEARING_CELL_COUNT,
    clearingCellsPerPlayer: CLEARING_CELLS_PER_PLAYER,
    clearingCells,
    startCellByParticipant,
    road7EntryConnections,
    geometryEdges,
    geometryAdjacency: 'ORTHOGONAL_ONLY',
    geometryIsMovementAuthority: false,
  });
}

export const FLANORA_MAP_LAYOUT_CORE = Object.freeze({
  schema: FLANORA_MAP_SCHEMA,
  playerCount: PLAYER_COUNT,
  shieldLinkedLanesPerPlayer: SHIELD_LINKED_LANES_PER_PLAYER,
  minimumHorizontalCellCount: MIN_HORIZONTAL_CELLS,
  clearingCellsPerPlayer: CLEARING_CELLS_PER_PLAYER,
  clearingCellCount: CLEARING_CELL_COUNT,
  verticalOrder: VERTICAL_ORDER,
  rowIndex: ROW_INDEX,
  geometryAdjacency: 'ORTHOGONAL_ONLY',
  geometryIsMovementAuthority: false,
});
