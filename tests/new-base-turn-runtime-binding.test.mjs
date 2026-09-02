import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NEW_BASE_TURN_RUNTIME_AUTHORITY_NAMES,
  createNewBaseTurnRuntimeProviders,
  runNewBaseTurnWithRuntime,
} from '../browser/new-base-turn-runtime-binding.mjs';
import { NEW_BASE_TURN_STAGE } from '../browser/new-base-turn-orchestrator-core.mjs';

const JANKEN_CONFIG = Object.freeze({
  handOrder: ['alpha', 'beta', 'gamma'],
  beats: Object.freeze({ alpha: 'beta', beta: 'gamma', gamma: 'alpha' }),
  noHand: 'none',
});

function makeAuthorities(calls = []) {
  return {
    requireRoundStateReady(input) {
      calls.push('round-ready');
      assert.deepEqual(input.completedStages, []);
      return { roundId: 'round-2', resourceState: 'READY_BY_ROUND_AUTHORITY' };
    },
    readAuthoritativeDiceRequest(input) {
      calls.push('dice-request');
      assert.equal(input.outputs.roundState.resourceState, 'READY_BY_ROUND_AUTHORITY');
      return { matchId: 'match-1', turnId: 'turn-4', rollId: 'roll-4', sides: 6 };
    },
    nextDiceInteger(request) {
      calls.push(`dice:${request.min}-${request.max}`);
      return 4;
    },
    deriveBaseMovementBudget(input) {
      calls.push('base-movement');
      assert.equal(input.outputs.dice.value, 4);
      return 3;
    },
    reserveMovement(input) {
      calls.push('reserve');
      assert.equal(input.outputs.movementBudget.totalMovementBudget, 7);
      return { reservationId: 'move-1' };
    },
    revalidateAndResolveMovement(input) {
      calls.push('revalidate');
      return { moved: input.outputs.movementBudget.totalMovementBudget, endpoint: 'space-7' };
    },
    resolveLandingInteraction(input) {
      calls.push('landing');
      assert.equal(input.outputs.movementResolution.endpoint, 'space-7');
      return { kind: 'CURRENT_LANDING_AUTHORITY' };
    },
    registerJankenFromFirstValidCard(input) {
      calls.push('register-janken');
      assert.equal(input.outputs.landingInteraction.kind, 'CURRENT_LANDING_AUTHORITY');
      return { source: 'FIRST_VALID_PLAYED_CARD', cardId: 'card-first' };
    },
    addBattleCardsWithinResources(input) {
      calls.push('battle-additions');
      assert.equal(input.outputs.jankenRegistration.cardId, 'card-first');
      return { acceptedCardIds: ['card-extra'] };
    },
    readOrderedJankenSelections(input) {
      calls.push('janken-selections');
      assert.deepEqual(input.outputs.battleCardAdditions.acceptedCardIds, ['card-extra']);
      return [
        { playerId: 'p1', hand: 'alpha' },
        { playerId: 'p2', hand: 'beta' },
        { playerId: 'p3', hand: 'gamma' },
        { playerId: 'p4', hand: 'gamma' },
      ];
    },
    readJankenResolverConfig() {
      calls.push('janken-config');
      return JANKEN_CONFIG;
    },
    resolveBattleInteraction(input) {
      calls.push('battle-interaction');
      assert.deepEqual(input.outputs.orderedJanken.invalidated, ['p2', 'p1']);
      return { appliedBy: 'CURRENT_BATTLE_AUTHORITY' };
    },
    progressRoad(input) {
      calls.push('road');
      assert.equal(input.outputs.battleInteraction.appliedBy, 'CURRENT_BATTLE_AUTHORITY');
      return { progress: 'OPAQUE_CURRENT_ROAD_STATE' };
    },
    evaluateGoal(input) {
      calls.push('goal');
      assert.equal(input.outputs.roadProgression.progress, 'OPAQUE_CURRENT_ROAD_STATE');
      return { routeState: 'OPAQUE_CURRENT_GOAL_AUTHORITY' };
    },
    finalizeResultOrNextTurn(input) {
      calls.push('finalize');
      assert.equal(input.outputs.goalEvaluation.routeState, 'OPAQUE_CURRENT_GOAL_AUTHORITY');
      return { kind: 'NEXT_TURN' };
    },
  };
}

