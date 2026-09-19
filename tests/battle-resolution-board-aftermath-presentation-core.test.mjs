import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createNewBaseGoalPathLayout,
  projectNewBaseGoalPathConnections,
} from '../browser/new-base-goal-path-core.mjs';
import {
  projectNewBaseGoalPathPresentation,
} from '../browser/new-base-goal-path-presentation-core.mjs';
import {
  projectBattleResolutionBoardReturn,
} from '../browser/battle-resolution-board-return-presentation-core.mjs';
import {
  BATTLE_RESOLUTION_BOARD_AFTERMATH_CONTRACT,
  auditBattleResolutionBoardAftermathProjection,
  projectBattleResolutionBoardAftermath,
} from '../browser/battle-resolution-board-aftermath-presentation-core.mjs';

const PARTICIPANTS = ['P1', 'P2', 'P3', 'P4'];
const LAYOUT = createNewBaseGoalPathLayout({
  participantIds: PARTICIPANTS,
  horizontalCellCount: 12,
  shieldLinkedLaneColumnsByParticipant: {
    P1: [0, 1, 2],
    P2: [3, 4, 5],
    P3: [6, 7, 8],
    P4: [9, 10, 11],
  },
});

function goalPathPresentation(cardIdsAtP2Lane0) {
  const columns = Array.from({ length: 12 }, () => []);
  columns[3] = [...cardIdsAtP2Lane0];
  return projectNewBaseGoalPathPresentation(
    projectNewBaseGoalPathConnections(LAYOUT, {
      straightCardIdsByColumn: columns,
    }),
  );
}

function boardReturn() {
  return projectBattleResolutionBoardReturn({
    boardReturn: {
      eventId: 'settle-1',
      source: 'accepted_public_compound_attack_package',
      visualIntent: 'resolution_to_committed_shield',
      effectMutationClaimed: false,
      cardId: 'battle-card-7',
      jankenHand: 'ROCK',
      path: ['field-a', 'gate-p2-l', 'shield-p2-l'],
      direction: 'upper-left',
      roadId: 'road-2',
      battleId: 'battle-1',
      opponentId: 'P2',
      shieldLane: 'L',
      shieldRef: 'shield-p2-l',
      destinationKey: 'P2:L',
    },
  });
}

const SHIELD_CHANGE = Object.freeze({
  source: 'caller_supplied_accepted_shield_afterstate',
  eventId: 'settle-1',
  opponentId: 'P2',
  shieldLane: 'L',
  shieldRef: 'shield-p2-l',
  beforeStateRef: 'shield-state:before',
  afterStateRef: 'shield-state:after',
  changed: true,
});

test('projects accepted shield refresh, lane advance, and seven-card route opening without terminal win', () => {
  const before = goalPathPresentation(['c1', 'c2', 'c3', 'c4', 'c5', 'c6']);
  const after = goalPathPresentation(['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7']);
  const result = projectBattleResolutionBoardAftermath({
    boardReturnProjection: boardReturn(),
    beforeGoalPathPresentation: before,
    afterGoalPathPresentation: after,
    acceptedShieldChange: SHIELD_CHANGE,
  });

  assert.equal(result.presentationOnly, true);
  assert.equal(result.gameplayAuthority, false);
  assert.equal(result.gameStateWrite, false);
  assert.equal(result.shieldEffectCalculation, false);
  assert.equal(result.laneProgressCalculation, false);
  assert.equal(result.goalPathCalculation, false);
  assert.equal(result.goalArrivalCalculation, false);
  assert.equal(result.resultCalculation, false);
  assert.equal(result.terminalCalculation, false);

  assert.equal(result.returnDestination.destinationKey, 'P2:L');
  assert.equal(result.shieldChange.changed, true);
  assert.equal(result.shieldChange.visualIntent, 'REFRESH_COMMITTED_SHIELD_STATE');

  assert.equal(result.progression.laneChanges.length, 1);
  const lane = result.progression.laneChanges[0];
  assert.equal(lane.key, 'P2:0');
  assert.equal(lane.beforeCardCount, 6);
  assert.equal(lane.afterCardCount, 7);
  assert.equal(lane.countDirection, 'INCREASED');
  assert.deepEqual(lane.changedStages.map((stage) => stage.stageIndex), [7]);
  assert.equal(lane.changedStages[0].afterCardId, 'c7');
  assert.equal(lane.routeTransition, 'OPENED');
  assert.equal(lane.beforeConnectedToGoal, false);
  assert.equal(lane.afterConnectedToGoal, true);
  assert.equal(lane.terminalWin, false);

  assert.equal(result.progression.routeOpenings.length, 1);
  assert.equal(result.progression.routeOpenings[0].key, 'P2:0');
  assert.equal(result.progression.routeClosings.length, 0);
  assert.equal(result.terminalWin, false);
  assert.equal(result.sevenStraightIsTerminal, false);
  assert.equal(result.actualGoalEntryHandledHere, false);
  assert.deepEqual(result.sequence.map((stage) => stage.kind), [
    'return_destination',
    'shield_afterstate',
    'progression_lane_changes',
    'goal_path_changes',
    'authority_handoff',
  ]);
  assert.equal(result.sequence.at(-1).goalArrivalCalculated, false);
  assert.equal(result.sequence.at(-1).resultCalculated, false);
  assert.equal(result.sequence.at(-1).terminalCalculated, false);
  assert.equal(result.sequence.at(-1).nextAuthority, 'CALLER_EXISTING_BOARD_OR_GOAL_REACHED_FLOW');
  assert.equal(auditBattleResolutionBoardAftermathProjection(result).ok, true);
});

