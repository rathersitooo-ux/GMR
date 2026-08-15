import test from 'node:test';
import assert from 'node:assert/strict';
import {createReadyPlanFeedbackAdapter} from '../browser/ui-state-feedback-ready-plan-adapter.mjs';

const CONFIG = Object.freeze({holdMs: 500, moveCancelDistance: 12, rightSwipeDistance: 40});

function make(options = {}) {
  const calls = [];
  const adapter = createReadyPlanFeedbackAdapter({
    config: CONFIG,
    commit: payload => {
      calls.push(payload);
      return `commit:${payload.token}`;
    },
    ...options,
  });
  return {adapter, calls};
}

function press(adapter, token = 'op-1') {
  adapter.pointerDown({x: 10, y: 20, atMs: 100});
  return adapter.pointerUp({token});
}

test('primary pointer release commits once and enters pending', () => {
  const {adapter, calls} = make();
  const out = press(adapter);
  assert.equal(out.committed, true);
  assert.equal(out.intent, 'primary');
  assert.equal(out.commitResult, 'commit:op-1');
  assert.equal(out.projection.feedback, 'pending');
  assert.deepEqual(calls, [{token: 'op-1', source: 'pointer', intent: 'primary'}]);
});

test('pending suppresses duplicate pointer commit', () => {
  const {adapter, calls} = make();
  press(adapter, 'op-1');
  adapter.pointerDown({x: 0, y: 0, atMs: 200});
  const out = adapter.pointerUp({token: 'op-2'});
  assert.equal(out.committed, false);
  assert.equal(out.projection.pending, true);
  assert.equal(calls.length, 1);
});

test('matching acknowledgement confirms and reset returns ready', () => {
  const {adapter} = make();
  press(adapter, 'op-1');
  assert.equal(adapter.acknowledgeConfirmed({token: 'op-1'}).projection.feedback, 'confirmed');
  assert.equal(adapter.reset().projection.feedback, 'normal');
});

test('stale acknowledgement fails closed and leaves pending intact', () => {
  const {adapter} = make();
  press(adapter, 'op-1');
  assert.throws(() => adapter.acknowledgeConfirmed({token: 'stale'}), /stale or mismatched/);
  assert.equal(adapter.projection().pending, true);
});

test('explicit failed acknowledgement exits pending as failed', () => {
  const {adapter} = make();
  press(adapter, 'op-1');
  const out = adapter.acknowledgeFailed({token: 'op-1', reason: 'server_rejected'});
  assert.equal(out.projection.feedback, 'failed');
  assert.equal(out.projection.reason, 'server_rejected');
});

test('hold becomes detail and never commits', () => {
  const {adapter, calls} = make();
  adapter.pointerDown({x: 5, y: 5, atMs: 100});
  adapter.tick({atMs: 600});
  const out = adapter.pointerUp({token: 'unused'});
  assert.equal(out.intent, 'detail');
  assert.equal(out.committed, false);
  assert.equal(calls.length, 0);
});

test('movement cancellation never commits', () => {
  const {adapter, calls} = make();
  adapter.pointerDown({x: 0, y: 0, atMs: 0});
  adapter.pointerMove({x: 0, y: 20});
  const out = adapter.pointerUp({token: 'unused'});
  assert.equal(out.intent, null);
  assert.equal(out.committed, false);
  assert.equal(calls.length, 0);
});

test('right swipe remains semantic navigation and never commits', () => {
  const {adapter, calls} = make();
  adapter.pointerDown({x: 0, y: 0, atMs: 0});
  adapter.pointerMove({x: 45, y: 2});
  const out = adapter.pointerUp({token: 'unused'});
  assert.equal(out.intent, 'swipe_right');
  assert.equal(out.committed, false);
  assert.equal(calls.length, 0);
});

test('secondary detail never commits', () => {
  const {adapter, calls} = make();
  const out = adapter.secondary();
  assert.equal(out.intent, 'detail');
  assert.equal(out.committed, false);
  assert.equal(calls.length, 0);
});

test('disabled suppresses pointer and keyboard activation until enabled', () => {
  const {adapter, calls} = make();
  adapter.syncDisabled(true, 'not_plan_phase');
  adapter.pointerDown({x: 1, y: 1, atMs: 0});
  assert.equal(adapter.pointerUp({token: 'p'}).committed, false);
  assert.equal(adapter.keyActivate({key: 'Enter', token: 'k'}).committed, false);
  assert.equal(calls.length, 0);
  adapter.syncDisabled(false, 'plan_phase');
  const out = adapter.keyActivate({key: 'Enter', token: 'k'});
  assert.equal(out.committed, true);
  assert.equal(calls.length, 1);
});

test('keyboard activation accepts Enter and Space, ignores unrelated keys', () => {
  const {adapter, calls} = make();
  assert.equal(adapter.keyActivate({key: 'Escape', token: 'x'}).committed, false);
  assert.equal(calls.length, 0);
  assert.equal(adapter.keyActivate({key: ' ', token: 'space'}).committed, true);
  assert.equal(calls[0].source, 'keyboard');
});

test('primary activation without caller token rejects before commit', () => {
  const {adapter, calls} = make();
  adapter.pointerDown({x: 0, y: 0, atMs: 0});
  assert.throws(() => adapter.pointerUp({}), /token must be a non-empty string/);
  assert.equal(calls.length, 0);
  assert.equal(adapter.projection().pending, false);
});

test('commit callback failure leaves pending and blocks duplicate activation', () => {
  let calls = 0;
  const adapter = createReadyPlanFeedbackAdapter({
    config: CONFIG,
    commit() { calls += 1; throw new Error('transport-down'); },
  });
  assert.throws(() => adapter.keyActivate({key: 'Enter', token: 'op'}), /transport-down/);
  assert.equal(adapter.projection().pending, true);
  assert.equal(adapter.keyActivate({key: 'Enter', token: 'op-2'}).committed, false);
  assert.equal(calls, 1);
});

test('reduced motion and low performance project semantic motion without changing inputs', () => {
  const config = {holdMs: 321, moveCancelDistance: 7, rightSwipeDistance: 33};
  const before = structuredClone(config);
  const reduced = createReadyPlanFeedbackAdapter({config, commit() {}, reducedMotion: true});
  const low = createReadyPlanFeedbackAdapter({config, commit() {}, lowPerf: true});
  assert.equal(reduced.projection().motion, 'none');
  assert.equal(low.projection().motion, 'reduced');
  assert.deepEqual(config, before);
});
