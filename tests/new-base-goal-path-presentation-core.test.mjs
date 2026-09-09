import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createNewBaseGoalPathLayout,
  projectNewBaseGoalPathConnections,
} from '../browser/new-base-goal-path-core.mjs';
import {
  NEW_BASE_GOAL_PATH_PRESENTATION_CONTRACT,
  NEW_BASE_GOAL_PATH_VISUAL_STATE,
  isNewBaseGoalPathPresentation,
  projectNewBaseGoalPathPresentation,
} from '../browser/new-base-goal-path-presentation-core.mjs';

const participantIds = ['P1', 'P2', 'P3', 'P4'];
const laneColumns = {
  P1: [0, 1, 2],
  P2: [3, 4, 5],
  P3: [6, 7, 8],
  P4: [9, 10, 11],
};

function layout() {
  return createNewBaseGoalPathLayout({
    participantIds,
    horizontalCellCount: 12,
    shieldLinkedLaneColumnsByParticipant: laneColumns,
  });
}

function emptyColumns() {
  return Array.from({ length: 12 }, () => []);
}

function sevenCards(prefix) {
  return Array.from({ length: 7 }, (_, index) => `${prefix}-${index + 1}`);
}

function authoritativeProjectionWithOpenLane(columnIndex = 0) {
  const columns = emptyColumns();
  columns[columnIndex] = sevenCards(`lane-${columnIndex}`);
  return projectNewBaseGoalPathConnections(layout(), { straightCardIdsByColumn: columns });
}

test('seven-straight authoritative connection becomes OPEN presentation without becoming terminal win', () => {
  const source = authoritativeProjectionWithOpenLane(0);
  const presentation = projectNewBaseGoalPathPresentation(source);

  assert.equal(source.terminalWin, false);
  assert.equal(presentation.ok, true);
  assert.equal(presentation.openGoalPathCount, 1);
  assert.equal(presentation.hasAnyOpenGoalPath, true);
  assert.equal(presentation.terminalWin, false);
  assert.equal(presentation.requiresAuthoritativeGoalReachedForResult, true);

  const opened = presentation.lanePresentations.find((lane) => lane.columnIndex === 0);
  assert.equal(opened.participantId, 'P1');
  assert.equal(opened.laneIndex, 0);
  assert.equal(opened.straightCardCount, 7);
  assert.equal(opened.connectedToGoal, true);
  assert.equal(opened.visualState, NEW_BASE_GOAL_PATH_VISUAL_STATE.OPEN);
  assert.equal(opened.roadConnectionCue, 'GOAL_LINK_ACTIVE');
  assert.equal(opened.goalConnectionCue, 'CONNECTED');
  assert.equal(opened.emphasizeRoadToGoal, true);
  assert.equal(opened.emphasizeGoal, true);
  assert.equal(opened.terminalWin, false);

  const closed = presentation.lanePresentations.find((lane) => lane.columnIndex === 1);
  assert.equal(closed.connectedToGoal, false);
  assert.equal(closed.visualState, NEW_BASE_GOAL_PATH_VISUAL_STATE.CLOSED);
  assert.equal(closed.roadConnectionCue, 'GOAL_LINK_INACTIVE');
  assert.equal(closed.goalConnectionCue, 'NOT_CONNECTED');
});

test('presentation consumes connectedToGoal from caller and never recomputes completion from card count', () => {
  const source = authoritativeProjectionWithOpenLane(0);
  const manual = {
    ...source,
    laneStates: source.laneStates.map((lane, index) => ({
      ...lane,
      straightCardCount: index === 0 ? 7 : 0,
      connectedToGoal: index === 0 ? false : lane.connectedToGoal,
    })),
    connectedGoalPaths: [],
  };

  const presentation = projectNewBaseGoalPathPresentation(manual);
  const first = presentation.lanePresentations[0];

  assert.equal(presentation.ok, true);
  assert.equal(first.straightCardCount, 7);
  assert.equal(first.connectedToGoal, false);
  assert.equal(first.visualState, NEW_BASE_GOAL_PATH_VISUAL_STATE.CLOSED);
  assert.equal(presentation.openGoalPathCount, 0);
});

