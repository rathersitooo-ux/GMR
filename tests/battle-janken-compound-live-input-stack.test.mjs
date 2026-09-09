import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BATTLE_JANKEN_COMPOUND_LIVE_INPUT_STACK_CONTRACT,
  createBattleJankenCompoundLiveInputStack,
} from '../browser/battle-janken-compound-live-input-stack.mjs';

function packageFor(hand = 'ROCK') {
  return Object.freeze({
    jankenHand: hand,
    cardId: `CARD-${hand}`,
    route: Object.freeze({
      path: Object.freeze(['FIELD-A', 'SHIELD-L']),
      direction: 'FORWARD',
      roadId: 'ROAD-A',
      battleId: 'BATTLE-1',
    }),
    opponentId: 'P2',
    shieldLane: 'L',
    shieldRef: 'P2-SHIELD-L',
  });
}

function createHarness({ previewActive = true, commitAccepted = true } = {}) {
  const calls = {
    stagedHands: [],
    renderedPackages: [],
    committedPackages: [],
    localClears: 0,
    globalClears: 0,
    previewClears: 0,
  };
  let stagedPackage = null;
  const liveConsumer = {
    async syncRoundStart() {
      return Object.freeze({ roundId: 'ROUND-1' });
    },
    async stageCompoundAttack(hand) {
      calls.stagedHands.push(hand);
      stagedPackage = packageFor(hand);
      return Object.freeze({ package: stagedPackage });
    },
    clearCompoundAttack() {
      calls.localClears += 1;
      stagedPackage = null;
      return Object.freeze({ cleared: true });
    },
    async clearPrecommitSelection() {
      calls.globalClears += 1;
      stagedPackage = null;
      return Object.freeze({ ok: true, cleared: true, reason: 'PRECOMMIT_SELECTION_CLEARED' });
    },
    async commitCompoundAttack() {
      if (!commitAccepted) {
        return Object.freeze({ ok: false, committed: false, reason: 'TRANSPORT_REJECTED' });
      }
      calls.committedPackages.push(stagedPackage);
      stagedPackage = null;
      return Object.freeze({ ok: true, committed: true, reason: 'COMMITTED' });
    },
    status() {
      return Object.freeze({ roundId: 'ROUND-1' });
    },
  };
  const previewRuntime = {
    render(value) {
      calls.renderedPackages.push(value);
      return Object.freeze({ active: previewActive, package: value });
    },
    clear() {
      calls.previewClears += 1;
      return true;
    },
  };
  const stack = createBattleJankenCompoundLiveInputStack({ liveConsumer, previewRuntime });
  return { calls, stack };
}

test('focus forwards the exact staged package to the existing preview runtime', async () => {
  const { calls, stack } = createHarness();
  const focused = await stack.focus('ROCK');

  assert.equal(focused.ok, true);
  assert.equal(focused.preview.active, true);
  assert.deepEqual(calls.stagedHands, ['ROCK']);
  assert.equal(calls.renderedPackages.length, 1);
  assert.equal(calls.renderedPackages[0].jankenHand, 'ROCK');
  assert.equal(calls.renderedPackages[0].opponentId, 'P2');
  assert.equal(calls.renderedPackages[0].shieldLane, 'L');
  assert.deepEqual(calls.renderedPackages[0].route.path, ['FIELD-A', 'SHIELD-L']);
});

test('commit is rejected before a latest visible focus preview exists', async () => {
  const { calls, stack } = createHarness();
  const committed = await stack.commit();

  assert.equal(committed.ok, false);
  assert.equal(committed.committed, false);
  assert.equal(committed.reason, 'LATEST_FOCUS_PREVIEW_REQUIRED');
  assert.equal(calls.committedPackages.length, 0);
});

test('accepted commit uses the already staged package and clears preview state', async () => {
  const { calls, stack } = createHarness();
  await stack.focus('SCISSORS');
  const expected = calls.renderedPackages[0];
  const committed = await stack.commit();

  assert.equal(committed.ok, true);
  assert.equal(committed.committed, true);
  assert.equal(calls.committedPackages.length, 1);
  assert.equal(calls.committedPackages[0], expected);
  assert.equal(calls.previewClears, 1);
  assert.equal(stack.status().previewReady, false);
});

test('explicit cancel delegates to the existing global precommit clear semantic', async () => {
  const { calls, stack } = createHarness();
  await stack.focus('PAPER');
  const cancelled = await stack.cancel();

  assert.equal(cancelled.ok, true);
  assert.equal(cancelled.cleared, true);
  assert.equal(calls.globalClears, 1);
  assert.equal(calls.previewClears, 1);
  assert.equal(stack.status().phase, 'IDLE');
});

test('rejected transport keeps the staged visible preview available for retry or cancel', async () => {
  const { calls, stack } = createHarness({ commitAccepted: false });
  await stack.focus('ROCK');
  const committed = await stack.commit();

  assert.equal(committed.ok, false);
  assert.equal(committed.committed, false);
  assert.equal(committed.reason, 'TRANSPORT_REJECTED');
  assert.equal(calls.previewClears, 0);
  assert.equal(stack.status().phase, 'READY');
  assert.equal(stack.status().previewReady, true);
});

test('unrenderable preview fails closed and the stack exposes no bridge bypass or rule authority', async () => {
  const { calls, stack } = createHarness({ previewActive: false });
  const focused = await stack.focus('ROCK');

  assert.equal(focused.ok, false);
  assert.equal(focused.staged, false);
  assert.equal(calls.localClears >= 1, true);
  assert.equal(stack.status().previewReady, false);
  assert.equal('liveBridge' in stack, false);
  assert.equal('commitCompoundAttack' in stack, false);
  assert.equal(BATTLE_JANKEN_COMPOUND_LIVE_INPUT_STACK_CONTRACT.authority, 'NONE');
  assert.equal(BATTLE_JANKEN_COMPOUND_LIVE_INPUT_STACK_CONTRACT.publicBridgeBypass, false);
  assert.equal(BATTLE_JANKEN_COMPOUND_LIVE_INPUT_STACK_CONTRACT.computesTarget, false);
  assert.equal(BATTLE_JANKEN_COMPOUND_LIVE_INPUT_STACK_CONTRACT.computesLegality, false);
  assert.equal(BATTLE_JANKEN_COMPOUND_LIVE_INPUT_STACK_CONTRACT.computesRoute, false);
  assert.equal(BATTLE_JANKEN_COMPOUND_LIVE_INPUT_STACK_CONTRACT.computesShield, false);
  assert.equal(BATTLE_JANKEN_COMPOUND_LIVE_INPUT_STACK_CONTRACT.computesHandAssignment, false);
  assert.equal(BATTLE_JANKEN_COMPOUND_LIVE_INPUT_STACK_CONTRACT.gameStateWrite, false);
});
