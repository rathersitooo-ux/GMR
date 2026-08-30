import assert from 'node:assert/strict';
import test from 'node:test';

import { createDailyTourRuntimeMount } from '../browser/daily-tour-runtime-mount.mjs';

function planOptions(overrides = {}) {
  return {
    dayKey: '2026-08-31',
    stops: [
      { id: 'brain_training' },
      { id: 'fossil' },
      { id: 'unregistered_mode' },
    ],
    registeredStopIds: ['fossil', 'brain_training'],
    recommendationOrder: ['brain_training'],
    includeBattleFinale: true,
    ...overrides,
  };
}

test('mount preserves current plan order and refuses out-of-order return', async () => {
  const navigated = [];
  const mount = createDailyTourRuntimeMount({
    planOptions: planOptions(),
    navigateToStop: async (stop) => {
      navigated.push(stop);
      return { ok: true };
    },
  });

  const started = await mount.start();
  assert.equal(started.ok, true);
  assert.deepEqual(navigated, [{ id: 'brain_training', type: 'daily_stop' }]);

  const wrongReturn = await mount.completeCurrent('fossil');
  assert.equal(wrongReturn.ok, false);
  assert.equal(wrongReturn.reason, 'unexpected_stop');
  assert.equal(wrongReturn.state.summary.completedStopCount, 0);
  assert.equal(wrongReturn.state.next.id, 'brain_training');
  assert.equal(navigated.length, 1);

  const brainReturn = await mount.completeCurrent('brain_training');
  assert.equal(brainReturn.ok, true);
  assert.equal(brainReturn.progressApplied, true);
  assert.equal(brainReturn.state.summary.completedStopCount, 1);
  assert.deepEqual(navigated.at(-1), { id: 'fossil', type: 'daily_stop' });

  const fossilSkip = await mount.skipCurrent('fossil');
  assert.equal(fossilSkip.ok, true);
  assert.equal(fossilSkip.state.summary.skippedStopCount, 1);
  assert.equal(fossilSkip.state.summary.hasDebt, false);
  assert.deepEqual(navigated.at(-1), { id: 'battle', type: 'battle_finale' });

  const battleReturn = await mount.completeCurrent('battle');
  assert.equal(battleReturn.ok, true);
  assert.equal(battleReturn.reason, 'tour_settled');
  assert.equal(battleReturn.state.summary.battleCompleted, true);
  assert.equal(battleReturn.state.summary.tourSettled, true);
  assert.equal(navigated.length, 3);
});

test('rejected navigation never advances the pending stop', async () => {
  let attempts = 0;
  const mount = createDailyTourRuntimeMount({
    planOptions: planOptions({ includeBattleFinale: false }),
    navigateToStop: async () => {
      attempts += 1;
      return attempts === 1 ? { ok: false, reason: 'screen_rejected' } : { ok: true };
    },
  });

  const rejected = await mount.start();
  assert.equal(rejected.ok, false);
  assert.equal(rejected.reason, 'navigation_rejected');
  assert.equal(rejected.state.summary.completedStopCount, 0);
  assert.equal(rejected.state.next.id, 'brain_training');

  const retry = await mount.navigateNext();
  assert.equal(retry.ok, true);
  assert.equal(retry.state.next.id, 'brain_training');
  assert.equal(attempts, 2);
});

test('completed progress is retained when navigation to the next stop is rejected', async () => {
  let attempts = 0;
  const mount = createDailyTourRuntimeMount({
    planOptions: planOptions({ includeBattleFinale: false }),
    navigateToStop: async () => {
      attempts += 1;
      return attempts === 2 ? false : { ok: true };
    },
  });

  await mount.start();
  const rejectedNext = await mount.completeCurrent('brain_training');
  assert.equal(rejectedNext.ok, false);
  assert.equal(rejectedNext.reason, 'navigation_rejected');
  assert.equal(rejectedNext.progressApplied, true);
  assert.equal(rejectedNext.state.summary.completedStopCount, 1);
  assert.equal(rejectedNext.state.next.id, 'fossil');

  const retry = await mount.navigateNext('retry_after_rejection');
  assert.equal(retry.ok, true);
  assert.equal(retry.state.next.id, 'fossil');
});

test('interrupt and resume preserve the exact pending stop', async () => {
  const navigated = [];
  const mount = createDailyTourRuntimeMount({
    planOptions: planOptions({ includeBattleFinale: false }),
    navigateToStop: async (stop, context) => {
      navigated.push({ stop, reason: context.reason });
      return { ok: true };
    },
  });

  const interrupted = mount.interrupt();
  assert.equal(interrupted.ok, true);
  assert.equal(interrupted.state.summary.interrupted, true);
  assert.equal(interrupted.state.next, null);

  const blocked = await mount.navigateNext();
  assert.equal(blocked.ok, false);
  assert.equal(blocked.reason, 'tour_interrupted');
  assert.equal(navigated.length, 0);

  const resumed = await mount.resume();
  assert.equal(resumed.ok, true);
  assert.equal(resumed.state.summary.interrupted, false);
  assert.equal(resumed.state.next.id, 'brain_training');
  assert.deepEqual(navigated, [{
    stop: { id: 'brain_training', type: 'daily_stop' },
    reason: 'daily_tour_resume',
  }]);
});

test('navigation exceptions fail closed and remain retryable', async () => {
  let shouldThrow = true;
  const mount = createDailyTourRuntimeMount({
    planOptions: planOptions({ includeBattleFinale: false }),
    navigateToStop: async () => {
      if (shouldThrow) throw new Error('navigation unavailable');
      return { ok: true };
    },
  });

  const failed = await mount.start();
  assert.equal(failed.ok, false);
  assert.equal(failed.reason, 'navigation_failed');
  assert.equal(failed.error, 'navigation unavailable');
  assert.equal(failed.state.next.id, 'brain_training');

  shouldThrow = false;
  const retried = await mount.navigateNext();
  assert.equal(retried.ok, true);
});
