import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BATTLE_NEW_BASE_LIVE_CONSUMER_ADAPTER_CONTRACT,
  createBattleNewBaseLiveConsumerAdapter,
} from '../browser/battle-new-base-live-consumer-adapter.mjs';
import {
  NEW_BASE_ROUND_START_JANKEN_ASSIGNMENT_MODE,
} from '../browser/new-base-round-start-janken-slot-assignment-core.mjs';
import { StaleBattleJankenCompoundAttackPackageError } from '../browser/battle-janken-compound-attack-package-core.mjs';

function roundAuthority(overrides = {}) {
  return {
    roundId: 'round-7',
    hand: [
      { id: 'card-a', suit: 'SP' },
      { id: 'card-b', suit: 'CL' },
      { id: 'card-c', suit: 'DI' },
    ],
    assignedCardIdsByJankenHand: {
      ROCK: 'card-c',
      SCISSORS: 'card-a',
      PAPER: 'card-b',
    },
    ...overrides,
  };
}

function compoundCandidate(overrides = {}) {
  return {
    jankenHand: 'ROCK',
    cardId: 'card-c',
    path: ['P1', { node: 'road-2' }, 'P3'],
    direction: 'UP_RIGHT',
    roadId: 'road-2',
    battleId: 'battle-9',
    opponentId: 'P3',
    shieldLane: 'CENTER',
    shieldRef: 'P3:CENTER',
    ...overrides,
  };
}

function createHarness(overrides = {}) {
  let candidate = compoundCandidate();
  const sent = [];
  const adapter = createBattleNewBaseLiveConsumerAdapter({
    readRoundAuthority: async () => roundAuthority(),
    readCompoundAttackCandidate: async () => candidate,
    sendExistingBattleAction: async (payload) => {
      sent.push(payload);
      return true;
    },
    ...overrides,
  });
  return {
    adapter,
    sent,
    setCandidate(next) { candidate = next; },
  };
}

test('CURRENT hand3 consumes the external mapping exactly and keeps native suit separate', async () => {
  const { adapter } = createHarness();
  const snapshot = await adapter.syncRoundStart();

  assert.equal(snapshot.assignmentMode, NEW_BASE_ROUND_START_JANKEN_ASSIGNMENT_MODE.CURRENT_HAND3_POLICY);
  assert.deepEqual(snapshot.sourceHandCardIds, ['card-a', 'card-b', 'card-c']);
  assert.deepEqual(
    snapshot.slots.map(({ jankenHand, cardId, nativeSuit }) => ({ jankenHand, cardId, nativeSuit })),
    [
      { jankenHand: 'ROCK', cardId: 'card-c', nativeSuit: 'DI' },
      { jankenHand: 'SCISSORS', cardId: 'card-a', nativeSuit: 'SP' },
      { jankenHand: 'PAPER', cardId: 'card-b', nativeSuit: 'CL' },
    ],
  );
  assert.deepEqual(snapshot.ordinaryHandCardIds, []);
});

test('fails closed when the external hand3 mapping authority has not supplied a mapping', async () => {
  const adapter = createBattleNewBaseLiveConsumerAdapter({
    readRoundAuthority: async () => roundAuthority({ assignedCardIdsByJankenHand: null }),
    readCompoundAttackCandidate: async () => compoundCandidate(),
    sendExistingBattleAction: async () => true,
  });

  await assert.rejects(
    () => adapter.syncRoundStart(),
    /must be supplied by the external hand3 mapping authority/,
  );
});

test('stages only a complete authority-supplied package matching the externally assigned physical card', async () => {
  const { adapter } = createHarness();
  const stage = await adapter.stageCompoundAttack('ROCK');

  assert.equal(stage.status, 'STAGED');
  assert.equal(stage.package.jankenHand, 'ROCK');
  assert.equal(stage.package.cardId, 'card-c');
  assert.equal(stage.package.opponentId, 'P3');
  assert.equal(stage.package.shieldLane, 'CENTER');
  assert.deepEqual(stage.package.path, ['P1', { node: 'road-2' }, 'P3']);
  assert.deepEqual(stage.preview.route.path, stage.package.path);
});

test('rejects a compound candidate that silently swaps the selected janken card', async () => {
  const { adapter } = createHarness({
    readCompoundAttackCandidate: async () => compoundCandidate({ cardId: 'card-a' }),
  });

  await assert.rejects(
    () => adapter.stageCompoundAttack('ROCK'),
    /changed cardId/,
  );
});

test('fresh authority mismatch blocks the whole commit before existing transport is called', async () => {
  let reads = 0;
  const sent = [];
  const adapter = createBattleNewBaseLiveConsumerAdapter({
    readRoundAuthority: async () => roundAuthority(),
    readCompoundAttackCandidate: async () => {
      reads += 1;
      return reads === 1
        ? compoundCandidate()
        : compoundCandidate({ shieldLane: 'RIGHT', shieldRef: 'P3:RIGHT' });
    },
    sendExistingBattleAction: async (payload) => {
      sent.push(payload);
      return true;
    },
  });

  await adapter.stageCompoundAttack('ROCK');
  await assert.rejects(
    () => adapter.commitCompoundAttack(),
    StaleBattleJankenCompoundAttackPackageError,
  );
  assert.equal(sent.length, 0);
});

