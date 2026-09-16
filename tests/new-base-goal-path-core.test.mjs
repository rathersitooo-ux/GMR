import test from 'node:test';
import assert from 'node:assert/strict';
import { NEW_BASE_GOAL_PATH_CORE, createNewBaseGoalPathLayout, projectNewBaseGoalPathConnections } from '../browser/new-base-goal-path-core.mjs';

const participantIds = ['P1','P2','P3','P4'];
const lanes = { P1:[0,1,2], P2:[3,4,5], P3:[6,7,8], P4:[9,10,11] };
const makeLayout = () => createNewBaseGoalPathLayout({ participantIds, horizontalCellCount:12, shieldLinkedLaneColumnsByParticipant:lanes });
const empty = () => Array.from({ length:12 }, () => []);

test('models twelve route entries converging on exactly one shared GOAL', () => {
  const layout = makeLayout();
  assert.equal(layout.sharedGoalId, 'goal:shared');
  assert.equal(layout.sharedGoalCount, 1);
  assert.equal(layout.goalEntryColumnIndices.length, 12);
  assert.equal(NEW_BASE_GOAL_PATH_CORE.sharedGoalCount, 1);
  assert.equal(NEW_BASE_GOAL_PATH_CORE.topmostRowAllGoal, false);
});

test('preserves exact physical card ids and seven cards open a route without terminal win', () => {
  const cards = empty();
  cards[0] = ['A','B','C','D','E','F','G'];
  cards[1] = ['H','I'];
  const result = projectNewBaseGoalPathConnections(makeLayout(), { straightCardIdsByColumn: cards });
  assert.equal(result.ok, true);
  assert.equal(result.sharedGoalCount, 1);
  const open = result.laneStates.find((lane) => lane.participantId === 'P1' && lane.laneIndex === 0);
  assert.deepEqual(open.straightCardIds, cards[0]);
  assert.equal(open.connectedToGoal, true);
  assert.equal(open.sharedGoalId, 'goal:shared');
  assert.equal(open.goalEntryColumnIndex, 0);
  assert.equal(result.terminalWin, false);
  assert.equal(result.connectedGoalPaths.length, 1);
});

test('rejects malformed snapshots rather than inventing progress', () => {
  assert.equal(projectNewBaseGoalPathConnections(makeLayout(), { straightCardIdsByColumn: [] }).ok, false);
  const cards = empty(); cards[0] = Array(8).fill('X');
  assert.equal(projectNewBaseGoalPathConnections(makeLayout(), { straightCardIdsByColumn: cards }).ok, false);
});
