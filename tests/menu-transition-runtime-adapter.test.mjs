import test from 'node:test';
import assert from 'node:assert/strict';
import {TRANSITION_PHASES} from '../browser/ui-state-feedback-core.mjs';
import {createMenuTransitionRuntimeAdapter} from '../browser/menu-transition-runtime-adapter.mjs';

const deferred = () => {
  let resolve;
  const promise = new Promise((res) => { resolve = res; });
  return {promise, resolve};
};
const turn = () => new Promise((resolve) => setImmediate(resolve));

test('navigation delegates presentation phases and swaps semantic screen exactly once', async () => {
  let screen = 'home';
  let swaps = 0;
  const phases = [];
  const runtime = createMenuTransitionRuntimeAdapter({
    getCurrentScreen: () => screen,
    applyScreen: (next) => { swaps += 1; screen = next; },
    runVisualPhase: async (phase, context) => phases.push([phase, context.from, context.to, context.motionProfile]),
  });

  const result = await runtime.navigate('cards');
  assert.equal(result.status, 'completed');
  assert.equal(result.swapped, true);
  assert.equal(swaps, 1);
  assert.equal(screen, 'cards');
  assert.deepEqual(phases.map(([phase]) => phase), [
    TRANSITION_PHASES.PREPARE,
    TRANSITION_PHASES.EXIT,
    TRANSITION_PHASES.SWAP,
    TRANSITION_PHASES.ENTER,
    TRANSITION_PHASES.SETTLE,
  ]);
  assert.ok(phases.every(([, from, to, profile]) => from === 'home' && to === 'cards' && profile === 'normal'));
});

test('same-screen request is ignored without visual phases or state mutation', async () => {
  let phases = 0;
  let swaps = 0;
  const runtime = createMenuTransitionRuntimeAdapter({
    getCurrentScreen: () => 'home',
    applyScreen: () => { swaps += 1; },
    runVisualPhase: async () => { phases += 1; },
  });

  const result = await runtime.navigate('home');
  assert.equal(result.status, 'ignored');
  assert.equal(result.swapped, false);
  assert.equal(phases, 0);
  assert.equal(swaps, 0);
});

test('rapid A to B supersedes stale pre-swap transition and cannot roll back current screen', async () => {
  let screen = 'home';
  const swaps = [];
  const gate = deferred();
  const runtime = createMenuTransitionRuntimeAdapter({
    getCurrentScreen: () => screen,
    applyScreen: (next) => { swaps.push(next); screen = next; },
    runVisualPhase: async (phase, context) => {
      if (context.to === 'cards' && phase === TRANSITION_PHASES.EXIT) await gate.promise;
    },
  });

  const first = runtime.navigate('cards');
  await turn();
  assert.equal(runtime.getState().phase, TRANSITION_PHASES.EXIT);
  const second = runtime.navigate('shop');
  const secondResult = await second;
  assert.equal(secondResult.status, 'completed');
  assert.equal(screen, 'shop');
  assert.deepEqual(swaps, ['shop']);

  gate.resolve();
  const firstResult = await first;
  assert.equal(firstResult.status, 'superseded');
  assert.equal(firstResult.swapped, false);
  assert.equal(screen, 'shop');
  assert.deepEqual(swaps, ['shop']);
});

test('reduced-motion and low-perf profile changes effects only, not semantic phase lifecycle', async () => {
  let screen = 'home';
  const profiles = [];
  const phases = [];
  let reduce = true;
  let low = true;
  const runtime = createMenuTransitionRuntimeAdapter({
    getCurrentScreen: () => screen,
    applyScreen: (next) => { screen = next; },
    reducedMotion: () => reduce,
    lowPerf: () => low,
    runVisualPhase: async (phase, context) => { phases.push(phase); profiles.push(context.motionProfile); },
  });

  assert.equal((await runtime.navigate('cards')).status, 'completed');
  assert.deepEqual(phases, ['PREPARE', 'EXIT', 'SWAP', 'ENTER', 'SETTLE']);
  assert.ok(profiles.every((profile) => profile === 'none'));

  phases.length = 0;
  profiles.length = 0;
  reduce = false;
  assert.equal((await runtime.navigate('home')).status, 'completed');
  assert.deepEqual(phases, ['PREPARE', 'EXIT', 'SWAP', 'ENTER', 'SETTLE']);
  assert.ok(profiles.every((profile) => profile === 'reduced'));
});

test('back resolves through current navigation fallback and commits once', async () => {
  let screen = 'missions';
  let swaps = 0;
  const runtime = createMenuTransitionRuntimeAdapter({
    getCurrentScreen: () => screen,
    applyScreen: (next) => { swaps += 1; screen = next; },
  });

  const result = await runtime.back(null);
  assert.equal(result.status, 'completed');
  assert.equal(screen, 'home');
  assert.equal(swaps, 1);
});

test('async screen mutation fails closed at SWAP instead of letting animation own delayed state', async () => {
  let screen = 'home';
  const runtime = createMenuTransitionRuntimeAdapter({
    getCurrentScreen: () => screen,
    applyScreen: async (next) => { screen = next; },
  });

  const result = await runtime.navigate('cards');
  assert.equal(result.status, 'failed');
  assert.equal(result.phase, TRANSITION_PHASES.SWAP);
  assert.match(result.message, /applyScreen must be synchronous/);
});
