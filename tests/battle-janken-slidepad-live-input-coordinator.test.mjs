import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BATTLE_JANKEN_SLIDEPAD_LIVE_INPUT_COORDINATOR_CONTRACT,
  BATTLE_JANKEN_SLIDEPAD_LIVE_INPUT_COORDINATOR_SCHEMA,
  createBattleJankenSlidePadLiveInputCoordinator,
} from '../browser/battle-janken-slidepad-live-input-coordinator.mjs';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

function readyStage(hand) {
  return {
    ok: true,
    staged: true,
    reason: 'VISIBLE_PREVIEW_READY',
    stage: { package: { jankenHand: hand, cardId: `card-${hand}` } },
    preview: { active: true, jankenHand: hand, targetId: `target-${hand}` },
  };
}

function createFakeBridge({ stageImpl, commitImpl, clearImpl, precommitClearImpl } = {}) {
  const calls = [];
  let activeHand = null;
  const bridge = {
    async stageCompoundAttack(hand) {
      calls.push(`stage:${hand}`);
      const result = stageImpl
        ? await stageImpl(hand, calls)
        : readyStage(hand);
      if (result?.ok === true && result?.staged === true) activeHand = hand;
      return result;
    },
    async clearCompoundAttack() {
      calls.push('clear');
      const result = clearImpl
        ? await clearImpl(calls)
        : { ok: true, cleared: true };
      activeHand = null;
      return result;
    },
    async clearPrecommitSelection() {
      calls.push('clear-precommit');
      const result = precommitClearImpl
        ? await precommitClearImpl(calls)
        : { ok: true, cleared: true, reason: 'CLEARED_PRECOMMIT_SELECTION' };
      if (result?.cleared === true) activeHand = null;
      return result;
    },
    async commitCompoundAttack() {
      calls.push(`commit:${activeHand ?? 'none'}`);
      return commitImpl
        ? commitImpl(activeHand, calls)
        : { ok: true, committed: true, reason: 'EXISTING_BATTLE_ACTION_ACCEPTED' };
    },
    status() {
      return { activeHand };
    },
  };
  return { bridge, calls };
}

test('requires the existing live preview bridge surface including global precommit clear', () => {
  assert.throws(
    () => createBattleJankenSlidePadLiveInputCoordinator({ liveBridge: {} }),
    /stageCompoundAttack/,
  );
  assert.throws(
    () => createBattleJankenSlidePadLiveInputCoordinator({
      liveBridge: {
        stageCompoundAttack() {},
        clearCompoundAttack() {},
        commitCompoundAttack() {},
        status() {},
      },
    }),
    /clearPrecommitSelection/,
  );
});

test('latest focus with a visible preview becomes commit-ready without computing game meaning', async () => {
  const { bridge, calls } = createFakeBridge();
  const coordinator = createBattleJankenSlidePadLiveInputCoordinator({ liveBridge: bridge });

  const result = await coordinator.focus('ROCK');
  assert.equal(result.ok, true);
  assert.equal(result.reason, 'LATEST_FOCUS_PREVIEW_READY');
  assert.equal(result.jankenHand, 'ROCK');
  assert.equal(result.preview.targetId, 'target-ROCK');
  assert.deepEqual(calls, ['stage:ROCK']);

  const status = coordinator.status();
  assert.equal(status.schema, BATTLE_JANKEN_SLIDEPAD_LIVE_INPUT_COORDINATOR_SCHEMA);
  assert.equal(status.phase, 'READY');
  assert.equal(status.readyHand, 'ROCK');
  assert.equal(status.previewReady, true);
  assert.equal(status.gameplayAuthority, false);
  assert.equal(status.targetInference, false);
  assert.equal(status.legalTargetRecompute, false);
  assert.equal(status.routeRecompute, false);
  assert.equal(status.handAssignmentAuthority, false);
  assert.equal(status.gameStateWrite, false);
});

