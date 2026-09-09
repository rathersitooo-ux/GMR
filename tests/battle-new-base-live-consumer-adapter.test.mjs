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
  const entropyRequests = [];
  const adapter = createBattleNewBaseLiveConsumerAdapter({
    readRoundAuthority: async () => roundAuthority(),
    readAuthoritativeHand3Uint32: (request) => {
      entropyRequests.push(request);
      return 4;
    },
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
    entropyRequests,
    setCandidate(next) { candidate = next; },
  };
}

test('CURRENT hand3 derives the six-way uniform mapping and keeps native suit separate', async () => {
  const { adapter, entropyRequests } = createHarness();
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
  assert.deepEqual(entropyRequests, [{
    assignmentEpochId: 'round-7',
    sampleKind: 'HAND3_UNIFORM_PERMUTATION_UINT32',
  }]);
});

test('same-round sync, reconnect-style resync, and stage do not reroll the hand3 snapshot', async () => {
  let entropyReads = 0;
  const { adapter } = createHarness({
    readAuthoritativeHand3Uint32: () => {
      entropyReads += 1;
      return 4;
    },
  });

  const first = await adapter.syncRoundStart();
  const second = await adapter.syncRoundStart();
  await adapter.stageCompoundAttack('ROCK');

  assert.strictEqual(second, first);
  assert.equal(entropyReads, 1);
});

test('same authoritative entropy gives the same mapping regardless of player-facing hand order', async () => {
  const makeAdapter = (hand) => createBattleNewBaseLiveConsumerAdapter({
    readRoundAuthority: async () => roundAuthority({ hand }),
    readAuthoritativeHand3Uint32: () => 4,
    readCompoundAttackCandidate: async () => compoundCandidate(),
    sendExistingBattleAction: async () => true,
  });

  const first = await makeAdapter([
    { id: 'card-a', suit: 'SP' },
    { id: 'card-b', suit: 'CL' },
    { id: 'card-c', suit: 'DI' },
  ]).syncRoundStart();
  const second = await makeAdapter([
    { id: 'card-c', suit: 'DI' },
    { id: 'card-a', suit: 'SP' },
    { id: 'card-b', suit: 'CL' },
  ]).syncRoundStart();

  assert.deepEqual(
    first.slots.map(({ jankenHand, cardId }) => ({ jankenHand, cardId })),
    second.slots.map(({ jankenHand, cardId }) => ({ jankenHand, cardId })),
  );
});

test('fails closed when the authoritative hand3 uint32 source is not connected', () => {
  assert.throws(
    () => createBattleNewBaseLiveConsumerAdapter({
      readRoundAuthority: async () => roundAuthority(),
      readCompoundAttackCandidate: async () => compoundCandidate(),
      sendExistingBattleAction: async () => true,
    }),
    /readAuthoritativeHand3Uint32 must be a function/,
  );
});

test('fails closed when the authoritative hand3 uint32 source returns an invalid value', async () => {
  const { adapter } = createHarness({
    readAuthoritativeHand3Uint32: () => 0x1_0000_0000,
  });

  await assert.rejects(
    () => adapter.syncRoundStart(),
    /readUint32 must return an integer in \[0, 4294967295\]/,
  );
});

test('observing a new round clears the prior uncommitted compound package before a failed redraw', async () => {
  let currentRound = roundAuthority();
  let entropyValue = 4;
  const adapter = createBattleNewBaseLiveConsumerAdapter({
    readRoundAuthority: async () => currentRound,
    readAuthoritativeHand3Uint32: () => entropyValue,
    readCompoundAttackCandidate: async () => compoundCandidate(),
    sendExistingBattleAction: async () => true,
  });

  await adapter.stageCompoundAttack('ROCK');
  assert.notEqual(adapter.status().stagedCompoundAttack, null);

  currentRound = roundAuthority({ roundId: 'round-8' });
  entropyValue = 0x1_0000_0000;
  await assert.rejects(() => adapter.syncRoundStart(), /readUint32 must return/);
  assert.equal(adapter.status().stagedCompoundAttack, null);
});

