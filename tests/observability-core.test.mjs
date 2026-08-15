import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createObservabilityEnvelope,
  createObservabilityQueue,
  OBSERVABILITY_CORE
} from '../browser/observability-core.mjs';

const context = { releaseId: 'r1', media: 'browser', surface: 'battle', matchId: 'm1' };

test('exports stable media-neutral contract', () => {
  assert.equal(OBSERVABILITY_CORE.schema, 'GAMEROAD_OBSERVABILITY_ENVELOPE_V1');
  assert.deepEqual(OBSERVABILITY_CORE.media, ['browser', 'roblox', 'unity']);
  assert.equal(OBSERVABILITY_CORE.diagnosticPolicy, 'NO_RAW_MESSAGE_OR_STACK');
});

test('allowlists only correlation context and drops arbitrary private payload', () => {
  const envelope = createObservabilityEnvelope({
    error: new Error('boom'),
    faultCode: 'BATTLE_RENDER_FAILED',
    context: { ...context, privateCard: 'SECRET_CARD', chat: 'free text', email: 'person@example.com' }
  }, 10);
  assert.deepEqual(Object.keys(envelope.context), ['releaseId', 'media', 'surface', 'matchId']);
  const text = JSON.stringify(envelope);
  assert.equal(text.includes('SECRET_CARD'), false);
  assert.equal(text.includes('free text'), false);
  assert.equal(text.includes('person@example.com'), false);
});

test('never stores raw error message or stack even when they contain credentials or PII', () => {
  const error = new Error('Bearer abc.DEF token=secret person@example.com +81 90-1234-5678 Tokyo address');
  error.stack = 'api_key=hidden https://example.test/x?token=raw';
  const text = JSON.stringify(createObservabilityEnvelope({ error, faultCode: 'NETWORK_FAILURE', context }, 11));
  for (const secret of ['abc.DEF', 'secret', 'person@example.com', '90-1234-5678', 'Tokyo address', 'hidden', 'token=raw']) {
    assert.equal(text.includes(secret), false, secret);
  }
  assert.equal(text.includes('NETWORK_FAILURE'), true);
});

test('normalizes invalid context values and performance numbers without raw samples', () => {
  const envelope = createObservabilityEnvelope({
    kind: 'performance',
    error: { name: 'FrameBudget' },
    faultCode: 'FRAME_BUDGET_EXCEEDED',
    context: { ...context, media: 'unknown-client', surface: 'battle?token=secret' },
    metric: { name: 'frameMs', observed: '33.4', threshold: '16.7', rawSamples: [1, 2, 3] }
  }, 12);
  assert.equal(envelope.context.media, 'unknown');
  assert.equal(envelope.context.surface, 'unknown');
  assert.deepEqual(envelope.metric, { name: 'frameMs', observed: 33.4, threshold: 16.7 });
  assert.equal(JSON.stringify(envelope).includes('rawSamples'), false);
});

test('dedupes equal safe fingerprints and records occurrence count', () => {
  const queue = createObservabilityQueue({ maxQueue: 4 });
  const input = { error: new Error('ignored one'), faultCode: 'BATTLE_RENDER_FAILED', context };
  assert.equal(queue.capture(input, 20).duplicate, false);
  assert.equal(queue.capture({ ...input, error: new Error('different private detail') }, 21).duplicate, true);
  const [entry] = queue.snapshot();
  assert.equal(entry.count, 2);
  assert.equal(entry.firstSeenAtMs, 20);
  assert.equal(entry.lastSeenAtMs, 21);
});

test('bounds offline queue and evicts oldest unique incident', () => {
  const queue = createObservabilityQueue({ maxQueue: 2 });
  queue.capture({ faultCode: 'ONE', context }, 1);
  queue.capture({ faultCode: 'TWO', context }, 2);
  queue.capture({ faultCode: 'THREE', context }, 3);
  const codes = queue.snapshot().map((entry) => entry.envelope.diagnostic.faultCode);
  assert.deepEqual(codes, ['TWO', 'THREE']);
});

test('send failure never throws and retains queue', async () => {
  const queue = createObservabilityQueue();
  queue.capture({ faultCode: 'NETWORK_FAILURE', context }, 30);
  const result = await queue.flush(async () => { throw new Error('offline'); });
  assert.deepEqual(result, { ok: false, sent: 0, remaining: 1, reason: 'SEND_FAILED' });
  assert.equal(queue.snapshot().length, 1);
});

test('successful flush removes only the captured batch', async () => {
  const queue = createObservabilityQueue();
  queue.capture({ faultCode: 'FIRST', context }, 40);
  const result = await queue.flush(async (batch) => {
    assert.equal(batch.length, 1);
    queue.capture({ faultCode: 'ARRIVED_DURING_SEND', context }, 41);
    return true;
  });
  assert.deepEqual(result, { ok: true, sent: 1, remaining: 1, reason: 'OK' });
  assert.equal(queue.snapshot()[0].envelope.diagnostic.faultCode, 'ARRIVED_DURING_SEND');
});

test('hostile message and stack accessors are never read by the reporter', () => {
  const hostile = { name: 'TypeError' };
  let touched = 0;
  Object.defineProperty(hostile, 'message', { get() { touched += 1; throw new Error('getter explosion'); } });
  Object.defineProperty(hostile, 'stack', { get() { touched += 1; throw new Error('getter explosion'); } });
  const envelope = createObservabilityEnvelope({ error: hostile, faultCode: 'UNTRUSTED_EXCEPTION', context }, 50);
  assert.equal(touched, 0);
  assert.deepEqual(envelope.diagnostic, { errorName: 'TypeError', faultCode: 'UNTRUSTED_EXCEPTION' });
});
