import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BATTLE_JANKEN_FOCUS_LIVE_INTEGRATION_CONTRACT,
  BATTLE_JANKEN_FOCUS_LIVE_INTEGRATION_SCHEMA,
  createBattleJankenFocusLiveIntegration,
} from '../browser/battle-janken-focus-live-integration.mjs';
import {
  createRoundStartJankenSlotAssignment,
  NEW_BASE_ROUND_START_JANKEN_ASSIGNMENT_MODE,
} from '../browser/new-base-round-start-janken-slot-assignment-core.mjs';
import {
  normalizeBattleJankenFocusIntegration,
} from '../browser/battle-janken-slidepad-runtime-mount.mjs';

function currentSnapshot(roundId = 'battle-round:12') {
  return createRoundStartJankenSlotAssignment({
    roundId,
    hand: [
      { id: 'card-r', suit: 'DI' },
      { id: 'card-s', suit: 'SP' },
      { id: 'card-p', suit: 'CL' },
    ],
    assignmentMode: NEW_BASE_ROUND_START_JANKEN_ASSIGNMENT_MODE.CURRENT_HAND3_POLICY,
    assignedCardIdsByJankenHand: {
      ROCK: 'card-r',
      SCISSORS: 'card-s',
      PAPER: 'card-p',
    },
  });
}

function candidate({ roundId, jankenHand, cardId }) {
  return {
    jankenHand,
    cardId,
    path: [`${roundId}:start`, `${roundId}:${jankenHand}:end`],
    direction: jankenHand === 'ROCK' ? 'RIGHT' : jankenHand === 'SCISSORS' ? 'CENTER' : 'LEFT',
    roadId: `road-${jankenHand}`,
    battleId: `battle-${roundId}`,
    opponentId: `opponent-${jankenHand}`,
    shieldLane: jankenHand === 'ROCK' ? 'LEFT' : jankenHand === 'SCISSORS' ? 'CENTER' : 'RIGHT',
    shieldRef: `shield-${jankenHand}`,
  };
}

function createHarness() {
  const snapshot = currentSnapshot();
  const calls = {
    sync: 0,
    stage: [],
    clearLocal: 0,
    clearGlobal: 0,
    commit: 0,
    preview: [],
    previewClear: 0,
    candidates: [],
  };
  let staged = null;

  const liveConsumer = {
    async syncRoundStart() {
      calls.sync += 1;
      return snapshot;
    },
    async stageCompoundAttack(jankenHand) {
      calls.stage.push(jankenHand);
      const slot = snapshot.slots.find((value) => value.jankenHand === jankenHand);
      staged = candidate({ roundId: snapshot.roundId, jankenHand, cardId: slot.cardId });
      return Object.freeze({ package: staged });
    },
    clearCompoundAttack() {
      calls.clearLocal += 1;
      staged = null;
      return Object.freeze({ cleared: true });
    },
    async clearPrecommitSelection() {
      calls.clearGlobal += 1;
      staged = null;
      return Object.freeze({ ok: true, cleared: true, reason: 'PRECOMMIT_SELECTION_CLEARED' });
    },
    async commitCompoundAttack() {
      calls.commit += 1;
      staged = null;
      return Object.freeze({ ok: true, committed: true, reason: 'COMMITTED' });
    },
    status() {
      return Object.freeze({ roundId: snapshot.roundId, staged: staged !== null });
    },
  };

  const previewRuntime = {
    render(pkg) {
      calls.preview.push(pkg);
      return Object.freeze({ active: true, package: pkg });
    },
    clear() {
      calls.previewClear += 1;
      return true;
    },
  };

  const readCompoundAttackCandidate = async (request) => {
    calls.candidates.push(request);
    return candidate(request);
  };

  return {
    snapshot,
    calls,
    liveConsumer,
    previewRuntime,
    readCompoundAttackCandidate,
  };
}

function createIntegration(harness, mountSurface = () => ({ mounted: true })) {
  return createBattleJankenFocusLiveIntegration({
    liveConsumer: harness.liveConsumer,
    previewRuntime: harness.previewRuntime,
    readCompoundAttackCandidate: harness.readCompoundAttackCandidate,
    mountSurface,
  });
}

test('composes the merged components into the exact SlidePad focusIntegration shape', async () => {
  const h = createHarness();
  const mountSurface = () => ({ mounted: true });
  const integration = createIntegration(h, mountSurface);

  assert.equal(integration.schema, BATTLE_JANKEN_FOCUS_LIVE_INTEGRATION_SCHEMA);
  assert.strictEqual(integration.mountSurface, mountSurface);
  assert.equal(typeof integration.readContext, 'function');
  assert.equal(typeof integration.liveInputStack.focus, 'function');
  assert.equal(typeof integration.liveInputStack.cancel, 'function');
  assert.equal(typeof integration.liveInputStack.commit, 'function');
  assert.equal(typeof integration.liveInputStack.status, 'function');

  const normalized = normalizeBattleJankenFocusIntegration(integration);
  assert.ok(normalized);
  assert.strictEqual(normalized.mountSurface, mountSurface);
  assert.strictEqual(normalized.liveInputStack, integration.liveInputStack);

  const context = await normalized.readContext({
    roundId: h.snapshot.roundId,
    assignment: h.snapshot,
  });
  assert.equal(context.generationId, h.snapshot.roundId);
  assert.deepEqual(context.packages.map((pkg) => [pkg.jankenHand, pkg.cardId]), [
    ['ROCK', 'card-r'],
    ['SCISSORS', 'card-s'],
    ['PAPER', 'card-p'],
  ]);
  assert.deepEqual(h.calls.candidates.map((request) => request.jankenHand), [
    'ROCK',
    'SCISSORS',
    'PAPER',
  ]);
});