test('projects ordinary accepted lane advance without inventing a GOAL route opening', () => {
  const result = projectBattleResolutionBoardAftermath({
    boardReturnProjection: boardReturn(),
    beforeGoalPathPresentation: goalPathPresentation(['c1', 'c2', 'c3', 'c4']),
    afterGoalPathPresentation: goalPathPresentation(['c1', 'c2', 'c3', 'c4', 'c5']),
  });

  assert.equal(result.progression.laneChanges.length, 1);
  assert.equal(result.progression.laneChanges[0].beforeCardCount, 4);
  assert.equal(result.progression.laneChanges[0].afterCardCount, 5);
  assert.equal(result.progression.laneChanges[0].countDirection, 'INCREASED');
  assert.equal(result.progression.laneChanges[0].routeTransition, 'UNCHANGED');
  assert.equal(result.progression.routeOpenings.length, 0);
  assert.deepEqual(result.sequence.map((stage) => stage.kind), [
    'return_destination',
    'progression_lane_changes',
    'authority_handoff',
  ]);
  assert.equal(result.terminalWin, false);
});

test('keeps accepted no-change board state as a return plus authority handoff', () => {
  const unchanged = goalPathPresentation(['c1', 'c2', 'c3']);
  const result = projectBattleResolutionBoardAftermath({
    boardReturnProjection: boardReturn(),
    beforeGoalPathPresentation: unchanged,
    afterGoalPathPresentation: unchanged,
    acceptedShieldChange: {
      ...SHIELD_CHANGE,
      beforeStateRef: 'shield-state:same',
      afterStateRef: 'shield-state:same',
      changed: false,
    },
  });

  assert.equal(result.progression.laneChanges.length, 0);
  assert.equal(result.progression.routeOpenings.length, 0);
  assert.equal(result.shieldChange.changed, false);
  assert.equal(result.shieldChange.visualIntent, 'KEEP_COMMITTED_SHIELD_STATE');
  assert.deepEqual(result.sequence.map((stage) => stage.kind), [
    'return_destination',
    'shield_afterstate',
    'authority_handoff',
  ]);
});