test('stages only a complete authority-supplied package matching the uniformly assigned physical card', async () => {
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
    readAuthoritativeHand3Uint32: () => 4,
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

test('precommit clear callbacks must be connected as a pair', () => {
  assert.throws(
    () => createHarness({ readExistingPrecommitState: async () => ({}) }),
    /Precommit state reader and draft applier must be supplied together or both omitted/,
  );
  assert.throws(
    () => createHarness({ applyExistingPrecommitDraft: async () => true }),
    /Precommit state reader and draft applier must be supplied together or both omitted/,
  );
});

test('one-operation clear removes caller target draft and local compound stage together', async () => {
  let applied = null;
  const { adapter } = createHarness({
    readExistingPrecommitState: async () => ({
      phase: 'target',
      position: 'P1',
      plan: { roadId: 'road-2', battleId: 'battle-9', path: ['P1', 'road-2'] },
      targetDraft: { defenderId: 'P3', lane: 'CENTER', shield: 'P3:CENTER' },
      targetCommitted: false,
      busy: false,
    }),
    applyExistingPrecommitDraft: async (next) => {
      applied = next;
      return true;
    },
  });

  await adapter.stageCompoundAttack('ROCK');
  const result = await adapter.clearPrecommitSelection();

  assert.equal(result.ok, true);
  assert.equal(result.cleared, true);
  assert.equal(result.existingDraftCleared, true);
  assert.equal(result.compoundCleared, true);
  assert.equal(result.complete, true);
  assert.equal(result.authoritativeRollback, false);
  assert.equal(result.gameStateWrite, false);
  assert.deepEqual(applied.targetDraft, null);
  assert.equal(adapter.status().stagedCompoundAttack, null);
});

test('existing draft rejection preserves the local compound stage instead of half-clearing', async () => {
  const { adapter } = createHarness({
    readExistingPrecommitState: async () => ({
      phase: 'target',
      position: 'P1',
      plan: { roadId: 'road-2', battleId: 'battle-9', path: ['P1', 'road-2'] },
      targetDraft: { defenderId: 'P3', lane: 'CENTER', shield: 'P3:CENTER' },
      targetCommitted: false,
      busy: false,
    }),
    applyExistingPrecommitDraft: async () => false,
  });

  await adapter.stageCompoundAttack('ROCK');
  const result = await adapter.clearPrecommitSelection();

  assert.equal(result.ok, false);
  assert.equal(result.cleared, false);
  assert.equal(result.reason, 'EXISTING_PRECOMMIT_CLEAR_REJECTED');
  assert.equal(result.compoundCleared, false);
  assert.notEqual(adapter.status().stagedCompoundAttack, null);
});

test('busy or committed precommit state blocks local compound clear as one atomic semantic', async () => {
  for (const state of [
    {
      phase: 'target',
      position: 'P1',
      plan: { path: ['P1'] },
      targetDraft: { defenderId: 'P3', lane: 'CENTER', shield: 'P3:CENTER' },
      targetCommitted: false,
      busy: true,
    },
    {
      phase: 'target',
      position: 'P1',
      plan: { path: ['P1'] },
      targetDraft: { defenderId: 'P3', lane: 'CENTER', shield: 'P3:CENTER' },
      targetCommitted: true,
      busy: false,
    },
  ]) {
    const { adapter } = createHarness({
      readExistingPrecommitState: async () => state,
      applyExistingPrecommitDraft: async () => true,
    });
    await adapter.stageCompoundAttack('ROCK');
    const result = await adapter.clearPrecommitSelection();
    assert.equal(result.cleared, false);
    assert.equal(result.authoritativeRollback, false);
    assert.notEqual(adapter.status().stagedCompoundAttack, null);
  }
});

test('connected empty caller draft may still clear the adapter-owned local precommit compound stage', async () => {
  let applyCalls = 0;
  const { adapter } = createHarness({
    readExistingPrecommitState: async () => ({
      phase: 'target',
      position: 'P1',
      plan: { path: ['P1'] },
      targetDraft: null,
      targetCommitted: false,
      busy: false,
    }),
    applyExistingPrecommitDraft: async () => {
      applyCalls += 1;
      return true;
    },
  });

  await adapter.stageCompoundAttack('ROCK');
  const result = await adapter.clearPrecommitSelection();

  assert.equal(result.ok, true);
  assert.equal(result.existingDraftCleared, false);
  assert.equal(result.compoundCleared, true);
  assert.equal(applyCalls, 0);
  assert.equal(adapter.status().stagedCompoundAttack, null);
});

test('global precommit clear fails closed when the existing caller draft seam is not connected', async () => {
  const { adapter } = createHarness();
  await adapter.stageCompoundAttack('ROCK');

  const result = await adapter.clearPrecommitSelection();
  assert.equal(result.ok, false);
  assert.equal(result.cleared, false);
  assert.equal(result.reason, 'PRECOMMIT_CLEAR_NOT_CONNECTED');
  assert.equal(result.complete, false);
  assert.notEqual(adapter.status().stagedCompoundAttack, null);
});

test('commit in flight blocks precommit clear without rolling back the accepted transport', async () => {
  let releaseTransport;
  const transportWait = new Promise((resolve) => { releaseTransport = resolve; });
  const { adapter } = createHarness({
    readExistingPrecommitState: async () => ({
      phase: 'target',
      position: 'P1',
      plan: { path: ['P1'] },
      targetDraft: { defenderId: 'P3', lane: 'CENTER', shield: 'P3:CENTER' },
      targetCommitted: false,
      busy: false,
    }),
    applyExistingPrecommitDraft: async () => true,
    sendExistingBattleAction: async () => {
      await transportWait;
      return true;
    },
  });

  await adapter.stageCompoundAttack('ROCK');
  const commitPromise = adapter.commitCompoundAttack();
  await Promise.resolve();
  const clearResult = await adapter.clearPrecommitSelection();
  assert.equal(clearResult.ok, false);
  assert.equal(clearResult.reason, 'COMMIT_IN_FLIGHT');
  assert.notEqual(adapter.status().stagedCompoundAttack, null);
  releaseTransport();
  const commitResult = await commitPromise;
  assert.equal(commitResult.committed, true);
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
    readAuthoritativeHand3Uint32: () => 4,
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

test('status reports whether the shared precommit seam is actually connected', () => {
  const disconnected = createHarness().adapter;
  const connected = createHarness({
    readExistingPrecommitState: async () => ({ phase: 'plan' }),
    applyExistingPrecommitDraft: async () => true,
  }).adapter;
  assert.equal(disconnected.status().precommitClearConnected, false);
  assert.equal(connected.status().precommitClearConnected, true);
});

test('contract records canonical hand3 and reused precommit-clear boundaries while keeping optional rules outside core Battle', () => {
  assert.deepEqual(
    {
      hand3MappingAuthority: BATTLE_NEW_BASE_LIVE_CONSUMER_ADAPTER_CONTRACT.hand3MappingAuthority,
      hand3EntropyAuthority: BATTLE_NEW_BASE_LIVE_CONSUMER_ADAPTER_CONTRACT.hand3EntropyAuthority,
      hand3AssignmentEpoch: BATTLE_NEW_BASE_LIVE_CONSUMER_ADAPTER_CONTRACT.hand3AssignmentEpoch,
      hand3RerollWithinRound: BATTLE_NEW_BASE_LIVE_CONSUMER_ADAPTER_CONTRACT.hand3RerollWithinRound,
      nativeSuitDeterminesJankenSlot: BATTLE_NEW_BASE_LIVE_CONSUMER_ADAPTER_CONTRACT.nativeSuitDeterminesJankenSlot,
      computesTarget: BATTLE_NEW_BASE_LIVE_CONSUMER_ADAPTER_CONTRACT.computesTarget,
      computesLegality: BATTLE_NEW_BASE_LIVE_CONSUMER_ADAPTER_CONTRACT.computesLegality,
      computesHand3Mapping: BATTLE_NEW_BASE_LIVE_CONSUMER_ADAPTER_CONTRACT.computesHand3Mapping,
      precommitClearPolicy: BATTLE_NEW_BASE_LIVE_CONSUMER_ADAPTER_CONTRACT.precommitClearPolicy,
      precommitClearDraftAuthority: BATTLE_NEW_BASE_LIVE_CONSUMER_ADAPTER_CONTRACT.precommitClearDraftAuthority,
      precommitClearAuthoritativeRollback: BATTLE_NEW_BASE_LIVE_CONSUMER_ADAPTER_CONTRACT.precommitClearAuthoritativeRollback,
      precommitClearGameStateWrite: BATTLE_NEW_BASE_LIVE_CONSUMER_ADAPTER_CONTRACT.precommitClearGameStateWrite,
      computesManaRecoveryAmount: BATTLE_NEW_BASE_LIVE_CONSUMER_ADAPTER_CONTRACT.computesManaRecoveryAmount,
      schedulesManaRecovery: BATTLE_NEW_BASE_LIVE_CONSUMER_ADAPTER_CONTRACT.schedulesManaRecovery,
      hiddenHandSemantics: BATTLE_NEW_BASE_LIVE_CONSUMER_ADAPTER_CONTRACT.hiddenHandSemantics,
      diceRequiredForCoreBattle: BATTLE_NEW_BASE_LIVE_CONSUMER_ADAPTER_CONTRACT.diceRequiredForCoreBattle,
      rouletteRequiredForCoreBattle: BATTLE_NEW_BASE_LIVE_CONSUMER_ADAPTER_CONTRACT.rouletteRequiredForCoreBattle,
      secondBattleEngine: BATTLE_NEW_BASE_LIVE_CONSUMER_ADAPTER_CONTRACT.secondBattleEngine,
    },
    {
      hand3MappingAuthority: 'CANONICAL_UNIFORM_SIX_PERMUTATION_POLICY',
      hand3EntropyAuthority: 'CALLER_UINT32',
      hand3AssignmentEpoch: 'ROUND_ID',
      hand3RerollWithinRound: false,
      nativeSuitDeterminesJankenSlot: false,
      computesTarget: false,
      computesLegality: false,
      computesHand3Mapping: false,
      precommitClearPolicy: 'EXISTING_BATTLE_PRECOMMIT_CLEAR_CORE',
      precommitClearDraftAuthority: 'CALLER',
      precommitClearAuthoritativeRollback: false,
      precommitClearGameStateWrite: false,
      computesManaRecoveryAmount: false,
      schedulesManaRecovery: false,
      hiddenHandSemantics: 'NOT_IMPLEMENTED_UNRESOLVED',
      diceRequiredForCoreBattle: false,
      rouletteRequiredForCoreBattle: false,
      secondBattleEngine: false,
    },
  );
});
