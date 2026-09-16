import { isNewBaseGoalPathPresentation } from './new-base-goal-path-presentation-core.mjs';

const SCHEMA = 'GAMEROAD_NEW_BASE_PROGRESSION_LANE_PRESENTATION_V1';
const STAGE_COUNT = 7;

export const NEW_BASE_PROGRESSION_STAGE_VISUAL_STATE = Object.freeze({
  BUILT: 'BUILT',
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

function failClosed(reason) {
  return deepFreeze({
    schema: SCHEMA,
    ok: false,
    reason,
    stageCount: STAGE_COUNT,
    lanePresentations: [],
    totalBuiltStageCount: 0,
    totalLatentStageCount: 0,
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
    futureStageNodeCount: 0,
  });
}

function normalizeLane(lane) {
  if (!lane || typeof lane !== 'object' || Array.isArray(lane)) return null;
  if (!nonEmptyString(lane.participantId)) return null;
  if (!Number.isSafeInteger(lane.laneIndex) || lane.laneIndex < 0 || lane.laneIndex > 2) return null;
  if (!nonEmptyString(lane.sharedGoalId)) return null;
  if (!Array.isArray(lane.straightCardIds) || lane.straightCardIds.length > STAGE_COUNT) return null;
  const cardIds = lane.straightCardIds.map((value) => (nonEmptyString(value) ? value.trim() : null));
  if (cardIds.some((value) => value === null)) return null;
  if (lane.straightCardCount !== cardIds.length) return null;
  if (typeof lane.connectedToGoal !== 'boolean' || lane.connectedToGoal !== (cardIds.length === STAGE_COUNT)) return null;

  const participantId = lane.participantId.trim();
  const key = `${participantId}:${lane.laneIndex}`;
  const placedCards = cardIds.map((cardId, offset) => {
    const stageIndex = offset + 1;
    return {
      roadStepId: `road:${key}:${stageIndex}`,
      stageIndex,
      cardId,
      visualState: NEW_BASE_PROGRESSION_STAGE_VISUAL_STATE.BUILT,
      established: true,
      latent: false,
      visualCue: 'PLACED_PHYSICAL_CARD',
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
    sharedGoalId: lane.sharedGoalId.trim(),
    straightCardCount: cardIds.length,
    straightCardIds: cardIds,
    connectedToGoal: lane.connectedToGoal,
    builtStageCount: cardIds.length,
    latentStageCount: STAGE_COUNT - cardIds.length,
    placedCards,
    // Compatibility alias. It contains placed cards only; no future placeholder stages.
    stages: placedCards,
    futureStageNodeCount: 0,
    terminalWin: false,
  };
}

/**
 * Projects only cards that physically exist in the caller-authoritative route.
 * Missing future positions remain absent from the DOM and from this list.
 */
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

  return deepFreeze({
    schema: SCHEMA,
    ok: true,
    reason: 'PROGRESSION_LANE_PRESENTATION_PROJECTED',
    sourceSchema: goalPathPresentation.schema,
    sharedGoalId: goalPathPresentation.sharedGoalId ?? null,
    stageCount: STAGE_COUNT,
    lanePresentations,
    totalBuiltStageCount,
    totalLatentStageCount,
    futureStageNodeCount: 0,
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
  cardIdentityAuthority: 'CALLER_VIA_STRAIGHT_CARD_IDS',
  connectedToGoalAuthority: 'CALLER_VIA_EXISTING_GOAL_PATH_PRESENTATION',
  stageCount: STAGE_COUNT,
  placedCardMeaning: 'EXACT_EXISTING_PHYSICAL_CARD_ID',
  futureStageNodeCount: 0,
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
