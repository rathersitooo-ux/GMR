const SCHEMA = 'GAMEROAD_NEW_BASE_GOAL_PATH_PRESENTATION_V1';
const SHARED_GOAL_ID = 'goal:shared';

export const NEW_BASE_GOAL_PATH_VISUAL_STATE = Object.freeze({
  CLOSED: 'CLOSED',
  OPEN: 'OPEN',
});

export const NEW_BASE_GOAL_GATE_VISUAL_STATE = Object.freeze({
  LOCKED_BARRIER: 'LOCKED_BARRIER',
  OPEN_HOOP: 'OPEN_HOOP',
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

function normalizeStraightCardIds(lane) {
  if (lane.straightCardIds === undefined) return null;
  if (!Array.isArray(lane.straightCardIds) || lane.straightCardIds.length !== lane.straightCardCount) return undefined;
  const ids = lane.straightCardIds.map((value) => (nonEmptyString(value) ? value.trim() : null));
  return ids.some((value) => value === null) ? undefined : ids;
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

  const straightCardIds = normalizeStraightCardIds(lane);
  if (straightCardIds === undefined) return null;
  const participantId = lane.participantId.trim();
  const key = `${participantId}:${lane.laneIndex}`;
  const routeGateId = nonEmptyString(lane.routeGateId) ? lane.routeGateId.trim() : `goal-gate:${key}`;
  const sharedGoalId = nonEmptyString(lane.sharedGoalId) ? lane.sharedGoalId.trim() : SHARED_GOAL_ID;
  const visualState = lane.connectedToGoal
    ? NEW_BASE_GOAL_PATH_VISUAL_STATE.OPEN
    : NEW_BASE_GOAL_PATH_VISUAL_STATE.CLOSED;
  const gateVisualState = lane.connectedToGoal
    ? NEW_BASE_GOAL_GATE_VISUAL_STATE.OPEN_HOOP
    : NEW_BASE_GOAL_GATE_VISUAL_STATE.LOCKED_BARRIER;

  return {
    key,
    participantId,
    laneIndex: lane.laneIndex,
    columnIndex: lane.columnIndex,
    goalRowColumnIndex: lane.goalRowColumnIndex,
    straightCardCount: lane.straightCardCount,
    straightCardIds,
    physicalCardIdentityResolved: straightCardIds !== null,
    connectedToGoal: lane.connectedToGoal,
    routeGateId,
    sharedGoalId,
    visualState,
    gateVisualState,
    roadConnectionCue: lane.connectedToGoal ? 'SHARED_GOAL_LINK_ACTIVE' : 'SHARED_GOAL_LINK_GUIDE',
    goalConnectionCue: lane.connectedToGoal ? 'CONNECTED_TO_SHARED_GOAL' : 'LOCKED_BEFORE_SHARED_GOAL',
    emphasizeRoadToGoal: lane.connectedToGoal,
    emphasizeGoal: lane.connectedToGoal,
    terminalWin: false,
  };
}

export function projectNewBaseGoalPathPresentation(goalPathProjection) {
  if (!goalPathProjection || typeof goalPathProjection !== 'object' || Array.isArray(goalPathProjection)) {
    return failClosed('GOAL_PATH_PROJECTION_REQUIRED');
  }
  if (goalPathProjection.ok !== true) return failClosed('GOAL_PATH_PROJECTION_NOT_OK');
  if (goalPathProjection.terminalWin !== false) return failClosed('SEVEN_STRAIGHT_TERMINAL_WIN_FORBIDDEN');
  if (!safeNonNegativeInteger(goalPathProjection.horizontalCellCount)) return failClosed('HORIZONTAL_CELL_COUNT_INVALID');
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
  const sharedGoalIds = new Set(lanePresentations.map((lane) => lane.sharedGoalId));
  if (sharedGoalIds.size !== 1) return failClosed('SHARED_GOAL_IDENTITY_MISMATCH');
  const sharedGoalId = [...sharedGoalIds][0];

  return deepFreeze({
    schema: SCHEMA,
    ok: true,
    reason: 'GOAL_PATH_PRESENTATION_PROJECTED',
    sourceReason: nonEmptyString(goalPathProjection.reason) ? goalPathProjection.reason.trim() : null,
    horizontalCellCount: goalPathProjection.horizontalCellCount,
    sharedGoalId,
    sharedGoalCount: 1,
    routeGateCount: lanePresentations.length,
    sharedGoalVisualRole: 'ONE_TOP_CENTER_WORLD_GOAL',
    lanePresentations,
    openGoalPathCount,
    hasAnyOpenGoalPath: openGoalPathCount > 0,
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
  physicalCardIdentityAuthority: 'CALLER_STRAIGHT_CARD_IDS_VIA_EXISTING_GOAL_PATH_CORE',
  resultAuthority: 'EXISTING_AUTHORITATIVE_GOAL_REACHED_PATH',
  sharedGoalCount: 1,
  routeGateCount: 12,
  closedGateVisual: 'LOCKED_BARRIER',
  openGateVisual: 'OPEN_HOOP',
  sevenStraightTerminalWin: false,
  sevenStraightEffect: 'CONNECT_PATH_TO_GOAL',
  computesStraightCompletion: false,
  computesMovementLegality: false,
  computesResult: false,
  writesGameState: false,
  ownsMotionChoreography: false,
});