test('runtime binding composes current cores after round readiness and resolves movement before Battle interaction', async () => {
  const calls = [];
  const result = await runNewBaseTurnWithRuntime({
    turnContext: Object.freeze({ actorId: 'player-1' }),
    runtimeAuthorities: makeAuthorities(calls),
  });

  assert.deepEqual(calls, [
    'round-ready',
    'dice-request',
    'dice:1-6',
    'base-movement',
    'reserve',
    'revalidate',
    'landing',
    'register-janken',
    'battle-additions',
    'janken-selections',
    'janken-config',
    'battle-interaction',
    'road',
    'goal',
    'finalize',
  ]);
  assert.equal(result.completedStages.length, 14);
  assert.equal(result.outputs.dice.value, 4);
  assert.deepEqual(result.outputs.movementBudget, {
    baseMovementBudget: 3,
    diceMovementDelta: 4,
    totalMovementBudget: 7,
  });
  assert.deepEqual(result.outputs.orderedJanken.invalidated, ['p2', 'p1']);
  assert.deepEqual(result.outputs.completion, { kind: 'NEXT_TURN' });
});

test('runtime binding does not perform per-turn mana recovery or fixed hand/RSP assignment', async () => {
  for (const supersededName of [
    'recoverMana',
    'obtainHand3',
    'readFixedJankenSlotState',
    'proposeFixedJankenAssignment',
    'selectFixedSlotCard',
  ]) {
    assert.equal(NEW_BASE_TURN_RUNTIME_AUTHORITY_NAMES.includes(supersededName), false, supersededName);
  }

  const runtimeAuthorities = makeAuthorities();
  runtimeAuthorities.recoverMana = () => {
    throw new Error('per-turn mana recovery must not be called');
  };
  const result = await runNewBaseTurnWithRuntime({ turnContext: {}, runtimeAuthorities });
  assert.equal(result.outputs.roundState.resourceState, 'READY_BY_ROUND_AUTHORITY');
});

test('runtime binding reuses current win-only ordered cyclic resolver without assigning invalidated-card destination', async () => {
  const result = await runNewBaseTurnWithRuntime({
    turnContext: {},
    runtimeAuthorities: makeAuthorities(),
  });

  assert.deepEqual(result.outputs.orderedJanken.processingOrder, ['p1', 'p2', 'p3', 'p4']);
  assert.deepEqual(
    result.outputs.orderedJanken.steps.map((step) => step.processedPlayerId),
    ['p1', 'p3', 'p4'],
  );
  assert.deepEqual(result.outputs.orderedJanken.survivors, ['p3', 'p4']);
  assert.deepEqual(result.outputs.orderedJanken.invalidated, ['p2', 'p1']);
  const serialized = JSON.stringify(result.outputs.orderedJanken);
  assert.doesNotMatch(serialized, /destination|graveyard|chip|subdeck/i);
});

test('runtime binding fails closed when a required existing authority is absent', () => {
  const runtimeAuthorities = makeAuthorities();
  delete runtimeAuthorities.resolveLandingInteraction;
  assert.throws(
    () => createNewBaseTurnRuntimeProviders({ runtimeAuthorities }),
    /runtimeAuthorities\.resolveLandingInteraction must be a function/,
  );
});

test('invalid ordered-janken authority data fails at the ordered resolution boundary', async () => {
  const runtimeAuthorities = makeAuthorities();
  runtimeAuthorities.readJankenResolverConfig = () => ({ handOrder: ['a'] });

  await assert.rejects(
    () => runNewBaseTurnWithRuntime({ turnContext: {}, runtimeAuthorities }),
    (error) => {
      assert.equal(error.stage, NEW_BASE_TURN_STAGE.ORDERED_JANKEN_RESOLUTION);
      assert.match(error.cause?.message ?? '', /handOrder/);
      return true;
    },
  );
});