test('rapid focus change uses compound-only cleanup before staging the latest hand', async () => {
  const rock = deferred();
  const { bridge, calls } = createFakeBridge({
    stageImpl: (hand) => hand === 'ROCK' ? rock.promise : readyStage(hand),
  });
  const coordinator = createBattleJankenSlidePadLiveInputCoordinator({ liveBridge: bridge });

  const first = coordinator.focus('ROCK');
  await Promise.resolve();
  assert.deepEqual(calls, ['stage:ROCK']);

  const latest = coordinator.focus('SCISSORS');
  rock.resolve(readyStage('ROCK'));

  const firstResult = await first;
  const latestResult = await latest;
  assert.equal(firstResult.ok, false);
  assert.equal(firstResult.stale, true);
  assert.equal(firstResult.reason, 'FOCUS_SUPERSEDED');
  assert.equal(latestResult.ok, true);
  assert.equal(latestResult.jankenHand, 'SCISSORS');
  assert.deepEqual(calls, ['stage:ROCK', 'clear', 'stage:SCISSORS']);
  assert.equal(coordinator.status().readyHand, 'SCISSORS');
});

test('focus superseded before its queued mutation never stages the stale hand', async () => {
  const gate = deferred();
  const { bridge, calls } = createFakeBridge({
    precommitClearImpl: async () => {
      await gate.promise;
      return { ok: true, cleared: true, reason: 'CLEARED_PRECOMMIT_SELECTION' };
    },
  });
  const coordinator = createBattleJankenSlidePadLiveInputCoordinator({ liveBridge: bridge });

  const cancelling = coordinator.cancel();
  const first = coordinator.focus('ROCK');
  const latest = coordinator.focus('PAPER');
  gate.resolve();

  await cancelling;
  const firstResult = await first;
  const latestResult = await latest;
  assert.equal(firstResult.stale, true);
  assert.equal(latestResult.ok, true);
  assert.deepEqual(calls, ['clear-precommit', 'stage:PAPER']);
});

test('explicit cancel during in-flight stage uses stale local cleanup then one global precommit clear', async () => {
  const stage = deferred();
  const { bridge, calls } = createFakeBridge({ stageImpl: () => stage.promise });
  const coordinator = createBattleJankenSlidePadLiveInputCoordinator({ liveBridge: bridge });

  const focusing = coordinator.focus('PAPER');
  await Promise.resolve();
  const cancelling = coordinator.cancel();
  stage.resolve(readyStage('PAPER'));

  const focusResult = await focusing;
  const cancelResult = await cancelling;
  assert.equal(focusResult.stale, true);
  assert.equal(cancelResult.ok, true);
  assert.equal(cancelResult.cleared, true);
  assert.equal(coordinator.status().phase, 'IDLE');
  assert.equal(coordinator.status().previewReady, false);
  assert.equal(coordinator.status().desiredHand, null);
  assert.deepEqual(calls, ['stage:PAPER', 'clear', 'clear-precommit']);
});

test('failed explicit global clear restores the current ready focus instead of half-clearing locally', async () => {
  const { bridge, calls } = createFakeBridge({
    precommitClearImpl: async () => ({
      ok: false,
      cleared: false,
      reason: 'EXISTING_PRECOMMIT_CLEAR_REJECTED',
    }),
  });
  const coordinator = createBattleJankenSlidePadLiveInputCoordinator({ liveBridge: bridge });

  await coordinator.focus('ROCK');
  const result = await coordinator.cancel();

  assert.equal(result.ok, false);
  assert.equal(result.cleared, false);
  assert.equal(result.reason, 'EXISTING_PRECOMMIT_CLEAR_REJECTED');
  assert.deepEqual(calls, ['stage:ROCK', 'clear-precommit']);
  assert.equal(coordinator.status().phase, 'READY');
  assert.equal(coordinator.status().readyHand, 'ROCK');
  assert.equal(coordinator.status().previewReady, true);
  assert.equal(coordinator.status().desiredHand, 'ROCK');
});

