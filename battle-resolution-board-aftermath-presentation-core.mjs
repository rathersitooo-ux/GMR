import {
  BATTLE_RESOLUTION_BOARD_RETURN_SCHEMA,
  auditBattleResolutionBoardReturnProjection,
} from './battle-resolution-board-return-presentation-core.mjs';
import {
  isNewBaseGoalPathPresentation,
} from './new-base-goal-path-presentation-core.mjs';
import {
  projectNewBaseProgressionLanePresentation,
} from './new-base-progression-lane-presentation-core.mjs';

export const BATTLE_RESOLUTION_BOARD_AFTERMATH_SCHEMA =
  'gameroad.battle-resolution-board-aftermath-presentation.v1';

const SHIELD_LANES = new Set(['L', 'C', 'R']);

function fail(code) {
  throw new TypeError(code);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function canonicalString(value, code, maximum = 240) {
  if (typeof value !== 'string') fail(code);
  const trimmed = value.trim();
  if (!trimmed || trimmed !== value || trimmed.length > maximum) fail(code);
  return trimmed;
}

function optionalString(value, code, maximum = 240) {
  if (value == null) return null;
  return canonicalString(value, code, maximum);
}

function normalizeBoardReturnProjection(value) {
  if (!value || value.schema !== BATTLE_RESOLUTION_BOARD_RETURN_SCHEMA) {
    fail('BATTLE_AFTERMATH_BOARD_RETURN_REQUIRED');
  }
  const audit = auditBattleResolutionBoardReturnProjection(value);
  if (audit?.ok !== true) fail('BATTLE_AFTERMATH_BOARD_RETURN_INVALID');
  return value;
}

function normalizeGoalPathPresentation(value, code) {
  if (!isNewBaseGoalPathPresentation(value) || value.ok !== true) fail(code);
  if (value.terminalWin !== false ||
      value.presentationOnly !== true ||
      value.gameplayAuthority !== false ||
      value.gameStateWrite !== false) {
    fail(code);
  }
  return value;
}

function laneMap(progression, code) {
  if (!progression?.ok || !Array.isArray(progression.lanePresentations)) fail(code);
  const map = new Map();
  for (const lane of progression.lanePresentations) {
    if (!lane || typeof lane !== 'object' || Array.isArray(lane)) fail(code);
    const key = canonicalString(lane.key, code);
    if (map.has(key)) fail(code + '_DUPLICATE');
    map.set(key, lane);
  }
  return map;
}

function sameArray(left, right) {
  if (left == null || right == null) return left === right;
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function stageChanges(beforeLane, afterLane) {
  if (!Array.isArray(beforeLane.stages) || !Array.isArray(afterLane.stages) ||
      beforeLane.stages.length !== afterLane.stages.length) {
    fail('BATTLE_AFTERMATH_STAGE_SET_MISMATCH');
  }
  const changed = [];
  for (let index = 0; index < beforeLane.stages.length; index += 1) {
    const before = beforeLane.stages[index];
    const after = afterLane.stages[index];
    if (before?.stageIndex !== after?.stageIndex || before?.roadStepId !== after?.roadStepId) {
      fail('BATTLE_AFTERMATH_STAGE_IDENTITY_MISMATCH');
    }
    if (before.visualState !== after.visualState ||
        before.cardId !== after.cardId ||
        before.established !== after.established ||
        before.latent !== after.latent) {
      changed.push(deepFreeze({
        stageIndex: after.stageIndex,
        roadStepId: after.roadStepId,
        beforeCardId: before.cardId ?? null,
        afterCardId: after.cardId ?? null,
        beforeVisualState: before.visualState,
        afterVisualState: after.visualState,
      }));
    }
  }
  return changed;
}

function normalizeLanePair(beforeLane, afterLane) {
  if (!beforeLane || !afterLane) fail('BATTLE_AFTERMATH_LANE_PAIR_REQUIRED');
  const stableFields = ['key', 'participantId', 'laneIndex', 'routeGateId', 'sharedGoalId'];
  for (const field of stableFields) {
    if (beforeLane[field] !== afterLane[field]) fail('BATTLE_AFTERMATH_LANE_IDENTITY_MISMATCH');
  }
  const changedStages = stageChanges(beforeLane, afterLane);
  const cardIdsChanged = !sameArray(beforeLane.straightCardIds, afterLane.straightCardIds);
  const countChanged = beforeLane.straightCardCount !== afterLane.straightCardCount;
  const routeChanged = beforeLane.connectedToGoal !== afterLane.connectedToGoal;
  if (!changedStages.length && !cardIdsChanged && !countChanged && !routeChanged) return null;

  const routeTransition = !beforeLane.connectedToGoal && afterLane.connectedToGoal
    ? 'OPENED'
    : beforeLane.connectedToGoal && !afterLane.connectedToGoal
      ? 'CLOSED'
      : 'UNCHANGED';

  const countDirection = afterLane.straightCardCount > beforeLane.straightCardCount
    ? 'INCREASED'
    : afterLane.straightCardCount < beforeLane.straightCardCount
      ? 'DECREASED'
      : 'UNCHANGED';

  return deepFreeze({
    key: afterLane.key,
    participantId: afterLane.participantId,
    laneIndex: afterLane.laneIndex,
    routeGateId: afterLane.routeGateId,
    sharedGoalId: afterLane.sharedGoalId,
    beforeCardCount: beforeLane.straightCardCount,
    afterCardCount: afterLane.straightCardCount,
    beforeCardIds: beforeLane.straightCardIds == null ? null : [...beforeLane.straightCardIds],
    afterCardIds: afterLane.straightCardIds == null ? null : [...afterLane.straightCardIds],
    changedStages,
    countDirection,
    routeTransition,
    beforeConnectedToGoal: beforeLane.connectedToGoal,
    afterConnectedToGoal: afterLane.connectedToGoal,
    terminalWin: false,
    authority: 'existing_goal_path_and_progression_presentations_only',
  });
}

function diffProgression(beforeGoalPath, afterGoalPath) {
  const before = projectNewBaseProgressionLanePresentation(beforeGoalPath);
  const after = projectNewBaseProgressionLanePresentation(afterGoalPath);
  if (before.ok !== true || after.ok !== true) fail('BATTLE_AFTERMATH_PROGRESSION_PROJECTION_FAILED');
  if (before.sharedGoalId !== after.sharedGoalId) fail('BATTLE_AFTERMATH_SHARED_GOAL_MISMATCH');
  if (before.stageCount !== after.stageCount) fail('BATTLE_AFTERMATH_STAGE_COUNT_MISMATCH');

  const beforeMap = laneMap(before, 'BATTLE_AFTERMATH_BEFORE_LANES_INVALID');
  const afterMap = laneMap(after, 'BATTLE_AFTERMATH_AFTER_LANES_INVALID');
  if (beforeMap.size !== afterMap.size) fail('BATTLE_AFTERMATH_LANE_SET_MISMATCH');
  for (const key of beforeMap.keys()) {
    if (!afterMap.has(key)) fail('BATTLE_AFTERMATH_LANE_SET_MISMATCH');
  }

  const laneChanges = [];
  for (const [key, beforeLane] of beforeMap.entries()) {
    const changed = normalizeLanePair(beforeLane, afterMap.get(key));
    if (changed) laneChanges.push(changed);
  }
  return deepFreeze({
    stageCount: after.stageCount,
    sharedGoalId: after.sharedGoalId,
    laneChanges,
    routeOpenings: laneChanges.filter((lane) => lane.routeTransition === 'OPENED'),
    routeClosings: laneChanges.filter((lane) => lane.routeTransition === 'CLOSED'),
  });
}

function normalizeAcceptedShieldChange(value, boardReturn) {
  if (value == null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('BATTLE_AFTERMATH_SHIELD_CHANGE_INVALID');
  }
  if (value.source !== 'caller_supplied_accepted_shield_afterstate') {
    fail('BATTLE_AFTERMATH_SHIELD_CHANGE_SOURCE_INVALID');
  }
  const eventId = canonicalString(value.eventId, 'BATTLE_AFTERMATH_SHIELD_EVENT_INVALID');
  if (eventId !== boardReturn.eventId) fail('BATTLE_AFTERMATH_SHIELD_EVENT_MISMATCH');
  const opponentId = canonicalString(value.opponentId, 'BATTLE_AFTERMATH_SHIELD_OPPONENT_INVALID');
  if (opponentId !== boardReturn.destination.opponentId) fail('BATTLE_AFTERMATH_SHIELD_OPPONENT_MISMATCH');
  const shieldLane = canonicalString(value.shieldLane, 'BATTLE_AFTERMATH_SHIELD_LANE_INVALID', 8).toUpperCase();
  if (!SHIELD_LANES.has(shieldLane)) fail('BATTLE_AFTERMATH_SHIELD_LANE_INVALID');
  if (shieldLane !== boardReturn.destination.shieldLane) fail('BATTLE_AFTERMATH_SHIELD_LANE_MISMATCH');
  if (typeof value.changed !== 'boolean') fail('BATTLE_AFTERMATH_SHIELD_CHANGED_FLAG_REQUIRED');

  return deepFreeze({
    source: value.source,
    eventId,
    opponentId,
    shieldLane,
    shieldRef: optionalString(value.shieldRef, 'BATTLE_AFTERMATH_SHIELD_REF_INVALID'),
    beforeStateRef: optionalString(value.beforeStateRef, 'BATTLE_AFTERMATH_SHIELD_BEFORE_INVALID'),
    afterStateRef: optionalString(value.afterStateRef, 'BATTLE_AFTERMATH_SHIELD_AFTER_INVALID'),
    changed: value.changed,
    visualIntent: value.changed
      ? 'REFRESH_COMMITTED_SHIELD_STATE'
      : 'KEEP_COMMITTED_SHIELD_STATE',
    effectMeaningCalculated: false,
  });
}

function motionProjection({ reducedMotion, lowPerf, shieldChange, laneChanges, routeOpenings }) {
  const staticOnly = reducedMotion === true || lowPerf === true;
  return deepFreeze({
    mode: staticOnly ? 'static_aftermath' : 'board_aftermath',
    animateReturnArrival: !staticOnly,
    pulseShieldChange: !staticOnly && shieldChange?.changed === true,
    pulseChangedStages: !staticOnly && laneChanges.length > 0,
    animateRouteOpening: !staticOnly && routeOpenings.length > 0,
    preserveSemanticOrder: true,
  });
}

function buildSequence(boardReturn, shieldChange, progression) {
  const sequence = [
    deepFreeze({
      kind: 'return_destination',
      eventId: boardReturn.eventId,
      opponentId: boardReturn.destination.opponentId,
      shieldLane: boardReturn.destination.shieldLane,
      destinationKey: boardReturn.destination.destinationKey,
      authority: 'existing_battle_resolution_board_return_projection',
    }),
  ];

  if (shieldChange) {
    sequence.push(deepFreeze({
      kind: 'shield_afterstate',
      ...shieldChange,
      authority: 'caller_supplied_accepted_shield_afterstate',
    }));
  }

  if (progression.laneChanges.length) {
    sequence.push(deepFreeze({
      kind: 'progression_lane_changes',
      changes: progression.laneChanges,
      authority: 'existing_new_base_progression_lane_presentations',
    }));
  }

  if (progression.routeOpenings.length || progression.routeClosings.length) {
    sequence.push(deepFreeze({
      kind: 'goal_path_changes',
      opened: progression.routeOpenings,
      closed: progression.routeClosings,
      sharedGoalId: progression.sharedGoalId,
      terminalWin: false,
      authority: 'existing_new_base_goal_path_presentations',
    }));
  }

  sequence.push(deepFreeze({
    kind: 'authority_handoff',
    goalArrivalCalculated: false,
    resultCalculated: false,
    terminalCalculated: false,
    nextAuthority: 'CALLER_EXISTING_BOARD_OR_GOAL_REACHED_FLOW',
    authority: 'none',
  }));
  return Object.freeze(sequence);
}

export function projectBattleResolutionBoardAftermath({
  boardReturnProjection,
  beforeGoalPathPresentation,
  afterGoalPathPresentation,
  acceptedShieldChange = null,
  reducedMotion = false,
  lowPerf = false,
} = {}) {
  const boardReturn = normalizeBoardReturnProjection(boardReturnProjection);
  const beforeGoalPath = normalizeGoalPathPresentation(
    beforeGoalPathPresentation,
    'BATTLE_AFTERMATH_BEFORE_GOAL_PATH_INVALID',
  );
  const afterGoalPath = normalizeGoalPathPresentation(
    afterGoalPathPresentation,
    'BATTLE_AFTERMATH_AFTER_GOAL_PATH_INVALID',
  );

  const progression = diffProgression(beforeGoalPath, afterGoalPath);
  const shieldChange = normalizeAcceptedShieldChange(acceptedShieldChange, boardReturn);
  const sequence = buildSequence(boardReturn, shieldChange, progression);

  return deepFreeze({
    schema: BATTLE_RESOLUTION_BOARD_AFTERMATH_SCHEMA,
    presentationOnly: true,
    gameplayAuthority: false,
    gameStateWrite: false,
    shieldEffectCalculation: false,
    laneProgressCalculation: false,
    goalPathCalculation: false,
    goalArrivalCalculation: false,
    resultCalculation: false,
    terminalCalculation: false,
    eventId: boardReturn.eventId,
    traceKey: boardReturn.traceKey + ':aftermath',
    returnDestination: boardReturn.destination,
    shieldChange,
    progression: {
      stageCount: progression.stageCount,
      sharedGoalId: progression.sharedGoalId,
      laneChanges: progression.laneChanges,
      routeOpenings: progression.routeOpenings,
      routeClosings: progression.routeClosings,
    },
    sequence,
    motion: motionProjection({
      reducedMotion,
      lowPerf,
      shieldChange,
      laneChanges: progression.laneChanges,
      routeOpenings: progression.routeOpenings,
    }),
    terminalWin: false,
    sevenStraightIsTerminal: false,
    actualGoalEntryHandledHere: false,
  });
}

export function auditBattleResolutionBoardAftermathProjection(projection) {
  const defects = [];
  if (!projection || projection.schema !== BATTLE_RESOLUTION_BOARD_AFTERMATH_SCHEMA) defects.push('SCHEMA');
  if (projection?.presentationOnly !== true ||
      projection?.gameplayAuthority !== false ||
      projection?.gameStateWrite !== false) defects.push('AUTHORITY');
  if (projection?.shieldEffectCalculation !== false ||
      projection?.laneProgressCalculation !== false ||
      projection?.goalPathCalculation !== false ||
      projection?.goalArrivalCalculation !== false ||
      projection?.resultCalculation !== false ||
      projection?.terminalCalculation !== false) defects.push('RECALCULATION');
  if (projection?.terminalWin !== false ||
      projection?.sevenStraightIsTerminal !== false ||
      projection?.actualGoalEntryHandledHere !== false) defects.push('TERMINAL_BOUNDARY');
  if (!Array.isArray(projection?.progression?.laneChanges) ||
      !Array.isArray(projection?.progression?.routeOpenings) ||
      !Array.isArray(projection?.sequence)) defects.push('AFTERMATH_COLLECTIONS');
  if (projection?.sequence?.[0]?.kind !== 'return_destination' ||
      projection?.sequence?.at(-1)?.kind !== 'authority_handoff') defects.push('SEQUENCE');
  for (const opening of projection?.progression?.routeOpenings ?? []) {
    if (opening.routeTransition !== 'OPENED' ||
        opening.beforeConnectedToGoal !== false ||
        opening.afterConnectedToGoal !== true ||
        opening.terminalWin !== false) defects.push('ROUTE_OPENING');
  }
  if (!['board_aftermath', 'static_aftermath'].includes(projection?.motion?.mode)) defects.push('MOTION');
  return deepFreeze({ ok: defects.length === 0, defects });
}

export const BATTLE_RESOLUTION_BOARD_AFTERMATH_CONTRACT = deepFreeze({
  schema: BATTLE_RESOLUTION_BOARD_AFTERMATH_SCHEMA,
  authority: 'NONE_PRESENTATION_ONLY',
  boardReturnAuthority: 'EXISTING_BATTLE_RESOLUTION_BOARD_RETURN_PROJECTION',
  laneProgressAuthority: 'EXISTING_NEW_BASE_GOAL_PATH_AND_PROGRESSION_PRESENTATIONS',
  shieldAfterstateAuthority: 'CALLER_SUPPLIED_ACCEPTED_SHIELD_AFTERSTATE_ONLY',
  goalArrivalAuthority: 'EXISTING_SEPARATE_GOAL_REACHED_FLOW',
  sevenStraightEffect: 'DISPLAY_EXISTING_ROUTE_OPENING_ONLY',
  sevenStraightTerminalWin: false,
  actualGoalEntryHandledHere: false,
  gameplayStateWrite: false,
  liveMountOwnedHere: false,
  formalVisualOwnedHere: false,
});
