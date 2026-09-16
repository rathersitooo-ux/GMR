import test from 'node:test';
import assert from 'node:assert/strict';
import { createNewBaseGoalPathLayout, projectNewBaseGoalPathConnections } from '../browser/new-base-goal-path-core.mjs';
import { NEW_BASE_GOAL_PATH_PRESENTATION_CONTRACT, NEW_BASE_GOAL_PATH_VISUAL_STATE, projectNewBaseGoalPathPresentation } from '../browser/new-base-goal-path-presentation-core.mjs';

const ids = ['P1','P2','P3','P4'];
const mapping = { P1:[0,1,2], P2:[3,4,5], P3:[6,7,8], P4:[9,10,11] };
function projection() {
  const layout = createNewBaseGoalPathLayout({ participantIds:ids, horizontalCellCount:12, shieldLinkedLaneColumnsByParticipant:mapping });
  const cards = Array.from({ length:12 }, () => []);
  cards[0] = ['A','B','C','D','E','F','G']; cards[5] = ['Q','R'];
  return projectNewBaseGoalPathConnections(layout, { straightCardIdsByColumn:cards });
}

test('projects one shared GOAL with twelve independent entry states', () => {
  const value = projectNewBaseGoalPathPresentation(projection());
  assert.equal(value.ok, true);
  assert.equal(value.sharedGoalCount, 1);
  assert.equal(value.sharedGoalId, 'goal:shared');
  assert.equal(value.lanePresentations.length, 12);
  assert.equal(value.openGoalPathCount, 1);
  assert.equal(value.terminalWin, false);
});

test('keeps exact placed card identity and uses faint guide before opening', () => {
  const value = projectNewBaseGoalPathPresentation(projection());
  const open = value.lanePresentations[0];
  const closed = value.lanePresentations[5];
  assert.deepEqual(open.straightCardIds, ['A','B','C','D','E','F','G']);
  assert.equal(open.visualState, NEW_BASE_GOAL_PATH_VISUAL_STATE.OPEN);
  assert.equal(open.gateVisualState, 'OPEN');
  assert.deepEqual(closed.straightCardIds, ['Q','R']);
  assert.equal(closed.visualState, NEW_BASE_GOAL_PATH_VISUAL_STATE.CLOSED);
  assert.equal(closed.goalConnectionCue, 'FAINT_GUIDE_ONLY');
  assert.equal(NEW_BASE_GOAL_PATH_PRESENTATION_CONTRACT.sharedGoalCount, 1);
});

test('fails closed if caller does not provide the shared GOAL/card-lineage contract', () => {
  const broken = { ...projection(), sharedGoalCount:12 };
  assert.equal(projectNewBaseGoalPathPresentation(broken).ok, false);
});
