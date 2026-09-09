import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BATTLE_COMPOUND_PREVIEW_LIVE_CONSUMER_BRIDGE_CONTRACT,
  createBattleCompoundPreviewLiveConsumerBridge,
} from '../browser/battle-compound-preview-live-consumer-bridge.mjs';

function packageFor(overrides = {}) {
  return Object.freeze({
    schema: 'gameroad.battle-janken-compound-attack-package.v1',
    jankenHand: 'ROCK',
    cardId: 'card-a',
    path: Object.freeze(['p0', 'p1', 'p2']),
    direction: 'CW',
    roadId: 'road-a',
    battleId: 'battle-a',
    opponentId: 'P3',
    shieldLane: 'R',
    shieldRef: 'shield-p3-r',
    ...overrides,
  });
}

function harness({ previewActive = true, commitResult = null, precommitClearResult = null } = {}) {
  const calls = {
    sync: 0,
    stage: [],
    clearConsumer: 0,
    clearPrecommit: 0,
    commit: 0,
    render: [],
    clearPreview: 0,
  };

  let roundId = 'round-1';
  let staged = null;
  const acceptedCommit = commitResult ?? Object.freeze({
    ok: true,
    committed: true,
    reason: 'EXISTING_BATTLE_ACTION_ACCEPTED',
  });

  const liveConsumer = {
    async syncRoundStart() {
      calls.sync += 1;
      return Object.freeze({ roundId });
    },
    async stageCompoundAttack(jankenHand) {
      calls.stage.push(jankenHand);
      staged = Object.freeze({
        status: 'STAGED',
        package: packageFor({ jankenHand }),
        preview: Object.freeze({ shouldNotBePassedToRuntime: true }),
      });
      return staged;
    },
    clearCompoundAttack() {
      calls.clearConsumer += 1;
      const hadStage = Boolean(staged);
      staged = null;
      return Object.freeze({ cleared: hadStage });
    },
    async clearPrecommitSelection() {
      calls.clearPrecommit += 1;
      const result = precommitClearResult ?? Object.freeze({
        ok: true,
        cleared: true,
        reason: 'CLEARED_PRECOMMIT_SELECTION',
        existingDraftCleared: true,
        compoundCleared: Boolean(staged),
        authoritativeRollback: false,
        gameStateWrite: false,
      });
      if (result.cleared === true) staged = null;
      return result;
    },
    async commitCompoundAttack() {
      calls.commit += 1;
      if (acceptedCommit?.ok === true && acceptedCommit?.committed === true) staged = null;
      return acceptedCommit;
    },
    status() {
      return Object.freeze({
        roundId,
        stagedCompoundAttack: staged?.preview ?? null,
      });
    },
  };

  const previewRuntime = {
    render(value) {
      calls.render.push(value);
      return Object.freeze({
        active: previewActive,
        reason: previewActive ? 'package_core_preview_projected' : 'opponent_surface_not_found',
        package: previewActive ? value : null,
      });
    },
    clear() {
      calls.clearPreview += 1;
      return true;
    },
  };

  return {
    calls,
    liveConsumer,
    previewRuntime,
    setRoundId(value) {
      roundId = value;
    },
  };
}

test('stage forwards the exact staged package to the existing preview runtime', async () => {
  const h = harness();
  const bridge = createBattleCompoundPreviewLiveConsumerBridge(h);

  const result = await bridge.stageCompoundAttack('ROCK');

  assert.equal(result.ok, true);
  assert.equal(result.staged, true);
  assert.equal(result.reason, 'VISIBLE_PREVIEW_READY');
  assert.equal(h.calls.stage.length, 1);
  assert.equal(h.calls.render.length, 1);
  assert.strictEqual(h.calls.render[0], result.stage.package);
  assert.notStrictEqual(h.calls.render[0], result.stage.preview);
  assert.equal(result.preview.active, true);
  assert.equal(bridge.status().visiblePreviewReady, true);
});

test('unrenderable exact target fails closed and clears the uncommitted stage', async () => {
  const h = harness({ previewActive: false });
  const bridge = createBattleCompoundPreviewLiveConsumerBridge(h);

  const staged = await bridge.stageCompoundAttack('PAPER');
  const committed = await bridge.commitCompoundAttack();

  assert.equal(staged.ok, false);
  assert.equal(staged.reason, 'VISIBLE_PREVIEW_REQUIRED');
  assert.equal(h.calls.clearConsumer, 1);
  assert.equal(h.calls.clearPreview, 1);
  assert.equal(bridge.status().visiblePreviewReady, false);
  assert.deepEqual(committed, {
    ok: false,
    committed: false,
    reason: 'VISIBLE_PREVIEW_REQUIRED',
  });
  assert.equal(h.calls.commit, 0);
});

test('accepted commit clears the visible preview after existing transport accepts it', async () => {
  const h = harness();
  const bridge = createBattleCompoundPreviewLiveConsumerBridge(h);

  await bridge.stageCompoundAttack('SCISSORS');
  const beforeClearCount = h.calls.clearPreview;
  const result = await bridge.commitCompoundAttack();

  assert.equal(result.ok, true);
  assert.equal(result.committed, true);
  assert.equal(h.calls.commit, 1);
  assert.equal(h.calls.clearPreview, beforeClearCount + 1);
  assert.equal(bridge.status().visiblePreviewReady, false);
});

