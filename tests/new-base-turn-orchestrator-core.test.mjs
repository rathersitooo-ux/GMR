import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NEW_BASE_TURN_ORCHESTRATOR_SCHEMA,
  NEW_BASE_TURN_PROVIDER_NAMES,
  NEW_BASE_TURN_STAGE,
  NewBaseTurnOrchestratorError,
  runNewBaseTurn,
} from '../browser/new-base-turn-orchestrator-core.mjs';

const EXPECTED_STAGES = [
  NEW_BASE_TURN_STAGE.ROUND_STATE_READY,
  NEW_BASE_TURN_STAGE.AUTHORITATIVE_DICE,
  NEW_BASE_TURN_STAGE.BASE_MOVEMENT_BUDGET,
  NEW_BASE_TURN_STAGE.COMPOSE_MOVEMENT_BUDGET,
  NEW_BASE_TURN_STAGE.MOVEMENT_RESERVATION,
  NEW_BASE_TURN_STAGE.MOVEMENT_REVALIDATION_RESOLUTION,
  NEW_BASE_TURN_STAGE.LANDING_INTERACTION,
  NEW_BASE_TURN_STAGE.JANKEN_REGISTRATION,
  NEW_BASE_TURN_STAGE.BATTLE_CARD_ADDITIONS,
  NEW_BASE_TURN_STAGE.ORDERED_JANKEN_RESOLUTION,
  NEW_BASE_TURN_STAGE.BATTLE_INTERACTION_RESOLUTION,
  NEW_BASE_TURN_STAGE.ROAD_PROGRESSION,
  NEW_BASE_TURN_STAGE.GOAL_EVALUATION,
  NEW_BASE_TURN_STAGE.RESULT_OR_NEXT_TURN,
];

function providerFixture(overrides = {}) {
  const providers = Object.create(null);
  for (const providerName of NEW_BASE_TURN_PROVIDER_NAMES) {
    providers[providerName] = ({ outputs }) => ({ providerName, seen: Object.keys(outputs) });
  }
  return Object.assign(providers, overrides);
}

test('runs exactly one current shared-provider turn in fixed orchestration order', async () => {
  const calls = [];
  const providers = providerFixture();
  for (const providerName of NEW_BASE_TURN_PROVIDER_NAMES) {
    providers[providerName] = ({ completedStages }) => {
      calls.push(providerName);
      return `${providerName}:${completedStages.length}`;
    };
  }

  const turnContext = Object.freeze({ matchId: 'm1', turnId: 't9' });
  const result = await runNewBaseTurn({ turnContext, providers });

  assert.equal(result.schema, NEW_BASE_TURN_ORCHESTRATOR_SCHEMA);
  assert.equal(result.turnContext, turnContext);
  assert.deepEqual(result.completedStages, EXPECTED_STAGES);
  assert.deepEqual(calls, NEW_BASE_TURN_PROVIDER_NAMES);
  assert.equal(result.outputs.completion, 'finalizeResultOrNextTurn:13');
});

test('removes superseded fixed-hand/fixed-slot seams and keeps no-defeat vocabulary out of the orchestration contract', () => {
  const contract = JSON.stringify({ stages: NEW_BASE_TURN_STAGE, providers: NEW_BASE_TURN_PROVIDER_NAMES });
  for (const oldProvider of [
    'recoverTurnStartMana',
    'obtainHand3',
    'autoAssignFixedJankenSlots',
    'selectFixedSlotCard',
    'resolveSharedJanken',
    'resolveBattle',
  ]) {
    assert.equal(NEW_BASE_TURN_PROVIDER_NAMES.includes(oldProvider), false, oldProvider);
  }
  assert.doesNotMatch(contract, /HAND3|FIXED_JANKEN|SELECT_FIXED_SLOT|DEFEAT|LOSER|\bLOSS\b/i);
});

test('validates the complete provider contract before calling any provider', async () => {
  let calls = 0;
  const providers = providerFixture({
    requireRoundStateReady() {
      calls += 1;
    },
  });
  delete providers.resolveBattleInteraction;

  await assert.rejects(
    () => runNewBaseTurn({ providers }),
    /providers\.resolveBattleInteraction must be a function/,
  );
  assert.equal(calls, 0);
});

