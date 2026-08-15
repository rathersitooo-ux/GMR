import test from 'node:test';
import assert from 'node:assert/strict';
import { createObservabilityQueue } from '../browser/observability-core.mjs';
import { createBrowserObservabilityAdapter } from '../browser/observability-browser-adapter.mjs';

class FakeEventTarget {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(handler);
  }
  removeEventListener(type, handler) {
    this.listeners.get(type)?.delete(handler);
  }
  emit(type, event) {
    for (const handler of this.listeners.get(type) ?? []) handler(event);
  }
  count(type) { return this.listeners.get(type)?.size ?? 0; }
}

function makeAdapter(overrides = {}) {
  const eventTarget = overrides.eventTarget ?? new FakeEventTarget();
  const queue = overrides.queue ?? createObservabilityQueue();
  const adapter = createBrowserObservabilityAdapter({
    eventTarget,
    queue,
    contextProvider: overrides.contextProvider ?? (() => ({ releaseId: 'r4', media: 'unity', surface: 'battle', matchId: 'm4', privateCard: 'SECRET' })),
    now: overrides.now ?? (() => 100)
  });
  return { eventTarget, queue, adapter };
}

test('start is idempotent and stop removes exactly owned listeners', () => {
  const { eventTarget, adapter } = makeAdapter();
  assert.deepEqual(adapter.start(), { ok: true, changed: true, reason: 'STARTED' });
  assert.deepEqual(adapter.start(), { ok: true, changed: false, reason: 'ALREADY_STARTED' });
  assert.equal(eventTarget.count('error'), 1);
  assert.equal(eventTarget.count('unhandledrejection'), 1);
  assert.deepEqual(adapter.stop(), { ok: true, changed: true, reason: 'STOPPED' });
  assert.deepEqual(adapter.stop(), { ok: true, changed: false, reason: 'ALREADY_STOPPED' });
  assert.equal(eventTarget.count('error'), 0);
  assert.equal(eventTarget.count('unhandledrejection'), 0);
});

test('error capture forces browser media and never persists raw message stack or private context', () => {
  const { eventTarget, adapter } = makeAdapter();
  adapter.start();
  const error = new TypeError('Bearer secret person@example.com');
  error.stack = 'token=raw private stack';
  eventTarget.emit('error', { message: 'raw browser event text', error, privatePayload: 'SECRET_EVENT' });
  const text = JSON.stringify(adapter.snapshot());
  const envelope = adapter.snapshot()[0].envelope;
  assert.equal(envelope.context.media, 'browser');
  assert.equal(envelope.context.releaseId, 'r4');
  assert.equal(envelope.context.surface, 'battle');
  assert.equal(envelope.context.matchId, 'm4');
  assert.deepEqual(envelope.diagnostic, { errorName: 'TypeError', faultCode: 'BROWSER_ERROR' });
  for (const secret of ['Bearer secret', 'person@example.com', 'token=raw', 'raw browser event text', 'SECRET_EVENT', 'SECRET']) {
    assert.equal(text.includes(secret), false, secret);
  }
});

test('primitive rejection reason is replaced with fixed safe name', () => {
  const { eventTarget, adapter } = makeAdapter();
  adapter.start();
  eventTarget.emit('unhandledrejection', { reason: 'raw rejection token=private' });
  const text = JSON.stringify(adapter.snapshot());
  const envelope = adapter.snapshot()[0].envelope;
  assert.deepEqual(envelope.diagnostic, { errorName: 'UnhandledRejection', faultCode: 'BROWSER_UNHANDLED_REJECTION' });
  assert.equal(text.includes('raw rejection token=private'), false);
});

