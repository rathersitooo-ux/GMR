import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BATTLE_JANKEN_COMPOUND_PREVIEW_LIVE_BRIDGE_CONTRACT,
  createBattleJankenCompoundPreviewLiveBridge,
} from '../browser/battle-janken-compound-preview-live-bridge.mjs';

function packageFor(jankenHand = 'ROCK', cardId = 'CARD-ROCK') {
  return Object.freeze({
    schema: 'gameroad.battle-janken-compound-attack-package.v1',
    jankenHand,
    cardId,
    path: Object.freeze(['CELL-A', 'CELL-B', 'SHIELD-L']),
    direction: 'NORTHWEST',
    roadId: 'ROAD-A',
    battleId: 'BATTLE-1',
    opponentId: 'P2',
    shieldLane: 'L',
    shieldRef: 'P2-SHIELD-L',
  });
}

function createHarness({
  renderActive = true,
  refreshActive = true,
  commitResult = { ok: true, committed: true, reason: 'EXISTING_BATTLE_ACTION_ACCEPTED' },
  commitError = null,
} = {}) {
  let currentPreview = null;
  let stagedPackage = null;
  const calls = {
    stage: [],
    clearStage: 0,
    commit: 0,
    render: [],
    clearPreview: 0,
    refreshPreview: 0,
  };

  const liveConsumer = {
    async stageCompoundAttack(jankenHand) {
      calls.stage.push(jankenHand);
      stagedPackage = packageFor(jankenHand, `CARD-${jankenHand}`);
      currentPreview = {
        jankenHand: stagedPackage.jankenHand,
        cardId: stagedPackage.cardId,
        opponentId: stagedPackage.opponentId,
        shieldLane: stagedPackage.shieldLane,
      };
      return Object.freeze({
        status: 'STAGED',
        package: stagedPackage,
        preview: currentPreview,
      });
    },
    clearCompoundAttack() {
      calls.clearStage += 1;
      const cleared = currentPreview !== null;
      currentPreview = null;
      stagedPackage = null;
      return Object.freeze({ cleared, gameStateWrite: false });
    },
    async commitCompoundAttack() {
      calls.commit += 1;
      if (commitError) throw commitError;
      if (commitResult?.committed === true) {
        currentPreview = null;
        stagedPackage = null;
      }
      return Object.freeze({ ...commitResult });
    },
    status() {
      return Object.freeze({ stagedCompoundAttack: currentPreview });
    },
  };

  const previewRuntime = {
    render(pkg) {
      calls.render.push(pkg);
      return Object.freeze({ active: renderActive, package: pkg });
    },
    clear() {
      calls.clearPreview += 1;
      return Object.freeze({ active: false });
    },
    refresh() {
      calls.refreshPreview += 1;
      return Object.freeze({ active: refreshActive });
    },
  };

  return {
    bridge: createBattleJankenCompoundPreviewLiveBridge({ liveConsumer, previewRuntime }),
    liveConsumer,
    calls,
    get stagedPackage() {
      return stagedPackage;
    },
  };
}

test('focus forwards the exact authority-staged package to the existing preview runtime', async () => {
  const harness = createHarness();
  const result = await harness.bridge.focus('ROCK');

  assert.equal(result.ok, true);
  assert.equal(result.previewActive, true);
  assert.equal(harness.calls.stage.length, 1);
  assert.equal(harness.calls.render.length, 1);
  assert.strictEqual(harness.calls.render[0], result.package);
  assert.equal(result.package.opponentId, 'P2');
  assert.equal(result.package.shieldLane, 'L');
  assert.deepEqual(result.package.path, ['CELL-A', 'CELL-B', 'SHIELD-L']);
  assert.equal(harness.bridge.status().computesTarget, false);
  assert.equal(harness.bridge.status().computesLegality, false);
  assert.equal(harness.bridge.status().computesRoute, false);
});

test('an unrenderable exact preview clears the local staged package before commit', async () => {
  const harness = createHarness({ renderActive: false });
  const result = await harness.bridge.focus('SCISSORS');

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'EXACT_COMPOUND_PREVIEW_UNAVAILABLE');
  assert.equal(harness.calls.clearStage, 1);
  assert.equal(harness.liveConsumer.status().stagedCompoundAttack, null);

  const commit = await harness.bridge.commit();
  assert.equal(commit.committed, false);
  assert.equal(commit.reason, 'VISIBLE_CURRENT_STAGE_REQUIRED');
  assert.equal(harness.calls.commit, 0);
});

