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

test('new map keeps four players x three Shield-linked routes but exposes one shared GOAL', () => {
  const projected = layout();
  assert.equal(projected.participantIds.length, 4);
  assert.equal(projected.shieldLinkedLanesPerPlayer, 3);
  assert.equal(projected.minimumHorizontalCellCount, 12);
  assert.equal(projected.horizontalCellCount, 12);
  assert.deepEqual(projected.topRowGoalColumnIndices, [0,1,2,3,4,5,6,7,8,9,10,11]);
  assert.equal(projected.sharedGoalId, 'goal:shared');
  assert.equal(projected.sharedGoalCount, 1);
  assert.equal(projected.routeGateCount, 12);
  assert.equal(new Set(Object.values(projected.routeGateIdsByParticipant).flat()).size, 12);
  assert.equal(NEW_BASE_GOAL_PATH_CORE.sharedGoalCount, 1);
  assert.equal(NEW_BASE_GOAL_PATH_CORE.routeGateCount, 12);
  assert.equal(NEW_BASE_GOAL_PATH_CORE.topRowColumnsAreRouteAnchors, true);
  assert.equal(NEW_BASE_GOAL_PATH_CORE.gateOpenPolicy, 'ALL_AT_ONCE_WHEN_ANY_GOAL_PATH_CONNECTED');
  assert.equal(NEW_BASE_GOAL_PATH_CORE.gateOpenIsTerminal, false);
  assert.equal(NEW_BASE_GOAL_PATH_CORE.laneGoalConnectionIsNotGateOpenState, true);
  assert.throws(() => layout({ horizontalCellCount: 11 }), /MINIMUM_TWELVE_HORIZONTAL_CELLS_REQUIRED/);
});

test('12 is a minimum and lane positions still come from caller authority', () => {
  const thirteen = createNewBaseGoalPathLayout({
    participantIds,
    horizontalCellCount: 13,
    shieldLinkedLaneColumnsByParticipant: {
      P1: [0,4,8], P2: [1,5,9], P3: [2,6,10], P4: [3,7,11],
    },
  });
  assert.equal(thirteen.horizontalCellCount, 13);
  assert.equal(thirteen.minimumHorizontalCellCount, 12);
  assert.deepEqual(thirteen.topRowGoalColumnIndices, [0,1,2,3,4,5,6,7,8,9,10,11,12]);
  assert.deepEqual(thirteen.shieldLinkedLaneColumnsByParticipant.P1, [0,4,8]);
  assert.equal(thirteen.sharedGoalCount, 1);
});

test('each of all 4 x 3 routes independently connects its branch to the same GOAL at exactly seven cards', () => {
  const map = layout();
  for (const participantId of participantIds) {
    for (const columnIndex of map.shieldLinkedLaneColumnsByParticipant[participantId]) {
      const columns = emptyColumns();
      const expectedCards = sevenCards(`${participantId}-c${columnIndex}`);
      columns[columnIndex] = expectedCards;
      const projection = projectNewBaseGoalPathConnections(map, { straightCardIdsByColumn: columns });
      assert.equal(projection.ok, true);
      assert.equal(projection.terminalWin, false);
      assert.equal(projection.sharedGoalId, 'goal:shared');
      assert.equal(projection.sharedGoalCount, 1);
      assert.equal(projection.routeGateCount, 12);
      assert.equal(projection.gateOpen, true);
      assert.equal(projection.gateOpenScope, 'ALL_ROUTE_GATE_ANCHORS');
      assert.equal(projection.connectedGoalPaths.length, 1);
      const connected = projection.connectedGoalPaths[0];
      assert.equal(connected.participantId, participantId);
      assert.equal(connected.columnIndex, columnIndex);
      assert.equal(connected.goalRowColumnIndex, columnIndex);
      assert.equal(connected.straightCardCount, 7);
      assert.deepEqual(connected.straightCardIds, expectedCards);
      assert.equal(connected.sharedGoalId, 'goal:shared');
      assert.match(connected.routeGateId, /^goal-gate:/);
      assert.equal(connected.connectedToGoal, true);
    }
  }
});

test('fewer than seven keeps exact physical card identities without connecting a GOAL branch or opening Gate', () => {
  const map = layout();
  const columns = emptyColumns();
  const cards = sevenCards('p1-lane').slice(0, 6);
  columns[0] = cards;
  const projection = projectNewBaseGoalPathConnections(map, { straightCardIdsByColumn: columns });
  assert.equal(projection.ok, true);
  assert.equal(projection.gateOpen, false);
  assert.equal(projection.connectedGoalPaths.length, 0);
  const lane = projection.laneStates.find((item) => item.columnIndex === 0);
  assert.equal(lane.straightCardCount, 6);
  assert.deepEqual(lane.straightCardIds, cards);
  assert.equal(lane.connectedToGoal, false);
});

test('overfilled or incomplete snapshots fail closed rather than inventing >7 semantics', () => {
  const map = layout();
  const overfilled = emptyColumns();
  overfilled[0] = [...sevenCards('p1-lane'), 'p1-lane-8'];
  assert.deepEqual(projectNewBaseGoalPathConnections(map, { straightCardIdsByColumn: overfilled }), {
    ok: false, reason: 'STRAIGHT_COLUMN_SNAPSHOT_INVALID', gateOpen: false, connectedGoalPaths: [],
  });
  assert.deepEqual(projectNewBaseGoalPathConnections(map, { straightCardIdsByColumn: emptyColumns(11) }), {
    ok: false, reason: 'STRAIGHT_COLUMN_SNAPSHOT_INVALID', gateOpen: false, connectedGoalPaths: [],
  });
});

test('seven straight connects a route but still does not revive legacy terminal victory', () => {
  const map = layout();
  const columns = emptyColumns();
  columns[5] = sevenCards('p2-middle');
  const projection = projectNewBaseGoalPathConnections(map, { straightCardIdsByColumn: columns });
  assert.equal(projection.connectedGoalPaths.length, 1);
  assert.equal(projection.gateOpen, true);
  assert.equal(projection.terminalWin, false);
  assert.equal(shouldForwardLegacySevenRoadWin({ rulesetIsNewBase: true, legacySevenRoadWin: true }), false);
  for (const forbidden of ['winnerId','winnerIds','result','finalizedResult','goalReached']) {
    assert.equal(Object.hasOwn(projection, forbidden), false, forbidden);
  }
});
