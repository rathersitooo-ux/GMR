const SCHEMA = 'GAMEROAD_NEW_BASE_GOAL_PATH_PRESENTATION_V1';

export const NEW_BASE_GOAL_PATH_VISUAL_STATE = Object.freeze({
  CLOSED: 'CLOSED',
  OPEN: 'OPEN',
});

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function safeNonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function failClosed(reason) {
  return deepFreeze({
    schema: SCHEMA,
    ok: false,
    reason,
    lanePresentations: [],
    openGoalPathCount: 0,
    terminalWin: false,
    presentationOnly: true,
    gameplayAuthority: false,
    gameStateWrite: false,
    movementAuthority: false,
    legalityAuthority: false,
    resultAuthority: false,
  });
}

function normalizeLaneState(lane) {
  if (!lane || typeof lane !== 'object' || Array.isArray(lane)) return null;
  if (!nonEmptyString(lane.participantId)) return null;
  if (!safeNonNegativeInteger(lane.laneIndex)) return null;
  if (!safeNonNegativeInteger(lane.columnIndex)) return null;
  if (!safeNonNegativeInteger(lane.goalRowColumnIndex)) return null;
  if (lane.goalRowColumnIndex !== lane.columnIndex) return null;
  if (!safeNonNegativeInteger(lane.straightCardCount)) return null;
  if (typeof lane.connectedToGoal !== 'boolean') return null;

  const participantId = lane.participantId.trim();
  const visualState = lane.connectedToGoal
    ? NEW_BASE_GOAL_PATH_VISUAL_STATE.OPEN
    : NEW_BASE_GOAL_PATH_VISUAL_STATE.CLOSED;

  return {
    key: `${participantId}:${lane.laneIndex}`,
    participantId,
    laneIndex: lane.laneIndex,
    columnIndex: lane.columnIndex,
    goalRowColumnIndex: lane.goalRowColumnIndex,
    straightCardCount: lane.straightCardCount,
    connectedToGoal: lane.connectedToGoal,
    visualState,
    roadConnectionCue: lane.connectedToGoal ? 'GOAL_LINK_ACTIVE' : 'GOAL_LINK_INACTIVE',
    goalConnectionCue: lane.connectedToGoal ? 'CONNECTED' : 'NOT_CONNECTED',
    emphasizeRoadToGoal: lane.connectedToGoal,
    emphasizeGoal: lane.connectedToGoal,
    terminalWin: false,
  };
}

/**
 * Projects the existing authoritative new-base GOAL-path projection into a
 * presentation-only lane plan.
 *
 * This layer deliberately does not count cards, decide whether a lane is
 * complete, decide movement legality, or decide match result. `connectedToGoal`
 * is caller-authoritative. Seven-straight semantics remain owned by
 * new-base-goal-path-core, while terminal victory remains owned by the existing
 * authoritative GOAL_REACHED result path.
 */
export function projectNewBaseGoalPathPresentation(goalPathProjection) {
  if (!goalPathProjection || typeof goalPathProjection !== 'object' || Array.isArray(goalPathProjection)) {
    return failClosed('GOAL_PATH_PROJECTION_REQUIRED');
  }
  if (goalPathProjection.ok !== true) return failClosed('GOAL_PATH_PROJECTION_NOT_OK');
  if (goalPathProjection.terminalWin !== false) return failClosed('SEVEN_STRAIGHT_TERMINAL_WIN_FORBIDDEN');
  if (!safeNonNegativeInteger(goalPathProjection.horizontalCellCount)) {
    return failClosed('HORIZONTAL_CELL_COUNT_INVALID');
  }
  if (!Array.isArray(goalPathProjection.laneStates) || goalPathProjection.laneStates.length === 0) {
    return failClosed('LANE_STATES_REQUIRED');
  }

  const lanePresentations = [];
  const seenKeys = new Set();
  for (const lane of goalPathProjection.laneStates) {
    const normalized = normalizeLaneState(lane);
    if (!normalized) return failClosed('LANE_STATE_INVALID');
    if (seenKeys.has(normalized.key)) return failClosed('LANE_IDENTITY_DUPLICATE');
    seenKeys.add(normalized.key);
    lanePresentations.push(normalized);
  }

  const openGoalPathCount = lanePresentations.reduce(
    (count, lane) => count + (lane.connectedToGoal ? 1 : 0),
    0,
  );

  return deepFreeze({
    schema: SCHEMA,
    ok: true,
    reason: 'GOAL_PATH_PRESENTATION_PROJECTED',
    sourceReason: nonEmptyString(goalPathProjection.reason) ? goalPathProjection.reason.trim() : null,
    horizontalCellCount: goalPathProjection.horizontalCellCount,
    lanePresentations,
    openGoalPathCount,
    hasAnyOpenGoalPath: openGoalPathCount > 0,

    // WU30 exposes only the path-open visual state. It cannot terminate a match.
    terminalWin: false,
    requiresAuthoritativeGoalReachedForResult: true,
    presentationOnly: true,
    gameplayAuthority: false,
    gameStateWrite: false,
    movementAuthority: false,
    legalityAuthority: false,
    resultAuthority: false,
  });
}

export function isNewBaseGoalPathPresentation(value) {
  return Boolean(
    value
      && typeof value === 'object'
      && !Array.isArray(value)
      && value.schema === SCHEMA
      && typeof value.ok === 'boolean'
      && Array.isArray(value.lanePresentations)
      && value.terminalWin === false
      && value.presentationOnly === true
      && value.gameplayAuthority === false
      && value.gameStateWrite === false
      && value.movementAuthority === false
      && value.legalityAuthority === false
      && value.resultAuthority === false
  );
}

export const NEW_BASE_GOAL_PATH_PRESENTATION_CONTRACT = deepFreeze({
  schema: SCHEMA,
  connectionAuthority: 'CALLER_GOAL_PATH_PROJECTION',
  cardCountAuthority: 'EXISTING_NEW_BASE_GOAL_PATH_CORE',
  resultAuthority: 'EXISTING_AUTHORITATIVE_GOAL_REACHED_PATH',
  sevenStraightTerminalWin: false,
  sevenStraightEffect: 'CONNECT_PATH_TO_GOAL',
  computesStraightCompletion: false,
  computesMovementLegality: false,
  computesResult: false,
  writesGameState: false,
  ownsMotionChoreography: false,
});