test('movement resolves before landing, first-valid-card registration, Battle additions and ordered janken', async () => {
  const roundState = Object.freeze({ resourceState: 'ROUND_AUTHORITY_READY' });
  const dice = Object.freeze({ authoritativeRoll: 'OPAQUE_DICE_RESULT' });
  const baseMovementBudget = Object.freeze({ base: 'EXTERNAL_MOVEMENT' });
  const movementBudget = Object.freeze({ total: 'SHARED_MOVEMENT_AUTHORITY' });
  const reservation = Object.freeze({ path: ['A', 'B'] });
  const movementResolution = Object.freeze({ endpoint: 'B' });
  const landingInteraction = Object.freeze({ kind: 'CURRENT_AUTHORITY_DEFINED' });
  const jankenRegistration = Object.freeze({ source: 'FIRST_VALID_PLAYED_CARD' });
  const battleCardAdditions = Object.freeze({ cards: 'CURRENT_RESOURCE_AUTHORITY' });
  const orderedJanken = Object.freeze({ invalidated: ['p2'] });

  const result = await runNewBaseTurn({
    providers: providerFixture({
      requireRoundStateReady: () => roundState,
      rollAuthoritativeDice: ({ outputs }) => {
        assert.equal(outputs.roundState, roundState);
        return dice;
      },
      deriveBaseMovementBudget: () => baseMovementBudget,
      composeMovementBudget: ({ outputs }) => {
        assert.equal(outputs.dice, dice);
        assert.equal(outputs.baseMovementBudget, baseMovementBudget);
        return movementBudget;
      },
      reserveMovement: ({ outputs }) => {
        assert.equal(outputs.movementBudget, movementBudget);
        return reservation;
      },
      revalidateAndResolveMovement: ({ outputs }) => {
        assert.equal(outputs.movementReservation, reservation);
        return movementResolution;
      },
      resolveLandingInteraction: ({ outputs }) => {
        assert.equal(outputs.movementResolution, movementResolution);
        assert.equal('jankenRegistration' in outputs, false);
        return landingInteraction;
      },
      registerJankenFromFirstValidCard: ({ outputs }) => {
        assert.equal(outputs.landingInteraction, landingInteraction);
        return jankenRegistration;
      },
      addBattleCardsWithinResources: ({ outputs }) => {
        assert.equal(outputs.jankenRegistration, jankenRegistration);
        return battleCardAdditions;
      },
      resolveOrderedJanken: ({ outputs }) => {
        assert.equal(outputs.battleCardAdditions, battleCardAdditions);
        return orderedJanken;
      },
      resolveBattleInteraction: ({ outputs }) => {
        assert.equal(outputs.orderedJanken, orderedJanken);
        return { applied: true };
      },
    }),
  });

  assert.equal(result.outputs.roundState, roundState);
  assert.equal(result.outputs.movementResolution, movementResolution);
  assert.equal(result.outputs.jankenRegistration, jankenRegistration);
  assert.equal(result.outputs.orderedJanken, orderedJanken);
});

test('passes reservation to one revalidation/resolution provider without internal retry', async () => {
  let revalidationCalls = 0;
  const reservation = Object.freeze({ path: ['A', 'B', 'C'], revision: 44 });
  const movementResolution = Object.freeze({ formalEndpoint: 'C' });

  const result = await runNewBaseTurn({
    providers: providerFixture({
      reserveMovement: () => reservation,
      revalidateAndResolveMovement: ({ outputs }) => {
        revalidationCalls += 1;
        assert.equal(outputs.movementReservation, reservation);
        return movementResolution;
      },
    }),
  });

  assert.equal(revalidationCalls, 1);
  assert.equal(result.outputs.movementResolution, movementResolution);
});

test('stage failure stops later providers and exposes the current interaction boundary', async () => {
  const calls = [];
  const cause = new Error('current Battle authority rejected revision');
  const providers = providerFixture();
  for (const providerName of NEW_BASE_TURN_PROVIDER_NAMES) {
    providers[providerName] = () => {
      calls.push(providerName);
      if (providerName === 'resolveBattleInteraction') throw cause;
      return providerName;
    };
  }

  await assert.rejects(
    () => runNewBaseTurn({ providers }),
    (error) => {
      assert.equal(error instanceof NewBaseTurnOrchestratorError, true);
      assert.equal(error.stage, NEW_BASE_TURN_STAGE.BATTLE_INTERACTION_RESOLUTION);
      assert.equal(error.cause, cause);
      return true;
    },
  );
  assert.deepEqual(calls, NEW_BASE_TURN_PROVIDER_NAMES.slice(0, 11));
});

test('ROAD, GOAL and Result/next-turn semantics remain opaque provider outputs', async () => {
  const road = Object.freeze({ progress: 'CALLER_DEFINED' });
  const goal = Object.freeze({ routeState: 'CALLER_DEFINED' });
  const completion = Object.freeze({ disposition: 'CALLER_DEFINED_RESULT_OR_NEXT_TURN' });

  const result = await runNewBaseTurn({
    providers: providerFixture({
      progressRoad: () => road,
      evaluateGoal: ({ outputs }) => {
        assert.equal(outputs.roadProgression, road);
        return goal;
      },
      finalizeResultOrNextTurn: ({ outputs }) => {
        assert.equal(outputs.goalEvaluation, goal);
        return completion;
      },
    }),
  });

  assert.equal(result.outputs.roadProgression, road);
  assert.equal(result.outputs.goalEvaluation, goal);
  assert.equal(result.outputs.completion, completion);
});
