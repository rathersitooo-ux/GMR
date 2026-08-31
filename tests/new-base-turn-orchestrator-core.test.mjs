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
  NEW_BASE_TURN_STAGE.TURN_START_MANA_RECOVERY,
  NEW_BASE_TURN_STAGE.AUTHORITATIVE_DICE,
  NEW_BASE_TURN_STAGE.HAND3,
  NEW_BASE_TURN_STAGE.AUTO_ASSIGN_FIXED_JANKEN_SLOTS,
  NEW_BASE_TURN_STAGE.SELECT_FIXED_SLOT_CARD,
  NEW_BASE_TURN_STAGE.SHARED_JANKEN,
  NEW_BASE_TURN_STAGE.BATTLE,
  NEW_BASE_TURN_STAGE.BASE_MOVEMENT_BUDGET,
  NEW_BASE_TURN_STAGE.COMPOSE_MOVEMENT_BUDGET,
  NEW_BASE_TURN_STAGE.MOVEMENT_RESERVATION,
  NEW_BASE_TURN_STAGE.MOVEMENT_REVALIDATION_RESOLUTION,
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

test('runs exactly one shared-provider turn in fixed orchestration order', async () => {
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

test('validates the complete provider contract before calling any provider', async () => {
  let calls = 0;
  const providers = providerFixture({
    recoverTurnStartMana() {
      calls += 1;
    },
  });
  delete providers.resolveBattle;

  await assert.rejects(
    () => runNewBaseTurn({ providers }),
    /providers\.resolveBattle must be a function/,
  );
  assert.equal(calls, 0);
});

test('keeps undecided mana and dice values opaque and delegates movement composition unchanged', async () => {
  const mana = Object.freeze({ amount: 'UNDECIDED_EXTERNAL_CONFIG' });
  const dice = Object.freeze({ authoritativeRoll: 'OPAQUE_DICE_RESULT' });
  const baseMovementBudget = Object.freeze({ base: 'EXTERNAL_BATTLE_MOVEMENT' });
  const movementBudget = Object.freeze({ total: 'SHARED_MOVEMENT_AUTHORITY' });
  let composeInput;
  let reserveInput;

  const result = await runNewBaseTurn({
    providers: providerFixture({
      recoverTurnStartMana: () => mana,
      rollAuthoritativeDice: () => dice,
      deriveBaseMovementBudget: () => baseMovementBudget,
      composeMovementBudget: (input) => {
        composeInput = input;
        return movementBudget;
      },
      reserveMovement: (input) => {
        reserveInput = input;
        return { reserved: true };
      },
    }),
  });

  assert.equal(composeInput.outputs.manaRecovery, mana);
  assert.equal(composeInput.outputs.dice, dice);
  assert.equal(composeInput.outputs.baseMovementBudget, baseMovementBudget);
  assert.equal(reserveInput.outputs.movementBudget, movementBudget);
  assert.equal(result.outputs.movementBudget, movementBudget);
});

test('does not overwrite native card suits or map suits into fixed janken hands', async () => {
  const cards = Object.freeze([
    Object.freeze({ cardId: 'c1', suit: 'native-club' }),
    Object.freeze({ cardId: 'c2', suit: 'native-heart' }),
    Object.freeze({ cardId: 'c3', suit: 'native-spade' }),
  ]);
  const assignment = Object.freeze({
    ROCK: cards[1],
    SCISSORS: cards[2],
    PAPER: cards[0],
  });
  const selection = Object.freeze({ slot: 'ROCK', card: cards[1], assignedJankenHand: 'ROCK' });
  let jankenInput;

  await runNewBaseTurn({
    providers: providerFixture({
      obtainHand3: () => cards,
      autoAssignFixedJankenSlots: ({ outputs }) => {
        assert.equal(outputs.hand3, cards);
        return assignment;
      },
      selectFixedSlotCard: ({ outputs }) => {
        assert.equal(outputs.fixedJankenSlots, assignment);
        return selection;
      },
      resolveSharedJanken: (input) => {
        jankenInput = input;
        return { winners: ['p1'] };
      },
    }),
  });

  assert.equal(jankenInput.outputs.selection, selection);
  assert.deepEqual(cards.map((card) => card.suit), ['native-club', 'native-heart', 'native-spade']);
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

test('stage failure stops later providers and exposes the failed orchestration boundary', async () => {
  const calls = [];
  const cause = new Error('shared Battle rejected revision');
  const providers = providerFixture();
  for (const providerName of NEW_BASE_TURN_PROVIDER_NAMES) {
    providers[providerName] = () => {
      calls.push(providerName);
      if (providerName === 'resolveBattle') throw cause;
      return providerName;
    };
  }

  await assert.rejects(
    () => runNewBaseTurn({ providers }),
    (error) => {
      assert.equal(error instanceof NewBaseTurnOrchestratorError, true);
      assert.equal(error.stage, NEW_BASE_TURN_STAGE.BATTLE);
      assert.equal(error.cause, cause);
      return true;
    },
  );
  assert.deepEqual(calls, NEW_BASE_TURN_PROVIDER_NAMES.slice(0, 7));
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