test('reduced-motion and low-performance modes preserve the same accepted semantic changes', () => {
  const before = goalPathPresentation(['c1', 'c2', 'c3', 'c4', 'c5', 'c6']);
  const after = goalPathPresentation(['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7']);
  const standard = projectBattleResolutionBoardAftermath({
    boardReturnProjection: boardReturn(),
    beforeGoalPathPresentation: before,
    afterGoalPathPresentation: after,
    acceptedShieldChange: SHIELD_CHANGE,
  });

  for (const flags of [{ reducedMotion: true }, { lowPerf: true }]) {
    const result = projectBattleResolutionBoardAftermath({
      boardReturnProjection: boardReturn(),
      beforeGoalPathPresentation: before,
      afterGoalPathPresentation: after,
      acceptedShieldChange: SHIELD_CHANGE,
      ...flags,
    });
    assert.equal(result.motion.mode, 'static_aftermath');
    assert.equal(result.motion.animateReturnArrival, false);
    assert.equal(result.motion.pulseShieldChange, false);
    assert.equal(result.motion.pulseChangedStages, false);
    assert.equal(result.motion.animateRouteOpening, false);
    assert.deepEqual(result.progression, standard.progression);
    assert.deepEqual(result.sequence, standard.sequence);
  }
});

test('fails closed when caller shield afterstate does not match the committed return destination', () => {
  const before = goalPathPresentation(['c1']);
  const after = goalPathPresentation(['c1', 'c2']);

  assert.throws(
    () => projectBattleResolutionBoardAftermath({
      boardReturnProjection: boardReturn(),
      beforeGoalPathPresentation: before,
      afterGoalPathPresentation: after,
      acceptedShieldChange: { ...SHIELD_CHANGE, eventId: 'settle-other' },
    }),
    /SHIELD_EVENT_MISMATCH/,
  );

  assert.throws(
    () => projectBattleResolutionBoardAftermath({
      boardReturnProjection: boardReturn(),
      beforeGoalPathPresentation: before,
      afterGoalPathPresentation: after,
      acceptedShieldChange: { ...SHIELD_CHANGE, opponentId: 'P3' },
    }),
    /SHIELD_OPPONENT_MISMATCH/,
  );

  assert.throws(
    () => projectBattleResolutionBoardAftermath({
      boardReturnProjection: boardReturn(),
      beforeGoalPathPresentation: before,
      afterGoalPathPresentation: after,
      acceptedShieldChange: { ...SHIELD_CHANGE, shieldLane: 'R' },
    }),
    /SHIELD_LANE_MISMATCH/,
  );
});

test('fails closed when the board return or goal-path inputs are not accepted presentation projections', () => {
  const valid = goalPathPresentation([]);

  assert.throws(
    () => projectBattleResolutionBoardAftermath({
      boardReturnProjection: { schema: 'wrong' },
      beforeGoalPathPresentation: valid,
      afterGoalPathPresentation: valid,
    }),
    /BOARD_RETURN_REQUIRED/,
  );

  assert.throws(
    () => projectBattleResolutionBoardAftermath({
      boardReturnProjection: boardReturn(),
      beforeGoalPathPresentation: { ...valid, terminalWin: true },
      afterGoalPathPresentation: valid,
    }),
    /BEFORE_GOAL_PATH_INVALID/,
  );
});

test('contract keeps actual GOAL entry and terminal result in the existing separate authority', () => {
  const result = projectBattleResolutionBoardAftermath({
    boardReturnProjection: boardReturn(),
    beforeGoalPathPresentation: goalPathPresentation(['c1', 'c2', 'c3', 'c4', 'c5', 'c6']),
    afterGoalPathPresentation: goalPathPresentation(['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7']),
  });

  assert.equal(BATTLE_RESOLUTION_BOARD_AFTERMATH_CONTRACT.authority, 'NONE_PRESENTATION_ONLY');
  assert.equal(BATTLE_RESOLUTION_BOARD_AFTERMATH_CONTRACT.sevenStraightTerminalWin, false);
  assert.equal(BATTLE_RESOLUTION_BOARD_AFTERMATH_CONTRACT.actualGoalEntryHandledHere, false);
  assert.equal(BATTLE_RESOLUTION_BOARD_AFTERMATH_CONTRACT.goalArrivalAuthority, 'EXISTING_SEPARATE_GOAL_REACHED_FLOW');
  assert.equal(BATTLE_RESOLUTION_BOARD_AFTERMATH_CONTRACT.liveMountOwnedHere, false);
  assert.equal(BATTLE_RESOLUTION_BOARD_AFTERMATH_CONTRACT.formalVisualOwnedHere, false);
  assert.equal(result.terminalWin, false);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.progression.laneChanges), true);
});
