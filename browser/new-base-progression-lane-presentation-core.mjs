import { isNewBaseGoalPathPresentation } from './new-base-goal-path-presentation-core.mjs';

const SCHEMA = 'GAMEROAD_NEW_BASE_PROGRESSION_LANE_PRESENTATION_V1';
const STAGE_COUNT = 7;

export const NEW_BASE_PROGRESSION_STAGE_VISUAL_STATE = Object.freeze({
  BUILT: 'BUILT',
  LATENT: 'LATENT',
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

function safeStageCount(value) {
  return Number.isSafeInteger(value) && value >= 0 && value <= STAGE_COUNT;
}

function failClosed(reason) {
  return deepFreeze({
    schema: SCHEMA,
    ok: false,
    reason,
    stageCount: STAGE_COUNT,
    lanePresentations: [],
    totalBuiltStageCount: 0,
    totalLatentStageCount: 0,
    totalResolvedPhysicalCardIdentityCount: 0,
    presentationOnly: true,
    gameplayAuthority: false,
    gameStateWrite: false,
    movementAuthority: false,
    legalityAuthority: false,
    resultAuthority: false,
    terminalWin: false,
    futureStageLooksOpen: false,
    futureStageActionable: false,
    futureStageTraversable: false,
  });
}

function normalizeCardIds(lane) {
  if (lane.straightCardIds == null) return null;
  if (!Array.isArray(lane.straightCardIds) || lane.straightCardIds.length !== lane.straightCardCount) return undefined;
  const ids = lane.straightCardIds.map((value) => (nonEmptyString(value) ? value.trim() : null));
  return ids.some((value) => value === null) ? undefined : ids;
}

function normalizeLane(lane) {
  if (!lane || typeof lane !== 'object' || Array.isArray(lane)) return null;
  if (!nonEmptyString(lane.participantId)) return null;
  if (!Number.isSafeInteger(lane.laneIndex) || lane.laneIndex < 0 || lane.laneIndex > 2) return null;
  if (!safeStageCount(lane.straightCardCount)) return null;
  if (typeof lane.connectedToGoal !== 'boolean') return null;

  const physicalCardIds = normalizeCardIds(lane);
  if (physicalCardIds === undefined) return null;
  const participantId = lane.participantId.trim();
  const key = `${participantId}:${lane.laneIndex}`;
  const stages = Array.from({ length: STAGE_COUNT }, (_, offset) => {
    const stageIndex = offset + 1;
    const built = stageIndex <= lane.straightCardCount;
    const cardId = built && physicalCardIds ? physicalCardIds[offset] : null;
    return {
      roadStepId: `road:${key}:${stageIndex}`,
      stageIndex,
      cardId,
      physicalCardIdentityResolved: built ? nonEmptyString(cardId) : false,
      visualState: built
        ? NEW_BASE_PROGRESSION_STAGE_VISUAL_STATE.BUILT
        : NEW_BASE_PROGRESSION_STAGE_VISUAL_STATE.LATENT,
      established: built,
      latent: !built,
      visualCue: built ? 'ESTABLISHED_ACTUAL_CARD' : 'FUTURE_PROGRESS_NOT_OPEN',
      actionable: false,
      traversable: false,
      legalityAuthority: false,
      movementAuthority: false,
    };
  });

  return {
    key,
    participantId,
    laneIndex: lane.laneIndex,
    straightCardCount: lane.straightCardCount,
    straightCardIds: physicalCardIds,
    connectedToGoal: lane.connectedToGoal,
    routeGateId: lane.routeGateId ?? `goal-gate:${key}`,
    sharedGoalId: lane.sharedGoalId ?? 'goal:shared',
    builtStageCount: lane.straightCardCount,
    latentStageCount: STAGE_COUNT - lane.straightCardCount,
    resolvedPhysicalCardIdentityCount: physicalCardIds ? physicalCardIds.length : 0,
    stages,
    terminalWin: false,
  };
}

export function projectNewBaseProgressionLanePresentation(goalPathPresentation) {
  if (!isNewBaseGoalPathPresentation(goalPathPresentation)) return failClosed('GOAL_PATH_PRESENTATION_REQUIRED');
  if (goalPathPresentation.ok !== true) return failClosed('GOAL_PATH_PRESENTATION_NOT_OK');
  if (goalPathPresentation.terminalWin !== false) return failClosed('TERMINAL_WIN_FORBIDDEN');
  if (!Array.isArray(goalPathPresentation.lanePresentations) || goalPathPresentation.lanePresentations.length === 0) {
    return failClosed('LANE_PRESENTATIONS_REQUIRED');
  }

  const lanePresentations = [];
  const seenKeys = new Set();
  for (const lane of goalPathPresentation.lanePresentations) {
    const normalized = normalizeLane(lane);
    if (!normalized) return failClosed('LANE_PRESENTATION_INVALID');
    if (seenKeys.has(normalized.key)) return failClosed('LANE_IDENTITY_DUPLICATE');
    seenKeys.add(normalized.key);
    lanePresentations.push(normalized);
  }

  const totalBuiltStageCount = lanePresentations.reduce((total, lane) => total + lane.builtStageCount, 0);
  const totalLatentStageCount = lanePresentations.reduce((total, lane) => total + lane.latentStageCount, 0);
  const totalResolvedPhysicalCardIdentityCount = lanePresentations.reduce(
    (total, lane) => total + lane.resolvedPhysicalCardIdentityCount,
    0,
  );

  return deepFreeze({
    schema: SCHEMA,
    ok: true,
    reason: 'PROGRESSION_LANE_PRESENTATION_PROJECTED',
    sourceSchema: goalPathPresentation.schema,
    sharedGoalId: goalPathPresentation.sharedGoalId ?? 'goal:shared',
    stageCount: STAGE_COUNT,
    lanePresentations,
    totalBuiltStageCount,
    totalLatentStageCount,
    totalResolvedPhysicalCardIdentityCount,
    presentationOnly: true,
    gameplayAuthority: false,
    gameStateWrite: false,
    movementAuthority: false,
    legalityAuthority: false,
    resultAuthority: false,
    terminalWin: false,
    futureStageLooksOpen: false,
    futureStageActionable: false,
    futureStageTraversable: false,
  });
}

export function isNewBaseProgressionLanePresentation(value) {
  return Boolean(
    value
      && typeof value === 'object'
      && !Array.isArray(value)
      && value.schema === SCHEMA
      && typeof value.ok === 'boolean'
      && value.stageCount === STAGE_COUNT
      && Array.isArray(value.lanePresentations)
      && value.presentationOnly === true
      && value.gameplayAuthority === false
      && value.gameStateWrite === false
      && value.movementAuthority === false
      && value.legalityAuthority === false
      && value.resultAuthority === false
      && value.terminalWin === false
      && value.futureStageLooksOpen === false
      && value.futureStageActionable === false
      && value.futureStageTraversable === false
  );
}

export const NEW_BASE_PROGRESSION_LANE_PRESENTATION_CONTRACT = deepFreeze({
  schema: SCHEMA,
  source: 'EXISTING_NEW_BASE_GOAL_PATH_PRESENTATION',
  straightCardCountAuthority: 'CALLER_VIA_EXISTING_GOAL_PATH_PRESENTATION',
  connectedToGoalAuthority: 'CALLER_VIA_EXISTING_GOAL_PATH_PRESENTATION',
  stageIdentitySource: 'EXISTING_FLANORA_ROAD_STEP_PLUS_CALLER_PHYSICAL_CARD_ID',
  physicalCardIdentityAuthority: 'CALLER_STRAIGHT_CARD_IDS_ONLY',
  stageCount: STAGE_COUNT,
  builtStageMeaning: 'ESTABLISHED_ACTUAL_CARD_ONLY',
  latentStageMeaning: 'FUTURE_PROGRESS_NOT_OPEN',
  futureStageLooksOpen: false,
  futureStageActionable: false,
  futureStageTraversable: false,
  computesStraightCompletion: false,
  computesGoalPathConnection: false,
  computesMovementLegality: false,
  computesResult: false,
  writesGameState: false,
  secondBoardEngine: false,
});
