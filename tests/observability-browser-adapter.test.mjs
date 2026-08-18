import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createObservabilityQueue } from '../browser/observability-core.mjs';
import {
  createBrowserObservabilityAdapter,
  createBrowserObservabilityHttpSender
} from '../browser/observability-browser-adapter.mjs';

const lineage = {
  releaseVersion: 'release-v4',
  rulesVersion: 'rules-v3',
  contentVersion: 'content-v8',
  cardVersion: 'cards-v5',
  stateVersion: 'state-v2',
  cohortId: 'cohort-browser-a'
};

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
    contextProvider: overrides.contextProvider ?? (() => ({
      releaseId: 'r4',
      media: 'unity',
      surface: 'battle',
      matchId: 'm4',
      ...lineage,
      privateCard: 'SECRET',
      userId: 'RAW_USER_123'
    })),
    now: overrides.now ?? (() => 100)
  });
  return { eventTarget, queue, adapter };
}

async function withHttpServer(handler, run) {
  const server = createServer(handler);
  await new Promise((resolve, reject) => {
    const onError = (error) => reject(error);
    server.once('error', onError);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', onError);
      resolve();
    });
  });
  const address = server.address();
  try {
    return await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
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

test('error capture forces browser media, preserves caller lineage, and drops raw private context', () => {
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
  for (const [key, value] of Object.entries(lineage)) assert.equal(envelope.context[key], value, key);
  assert.deepEqual(envelope.diagnostic, { errorName: 'TypeError', faultCode: 'BROWSER_ERROR' });
  for (const secret of [
    'Bearer secret', 'person@example.com', 'token=raw', 'raw browser event text',
    'SECRET_EVENT', 'SECRET', 'RAW_USER_123'
  ]) {
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

test('context provider failure degrades safely while retaining browser media and explicit unknown lineage', () => {
  const { eventTarget, adapter } = makeAdapter({ contextProvider: () => { throw new Error('context unavailable'); } });
  adapter.start();
  assert.doesNotThrow(() => eventTarget.emit('error', { error: new Error('ignored') }));
  assert.deepEqual(adapter.snapshot()[0].envelope.context, {
    releaseId: 'unknown',
    media: 'browser',
    surface: 'unknown',
    matchId: 'unknown',
    releaseVersion: null,
    rulesVersion: null,
    contentVersion: null,
    cardVersion: null,
    stateVersion: null,
    cohortId: null
  });
});

test('invalid caller lineage is nulled instead of invented or copied as raw free text', () => {
  const { eventTarget, adapter } = makeAdapter({
    contextProvider: () => ({
      releaseId: 'r4',
      surface: 'battle',
      matchId: 'm4',
      releaseVersion: 'release version has spaces',
      rulesVersion: 'rules-v3',
      contentVersion: 'content-v8',
      cardVersion: 'cards-v5',
      stateVersion: 'state-v2',
      cohortId: 'cohort-a',
      userId: 'RAW_USER_123'
    })
  });
  adapter.start();
  eventTarget.emit('error', { error: new Error('ignored') });
  const envelope = adapter.snapshot()[0].envelope;
  assert.equal(envelope.context.releaseVersion, null);
  assert.equal(envelope.context.rulesVersion, 'rules-v3');
  assert.equal(JSON.stringify(envelope).includes('release version has spaces'), false);
  assert.equal(JSON.stringify(envelope).includes('RAW_USER_123'), false);
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
  assert.equal(envelope.context.rulesVersion, lineage.rulesVersion);
  assert.equal(envelope.context.cohortId, lineage.cohortId);
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

test('HTTP sender performs a real local POST with only the validated safe batch', async () => {
  let received = null;
  await withHttpServer((request, response) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      received = {
        method: request.method,
        url: request.url,
        contentType: request.headers['content-type'],
        body
      };
      response.writeHead(204);
      response.end();
    });
  }, async (origin) => {
    const { eventTarget, adapter } = makeAdapter();
    adapter.start();
    const error = new TypeError('Bearer RAW_TOKEN person@example.com');
    error.stack = 'api_key=RAW_KEY private stack';
    eventTarget.emit('error', { message: 'PRIVATE_EVENT_TEXT', error, privatePayload: 'PRIVATE_PAYLOAD' });

    const sender = createBrowserObservabilityHttpSender({ endpoint: `${origin}/observability` });
    const result = await adapter.flush(sender);
    assert.deepEqual(result, { ok: true, sent: 1, remaining: 0, reason: 'OK' });
  });

  assert.equal(received.method, 'POST');
  assert.equal(received.url, '/observability');
  assert.match(received.contentType, /^application\/json(?:;|$)/i);
  const batch = JSON.parse(received.body);
  assert.equal(batch.length, 1);
  assert.deepEqual(Object.keys(batch[0]).sort(), ['count', 'envelope', 'firstSeenAtMs', 'lastSeenAtMs']);
  assert.deepEqual(batch[0].envelope.diagnostic, { errorName: 'TypeError', faultCode: 'BROWSER_ERROR' });
  for (const [key, value] of Object.entries(lineage)) assert.equal(batch[0].envelope.context[key], value, key);
  for (const secret of ['RAW_TOKEN', 'person@example.com', 'RAW_KEY', 'PRIVATE_EVENT_TEXT', 'PRIVATE_PAYLOAD', 'RAW_USER_123']) {
    assert.equal(received.body.includes(secret), false, secret);
  }
});

test('HTTP sender keeps the queue when the server returns non-2xx', async () => {
  await withHttpServer((request, response) => {
    request.resume();
    response.writeHead(503);
    response.end('unavailable');
  }, async (origin) => {
    const { eventTarget, adapter } = makeAdapter();
    adapter.start();
    eventTarget.emit('error', { error: new Error('private') });
    const sender = createBrowserObservabilityHttpSender({ endpoint: `${origin}/observability` });
    const result = await adapter.flush(sender);
    assert.deepEqual(result, { ok: false, sent: 0, remaining: 1, reason: 'SEND_REJECTED' });
    assert.equal(adapter.snapshot().length, 1);
  });
});

test('HTTP sender rejects malformed batches before network I/O', async () => {
  let calls = 0;
  const sender = createBrowserObservabilityHttpSender({
    endpoint: 'https://collector.example.test/observability',
    fetchImpl: async () => {
      calls += 1;
      return { ok: true };
    }
  });
  const result = await sender([{ rawMessage: 'Bearer NEVER_SEND_THIS' }]);
  assert.equal(result, false);
  assert.equal(calls, 0);
});

test('HTTP sender omits ambient credentials and rejects credential-bearing endpoint URLs', async () => {
  const queue = createObservabilityQueue();
  queue.capture({
    faultCode: 'NETWORK_FAILURE',
    context: { releaseId: 'r1', media: 'browser', surface: 'battle', matchId: 'm1', ...lineage }
  }, 10);
  let request = null;
  const sender = createBrowserObservabilityHttpSender({
    endpoint: 'https://collector.example.test/observability',
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true };
    }
  });
  assert.deepEqual(await queue.flush(sender), { ok: true, sent: 1, remaining: 0, reason: 'OK' });
  assert.equal(request.url, 'https://collector.example.test/observability');
  assert.equal(request.options.method, 'POST');
  assert.deepEqual(request.options.headers, { 'content-type': 'application/json' });
  assert.equal(request.options.credentials, 'omit');
  assert.equal(request.options.redirect, 'error');
  assert.equal(request.options.referrerPolicy, 'no-referrer');
  assert.equal(request.options.cache, 'no-store');
  assert.equal('authorization' in request.options.headers, false);

  let rejectedCalls = 0;
  const invalidSender = createBrowserObservabilityHttpSender({
    endpoint: 'https://user:password@collector.example.test/observability?token=secret',
    fetchImpl: async () => {
      rejectedCalls += 1;
      return { ok: true };
    }
  });
  const anotherQueue = createObservabilityQueue();
  anotherQueue.capture({
    faultCode: 'NETWORK_FAILURE',
    context: { releaseId: 'r1', media: 'browser', surface: 'battle', matchId: 'm1', ...lineage }
  }, 11);
  assert.deepEqual(await anotherQueue.flush(invalidSender), { ok: false, sent: 0, remaining: 1, reason: 'SEND_REJECTED' });
  assert.equal(rejectedCalls, 0);
});

test('HTTP sender converts fetch failure to false so queue data is retained', async () => {
  const queue = createObservabilityQueue();
  queue.capture({
    faultCode: 'NETWORK_FAILURE',
    context: { releaseId: 'r1', media: 'browser', surface: 'battle', matchId: 'm1', ...lineage }
  }, 12);
  const sender = createBrowserObservabilityHttpSender({
    endpoint: 'https://collector.example.test/observability',
    fetchImpl: async () => { throw new Error('offline'); }
  });
  assert.deepEqual(await queue.flush(sender), { ok: false, sent: 0, remaining: 1, reason: 'SEND_REJECTED' });
  assert.equal(queue.snapshot().length, 1);
});
