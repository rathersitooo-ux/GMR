import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FLANORA_MAP_LAYOUT_CORE,
  createFlanoraMapLayout,
} from '../browser/new-base-flanora-map-layout-core.mjs';

const participantIds = ['P1', 'P2', 'P3', 'P4'];
const twelveLaneMap = {
  P1: [0, 1, 2],
  P2: [3, 4, 5],
  P3: [6, 7, 8],
  P4: [9, 10, 11],
};

function layout(overrides = {}) {
  return createFlanoraMapLayout({
    participantIds,
    horizontalCellCount: 12,
    shieldLinkedLaneColumnsByParticipant: twelveLaneMap,
    ...overrides,
  });
}

function clearingAdjacency(map) {
  const adjacency = new Map(map.clearingCells.map((cell) => [cell.id, new Set()]));
  for (const geometryEdge of map.geometryEdges) {
    adjacency.get(geometryEdge.fromCellId)?.add(geometryEdge.toCellId);
    adjacency.get(geometryEdge.toCellId)?.add(geometryEdge.fromCellId);
  }
  return adjacency;
}

function reachableFrom(adjacency, startId) {
  const visited = new Set([startId]);
  const queue = [startId];
  while (queue.length > 0) {
    const current = queue.shift();
    for (const neighbor of adjacency.get(current) ?? []) {
      if (visited.has(neighbor)) continue;
      visited.add(neighbor);
      queue.push(neighbor);
    }
  }
  return visited;
}