test('commit delegates exactly once to the existing consumer and clears presentation after acceptance', async () => {
  const harness = createHarness();
  await harness.bridge.focus('PAPER');
  const clearsBeforeCommit = harness.calls.clearPreview;

  const result = await harness.bridge.commit();

  assert.equal(result.committed, true);
  assert.equal(harness.calls.commit, 1);
  assert.equal(harness.calls.clearPreview, clearsBeforeCommit + 1);
  assert.equal(harness.bridge.status().previewActive, false);
  assert.equal(harness.liveConsumer.status().stagedCompoundAttack, null);
});

test('existing transport rejection keeps the same visible staged package available for correction or retry', async () => {
  const harness = createHarness({
    commitResult: { ok: false, committed: false, reason: 'EXISTING_BATTLE_ACTION_REJECTED' },
  });
  await harness.bridge.focus('ROCK');
  const clearsBeforeCommit = harness.calls.clearPreview;

  const result = await harness.bridge.commit();

  assert.equal(result.committed, false);
  assert.equal(harness.calls.commit, 1);
  assert.equal(harness.calls.clearPreview, clearsBeforeCommit);
  assert.equal(harness.bridge.status().previewActive, true);
  assert.equal(harness.bridge.status().currentStageMatchesBridge, true);
});

test('refresh fails closed if board projection can no longer show the exact staged target', async () => {
  const harness = createHarness({ refreshActive: false });
  await harness.bridge.focus('ROCK');

  const result = harness.bridge.refresh();

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'EXACT_COMPOUND_PREVIEW_BECAME_UNAVAILABLE');
  assert.equal(harness.calls.refreshPreview, 1);
  assert.equal(harness.calls.clearStage, 1);
  assert.equal(harness.liveConsumer.status().stagedCompoundAttack, null);
  assert.equal(harness.bridge.status().previewActive, false);
});

test('a changed consumer stage cannot be committed through a stale visible preview', async () => {
  const harness = createHarness();
  await harness.bridge.focus('ROCK');
  await harness.liveConsumer.stageCompoundAttack('PAPER');

  const result = await harness.bridge.commit();

  assert.equal(result.committed, false);
  assert.equal(result.reason, 'VISIBLE_CURRENT_STAGE_REQUIRED');
  assert.equal(harness.calls.commit, 0);
  assert.equal(harness.bridge.status().previewActive, false);
});

test('commit exceptions clear both staged package and preview so stale targeting cannot remain armed', async () => {
  const expected = new Error('STALE_COMPOUND_ATTACK_PACKAGE');
  const harness = createHarness({ commitError: expected });
  await harness.bridge.focus('SCISSORS');

  await assert.rejects(() => harness.bridge.commit(), expected);

  assert.equal(harness.calls.commit, 1);
  assert.equal(harness.calls.clearStage, 1);
  assert.equal(harness.liveConsumer.status().stagedCompoundAttack, null);
  assert.equal(harness.bridge.status().previewActive, false);
});

test('contract explicitly forbids a second targeting or battle authority', () => {
  assert.equal(BATTLE_JANKEN_COMPOUND_PREVIEW_LIVE_BRIDGE_CONTRACT.forwardsExactStagedPackage, true);
  assert.equal(BATTLE_JANKEN_COMPOUND_PREVIEW_LIVE_BRIDGE_CONTRACT.hiddenTargetCommitAllowed, false);
  assert.equal(BATTLE_JANKEN_COMPOUND_PREVIEW_LIVE_BRIDGE_CONTRACT.computesTarget, false);
  assert.equal(BATTLE_JANKEN_COMPOUND_PREVIEW_LIVE_BRIDGE_CONTRACT.computesLegality, false);
  assert.equal(BATTLE_JANKEN_COMPOUND_PREVIEW_LIVE_BRIDGE_CONTRACT.computesRoute, false);
  assert.equal(BATTLE_JANKEN_COMPOUND_PREVIEW_LIVE_BRIDGE_CONTRACT.computesShieldMapping, false);
  assert.equal(BATTLE_JANKEN_COMPOUND_PREVIEW_LIVE_BRIDGE_CONTRACT.secondTargetEngine, false);
  assert.equal(BATTLE_JANKEN_COMPOUND_PREVIEW_LIVE_BRIDGE_CONTRACT.secondBattleEngine, false);
});
