import test from 'node:test';
import assert from 'node:assert/strict';
import { createNewBaseGoalPathLayout, projectNewBaseGoalPathConnections } from '../browser/new-base-goal-path-core.mjs';
import { projectNewBaseGoalPathPresentation } from '../browser/new-base-goal-path-presentation-core.mjs';
import { NEW_BASE_PROGRESSION_LANE_PRESENTATION_CONTRACT, isNewBaseProgressionLanePresentation, projectNewBaseProgressionLanePresentation } from '../browser/new-base-progression-lane-presentation-core.mjs';

function goalPresentation() {
  const participantIds = ['P1','P2','P3','P4'];
  const shieldLinkedLaneColumnsByParticipant = { P1:[0,1,2], P2:[3,4,5], P3:[6,7,8], P4:[9,10,11] };
  const layout = createNewBaseGoalPathLayout({ participantIds, horizontalCellCount:12, shieldLinkedLaneColumnsByParticipant });
  const cards = Array.from({ length:12 }, () => []);
  cards[0] = ['A','B','C']; cards[4] = ['D','E','F','G','H','I','J'];
  return projectNewBaseGoalPathPresentation(projectNewBaseGoalPathConnections(layout, { straightCardIdsByColumn:cards }));
}

test('projects only cards that actually exist; future positions have no nodes', () => {
  const value = projectNewBaseProgressionLanePresentation(goalPresentation());
  assert.equal(value.ok, true);
  assert.equal(isNewBaseProgressionLanePresentation(value), true);
  assert.equal(value.futureStageNodeCount, 0);
  assert.equal(value.totalBuiltStageCount, 10);
  assert.equal(value.totalLatentStageCount, 74);
  const lane = value.lanePresentations[0];
  assert.equal(lane.stages.length, 3);
  assert.deepEqual(lane.placedCards.map((card) => card.cardId), ['A','B','C']);
  assert.deepEqual(lane.placedCards.map((card) => card.stageIndex), [1,2,3]);
  assert.equal(lane.futureStageNodeCount, 0);
});

test('seven placed cards open the path but remain non-terminal', () => {
  const value = projectNewBaseProgressionLanePresentation(goalPresentation());
  const lane = value.lanePresentations[4];
  assert.equal(lane.placedCards.length, 7);
  assert.equal(lane.connectedToGoal, true);
  assert.equal(lane.terminalWin, false);
  assert.equal(value.terminalWin, false);
  assert.equal(NEW_BASE_PROGRESSION_LANE_PRESENTATION_CONTRACT.futureStageNodeCount, 0);
});

test('fails closed instead of synthesizing card identity from counts', () => {
  const source = goalPresentation();
  const hacked = { ...source, lanePresentations: source.lanePresentations.map((lane, index) => index === 0 ? { ...lane, straightCardIds: undefined } : lane) };
  assert.equal(projectNewBaseProgressionLanePresentation(hacked).ok, false);
});
