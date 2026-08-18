import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createObservabilityEnvelope,
  createObservabilityIncidentCollector,
  createObservabilityQueue,
  OBSERVABILITY_CORE
} from '../browser/observability-core.mjs';
import {
  createObservabilitySearchProjection,
  OBSERVABILITY_SEARCH_PROJECTION
} from '../browser/observability-index-core.mjs';

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

test('queue snapshot round-trips when an older duplicate arrives after a newer one', () => {
  const queue = createObservabilityQueue({ maxQueue: 4 });
  const input = { error: new Error('private-newer'), faultCode: 'BATTLE_RENDER_FAILED', context };
  assert.equal(queue.capture(input, 400).duplicate, false);
  assert.equal(queue.capture({ ...input, error: new Error('private-older') }, 300).duplicate, true);

  const snapshot = queue.snapshot();
  const [entry] = snapshot;
  assert.equal(entry.count, 2);
  assert.equal(entry.envelope.occurredAtMs, 300);
  assert.equal(entry.firstSeenAtMs, 300);
  assert.equal(entry.lastSeenAtMs, 400);

  const collector = createObservabilityIncidentCollector();
  assert.deepEqual(collector.ingest(snapshot), { ok: true, accepted: 2, incidents: 1, reason: 'OK' });
  assert.deepEqual(collector.snapshot(), snapshot);
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

function queueBatch({ faultCode = 'BATTLE_RENDER_FAILED', now = 100, count = 1 } = {}) {
  const queue = createObservabilityQueue();
  for (let index = 0; index < count; index += 1) {
    queue.capture({ error: new Error(`private-${index}`), faultCode, context }, now + index);
  }
  return queue.snapshot();
}

test('collector accepts the exact R7 queue snapshot and stores only the safe envelope', () => {
  const collector = createObservabilityIncidentCollector();
  const batch = queueBatch({ count: 2 });
  assert.deepEqual(collector.ingest(batch), { ok: true, accepted: 2, incidents: 1, reason: 'OK' });
  assert.deepEqual(collector.snapshot(), batch);
});

test('collector makes identical retransmission and cumulative retry idempotent for one capture window', () => {
  const collector = createObservabilityIncidentCollector();
  const queue = createObservabilityQueue();
  queue.capture({ faultCode: 'NETWORK_FAILURE', context }, 200);
  const first = queue.snapshot();
  assert.equal(collector.ingest(first).accepted, 1);
  assert.equal(collector.ingest(first).accepted, 0);
  queue.capture({ faultCode: 'NETWORK_FAILURE', context }, 201);
  assert.equal(collector.ingest(queue.snapshot()).accepted, 1);
  const [incident] = collector.snapshot();
  assert.equal(incident.count, 2);
  assert.equal(incident.firstSeenAtMs, 200);
  assert.equal(incident.lastSeenAtMs, 201);
});

test('collector rejects an entire batch with malformed or extra raw payload without state mutation', () => {
  const collector = createObservabilityIncidentCollector();
  const [entry] = queueBatch();
  const poisoned = { ...entry, message: 'Bearer SUPER_SECRET person@example.com' };
  assert.deepEqual(collector.ingest([entry, poisoned]), { ok: false, accepted: 0, incidents: 0, reason: 'INVALID_ENTRY' });
  assert.equal(JSON.stringify(collector.snapshot()).includes('SUPER_SECRET'), false);
  assert.equal(JSON.stringify(collector.snapshot()).includes('person@example.com'), false);
});

test('collector rejects fingerprint tampering rather than trusting client identity', () => {
  const collector = createObservabilityIncidentCollector();
  const [entry] = queueBatch();
  const tampered = { ...entry, envelope: { ...entry.envelope, fingerprint: '00000000' } };
  assert.equal(collector.ingest([tampered]).reason, 'INVALID_ENTRY');
  assert.deepEqual(collector.snapshot(), []);
});

test('collector bounds unique incidents and evicts the least-recent incident', () => {
  const collector = createObservabilityIncidentCollector({ maxIncidents: 2 });
  collector.ingest(queueBatch({ faultCode: 'ONE', now: 1 }));
  collector.ingest(queueBatch({ faultCode: 'TWO', now: 2 }));
  collector.ingest(queueBatch({ faultCode: 'THREE', now: 3 }));
  assert.deepEqual(collector.snapshot().map((entry) => entry.envelope.diagnostic.faultCode), ['TWO', 'THREE']);
});

test('collector rejects hostile accessors without throwing or reading arbitrary data', () => {
  const collector = createObservabilityIncidentCollector();
  let touched = 0;
  const hostile = new Proxy({}, {
    ownKeys() { touched += 1; throw new Error('hostile ownKeys'); }
  });
  const result = collector.ingest([hostile]);
  assert.deepEqual(result, { ok: false, accepted: 0, incidents: 0, reason: 'INVALID_ENTRY' });
  assert.equal(touched, 1);
  assert.deepEqual(collector.snapshot(), []);
});

test('collector accepts a later independent window for the same fingerprint without creating a second incident', () => {
  const collector = createObservabilityIncidentCollector();
  collector.ingest(queueBatch({ now: 300, count: 2 }));
  collector.ingest(queueBatch({ now: 400, count: 3 }));
  const [incident] = collector.snapshot();
  assert.equal(collector.snapshot().length, 1);
  assert.equal(incident.count, 5);
  assert.equal(incident.firstSeenAtMs, 300);
  assert.equal(incident.lastSeenAtMs, 402);
});

test('collector snapshot round-trips when an older same-fingerprint window arrives after a newer one', () => {
  const collector = createObservabilityIncidentCollector();
  assert.equal(collector.ingest(queueBatch({ now: 400, count: 2 })).accepted, 2);
  assert.equal(collector.ingest(queueBatch({ now: 300, count: 3 })).accepted, 3);

  const snapshot = collector.snapshot();
  const [incident] = snapshot;
  assert.equal(incident.count, 5);
  assert.equal(incident.envelope.occurredAtMs, 300);
  assert.equal(incident.firstSeenAtMs, 300);
  assert.equal(incident.lastSeenAtMs, 401);

  const restored = createObservabilityIncidentCollector();
  assert.deepEqual(restored.ingest(snapshot), { ok: true, accepted: 5, incidents: 1, reason: 'OK' });
  assert.deepEqual(restored.snapshot(), snapshot);
});

function queueBatchForContext({
  releaseId,
  matchId,
  surface = 'battle',
  media = 'browser',
  faultCode = 'BATTLE_RENDER_FAILED',
  now = 100,
  count = 1
}) {
  const queue = createObservabilityQueue();
  const scopedContext = { releaseId, media, surface, matchId };
  for (let index = 0; index < count; index += 1) {
    queue.capture({
      error: new Error(`private-secret-${index}`),
      faultCode,
      context: { ...scopedContext, userId: 'RAW_USER_123', chat: 'private free text' }
    }, now + index);
  }
  return queue.snapshot();
}

test('search projection declares source authority without inventing identity, retention, or transport authority', () => {
  assert.equal(OBSERVABILITY_SEARCH_PROJECTION.schema, 'GAMEROAD_OBSERVABILITY_SEARCH_PROJECTION_V1');
  assert.equal(OBSERVABILITY_SEARCH_PROJECTION.sourceSchema, OBSERVABILITY_CORE.schema);
  assert.deepEqual(OBSERVABILITY_SEARCH_PROJECTION.queryKeys, [
    'releaseId', 'media', 'surface', 'matchId', 'eventType', 'reasonCode', 'fingerprint'
  ]);
  assert.equal(OBSERVABILITY_SEARCH_PROJECTION.identityAuthority, 'NONE_IN_THIS_PROJECTION');
  assert.equal(OBSERVABILITY_SEARCH_PROJECTION.retentionAuthority, 'NOT_DEFINED_IN_THIS_PROJECTION');
  assert.equal(OBSERVABILITY_SEARCH_PROJECTION.transportAuthority, 'NOT_DEFINED_IN_THIS_PROJECTION');
});

test('search projection preserves only versioned correlation and reason fields from validated incidents', () => {
  const projection = createObservabilitySearchProjection();
  const batch = queueBatchForContext({ releaseId: 'release-7', matchId: 'match-9', now: 700, count: 2 });
  assert.deepEqual(projection.ingest(batch), { ok: true, accepted: 2, records: 1, reason: 'OK' });

  const [record] = projection.snapshot();
  assert.deepEqual(Object.keys(record), [
    'schema', 'sourceSchema', 'releaseId', 'media', 'surface', 'matchId', 'eventType',
    'reasonCode', 'fingerprint', 'count', 'firstSeenAtMs', 'lastSeenAtMs'
  ]);
  assert.equal(record.sourceSchema, OBSERVABILITY_CORE.schema);
  assert.equal(record.releaseId, 'release-7');
  assert.equal(record.media, 'browser');
  assert.equal(record.surface, 'battle');
  assert.equal(record.matchId, 'match-9');
  assert.equal(record.eventType, 'exception');
  assert.equal(record.reasonCode, 'BATTLE_RENDER_FAILED');
  assert.equal(record.count, 2);
  assert.equal(record.firstSeenAtMs, 700);
  assert.equal(record.lastSeenAtMs, 701);

  const serialized = JSON.stringify(record);
  for (const forbidden of ['RAW_USER_123', 'private free text', 'private-secret', 'userId', 'chat', 'message', 'stack']) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
});

test('search projection does not merge different releases or matches into one population', () => {
  const projection = createObservabilitySearchProjection();
  const later = queueBatchForContext({ releaseId: 'release-b', matchId: 'match-2', now: 200 });
  const earlier = queueBatchForContext({ releaseId: 'release-a', matchId: 'match-1', now: 100 });
  assert.equal(projection.ingest(later).ok, true);
  assert.equal(projection.ingest(earlier).ok, true);

  assert.deepEqual(
    projection.snapshot().map((record) => [record.releaseId, record.matchId]),
    [['release-a', 'match-1'], ['release-b', 'match-2']]
  );
  assert.deepEqual(
    projection.query({ releaseId: 'release-a' }).records.map((record) => record.matchId),
    ['match-1']
  );
  assert.deepEqual(
    projection.query({ matchId: 'match-2' }).records.map((record) => record.releaseId),
    ['release-b']
  );
});

test('search projection keeps collector retransmission idempotency', () => {
  const projection = createObservabilitySearchProjection();
  const batch = queueBatchForContext({ releaseId: 'release-idem', matchId: 'match-idem', now: 300, count: 2 });
  assert.equal(projection.ingest(batch).accepted, 2);
  assert.equal(projection.ingest(batch).accepted, 0);
  const [record] = projection.snapshot();
  assert.equal(record.count, 2);
  assert.equal(record.firstSeenAtMs, 300);
  assert.equal(record.lastSeenAtMs, 301);
});

test('search projection rejects malformed evidence and unauthorized query fields fail-closed', () => {
  const projection = createObservabilitySearchProjection();
  const [entry] = queueBatchForContext({ releaseId: 'release-safe', matchId: 'match-safe' });
  const poisoned = { ...entry, userId: 'RAW_USER_123', message: 'Bearer secret' };
  assert.deepEqual(
    projection.ingest([poisoned]),
    { ok: false, accepted: 0, records: 0, reason: 'INVALID_ENTRY' }
  );
  assert.deepEqual(projection.snapshot(), []);
  assert.deepEqual(
    projection.query({ userId: 'RAW_USER_123' }),
    { ok: false, records: [], reason: 'INVALID_QUERY' }
  );
});
