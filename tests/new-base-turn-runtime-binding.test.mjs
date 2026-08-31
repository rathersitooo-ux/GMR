import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createNewBaseTurnRuntimeProviders,
  runNewBaseTurnWithRuntime,
} from '../browser/new-base-turn-runtime-binding.mjs';
import { NEW_BASE_TURN_STAGE } from '../browser/new-base-turn-orchestrator-core.mjs';

function makeAuthorities(calls = []) {
  return {
    recoverMana(amount, input) {
      calls.push(`mana:${amount}`);
      assert.deepEqual(input.completedStages, []);
      return { recovered: amount };
    },
    readAuthoritativeDiceRequest(input) {
      calls.push('dice-request');
      assert.equal(input.outputs.manaRecovery.recovered, 2);
      return { matchId: 'match-1', turnId: 'turn-4', rollId: 'roll-4', sides: 6 };
    },
    nextDiceInteger(request) {
      calls.push(`dice:${request.min}-${request.max}`);
      return 4;
    },
    obtainHand3(input) {
      calls.push('hand3');
      assert.equal(input.outputs.dice.value, 4);
      return [{ id: 'card-a' }, { id: 'card-b' }, { id: 'card-c' }];
    },
    readFixedJankenSlotState() {
      calls.push('fixed-state');
      return {
        ROCK: { slotId: 'slot-rock', jankenHand: 'ROCK' },
        SCISSORS: { slotId: 'slot-scissors', jankenHand: 'SCISSORS' },
        PAPER: { slotId: 'slot-paper', jankenHand: 'PAPER' },
      };
    },
    proposeFixedJankenAssignment(policyInput) {
      calls.push('assign-policy');
      assert.deepEqual(policyInput.handCardIds, ['card-a', 'card-b', 'card-c']);
      return ['card-c', 'card-a', 'card-b'];
    },
    selectFixedSlotCard(input) {
      calls.push('select');
      return input.outputs.fixedJankenSlots[0];
    },
    resolveSharedJanken(input) {
      calls.push('janken');
      return { winner: input.outputs.selection.cardId };
    },
    resolveBattle(input) {
      calls.push('battle');
      return { resolvedFrom: input.outputs.janken.winner };
    },
    deriveBaseMovementBudget(input) {
      calls.push('base-movement');
      assert.equal(input.outputs.battle.resolvedFrom, 'card-c');
      return 3;
    },
    reserveMovement(input) {
      calls.push('reserve');
      assert.equal(input.outputs.movementBudget.totalMovementBudget, 7);
      return { reservationId: 'move-1' };
    },
    revalidateAndResolveMovement(input) {
      calls.push('revalidate');
      return { moved: input.outputs.movementBudget.totalMovementBudget };
    },
    progressRoad(input) {
      calls.push('road');
      return { roadMoved: input.outputs.movementResolution.moved };
    },
    evaluateGoal(input) {
      calls.push('goal');
      return { terminal: input.outputs.roadProgression.roadMoved >= 7 };
    },
    finalizeResultOrNextTurn(input) {
      calls.push('finalize');
      return { kind: input.outputs.goalEvaluation.terminal ? 'RESULT' : 'NEXT_TURN' };
    },
  };
}

test('runtime binding composes current cores and delegates remaining gameplay authorities in one turn', async () => {
  const calls = [];
  const result = await runNewBaseTurnWithRuntime({
    turnContext: Object.freeze({ actorId: 'player-1' }),
    runtimeAuthorities: makeAuthorities(calls),
    manaRecoveryConfigSource: { turnStartManaRecoveryAmount: 2 },
  });

  assert.deepEqual(calls, [
    'mana:2',
    'dice-request',
    'dice:1-6',
    'hand3',
    'fixed-state',
    'assign-policy',
    'select',
    'janken',
    'battle',
    'base-movement',
    'reserve',
    'revalidate',
    'road',
    'goal',
    'finalize',
  ]);
  assert.equal(result.completedStages.length, 14);
  assert.equal(result.outputs.dice.value, 4);
  assert.deepEqual(result.outputs.fixedJankenSlots, [
    { slotId: 'slot-rock', jankenHand: 'ROCK', cardId: 'card-c' },
    { slotId: 'slot-scissors', jankenHand: 'SCISSORS', cardId: 'card-a' },
    { slotId: 'slot-paper', jankenHand: 'PAPER', cardId: 'card-b' },
  ]);
  assert.deepEqual(result.outputs.movementBudget, {
    baseMovementBudget: 3,
    diceMovementDelta: 4,
    totalMovementBudget: 7,
  });
  assert.deepEqual(result.outputs.completion, { kind: 'RESULT' });
});

test('runtime binding preserves formal UNDECIDED mana and fails before shared mana mutation', async () => {
  const calls = [];
  await assert.rejects(
    runNewBaseTurnWithRuntime({
      turnContext: {},
      runtimeAuthorities: makeAuthorities(calls),
      manaRecoveryConfigSource: {},
    }),
    (error) => {
      assert.equal(error.stage, NEW_BASE_TURN_STAGE.TURN_START_MANA_RECOVERY);
      assert.match(error.cause?.message ?? '', /UNDECIDED/);
      return true;
    },
  );
  assert.deepEqual(calls, []);
});

test('runtime binding fails closed when a required existing authority is absent', () => {
  const runtimeAuthorities = makeAuthorities();
  delete runtimeAuthorities.progressRoad;
  assert.throws(
    () => createNewBaseTurnRuntimeProviders({
      runtimeAuthorities,
      manaRecoveryConfigSource: { turnStartManaRecoveryAmount: 2 },
    }),
    /runtimeAuthorities\.progressRoad must be a function/,
  );
});
