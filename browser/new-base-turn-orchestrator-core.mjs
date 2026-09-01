export const NEW_BASE_TURN_ORCHESTRATOR_SCHEMA = 'gameroad.new-base-turn-orchestrator.v2';

export const NEW_BASE_TURN_STAGE = Object.freeze({
  ROUND_STATE_READY: 'ROUND_STATE_READY',
  AUTHORITATIVE_DICE: 'AUTHORITATIVE_DICE',
  BASE_MOVEMENT_BUDGET: 'BASE_MOVEMENT_BUDGET',
  COMPOSE_MOVEMENT_BUDGET: 'COMPOSE_MOVEMENT_BUDGET',
  MOVEMENT_RESERVATION: 'MOVEMENT_RESERVATION',
  MOVEMENT_REVALIDATION_RESOLUTION: 'MOVEMENT_REVALIDATION_RESOLUTION',
  LANDING_INTERACTION: 'LANDING_INTERACTION',
  JANKEN_REGISTRATION: 'JANKEN_REGISTRATION',
  BATTLE_CARD_ADDITIONS: 'BATTLE_CARD_ADDITIONS',
  ORDERED_JANKEN_RESOLUTION: 'ORDERED_JANKEN_RESOLUTION',
  BATTLE_INTERACTION_RESOLUTION: 'BATTLE_INTERACTION_RESOLUTION',
  ROAD_PROGRESSION: 'ROAD_PROGRESSION',
  GOAL_EVALUATION: 'GOAL_EVALUATION',
  RESULT_OR_NEXT_TURN: 'RESULT_OR_NEXT_TURN',
});

const STAGE_PLAN = Object.freeze([
  Object.freeze([NEW_BASE_TURN_STAGE.ROUND_STATE_READY, 'requireRoundStateReady', 'roundState']),
  Object.freeze([NEW_BASE_TURN_STAGE.AUTHORITATIVE_DICE, 'rollAuthoritativeDice', 'dice']),
  Object.freeze([NEW_BASE_TURN_STAGE.BASE_MOVEMENT_BUDGET, 'deriveBaseMovementBudget', 'baseMovementBudget']),
  Object.freeze([NEW_BASE_TURN_STAGE.COMPOSE_MOVEMENT_BUDGET, 'composeMovementBudget', 'movementBudget']),
  Object.freeze([NEW_BASE_TURN_STAGE.MOVEMENT_RESERVATION, 'reserveMovement', 'movementReservation']),
  Object.freeze([NEW_BASE_TURN_STAGE.MOVEMENT_REVALIDATION_RESOLUTION, 'revalidateAndResolveMovement', 'movementResolution']),
  Object.freeze([NEW_BASE_TURN_STAGE.LANDING_INTERACTION, 'resolveLandingInteraction', 'landingInteraction']),
  Object.freeze([NEW_BASE_TURN_STAGE.JANKEN_REGISTRATION, 'registerJankenFromFirstValidCard', 'jankenRegistration']),
  Object.freeze([NEW_BASE_TURN_STAGE.BATTLE_CARD_ADDITIONS, 'addBattleCardsWithinResources', 'battleCardAdditions']),
  Object.freeze([NEW_BASE_TURN_STAGE.ORDERED_JANKEN_RESOLUTION, 'resolveOrderedJanken', 'orderedJanken']),
  Object.freeze([NEW_BASE_TURN_STAGE.BATTLE_INTERACTION_RESOLUTION, 'resolveBattleInteraction', 'battleInteraction']),
  Object.freeze([NEW_BASE_TURN_STAGE.ROAD_PROGRESSION, 'progressRoad', 'roadProgression']),
  Object.freeze([NEW_BASE_TURN_STAGE.GOAL_EVALUATION, 'evaluateGoal', 'goalEvaluation']),
  Object.freeze([NEW_BASE_TURN_STAGE.RESULT_OR_NEXT_TURN, 'finalizeResultOrNextTurn', 'completion']),
]);

export const NEW_BASE_TURN_PROVIDER_NAMES = Object.freeze(
  STAGE_PLAN.map(([, providerName]) => providerName),
);

export class NewBaseTurnOrchestratorError extends Error {
  constructor(stage, cause) {
    super(`new-base turn stage failed: ${stage}`);
    this.name = 'NewBaseTurnOrchestratorError';
    this.stage = stage;
    this.cause = cause;
  }
}

function requireProviders(providers) {
  if (providers == null || typeof providers !== 'object' || Array.isArray(providers)) {
    throw new TypeError('providers must be an object containing every new-base turn provider');
  }

  const bound = Object.create(null);
  for (const providerName of NEW_BASE_TURN_PROVIDER_NAMES) {
    if (typeof providers[providerName] !== 'function') {
      throw new TypeError(`providers.${providerName} must be a function`);
    }
    bound[providerName] = providers[providerName];
  }
  return Object.freeze(bound);
}

function providerInput(turnContext, outputs, completedStages) {
  return Object.freeze({
    schema: NEW_BASE_TURN_ORCHESTRATOR_SCHEMA,
    turnContext,
    outputs: Object.freeze({ ...outputs }),
    completedStages: Object.freeze([...completedStages]),
  });
}

/**
 * Runs one current new-base turn as a thin composition seam.
 *
 * This module owns provider ordering and fail-closed stage boundaries only.
 * Round-start resource mutation is intentionally outside this per-turn seam;
 * the caller must first prove the current round state is ready. Movement is
 * resolved before landing/Battle interaction. Janken registration comes from
 * the first valid played card through the injected authority, then additional
 * Battle cards may be added before the existing ordered resolver is consumed.
 *
 * This seam deliberately does not invent a fixed hand count, fixed R/S/P
 * slots, card-destination policy for invalidated janken cards, tie policy,
 * hidden-finisher semantics, territory payment rules, ROAD thresholds, GOAL
 * opening, or match victory. Those remain with current/shared authorities.
 */
export async function runNewBaseTurn({ turnContext, providers } = {}) {
  const boundProviders = requireProviders(providers);
  const outputs = Object.create(null);
  const completedStages = [];

  for (const [stage, providerName, outputKey] of STAGE_PLAN) {
    let output;
    try {
      output = await boundProviders[providerName](
        providerInput(turnContext, outputs, completedStages),
      );
    } catch (cause) {
      throw new NewBaseTurnOrchestratorError(stage, cause);
    }
    outputs[outputKey] = output;
    completedStages.push(stage);
  }

  return Object.freeze({
    schema: NEW_BASE_TURN_ORCHESTRATOR_SCHEMA,
    turnContext,
    completedStages: Object.freeze([...completedStages]),
    outputs: Object.freeze({ ...outputs }),
  });
}
