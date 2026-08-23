import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SCREEN_TRANSITION_EVENT,
  SCREEN_TRANSITION_MODE,
  SCREEN_TRANSITION_PHASE,
  SCREEN_TRANSITION_REJECTION,
  advanceScreenTransition,
  beginScreenTransition,
  cancelScreenTransition,
  createScreenTransitionRuntimeBridge,
  createScreenTransitionState,
  resolveScreenTransitionMotionProfile,
  setScreenTransitionMode
} from '../browser/screen-transition-core.mjs';

test('motion profiles keep normal, reduced, and low-perf semantics distinct without fixed durations', () => {
  const normal = resolveScreenTransitionMotionProfile(SCREEN_TRANSITION_MODE.NORMAL, 'important');
  const reduced = resolveScreenTransitionMotionProfile(SCREEN_TRANSITION_MODE.REDUCED, 'result');
  const lowPerf = resolveScreenTransitionMotionProfile(SCREEN_TRANSITION_MODE.LOW_PERF, 'result');

  assert.equal(normal.movement, 'short-axis');
  assert.equal(normal.scale, 'arrival-emphasis');
  assert.equal(normal.arrivalEmphasis, 'standard');
  assert.equal(reduced.movement, 'none');
  assert.equal(reduced.opacity, 'crossfade');
  assert.equal(reduced.arrivalEmphasis, 'none');
  assert.equal(lowPerf.movement, 'none');
  assert.equal(lowPerf.opacity, 'instant');
  assert.equal('durationMs' in normal, false);
});

test('begin owns input with a new generation and exposes superseded generation', () => {
  const initial = createScreenTransitionState('home');
  const first = beginScreenTransition(initial, { to: 'cards' });
  const second = beginScreenTransition(first.state, { to: 'shop' });

  assert.equal(first.accepted, true);
  assert.equal(first.generation, 1);
  assert.equal(first.inputOwner, 'screen-transition:1');
  assert.equal(first.state.active.phase, SCREEN_TRANSITION_PHASE.PREPARE);
  assert.equal(second.accepted, true);
  assert.equal(second.generation, 2);
  assert.equal(second.supersededGeneration, 1);
  assert.equal(second.state.active.from, 'home');
  assert.equal(second.state.active.to, 'shop');
});

test('events from a superseded generation are ignored', () => {
  const first = beginScreenTransition(createScreenTransitionState('home'), { to: 'cards' });
  const second = beginScreenTransition(first.state, { to: 'shop' });
  const stale = advanceScreenTransition(second.state, first.generation, SCREEN_TRANSITION_EVENT.PREPARED);

  assert.equal(stale.applied, false);
  assert.equal(stale.reason, SCREEN_TRANSITION_REJECTION.STALE_GENERATION);
  assert.equal(stale.state.active.generation, second.generation);
  assert.equal(stale.state.active.to, 'shop');
});

test('the phase sequence swaps the visible screen before committing it at settle', () => {
  let result = beginScreenTransition(createScreenTransitionState('home'), { to: 'cards' });
  const generation = result.generation;

  result = advanceScreenTransition(result.state, generation, SCREEN_TRANSITION_EVENT.PREPARED);
  assert.equal(result.state.active.phase, SCREEN_TRANSITION_PHASE.EXIT);
  assert.equal(result.state.visibleScreen, 'home');

  result = advanceScreenTransition(result.state, generation, SCREEN_TRANSITION_EVENT.SWAPPED);
  assert.equal(result.state.active.phase, SCREEN_TRANSITION_PHASE.ENTER);
  assert.equal(result.state.visibleScreen, 'cards');
  assert.equal(result.state.currentScreen, 'home');

  result = advanceScreenTransition(result.state, generation, SCREEN_TRANSITION_EVENT.ENTERED);
  assert.equal(result.state.active.phase, SCREEN_TRANSITION_PHASE.SETTLE);

  result = advanceScreenTransition(result.state, generation, SCREEN_TRANSITION_EVENT.SETTLED);
  assert.equal(result.completed, true);
  assert.equal(result.state.currentScreen, 'cards');
  assert.equal(result.state.visibleScreen, 'cards');
  assert.equal(result.state.active, null);
  assert.equal(result.blocksInput, false);
});

