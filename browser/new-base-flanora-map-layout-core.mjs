const FLANORA_MAP_SCHEMA = 'GAMEROAD_FLANORA_MAP_LAYOUT_V1';

const PLAYER_COUNT = 4;
const SHIELD_LINKED_LANES_PER_PLAYER = 3;
const MIN_HORIZONTAL_CELLS = PLAYER_COUNT * SHIELD_LINKED_LANES_PER_PLAYER;
const CLEARING_LOOP_ROW_COUNT = 3;
const CLEARING_LOOP_CELL_COUNT = (MIN_HORIZONTAL_CELLS * 2) + 2;

const ROW_INDEX = Object.freeze({
  GOAL: 0,
  ROAD_1: 1,
  ROAD_2: 2,
  ROAD_3: 3,
  ROAD_4: 4,
  ROAD_5: 5,
  ROAD_6: 6,
  ROAD_7: 7,
  SHIELD: 8,
  CLEARING_TOP: 9,
  CLEARING_MIDDLE: 10,
  CLEARING_BOTTOM: 11,
});

const VERTICAL_ORDER = Object.freeze([
  'GOAL',
  'ROAD_1',
  'ROAD_2',
  'ROAD_3',
  'ROAD_4',
  'ROAD_5',
  'ROAD_6',
  'ROAD_7',
  'SHIELD',
  'CLEARING_TOP',
  'CLEARING_MIDDLE',
  'CLEARING_BOTTOM',
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
  const sortedColumns = [...allColumns].sort((a, b) => a - b);
  for (let index = 1; index < sortedColumns.length; index += 1) {
    if (sortedColumns[index] !== sortedColumns[index - 1] + 1) return null;
  }
  return normalized;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function cell(id, kind, rowIndex, columnIndex) {
  return {
    id,
    participantId: null,
    kind,
    rowIndex,
    columnIndex,
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

function projectConnectivity(cells, edges) {
  const cellIds = new Set(cells.map((item) => item.id));
  const adjacency = new Map([...cellIds].map((id) => [id, new Set()]));

  for (const geometryEdge of edges) {
    if (!cellIds.has(geometryEdge.fromCellId) || !cellIds.has(geometryEdge.toCellId)) continue;
    adjacency.get(geometryEdge.fromCellId).add(geometryEdge.toCellId);
    adjacency.get(geometryEdge.toCellId).add(geometryEdge.fromCellId);
  }

  const isolatedCellIds = [...adjacency.entries()]
    .filter(([, neighbors]) => neighbors.size === 0)
    .map(([id]) => id);
  const firstCellId = cells[0]?.id ?? null;
  const visited = new Set(firstCellId ? [firstCellId] : []);
  const queue = firstCellId ? [firstCellId] : [];
  while (queue.length > 0) {
    const current = queue.shift();
    for (const neighbor of adjacency.get(current) ?? []) {
      if (visited.has(neighbor)) continue;
      visited.add(neighbor);
      queue.push(neighbor);
    }
  }

  return {
    connected: visited.size === cells.length,
    visitedCellCount: visited.size,
    isolatedCellIds,
    degreeByCellId: Object.fromEntries(
      [...adjacency.entries()].map(([id, neighbors]) => [id, neighbors.size]),
    ),
  };
}

function buildClearingLoop(laneColumns) {
  const minColumn = laneColumns[0];
  const maxColumn = laneColumns[laneColumns.length - 1];
  const topCells = laneColumns.map((columnIndex) => (
    cell(`clearing:top:${columnIndex}`, 'CLEARING_TOP', ROW_INDEX.CLEARING_TOP, columnIndex)
  ));
  const rightMiddle = cell(
    'clearing:middle:right',
    'CLEARING_MIDDLE',
    ROW_INDEX.CLEARING_MIDDLE,
    maxColumn,
  );
  const bottomCells = [...laneColumns].reverse().map((columnIndex) => (
    cell(`clearing:bottom:${columnIndex}`, 'CLEARING_BOTTOM', ROW_INDEX.CLEARING_BOTTOM, columnIndex)
  ));
  const leftMiddle = cell(
    'clearing:middle:left',
    'CLEARING_MIDDLE',
    ROW_INDEX.CLEARING_MIDDLE,
    minColumn,
  );

  const cycleCells = [...topCells, rightMiddle, ...bottomCells, leftMiddle];
  const geometryEdges = cycleCells.map((from, index) => {
    const to = cycleCells[(index + 1) % cycleCells.length];
    return edge(from.id, to.id, from, to);
  });

  return {
    cells: cycleCells,
    geometryEdges,
    topCellByColumn: new Map(topCells.map((item) => [item.columnIndex, item])),
    minColumn,
    maxColumn,
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

  const allLaneColumns = participants
    .flatMap((participantId) => laneBlocks[participantId])
    .sort((a, b) => a - b);
  const clearingLoop = buildClearingLoop(allLaneColumns);
  const clearingCells = clearingLoop.cells;
  const geometryEdges = clearingLoop.geometryEdges;

  const startCellByParticipant = {};
  const clearingEntryCellIdsByParticipant = {};
  const laneRootConnections = [];

  for (const participantId of participants) {
    const columns = laneBlocks[participantId];
    const entryCells = columns.map((columnIndex, laneIndex) => {
      const clearingEntry = clearingLoop.topCellByColumn.get(columnIndex);
      laneRootConnections.push({
        participantId,
        laneIndex,
        columnIndex,
        road7: { rowIndex: ROW_INDEX.ROAD_7, columnIndex },
        shield: { rowIndex: ROW_INDEX.SHIELD, columnIndex },
        clearingEntryCellId: clearingEntry.id,
        clearingEntry: {
          rowIndex: clearingEntry.rowIndex,
          columnIndex: clearingEntry.columnIndex,
        },
        horizontalEntryOffset: 0,
        viaShield: true,
      });
      return clearingEntry;
    });
    clearingEntryCellIdsByParticipant[participantId] = entryCells.map((item) => item.id);
    startCellByParticipant[participantId] = clearingLoop.topCellByColumn.get(columns[1]);
  }

  const connectivity = projectConnectivity(clearingCells, geometryEdges);
  const everyCellHasTwoLoopNeighbors = Object.values(connectivity.degreeByCellId)
    .every((degree) => degree === 2);
  if (!connectivity.connected || connectivity.isolatedCellIds.length > 0 || !everyCellHasTwoLoopNeighbors) {
    throw new TypeError('CLEARING_MUST_BE_SINGLE_CLOSED_LOOP');
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
    clearingOwnership: 'SHARED',
    clearingLoopShape: 'HORIZONTAL_ZERO',
    clearingLoopRowCount: CLEARING_LOOP_ROW_COUNT,
    clearingCellCount: clearingCells.length,
    clearingCells,
    clearingCycleCellIds: clearingCells.map((item) => item.id),
    clearingLoopColumnSpan: {
      minColumnIndex: clearingLoop.minColumn,
      maxColumnIndex: clearingLoop.maxColumn,
      columnCount: (clearingLoop.maxColumn - clearingLoop.minColumn) + 1,
    },
    clearingEntryCellIdsByParticipant,
    startCellByParticipant,
    laneRootConnections,
    geometryEdges,
    geometryAdjacency: 'ORTHOGONAL_ONLY',
    clearingConnectivity: 'SINGLE_CLOSED_LOOP',
    clearingConnected: true,
    isolatedClearingCellIds: [],
    clearingTraversalAxes: ['VERTICAL', 'HORIZONTAL'],
    geometryIsMovementAuthority: false,
    upperProgressIsPrebuiltMovementField: false,
    optionalRuleGeometryIncluded: false,
  });
}

export const FLANORA_MAP_LAYOUT_CORE = Object.freeze({
  schema: FLANORA_MAP_SCHEMA,
  playerCount: PLAYER_COUNT,
  shieldLinkedLanesPerPlayer: SHIELD_LINKED_LANES_PER_PLAYER,
  minimumHorizontalCellCount: MIN_HORIZONTAL_CELLS,
  clearingOwnership: 'SHARED',
  clearingLoopShape: 'HORIZONTAL_ZERO',
  clearingLoopRowCount: CLEARING_LOOP_ROW_COUNT,
  clearingCellCount: CLEARING_LOOP_CELL_COUNT,
  verticalOrder: VERTICAL_ORDER,
  rowIndex: ROW_INDEX,
  geometryAdjacency: 'ORTHOGONAL_ONLY',
  clearingConnectivity: 'SINGLE_CLOSED_LOOP',
  clearingTraversalAxes: Object.freeze(['VERTICAL', 'HORIZONTAL']),
  geometryIsMovementAuthority: false,
  upperProgressIsPrebuiltMovementField: false,
  optionalRuleGeometryIncluded: false,
});