test('focus uses the same existing live stack and requires its visible preview before commit', async () => {
  const h = createHarness();
  const integration = createIntegration(h);

  const before = await integration.liveInputStack.commit();
  assert.equal(before.committed, false);
  assert.equal(h.calls.commit, 0);

  const focused = await integration.liveInputStack.focus('SCISSORS');
  assert.equal(focused.ok, true);
  assert.equal(focused.staged, true);
  assert.deepEqual(h.calls.stage, ['SCISSORS']);
  assert.equal(h.calls.preview.length, 1);
  assert.equal(h.calls.preview[0].jankenHand, 'SCISSORS');
  assert.equal(h.calls.preview[0].cardId, 'card-s');

  const status = integration.liveInputStack.status();
  assert.equal(status.readyHand, 'SCISSORS');
  assert.equal(status.previewReady, true);

  const committed = await integration.liveInputStack.commit();
  assert.equal(committed.ok, true);
  assert.equal(committed.committed, true);
  assert.equal(h.calls.commit, 1);
  assert.equal(integration.liveInputStack.status().previewReady, false);

  const duplicate = await integration.liveInputStack.commit();
  assert.equal(duplicate.committed, false);
  assert.equal(h.calls.commit, 1);
});

test('explicit cancel stays on the existing global precommit clear path and does not commit', async () => {
  const h = createHarness();
  const integration = createIntegration(h);

  const focused = await integration.liveInputStack.focus('PAPER');
  assert.equal(focused.ok, true);
  assert.equal(integration.liveInputStack.status().previewReady, true);

  const cancelled = await integration.liveInputStack.cancel();
  assert.equal(cancelled.ok, true);
  assert.equal(cancelled.cleared, true);
  assert.equal(h.calls.clearGlobal, 1);
  assert.equal(h.calls.commit, 0);
  assert.equal(integration.liveInputStack.status().previewReady, false);
  assert.ok(h.calls.previewClear >= 1);
});

test('destroy is idempotent and prevents new authority-context reads', async () => {
  const h = createHarness();
  const integration = createIntegration(h);

  assert.equal(integration.status().destroyed, false);
  assert.equal(integration.destroy(), true);
  assert.equal(integration.destroy(), false);
  assert.equal(integration.status().destroyed, true);

  await assert.rejects(
    integration.readContext({ roundId: h.snapshot.roundId, assignment: h.snapshot }),
    /destroyed/,
  );
});

test('contract remains composition-only with zero new game-rule authority', () => {
  assert.equal(BATTLE_JANKEN_FOCUS_LIVE_INTEGRATION_CONTRACT.authority, 'NONE');
  assert.deepEqual(
    BATTLE_JANKEN_FOCUS_LIVE_INTEGRATION_CONTRACT.slidePadShape,
    ['mountSurface', 'readContext', 'liveInputStack'],
  );
  assert.equal(BATTLE_JANKEN_FOCUS_LIVE_INTEGRATION_CONTRACT.createsBattleEngine, false);
  assert.equal(BATTLE_JANKEN_FOCUS_LIVE_INTEGRATION_CONTRACT.computesHandAssignment, false);
  assert.equal(BATTLE_JANKEN_FOCUS_LIVE_INTEGRATION_CONTRACT.computesTarget, false);
  assert.equal(BATTLE_JANKEN_FOCUS_LIVE_INTEGRATION_CONTRACT.computesLegality, false);
  assert.equal(BATTLE_JANKEN_FOCUS_LIVE_INTEGRATION_CONTRACT.computesRoute, false);
  assert.equal(BATTLE_JANKEN_FOCUS_LIVE_INTEGRATION_CONTRACT.computesShieldMapping, false);
  assert.equal(BATTLE_JANKEN_FOCUS_LIVE_INTEGRATION_CONTRACT.commitTransportAuthority, false);
  assert.equal(BATTLE_JANKEN_FOCUS_LIVE_INTEGRATION_CONTRACT.gameStateWrite, false);
  assert.equal(BATTLE_JANKEN_FOCUS_LIVE_INTEGRATION_CONTRACT.mutatesProductionHtml, false);
  assert.equal(BATTLE_JANKEN_FOCUS_LIVE_INTEGRATION_CONTRACT.mutatesSlidePadRuntime, false);
  assert.equal(BATTLE_JANKEN_FOCUS_LIVE_INTEGRATION_CONTRACT.mutatesPublicPackage, false);
});
