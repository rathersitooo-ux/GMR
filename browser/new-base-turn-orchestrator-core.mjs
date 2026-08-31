export const NEW_BASE_TURN_ORCHESTRATOR_SCHEMA = 'gameroad.new-base-turn-orchestrator.v1';

export const NEW_BASE_TURN_STAGE = Object.freeze({
  TURN_START_MANA_RECOVERY: 'TURN_START_MANA_RECOVERY',
  AUTHORITATIVE_DICE: 'AUTHORITATIVE_DICE',
  HAND3: 'HAND3',
  AUTO_ASSIGN_FIXED_JANKEN_SLOTS: 'AUTO_ASSIGN_FIXED_JANKEN_SLOTS',
  SELECT_FIXED_SLOT_CARD: 'SELECT_FIXED_SLOT_CARD',
  SHARED_JANKEN: 'SHARED_JANKEN',
  BATTLE: 'BATTLE',
  BASE_MOVEMENT_BUDGET: 'BASE_MOVEMENT_BUDGET',
  COMPOSE_MOVEMENT_BUDGET: 'COMPOSE_MOVEMENT_BUDGET',
  MOVEMENT_RESERVATION: 'MOVEMENT_RESERVATION',
  MOVEMENT_REVALIDATION_RESOLUTION: 'MOVEMENT_REVALIDATION_RESOLUTION',
  ROAD_PROGRESSION: 'ROAD_PROGRESSION',
  GOAL_EVALUATION: 'GOAL_EVALUATION',
  RESULT_OR_NEXT_TURN: 'RESULT_OR_NEXT_TURN',
});

const STAGE_PLAN = Object.freeze([
  Object.freeze([NEW_BASE_TURN_STAGE.TURN_START_MANA_RECOVERY, 'recoverTurnStartMana', 'manaRecovery']),
  Object.freeze([NEW_BASE_TURN_STAGE.AUTHORITATIVE_DICE, 'rollAuthoritativeDice', 'dice']),
  Object.freeze([NEW_BASE_TURN_STAGE.HAND3, 'obtainHand3', 'hand3']),
  Object.freeze([NEW_BASE_TURN_STAGE.AUTO_ASSIGN_FIXED_JANKEN_SLOTS, 'autoAssignFixedJankenSlots', 'fixedJankenSlots']),
  Object.freeze([NEW_BASE_TURN_STAGE.SELECT_FIXED_SLOT_CARD, 'selectFixedSlotCard', 'selection']),
  Object.freeze([NEW_BASE_TURN_STAGE.SHARED_JANKEN, 'resolveSharedJanken', 'janken']),
  Object.freeze([NEW_BASE_TURN_STAGE.BATTLE, 'resolveBattle', 'battle']),
  Object.freeze([NEW_BASE_TURN_STAGE.BASE_MOVEMENT_BUDGET, 'deriveBaseMovementBudget', 'baseMovementBudget']),
  Object.freeze([NEW_BASE_TURN_STAGE.COMPOSE_MOVEMENT_BUDGET, 'composeMovementBudget', 'movementBudget']),
  Object.freeze([NEW_BASE_TURN_STAGE.MOVEMENT_RESERVATION, 'reserveMovement', 'movementReservation']),
  Object.freeze([NEW_BASE_TURN_STAGE.MOVEMENT_REVALIDATION_RESOLUTION, 'revalidateAndResolveMovement', 'movementResolution']),
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
 * Runs one new-base turn as a thin composition seam.
 *
 * This module owns only provider ordering and fail-closed stage boundaries. It
 * deliberately does not calculate mana recovery, roll/interpret dice, assign
 * janken policy, resolve triad winners or Battle, add movement values, validate
 * paths, progress ROAD, open GOAL routes, or decide match victory. Those remain
 * with the injected current/shared authorities.
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