test('Flanora keeps all seven progress rows above Shield, then the three-row clearing', () => {
  const map = layout();
  assert.deepEqual(map.verticalOrder, [
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
  assert.equal(map.rowIndex.ROAD_7 < map.rowIndex.SHIELD, true);
  assert.equal(map.rowIndex.SHIELD < map.rowIndex.CLEARING_TOP, true);
  assert.equal(map.rowIndex.CLEARING_TOP < map.rowIndex.CLEARING_BOTTOM, true);
  assert.equal(map.upperProgressIsPrebuiltMovementField, false);
});

test('shared clearing is a symmetric horizontal zero loop using exactly three rows', () => {
  const map = layout();
  const byKind = (kind) => map.clearingCells.filter((cell) => cell.kind === kind);

  assert.equal(map.clearingOwnership, 'SHARED');
  assert.equal(map.clearingLoopShape, 'HORIZONTAL_ZERO');
  assert.equal(map.clearingLoopRowCount, 3);
  assert.equal(map.clearingCellCount, 26);
  assert.equal(byKind('CLEARING_TOP').length, 12);
  assert.equal(byKind('CLEARING_MIDDLE').length, 2);
  assert.equal(byKind('CLEARING_BOTTOM').length, 12);
  assert.equal(map.clearingCells.every((cell) => cell.participantId === null), true);
  assert.deepEqual(map.clearingLoopColumnSpan, {
    minColumnIndex: 0,
    maxColumnIndex: 11,
    columnCount: 12,
  });

  const coordinateSet = new Set(
    map.clearingCells.map((cell) => `${cell.rowIndex}:${cell.columnIndex}`),
  );
  for (const cell of map.clearingCells) {
    const mirrorColumn = 11 - cell.columnIndex;
    assert.equal(
      coordinateSet.has(`${cell.rowIndex}:${mirrorColumn}`),
      true,
      `${cell.rowIndex}:${cell.columnIndex}`,
    );
  }
});

test('the clearing is one closed cycle with no isolated or dead-end spaces', () => {
  const map = layout();
  const adjacency = clearingAdjacency(map);

  assert.equal(map.clearingConnected, true);
  assert.equal(map.clearingConnectivity, 'SINGLE_CLOSED_LOOP');
  assert.deepEqual(map.isolatedClearingCellIds, []);
  assert.equal(map.geometryEdges.length, map.clearingCells.length);

  for (const cell of map.clearingCells) {
    assert.equal(adjacency.get(cell.id)?.size, 2, cell.id);
  }

  const firstCell = map.clearingCells[0];
  assert.equal(reachableFrom(adjacency, firstCell.id).size, map.clearingCells.length);
});

test('every clearing edge is a one-step horizontal or vertical neighbor', () => {
  const map = layout();
  assert.equal(map.geometryAdjacency, 'ORTHOGONAL_ONLY');
  assert.deepEqual(map.clearingTraversalAxes, ['VERTICAL', 'HORIZONTAL']);
  assert.equal(map.geometryIsMovementAuthority, false);

  for (const geometryEdge of map.geometryEdges) {
    const rowDelta = Math.abs(geometryEdge.from.rowIndex - geometryEdge.to.rowIndex);
    const columnDelta = Math.abs(geometryEdge.from.columnIndex - geometryEdge.to.columnIndex);
    assert.equal(rowDelta + columnDelta, 1, `${geometryEdge.fromCellId} -> ${geometryEdge.toCellId}`);
  }
});

test('all twelve lane roots enter the shared top loop through Shield with zero horizontal detour', () => {
  const map = layout();

  assert.equal(map.laneRootConnections.length, 12);
  for (const connection of map.laneRootConnections) {
    assert.equal(connection.viaShield, true);
    assert.equal(connection.road7.columnIndex, connection.columnIndex);
    assert.equal(connection.shield.columnIndex, connection.columnIndex);
    assert.equal(connection.clearingEntry.columnIndex, connection.columnIndex);
    assert.equal(connection.horizontalEntryOffset, 0);

    assert.equal(
      connection.shield.rowIndex - connection.road7.rowIndex,
      1,
      `${connection.participantId}:${connection.laneIndex}:road7-to-shield`,
    );
    assert.equal(
      connection.clearingEntry.rowIndex - connection.shield.rowIndex,
      1,
      `${connection.participantId}:${connection.laneIndex}:shield-to-clearing`,
    );
  }

  assert.deepEqual(
    participantIds.map((participantId) => map.clearingEntryCellIdsByParticipant[participantId].length),
    [3, 3, 3, 3],
  );
});

test('four start anchors share the loop and remain centered under each three-lane block', () => {
  const map = layout();

  assert.deepEqual(
    participantIds.map((participantId) => map.startCellByParticipant[participantId].columnIndex),
    [1, 4, 7, 10],
  );
  assert.equal(new Set(Object.values(map.startCellByParticipant).map((cell) => cell.id)).size, 4);

  const loopIds = new Set(map.clearingCells.map((cell) => cell.id));
  for (const start of Object.values(map.startCellByParticipant)) {
    assert.equal(loopIds.has(start.id), true);
    assert.equal(start.kind, 'CLEARING_TOP');
  }
});

test('extra horizontal columns stay outside the symmetric twelve-column clearing span', () => {
  const fourteen = createFlanoraMapLayout({
    participantIds,
    horizontalCellCount: 14,
    shieldLinkedLaneColumnsByParticipant: {
      P1: [1, 2, 3],
      P2: [4, 5, 6],
      P3: [7, 8, 9],
      P4: [10, 11, 12],
    },
  });

  assert.equal(fourteen.horizontalCellCount, 14);
  assert.equal(fourteen.minimumHorizontalCellCount, 12);
  assert.equal(fourteen.clearingCellCount, 26);
  assert.equal(fourteen.clearingConnected, true);
  assert.deepEqual(fourteen.clearingLoopColumnSpan, {
    minColumnIndex: 1,
    maxColumnIndex: 12,
    columnCount: 12,
  });
  assert.deepEqual(
    participantIds.map((participantId) => fourteen.startCellByParticipant[participantId].columnIndex),
    [2, 5, 8, 11],
  );

  const coordinateSet = new Set(
    fourteen.clearingCells.map((cell) => `${cell.rowIndex}:${cell.columnIndex}`),
  );
  for (const cell of fourteen.clearingCells) {
    const mirrorColumn = 13 - cell.columnIndex;
    assert.equal(
      coordinateSet.has(`${cell.rowIndex}:${mirrorColumn}`),
      true,
      `${cell.rowIndex}:${cell.columnIndex}`,
    );
  }
});

test('a gap between player lane blocks fails closed instead of stretching the clearing', () => {
  assert.throws(
    () => createFlanoraMapLayout({
      participantIds,
      horizontalCellCount: 13,
      shieldLinkedLaneColumnsByParticipant: {
        P1: [0, 1, 2],
        P2: [3, 4, 5],
        P3: [7, 8, 9],
        P4: [10, 11, 12],
      },
    }),
    /FOUR_CONTIGUOUS_THREE_LANE_BLOCKS_REQUIRED/,
  );
});

test('non-contiguous three-lane blocks fail closed', () => {
  assert.throws(
    () => layout({
      shieldLinkedLaneColumnsByParticipant: {
        P1: [0, 2, 3],
        P2: [4, 5, 6],
        P3: [7, 8, 9],
        P4: [10, 11, 1],
      },
    }),
    /FOUR_CONTIGUOUS_THREE_LANE_BLOCKS_REQUIRED/,
  );
});

test('published core metadata locks the Basic map topology without optional-rule geometry', () => {
  assert.equal(FLANORA_MAP_LAYOUT_CORE.playerCount, 4);
  assert.equal(FLANORA_MAP_LAYOUT_CORE.shieldLinkedLanesPerPlayer, 3);
  assert.equal(FLANORA_MAP_LAYOUT_CORE.minimumHorizontalCellCount, 12);
  assert.equal(FLANORA_MAP_LAYOUT_CORE.clearingOwnership, 'SHARED');
  assert.equal(FLANORA_MAP_LAYOUT_CORE.clearingLoopShape, 'HORIZONTAL_ZERO');
  assert.equal(FLANORA_MAP_LAYOUT_CORE.clearingLoopRowCount, 3);
  assert.equal(FLANORA_MAP_LAYOUT_CORE.clearingCellCount, 26);
  assert.equal(FLANORA_MAP_LAYOUT_CORE.geometryAdjacency, 'ORTHOGONAL_ONLY');
  assert.equal(FLANORA_MAP_LAYOUT_CORE.clearingConnectivity, 'SINGLE_CLOSED_LOOP');
  assert.deepEqual(FLANORA_MAP_LAYOUT_CORE.clearingTraversalAxes, ['VERTICAL', 'HORIZONTAL']);
  assert.equal(FLANORA_MAP_LAYOUT_CORE.geometryIsMovementAuthority, false);
  assert.equal(FLANORA_MAP_LAYOUT_CORE.upperProgressIsPrebuiltMovementField, false);
  assert.equal(FLANORA_MAP_LAYOUT_CORE.optionalRuleGeometryIncluded, false);
});