test('cancel before swap keeps the previous screen committed', () => {
  const started = beginScreenTransition(createScreenTransitionState('home'), { to: 'cards' });
  const cancelled = cancelScreenTransition(started.state, started.generation, 'back');

  assert.equal(cancelled.cancelled, true);
  assert.equal(cancelled.committedVisibleScreen, false);
  assert.equal(cancelled.state.currentScreen, 'home');
  assert.equal(cancelled.state.visibleScreen, 'home');
  assert.equal(cancelled.state.active, null);
});

test('cancel after swap commits the already-visible screen instead of reverting stale content', () => {
  let started = beginScreenTransition(createScreenTransitionState('home'), { to: 'cards' });
  started = advanceScreenTransition(started.state, started.generation, SCREEN_TRANSITION_EVENT.PREPARED);
  started = advanceScreenTransition(started.state, 1, SCREEN_TRANSITION_EVENT.SWAPPED);
  const cancelled = cancelScreenTransition(started.state, 1, 'interrupted');

  assert.equal(cancelled.cancelled, true);
  assert.equal(cancelled.committedVisibleScreen, true);
  assert.equal(cancelled.state.currentScreen, 'cards');
  assert.equal(cancelled.state.visibleScreen, 'cards');
});

test('skip-to-end gives repeated input a deterministic fast finish', () => {
  const started = beginScreenTransition(createScreenTransitionState('home'), { to: 'shop', importance: 'important' });
  const skipped = advanceScreenTransition(started.state, started.generation, SCREEN_TRANSITION_EVENT.SKIP_TO_END);

  assert.equal(skipped.applied, true);
  assert.equal(skipped.skipped, true);
  assert.equal(skipped.completed, true);
  assert.equal(skipped.state.currentScreen, 'shop');
  assert.equal(skipped.state.visibleScreen, 'shop');
  assert.equal(skipped.state.active, null);
});

test('changing motion mode affects the next transition but does not rewrite an active transition', () => {
  const started = beginScreenTransition(createScreenTransitionState('home'), { to: 'cards' });
  const changed = setScreenTransitionMode(started.state, SCREEN_TRANSITION_MODE.REDUCED);

  assert.equal(changed.mode, SCREEN_TRANSITION_MODE.REDUCED);
  assert.equal(changed.active.motion.mode, SCREEN_TRANSITION_MODE.NORMAL);

  const replaced = beginScreenTransition(changed, { to: 'shop' });
  assert.equal(replaced.motion.mode, SCREEN_TRANSITION_MODE.REDUCED);
  assert.equal(replaced.motion.movement, 'none');
});

test('invalid phase events and same-screen requests are safe no-ops', () => {
  const initial = createScreenTransitionState('home');
  const same = beginScreenTransition(initial, { to: 'home' });
  assert.equal(same.accepted, false);
  assert.equal(same.reason, SCREEN_TRANSITION_REJECTION.VISIBLE_SCREEN);

  const started = beginScreenTransition(initial, { to: 'cards' });
  const invalid = advanceScreenTransition(started.state, started.generation, SCREEN_TRANSITION_EVENT.SWAPPED);
  assert.equal(invalid.applied, false);
  assert.equal(invalid.reason, SCREEN_TRANSITION_REJECTION.INVALID_EVENT_FOR_PHASE);
});

test('runtime bridge preserves generation ownership and input-blocking snapshot', () => {
  const runtime = createScreenTransitionRuntimeBridge({ initialScreen: 'home' });
  const started = runtime.begin({ to: 'cards' });

  assert.equal(runtime.snapshot().blocksInput, true);
  assert.equal(runtime.snapshot().inputOwner, `screen-transition:${started.generation}`);

  runtime.advance(started.generation, SCREEN_TRANSITION_EVENT.SKIP_TO_END);
  assert.equal(runtime.snapshot().blocksInput, false);
  assert.equal(runtime.snapshot().currentScreen, 'cards');
});
