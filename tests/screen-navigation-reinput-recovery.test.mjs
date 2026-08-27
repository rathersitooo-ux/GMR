import test from 'node:test';
import assert from 'node:assert/strict';
import {createScreenTransitionRuntimeAdapter} from '../browser/screen-navigation-core.mjs';

const deferred = () => {
  let resolve;
  const promise = new Promise((res) => { resolve = res; });
  return {promise, resolve};
};

const turn = () => new Promise((resolve) => setImmediate(resolve));

test('repeated same destination before SWAP skips presentation and lands on the destination once', async () => {
  let screen = 'home';
  const swaps = [];
  const gate = deferred();
  const runtime = createScreenTransitionRuntimeAdapter({
    getCurrentScreen: () => screen,
    applyScreen: (next) => { swaps.push(next); screen = next; },
    runVisualPhase: async (phase, context) => {
      if (context.to === 'cards' && phase === 'EXIT') await gate.promise;
    }
  });

  const first = runtime.navigate('cards');
  await turn();
  assert.equal(runtime.getState().phase, 'EXIT');

  const secondPromise = runtime.navigate('cards');
  const raced = await Promise.race([
    secondPromise.then((result) => ({done: true, result})),
    turn().then(() => ({done: false, result: null}))
  ]);

  gate.resolve();
  const secondResult = await secondPromise;
  const firstResult = await first;

  assert.equal(raced.done, true, 'repeat activation must not replay or wait for the in-flight presentation');
  assert.equal(secondResult.status, 'completed');
  assert.equal(secondResult.swapped, true);
  assert.equal(secondResult.skippedPresentation, true);
  assert.equal(firstResult.status, 'superseded');
  assert.equal(firstResult.swapped, false);
  assert.equal(screen, 'cards');
  assert.deepEqual(swaps, ['cards']);
  assert.equal(runtime.getState().phase, 'IDLE');
  assert.equal(runtime.getState().activeRevision, null);
});
