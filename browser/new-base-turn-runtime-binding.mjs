import { rollAuthoritativeNewBaseDice } from './new-base-authoritative-dice-core.mjs';
import { composeTurnMovementBudget } from './new-base-movement-budget-core.mjs';
import { runNewBaseTurn } from './new-base-turn-orchestrator-core.mjs';
import { resolveCyclicTriadByProcessingOrder } from './triad-resolver-core.mjs';

export const NEW_BASE_TURN_RUNTIME_BINDING_SCHEMA = 'gameroad.new-base-turn-runtime-binding.v2';

export const NEW_BASE_TURN_RUNTIME_AUTHORITY_NAMES = Object.freeze([
  'requireRoundStateReady',
  'readAuthoritativeDiceRequest',
  'nextDiceInteger',
  'deriveBaseMovementBudget',
  'reserveMovement',
  'revalidateAndResolveMovement',
  'resolveLandingInteraction',
  'registerJankenFromFirstValidCard',
  'addBattleCardsWithinResources',
  'readOrderedJankenSelections',
  'readJankenResolverConfig',
  'resolveBattleInteraction',
  'progressRoad',
  'evaluateGoal',
  'finalizeResultOrNextTurn',
]);

function requireRuntimeAuthorities(runtimeAuthorities) {
  if (runtimeAuthorities == null || typeof runtimeAuthorities !== 'object' || Array.isArray(runtimeAuthorities)) {
    throw new TypeError('runtimeAuthorities must be an object');
  }

  for (const name of NEW_BASE_TURN_RUNTIME_AUTHORITY_NAMES) {
    if (typeof runtimeAuthorities[name] !== 'function') {
      throw new TypeError(`runtimeAuthorities.${name} must be a function`);
    }
  }
  return runtimeAuthorities;
}

function requireObject(value, label) {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object supplied by the runtime authority`);
  }
  return value;
}

function requireArray(value, label) {
  if (!Array.isArray(value)) {
    throw new TypeError(`${label} must be an array supplied by the runtime authority`);
  }
  return value;
}

/**
 * Binds the current composition-only new-base turn orchestrator to existing
 * runtime authorities without creating a second Battle, ROAD, janken,
 * movement, GOAL, result, resource, or entropy implementation.
 *
 * Round-start resource mutation is not performed here. The existing runtime
 * authority must prove that the round state is ready before a turn begins.
 * The binding owns only seams whose existing neutral cores already own formal
 * composition: authoritative dice, movement-budget addition, and the shared
 * ordered cyclic-triad resolver. Card eligibility/first-play registration,
 * additional Battle cards, landing/territory semantics and all destinations
 * remain delegated to current runtime authority.
 */
export function createNewBaseTurnRuntimeProviders({ runtimeAuthorities } = {}) {
  const authority = requireRuntimeAuthorities(runtimeAuthorities);

  return Object.freeze({
    requireRoundStateReady(input) {
      return requireObject(authority.requireRoundStateReady(input), 'round state');
    },

    rollAuthoritativeDice(input) {
      const request = requireObject(
        authority.readAuthoritativeDiceRequest(input),
        'authoritative dice request',
      );
      return rollAuthoritativeNewBaseDice({
        ...request,
        nextInteger: (rangeRequest) => authority.nextDiceInteger(rangeRequest, input),
      });
    },

    deriveBaseMovementBudget(input) {
      return authority.deriveBaseMovementBudget(input);
    },

    composeMovementBudget(input) {
      const movementBudget = composeTurnMovementBudget({
        baseMovementBudget: input.outputs.baseMovementBudget,
        diceMovementDelta: input.outputs.dice?.diceDelta,
      });
      if (movementBudget === null) {
        throw new TypeError('runtime authorities must supply valid upstream movement values');
      }
      return movementBudget;
    },

    reserveMovement(input) {
      return authority.reserveMovement(input);
    },

    revalidateAndResolveMovement(input) {
      return authority.revalidateAndResolveMovement(input);
    },

    resolveLandingInteraction(input) {
      return authority.resolveLandingInteraction(input);
    },

    registerJankenFromFirstValidCard(input) {
      return authority.registerJankenFromFirstValidCard(input);
    },

    addBattleCardsWithinResources(input) {
      return authority.addBattleCardsWithinResources(input);
    },

    resolveOrderedJanken(input) {
      const orderedSelections = requireArray(
        authority.readOrderedJankenSelections(input),
        'ordered janken selections',
      );
      const config = requireObject(
        authority.readJankenResolverConfig(input),
        'janken resolver config',
      );
      return resolveCyclicTriadByProcessingOrder(orderedSelections, config);
    },

    resolveBattleInteraction(input) {
      return authority.resolveBattleInteraction(input);
    },

    progressRoad(input) {
      return authority.progressRoad(input);
    },

    evaluateGoal(input) {
      return authority.evaluateGoal(input);
    },

    finalizeResultOrNextTurn(input) {
      return authority.finalizeResultOrNextTurn(input);
    },
  });
}

export function runNewBaseTurnWithRuntime({
  turnContext,
  runtimeAuthorities,
} = {}) {
  const providers = createNewBaseTurnRuntimeProviders({ runtimeAuthorities });
  return runNewBaseTurn({ turnContext, providers });
}