test('presentation preserves exact participant/lane/column identity for board-surface consumers', () => {
  const source = authoritativeProjectionWithOpenLane(5);
  const presentation = projectNewBaseGoalPathPresentation(source);

  assert.equal(presentation.lanePresentations.length, 12);
  for (const sourceLane of source.laneStates) {
    const projected = presentation.lanePresentations.find(
      (lane) => lane.participantId === sourceLane.participantId && lane.laneIndex === sourceLane.laneIndex,
    );
    assert.ok(projected);
    assert.equal(projected.key, `${sourceLane.participantId}:${sourceLane.laneIndex}`);
    assert.equal(projected.columnIndex, sourceLane.columnIndex);
    assert.equal(projected.goalRowColumnIndex, sourceLane.goalRowColumnIndex);
  }
});

test('invalid source or any terminal-win source fails closed with no open visual lanes', () => {
  const invalidSource = projectNewBaseGoalPathPresentation({
    ok: false,
    reason: 'STRAIGHT_COLUMN_SNAPSHOT_INVALID',
    connectedGoalPaths: [],
  });
  assert.equal(invalidSource.ok, false);
  assert.equal(invalidSource.reason, 'GOAL_PATH_PROJECTION_NOT_OK');
  assert.deepEqual(invalidSource.lanePresentations, []);
  assert.equal(invalidSource.openGoalPathCount, 0);
  assert.equal(invalidSource.terminalWin, false);

  const source = authoritativeProjectionWithOpenLane(0);
  const forbidden = projectNewBaseGoalPathPresentation({ ...source, terminalWin: true });
  assert.equal(forbidden.ok, false);
  assert.equal(forbidden.reason, 'SEVEN_STRAIGHT_TERMINAL_WIN_FORBIDDEN');
  assert.deepEqual(forbidden.lanePresentations, []);
  assert.equal(forbidden.terminalWin, false);
});

test('duplicate or malformed lane identity fails closed rather than targeting the wrong board lane', () => {
  const source = authoritativeProjectionWithOpenLane(0);
  const duplicate = {
    ...source,
    laneStates: [source.laneStates[0], { ...source.laneStates[1], participantId: 'P1', laneIndex: 0 }],
  };
  const duplicateResult = projectNewBaseGoalPathPresentation(duplicate);
  assert.equal(duplicateResult.ok, false);
  assert.equal(duplicateResult.reason, 'LANE_IDENTITY_DUPLICATE');

  const malformed = {
    ...source,
    laneStates: [{ ...source.laneStates[0], goalRowColumnIndex: source.laneStates[0].columnIndex + 1 }],
  };
  const malformedResult = projectNewBaseGoalPathPresentation(malformed);
  assert.equal(malformedResult.ok, false);
  assert.equal(malformedResult.reason, 'LANE_STATE_INVALID');
});

test('WU30 stays presentation-only and leaves motion, movement, legality and result authority elsewhere', () => {
  const presentation = projectNewBaseGoalPathPresentation(authoritativeProjectionWithOpenLane(11));

  assert.equal(isNewBaseGoalPathPresentation(presentation), true);
  assert.equal(presentation.presentationOnly, true);
  assert.equal(presentation.gameplayAuthority, false);
  assert.equal(presentation.gameStateWrite, false);
  assert.equal(presentation.movementAuthority, false);
  assert.equal(presentation.legalityAuthority, false);
  assert.equal(presentation.resultAuthority, false);
  assert.equal(Object.isFrozen(presentation), true);
  assert.equal(Object.isFrozen(presentation.lanePresentations), true);

  assert.equal(NEW_BASE_GOAL_PATH_PRESENTATION_CONTRACT.computesStraightCompletion, false);
  assert.equal(NEW_BASE_GOAL_PATH_PRESENTATION_CONTRACT.computesMovementLegality, false);
  assert.equal(NEW_BASE_GOAL_PATH_PRESENTATION_CONTRACT.computesResult, false);
  assert.equal(NEW_BASE_GOAL_PATH_PRESENTATION_CONTRACT.writesGameState, false);
  assert.equal(NEW_BASE_GOAL_PATH_PRESENTATION_CONTRACT.ownsMotionChoreography, false);
  assert.equal(NEW_BASE_GOAL_PATH_PRESENTATION_CONTRACT.sevenStraightTerminalWin, false);
  assert.equal(NEW_BASE_GOAL_PATH_PRESENTATION_CONTRACT.sevenStraightEffect, 'CONNECT_PATH_TO_GOAL');
});
