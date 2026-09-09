import test from 'node:test';
import assert from 'node:assert/strict';

import { projectNewBaseGoalPathPresentation } from '../browser/new-base-goal-path-presentation-core.mjs';
import {
  NEW_BASE_PROGRESSION_LANE_PRESENTATION_CONTRACT,
  NEW_BASE_PROGRESSION_STAGE_VISUAL_STATE,
  isNewBaseProgressionLanePresentation,
  projectNewBaseProgressionLanePresentation,
} from '../browser/new-base-progression-lane-presentation-core.mjs';

function sourceLane({
  participantId = 'P1',
  laneIndex = 0,
  columnIndex = laneIndex,
  straightCardCount = 0,
  connectedToGoal = false,
} = {}) {
  return {
    participantId,
    laneIndex,
    columnIndex,
    goalRowColumnIndex: columnIndex,
    straightCardCount,
    connectedToGoal,
  };
}

function goalPathPresentation(lanes) {
  return projectNewBaseGoalPathPresentation({
    ok: true,
    reason: 'TEST_GOAL_PATH_PROJECTION',
    terminalWin: false,
    horizontalCellCount: 12,
    laneStates: lanes,
  });
}

function projectOne(input = {}) {
  const goalPath = goalPathPresentation([sourceLane(input)]);
  assert.equal(goalPath.ok, true);
  return projectNewBaseProgressionLanePresentation(goalPath);
}

test('0 cards keeps all seven future stages latent and never open or traversable', () => {
  const result = projectOne({ straightCardCount: 0 });
  assert.equal(result.ok, true);
  assert.equal(result.stageCount, 7);
  assert.equal(result.totalBuiltStageCount, 0);
  assert.equal(result.totalLatentStageCount, 7);
  assert.equal(result.lanePresentations.length, 1);
  assert.equal(result.lanePresentations[0].stages.length, 7);

  for (const stage of result.lanePresentations[0].stages) {
    assert.equal(stage.visualState, NEW_BASE_PROGRESSION_STAGE_VISUAL_STATE.LATENT);
    assert.equal(stage.established, false);
    assert.equal(stage.latent, true);
    assert.equal(stage.visualCue, 'FUTURE_PROGRESS_NOT_OPEN');
    assert.equal(stage.actionable, false);
    assert.equal(stage.traversable, false);
    assert.equal(stage.legalityAuthority, false);
    assert.equal(stage.movementAuthority, false);
  }
  assert.equal(result.futureStageLooksOpen, false);
  assert.equal(result.futureStageActionable, false);
  assert.equal(result.futureStageTraversable, false);
});

test('three cards exposes only first three stages as established progress', () => {
  const result = projectOne({ straightCardCount: 3 });
  const stages = result.lanePresentations[0].stages;
  assert.deepEqual(
    stages.map((stage) => stage.visualState),
    [
      NEW_BASE_PROGRESSION_STAGE_VISUAL_STATE.BUILT,
      NEW_BASE_PROGRESSION_STAGE_VISUAL_STATE.BUILT,
      NEW_BASE_PROGRESSION_STAGE_VISUAL_STATE.BUILT,
      NEW_BASE_PROGRESSION_STAGE_VISUAL_STATE.LATENT,
      NEW_BASE_PROGRESSION_STAGE_VISUAL_STATE.LATENT,
      NEW_BASE_PROGRESSION_STAGE_VISUAL_STATE.LATENT,
      NEW_BASE_PROGRESSION_STAGE_VISUAL_STATE.LATENT,
    ],
  );
  assert.equal(result.lanePresentations[0].builtStageCount, 3);
  assert.equal(result.lanePresentations[0].latentStageCount, 4);
  assert.equal(stages[2].visualCue, 'ESTABLISHED_PROGRESS');
  assert.equal(stages[3].visualCue, 'FUTURE_PROGRESS_NOT_OPEN');
});