test('commit queued behind focus waits for the exact visible preview then forwards once', async () => {
  const stage = deferred();
  const { bridge, calls } = createFakeBridge({ stageImpl: () => stage.promise });
  const coordinator = createBattleJankenSlidePadLiveInputCoordinator({ liveBridge: bridge });

  const focusing = coordinator.focus('SCISSORS');
  await Promise.resolve();
  const committing = coordinator.commit();
  assert.equal(coordinator.status().commitPending, true);
  stage.resolve(readyStage('SCISSORS'));

  assert.equal((await focusing).ok, true);
  const commitResult = await committing;
  assert.equal(commitResult.ok, true);
  assert.equal(commitResult.committed, true);
  assert.equal(commitResult.jankenHand, 'SCISSORS');
  assert.deepEqual(calls, ['stage:SCISSORS', 'commit:SCISSORS']);
  assert.equal(coordinator.status().phase, 'IDLE');
  assert.equal(coordinator.status().previewReady, false);
  assert.equal(coordinator.status().desiredHand, null);
});

test('commit without the latest visible preview fails closed and does not call transport', async () => {
  const { bridge, calls } = createFakeBridge();
  const coordinator = createBattleJankenSlidePadLiveInputCoordinator({ liveBridge: bridge });

  const result = await coordinator.commit();
  assert.equal(result.ok, false);
  assert.equal(result.committed, false);
  assert.equal(result.reason, 'LATEST_FOCUS_PREVIEW_REQUIRED');
  assert.deepEqual(calls, []);
});

test('focus and cancel are rejected while an authoritative commit is in flight', async () => {
  const commitGate = deferred();
  const { bridge, calls } = createFakeBridge({
    commitImpl: async () => commitGate.promise,
  });
  const coordinator = createBattleJankenSlidePadLiveInputCoordinator({ liveBridge: bridge });

  await coordinator.focus('ROCK');
  const committing = coordinator.commit();
  await Promise.resolve();

  const focusDuringCommit = await coordinator.focus('PAPER');
  const cancelDuringCommit = await coordinator.cancel();
  assert.equal(focusDuringCommit.reason, 'COMMIT_IN_FLIGHT');
  assert.equal(cancelDuringCommit.reason, 'COMMIT_IN_FLIGHT');
  assert.equal(coordinator.status().desiredHand, 'ROCK');

  commitGate.resolve({ ok: true, committed: true, reason: 'EXISTING_BATTLE_ACTION_ACCEPTED' });
  const result = await committing;
  assert.equal(result.ok, true);
  assert.deepEqual(calls, ['stage:ROCK', 'commit:ROCK']);
});

test('rejected commit preserves ready preview and explicit cancel then uses global precommit clear', async () => {
  const { bridge, calls } = createFakeBridge({
    commitImpl: async () => ({ ok: false, committed: false, reason: 'EXISTING_BATTLE_ACTION_REJECTED' }),
  });
  const coordinator = createBattleJankenSlidePadLiveInputCoordinator({ liveBridge: bridge });

  await coordinator.focus('PAPER');
  const result = await coordinator.commit();
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'EXISTING_BATTLE_ACTION_REJECTED');
  assert.equal(coordinator.status().phase, 'READY');
  assert.equal(coordinator.status().previewReady, true);
  assert.equal(coordinator.status().readyHand, 'PAPER');
  assert.deepEqual(calls, ['stage:PAPER', 'commit:PAPER']);

  await coordinator.cancel();
  assert.equal(coordinator.status().phase, 'IDLE');
  assert.deepEqual(calls, ['stage:PAPER', 'commit:PAPER', 'clear-precommit']);
});