test('rejected existing transport keeps the staged preview visible for caller recovery', async () => {
  const rejected = Object.freeze({
    ok: false,
    committed: false,
    reason: 'EXISTING_BATTLE_ACTION_REJECTED',
  });
  const h = harness({ commitResult: rejected });
  const bridge = createBattleCompoundPreviewLiveConsumerBridge(h);

  await bridge.stageCompoundAttack('ROCK');
  const beforeClearCount = h.calls.clearPreview;
  const result = await bridge.commitCompoundAttack();

  assert.strictEqual(result, rejected);
  assert.equal(h.calls.commit, 1);
  assert.equal(h.calls.clearPreview, beforeClearCount);
  assert.equal(bridge.status().visiblePreviewReady, true);
});

test('observing a new authoritative round clears stale preview presentation', async () => {
  const h = harness();
  const bridge = createBattleCompoundPreviewLiveConsumerBridge(h);

  await bridge.syncRoundStart();
  await bridge.stageCompoundAttack('ROCK');
  const beforeClearCount = h.calls.clearPreview;

  h.setRoundId('round-2');
  const snapshot = await bridge.syncRoundStart();

  assert.equal(snapshot.roundId, 'round-2');
  assert.equal(h.calls.clearPreview, beforeClearCount + 1);
  assert.equal(bridge.status().observedRoundId, 'round-2');
  assert.equal(bridge.status().visiblePreviewReady, false);
});

test('local compound clear clears only existing consumer stage and preview', async () => {
  const h = harness();
  const bridge = createBattleCompoundPreviewLiveConsumerBridge(h);

  await bridge.stageCompoundAttack('PAPER');
  const beforeConsumerClear = h.calls.clearConsumer;
  const beforeGlobalClear = h.calls.clearPrecommit;
  const beforePreviewClear = h.calls.clearPreview;
  const result = bridge.clearCompoundAttack();

  assert.equal(result.ok, true);
  assert.equal(h.calls.clearConsumer, beforeConsumerClear + 1);
  assert.equal(h.calls.clearPrecommit, beforeGlobalClear);
  assert.equal(h.calls.clearPreview, beforePreviewClear + 1);
  assert.equal(bridge.status().visiblePreviewReady, false);
});

test('explicit global precommit clear removes caller draft plus stage and then clears preview', async () => {
  const h = harness();
  const bridge = createBattleCompoundPreviewLiveConsumerBridge(h);

  await bridge.stageCompoundAttack('PAPER');
  const beforeLocalClear = h.calls.clearConsumer;
  const beforePreviewClear = h.calls.clearPreview;
  const result = await bridge.clearPrecommitSelection();

  assert.equal(result.ok, true);
  assert.equal(result.cleared, true);
  assert.equal(result.previewCleared, true);
  assert.equal(h.calls.clearPrecommit, 1);
  assert.equal(h.calls.clearConsumer, beforeLocalClear);
  assert.equal(h.calls.clearPreview, beforePreviewClear + 1);
  assert.equal(bridge.status().visiblePreviewReady, false);
});

test('rejected global precommit clear preserves visible preview and staged decision for retry', async () => {
  const rejected = Object.freeze({
    ok: false,
    cleared: false,
    reason: 'EXISTING_PRECOMMIT_CLEAR_REJECTED',
    authoritativeRollback: false,
    gameStateWrite: false,
  });
  const h = harness({ precommitClearResult: rejected });
  const bridge = createBattleCompoundPreviewLiveConsumerBridge(h);

  await bridge.stageCompoundAttack('ROCK');
  const beforePreviewClear = h.calls.clearPreview;
  const result = await bridge.clearPrecommitSelection();

  assert.equal(result.ok, false);
  assert.equal(result.cleared, false);
  assert.equal(result.reason, 'EXISTING_PRECOMMIT_CLEAR_REJECTED');
  assert.equal(result.previewCleared, false);
  assert.equal(h.calls.clearPrecommit, 1);
  assert.equal(h.calls.clearConsumer, 0);
  assert.equal(h.calls.clearPreview, beforePreviewClear);
  assert.equal(bridge.status().visiblePreviewReady, true);
});

test('contract keeps explicit global cancel separate from stale-focus local cleanup', () => {
  assert.equal(BATTLE_COMPOUND_PREVIEW_LIVE_CONSUMER_BRIDGE_CONTRACT.authority, 'NONE');
  assert.equal(BATTLE_COMPOUND_PREVIEW_LIVE_CONSUMER_BRIDGE_CONTRACT.explicitCancelPolicy, 'EXISTING_SHARED_GLOBAL_PRECOMMIT_CLEAR');
  assert.equal(BATTLE_COMPOUND_PREVIEW_LIVE_CONSUMER_BRIDGE_CONTRACT.staleFocusClearPolicy, 'COMPOUND_STAGE_ONLY');
  assert.equal(BATTLE_COMPOUND_PREVIEW_LIVE_CONSUMER_BRIDGE_CONTRACT.globalClearRejectPolicy, 'KEEP_VISIBLE_PREVIEW_AND_STAGE');
  assert.equal(BATTLE_COMPOUND_PREVIEW_LIVE_CONSUMER_BRIDGE_CONTRACT.authoritativeRollback, false);
  assert.equal(BATTLE_COMPOUND_PREVIEW_LIVE_CONSUMER_BRIDGE_CONTRACT.computesTarget, false);
  assert.equal(BATTLE_COMPOUND_PREVIEW_LIVE_CONSUMER_BRIDGE_CONTRACT.computesLegality, false);
  assert.equal(BATTLE_COMPOUND_PREVIEW_LIVE_CONSUMER_BRIDGE_CONTRACT.computesRoute, false);
  assert.equal(BATTLE_COMPOUND_PREVIEW_LIVE_CONSUMER_BRIDGE_CONTRACT.gameStateWrite, false);
  assert.equal(BATTLE_COMPOUND_PREVIEW_LIVE_CONSUMER_BRIDGE_CONTRACT.mutatesProductionHtml, false);
});