test('seven established stages do not infer that the GOAL path is connected', () => {
  const result = projectOne({ straightCardCount: 7, connectedToGoal: false });
  assert.equal(result.ok, true);
  assert.equal(result.lanePresentations[0].builtStageCount, 7);
  assert.equal(result.lanePresentations[0].latentStageCount, 0);
  assert.equal(result.lanePresentations[0].connectedToGoal, false);
  assert.equal(result.terminalWin, false);
  assert.equal(result.resultAuthority, false);
});

test('caller-authoritative connected GOAL path is preserved without becoming terminal victory', () => {
  const result = projectOne({ straightCardCount: 7, connectedToGoal: true });
  assert.equal(result.ok, true);
  assert.equal(result.lanePresentations[0].connectedToGoal, true);
  assert.equal(result.lanePresentations[0].builtStageCount, 7);
  assert.equal(result.terminalWin, false);
  assert.equal(result.gameplayAuthority, false);
  assert.equal(result.gameStateWrite, false);
});

test('stage identities match the existing Flanora road-step identity shape', () => {
  const result = projectOne({ participantId: 'P3', laneIndex: 2, straightCardCount: 2 });
  assert.deepEqual(
    result.lanePresentations[0].stages.map((stage) => stage.roadStepId),
    [1, 2, 3, 4, 5, 6, 7].map((stageIndex) => `road:P3:2:${stageIndex}`),
  );
});

test('straightCardCount outside the exact seven-stage surface fails closed', () => {
  for (const straightCardCount of [-1, 8, 1.5]) {
    const source = goalPathPresentation([sourceLane({ straightCardCount })]);
    const result = projectNewBaseProgressionLanePresentation(source);
    assert.equal(result.ok, false);
    assert.equal(result.lanePresentations.length, 0);
    assert.equal(result.futureStageLooksOpen, false);
    assert.equal(result.futureStageActionable, false);
    assert.equal(result.futureStageTraversable, false);
  }
});

test('invalid lane identity and duplicate participant-lane identity fail closed', () => {
  const tooWideLane = goalPathPresentation([sourceLane({ laneIndex: 3, columnIndex: 3 })]);
  const invalidLaneResult = projectNewBaseProgressionLanePresentation(tooWideLane);
  assert.equal(invalidLaneResult.ok, false);
  assert.equal(invalidLaneResult.reason, 'LANE_PRESENTATION_INVALID');

  const good = goalPathPresentation([sourceLane({ participantId: 'P2', laneIndex: 1, columnIndex: 4 })]);
  const duplicateSource = {
    ...good,
    lanePresentations: [good.lanePresentations[0], { ...good.lanePresentations[0] }],
  };
  const duplicateResult = projectNewBaseProgressionLanePresentation(duplicateSource);
  assert.equal(duplicateResult.ok, false);
  assert.equal(duplicateResult.reason, 'LANE_IDENTITY_DUPLICATE');
});

test('projection and contract stay frozen and authority-free', () => {
  const result = projectOne({ straightCardCount: 5 });
  assert.equal(isNewBaseProgressionLanePresentation(result), true);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.lanePresentations[0]), true);
  assert.equal(Object.isFrozen(result.lanePresentations[0].stages[0]), true);
  assert.equal(result.presentationOnly, true);
  assert.equal(result.movementAuthority, false);
  assert.equal(result.legalityAuthority, false);
  assert.equal(result.resultAuthority, false);

  assert.equal(NEW_BASE_PROGRESSION_LANE_PRESENTATION_CONTRACT.stageCount, 7);
  assert.equal(NEW_BASE_PROGRESSION_LANE_PRESENTATION_CONTRACT.computesStraightCompletion, false);
  assert.equal(NEW_BASE_PROGRESSION_LANE_PRESENTATION_CONTRACT.computesGoalPathConnection, false);
  assert.equal(NEW_BASE_PROGRESSION_LANE_PRESENTATION_CONTRACT.computesMovementLegality, false);
  assert.equal(NEW_BASE_PROGRESSION_LANE_PRESENTATION_CONTRACT.computesResult, false);
  assert.equal(NEW_BASE_PROGRESSION_LANE_PRESENTATION_CONTRACT.writesGameState, false);
  assert.equal(NEW_BASE_PROGRESSION_LANE_PRESENTATION_CONTRACT.secondBoardEngine, false);
});