test('stage failure uses compound-only cleanup and never invokes global draft clear', async () => {
  const { bridge, calls } = createFakeBridge({
    stageImpl: async () => { throw new Error('preview source unavailable'); },
  });
  const coordinator = createBattleJankenSlidePadLiveInputCoordinator({ liveBridge: bridge });

  const result = await coordinator.focus('ROCK');
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'STAGE_FAILED');
  assert.equal(coordinator.status().phase, 'IDLE');
  assert.equal(coordinator.status().previewReady, false);
  assert.deepEqual(calls, ['stage:ROCK', 'clear']);
  assert.equal((await coordinator.commit()).reason, 'LATEST_FOCUS_PREVIEW_REQUIRED');
});

test('destroy serializes a final compound-only clear and prevents later focus or commit', async () => {
  const { bridge, calls } = createFakeBridge();
  const coordinator = createBattleJankenSlidePadLiveInputCoordinator({ liveBridge: bridge });
  await coordinator.focus('SCISSORS');

  assert.equal(await coordinator.destroy(), true);
  assert.equal(coordinator.status().destroyed, true);
  assert.equal(coordinator.status().phase, 'DESTROYED');
  assert.equal((await coordinator.focus('ROCK')).reason, 'DESTROYED');
  assert.equal((await coordinator.commit()).reason, 'DESTROYED');
  assert.deepEqual(calls, ['stage:SCISSORS', 'clear']);
});

test('contract states global explicit cancel and local stale cleanup are separate', () => {
  assert.equal(BATTLE_JANKEN_SLIDEPAD_LIVE_INPUT_COORDINATOR_CONTRACT.authority, 'NONE');
  assert.equal(BATTLE_JANKEN_SLIDEPAD_LIVE_INPUT_COORDINATOR_CONTRACT.explicitCancelPolicy, 'EXISTING_SHARED_GLOBAL_PRECOMMIT_CLEAR_THROUGH_BRIDGE');
  assert.equal(BATTLE_JANKEN_SLIDEPAD_LIVE_INPUT_COORDINATOR_CONTRACT.staleFocusClearPolicy, 'COMPOUND_STAGE_ONLY');
  assert.equal(BATTLE_JANKEN_SLIDEPAD_LIVE_INPUT_COORDINATOR_CONTRACT.failedExplicitCancelPolicy, 'RESTORE_LOCAL_READY_STATE_IF_STILL_CURRENT');
  assert.equal(BATTLE_JANKEN_SLIDEPAD_LIVE_INPUT_COORDINATOR_CONTRACT.asyncMutationPolicy, 'SERIAL_LATEST_FOCUS_WINS');
  assert.equal(BATTLE_JANKEN_SLIDEPAD_LIVE_INPUT_COORDINATOR_CONTRACT.commitRequiresLatestVisiblePreview, true);
  assert.equal(BATTLE_JANKEN_SLIDEPAD_LIVE_INPUT_COORDINATOR_CONTRACT.authoritativeRollback, false);
  assert.equal(BATTLE_JANKEN_SLIDEPAD_LIVE_INPUT_COORDINATOR_CONTRACT.computesTarget, false);
  assert.equal(BATTLE_JANKEN_SLIDEPAD_LIVE_INPUT_COORDINATOR_CONTRACT.computesLegality, false);
  assert.equal(BATTLE_JANKEN_SLIDEPAD_LIVE_INPUT_COORDINATOR_CONTRACT.computesRoute, false);
  assert.equal(BATTLE_JANKEN_SLIDEPAD_LIVE_INPUT_COORDINATOR_CONTRACT.computesHandAssignment, false);
  assert.equal(BATTLE_JANKEN_SLIDEPAD_LIVE_INPUT_COORDINATOR_CONTRACT.gameStateWrite, false);
  assert.equal(BATTLE_JANKEN_SLIDEPAD_LIVE_INPUT_COORDINATOR_CONTRACT.mutatesProductionHtml, false);
  assert.equal(BATTLE_JANKEN_SLIDEPAD_LIVE_INPUT_COORDINATOR_CONTRACT.mutatesJankenRuntime, false);
});