test('fresh matching package is forwarded unchanged once to the existing Battle action path', async () => {
  const { adapter, sent } = createHarness();
  const stage = await adapter.stageCompoundAttack('ROCK');
  const result = await adapter.commitCompoundAttack();

  assert.equal(result.ok, true);
  assert.equal(result.committed, true);
  assert.strictEqual(result.payload, stage.package);
  assert.equal(sent.length, 1);
  assert.strictEqual(sent[0], stage.package);

  const duplicate = await adapter.commitCompoundAttack();
  assert.deepEqual(duplicate, { ok: false, committed: false, reason: 'STAGE_REQUIRED' });
  assert.equal(sent.length, 1);
});

test('clear drops the complete staged package without rolling back authoritative game state', async () => {
  const { adapter } = createHarness();
  await adapter.stageCompoundAttack('ROCK');
  const cleared = adapter.clearCompoundAttack();

  assert.equal(cleared.cleared, true);
  assert.deepEqual(cleared.clearedFields, ['package', 'preview']);
  assert.equal(cleared.authoritativeRollback, false);
  assert.equal(cleared.gameStateWrite, false);
  assert.equal(adapter.status().stagedCompoundAttack, null);
});

test('Mana recovery remains an opaque authority operation and its amount is never inferred', async () => {
  const authorityOperation = Object.freeze({
    schema: 'caller-owned-mana-op.v1',
    turnKey: 'turn-7:P1',
    recovery: Object.freeze({ policyResult: 'externally-resolved-value' }),
  });
  let applied = null;
  const adapter = createBattleNewBaseLiveConsumerAdapter({
    readRoundAuthority: async () => roundAuthority(),
    readCompoundAttackCandidate: async () => compoundCandidate(),
    sendExistingBattleAction: async () => true,
    readManaRecoveryOperation: async () => authorityOperation,
    applyExistingManaRecovery: async (operation) => {
      applied = operation;
      return true;
    },
  });

  const result = await adapter.forwardTurnStartManaRecovery();
  assert.equal(result.ok, true);
  assert.equal(result.applied, true);
  assert.strictEqual(result.operation, authorityOperation);
  assert.strictEqual(applied, authorityOperation);
  assert.equal(Object.hasOwn(result.operation, 'amount'), false);
});

test('Mana seam is fail-closed when it is intentionally not connected', async () => {
  const { adapter } = createHarness();
  assert.deepEqual(
    await adapter.forwardTurnStartManaRecovery(),
    { ok: false, applied: false, reason: 'MANA_RECOVERY_NOT_CONNECTED' },
  );
});

test('contract records the non-authority boundaries and keeps optional rules outside core Battle', () => {
  assert.deepEqual(
    {
      nativeSuitDeterminesJankenSlot: BATTLE_NEW_BASE_LIVE_CONSUMER_ADAPTER_CONTRACT.nativeSuitDeterminesJankenSlot,
      computesTarget: BATTLE_NEW_BASE_LIVE_CONSUMER_ADAPTER_CONTRACT.computesTarget,
      computesLegality: BATTLE_NEW_BASE_LIVE_CONSUMER_ADAPTER_CONTRACT.computesLegality,
      computesHand3Mapping: BATTLE_NEW_BASE_LIVE_CONSUMER_ADAPTER_CONTRACT.computesHand3Mapping,
      computesManaRecoveryAmount: BATTLE_NEW_BASE_LIVE_CONSUMER_ADAPTER_CONTRACT.computesManaRecoveryAmount,
      schedulesManaRecovery: BATTLE_NEW_BASE_LIVE_CONSUMER_ADAPTER_CONTRACT.schedulesManaRecovery,
      hiddenHandSemantics: BATTLE_NEW_BASE_LIVE_CONSUMER_ADAPTER_CONTRACT.hiddenHandSemantics,
      diceRequiredForCoreBattle: BATTLE_NEW_BASE_LIVE_CONSUMER_ADAPTER_CONTRACT.diceRequiredForCoreBattle,
      rouletteRequiredForCoreBattle: BATTLE_NEW_BASE_LIVE_CONSUMER_ADAPTER_CONTRACT.rouletteRequiredForCoreBattle,
      secondBattleEngine: BATTLE_NEW_BASE_LIVE_CONSUMER_ADAPTER_CONTRACT.secondBattleEngine,
    },
    {
      nativeSuitDeterminesJankenSlot: false,
      computesTarget: false,
      computesLegality: false,
      computesHand3Mapping: false,
      computesManaRecoveryAmount: false,
      schedulesManaRecovery: false,
      hiddenHandSemantics: 'NOT_IMPLEMENTED_UNRESOLVED',
      diceRequiredForCoreBattle: false,
      rouletteRequiredForCoreBattle: false,
      secondBattleEngine: false,
    },
  );
});
