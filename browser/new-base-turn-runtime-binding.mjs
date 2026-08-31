import { rollAuthoritativeNewBaseDice } from './new-base-authoritative-dice-core.mjs';
import { readNewBaseManaRecoveryConfig } from './new-base-mana-recovery-config.mjs';
import { composeTurnMovementBudget } from './new-base-movement-budget-core.mjs';
import { runNewBaseTurn } from './new-base-turn-orchestrator-core.mjs';
import { applyNewBaseTurnStartManaRecovery } from './new-base-turn-start-mana-recovery-core.mjs';
import { autoAssignHand3ToFixedJankenSlots } from './newbase-janken-hand-assignment-core.mjs';

export const NEW_BASE_TURN_RUNTIME_BINDING_SCHEMA = 'gameroad.new-base-turn-runtime-binding.v1';

export const NEW_BASE_TURN_RUNTIME_AUTHORITY_NAMES = Object.freeze([
  'recoverMana',
  'readAuthoritativeDiceRequest',
  'nextDiceInteger',
  'obtainHand3',
  'readFixedJankenSlotState',
  'proposeFixedJankenAssignment',
  'selectFixedSlotCard',
  'resolveSharedJanken',
  'resolveBattle',
  'deriveBaseMovementBudget',
  'reserveMovement',
  'revalidateAndResolveMovement',
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

/**
 * Bind the composition-only new-base turn orchestrator to current runtime
 * authorities without creating a second Battle, ROAD, janken, mana, movement,
 * GOAL, result, or entropy implementation.
 *
 * Only seams whose current cores already own formal validation/composition are
 * handled here: turn-start mana config/use, authoritative dice identity/range,
 * hand3 -> fixed janken slot assignment, and movement-budget addition. Every
 * other gameplay decision remains delegated to the caller's existing authority.
 */
export function createNewBaseTurnRuntimeProviders({
  runtimeAuthorities,
  manaRecoveryConfigSource,
} = {}) {
  const authority = requireRuntimeAuthorities(runtimeAuthorities);
  const manaRecoveryConfig = readNewBaseManaRecoveryConfig(manaRecoveryConfigSource);

  return Object.freeze({
    recoverTurnStartMana(input) {
      return applyNewBaseTurnStartManaRecovery({
        manaRecoveryConfig,
        recoverMana: (amount) => authority.recoverMana(amount, input),
      });
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

    obtainHand3(input) {
      return authority.obtainHand3(input);
    },

    autoAssignFixedJankenSlots(input) {
      const fixedSlotState = authority.readFixedJankenSlotState(input);
      return autoAssignHand3ToFixedJankenSlots({
        hand: input.outputs.hand3,
        fixedSlotState,
        assignmentPolicy: (policyInput) => authority.proposeFixedJankenAssignment(policyInput, input),
      });
    },

    selectFixedSlotCard(input) {
      return authority.selectFixedSlotCard(input);
    },

    resolveSharedJanken(input) {
      return authority.resolveSharedJanken(input);
    },

    resolveBattle(input) {
      return authority.resolveBattle(input);
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
  manaRecoveryConfigSource,
} = {}) {
  const providers = createNewBaseTurnRuntimeProviders({
    runtimeAuthorities,
    manaRecoveryConfigSource,
  });
  return runNewBaseTurn({ turnContext, providers });
}