test('object rejection retains only safe name and never touches hostile message or stack', () => {
  const { eventTarget, adapter } = makeAdapter();
  let touched = 0;
  const reason = { name: 'RangeError' };
  Object.defineProperty(reason, 'message', { get() { touched += 1; throw new Error('message getter'); } });
  Object.defineProperty(reason, 'stack', { get() { touched += 1; throw new Error('stack getter'); } });
  adapter.start();
  eventTarget.emit('unhandledrejection', { reason });
  assert.equal(touched, 0);
  assert.deepEqual(adapter.snapshot()[0].envelope.diagnostic, { errorName: 'RangeError', faultCode: 'BROWSER_UNHANDLED_REJECTION' });
});

test('context provider failure degrades safely while retaining browser media', () => {
  const { eventTarget, adapter } = makeAdapter({ contextProvider: () => { throw new Error('context unavailable'); } });
  adapter.start();
  assert.doesNotThrow(() => eventTarget.emit('error', { error: new Error('ignored') }));
  assert.deepEqual(adapter.snapshot()[0].envelope.context, {
    releaseId: 'unknown', media: 'browser', surface: 'unknown', matchId: 'unknown'
  });
});

test('performance capture requires caller values and only records strict threshold exceedance', () => {
  const { adapter } = makeAdapter();
  assert.deepEqual(adapter.reportPerformance(), { accepted: false, reason: 'INVALID_METRIC' });
  assert.deepEqual(adapter.reportPerformance({ name: 'frameMs', observed: '17', threshold: 16 }), { accepted: false, reason: 'INVALID_METRIC' });
  assert.deepEqual(adapter.reportPerformance({ name: 'frameMs', observed: 16, threshold: 16 }), { accepted: false, reason: 'WITHIN_THRESHOLD' });
  assert.equal(adapter.snapshot().length, 0);
  const result = adapter.reportPerformance({ name: 'frameMs', observed: 17, threshold: 16 });
  assert.equal(result.accepted, true);
  const envelope = adapter.snapshot()[0].envelope;
  assert.equal(envelope.kind, 'performance');
  assert.deepEqual(envelope.metric, { name: 'frameMs', observed: 17, threshold: 16 });
  assert.equal(envelope.context.media, 'browser');
  assert.equal(envelope.diagnostic.faultCode, 'BROWSER_PERFORMANCE_THRESHOLD');
});

test('now provider failure does not throw and falls back to zero timestamp', () => {
  const { eventTarget, adapter } = makeAdapter({ now: () => { throw new Error('clock failed'); } });
  adapter.start();
  assert.doesNotThrow(() => eventTarget.emit('error', { error: new Error('ignored') }));
  assert.equal(adapter.snapshot()[0].envelope.occurredAtMs, 0);
});

test('flush sender failure never throws and retains sanitized queue', async () => {
  const { eventTarget, adapter } = makeAdapter();
  adapter.start();
  eventTarget.emit('error', { error: new Error('private raw detail') });
  const result = await adapter.flush(async () => { throw new Error('offline'); });
  assert.deepEqual(result, { ok: false, sent: 0, remaining: 1, reason: 'SEND_FAILED' });
  assert.equal(adapter.snapshot().length, 1);
  assert.equal(JSON.stringify(adapter.snapshot()).includes('private raw detail'), false);
});

test('missing event target and hostile queue methods fail closed without throwing', async () => {
  const adapter = createBrowserObservabilityAdapter({
    eventTarget: null,
    queue: {
      capture() { throw new Error('capture'); },
      snapshot() { throw new Error('snapshot'); },
      flush() { throw new Error('flush'); }
    }
  });
  assert.deepEqual(adapter.start(), { ok: false, changed: false, reason: 'EVENT_TARGET_REQUIRED' });
  assert.deepEqual(adapter.snapshot(), []);
  const perf = adapter.reportPerformance({ name: 'frameMs', observed: 20, threshold: 16 });
  assert.deepEqual(perf, { accepted: false, reason: 'CAPTURE_FAILED' });
  assert.deepEqual(await adapter.flush(() => true), { ok: false, sent: 0, remaining: 0, reason: 'FLUSH_FAILED' });
});
