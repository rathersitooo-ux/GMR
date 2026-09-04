import test from 'node:test';
import assert from 'node:assert/strict';

import {
  NEW_BASE_GOAL_PATH_CORE,
  createNewBaseGoalPathLayout,
  projectNewBaseGoalPathConnections,
} from '../browser/new-base-goal-path-core.mjs';
import { shouldForwardLegacySevenRoadWin } from '../browser/new-base-legacy-seven-win-gate-core.mjs';

const participantIds = ['P1', 'P2', 'P3', 'P4'];
const twelveLaneMap = {
  P1: [0, 1, 2],
  P2: [3, 4, 5],
  P3: [6, 7, 8],
  P4: [9, 10, 11],
};

function layout(overrides = {}) {
  return createNewBaseGoalPathLayout({
    participantIds,
    horizontalCellCount: 12,
    shieldLinkedLaneColumnsByParticipant: twelveLaneMap,
    ...overrides,
  });
}

function emptyColumns(horizontalCellCount = 12) {
  return Array.from({ length: horizontalCellCount }, () => []);
}

function sevenCards(prefix) {
  return Array.from({ length: 7 }, (_, index) => `${prefix}-${index + 1}`);
}

test('new map requires four players x three Shield-linked lanes and at least 12 horizontal cells', () => {
  const projected = layout();
  assert.equal(projected.participantIds.length, 4);
  assert.equal(projected.shieldLinkedLanesPerPlayer, 3);
  assert.equal(projected.minimumHorizontalCellCount, 12);
  assert.equal(projected.horizontalCellCount, 12);
  assert.deepEqual(projected.topRowGoalColumnIndices, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  assert.equal(NEW_BASE_GOAL_PATH_CORE.topmostRowAllGoal, true);

  assert.throws(() => layout({ horizontalCellCount: 11 }), /MINIMUM_TWELVE_HORIZONTAL_CELLS_REQUIRED/);
});

test('12 is a minimum, not an invented exact width, and lane positions come from caller authority', () => {
  const thirteen = createNewBaseGoalPathLayout({
    participantIds,
    horizontalCellCount: 13,
    shieldLinkedLaneColumnsByParticipant: {
      P1: [0, 4, 8],
      P2: [1, 5, 9],
      P3: [2, 6, 10],
      P4: [3, 7, 11],
    },
  });

  assert.equal(thirteen.horizontalCellCount, 13);
  assert.equal(thirteen.minimumHorizontalCellCount, 12);
  assert.deepEqual(thirteen.topRowGoalColumnIndices, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  assert.deepEqual(thirteen.shieldLinkedLaneColumnsByParticipant.P1, [0, 4, 8]);
});

test('each of all 4 x 3 Shield-linked lanes independently connects to GOAL at exactly seven straight cards', () => {
  const map = layout();

  for (const participantId of participantIds) {
    for (const columnIndex of map.shieldLinkedLaneColumnsByParticipant[participantId]) {
      const columns = emptyColumns();
      columns[columnIndex] = sevenCards(`${participantId}-c${columnIndex}`);
      const projection = projectNewBaseGoalPathConnections(map, { straightCardIdsByColumn: columns });

      assert.equal(projection.ok, true);
      assert.equal(projection.terminalWin, false);
      assert.equal(projection.connectedGoalPaths.length, 1);
      assert.equal(projection.connectedGoalPaths[0].participantId, participantId);
      assert.equal(projection.connectedGoalPaths[0].columnIndex, columnIndex);
      assert.equal(projection.connectedGoalPaths[0].goalRowColumnIndex, columnIndex);
      assert.equal(projection.connectedGoalPaths[0].straightCardCount, 7);
      assert.equal(projection.connectedGoalPaths[0].connectedToGoal, true);
    }
  }
});

test('fewer than seven straight cards does not connect a GOAL path', () => {
  const map = layout();
  const columns = emptyColumns();
  columns[0] = sevenCards('p1-lane').slice(0, 6);

  const projection = projectNewBaseGoalPathConnections(map, { straightCardIdsByColumn: columns });
  assert.equal(projection.ok, true);
  assert.equal(projection.connectedGoalPaths.length, 0);
  assert.equal(projection.laneStates.find((lane) => lane.columnIndex === 0).straightCardCount, 6);
  assert.equal(projection.laneStates.find((lane) => lane.columnIndex === 0).connectedToGoal, false);
});

test('overfilled or incomplete straight-column snapshots fail closed rather than inventing >7 semantics', () => {
  const map = layout();
  const overfilled = emptyColumns();
  overfilled[0] = [...sevenCards('p1-lane'), 'p1-lane-8'];

  assert.deepEqual(
    projectNewBaseGoalPathConnections(map, { straightCardIdsByColumn: overfilled }),
    { ok: false, reason: 'STRAIGHT_COLUMN_SNAPSHOT_INVALID', connectedGoalPaths: [] },
  );

  assert.deepEqual(
    projectNewBaseGoalPathConnections(map, { straightCardIdsByColumn: emptyColumns(11) }),
    { ok: false, reason: 'STRAIGHT_COLUMN_SNAPSHOT_INVALID', connectedGoalPaths: [] },
  );
});

test('seven straight connects a path but still does not revive legacy seven-road terminal victory', () => {
  const map = layout();
  const columns = emptyColumns();
  columns[5] = sevenCards('p2-middle');
  const projection = projectNewBaseGoalPathConnections(map, { straightCardIdsByColumn: columns });

  assert.equal(projection.connectedGoalPaths.length, 1);
  assert.equal(projection.terminalWin, false);
  assert.equal(shouldForwardLegacySevenRoadWin({ rulesetIsNewBase: true, legacySevenRoadWin: true }), false);
  for (const forbidden of ['winnerId', 'winnerIds', 'result', 'finalizedResult', 'goalReached']) {
    assert.equal(Object.hasOwn(projection, forbidden), false, forbidden);
  }
});
