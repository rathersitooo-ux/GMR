const SCHEMA = 'GAMEROAD_NEW_BASE_GOAL_PATH_PRESENTATION_V1';
const STRAIGHT_CARD_TARGET = 7;

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

function normalizeCardIds(value) {
  if (!Array.isArray(value) || value.length > STRAIGHT_CARD_TARGET) return null;
  const cardIds = value.map((item) => (nonEmptyString(item) ? item.trim() : null));
  if (cardIds.some((item) => item === null)) return null;
  return cardIds;
}

function failClosed(reason) {
  return deepFreeze({
    schema: SCHEMA,
    ok: false,
    reason,
    sharedGoalId: null,
    sharedGoalCount: 0,
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

function normalizeLaneState(lane, sharedGoalId) {
  if (!lane || typeof lane !== 'object' || Array.isArray(lane)) return null;
  if (!nonEmptyString(lane.participantId)) return null;
  if (!safeNonNegativeInteger(lane.laneIndex)) return null;
  if (!safeNonNegativeInteger(lane.columnIndex)) return null;
  if (!safeNonNegativeInteger(lane.goalEntryColumnIndex)) return null;
  if (lane.goalEntryColumnIndex !== lane.columnIndex) return null;
  if (lane.sharedGoalId !== sharedGoalId) return null;
  const straightCardIds = normalizeCardIds(lane.straightCardIds);
  if (!straightCardIds) return null;
  if (!safeNonNegativeInteger(lane.straightCardCount) || lane.straightCardCount !== straightCardIds.length) return null;
  if (typeof lane.connectedToGoal !== 'boolean') return null;
  if (lane.connectedToGoal !== (straightCardIds.length === STRAIGHT_CARD_TARGET)) return null;

  const participantId = lane.participantId.trim();
  const visualState = lane.connectedToGoal
    ? NEW_BASE_GOAL_PATH_VISUAL_STATE.OPEN
    : NEW_BASE_GOAL_PATH_VISUAL_STATE.CLOSED;

  return {
    key: `${participantId}:${lane.laneIndex}`,
    participantId,
    laneIndex: lane.laneIndex,
    columnIndex: lane.columnIndex,
    goalEntryColumnIndex: lane.goalEntryColumnIndex,
    goalRowColumnIndex: lane.goalEntryColumnIndex,
    sharedGoalId,
    straightCardIds,
    straightCardCount: straightCardIds.length,
    connectedToGoal: lane.connectedToGoal,
    visualState,
    gateVisualState: visualState,
    roadConnectionCue: lane.connectedToGoal ? 'GOAL_LINK_ACTIVE' : 'GOAL_LINK_FAINT',
    goalConnectionCue: lane.connectedToGoal ? 'CONNECTED' : 'FAINT_GUIDE_ONLY',
    emphasizeRoadToGoal: lane.connectedToGoal,
    emphasizeGoal: lane.connectedToGoal,
    terminalWin: false,
  };
}

/**
 * Presentation-only projection of the authoritative seven-card path state.
 * One shared GOAL is exposed to the world. Each lane retains its own entry
 * port and exact placed physical card ids. Seven cards only open the route;
 * terminal victory still belongs to the existing GOAL_REACHED authority.
 */
export function projectNewBaseGoalPathPresentation(goalPathProjection) {
  if (!goalPathProjection || typeof goalPathProjection !== 'object' || Array.isArray(goalPathProjection)) {
    return failClosed('GOAL_PATH_PROJECTION_REQUIRED');
  }
  if (goalPathProjection.ok !== true) return failClosed('GOAL_PATH_PROJECTION_NOT_OK');
  if (goalPathProjection.terminalWin !== false) return failClosed('SEVEN_STRAIGHT_TERMINAL_WIN_FORBIDDEN');
  if (!safeNonNegativeInteger(goalPathProjection.horizontalCellCount)) return failClosed('HORIZONTAL_CELL_COUNT_INVALID');
  if (!nonEmptyString(goalPathProjection.sharedGoalId) || goalPathProjection.sharedGoalCount !== 1) {
    return failClosed('ONE_SHARED_GOAL_REQUIRED');
  }
  if (!Array.isArray(goalPathProjection.laneStates) || goalPathProjection.laneStates.length === 0) {
    return failClosed('LANE_STATES_REQUIRED');
  }

  const sharedGoalId = goalPathProjection.sharedGoalId.trim();
  const lanePresentations = [];
  const seenKeys = new Set();
  for (const lane of goalPathProjection.laneStates) {
    const normalized = normalizeLaneState(lane, sharedGoalId);
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
    sharedGoalId,
    sharedGoalCount: 1,
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
  cardIdentityAuthority: 'EXISTING_NEW_BASE_GOAL_PATH_CORE_STRAIGHT_CARD_IDS',
  sharedGoalCount: 1,
  routeEntryCount: 12,
  resultAuthority: 'EXISTING_AUTHORITATIVE_GOAL_REACHED_PATH',
  sevenStraightTerminalWin: false,
  sevenStraightEffect: 'OPEN_ROUTE_TO_SHARED_GOAL',
  closedRouteGuide: 'FAINT_ONLY',
  computesStraightCompletion: false,
  computesMovementLegality: false,
  computesResult: false,
  writesGameState: false,
  ownsMotionChoreography: false,
});
