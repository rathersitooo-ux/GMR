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

test('Flanora keeps GOAL-to-bottom order 1..6, Shield, 7, clearing, start', () => {
  const map = layout();
  assert.deepEqual(map.verticalOrder, [
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
  assert.equal(map.rowIndex.ROAD_6 < map.rowIndex.SHIELD, true);
  assert.equal(map.rowIndex.SHIELD < map.rowIndex.ROAD_7, true);
  assert.equal(map.rowIndex.ROAD_7 < map.rowIndex.CLEARING_ENTRY, true);
  assert.equal(map.rowIndex.CLEARING_ENTRY < map.rowIndex.START, true);
});

test('clearing uses 20 cells total with four separate starts centered under each 3-lane block', () => {
  const map = layout();
  assert.equal(map.clearingCellCount, 20);
  assert.equal(map.clearingCells.length, 20);
  assert.equal(map.clearingCellsPerPlayer, 5);

  assert.deepEqual(
    participantIds.map((participantId) => map.startCellByParticipant[participantId].columnIndex),
    [1, 4, 7, 10],
  );
  assert.equal(new Set(Object.values(map.startCellByParticipant).map((cell) => cell.id)).size, 4);

  for (const participantId of participantIds) {
    const cells = map.clearingCells.filter((cell) => cell.participantId === participantId);
    assert.equal(cells.length, 5);
    assert.equal(cells.filter((cell) => cell.kind === 'CLEARING_ENTRY').length, 3);
    assert.equal(cells.filter((cell) => cell.kind === 'CLEARING_NECK').length, 1);
    assert.equal(cells.filter((cell) => cell.kind === 'START').length, 1);
  }
});

test('all emitted clearing geometry is orthogonal; no diagonal connection is present', () => {
  const map = layout();
  assert.equal(map.geometryAdjacency, 'ORTHOGONAL_ONLY');
  assert.equal(map.geometryIsMovementAuthority, false);

  for (const geometryEdge of map.geometryEdges) {
    const rowDelta = Math.abs(geometryEdge.from.rowIndex - geometryEdge.to.rowIndex);
    const columnDelta = Math.abs(geometryEdge.from.columnIndex - geometryEdge.to.columnIndex);
    assert.equal(rowDelta + columnDelta, 1, `${geometryEdge.fromCellId} -> ${geometryEdge.toCellId}`);
  }

  for (const connection of map.road7EntryConnections) {
    const rowDelta = Math.abs(connection.road7.rowIndex - connection.clearingEntry.rowIndex);
    const columnDelta = Math.abs(connection.road7.columnIndex - connection.clearingEntry.columnIndex);
    assert.equal(rowDelta + columnDelta, 1, `${connection.participantId}:${connection.laneIndex}`);
  }
});

test('12 lane columns remain symmetric for four 3-column player blocks without adding a center column', () => {
  const map = layout();
  assert.equal(map.horizontalCellCount, 12);
  assert.equal(map.minimumHorizontalCellCount, 12);
  assert.equal(map.shieldLinkedLanesPerPlayer, 3);
  assert.equal(map.road7EntryConnections.length, 12);

  const coordinates = map.clearingCells.map((cell) => `${cell.rowIndex}:${cell.columnIndex}`);
  for (const cell of map.clearingCells) {
    const mirrorColumn = 11 - cell.columnIndex;
    assert.equal(coordinates.includes(`${cell.rowIndex}:${mirrorColumn}`), true, `${cell.rowIndex}:${cell.columnIndex}`);
  }
});

test('extra horizontal columns remain possible but each player clearing stays under its own contiguous 3 lanes', () => {
  const thirteen = createFlanoraMapLayout({
    participantIds,
    horizontalCellCount: 13,
    shieldLinkedLaneColumnsByParticipant: {
      P1: [0, 1, 2],
      P2: [3, 4, 5],
      P3: [7, 8, 9],
      P4: [10, 11, 12],
    },
  });

  assert.equal(thirteen.horizontalCellCount, 13);
  assert.equal(thirteen.minimumHorizontalCellCount, 12);
  assert.equal(thirteen.clearingCellCount, 20);
  assert.deepEqual(
    participantIds.map((participantId) => thirteen.startCellByParticipant[participantId].columnIndex),
    [1, 4, 8, 11],
  );
});

test('non-contiguous three-lane blocks fail closed rather than creating diagonal or stretched clearing geometry', () => {
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

test('published core metadata locks only adopted layout geometry, not movement authority', () => {
  assert.equal(FLANORA_MAP_LAYOUT_CORE.playerCount, 4);
  assert.equal(FLANORA_MAP_LAYOUT_CORE.shieldLinkedLanesPerPlayer, 3);
  assert.equal(FLANORA_MAP_LAYOUT_CORE.clearingCellCount, 20);
  assert.equal(FLANORA_MAP_LAYOUT_CORE.geometryAdjacency, 'ORTHOGONAL_ONLY');
  assert.equal(FLANORA_MAP_LAYOUT_CORE.geometryIsMovementAuthority, false);
});
